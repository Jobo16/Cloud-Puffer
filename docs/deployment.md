# Docker 部署

目标为一台现有 Linux 云服务器。当前提供部署配置；生产域名、供应商、备份和公网接入尚未配置，不能直接视为已上线服务。

## 配置

在服务器创建不入 Git 的 `.env.production`，以 `.env.example` 的变量为基础，替换：

- `POSTGRES_PASSWORD`：另行生成高强度密码，不使用本地开发密码。
- `DATABASE_URL`：`postgresql://jojobot:<URL 编码后的密码>@postgres:5432/jojobot`。
- `BETTER_AUTH_URL`：正式 HTTPS 域名；随机生成 `BETTER_AUTH_SECRET` 和 `CHANNEL_ENCRYPTION_KEY`。
- SMTP：正式发信服务；不要使用本地 Mailpit。
- 模型：选择并验证支持流式输出/工具调用的供应商，填入服务端配置。
- `ILINK_ENABLED`：完成独立微信账号验证后再启用。一个微信不能被本地与线上同时轮询。
- `QQ_ENABLED`：默认关闭。准备 QQ 开放平台机器人应用后配置 `QQ_APP_ID`、`QQ_APP_SECRET`，可选 `QQ_BOT_URL` 为官方分享页的 HTTPS 链接；重启 Web 和 Worker 后，用户在设置生成绑定指令并发给机器人。凭据由平台维护，不向用户分发。

示例只说明格式，不包含可使用的生产密钥。配置文件限制为维护者可读；加密密钥随加密数据库备份分别安全保存。

## 首次启动与后续更新

```sh
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d postgres
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production up -d web worker
```

后续更新也先执行兼容迁移，再更新应用；迁移期间保留已有 Web、Worker 在线，不先 `down`。如果迁移拿不到锁，退出并调查，不增加停服迁移开关。`IMAGE_TAG` 可指定本次发布标识。当前只运行一个共享 Worker，关闭时等待已领取任务结束。

应用仅映射 `127.0.0.1:3030`，PostgreSQL 不映射主机端口。在现有 HTTPS 反向代理中转发到应用；SSE 路径 `/api/app/events` 关闭响应缓冲，并保留大于 30 秒的读取超时。入口需要合理的请求体与请求速率限制。不得把密钥注入浏览器构建。

## 验收和回退

检查 `/api/health` 与 `docker compose ... logs worker` 的 ready 信息，再验证注册邮件、登录、真实模型工具调用、手机扫码/收发、解绑重绑及网络中断。健康接口只检查 Web 能访问数据库，不代表外部服务可用。

发布前建立数据库备份与恢复演练。当前变更为新增表；应用回退到兼容旧镜像，不回滚或删除已经应用的迁移。数据库迁移 SQL 与元数据必须随代码保存。

当前尚无对象存储和文件能力；实现上传/生成文档时必须使用私有对象存储，而非容器文件系统。

## QQ 部署后验收

主体认证、公开服务范围与平台权限在部署阶段处理；个体工商户属于官方文档列举的企业开发者类型，实际资格和材料以 [QQ 开放平台](https://bot.q.qq.com/wiki/) 审核为准。本地实现不表示已通过认证或拥有公开/群聊权限。

先在平台允许的测试范围验证：两个账号分别绑定、私聊文本与静态 PNG、同一主对话在网页接续、解绑和重复事件、连续分条回复的次数与窗口、断线重连和 Worker 重启。`accepted` 只代表接口接受，必须另外检查手机/电脑可见性。仅处理被动私聊回复；不使用此适配器承诺定时主动通知。当前未保存跨进程的 QQ 网关会话，停机期间是否补发事件需实测。

镜像包含 `public/stickers` 中的原创公开素材，供网页展示与 Worker 上传；这些素材与未来用户私有文件分开。表情选用和自然语气的质量需用实际模型及用户场景验证，测试替身只证明执行与数据边界。
