FROM node:22-alpine AS frontend

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml vite.config.js ./
# O container web só precisa compilar o Svelte. Evitamos o postinstall do
# Electron, que baixa um runtime Windows inteiro e desperdiça espaço no VPS.
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts
COPY frontend ./frontend
RUN pnpm run build:frontend

FROM node:22-alpine

WORKDIR /app
COPY package.json ./
# O container web não carrega os módulos nativos usados apenas pelo Electron.
# Ignorar scripts evita que o node-gyp tente compilar application-loopback
# (e exigir Python/make/g++) durante a imagem de produção.
RUN npm install --omit=dev --legacy-peer-deps --ignore-scripts --no-audit --no-fund
COPY server.mjs ./
COPY mailer.mjs ./
COPY public ./public
COPY --from=frontend /app/public/svelte ./public/svelte

ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
