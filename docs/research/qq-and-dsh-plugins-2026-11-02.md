# QQ 渠道与 DeepSeek Harness 表情包、拟人回复调研

日期：2026-11-02（北京时间）。状态：官方文档与上游源码调研，未安装插件、未连接 QQ、未做真实账号收发验收。

本次需求是评估新增 QQ 渠道，以及借鉴 DeepSeek Harness（DSH）生态的表情包和自然回复能力。以下是实施建议，不代表已经接入，也不自动把这些能力加入首版必交范围。产品基线见 [PRD](../PRD.md)，技术基线见 [技术选型](../technical-selection.md)。调研时本地已有进行中的未提交工程文件；本次不修改或验收这些实现。

## 1. 结论

- **QQ 值得作为优先验证的新渠道，先做官方机器人私聊。** 有腾讯提供的 Node.js/TypeScript SDK，适合接入当前共享服务。公开服务的主体条件需要先落实：当前官网明确个人认证暂不支持公开使用，企业认证可以配置公开服务范围。
- **表情包优先参考 `dsh-meme`。** 它覆盖按情绪和关键词选图、图片学习、Web 展示和 IM 原生图片投递，接近“实际聊天会用”的需求。JOJOBOT 先移植选图与投递方式，无需引入图库市场。
- **自然回复分两部分做。** 措辞与个人偏好参考 `biaoqingbao` 的“学我说话”；分条、输入状态和发送节奏参考 `dsh-im-humanize`。后者主要改变消息交付方式，不能单独保证内容更自然。
- **维持现有 AI SDK 方向。** DSH 是宿主框架，不是 DeepSeek 模型的一个 API 参数；这些插件依赖其工具、会话和前端接口，不能直接安装进 Next.js/AI SDK。为两项能力更换整个运行框架，当前收益不足。

以上取舍是针对 JOJOBOT 的判断。DSH 官方仍标注 developer preview，并提示会发生破坏兼容性的变更。依据：[DSH 官方仓库](https://github.com/deepseek-ai/deepseek-harness)、[QQ 当前接入指南](https://bot.q.qq.com/wiki/)、[腾讯 QQ SDK](https://github.com/tencent-connect/qqbot-nodejs)。

## 2. QQ 的可行路线与限制

### 2.1 推荐官方机器人，而非个人 QQ 号托管

建议平台运营一个 JOJOBOT 官方机器人，用户在 QQ 添加它并绑定自己的 JOJOBOT 账号。机器人应用凭据属于平台；不要求每个终端用户申请 AppID，也不为用户创建独立运行实例。

腾讯的 `@tencent-connect/qqbot-nodejs` 提供凭证维护、WebSocket/Webhook、文本和图片/文件发送、私聊流式消息及 TypeScript 类型。`dsh-im` 的 QQ 运行模块也直接使用这个 SDK，因此可以参考其渠道处理经验，直接调用 SDK 接到本项目业务层。[SDK 说明](https://github.com/tencent-connect/qqbot-nodejs/blob/main/README.zh-CN.md)、[dsh-im QQ 运行模块](https://github.com/xmanrui/dsh-im/blob/dd500d24252a182ca64645ada005a553fd723831/src/channels/qq/qq-runtime.mjs)。

个人 QQ 协议桥接不作为本次推荐路线；当前需求已有官方接口可以验证，无需额外引入登录个人账号的客户端运行依赖。

### 2.2 当前官网给出的准入条件

| 事项 | 本次核实结果 | 对 JOJOBOT 的影响 |
| --- | --- | --- |
| 个人认证 | 暂不支持公开使用；历史已获公开权限者有例外 | 新个人主体不应直接按“公开注册用户都能使用 QQ”规划上线 |
| 企业认证 | 可将各场景设置为公开使用 | 公开托管服务应先确认主体及后台实际可选范围 |
| 内部体验 | 可添加 20 个号码，配置后不受服务范围设置影响 | 先完成小范围真实账号验证 |
| 服务范围 | 当前说明为切换免审核 | 不套用旧教程中“一律先上架审核”的结论；主体认证和实际权限仍须完成 |
| 连接方式 | WebSocket 或 HTTPS Webhook | 内部验证可用共享 Worker 长连接；公开服务优先评估官网推荐的 Webhook |

来源：[QQ 接入指南：服务范围、开发基础设置](https://bot.q.qq.com/wiki/)。这些是公开文档规则，不是对本项目账号权限的实测确认。

### 2.3 消息、图片与提醒

当前官网说明：单聊被动回复为 **60 分钟、每条用户消息最多 4 次**；群聊为 **5 分钟、最多 5 次**。主动消息已列出频控规则，用户可以关闭接收；另有用户对话后 30 天内、分四个周期各一次的互动召回能力。[消息收发概述](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html)。

需要记录两处资料冲突：

1. 腾讯 GitHub 旧文档仍写“2025-04-21 起停止主动推送”，并保留旧配额；其旧网页地址已跳转。**当前官网应优先于旧仓库文档**，不据旧文档认定 QQ 无法主动通知。[旧文档](https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/server-inter/message/send-receive/send.md)。
2. 当前单聊接口页顶部写 60 分钟，但 `msg_id` 字段描述仍写 5 分钟。需要用真实账号验证 5 分钟附近及更晚的回复，不能只凭其中一个数字承诺业务行为。[单聊发送接口](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)。

官方富媒体链路是上传取得有有效期的 `file_info`，再发送图片消息；单聊与群聊上传接口不互通。SDK 支持直接传图片数据和分片上传，不需要先把用户私图永久公开。[富媒体说明](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html)、[SDK 图片发送](https://github.com/tencent-connect/qqbot-nodejs/blob/main/README.zh-CN.md)。

因此：

- 表情包按图片交付；“能发图片”不等于“以 QQ 收藏表情的专用样式显示”。静态图、GIF、大小和手机/电脑显示必须分别验收。
- 私聊已有“输入中”接口，可以体现真实处理状态。图片加文字会占用回复次数，拆条必须计入渠道预算；不能原样搬用拟人插件的 20 段上限。
- QQ 提醒有验证价值，但主动权限、用户接收开关、频控和失败状态都应实测。沿用 PRD 的网页留存与真实投递状态，不把 API 接受写成已送达。

### 2.4 接到 JOJOBOT 的最小边界

网页生成短期、一次性的绑定凭证，用户在机器人私聊提交；服务端把已验证的 QQ 应用/用户标识关联到登录账号。不能让用户只填写 QQ 号码即完成身份认领。

QQ 私聊输入进入同一条主对话，复用已有业务规则、运行顺序、额度与去重；QQ 回复和网页历史共享同一结果。应用凭据与用户绑定分别管理，解绑一个用户不应停掉共享机器人。

首轮建议只开放私聊。群聊会引入公开上下文、参与者权限和个人资料泄露边界，不能把群消息自动并入任意成员的私人主对话。以后需要群聊时，再定义独立的群范围。

## 3. 值得关注的 DSH 插件

版本为读取默认分支 `package.json` 的快照，不保证与 npm 最新发布一致。下列五个仓库均读取了 MIT 许可文件；源码许可不替代所附图片素材的授权核验。本次只做文档与代码阅读，没有复现上游声称的测试结果。

| 插件 | 与本次需求有关的能力 | 局限与建议 |
| --- | --- | --- |
| [`@xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im) · 5.9.1 | QQ/微信等渠道接入、会话路由、图片与文件回传 | **渠道参考。** 完整插件还管理工作区、模型和本机文件，不直接作为 JOJOBOT 多用户业务层 |
| [`dsh-meme`](https://github.com/yyh-001/dsh-meme) · 0.1.76 | 情绪/关键词选图、多图库、主动发图频率、AI 学图；Web 配图与 IM 图片投递；QQ 缩图 | **表情包第一参考。** 本地 SQLite/文件图库需要改成项目内受控数据与存储；图库市场和自动收集暂不引入 |
| [`dsh-biaoqingbao`](https://github.com/moononnn/DeepSeek-Harness-biaoqingbao) · 0.3.2 | 自建图库、标签/向量检索、反馈、场景频率、“学我说话”、方言 | **个性化参考。** 不附图库；识图、内容分析、可选向量会增加调用。依赖较早 DSH 接口，不能承诺与最新宿主兼容 |
| [`@johnnren/dsh-im-humanize`](https://github.com/john-walks-slow/dsh-im-humanize) · 4.38.0-humanize.2 | IM 分条、阅读/段间延迟、输入状态、每机器人覆盖设置 | **节奏参考。** 是完整 dsh-im fork，与上游 5.9.1 不在同一版本；不是可随意叠装的独立风格插件 |
| [`dsh-alive`](https://github.com/kaitox326/dsh-alive) · 0.1.0 | 状态、印象记忆、节奏提示、可选短消息不回复 | **仅作机制研究。** 作者明确未在真实 DSH 进程中加载验证；沉默默认关闭，记忆为简单句式规则，不能当成熟的自然对话方案 |

### 3.1 `dsh-meme`：值得借鉴的是完整选图与发送链路

已阅读 `memes.js`、`index.js`、`qq-resize.js`：

- `send_meme` 按情绪、关键词和描述返回候选，再让模型选择；找不到合适图可以继续换词或只回文字。
- Web 模式使用描述标记配图；IM 模式给文件投递工具图片路径，真正发送图片，而非在聊天里打印“[表情：开心]”。
- 有 QQ 发送副本缩放，默认不开启；缩放代码检查动图帧数，目标是保留动画，但 QQ 客户端的最终显示仍需验证。
- 索引采用 SQLite，图库位于本地目录，HTTP 访问控制主要面向本机/可信 Host。这不是 JOJOBOT 所需的逐用户资料鉴权。

代码依据：[选图与 IM 路由](https://github.com/yyh-001/dsh-meme/blob/aef2b817c822dbfac6ba849bb43fd81535ad2903/memes.js)、[宿主与图库管理](https://github.com/yyh-001/dsh-meme/blob/aef2b817c822dbfac6ba849bb43fd81535ad2903/index.js)、[QQ 缩图](https://github.com/yyh-001/dsh-meme/blob/aef2b817c822dbfac6ba849bb43fd81535ad2903/qq-resize.js)。

对 JOJOBOT 的建议：模型选受控的 `stickerId`，服务端校验素材归属并生成图片消息；不要让模型提交任意本地路径，也不依赖描述文字作为图片唯一标识。

### 3.2 `biaoqingbao`：“学我说话”确有实现，但要改归属范围

代码中有采样用户发言、分析用词/句长/标点/语气、生成风格草稿、保存与注入模板的流程。它强调学习特征的出现比例，避免每句话都堆语气词；这比给所有回复统一加“呀、呢、哈哈”更有参考价值。

但当前实现调用宿主 `listSessions()` 收集多个会话，风格模板是全局一份；图库偏好按助手预设区分。**助手预设隔离不等于 JOJOBOT 用户隔离。** 移植时只处理当前用户主动选择的样本，生成可编辑、可关闭的风格偏好，并与事实记忆分开。不能把整台宿主的会话作为一个用户的语言样本。[风格采样、模板与注入代码](https://github.com/moononnn/DeepSeek-Harness-biaoqingbao/blob/e8a81042230b33a4800d7c4f01238d368998b0d5/lib/index.js)、[标签评分](https://github.com/moononnn/DeepSeek-Harness-biaoqingbao/blob/e8a81042230b33a4800d7c4f01238d368998b0d5/lib/core.js)。

第一阶段只需预设自然语气，加上用户明确保存的措辞偏好。学习历史说话风格放到后续，不需要每轮额外调用一个“情绪分析 Agent”。

### 3.3 `dsh-im-humanize`：借鉴分条，谨慎使用延迟与打断

代码通过 `message_break` 形成消息断点，再由 IM 投递消费者发送各段；发送延迟与输入状态有独立设置。发送延迟默认关闭，但新消息处理默认是 `interrupt`。这适合某些角色聊天，不能直接替代 JOJOBOT 的事务与任务执行规则。[分条代码](https://github.com/john-walks-slow/dsh-im-humanize/blob/1fe4b08ce4dc4f2e5601796a90decc3a06d90c3b/src/channels/shared/message-break.mjs)、[延迟代码](https://github.com/john-walks-slow/dsh-im-humanize/blob/1fe4b08ce4dc4f2e5601796a90decc3a06d90c3b/src/channels/shared/send-delay.mjs)、[配置定义](https://github.com/john-walks-slow/dsh-im-humanize/blob/1fe4b08ce4dc4f2e5601796a90decc3a06d90c3b/src/channels/shared/humanize-schema.mjs)。

建议普通闲聊按语义最多拆成一两条文字，可附一张图；实际总条数由渠道额度约束。创建待办、取消事项、操作失败等必须及时说清结果；不随机不回、不故意拖慢、不因后到一句话就自动重做已产生副作用的操作。聊天自然感首先来自措辞、上下文衔接与适度表达。

## 4. 最小实施建议

### 表情包

先准备一小套来源与使用授权清楚的素材，记录情绪、场景、描述及最近使用情况；模型根据对话选图，服务端负责归属、频率与真实投递。建议默认每轮最多一张，避免相邻轮次重复；没有贴切候选就不发。用户可关闭。

“能选图发图”与“能理解用户发来的任意表情图”分别验收。前者可用预先标注的描述；后者需要实际可用的视觉模型与图片输入链路，不能因为接入 DeepSeek 文本模型就视为已支持。可先标注常用图库，再评估识图、用户收藏与学习反馈。

用户上传的私有表情仍进入私有对象存储，标签和偏好进入业务数据库；不能复制上游本地图库/JSON 的生产持久化方式。普通收到的图片不默认永久入库，不自动收集群聊所有人的表情。

### 回复自然度

先用一套短的默认表达约定：自然中文，承接上下文，按问题长短回答，减少机械开场和固定结尾；闲聊可轻松接梗，办事时准确给出结果。用户明确要求的简短、少表情、少语气词等偏好可记住。

个性化表达不改变工具权限、事实和执行状态，也不需要假装真人或编造线下经历。先改善内容，再评估分条与输入状态；风格学习、方言、情绪数值和关系等级不作为首轮前置条件。

### 推进顺序

1. QQ 内部验证：主体/服务范围确认、私聊文本与图片、账号绑定、网页接续。
2. 表达验证：受控小图库、自然语气、一轮最多一图，记录质量反馈。
3. 可靠性验证：多用户隔离、去重、回复次数、超时结果、解绑与断线恢复。
4. 根据真实体验再决定公开 QQ、私有图库、说话风格学习及群聊；不预建插件市场或通用插件平台。

## 5. 后续真实渠道验证清单

实施更新：用户已同意先做最小增量，主体认证与公开服务权限留到部署阶段。现已实现官方 SDK 私聊适配、一次性绑定、受控原创静态图库与自然语气约定；本地数据库/模型工具/渠道替身检查见[开发与验证](../development.md)。下表是后续真实渠道及扩展功能的验证目标，不代表这些功能全部已实现或已实测。

| 验证 | 应观察的结果 |
| --- | --- |
| 两个 QQ 用户绑定不同网页账号 | 对话、资料、风格和图库不会串用；绑定凭证不可重复消费 |
| QQ 发消息后在网页追问 | 使用同一主对话；回复回到正确来源 |
| 静态图、GIF、图文连续发送 | 手机和电脑可见；明确动画/尺寸表现；不出现裸路径或配图标记 |
| 用户发图、显式收藏、以后调用 | 识图失败有真实状态；只在用户授权后持久收藏；用户可删除 |
| 窗口边界、超额、关闭主动消息 | 核实 5/60 分钟文档差异和每轮预算；失败有原因；不编造送达 |
| 回调重复、超时、重启、解绑 | 不重复创建事项；发送未知不盲目重发；旧绑定不再投递 |
| 闲聊、吐槽、严肃请求、任务失败 | 表达自然且贴题；表情不会取代必要结果；失败仍如实报告 |
| 用户连续发几句、修改前一句 | 消息不丢失；已提交业务操作不会因拟人打断而被重复执行 |

建议用相同模型、相同任务做小规模盲评：基线与“自然语气 + 表情”比较自然度、选图贴切度、任务正确率、额外延迟和成本。所有效果结论应来自这种对照与真实收发，不以插件名称或演示视频代替验证。

## 6. 源码快照

| 仓库 | 默认分支提交 | 提交日期（UTC） | 许可 |
| --- | --- | --- | --- |
| xmanrui/dsh-im | `dd500d24252a182ca64645ada005a553fd723831` | 2026-11-01 | [MIT](https://github.com/xmanrui/dsh-im/blob/dd500d24252a182ca64645ada005a553fd723831/LICENSE) |
| yyh-001/dsh-meme | `aef2b817c822dbfac6ba849bb43fd81535ad2903` | 2026-11-01 | [MIT](https://github.com/yyh-001/dsh-meme/blob/aef2b817c822dbfac6ba849bb43fd81535ad2903/LICENSE) |
| moononnn/DeepSeek-Harness-biaoqingbao | `e8a81042230b33a4800d7c4f01238d368998b0d5` | 2026-08-25 | [MIT](https://github.com/moononnn/DeepSeek-Harness-biaoqingbao/blob/e8a81042230b33a4800d7c4f01238d368998b0d5/LICENSE) |
| john-walks-slow/dsh-im-humanize | `1fe4b08ce4dc4f2e5601796a90decc3a06d90c3b` | 2026-10-26 | [MIT](https://github.com/john-walks-slow/dsh-im-humanize/blob/1fe4b08ce4dc4f2e5601796a90decc3a06d90c3b/LICENSE) |
| kaitox326/dsh-alive | `e50acf50d04c910f6df66b4d7f08440b7390c854` | 2026-10-27 | [MIT](https://github.com/kaitox326/dsh-alive/blob/e50acf50d04c910f6df66b4d7f08440b7390c854/LICENSE) |

`dsh-alive` 的验证边界见其 [README](https://github.com/kaitox326/dsh-alive/blob/e50acf50d04c910f6df66b4d7f08440b7390c854/README.md)。实际采用任何源码前固定版本、保留版权，并针对 JOJOBOT 的用户边界与目标渠道重新验收。
