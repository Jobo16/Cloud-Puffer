# Cloud Puffer 文档

更新：2026-11-11。当前为可运行的开发预览，已包含账号、工作区、真实主对话、待办/记忆、每日积分、简易管理员后台及微信/QQ 适配。本地已完成百炼模型与单个微信账号的文字收发验证；QQ、完整生产验收和长期稳定性仍待完成。提醒、搜索、文件和文档等首版目标尚未完成。本地 Codex/OpenClaw 文字连接已有开发代码，真实运行待验收；Octop 新渠道仍在设计阶段。

产品主线：一个账号、一条跨渠道主对话；渠道负责收发，云端负责身份、数据、运行顺序与投递状态，Agent 可运行在云端或用户自己的电脑上。当前支持范围与尚未完成的部分见下列文档。

阅读顺序：使用产品先看工作区说明；运行和排错看开发文档；修改实现看架构；准备服务器发布看部署说明。PRD 描述目标范围，研究文档保留当时的候选与证据，不代替当前实现状态。

- [工作区使用说明](workspace.md)：四个一级入口、助手设定、个人菜单、渠道和额度说明。
- [开发与验证](development.md)：启动、配置、测试和未完成范围。
- [当前架构](architecture.md)：模块、配置生效、数据权限、队列与 iLink/QQ 行为。
- [渠道与 Agent 接入方向](channel-agent-gateway.md)：Octop Gateway 的适用范围及用户电脑连接云端的迁移边界。
- [自然回复与个人记忆](memory-and-replies.md)：表达规则、按需记忆、更新与忘记，以及对 IELTS Buddy 的取舍。
- [Docker 部署](deployment.md)：服务器配置、在线迁移与验收步骤。
- [产品需求](PRD.md)：已确认决策及完整首版验收目标。
- [技术与 UI 选型](technical-selection.md)：原始选型与玻璃组件比较，落地差异以架构为准。
- [开源代码调研](research/open-source-review-2026-11-02.md)：Octop、ClawScale、OpeniLink Hub 的代码证据。
- [Magpie 命名与仓库呈现研究](research/magpie-brand-review-2026-11-12.md)：Cloud Puffer 品牌决定前的命名研究与仓库整理依据。
- [QQ 与 DSH 插件调研](research/qq-and-dsh-plugins-2026-11-02.md)：QQ 准入、表情包与自然回复，实施边界及后续外部验收。

仓库操作约定见 [AGENTS.md](../AGENTS.md)，依赖材质许可见 [第三方声明](../THIRD_PARTY_NOTICES.md)。
