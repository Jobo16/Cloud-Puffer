# JOJOBOT 开源代码调研

日期：2026-11-02。目的：为 JOJOBOT 首版 PRD 提供代码依据，判断已有实现可以参考到哪一层。

本次拉取并静态阅读了三个仓库，未安装依赖、启动应用、运行其测试或使用真实微信账号联调。因此“代码已实现”不等于“已验证可投产”；本报告不作容量或完整安全审计结论。

## 1. 本地快照

| 项目 | 来源 | 固定提交 | 提交日期 | 本地路径 |
| --- | --- | --- | --- | --- |
| Octop | https://github.com/TencentCloud/Octop | `a40f54a8099b1faebc89c680ec1e1ece8b97a4e6` | 2026-11-02 | `.research/upstream/octop` |
| ClawScale | https://github.com/ClayPulse/ClawScale | `98b62f2f38c813671078ed5b04ba59f8b20241d7` | 2026-04-10 | `.research/upstream/clawscale` |
| OpeniLink Hub | https://github.com/openilink/openilink-hub | `1df2ebebb69a5099e94b3f254f069aca5e272eed` | 2026-06-19 | `.research/upstream/openilink-hub` |

均为默认分支的浅克隆。提交日期来自 `git show`，不是搜索引擎抓取日期；引用固定 SHA，后续复核需注明新版本。参考仓库不纳入产品提交或发布包。

## 2. 对 JOJOBOT 的结论

三者共同证明“共享服务 + 多用户逻辑隔离 + 多渠道连接”有现成实现可参考，按用户维护数据和连接并不要求每个用户一台机器。

目前最适合 JOJOBOT 的做法是独立实现已确认的个人产品范围，参考它们的局部机制。本次不建议直接以任何一个完整产品作为已选定基座：Octop 的专家、工作区和本机能力超出首版；ClawScale 的组织租户与终端用户模型不同；OpeniLink Hub 的中心对象是 Bot 与 App 安装，尚不能替代 JOJOBOT 的统一个人主对话和业务记录。

| 关注点 | Octop | ClawScale | OpeniLink Hub | 对 JOJOBOT 的取舍 |
| --- | --- | --- | --- | --- |
| 用户归属 | 用户持有 Agent，另有共享专家/管理权限 | 组织租户下分管理成员和终端用户 | Bot 归属于平台用户 | 首版一个人一个私有空间，无组织层级 |
| 运行方式 | 同进程注册多 Agent 对象 | 共享 API 路由到多个后端 | 共享 Manager 管理 Bot 连接 | 共享运行服务与任务执行，不按人部署 |
| 渠道身份 | Agent 绑定渠道，会话按来源组织 | 外部用户可用 link code 关联 | 登录用户发起 iLink 扫码，按 Bot 管理 | 登录账号发起绑定，主对话属于内部用户 |
| Agent 能力 | Harness、工具、记忆、定时任务 | 可接 Agent 后端，也有调用管理命令的 Agent | 内置模型和 App 工具调用循环 | 单一助手调用受控的内置能力 |
| 对话数据 | Web/IM 默认会话键不同 | 各渠道会话，关联后聚合历史 | 按频道和发送者构造 AI 上下文 | 微信与网页共用一条持久主对话 |
| 定时能力 | 固定文字和定时 Agent 任务区分 | 本次重点链路未证明完整个人提醒能力 | Bot 活跃窗口提醒，App 可扩展 | 首版只做用户事项与固定提醒 |

## 3. Octop：完整能力参考，不能照搬运行规模假设

### 已核对的代码

- [架构文档](https://github.com/TencentCloud/Octop/blob/a40f54a8099b1faebc89c680ec1e1ece8b97a4e6/docs/architecture.md)：一个 Python 进程承载 API、Agent 管理、渠道和定时任务，控制数据可存 SQLite 或 PostgreSQL。
- [AgentManager](https://github.com/TencentCloud/Octop/blob/a40f54a8099b1faebc89c680ec1e1ece8b97a4e6/src/octop/infra/agents/manager.py)：`boot()` 读取所有启用 Agent 并调用 `_start_agent()`，创建 Harness Agent 对象；生命周期按 Agent 加锁。
- [Agent 访问校验](https://github.com/TencentCloud/Octop/blob/a40f54a8099b1faebc89c680ec1e1ece8b97a4e6/src/octop/api/common/agent.py)：校验用户归属，同时允许管理员和共享专家等路径。这说明实际权限不是简单的一人一份数据，JOJOBOT 不需要继承这些共享分支。
- [记忆后端](https://github.com/TencentCloud/Octop/blob/a40f54a8099b1faebc89c680ec1e1ece8b97a4e6/src/octop/infra/agents/memory/backend.py)：支持 SQLite 与 PostgreSQL；记忆以 Agent 命名空间区分，可连接共享数据库。命名空间不等于独立服务器。
- [定时工具](https://github.com/TencentCloud/Octop/blob/a40f54a8099b1faebc89c680ec1e1ece8b97a4e6/src/octop/infra/cron/tools.py)及[投递服务](https://github.com/TencentCloud/Octop/blob/a40f54a8099b1faebc89c680ec1e1ece8b97a4e6/src/octop/infra/cron/delivery.py)：区分固定文字提醒与需要模型执行的任务，带用户/Agent/会话归属，并在投递前核对用户。
- [用户管理接口](https://github.com/TencentCloud/Octop/blob/a40f54a8099b1faebc89c680ec1e1ece8b97a4e6/src/octop/api/routers/users.py)：已有停用、权限、token 配额、Agent 数量等管理字段，可作为后台能力参考。

### 对此前调研的修正

此前根据架构说明概括了“按需创建 Agent”。当前代码显示启动时会加载全部启用 Agent，因此不能据此宣称它已经实现面向大量闲置用户的按请求创建与回收。它确实不需要每用户一台云服务器，但内存占用、启动时间和共享资源消耗仍需实测。

### 借鉴与舍弃

借鉴用户归属校验、明确的运行生命周期、固定提醒绕过模型、定时结果回到会话的设计。JOJOBOT 首版不采用多专家共享、专家市场、终端/桌面能力和按 Agent 本地工作区；文件与长期状态按产品数据管理。

许可：[MIT LICENSE](https://github.com/TencentCloud/Octop/blob/a40f54a8099b1faebc89c680ec1e1ece8b97a4e6/LICENSE)。

## 4. ClawScale：渠道抽象与身份关联参考

### 已核对的代码

- [数据模型](https://github.com/ClayPulse/ClawScale/blob/98b62f2f38c813671078ed5b04ba59f8b20241d7/packages/app/prisma/schema.prisma)：`Tenant` 是组织，`Member` 是管理人员，`EndUser` 是渠道使用者；外部用户以租户、渠道、外部 ID 联合标识。
- [消息路由](https://github.com/ClayPulse/ClawScale/blob/98b62f2f38c813671078ed5b04ba59f8b20241d7/packages/app/api/lib/route-message.ts)：先由渠道解析租户，再解析 EndUser 和 Conversation；支持 link code，把多个外部身份关联并收集多个会话的历史。
- [微信适配器](https://github.com/ClayPulse/ClawScale/blob/98b62f2f38c813671078ed5b04ba59f8b20241d7/packages/app/api/adapters/wechat.ts)：直接使用 iLink 二维码登录、长轮询、媒体下载和消息发送，不只是 README 声称支持微信。
- [内置 Agent](https://github.com/ClayPulse/ClawScale/blob/98b62f2f38c813671078ed5b04ba59f8b20241d7/packages/app/api/lib/clawscale-agent.ts)：通过 LangChain 工具执行平台斜杠命令，并包含文件文本提取。它的主要工具目标是管理 ClawScale，不是 JOJOBOT 的个人待办和文档业务。

### 直接采用前的差距

微信适配器的同步游标保存在进程内 Map 中；轮询取到消息后先更新游标，再逐条等待消息路由与回复。该路径未提供 JOJOBOT 所需的持久消息接收、独立任务执行及投递结果管理保证。此结论只描述所读路径，不等同于对全仓库作完整可靠性审计。

跨渠道关联后“聚合多个会话历史”也不等同于本产品要求的“唯一主对话、统一顺序与完整网页记录”。JOJOBOT 应从内部账号直接关联已授权的渠道身份，首版不引入组织管理员和外部终端用户两套产品身份。

借鉴渠道适配器、标准入站消息和显式身份关联。当前快照的提交日期为 2026-04-10，不能直接假定其 iLink 协议调用仍符合当前服务端行为。

许可状态：[README](https://github.com/ClayPulse/ClawScale/blob/98b62f2f38c813671078ed5b04ba59f8b20241d7/README.md)声明 MIT；当前 Git 跟踪文件中未找到独立 LICENSE/COPYING/NOTICE。实际复制代码前需确认完整授权文本与归属信息，不能把这一检查结果写成已确认完整许可。

## 5. OpeniLink Hub：微信绑定和连接管理参考

### 已核对的代码

- [Bot 模型](https://github.com/openilink/openilink-hub/blob/1df2ebebb69a5099e94b3f254f069aca5e272eed/internal/store/bot.go)：保存用户归属、Provider、凭据、同步状态和连接状态。
- [BotManager](https://github.com/openilink/openilink-hub/blob/1df2ebebb69a5099e94b3f254f069aca5e272eed/internal/bot/manager.go)：在共享 Manager 的 Map 中维护实例；启动时恢复有凭据的 Bot，同步状态写回存储，并尝试恢复未处理消息。这里的实例是程序对象和连接，不是每 Bot 一台服务器。
- [绑定接口](https://github.com/openilink/openilink-hub/blob/1df2ebebb69a5099e94b3f254f069aca5e272eed/internal/api/bot_handler.go)：扫码后检查已有 Bot 的用户归属，处理同用户重绑，并在查询/修改等接口核对 Bot 的 UserID。
- [Provider 接口](https://github.com/openilink/openilink-hub/blob/1df2ebebb69a5099e94b3f254f069aca5e272eed/internal/provider/provider.go)与[iLink 实现](https://github.com/openilink/openilink-hub/blob/1df2ebebb69a5099e94b3f254f069aca5e272eed/internal/provider/ilink/ilink.go)：抽象接收、发送、媒体、状态和同步游标，iLink 实现处理登录失效。
- [AI Sink](https://github.com/openilink/openilink-hub/blob/1df2ebebb69a5099e94b3f254f069aca5e272eed/internal/sink/ai.go)：确实已有模型调用、上下文构建、收集已安装 App 工具、有限轮数的工具循环以及用量累计。

### 对此前调研的补充

OpeniLink Hub 不只是将消息转发给外部 Agent；它已有工具调用能力。不过其 AI 上下文按频道和发送者构造，不能直接推定它已实现 JOJOBOT 需要的统一个人身份、网页和微信共用主对话、个人记忆及内置事项模型。

应用市场中的“飞书/Slack/Notion App”可能是工具集或桥接能力，不能仅凭 App 名称就把它当成同一个个人助手的独立聊天入口。

借鉴扫码归属、重绑、凭据生命周期、游标持久化、连接恢复和 Provider 边界。其提醒循环是提示用户保持 Bot 活跃的机制，不能用来替代完整的用户事项提醒功能。

当前快照日期为 2026-06-19，媒体、账号生命周期和大规模连接仍需当前协议下实测。

许可：[MIT LICENSE](https://github.com/openilink/openilink-hub/blob/1df2ebebb69a5099e94b3f254f069aca5e272eed/LICENSE)。

## 6. iLink 的产品约束与证据等级

| 事实/问题 | 证据 | PRD 处理 |
| --- | --- | --- |
| 官方插件支持一个 Gateway 登录多个微信账号 | [Tencent/openclaw-weixin README](https://github.com/Tencent/openclaw-weixin) | 不需要为绑定一个微信创建一台服务器，但具体容量未知。 |
| 协议中的消息类型不代表全部客户端能力可用 | [腾讯协议文档](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md)明确区分类型字段与功能保证 | 首版只承诺完成手机端验证的文本与文件能力。 |
| 主动消息存在窗口约束 | [Issue #185](https://github.com/Tencent/openclaw-weixin/issues/185)中，维护者于 2026-06-03 说明当时只接受用户发消息后 24 小时内的回复 | 不把 24 小时写成永不变化的服务契约；对窗口不可用设计网页记录与未发送状态。 |
| SaaS 托管模式的准入和容量尚无此处可确认的公开答复 | [Discussion #324](https://github.com/Tencent/openclaw-weixin/discussions/324)于 2026-11-02 查询时仍显示未回答 | 在扩大试用前核实，不把插件 MIT 许可等同于后端服务容量或准入承诺。 |
| 存在 API 返回成功但微信无可见回复的报告 | [Issue #290](https://github.com/Tencent/openclaw-weixin/issues/290)，属于用户故障报告，不是普遍发生的证明 | 记录渠道接受与可见送达的区别；无回执时只显示已提交。 |

JOJOBOT 产品边界是用户与自己的 ClawBot 交互，不扩展为读取普通微信聊天记录、朋友圈或普通群消息。窗口恢复与 Bot 登录失效也需要区分，不统一要求重新扫码。

## 7. 后续验证重点

技术设计阶段围绕 PRD 实现最小闭环；无需先将三个项目拼接起来。

1. 两个 JOJOBOT 用户各绑定一个真实微信身份，证明身份隔离和重绑正确。
2. 微信与网页接续同一主对话，同时发消息仍保持顺序和业务写入幂等。
3. 文本、文件的真实手机收发，以及窗口不可用/登录过期/未知提交结果的展示。
4. 服务重启后消息、任务和提醒恢复，旧连接的投递不转移到新身份。
5. 试用规模下的连接、并发模型调用、文件处理和实际成本；容量结论以测量为准。

对应的需求和验收场景见 [PRD](../PRD.md)。
