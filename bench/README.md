# @bezier/bench

The performance corpus and the harness that runs it.

`docs/performance.md` states budgets. This package is what turns them from
assertions into numbers, and what makes a regression a failed CI run instead of a
bug report six months later.

```bash
pnpm bench
```

## What it measures

| | Budget | Why it matters |
| --- | --- | --- |
| Cold kernel load | 3 s | Nothing may wait on 4.7 MB of WebAssembly |
| Full rebuild | 100 ms typical | Opening a document replays its history |
| Incremental rebuild | — | The structural win: changing one feature of twenty must not cost twenty |
| Tessellation | — | Runs on every rebuild before anything is visible |

## How to read the output

**Distributions, not means.** p50 tells you how it usually feels; p99 tells you
why it feels bad. A path with a good mean and a terrible p99 janks, and janking is
what people actually notice.

## The corpus

Fixed documents of known complexity, committed so numbers are comparable across
machines and across months. Scaled by feature count rather than by hand so the
shape of the growth curve is visible, a rebuild that goes quadratic in history
length is a design failure, not a slow function.
