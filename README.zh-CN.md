# JOJOBOT

**网页和微信里的个人 AI 助手。**

[English](README.md) | 简体中文

一个面向日常生活的开源个人助手。多用户共享云端服务，每个人拥有独立数据和一条跨渠道主对话，无需为每个用户准备一台服务器。

## 当前状态

**开发预览版，尚未完成首版全部需求。** 仓库已有可运行应用；模型、对象存储和正式发信供应商尚未选定，尚未发布公开托管服务。

本次已实现：

- 展示开源项目的公开首页，登录、注册和找回密码使用浮窗。
- 邮箱密码开放注册、邮箱验证、修改密码和登录会话撤销。
- 参考 Apple 的玻璃风格工作区，支持桌面与手机布局。
- 持久化的待办和明确保存的个人记忆，网页与 Agent 工具复用业务规则。
- 每账号一条主对话、后台执行、逐步显示回复、停止执行、操作记录、历史翻页和每日消息额度。
- iLink 文本适配：扫码绑定、凭据加密、共享轮询、持久化去重与投递状态。**JOJOBOT 的真实微信账号与手机验收仍待完成。**
- QQ 官方机器人私聊适配：一次性账号绑定、共用主对话与队列、限制条数的文字和图片回复。QQ 凭据、权限与真实设备收发仍待验证。
- 自然语气约定与四张原创内置表情，用于网页和 QQ，可按账号关闭，避免相邻轮次重复同一张。尚不支持理解用户发来的图片或自动学习说话风格。

后续开发：定时提醒、起止时间日程、搜索、笔记、私有文件、资料检索与文档生成、运营管理及全平台成本上限。现在的待办截止时间**不会触发提醒**。

## 本地运行

需要 Node.js 24、pnpm 10.30.3 和 Docker Compose。

```sh
pnpm install --frozen-lockfile
pnpm run dev:setup
pnpm infra
pnpm db:migrate
pnpm dev
```

另开一个终端运行：

```sh
pnpm worker
```

打开 [localhost:3030](http://localhost:3030)。注册无需邀请码，验证与重设密码邮件在本地 [Mailpit 收件箱](http://localhost:18025) 查看，不会发送到互联网。`dev:setup` 仅在 `.env` 不存在时生成私密配置，不覆盖现有文件。

默认**未连接模型**。待办和记忆可以直接使用；聊天会如实提示服务尚未配置。在 `.env` 填入 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME`，使用支持流式回复及工具调用的 OpenAI 兼容 chat-completions 服务，再重启 Web 和 Worker。选定供应商后仍需完成兼容性验证。

微信默认关闭。设置 `ILINK_ENABLED=true` 后，可使用独立测试微信进行接入验证。不要让同一微信账号同时连接两套部署。“已提交微信”不代表送达或已读；投递不确定时不会自动重复发送。

QQ 也默认关闭。部署准备完成后配置平台机器人的 `QQ_ENABLED`、`QQ_APP_ID`、`QQ_APP_SECRET`；可通过 `QQ_BOT_URL` 提供机器人分享链接。用户在设置生成一次性绑定指令，在 QQ 私聊发给机器人即可绑定。准入和插件分析见 [QQ 与 DSH 插件调研](docs/research/qq-and-dsh-plugins-2026-11-02.md)，外部验收见[部署说明](docs/deployment.md)。未安装 DSH 插件运行环境。

## 开发与检查

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

测试在本地开发 PostgreSQL 中创建并迁移独立的 `jojobot_test` 数据库，使用模型/网络测试替身及本地 Mailpit，不读取生产凭据。配置、检查细节与当前限制见[开发与验证](docs/development.md)。

技术栈：Next.js 16、React 19、TypeScript、Tailwind CSS 4、Base UI、AI SDK、Better Auth、Drizzle、PostgreSQL 17、pg-boss。一个共享 Worker 并发服务多个用户，同一用户的对话按顺序执行；无需每用户容器、Redis 或额外 Agent 框架。

修改依赖前先停止开发服务，安装完成后重启。pnpm 重排依赖目录时，正在运行的 Turbopack 可能持续触发热更新。

## 自行部署与参与开发

[Docker 部署说明](docs/deployment.md)提供 Web、Worker、PostgreSQL 共享部署方式。未来托管服务的普通用户无需配置供应商；自行部署的维护者需要完成配置。目前尚未接入文件及对象存储。

先阅读[产品需求](docs/PRD.md)、[实现架构](docs/architecture.md)和[工作约定](AGENTS.md)。欢迎提交边界清晰的改进或可复现的问题；原始选型与开源调研见[文档索引](docs/README.md)。

## 许可证

[MIT](LICENSE)，Copyright © 2026 JOBO。玻璃材质改编与依赖许可见[第三方声明](THIRD_PARTY_NOTICES.md)。
