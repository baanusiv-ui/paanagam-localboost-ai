import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { findOwnedBusiness } from "../businesses/access.js";

const customerIdParams = z.object({ businessId: z.string().min(1), customerId: z.string().min(1) });
const businessParams = z.object({ businessId: z.string().min(1) });
const e164 = /^\+[1-9]\d{7,14}$/;
const emailSchema = z.string().trim().email().max(254);

function normaliseContact(input: { phone?: string | null; email?: string | null }) {
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  if (phone && !e164.test(phone)) throw new Error("Phone must be in E.164 format, for example +919876543210.");
  if (email && !emailSchema.safeParse(email).success) throw new Error("Enter a valid email address.");
  if (!phone && !email) throw new Error("A customer must have a phone number or email address.");
  return { phoneE164: phone, email };
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function registerCrmRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  requireUser: preHandlerHookHandler
) {
  app.get("/v1/businesses/:businessId/customers", { preHandler: requireUser }, async (request, reply) => {
    const params = businessParams.safeParse(request.params);
    const query = z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(["ACTIVE", "BLOCKED", "DELETED"]).default("ACTIVE"),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().min(1).optional()
    }).safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid customer query." });
    const business = await findOwnedBusiness(db, request.userId!, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const q = query.data.q;
    const customers = await db.customer.findMany({
      where: {
        businessId: business.id,
        status: query.data.status,
        ...(q ? { OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phoneE164: { contains: q } },
          { email: { contains: q, mode: "insensitive" } }
        ] } : {})
      },
      select: { id: true, name: true, phoneE164: true, email: true, status: true, source: true, firstSeenAt: true, lastSeenAt: true, createdAt: true, updatedAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.data.limit,
      ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {})
    });
    return { customers, nextCursor: customers.length === query.data.limit ? customers[customers.length - 1]?.id ?? null : null };
  });

  app.post("/v1/businesses/:businessId/customers", { preHandler: requireUser }, async (request, reply) => {
    const params = businessParams.safeParse(request.params);
    const body = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(20).optional(),
      email: emailSchema.optional(),
      source: z.string().trim().min(1).max(60).default("OWNER_ENTERED")
    }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Enter a valid name and phone or email." });
    const business = await findOwnedBusiness(db, request.userId!, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    let contact;
    try { contact = normaliseContact(body.data); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid contact details." }); }
    try {
      const customer = await db.customer.create({
        data: { businessId: business.id, name: body.data.name ?? null, ...contact, source: body.data.source },
        select: { id: true, name: true, phoneE164: true, email: true, status: true, source: true, firstSeenAt: true, createdAt: true }
      });
      await db.customerEvent.create({ data: { businessId: business.id, customerId: customer.id, eventType: "PROFILE_CREATED", source: "LOCALBOOST", metadata: { source: body.data.source } } });
      return reply.code(201).send({ customer });
    } catch (error) {
      if (isUniqueConflict(error)) return reply.code(409).send({ error: "A customer with this phone or email already exists in this business." });
      throw error;
    }
  });

  app.get("/v1/businesses/:businessId/customers/:customerId", { preHandler: requireUser }, async (request, reply) => {
    const params = customerIdParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid customer identifier." });
    const business = await findOwnedBusiness(db, request.userId!, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const customer = await db.customer.findFirst({
      where: { id: params.data.customerId, businessId: business.id },
      include: {
        consents: { orderBy: { capturedAt: "desc" } },
        events: { orderBy: { occurredAt: "desc" }, take: 50 }
      }
    });
    if (!customer) return reply.code(404).send({ error: "Customer not found." });
    return { customer };
  });

  app.patch("/v1/businesses/:businessId/customers/:customerId", { preHandler: requireUser }, async (request, reply) => {
    const params = customerIdParams.safeParse(request.params);
    const body = z.object({
      name: z.string().trim().min(1).max(120).nullable().optional(),
      phone: z.string().trim().max(20).nullable().optional(),
      email: emailSchema.nullable().optional()
    }).refine(value => Object.keys(value).length > 0, "At least one field is required.").safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid customer update." });
    const business = await findOwnedBusiness(db, request.userId!, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const existing = await db.customer.findFirst({ where: { id: params.data.customerId, businessId: business.id } });
    if (!existing) return reply.code(404).send({ error: "Customer not found." });
    const phone = body.data.phone === undefined ? existing.phoneE164 : body.data.phone;
    const email = body.data.email === undefined ? existing.email : body.data.email;
    let contact;
    try { contact = normaliseContact({ phone, email }); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid contact details." }); }
    try {
      const customer = await db.customer.update({
        where: { id: existing.id },
        data: { ...(body.data.name !== undefined ? { name: body.data.name } : {}), ...contact, lastSeenAt: new Date() },
        select: { id: true, name: true, phoneE164: true, email: true, status: true, updatedAt: true }
      });
      await db.customerEvent.create({ data: { businessId: business.id, customerId: customer.id, eventType: "PROFILE_UPDATED", source: "LOCALBOOST" } });
      return { customer };
    } catch (error) {
      if (isUniqueConflict(error)) return reply.code(409).send({ error: "Another customer in this business already uses that phone or email." });
      throw error;
    }
  });

  app.post("/v1/businesses/:businessId/customers/:customerId/consents", { preHandler: requireUser }, async (request, reply) => {
    const params = customerIdParams.safeParse(request.params);
    const body = z.object({
      channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]),
      purpose: z.enum(["SERVICE", "MARKETING"]),
      granted: z.boolean(),
      source: z.string().trim().min(1).max(80),
      evidence: z.string().trim().max(1000).optional()
    }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Provide a valid consent channel, purpose, decision and source." });
    const business = await findOwnedBusiness(db, request.userId!, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const customer = await db.customer.findFirst({ where: { id: params.data.customerId, businessId: business.id }, select: { id: true } });
    if (!customer) return reply.code(404).send({ error: "Customer not found." });
    const consent = await db.$transaction(async tx => {
      const row = await tx.customerConsent.create({ data: { customerId: customer.id, ...body.data } });
      await tx.customerEvent.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          eventType: body.data.granted ? "CONSENT_GRANTED" : "CONSENT_REVOKED",
          source: body.data.source,
          metadata: { channel: body.data.channel, purpose: body.data.purpose, consentId: row.id } as Prisma.InputJsonValue
        }
      });
      return row;
    });
    return reply.code(201).send({ consent });
  });

  app.post("/v1/businesses/:businessId/customer-events", { preHandler: requireUser }, async (request, reply) => {
    const params = businessParams.safeParse(request.params);
    const body = z.object({
      customerId: z.string().min(1).optional(),
      eventType: z.enum(["PURCHASE_RECORDED", "REVIEW_SUBMITTED", "REFERRAL_RECEIVED", "REFERRAL_CONVERTED", "REWARD_EARNED", "REWARD_REDEEMED"]),
      source: z.string().trim().min(1).max(80),
      externalId: z.string().trim().min(1).max(160).optional(),
      occurredAt: z.coerce.date().optional(),
      metadata: z.record(z.unknown()).optional()
    }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid customer event." });
    const business = await findOwnedBusiness(db, request.userId!, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    if (body.data.customerId) {
      const customer = await db.customer.findFirst({ where: { id: body.data.customerId, businessId: business.id }, select: { id: true } });
      if (!customer) return reply.code(404).send({ error: "Customer not found." });
    }
    try {
      const event = await db.customerEvent.create({
        data: {
          businessId: business.id,
          customerId: body.data.customerId ?? null,
          eventType: body.data.eventType,
          source: body.data.source,
          externalId: body.data.externalId ?? null,
          occurredAt: body.data.occurredAt,
          metadata: body.data.metadata as Prisma.InputJsonValue | undefined
        }
      });
      return reply.code(201).send({ event });
    } catch (error) {
      if (isUniqueConflict(error) && body.data.externalId) return reply.code(200).send({ duplicate: true });
      throw error;
    }
  });
}
