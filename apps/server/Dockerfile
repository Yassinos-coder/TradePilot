FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json turbo.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/App/package.json apps/App/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/trading/package.json packages/trading/package.json

RUN npm install

COPY . .

RUN npx turbo build --filter=@tradepilot/server

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./

EXPOSE 4000

CMD ["node", "apps/server/dist/apps/server/src/main.js"]
