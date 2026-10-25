/**
 * The files to run a Bezier server, as one download from Settings → Collaboration; each user or
 * team hosts their own. Docker builds the server from its GitHub source, so nothing needs
 * cloning. The enrollment code is generated here so no two servers share one.
 */

import { zip } from '../formats/zip.js';

/** Location of the server source, in one place because it may move to its own repository. */
export const SERVER_SOURCE = 'https://github.com/ProfessorEngineergit/bezier';
export const SERVER_GUIDE = `${SERVER_SOURCE}/tree/main/sync`;
const BUILD_CONTEXT = `${SERVER_SOURCE}.git#main:apps/sync-server`;

/** A random code of `length` letters and digits, excluding easily misread ones. */
export function randomCode(length = 24): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export function serverFiles(domain: string, enrollment = randomCode()) {
  const compose = `# A Bezier server, with HTTPS in front. Start it with:
#   docker compose up -d
services:
  sync:
    build:
      context: ${BUILD_CONTEXT}
      dockerfile: deploy/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      BEZIER_SYNC_TRUST_PROXY: "1"
      BEZIER_SYNC_REPLICAS: /replica
    volumes:
      - ./data:/data
      # A second disk or a NAS for a second copy of everything. Point it elsewhere.
      - ./replica:/replica

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    env_file: .env
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data

  # Checks every copy of every file and repairs from a good one:
  #   docker compose run --rm scrub
  scrub:
    build:
      context: ${BUILD_CONTEXT}
      dockerfile: deploy/Dockerfile
    profiles: ["maintenance"]
    env_file: .env
    environment:
      BEZIER_SYNC_REPLICAS: /replica
    volumes: ["./data:/data", "./replica:/replica"]
    command: ["node", "server/main.ts", "scrub"]

volumes:
  caddy-data:
`;
  const caddy = `{$BEZIER_DOMAIN} {
\trequest_body {
\t\tmax_size 20MB
\t}
\tencode gzip
\treverse_proxy sync:8787
}
`;
  const env = `# The name your server is reached by. Caddy gets its certificate for it.
BEZIER_DOMAIN=${domain}

# Lets someone create an account without an invite. Made fresh for this server; keep it to
# the people you want in, or empty it once everyone has joined.
BEZIER_SYNC_ENROLLMENT=${enrollment}

# Space one vault may use, in megabytes. Empty means no limit.
BEZIER_SYNC_QUOTA_MB=

# For a second server that keeps a copy of this one (see the guide). 32+ characters.
BEZIER_SYNC_MIRROR_TOKEN=
`;
  const readme = `Bezier server

1. Point the name ${domain} at this machine (a DNS record, or Tailscale).
2. In this folder: docker compose up -d
3. In Bezier: Settings → Collaboration → Connect, with https://${domain}
   and the enrollment code from .env.

Everything the server stores is encrypted on your devices first; it cannot read your
projects. Back up the data folder anywhere, it is safe to.

The full guide: ${SERVER_GUIDE}
`;
  const encode = (text: string) => new TextEncoder().encode(text);
  return {
    enrollment,
    files: [
      { name: 'bezier-server/compose.yaml', data: encode(compose) },
      { name: 'bezier-server/Caddyfile', data: encode(caddy) },
      { name: 'bezier-server/.env', data: encode(env) },
      { name: 'bezier-server/README.txt', data: encode(readme) },
    ],
  };
}

export function serverZip(domain: string): { enrollment: string; zip: Uint8Array } {
  const { enrollment, files } = serverFiles(domain);
  return { enrollment, zip: zip(files) };
}
