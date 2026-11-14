# --- deps: install all dependencies (including dev, needed to build) ---
FROM node:22-alpine AS deps
WORKDIR /app
# openssl is required for Prisma to correctly detect this platform's libssl
# version; without it Prisma silently assumes the wrong engine and fails at
# runtime. Keep this before `npm install` so Prisma's own postinstall step
# detects it too.
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
RUN npm install

# --- builder: generate Prisma client and build the Next.js app ---
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Pre-warm Prisma's migration engine for this exact platform at build time
# (while the image still has normal network access) so `migrate deploy`
# never needs to reach the internet when the container starts for real.
RUN npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /dev/null
RUN npm run build

# --- runner: production image ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Full node_modules (needed to run the Prisma CLI and the seed script at startup).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Next.js standalone server output (overlays its own trimmed node_modules).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p ./public/uploads && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
