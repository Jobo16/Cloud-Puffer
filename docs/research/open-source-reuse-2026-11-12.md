# 开源复用与可验证范围

日期：2026-11-12。此表记录已采用的组件与后续候选；代码接入不等于真实账号验收。采用前逐项确认对应版本、许可证、平台准入和真实账号行为。

| 部分 | 可复用项目 | 当前决定与边界 | 本次可验证结果 |
| --- | --- | --- | --- |
| 多渠道收发 | [Octop Gateway](https://github.com/TencentCloud/octop-gateway)（MIT） | `.research/octop-gateway` 保存 1.0.3 参考源码，借鉴渠道消息边界；尚未复制或运行其 Python 适配器。当前业务账号、主对话、去重、额度及投递状态仍在本项目。 | 核对本地参考版本 `224ed07` 与上游 `main`；未运行 Octop 平台实机测试。 |
| Telegram | [grammY](https://github.com/grammyjs/grammY) 1.46.0（MIT） | 直接作为当前 TypeScript Worker 的 Bot API 客户端，复用现有入队与按来源投递；不新增服务进程。只接入绑定后的私聊文字。 | 绑定、账号隔离、重复更新、媒体拒绝与投递状态使用测试替身检查；无真实 Bot 凭据和客户端验收。 |
| Codex 本地 Agent | [Codex CLI](https://github.com/openai/codex)（Apache-2.0） | 继续调用用户电脑上已安装并登录的 `codex exec`，不复制运行时。后续需要流式事件和交互授权时，按 [app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) 官方协议升级。 | 本机 Codex CLI 0.144.3 在只读沙箱完成一次独立文字调用；另用临时测试账号经服务端设备领取、真实 Codex 回复、结果提交和数据库保存跑通一轮。尚未测试 HTTP、网页交互或手机渠道回传。 |
| OpenClaw 本地 Agent | [OpenClaw](https://github.com/openclaw/openclaw)（MIT） | 当前通过官方 [`openclaw agent --session-id --message-file - --json`](https://docs.openclaw.ai/cli/agent) 调用用户电脑已有 Gateway，不附加 OpenClaw 自己的渠道投递。需要运行事件和授权时再使用官方 [Gateway client](https://docs.openclaw.ai/gateway/clients)。 | 官方命令参数已核对；本机没有 `openclaw`，未做真实调用。 |
| 提醒与定时作业 | [pg-boss](https://github.com/timgit/pg-boss)（MIT） | 项目已有该依赖与共享 Worker。一次性提醒可用 [`startAfter` / `sendAfter`](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md)，重复提醒可用其调度能力；提醒记录、取消和投递状态仍是本项目业务数据。 | 现有队列集成测试通过；提醒功能尚未实现。 |
| 用户文件与资料 | [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3)（Apache-2.0）、[PDF.js](https://github.com/mozilla/pdf.js)（Apache-2.0）、[Mammoth](https://github.com/mwilliamson/mammoth.js)（BSD-2-Clause） | 选定私有对象存储后用 S3 客户端处理对象；PDF 与 DOCX 文本解析分别评估现成库。数据库只保存用户归属、对象键和索引状态，不把文件存进应用目录。 | 尚未选定对象存储，也未接入解析库或测试真实用户文件。 |
| 联网搜索 | [SearXNG](https://github.com/searxng/searxng)（AGPL-3.0） | 可作为独立服务，通过其 [HTTP 搜索 API](https://github.com/searxng/searxng/blob/master/docs/dev/search_api.rst) 获取结果；不复制其代码进 MIT 仓库。上线前先验证来源、失败与搜索成本。 | 未部署服务、未验证真实搜索质量。 |
| 异地备份 | [restic](https://github.com/restic/restic)（BSD-2-Clause） | 可复用其加密备份与恢复工具；仍需确定异地目的地、密钥保管与恢复演练。 | 项目此前只做过一次数据库备份恢复；定期异地备份尚未配置。 |
| WhatsApp | [Baileys](https://github.com/WhiskeySockets/Baileys)（MIT）是候选客户端；另需评估平台提供的正式接入方式 | 先确定账号类型、准入与收发边界，再选择实现。Baileys 自身许可不等于其整套依赖或平台使用方式已适合本项目。 | 无测试账号或连接凭据，未接入和实测。 |

## 已执行的本机检查

- `pnpm typecheck`、`pnpm lint`、`pnpm test`（58 项）和 `pnpm build` 在 2026-11-12 通过；测试使用独立 `jojobot_test` 数据库，模型与渠道网络仍为替身。
- 本机 `codex exec` 在临时目录以只读沙箱完成一次文字回复。随后使用 `jojobot_test` 临时账号和设备，调用本项目服务端领取与提交处理器，交给真实 Codex 回复，再查得运行状态 `completed` 且输出与提交一致；临时账号及文件已清理。该检查未启动 HTTP 服务、网页连接程序或真实渠道。
- 本地 Web 当前未运行；PostgreSQL 与 Mailpit 开发容器就绪。没有触碰生产环境或使用真实微信、QQ、Telegram、WhatsApp 账号。

## 实施顺序

1. 用现有 Codex CLI 完成经 HTTP 与网页连接程序的完整回合，再验证手机渠道回传；OpenClaw 在有本机安装的环境分别验证。把领取、取消、撤销和离线结果与当前 58 项自动化检查对照。
2. 用真实 Telegram Bot 验证文字、身份、去重、投递状态与跨账号隔离，再决定媒体范围；其他渠道逐个选择可复用客户端，只有跨语言适配器确有收益时才增加独立进程。
3. 提醒、文件、搜索和备份按各自产品闭环实施。选定真实存储或搜索服务后才增加对应依赖，不预建通用插件平台。
