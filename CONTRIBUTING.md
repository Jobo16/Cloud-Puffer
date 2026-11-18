# Contributing / 参与开发

Cloud Puffer is an early open-source preview. Small, focused changes are easiest to review. Please read the [current status](README.en.md#current-status) and [architecture](docs/architecture.md) before proposing a feature. 中文说明见[项目首页](README.md)与[文档索引](docs/README.md)。

## Workflow / 提交流程

1. Open an issue for changes that alter product scope or public behavior. For a small bug fix, a focused PR is enough.
2. Create a branch from `main`. Keep one concern per PR and describe the behavior, affected paths, and verification.
3. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. Local setup is in the [development guide](docs/development.md).
4. Update both README languages when capabilities or status change. Update the relevant docs and tests for behavior changes.
5. Wait for CI to pass. Merging to `main` automatically updates staging; production is released manually.

Use existing server-side business modules for identity, ownership, idempotency, and writes. Never trust a browser-provided account ID. Generate a new Drizzle migration for schema changes; do not edit applied migrations. Keep secrets, personal data, logs, and generated files out of commits. Avoid adding compatibility layers or new services without a current use case.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
