![Cloud Puffer — A little order, a little ease](docs/assets/github-cover.png)

# Cloud Puffer（云上小肥鱼）

**A personal AI assistant for everyday life, across web and chat.**

[简体中文](README.md) · [What works](#project-status) · [Run locally](#run-locally) · [Workspace guide](docs/workspace.md) · [Architecture](docs/architecture.md) · [Roadmap](docs/PRD.md)

Cloud Puffer keeps one conversation, tasks, and personal memory together for each account. It runs as one shared service, without a separate machine for every user.

## Project status

> **Development preview.** You can run the application locally. One WeChat account and a Bailian model have passed local text-chat verification. QQ, production deployment, and long-running reliability still need verification. Private file storage and production email providers have not been selected.

Available in this preview:

- A public project homepage with modal sign-in, registration, and password recovery.
- Open email/password registration, email verification, password changes, and session revocation.
- An Apple-inspired glass workspace with four sections — chat, tasks, memories, assistant — and a single, reading-width conversation view.
- Saved assistant name, a single system prompt, and task/memory/sticker switches, applied to the next reply across channels using real account data.
- Persistent tasks and explicit personal memory, editable from the web or through agent tools.
- One conversation per account, queued model execution, incremental responses, cancellation, tool result records, history pagination, and daily message limits.
- An iLink text adapter: QR binding, encrypted credentials, shared polling, durable deduplication, and conservative submission status. **One local account passed phone QR binding, text exchange, and web continuation; production and long-running behavior remain unverified.**
- A shared official QQ bot adapter for private text chat: one-time account binding, shared conversation/queue, and bounded text/image replies. QQ credentials, permissions, and real-device verification remain pending.
- Natural-language reply guidance and four original built-in stickers for web/QQ, with a per-account opt-out and no consecutive reuse of the same sticker. Reading incoming images and learning a user's writing style are not implemented.

Still planned: scheduled reminders and calendar events, search, notes, private files, document generation/retrieval, operational administration, and platform-wide cost limits. A task deadline does **not** currently send a reminder.

## Using the workspace

After sign-in you land on the conversation. Desktop keeps four sections in the sidebar — chat, tasks, memories, assistant; on mobile they live in a drawer opened from the top-left button. Name, system prompt, and capability switches live under **Assistant › Setup** and save automatically as you type; WeChat and QQ binding live under **Assistant › Connections**. Your account, today's usage, and sign-out are in the account menu at the bottom of that same sidebar.

Disabling tools does not delete tasks or memory, and manual management remains available. Disabling memory stops memory-library injection but preserves chat history. Navigation preserves drafts; save configuration before refreshing. See the [workspace guide](docs/workspace.md) (Chinese) for behavior and limits.

## Run locally

Requires Node.js 24, pnpm 10.30.3, and Docker Compose.

```sh
pnpm install --frozen-lockfile
pnpm run dev:setup
pnpm infra
pnpm db:migrate
pnpm dev
```

In another terminal:

```sh
pnpm worker
```

Open [localhost:3030](http://localhost:3030). Verification/reset messages go to the local [Mailpit inbox](http://localhost:18025); they are not sent to the internet. Registration does not require an invitation code. `dev:setup` preserves an existing `.env` and generates private secrets only when the file is absent.

The default configuration has **no model connection**. Tasks and memory work without one; chatting reports that the model is unavailable. Configure `MODEL_BASE_URL`, `MODEL_API_KEY`, and `MODEL_NAME` in `.env` for an OpenAI-compatible chat-completions provider that supports streaming and tool calls, then restart Web and Worker. Local text replies have been verified with Bailian `qwen3.8-flash`; the full tool-call path still needs verification.

WeChat is disabled by default. Set `ILINK_ENABLED=true` to begin integration testing with a separate test WeChat account. Do not connect the same account to two deployments. An accepted API submission is not proof of delivery or reading; uncertain sends are not automatically retried.

QQ is also disabled by default. After deployment preparation, set `QQ_ENABLED`, `QQ_APP_ID`, and `QQ_APP_SECRET` for a platform-owned QQ bot; `QQ_BOT_URL` optionally links to its sharing page. Users bind from Settings by privately sending the one-time command to that bot. See [QQ and DSH plugin research](docs/research/qq-and-dsh-plugins-2026-11-02.md) and [deployment requirements](docs/deployment.md). No DSH plugin runtime is installed.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Tests create and migrate a separate `jojobot_test` database on the local development PostgreSQL server. They use model/network fixtures and local Mailpit, never production credentials. On 2026-11-02, 37 integration checks, type checking, lint, production and Docker builds passed, alongside desktop/mobile viewport checks. A separate local check used a Bailian model and one real WeChat account for text exchange. See the [verification record](docs/development.md#验证记录) and current limitations.

The stack is Next.js 16, React 19, TypeScript, Tailwind CSS 4, Base UI, AI SDK, Better Auth, Drizzle, PostgreSQL 17, and pg-boss. A single shared worker serves accounts concurrently while ordering each user's turns. No per-user VM/container, Redis, or additional agent framework is required.

Stop the development server before changing dependencies, then restart it. Run production builds separately from the development server. Known repeated-compilation triggers and remedies are recorded in [development troubleshooting](docs/development.md#反复编译或页面刷新).

## Self-hosting and contributing

[Docker deployment](docs/deployment.md) describes a shared Web/Worker/PostgreSQL installation. End users of a future hosted service will not configure providers; self-hosting operators must configure them. File/object storage is not implemented yet.

Start with the [PRD](docs/PRD.md), [architecture](docs/architecture.md), and [contribution conventions](AGENTS.md). Small, complete changes and reproducible bug reports are welcome. The full [documentation index](docs/README.md) includes the original technology and open-source research.

## License

[MIT](LICENSE). Copyright © 2026 JOBO. See [third-party notices](THIRD_PARTY_NOTICES.md) for the adapted glass material and dependency licenses.
