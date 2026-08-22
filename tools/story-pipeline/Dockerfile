FROM node:22-bookworm-slim AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tools/story-pipeline/package.json tools/story-pipeline/package.json
RUN pnpm install --frozen-lockfile --filter @inkquest/story-pipeline...

COPY tools/story-pipeline tools/story-pipeline
RUN pnpm --filter @inkquest/story-pipeline worker:build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/tools/story-pipeline/node_modules /app/tools/story-pipeline/node_modules
COPY --from=build /app/tools/story-pipeline/dist /app/tools/story-pipeline/dist
COPY --from=build /app/tools/story-pipeline/package.json /app/tools/story-pipeline/package.json
COPY --from=build /app/tools/story-pipeline/data /app/tools/story-pipeline/data

WORKDIR /app/tools/story-pipeline
EXPOSE 8080
CMD ["node", "dist/worker/server.js"]
