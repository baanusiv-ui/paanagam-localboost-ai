FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
EXPOSE 4100
CMD ["sh", "-c", "if [ \"${SKIP_PRISMA_MIGRATIONS:-false}\" != \"true\" ]; then attempt=1; until npx prisma migrate deploy; do if [ \"$attempt\" -ge 6 ]; then echo \"Prisma migrations failed after 6 attempts\"; exit 1; fi; echo \"Prisma migration lock unavailable; retrying in 10 seconds (attempt $((attempt + 1))/6)\"; attempt=$((attempt + 1)); sleep 10; done; fi && exec node dist/server.js"]