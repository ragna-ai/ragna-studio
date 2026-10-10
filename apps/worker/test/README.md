# Worker tests

`bun test` suite for `apps/worker`. It reuses the `apps/api` harness: real
Postgres (`studio_test`), truncate in `beforeEach`, serial runs, one suite lock.
Shared mechanics are in [apps/api/test/README.md](../../api/test/README.md).

## Run

```bash
pnpm --filter @repo/worker test:setup   # one time
pnpm --filter @repo/worker test [path]
```

Rebuild a package after editing it: `pnpm --filter @repo/<pkg> build`.

## Layout

- `preload.ts`: re-registers the module mocks, takes the suite lock.
- `support/job.ts`: `buildJob({ name, data, attempts?, attemptsMade? })`.
- `<domain>/*.test.ts`: one folder per feature area.

Tests call the exported `process<Name>Job(job)` handlers directly. The queue is
mocked, so no Redis is needed.

## Mocks

| Module                                                       | Fake                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `@repo/queue`                                                | `queueAddMock`, `createWorkerMock` / `recordedWorkers`, `recordedCronJobs` |
| `@repo/storage`                                              | upload, download, delete                                                   |
| `@ai-sdk/{anthropic,openai,black-forest-labs,google-vertex}` | `create*` returns V4 mock language, image, video and embedding models      |
| `@repo/mail/provider`                                        | mail provider mock and mail fixtures                                       |
| `@repo/mail`                                                 | `sendEmail` (`sendEmailMock`)                                              |

The AI SDK stays real. Script text with `scriptModelOutput({ text, toolCalls?, inputTokens?, outputTokens? })`.
Override `languageModelGenerateMock`, `imageModelGenerateMock`, `videoModelGenerateMock` or
`embeddingModelEmbedMock` with `mockImplementationOnce` for failure paths. `lastCreatedModel(kind)`
returns the model a service asked for.
Call `resetProviderMocks()` in `beforeEach`.
