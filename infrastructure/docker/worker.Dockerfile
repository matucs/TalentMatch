FROM node:22-bookworm-slim AS build
ENV CI=true
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build
# `pnpm prune` is not workspace-aware and removes the app-local links to
# @talentmatch/* packages. Reinstalling in production mode keeps those links
# while dropping development dependencies.
RUN pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace /workspace
USER node
CMD ["node", "apps/worker/dist/main.js"]
