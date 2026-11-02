![Cloud Puffer — A little order, a little ease](docs/assets/github-cover.png)

# Cloud Puffer（云上小肥鱼）

**A personal AI assistant for everyday life, across web and chat.**

[简体中文](README.md) · [What works](#project-status) · [Run locally](#run-locally) · [Workspace guide](docs/workspace.md) · [Architecture](docs/architecture.md) · [Roadmap](docs/PRD.md)

Cloud Puffer keeps one conversation, tasks, and personal memory together for each account. It runs as one shared service, without a separate machine for every user.

## Project status

> **Development preview.** You can run the application locally. One WeChat account and a Bailian model have passed local text-chat verification. QQ, production deployment, and long-running reliability still need verification. Private file storage has not been selected. QQ Mail SMTP has been chosen for production email; only local authentication has been verified, not delivery.

Available in this preview:

- A public project homepage with modal sign-in, registration, and password recovery.
- Open email/password registration, email verification, password changes, and session revocation.
- An Apple-inspired glass workspace with four sections — chat, tasks, memories, assistant — and a single, reading-width conversation view.
- Saved assistant name, a single system prompt, and task/memory/sticker switches, applied to the next reply across channels using real account data.
- Persistent tasks and explicit personal memory, with on-demand recall, deduplication, editing, and forgetting through shared web/agent business rules. See the [reply and memory design](docs/memory-and-replies.md) (Chinese).
- One conversation per account, queued model execution, incremental responses, cancellation, tool result records, history pagination, and daily points based on reported tokens.
- A verified administrator can open a small management page from Assistant › Setup to search accounts, view today's points, and adjust individual daily limits.
- An iLink text adapter: QR binding, encrypted credentials, shared polling, durable deduplication, and conservative submission status. The first WeChat reply includes instructions for changing the contact remark and avatar, a cropped guide image, and the avatar image. **One local account passed phone QR binding, text exchange, and web continuation; delivery of the welcome images on a real phone, production use, and long-running behavior remain unverified.**
- A shared official QQ bot adapter for private text chat: one-time account binding, shared conversation/queue, and bounded text/image replies. QQ credentials, permissions, and real-device verification remain pending.
- Natural-language reply guidance and four original built-in stickers for web/QQ, with a per-account opt-out and no consecutive reuse of the same sticker. Reading incoming images and learning a user's writing style are not implemented.

Still planned: scheduled reminders and calendar events, search, notes, private files, document generation/retrieval, broader operational administration, and platform-wide cost limits. A task deadline does **not** currently send a reminder.

## Using the workspace

After sign-in you land on the conversation. Desktop keeps four sections in the sidebar — chat, tasks, memories, assistant; on mobile they live in a drawer opened from the top-left button. Name, system prompt, and capability switches live under **Assistant › Setup** and save automatically as you type; WeChat and QQ binding live under **Assistant › Connections**. Your account, today's points, and sign-out are in the account menu at the bottom of that same sidebar. The default is 100 points per Beijing day: each started 1,000 input tokens costs 1 point, and each started 1,000 output tokens costs 3 points, rounded separately per turn.

Disabling tools does not delete tasks or memory, and manual management remains available. Disabling memory removes its recall and write tools but preserves chat history. Navigation preserves drafts; save configuration before refreshing. See the [workspace guide](docs/workspace.md) (Chinese) for behavior and limits.

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

Tests create and migrate a separate `jojobot_test` database on the local development PostgreSQL server. They use model/network fixtures and local Mailpit, never production credentials. On 2026-11-02, 50 integration checks, type checking, lint, and the production build passed. A separate Bailian call returned real token usage, and the administrator page was checked in a browser. The earlier baseline covered Docker and desktop/mobile viewports; one real WeChat account passed local text exchange. Welcome image sending has only been checked with a network fixture and still needs real-phone delivery verification. See the [verification record](docs/development.md#验证记录) and current limitations.

The stack is Next.js 16, React 19, TypeScript, Tailwind CSS 4, Base UI, AI SDK, Better Auth, Drizzle, PostgreSQL 17, and pg-boss. A single shared worker serves accounts concurrently while ordering each user's turns. No per-user VM/container, Redis, or additional agent framework is required.

Stop the development server before changing dependencies, then restart it. Run production builds separately from the development server. Known repeated-compilation triggers and remedies are recorded in [development troubleshooting](docs/development.md#反复编译或页面刷新).

## Self-hosting and contributing

[Docker deployment](docs/deployment.md) describes a shared Web/Worker/PostgreSQL installation. End users of a future hosted service will not configure providers; self-hosting operators must configure them. File/object storage is not implemented yet.

Start with the [PRD](docs/PRD.md), [architecture](docs/architecture.md), and [contribution conventions](AGENTS.md). Small, complete changes and reproducible bug reports are welcome. The full [documentation index](docs/README.md) includes the original technology and open-source research.

## License

Original project content is licensed under [PolyForm Noncommercial 1.0.0](LICENSE); commercial use requires separate permission. See [NOTICE](NOTICE) for copyright and [third-party notices](THIRD_PARTY_NOTICES.md) for other licenses. Previously published MIT versions retain their original permissions.
