# ============================================================
# 培訓師瑞士刀 v4.0 — Multi-stage Dockerfile
# 注意：v4 起資料庫改為 Supabase PostgreSQL，build 階段不再需要 SQLite。
#       DATABASE_URL 在 build 時用一個 dummy postgres URL，避免 Prisma 報錯。
# ============================================================

# ---- 依賴安裝 ----
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ # better-sqlite3 在 alpine 需要編譯
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
RUN npx prisma generate

# ---- 建置 ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# build 階段不會真的連 DB，但 Prisma generate 需要 datasource URL 形式正確
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV DIRECT_URL="postgresql://user:pass@localhost:5432/db"
ENV NEXTAUTH_SECRET="build-placeholder"
RUN npm run build

# ---- 執行 ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
