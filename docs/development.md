# 开发说明

Cloud Puffer 使用 Next.js 16、TypeScript、PostgreSQL 17、Drizzle、pg-boss 与一个共享 Worker。产品当前状态见[项目首页](../README.md)，模块边界见[架构](architecture.md)。

## 启动

需要 Node.js 24、pnpm 10.30.3、Docker Compose。

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm infra
pnpm db:migrate
pnpm dev
```

另开终端运行 `pnpm worker`。网页位于 <http://localhost:3030>，验证邮件在 <http://localhost:18025> 的 Mailpit，健康接口是 `/api/health`。本地 PostgreSQL 只监听 `127.0.0.1:55439`。`pnpm dev:setup` 仅在 `.env` 不存在时创建配置。停止本地基础设施可运行 `docker compose -f compose.dev.yml stop`；这会保留数据卷。

## 配置

`.env.example` 列出全部应用变量，私密值只放在未提交的 `.env`。`src/server/config.ts` 校验服务器配置。至少设置独立的 `BETTER_AUTH_SECRET` 和 `CHANNEL_ENCRYPTION_KEY`；数据库、Web 和 Worker 使用同一个 `DATABASE_URL`。本地默认以 Mailpit 发送邮件，模型和微信、QQ、Telegram 渠道均关闭。

要连接兼容 OpenAI chat-completions 的模型，设置 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME`。渠道开关分别为 `ILINK_ENABLED`、`QQ_ENABLED`、`TELEGRAM_ENABLED`；在启用渠道前配置对应凭据，并使用独立测试账号。环境变量改变后重启 Web 和 Worker。不要将密钥写入浏览器变量、日志或测试记录。

本地 Agent 连接程序位于 `scripts/local-agent.ts`。在用户电脑安装并登录 Codex 或 OpenClaw，创建设备令牌后设置 `PUFFER_DEVICE_TOKEN`、`PUFFER_URL`（线上须为 HTTPS）及可选 `PUFFER_AGENT_WORKDIR`，运行 `pnpm local-agent`。程序每轮要求本机确认，只返回最终文字；本地工具和账号凭据留在用户电脑。它不具备云端事项、记忆工具。

## 修改与检查

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` 创建并迁移独立的 `jojobot_test` 数据库，使用模型与渠道替身。可通过 `TEST_DATABASE_URL` 指定测试服务器，但库名必须是 `jojobot_test`；不得使用生产数据。PR 和 `main` 的 CI 执行相同检查。

Schema 在 `src/db/schema.ts`。修改后运行 `pnpm db:generate`，审阅生成的 SQL 和 `drizzle/meta`，再运行 `pnpm db:migrate`。已应用的迁移不可修改或删除，生产结构变化需兼容正在运行的服务。新增配置或工具时，同步更新 `.env.example`、双语 README、相关文档与必要的业务测试。

| 路径 | 职责 |
| --- | --- |
| `src/app`、`src/components` | 页面、HTTP 路由和交互 |
| `src/server` | 身份、业务规则、Agent 与渠道适配 |
| `src/worker.ts` | 队列执行、渠道轮询及投递 |
| `src/db`、`drizzle` | Schema、数据库连接和迁移 |
| `scripts` | 本地连接程序、测试库准备和迁移 |
| `deploy` | 服务器编排与发布脚本 |

## 验证边界

自动化检查覆盖账号隔离、事项/记忆写入、队列和渠道适配器，模型及渠道网络使用替身。首尔生产站点的 Web、Worker、数据库和 HTTPS 已通过迁移后的健康检查；staging 的真实模型接口调用返回成功。微信扫码和基础文字收发曾在迁移前验证，迁移后的手机收发、QQ/Telegram 实机、OpenClaw 端到端、欢迎图片送达和长期负载仍待实测。健康接口只验证 Web 与数据库。

发现开发页面反复编译时，先检查是否有工具把日志或临时文件写入仓库、是否在运行中修改依赖目录；停止 Web 后安装依赖，再重启项目服务。保持 `.local/`、`.research/` 和构建产物不入 Git。
