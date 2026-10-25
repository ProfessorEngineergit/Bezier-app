# Bezier's MCP server

Gives an assistant (Claude, or any MCP client) what it needs to work in Bezier well: the app's
own docs, the live state of a Bezier window (the model and its history, the selection, pictures
of the model, a map of every control on screen, performance) and the settings. It does not edit
the model: an assistant does that on screen, the way a person does, and checks the result here.

```bash
node apps/mcp-server/server/main.ts                 # for a client on this computer, over stdio
claude mcp add bezier -- node /path/to/bezier/apps/mcp-server/server/main.ts
```

Then in Bezier: Settings, MCP & Automation, switch on, enter the pairing code the server printed
(the assistant can tell you it: `app_connect`).

| | |
| --- | --- |
| [`server/protocol.ts`](server/protocol.ts) | MCP without a library; the stateless 2026-07-28 revision and the older ones |
| [`server/tools.ts`](server/tools.ts) | The tools, resources and prompt |
| [`server/app-link.ts`](server/app-link.ts) | The line to the Bezier window, behind the pairing code |
| [`server/docs.ts`](server/docs.ts) | The app's articles, searched and read with their pictures |
| [`server/http.ts`](server/http.ts) | `--http`: Streamable HTTP for a server of your own, behind a token |
| [`docs/agent-docs.json`](docs/agent-docs.json) | The articles, written by `apps/studio/src/help/agent-docs.test.ts` |
| [`docs/computer-use.md`](docs/computer-use.md) | How to operate Bezier by sight, for the assistant |

The window's side is `apps/studio/src/automation/`. The guide is [`docs/mcp/README.md`](../../docs/mcp/README.md).

Tested: `server/server.test.ts` (both protocol eras, docs, pairing refusals, a stand-in window)
and `e2e/connected/mcp.spec.ts` (the real editor connects through Settings and answers every tool).
