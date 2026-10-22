# --- dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- development server (docker-compose.dev.yml) ---
FROM deps AS dev
ENV NODE_ENV=development PORT=3000
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- production build ---
FROM deps AS build
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Same-origin through nginx: no absolute API/WS URL is baked into the bundle
ENV NEXT_PUBLIC_API_URL= NEXT_PUBLIC_WS_URL=
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
CMD ["npx", "next", "start"]
