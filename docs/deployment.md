# 部署与发布

Cloud Puffer 运行在首尔服务器 `119.28.238.248`。正式站点为 <https://puffer.jobo.ink>，预发布站点为 <https://staging.puffer.jobo.ink>。Cloudflare 托管 DNS，两个记录均指向首尔服务器且为「仅 DNS」；Caddy 签发 HTTPS 证书，并将流量转发到仅监听本机的 Web 容器。服务器只拉取 GitHub Actions 构建的镜像，不在服务器上构建源码。

## 开发与发布

1. 从功能分支提交 PR；PR 执行类型检查、Lint、测试与构建。测试使用独立的 `jojobot_test` 数据库。
2. push 到 `main` 后，同样的检查通过才构建容器镜像，推送到 GitHub Container Registry，并自动发布到 staging。发布记录保存精确的镜像 digest 与 Git 提交。
3. 验证 staging 后，在 GitHub Actions 手动运行 **Release production** 工作流。它要求 staging 的提交等于当前 `main`，并将 staging 已验证的镜像 digest 发布到生产；不重新构建。

staging 使用独立的 PostgreSQL 数据卷、认证和加密密钥，连接真实模型，关闭微信 iLink、QQ、Telegram。入口有单独的 HTTP 基本认证；测试账号和数据不会复制到生产。不要在 staging 使用生产账号或真实个人资料。生产保留原数据库、认证密钥和微信连接，迁移时从旧服务器做最终备份后恢复。模型和 SMTP 凭据只保存在服务器的私密配置中，不进入仓库或 GitHub Actions。

GitHub Actions 通过仓库密钥 `DEPLOY_SSH_KEY` 使用专用 `deploy` 账号登录。服务器主机公钥固定在 `deploy/known_hosts`。镜像拉取使用该次工作流的短期 `GITHUB_TOKEN`；服务器不保存 GitHub 长期令牌。生产发布可在 GitHub Environments 的 `production` 中配置审批人。

## 服务器布局

| 路径 | 内容 |
| --- | --- |
| `/opt/cloud-puffer/compose.yml`、`deploy.sh` | 从已提交版本上传的编排与发布脚本 |
| `/opt/cloud-puffer/staging/.env` | staging 私密配置，Web 端口 3031 |
| `/opt/cloud-puffer/production/.env` | 生产私密配置，Web 端口 3030 |
| `*/.release` | 当前镜像 digest 和 Git 提交 |
| `*/backups/*.dump` | 后续发布前的 PostgreSQL 自定义格式备份 |

两个 `.env` 均只有 `deploy` 可读。以 `.env.example` 的应用变量为基础，另加 `POSTGRES_PASSWORD`、`COMPOSE_PROJECT_NAME`、`WEB_PORT`。`DATABASE_URL` 指向 Compose 网络内的 `postgres:5432/jojobot`。应用密钥至少满足配置校验要求。`ADMIN_EMAIL` 仅指定管理员账号邮箱，不创建用户。健康接口 `/api/health` 只验证 Web 与数据库，不验证模型、邮件或渠道。

发布脚本先拉取指定 digest，启动数据库，对现有数据库做备份，然后执行迁移、更新 Web 和 Worker，并检查本机健康接口及 Worker 就绪日志。它不会删除数据库卷或备份。发布后应验证公网 HTTPS、登录、真实模型回复，以及生产渠道的实际收发。iLink 同一连接只能由一个 Worker 轮询；迁移时先停止旧 Worker，再启动新 Worker。

回退时从服务器 `*/.release` 或 GitHub Actions 记录找到上一镜像 digest，检查数据库迁移是否兼容，随后用对应镜像重新发布。若迁移不兼容，先从同一时间点的数据库备份恢复。不要直接回退旧镜像并继续写入新结构数据库。备份目前保存在同一服务器；异地加密备份仍待建立。

首次托管验证曾完成管理员邮件、登录、两轮真实模型回复及微信基础文字收发。QQ 实机收发、微信长期可靠性、完整模型工具调用和持续负载仍待验收。当前尚无对象存储或用户文件上传能力。
