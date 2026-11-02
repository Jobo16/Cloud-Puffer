# Docker 部署

目标为一台现有 Linux 云服务器。当前提供部署配置，并完成本机 Docker 镜像构建与 Web/Worker 启动检查；生产域名、模型供应商、备份和公网接入尚未配置，不能直接视为已上线服务。

## 配置

在服务器创建不入 Git 的 `.env.production`，以 `.env.example` 的变量为基础，替换：

- `POSTGRES_PASSWORD`：另行生成高强度密码，不使用本地开发密码。
- `DATABASE_URL`：`postgresql://jojobot:<URL 编码后的密码>@postgres:5432/jojobot`。
- `BETTER_AUTH_URL`：正式 HTTPS 域名；随机生成 `BETTER_AUTH_SECRET` 和 `CHANNEL_ENCRYPTION_KEY`。
- `DAILY_POINT_LIMIT`：默认每日积分，当前为 100；`ADMIN_EMAIL`：已验证的管理员登录邮箱。
- SMTP：当前托管部署选用 QQ 邮箱 SMTP（`smtp.qq.com`、465、SSL），授权码只放在不入 Git 的私密配置中；本机已验证登录，实际发信与收件待部署验收。不要使用本地 Mailpit。
- 模型：选择并验证支持流式输出/工具调用的供应商，填入服务端配置。
- `ILINK_ENABLED`：完成独立微信账号验证后再启用。一个微信不能被本地与线上同时轮询。
- `QQ_ENABLED`：默认关闭。准备 QQ 开放平台机器人应用后配置 `QQ_APP_ID`、`QQ_APP_SECRET`，可选 `QQ_BOT_URL` 为官方分享页的 HTTPS 链接；重启 Web 和 Worker 后，用户在设置生成绑定指令并发给机器人。凭据由平台维护，不向用户分发。

示例只说明格式，不包含可使用的生产密钥。配置文件限制为维护者可读；加密密钥随加密数据库备份分别安全保存。

`ADMIN_EMAIL` 只指定权限归属，不自动创建账号。部署后用该邮箱完成正常注册与邮箱验证，才会在「助手 › 设定」看到后台入口；其他账号访问 `/app/admin` 或 `/api/admin` 会被拒绝。后台可修改个人每日积分上限，0 暂停新对话。积分按模型报告的 token 事后结算，不能代替全平台成本硬上限。

## 首次启动与后续更新

```sh
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d postgres
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production up -d web worker
```

后续更新也先执行兼容迁移，再更新应用；迁移期间保留已有 Web、Worker 在线，不先 `down`。如果迁移拿不到锁，退出并调查，不增加停服迁移开关。`IMAGE_TAG` 可指定本次发布标识。当前只运行一个共享 Worker，关闭时等待已领取任务结束。

配置工作区依赖 `0002_safe_wallflower.sql`（添加名字、提示词及能力开关）和 `0003_merge_prompt.sql`。`0003` 把原先分开的人设与自定义提示词拼接成 `system_prompt`，随后删除 `persona`、`instructions` 两列，属于非兼容变更：必须在同一次发布窗口内执行迁移并重启 Web 与 Worker，旧进程不能在迁移后继续读写配置。迁移顺序和内容见[开发文档](development.md#数据与模块)。

应用仅映射 `127.0.0.1:3030`，PostgreSQL 不映射主机端口。在现有 HTTPS 反向代理中转发到应用；SSE 路径 `/api/app/events` 关闭响应缓冲，并保留大于 30 秒的读取超时。入口需要合理的请求体与请求速率限制。不得把密钥注入浏览器构建。

## 验收和回退

检查 `/api/health` 与 Worker 的 ready 日志：

```sh
curl --fail http://127.0.0.1:3030/api/health
docker compose --env-file .env.production logs --tail=50 worker
```

再验证注册邮件、登录、助手配置保存/刷新/跨页面同步，以及真实模型工具调用。关闭待办或记忆后，下一轮不能调用对应工具；关闭记忆也不注入记忆库，手动管理仍可用。手机扫码/收发、解绑重绑及网络中断单独验收。健康接口只检查 Web 能访问数据库，不代表模型或渠道可用。

微信首次绑定后，从手机发入第一条私聊消息，检查回复中的欢迎文字、操作示意图和头像图是否依次可见；再发第二条，确认不重复欢迎。扫码确认后尚未发消息时，iLink 没有可用的回复凭证，不以此作为主动推送验收项。图片上传失败时检查文字回复与网页投递状态。

发布前建立数据库备份与恢复演练。`0003` 之前的迁移为新增表及添加有默认值的列；`0003` 删除了两列，回退到旧镜像会因缺列失败，需从备份恢复到相同时点。已应用的迁移不回滚、不改写。旧版 Worker 不识别新增提示词字段或工具开关，回退后的行为应按旧版说明，不能继续声称开关生效。数据库迁移 SQL 与元数据必须随代码保存。

当前尚无对象存储和文件能力；实现上传/生成文档时必须使用私有对象存储，而非容器文件系统。

## QQ 部署后验收

主体认证、公开服务范围与平台权限在部署阶段处理；个体工商户属于官方文档列举的企业开发者类型，实际资格和材料以 [QQ 开放平台](https://bot.q.qq.com/wiki/) 审核为准。本地实现不表示已通过认证或拥有公开/群聊权限。

先在平台允许的测试范围验证：两个账号分别绑定、私聊文本与静态 PNG、同一主对话在网页接续、解绑和重复事件、连续分条回复的次数与窗口、断线重连和 Worker 重启。`accepted` 只代表接口接受，必须另外检查手机/电脑可见性。仅处理被动私聊回复；不使用此适配器承诺定时主动通知。当前未保存跨进程的 QQ 网关会话，停机期间是否补发事件需实测。

镜像包含 `public/stickers` 中的原创公开素材，供网页展示与 Worker 上传；这些素材与未来用户私有文件分开。表情选用和自然语气的质量需用实际模型及用户场景验证，测试替身只证明执行与数据边界。
