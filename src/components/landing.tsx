"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  Check,
  Code2,
  Globe,
  Heart,
  ListTodo,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button, Mark, Modal } from "./ui";
import { AuthForm } from "./login";

const repository = "https://github.com/Jobo16/JOJOBOT";
export function Landing({
  openAuth,
  token,
  linkError,
}: {
  openAuth: boolean;
  token?: string;
  linkError: boolean;
}) {
  const [login, setLogin] = useState(openAuth);
  const { data: session } = authClient.useSession();
  const enter = () => {
    if (session?.user.emailVerified && !token) window.location.assign("/app");
    else setLogin(true);
  };
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link className="wordmark" href="/">
          <Mark />
          <span>JOJOBOT</span>
        </Link>
        <nav aria-label="项目导航">
          <a className="landing-nav-link" href="#possibilities">
            能做什么
          </a>
          <a className="landing-nav-link" href="#open-source">
            为什么开源
          </a>
          <a
            className="github-link"
            href={repository}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 仓库"
          >
            <Code2 size={19} />
            <span>GitHub</span>
          </a>
          <Button className="primary" onClick={enter}>
            {session?.user.emailVerified ? "我的空间" : "登录 / 注册"}
            <ArrowUpRight size={16} />
          </Button>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <a
              className="release-pill glass"
              href={`${repository}#project-status`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="status-dot" />
              开源 · 开发预览版
              <ArrowUpRight size={13} />
            </a>
            <h1>
              生活很满，
              <br />
              心里留点<span>空白。</span>
            </h1>
            <p>
              一个随时在的个人 AI 助手。
              <br />
              记下小事，理清思路，在熟悉的地方接着聊。
            </p>
            <div className="hero-actions">
              <Button className="primary" onClick={enter}>
                进入我的空间
                <ArrowRight size={17} />
              </Button>
              <a
                className="text-link"
                href={repository}
                target="_blank"
                rel="noreferrer"
              >
                看看源代码
                <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="hero-principles">
              <span>
                <Check size={14} />
                开放注册
              </span>
              <span>
                <Check size={14} />
                MIT 开源
              </span>
              <span>
                <Check size={14} />
                为日常而生
              </span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-halo" />
            <div className="personal-card glass">
              <span className="eyebrow">A LITTLE SPACE, JUST FOR YOU</span>
              <div className="art-mark">
                <Mark large />
              </div>
              <span className="art-title">你好，我是 JOJO。</span>
              <p>想到什么，慢慢说。</p>
              <div className="art-card-bottom">
                <span>YOUR PERSONAL AGENT</span>
                <Heart size={15} />
              </div>
            </div>
            <div className="floating-note note-tasks glass">
              <ListTodo size={19} />
              <span>琐事，有个落点。</span>
            </div>
            <div className="floating-note note-memory glass">
              <Brain size={19} />
              <span>偏好，值得被记住。</span>
            </div>
            <div className="floating-note note-chat glass">
              <MessageCircle size={19} />
              <span>想法，随时接着聊。</span>
            </div>
          </div>
        </section>
        <section className="landing-features" id="possibilities">
          <div className="landing-section-title">
            <span className="eyebrow">LESS TO JUGGLE. MORE ROOM TO LIVE.</span>
            <h2>
              把小事安顿好，
              <br className="mobile-only" />
              把时间还给生活。
            </h2>
            <p>从对话、待办和记忆开始，慢慢成为更懂你的助手。</p>
          </div>
          <div className="feature-grid">
            {[
              {
                icon: MessageCircle,
                number: "01",
                title: "想到，就说出来。",
                body: "聊一个想法，梳理一件事。对话保存在自己的空间，随时回来继续。",
              },
              {
                icon: ListTodo,
                number: "02",
                title: "小事，也有着落。",
                body: "记下待办、补充说明、标记完成。可以自己整理，也可以交给接入模型后的 JOJO。",
              },
              {
                icon: Brain,
                number: "03",
                title: "懂你，由你决定。",
                body: "明确告诉 JOJO 要记住什么。偏好和记忆可以查看、修改，也可以随时忘记。",
              },
            ].map(({ icon: Icon, number, title, body }) => (
              <article className="feature-card" key={number}>
                <div className="row spread">
                  <span className="feature-icon">
                    <Icon size={23} />
                  </span>
                  <span className="feature-number">{number}</span>
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="channel-banner glass">
          <div className="channel-symbols">
            <span>
              <Globe size={27} />
            </span>
            <span className="channel-line" />
            <span>
              <Smartphone size={27} />
            </span>
          </div>
          <div>
            <span className="eyebrow">ONE JOJO. WHEREVER YOU ARE.</span>
            <h2>一个助手，不止一个聊天窗口。</h2>
            <p>
              网页与微信 iLink
              共用一条主对话。接入适配已开始，微信实机验证进行中；更多渠道留给下一步。
            </p>
          </div>
          <span className="development-tag">正在打磨</span>
        </section>
        <section className="open-source-section" id="open-source">
          <div>
            <span className="eyebrow">BUILT IN THE OPEN</span>
            <h2>
              一个人的助手，
              <br />
              一起做得更好。
            </h2>
            <p>
              JOJOBOT 采用 MIT
              许可证。你可以阅读代码、自己部署，也可以一起完善它。我们希望个人助手不止属于少数人。
            </p>
            <a
              className="text-link"
              href={repository}
              target="_blank"
              rel="noreferrer"
            >
              <Code2 size={18} />在 GitHub 上参与
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="project-notes">
            <div>
              <Code2 size={20} />
              <span>
                <strong>共享云端，独立空间</strong>
                <p>
                  多用户共用服务，每个人的对话与数据按账号隔离，无需为每个人准备一台服务器。
                </p>
              </span>
            </div>
            <div>
              <Globe size={20} />
              <span>
                <strong>使用简单，部署开放</strong>
                <p>
                  托管服务面向无需配置的日常使用；自行部署时，由维护者配置模型与邮件服务。
                </p>
              </span>
            </div>
            <div>
              <Heart size={20} />
              <span>
                <strong>从小而实用开始</strong>
                <p>
                  当前是开发预览。提醒、搜索和文档能力还在路上，欢迎通过 Issue
                  分享反馈。
                </p>
              </span>
            </div>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Link href="/" className="wordmark">
          <Mark />
          <span>JOJOBOT</span>
        </Link>
        <span>一点秩序，一点从容。</span>
        <div>
          <a
            href={`${repository}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
          >
            MIT License
          </a>
          <a
            href={`${repository}/blob/main/README.md`}
            target="_blank"
            rel="noreferrer"
          >
            English docs ↗
          </a>
        </div>
      </footer>
      {login && (
        <Modal
          title="欢迎来到 JOJOBOT"
          onClose={() => {
            setLogin(false);
            if (openAuth) window.history.replaceState(null, "", "/");
          }}
        >
          <AuthForm token={token} linkError={linkError} />
        </Modal>
      )}
    </div>
  );
}
