# The sync server has no dependencies, so the image is Node and the source, nothing else.
# Build from the apps/sync-server/ folder:  docker build -f deploy/Dockerfile -t bezier-sync .
FROM node:22-alpine
WORKDIR /app
# The server. Bezier itself is the app; nothing else is served.
COPY protocol ./protocol
COPY server ./server
COPY package.json ./
# Never root: the process only needs its data directory.
RUN mkdir -p /data && chown node:node /data
USER node
ENV BEZIER_SYNC_DATA=/data BEZIER_SYNC_HOST=0.0.0.0 BEZIER_SYNC_PORT=8787 \
    NODE_NO_WARNINGS=1
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "server/main.ts", "serve"]
