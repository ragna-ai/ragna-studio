# Per-service memory and CPU limits

Status: implemented (2026-09-23)

## Why

The production host is a single 4 vCPU / 7.75GB KVM VM with no swap
configured, running every service (`frontend`, `backend`, `worker`,
`webbrowser`, `postgres`, `redis`) plus Traefik, CrowdSec, and WireGuard
outside this compose file. Without per-container limits, a runaway
process (e.g. `worker` under heavy ffmpeg/image/video-gen jobs, or a
Chromium page spike in `webbrowser`) could exhaust host RAM and trigger
the kernel OOM-killer against an unrelated container instead of its own.

## Limits

Set via `mem_limit`/`cpus` in `docker-compose.yml` (legacy Compose v2
top-level fields, honored by plain `docker compose up`, unlike the
swarm-only `deploy.resources.limits` block).

| service    | mem_limit | cpus | reasoning                                        |
| ---------- | --------- | ---- | ------------------------------------------------- |
| frontend   | 512m      | 1.0  | static/SPA host, idle usage ~52MB                  |
| backend    | 1024m     | 1.5  | AI SDK streaming, idle usage ~195MB                |
| worker     | 2048m     | 2.0  | ffmpeg + image/video-gen jobs spike hardest        |
| webbrowser | 1536m     | 1.5  | headless Chromium spikes per open page             |
| postgres   | 1024m     | 1.5  | shared_buffers + query cache                       |
| redis      | 256m      | 0.5  | small BullMQ/cache dataset, idle usage ~10MB       |

Memory limits total 6.4GB, leaving ~1.35GB headroom for the OS, Traefik,
CrowdSec, and WireGuard. CPU limits total 8.0 against 4 physical cores;
that's intentional overcommit since `cpus` is a per-container throttle
(CFS quota), not a reservation, and services aren't expected to peak
simultaneously.

## Verified

After `docker compose up -d` on 2026-09-23, all six containers restarted
healthy and `docker inspect` confirmed the limits landed:

```
frontend:   mem=536870912   (512MB)  nanocpus=1000000000 (1.0)
backend:    mem=1073741824  (1GB)    nanocpus=1500000000 (1.5)
worker:     mem=2147483648  (2GB)    nanocpus=2000000000 (2.0)
webbrowser: mem=1610612736  (1.5GB)  nanocpus=1500000000 (1.5)
postgres:   mem=1073741824  (1GB)    nanocpus=1500000000 (1.5)
redis:      mem=268435456   (256MB)  nanocpus=500000000  (0.5)
```
