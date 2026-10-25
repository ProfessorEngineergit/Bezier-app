# The same server on a machine of your own

`--http` serves MCP over Streamable HTTP at `/mcp`, so an assistant elsewhere (a hosted agent, a
team's automation) reaches the same tools. The Bezier window connects to it exactly as to a local
one, with its address in Settings → MCP & Automation; it must then be https.

```bash
BEZIER_MCP_TOKEN="$(openssl rand -hex 32)" \
BEZIER_MCP_HOST=127.0.0.1 BEZIER_MCP_PORT=7357 \
BEZIER_MCP_ORIGINS=https://bezier.example.org \
node apps/mcp-server/server/main.ts --http
```

| Variable | |
| --- | --- |
| `BEZIER_MCP_TOKEN` | Required with `--http`, 32+ characters. Clients send `Authorization: Bearer …` |
| `BEZIER_MCP_HOST` / `BEZIER_MCP_PORT` | Where it listens. Keep 127.0.0.1 and put a TLS proxy (Caddy) in front |
| `BEZIER_MCP_CODE` | A fixed pairing code for the window; a new one each start if unset |
| `BEZIER_MCP_ORIGINS` | Browser origins allowed to call it, besides the desktop app and localhost |

Caddy, as for the other servers ([`../SERVERS.md`](../servers.md)):

```
mcp.example.org {
  reverse_proxy 127.0.0.1:7357
}
```

What runs here today is what runs locally: docs, the connected window's state, settings,
performance. Planned for the server, in this order: reading projects from a synced vault without a
window (headless, with the real geometry kernel), long jobs (renders, exports, simulation) as MCP
tasks, and an MCP App, an interactive viewer of the model inside the assistant's chat.
