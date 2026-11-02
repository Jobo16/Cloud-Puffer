# Docker 部署

托管开发预览运行在 `https://fish.jobo.ink`：服务器 `/opt/apps/jojobot/repo` 检出 `main`，Docker Compose 运行 Web、共享 Worker 和 PostgreSQL，Caddy 将 HTTPS 转发到 `127.0.0.1:3030`。私密配置在仓库目录的 `.env.production`，不入 Git；首次数据库备份保存在 `/opt/stacks/jojobot/initial.dump`（权限 0600），已在独立临时库恢复验证。定期异地加密备份尚未配置。

## 配置

在服务器创建不入 Git 的 `.env.production`，以 `.env.example` 的变量为基础，替换：

- `POSTGRES_PASSWORD`：另行生成高强度密码，不使用本地开发密码。
- `DATABASE_URL`：`postgresql://jojobot:<URL 编码后的密码>@postgres:5432/jojobot`。
- `BETTER_AUTH_URL`：正式 HTTPS 域名；随机生成 `BETTER_AUTH_SECRET` 和 `CHANNEL_ENCRYPTION_KEY`。
- `DAILY_POINT_LIMIT`：默认每日积分，当前为 1000；`ADMIN_EMAIL`：已验证的管理员登录邮箱。
- `IMAGE_TAG`：当前运行的应用镜像标记；每次构建和启动使用同一标记。
- SMTP：当前托管部署选用 QQ 邮箱 SMTP（`smtp.qq.com`、465、SSL），授权码只放在不入 Git 的私密配置中；生产注册邮件已送到管理员邮箱并完成验证。不要使用本地 Mailpit。
- 模型：选择并验证支持流式输出/工具调用的供应商，填入服务端配置。
- 对支持隐式前缀缓存的模型，应用会保持系统提示词及历史消息稳定并限制历史长度；模型是否命中以 `runs.cache_read_tokens` 和 Worker 的 `model_usage` 日志为准。缓存命中的 token 仍属于输入积分，不改变用户的换算比例。
- `ILINK_ENABLED`：线上已开启扫码接入，手机扫码与基础文字收发已验收。同一微信不能由本地与线上同时轮询，因此本地开发环境已关闭 iLink 轮询。
- `QQ_ENABLED`：默认关闭。准备 QQ 开放平台机器人应用后配置 `QQ_APP_ID`、`QQ_APP_SECRET`，可选 `QQ_BOT_URL` 为官方分享页的 HTTPS 链接；重启 Web 和 Worker 后，用户在设置生成绑定指令并发给机器人。凭据由平台维护，不向用户分发。

示例只说明格式，不包含可使用的生产密钥。配置文件限制为维护者可读；后续建立异地加密备份时，备份密钥与备份文件分别保存。

`ADMIN_EMAIL` 只指定权限归属，不自动创建账号。部署后用该邮箱完成正常注册与邮箱验证，才会在「助手 › 设定」看到后台入口；其他账号访问 `/app/admin` 或 `/api/admin` 会被拒绝。后台可修改个人每日积分上限，0 暂停新对话。积分按模型报告的 token 事后结算，不能代替全平台成本硬上限。

## 固定发布流程

镜像从国内的 `docker.1ms.run` 拉取 Node.js 和 PostgreSQL 基础镜像，依赖通过 `registry.npmmirror.com` 下载；这两个镜像源只用于本项目，不修改服务器上其他项目的 Docker 配置。

首次发布时服务器到 GitHub 的连接和国内镜像站的镜像层下载中断：本地已推送的同一提交通过 Git bundle 放入服务器 Git 检出，基础镜像从国内源取得 amd64 版本后导入服务器，再在服务器执行 Docker 构建。服务器检出目录须保持干净；后续优先从 `origin/main` 快进拉取，若网络仍不可用，可用已推送提交的 Git bundle 快进，不同步未提交文件。生产密钥仅传入受限的 `.env.production`。

本地先完成 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`，确认工作区无未提交修改，再提交并推送 `main`。服务器检出目录必须干净，快进到该提交后执行项目脚本：

```sh
ssh server-renovation 'cd /opt/apps/jojobot/repo && git fetch origin main && git merge --ff-only FETCH_HEAD && ./scripts/deploy-server.sh'
```

服务器无法访问 GitHub 时，从**已推送的**本地 `main` 制作 Git bundle，然后仍在服务器快进并运行同一脚本：

```sh
git bundle create .local/jojobot-deploy.bundle main
scp .local/jojobot-deploy.bundle server-renovation:/opt/stacks/jojobot/deploy.bundle
ssh server-renovation 'cd /opt/apps/jojobot/repo && git bundle verify /opt/stacks/jojobot/deploy.bundle && git fetch /opt/stacks/jojobot/deploy.bundle main && git merge --ff-only FETCH_HEAD && ./scripts/deploy-server.sh'
```

`deploy-server.sh` 加独占锁、检查干净的 `main` 和至少 4 GiB 空间，以提交短哈希构建并检查运行镜像；启动 PostgreSQL 后保存权限 0600 的迁移前备份，再执行兼容迁移、切换 Web/Worker，并检查本机及公网健康接口。脚本成功后才删除本项目除当前版和上一版以外的镜像，最后将**共享** Docker 构建缓存收敛到最多 3 GB、保留至少 2 GB；这可能让其他项目下次构建变慢，但不会删除容器、数据库卷、用户文件或备份。不要使用 `docker system prune --volumes` 或 `docker compose down -v`。备份不自动轮删，需另行建立异地加密备份和保留策略。

迁移期间保留已有 Web、Worker 在线，不先 `down`。如果迁移拿不到锁，退出并调查，不增加停服迁移开关。`IMAGE_TAG` 在成功切换前写入私密配置；发布失败时不清理旧镜像，先排查，再按迁移兼容性决定是否切回上一版。当前只运行一个共享 Worker，关闭时等待已领取任务结束。

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

2026-11-02 首次托管验收：`/api/health` 在服务器本机及 HTTPS 域名均返回 ready；Worker 就绪；生产管理员邮箱完成注册与验证，登录后 `/api/admin` 和 `/app/admin` 均返回 200，默认每日额度为 1000 分。独立临时账号完成两轮真实模型回复，第二轮报告输入 3505 token，其中缓存命中 3072 token；临时账号随后删除。尚未验证 QQ、微信生产渠道、完整模型工具调用与长期运行。

同日后续微信验收：用户确认手机扫码和基础文字收发正常；生产库有一个 `connected` 微信连接，8 轮微信消息均已完成且提交接口返回 `accepted`。手机确认只覆盖这次基础文字场景，欢迎图片实际送达、断线恢复和长期稳定性仍待验收。

## QQ 部署后验收

主体认证、公开服务范围与平台权限在部署阶段处理；个体工商户属于官方文档列举的企业开发者类型，实际资格和材料以 [QQ 开放平台](https://bot.q.qq.com/wiki/) 审核为准。本地实现不表示已通过认证或拥有公开/群聊权限。

先在平台允许的测试范围验证：两个账号分别绑定、私聊文本与静态 PNG、同一主对话在网页接续、解绑和重复事件、连续分条回复的次数与窗口、断线重连和 Worker 重启。`accepted` 只代表接口接受，必须另外检查手机/电脑可见性。仅处理被动私聊回复；不使用此适配器承诺定时主动通知。当前未保存跨进程的 QQ 网关会话，停机期间是否补发事件需实测。

镜像包含 `public/stickers` 中的原创公开素材，供网页展示与 Worker 上传；这些素材与未来用户私有文件分开。表情选用和自然语气的质量需用实际模型及用户场景验证，测试替身只证明执行与数据边界。
