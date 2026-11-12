"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Brain,
  Code2,
  ListTodo,
  MessagesSquare,
  SlidersHorizontal,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { SiteLanguage } from "@/lib/site-language";
import { Button, Mark, Modal } from "./ui";
import { AuthForm } from "./login";
import { ThemeToggle } from "./theme-toggle";
import { LanguageProvider } from "./language";

const repository = "https://github.com/Jobo16/Cloud-Puffer";
const copy = {
  zh: {
    brand: "Cloud Puffer",
    navigation: "页面导航",
    capabilitiesLink: "能力",
    progressLink: "进度",
    account: "我的空间",
    login: "登录 / 注册",
    accountShort: "空间",
    loginShort: "登录",
    heroTop: "你的对话，",
    heroBottom: "都有去处。",
    intro:
      "从网页开始，在已接入的聊天渠道接着聊。让云端助手帮你记事，或连接自己电脑上的 Codex、OpenClaw。",
    enter: "进入工作区",
    start: "开始使用",
    source: "查看源代码",
    previewLabel: "产品界面示意",
    previewName: "小肥鱼",
    demoUser: "帮我记下周五前交材料",
    demoReply: "记下了，需要时我会帮你找到。",
    demoTask: "周五前交材料",
    demoTag: "事项",
    capabilitiesTitle: "一个账号，接住每个入口",
    capabilities: [
      {
        icon: MessagesSquare,
        title: "接续对话",
        body: "网页与已绑定渠道共用主对话。消息和结果按账号保存。",
      },
      {
        icon: ListTodo,
        title: "事项与记忆",
        body: "把明确交代的事记为事项，把需要长期保留的偏好存为记忆。",
      },
      {
        icon: SlidersHorizontal,
        title: "选择运行位置",
        body: "使用云端助手，或在自己的电脑上连接 Codex、OpenClaw 开发预览。",
      },
      {
        icon: Brain,
        title: "自己掌握资料",
        body: "在工作区查看、编辑和删除事项与记忆，调整助手设定。",
      },
    ],
    statusTitle: "当前进度",
    statusIntro: "项目仍在开发预览阶段。功能范围与验证状态持续更新。",
    status: [
      {
        title: "已实现",
        body: "账号、网页对话、事项、记忆、助手设定，以及微信、QQ、Telegram 的接入代码。",
      },
      {
        title: "仍在验证",
        body: "微信基础文字收发已验证；QQ、Telegram 实机、渠道长期稳定性与本地 Agent 全链路仍需验证。",
      },
      {
        title: "尚未提供",
        body: "定时提醒、日程、联网搜索，以及用户文件与文档能力。",
      },
    ],
    openSourceTitle: "开源，也可以自己部署",
    openSourceBody:
      "源码、使用说明和部署流程都在 GitHub。服务端按账号隔离对话与资料。",
    docs: "阅读文档",
    footer: "开源开发预览 · 由 JOBO 维护",
    issues: "问题反馈",
    license: "MIT 许可",
    authTitle: "Cloud Puffer 账号",
    language: "English",
    languageLabel: "Switch to English",
  },
  en: {
    brand: "Cloud Puffer",
    navigation: "Page navigation",
    capabilitiesLink: "Features",
    progressLink: "Progress",
    account: "My workspace",
    login: "Log in / Sign up",
    accountShort: "Open",
    loginShort: "Log in",
    heroTop: "One conversation,",
    heroBottom: "wherever you start.",
    intro:
      "Start on the web and continue through a connected chat channel. Let Cloud Puffer keep track of tasks and memory, or connect Codex or OpenClaw on your own computer.",
    enter: "Open workspace",
    start: "Get started",
    source: "View source",
    previewLabel: "Product preview",
    previewName: "Cloud Puffer",
    demoUser: "Remind me to submit the forms by Friday",
    demoReply: "Saved. You can find it here whenever you need it.",
    demoTask: "Submit the forms by Friday",
    demoTag: "Task",
    capabilitiesTitle: "One account across your channels",
    capabilities: [
      {
        icon: MessagesSquare,
        title: "Continue a conversation",
        body: "The web and linked channels share one conversation, saved under your account.",
      },
      {
        icon: ListTodo,
        title: "Tasks and memory",
        body: "Save explicit requests as tasks and lasting preferences as memory.",
      },
      {
        icon: SlidersHorizontal,
        title: "Choose where it runs",
        body: "Use the cloud assistant or connect Codex or OpenClaw on your computer in the development preview.",
      },
      {
        icon: Brain,
        title: "Stay in control",
        body: "Review, edit, and delete tasks and memories, and change your assistant settings.",
      },
    ],
    statusTitle: "Current progress",
    statusIntro:
      "This project is a development preview. Features and verification status are updated as work continues.",
    status: [
      {
        title: "Implemented",
        body: "Accounts, web chat, tasks, memory, assistant settings, and WeChat, QQ, and Telegram integration code.",
      },
      {
        title: "Being verified",
        body: "Basic WeChat text messaging has been checked. QQ and Telegram device testing, long-term channel reliability, and the full local-agent flow still need verification.",
      },
      {
        title: "Not available yet",
        body: "Scheduled reminders, calendar events, web search, user files, and document features.",
      },
    ],
    openSourceTitle: "Open source and self-hostable",
    openSourceBody:
      "Source code, usage guides, and deployment instructions are on GitHub. Conversations and personal data are separated by account.",
    docs: "Read the docs",
    footer: "Open-source development preview · Maintained by JOBO",
    issues: "Report an issue",
    license: "MIT license",
    authTitle: "Cloud Puffer account",
    language: "中文",
    languageLabel: "切换到中文",
  },
} as const;

export function Landing({
  language,
  openAuth,
  token,
  linkError,
}: {
  language: SiteLanguage;
  openAuth: boolean;
  token?: string;
  linkError: boolean;
}) {
  const c = copy[language];
  const [login, setLogin] = useState(openAuth);
  const { data: session } = authClient.useSession();
  const enter = () => {
    if (session?.user.emailVerified && !token) window.location.assign("/app");
    else setLogin(true);
  };
  return (
    <LanguageProvider language={language}>
      <div className="landing-page">
        <header className="landing-nav glass">
          <Link className="wordmark" href={language === "en" ? "/en" : "/"}>
            <Mark />
            <span>{c.brand}</span>
          </Link>
          <nav aria-label={c.navigation}>
            <a className="nav-link" href="#what">
              {c.capabilitiesLink}
            </a>
            <a className="nav-link" href="#status">
              {c.progressLink}
            </a>
            <a
              className="nav-link nav-github"
              href={repository}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
            >
              <Code2 size={16} />
              <span>GitHub</span>
            </a>
            <a
              className="language-link"
              href={language === "en" ? "/" : "/en"}
              hrefLang={language === "en" ? "zh-CN" : "en"}
              aria-label={c.languageLabel}
            >
              {c.language}
            </a>
            <ThemeToggle language={language} />
            <span className="nav-divider" aria-hidden="true" />
            <Button className="primary" onClick={enter}>
              <span className="nav-auth-full">
                {session?.user.emailVerified ? c.account : c.login}
              </span>
              <span className="nav-auth-short">
                {session?.user.emailVerified ? c.accountShort : c.loginShort}
              </span>
              <ArrowUpRight size={15} />
            </Button>
          </nav>
        </header>
        <main>
          <section className="landing-hero">
            <div className="hero-lede">
              <h1>
                {c.heroTop}
                <br />
                <span>{c.heroBottom}</span>
              </h1>
              <p>{c.intro}</p>
              <div className="hero-actions">
                <Button className="primary" onClick={enter}>
                  {session?.user.emailVerified ? c.enter : c.start}
                </Button>
                <a
                  className="text-link"
                  href={repository}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.source}
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </div>
            <figure className="hero-demo glass" aria-label={c.previewLabel}>
              <div className="demo-head">
                <Mark />
                <span>{c.previewName}</span>
              </div>
              <div className="demo-thread">
                <p className="demo-bubble">{c.demoUser}</p>
                <p className="demo-said">{c.demoReply}</p>
                <div className="demo-task">
                  <span className="demo-check" />
                  <span>{c.demoTask}</span>
                  <em>{c.demoTag}</em>
                </div>
              </div>
            </figure>
          </section>
          <section className="landing-block" id="what">
            <h2>{c.capabilitiesTitle}</h2>
            <div className="landing-capabilities">
              {c.capabilities.map(({ icon: Icon, title, body }) => (
                <article className="landing-capability" key={title}>
                  <Icon size={18} />
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className="status-panel" id="status">
            <h2>{c.statusTitle}</h2>
            <p>{c.statusIntro}</p>
            <div className="status-grid">
              {c.status.map(({ title, body }) => (
                <div className="status-col" key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="landing-block landing-os" id="open-source">
            <h2>{c.openSourceTitle}</h2>
            <p>{c.openSourceBody}</p>
            <a
              className="text-link"
              href={`${repository}/blob/main/${language === "en" ? "README.en.md" : "docs/README.md"}`}
              target="_blank"
              rel="noreferrer"
            >
              {c.docs}
              <ArrowUpRight size={15} />
            </a>
          </section>
        </main>
        <footer className="site-footer">
          <div className="footer-bottom">
            <p>
              © 2026 {c.brand}
              <span aria-hidden="true">·</span>
              {c.footer}
            </p>
            <div className="footer-links">
              <a href={`${repository}/issues`} target="_blank" rel="noreferrer">
                {c.issues}
              </a>
              <a
                href={`${repository}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer"
              >
                {c.license}
              </a>
              <a
                className="footer-icon"
                href={repository}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub repository"
              >
                <Code2 size={16} />
              </a>
            </div>
          </div>
          <div className="footer-legal">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
            >
              浙ICP备2025148802号-3
            </a>
            <a
              className="footer-police"
              href="https://beian.mps.gov.cn/#/query/webSearch?code=33010602015015"
              target="_blank"
              rel="noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/police-beian.png" alt="" width={14} height={14} />
              浙公网安备33010602015015号
            </a>
          </div>
        </footer>
        {login && (
          <Modal
            title={c.authTitle}
            bare
            onClose={() => {
              setLogin(false);
              if (openAuth)
                window.history.replaceState(
                  null,
                  "",
                  language === "en" ? "/en" : "/",
                );
            }}
          >
            <AuthForm language={language} token={token} linkError={linkError} />
          </Modal>
        )}
      </div>
    </LanguageProvider>
  );
}
