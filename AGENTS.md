# Cloud Puffer 开发约定

- 范围以 [README](README.md)、[当前架构](docs/architecture.md) 与 [产品规划](docs/PRD.md) 为准。只把已实现并验证的能力写成当前功能，不把测试替身当作真实平台验收。
- 采用满足当前需求的最简正确设计。复用现有业务模块，不预建兼容层、插件平台或微服务。
- 账号归属、幂等和业务写入由服务端处理；API、Agent 工具与后台共用这些规则。用户文件未来须进入私有对象存储，业务记录在 PostgreSQL。
- Schema 在 `src/db/schema.ts`；使用 `pnpm db:generate` 生成迁移，提交 SQL 与元数据。已应用的迁移不可改写，生产结构变更须考虑在线兼容。
- 修改前检查工作区；只暂存本次文件并提交。不提交密钥、用户资料、日志、构建产物或 `.research/`。
- 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`；测试只能使用独立的 `jojobot_test` 库。文档更新时检查双语 README、相对链接与 `git diff --check`。
- PR 检查通过后才能合并；`main` 自动部署 staging，生产由 GitHub Actions 手动发布。部署只使用已提交、已检查的版本。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
