FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/Server/package.json apps/Server/package.json
COPY apps/App/package.json apps/App/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/trading/package.json packages/trading/package.json

RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ARG VITE_WS_BASE_URL=auto
ARG VITE_SUPABASE_URL=https://your-project-ref.supabase.co
ARG VITE_SUPABASE_ANON_KEY=replace-with-your-supabase-anon-key
ARG VITE_MAGIC_LINK_REDIRECT_PATH=/auth/callback

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_BASE_URL=${VITE_WS_BASE_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_MAGIC_LINK_REDIRECT_PATH=${VITE_MAGIC_LINK_REDIRECT_PATH}

RUN npx turbo build --filter=@tradepilot/app

FROM nginx:1.27-alpine AS runner

COPY apps/App/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/App/dist /usr/share/nginx/html

EXPOSE 80
