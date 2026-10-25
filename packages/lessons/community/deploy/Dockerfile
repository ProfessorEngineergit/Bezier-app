# The community store (lessons, plugins, docs, leaderboard behind one address), as an image.
# Build from the repository root after `pnpm community:build`, which bundles the server into
# dist-server/ with everything it needs (fflate included; SQLite is Node's own):
#
#   pnpm community:build
#   docker build -f packages/lessons/community/deploy/Dockerfile -t bezier-store dist-server
#
# The build context is dist-server/ alone, so nothing else of the repository goes into the image.
FROM node:22-alpine
WORKDIR /app
COPY . ./dist-server
# Never root: the process only needs its three data directories.
RUN mkdir -p /data/lessons /data/plugins /data/docs && chown -R node:node /data
USER node
ENV LESSONS_DATA=/data/lessons PLUGINS_DATA=/data/plugins DOCS_DATA=/data/docs \
    STORE_HOST=0.0.0.0 STORE_PORT=8790 NODE_NO_WARNINGS=1
EXPOSE 8790
VOLUME ["/data"]
HEALTHCHECK --interval=1m CMD wget -qO- http://127.0.0.1:8790/lessons/v1/health || exit 1
CMD ["node", "dist-server/store.js"]
