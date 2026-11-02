# JOJOBOT 工作约定

## 当前范围

- 当前是 Next.js + TypeScript 的开发预览，完整首版尚未完成；实际范围见 `docs/development.md`，不把建议或测试替身写成上线能力。
- 从 `docs/README.md` 进入文档。产品使用见 `docs/workspace.md`，产品范围见 PRD，模块与 iLink 规则见 `docs/architecture.md`，Docker 流程见 `docs/deployment.md`。
- 只完成本次用户要求及必要关联修改。仅要求调研或方案时，不扩展成应用实现、部署或第三方服务采购。
- 采用满足当前需求的最简正确设计，不预建无需求的兼容层、插件平台或微服务，不用前端假数据冒充完成的功能。

## 产品与界面

- 多用户共享云端服务；每用户的数据、对话和执行状态独立，不创建常驻用户服务器或容器。
- 用户已确认 Apple 风格的 Glassmorphism，允许透明度、模糊、柔和阴影和克制渐变；此前其他项目的扁平化限制不适用于本项目。
- 优先复用现成组件，维持统一设计令牌（深浅两套主题共用同一套变量，切换只改 `<html data-theme>`，组件里不写死颜色），保证长对话阅读、中文输入与手机操作。当前使用 Base UI Button/Dialog，玻璃材质参考 Glasscn；品牌首页与登录浮窗位于根路由，工作区在 `/app`。工作区按功能分四个一级入口（对话、事项、记忆、助手），同一时刻只显示一个页面；桌面侧栏常驻在左，手机把同一份菜单收进左上角抽屉，账号与用量收在个人菜单。对话使用真实账号资料，不默认隔离或复制数据。
- 界面不写解释性小字：页面标题下不加副标题，卡片标题下不加用途说明，常驻状态条只在用户必须做决定时出现。能被按钮、标签和数据本身说清的事，不再用一句话复述。
- 响应式只分两档：`≥1024px` 桌面用常驻侧栏，`≤1023px` 窄屏用抽屉菜单，平板与手机是同一套；不设中间档布局。

## Git 与配置

- 在当前主目录工作；未经用户要求不创建 worktree，不套用其他产品的 `test` 分支或部署流程。
- 修改前检查工作区，保护已有未提交内容。只暂存并原子提交本次任务的改动；推送和部署按会话中的授权执行，本地提交不自动授权生产发布。
- `.research/` 是本地参考资料，不进入公开仓库；`.DS_Store`、秘密配置、用户资料和运行日志不提交。
- 新工具链出现后更新 `.gitignore`，依赖锁文件、源码和应审阅的迁移产物不能被忽略。配置示例只包含变量名与无敏感性的示例值。
- 项目采用 MIT，复制上游组件时保留对应版权与许可证，不能因主项目是 MIT 而抹去第三方声明。

## 实现与验证

- 实现数据功能后，身份、资源归属、幂等和业务写入统一由服务端业务模块负责；API、工具和后台复用这些规则。
- 用户文件保存到私有对象存储，业务记录保存到数据库；不把应用本地目录或 JSON 文件作为生产业务存储。
- 数据库使用 PostgreSQL 17 + Drizzle，Schema 在 `src/db/schema.ts`；`pnpm db:generate` 生成迁移，`pnpm db:migrate` 应用。必须提交 `drizzle/` 的 SQL 及元数据，禁止改写已应用迁移。现有服务保持在线，变更采用兼容的扩展、切换与收缩步骤。
- 本地准备：`pnpm run dev:setup`、`pnpm infra`、`pnpm db:migrate`；分别运行 `pnpm dev`（localhost:3030）和 `pnpm worker`。修改依赖前先停止 Web，避免 pnpm 重排目录造成持续热更新。
- 应用检查：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。测试专用 `jojobot_test` 数据库，不使用真实账号资料。文档检查相对链接、事实一致性和 `git diff --check`，禁止编造验收记录。
- 后端改动按影响重启本项目本地服务、等待就绪并验证相关链路；不误停其他项目。线上变更仅在获得相应部署授权后进行。
- 交付清楚区分已实现、已验证、建议和待外部验证事项；README 中英文的范围、状态及文档入口同步更新。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
