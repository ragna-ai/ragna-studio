# Web Browser: Reap Orphaned Chromium Processes (PRD)

> **Status: implemented** (2026-10-19, PR #116). Released in v0.6.4 and verified in prod.

Follow-up to the idle shutdown in [prd.md](./prd.md) (`BROWSER_IDLE_CLOSE_AFTER`).

## Problem

In production, the `webbrowser` container collects zombie processes after the
browser goes idle. One idle cycle left five of them:

```
605104 Z chrome_crashpad
605106 Z chrome_crashpad
605126 Z chromium
605136 Z chromium
606766 Z chromium
```

Zombies hold no memory or CPU. Each one holds a PID slot, though. Every idle
close and relaunch adds a few more. Over weeks they can reach the container's
or pod's `pids` limit. At that point Chromium can't launch and every scrape
fails.

## Cause

`closeBrowser()` kills the main Chromium process. Bun spawned it, so Bun reaps
it. Chromium's helpers (`chrome_crashpad_handler`, child `chromium`
processes) are detached from it. When their parent exits, Linux re-parents
them to PID 1 of the namespace, or to the nearest subreaper.

The runner image starts `bun dist/index.mjs` as PID 1 with no init process.
Bun doesn't reap children it never spawned, so they stay zombies.

The idle shutdown only made this visible. Any Chromium exit leaves orphans,
including a crash or a relaunch after a failed launch. Before the idle
shutdown, Chromium lived for the container's whole lifetime, so it rarely
happened.

## Best practice

- Puppeteer's Docker guide: "Make sure to specify a init process via the
  `--init` flag or a custom `ENTRYPOINT`". Its troubleshooting page says to
  use `--init` "to reap zombie processes".
- tini is the init that Docker's `--init` bundles. On Debian, the `tini`
  package installs `/usr/bin/tini`. tini reaps zombies as PID 1. If it can't
  be PID 1, it has to be registered as a subreaper (`-s` or
  `TINI_SUBREAPER`).

Sources: [Puppeteer Docker guide](https://pptr.dev/guides/docker),
[Puppeteer troubleshooting](https://pptr.dev/troubleshooting),
[tini README](https://github.com/krallin/tini).

## Options

| Option                                     | Verdict                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Revert the idle shutdown                   | Rejected. Doesn't fix the cause (crashes still orphan helpers). Keeps a few hundred MB of Chromium alive around the clock. |
| `init: true` in `docker-compose.yml`       | Rejected. Compose-only, doesn't carry over to k3s.                                                                         |
| tini as `ENTRYPOINT` in the image (chosen) | Works in every runtime. One apt package and one line.                                                                      |

## Decision

In the runner stage of `apps/webbrowser/Dockerfile`:

- install `tini` alongside `chromium` and `wget`;
- add `ENTRYPOINT ["/usr/bin/tini", "-s", "--"]`, keeping `CMD` unchanged.

`-s` registers tini as a subreaper. Then it reaps orphans even when it isn't
PID 1. That happens in a pod with a shared process namespace, where `pause`
is PID 1. The `pause` processes in the prod `top` output suggest this setup.
As PID 1, `-s` is redundant and harmless.

tini forwards signals to Bun, so stopping the container behaves as before.

## Verification

1. Deploy the new image.
2. Run one scrape, then wait past `BROWSER_IDLE_CLOSE_AFTER` (5 min).
3. `top` or `ps -o pid,ppid,stat,comm -e` in the container shows no `Z`
   processes.

If zombies still appear, check their PPID. A PPID equal to Bun's PID means
Bun spawned them and isn't waiting on them. Then the fix belongs in how
Puppeteer's child process runs under Bun, not in the init process.

Result in prod with v0.6.4 (2026-10-19): `tini` runs as the parent of `bun`.
After the idle close, Chromium and both `chrome_crashpad` helpers exited and
`top` reported 0 zombies. Before, the same cycle left five.

## Out of scope

- Changing the idle close behavior or its default.
- Health checks for a full PID table (`GET /health` still only checks the
  HTTP server).
