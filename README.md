# JOJOBOT

**Your personal AI agent on the web and WeChat.**

English | [简体中文](README.zh-CN.md)

JOJOBOT is an open-source personal AI agent designed for everyday tasks: keeping track of plans, organizing information, remembering your preferences, and working with documents.

The hosted service is designed for open registration with no invitation code. Users can sign up and start using their agent without configuring models or deploying servers. One shared cloud service supports multiple users, each with their own private data and conversation.

## Project status

**Product planning.** This repository currently contains product requirements, source-code research, and a proposed technology stack. Application code, a runnable release, and deployment instructions are not yet available. The features below describe the planned first release.

## Planned first release

- **One conversation across the web and WeChat.** Continue a WeChat conversation in your browser with the same context, memories, tasks, and files.
- **Tasks, schedules, and reminders.** Create, update, and manage everyday plans through conversation.
- **Search and information organization.** Find information with sources and save useful notes and links.
- **Personal memory.** Ask the agent to remember preferences; review, change, or delete them.
- **Files and documents.** Work with personal files, ask questions about them, and generate documents to download.
- **Open registration.** Email and password accounts, with platform-provided models and usage limits during the initial free trial.
- **Apple-inspired glass interface.** A responsive web UI built from reusable components, with clear reading surfaces for conversations and documents.

The first release uses predefined tools and APIs. It does not require a dedicated server or a continuously running container for each user. Additional messaging channels and external app connections are planned for later releases.

## WeChat integration

WeChat connects through iLink. After signing in on the web, users scan a QR code to connect their own ClawBot conversation.

Replies return to the channel where a request started, while the web shows the full conversation. Reminders are always recorded on the web. If WeChat cannot accept a notification, its status is shown explicitly; an API acceptance is not presented as proof of delivery or reading.

## Hosted use and self-hosting

No setup or deployment is required for end users of the planned hosted service. Developers who choose to self-host will need to configure the runtime, model access, storage, and channel credentials. Setup instructions will be added with the implementation.

## Documentation

- [Product requirements](docs/PRD.md) — scope, product decisions, and acceptance criteria (Chinese).
- [Technology and UI selection](docs/technical-selection.md) — proposed stack, shared cloud architecture, and glass UI component comparison (Chinese).
- [Open-source code review](docs/research/open-source-review-2026-11-02.md) — findings from Octop, ClawScale, and OpeniLink Hub, with pinned source references (Chinese).

## Contributing

Feedback on the product requirements and implementation proposals is welcome. Start with the PRD to understand the first-release scope. Development and testing instructions will be added when application code is available.

## License

[MIT](LICENSE). Copyright © 2026 JOBO.
