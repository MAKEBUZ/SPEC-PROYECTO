FROM node:24.22.3-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
RUN npm ci --ignore-scripts
RUN ./node_modules/.bin/tsc --noEmit false --outDir dist --rootDir .
ENV NEXT_TELEMETRY_DISABLED=1
RUN ./node_modules/.bin/next build apps/web --webpack

FROM postgres:18.7-bookworm AS runtime
RUN groupadd --gid 1000 patronaje && useradd --uid 1000 --gid patronaje --create-home patronaje
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER patronaje
CMD ["node", "dist/apps/api/src/runtime/main.js"]
