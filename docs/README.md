# Documentation

Everything written down about Bezier, sorted by who is reading.

## If you are looking at it, or using it

| | |
| --- | --- |
| [`assets/README.md`](assets/README.md) | The screenshots: every system, every state, how they are made |
| [`platforms.md`](platforms.md) | How well it runs on macOS, Linux and Windows, how each is tested, known limits |
| [`benchmarks.md`](benchmarks.md) | Every measured number, its method and raw data, and what was **not** measured |
| [`performance.md`](performance.md) | The speed budgets, and the reasoning behind them |
| [`roadmap.md`](roadmap.md) | What is built in what order, and why that order |

## If you want to extend it

| | |
| --- | --- |
| [`sdk/`](sdk/README.md) | Writing a plugin: the five-minute start, concepts, the API, recipes, publishing and versions |
| [`mcp/`](mcp/README.md) | Bezier and assistants: the MCP server, its tools, and running it on a machine of your own |

## If you want to understand it, or contribute

| | |
| --- | --- |
| [`how-it-works/`](how-it-works/README.md) | Seven pages, each one question: the path of a change, the geometry engine and its watchdog, stable references, storage, the viewport, the desktop apps, simulation and lessons |
| [`architecture.md`](architecture.md) | The shape in one page, what crosses each boundary, where the hard problem lives, and where things are |
| [`contributing/conventions.md`](contributing/conventions.md) | The rules, with the reason for each |
| [`contributing/testing.md`](contributing/testing.md) | What is tested how, and the one command |
| [`lesson-format.md`](lesson-format.md) | The lesson file format, a compatibility promise |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | How to work here, with a tour for people new to large codebases |
| [`adr/`](adr/README.md) | Why each major decision was made, numbered, never deleted |
| Package READMEs | [`core`](../packages/core/README.md) · [`kernel`](../packages/kernel/README.md) · [`solver`](../packages/solver/README.md) · [`renderer`](../packages/renderer/README.md) · [`ui`](../packages/ui/README.md) · [`storage`](../packages/storage/README.md) · [`sim`](../packages/sim/README.md) · [`lessons`](../packages/lessons/README.md) · [`plugin-sdk`](../packages/plugin-sdk/README.md) · [`mcp`](../apps/mcp-server/README.md) · [`apps/studio`](../apps/studio/README.md) · [`apps/desktop`](../apps/desktop/README.md) |

## CI and security

| | |
| --- | --- |
| [`contributing/ci.md`](contributing/ci.md) | What runs on a change, on which system, what it can and cannot say; Crosscheck |
| [`contributing/windows-signing.md`](contributing/windows-signing.md) | Why browsers warn about the Windows installer, and how the release workflow signs it |
| [`contributing/signpath-application.md`](contributing/signpath-application.md) | What the free signing programme asks for, what the repository shows, what is still open |
| [`../SECURITY.md`](../SECURITY.md) | Vulnerability reporting |

## Decisions and the kernel

| | |
| --- | --- |
| [`adr/`](adr/README.md) | The decisions, each with what was considered and why |
| [`kernel.md`](kernel.md) | The geometry kernel's speed, what was measured and what could make it faster |
| [`tools/spikes/`](../tools/spikes) | The experiments that settled architecture questions; the result of each is in the ADR it belongs to |
