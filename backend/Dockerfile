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
CMD ["sh", "-c", "if [ \"${SKIP_PRISMA_MIGRATIONS:-false}\" != \"true\" ]; then attempt=1; max_attempts=6; while :; do if output=$(npx prisma migrate deploy 2>&1); then printf \"%s\\n\" \"$output\"; break; else status=$?; printf \"%s\\n\" \"$output\"; case \"$output\" in *P1002*|*pg_advisory_lock*) if [ \"$attempt\" -ge \"$max_attempts\" ]; then echo \"Prisma migration lock remained unavailable after 6 attempts; refusing to start API.\" >&2; exit \"$status\"; fi; delay=$((attempt * 10)); echo \"Prisma migration lock busy; retrying in ${delay}s (attempt $attempt/$max_attempts).\"; sleep \"$delay\"; attempt=$((attempt + 1));; *) exit \"$status\";; esac; fi; done; fi && exec node dist/server.js"]
