"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Brain,
  Code2,
  ListTodo,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button, Mark, Modal } from "./ui";
import { AuthForm } from "./login";
import { ThemeToggle } from "./theme-toggle";

const repository = "https://github.com/Jobo16/Cloud-Puffer";

const capabilities = [
  {
    icon: ListTodo,
    title: "待办",
    body: "「周五前交材料」说出来就成一条待办，之后可以改时间、补说明、标完成。",
  },
  {
    icon: Brain,
    title: "记忆",
    body: "明确说「记住我不喜欢开会」，它就存下来。记忆列在网页上，可以改，也可以删。",
  },
  {
    icon: Smartphone,
    title: "渠道",
    body: "在微信里说一句，回到网页接着看。两个入口共用同一条对话和同一份待办。",
  },
  {
    icon: SlidersHorizontal,
    title: "系统提示词",
    body: "名字、系统提示词和能力开关都在工作区里调，下一轮回复按新设定走。",
  },
];

const status = [
  {
    tone: "ok",
    label: "已经可用",
    body: "账号与邮箱验证、网页主对话、待办、个人记忆、表情回复，以及按账号保存的助手配置。",
  },
  {
    tone: "warn",
    label: "正在验证",
    body: "本地已验证百炼模型和单账号微信文字收发；QQ 与生产接入仍待验证。",
  },
  {
    tone: "todo",
    label: "还没做",
    body: "定时提醒、带起止时间的日程、联网搜索、文件与文档，以及运营后台。",
  },
] as const;

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
      <header className="landing-nav glass">
        <Link className="wordmark" href="/">
          <Mark />
          <span>云上小肥鱼</span>
        </Link>
        <nav aria-label="页面导航">
          <a className="nav-link" href="#what">
            能做什么
          </a>
          <a className="nav-link" href="#status">
            当前进度
          </a>
          <a
            className="nav-link nav-github"
            href={repository}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 仓库"
          >
            <Code2 size={16} />
            <span>GitHub</span>
          </a>
          <ThemeToggle />
          <span className="nav-divider" aria-hidden="true" />
          <Button className="primary" onClick={enter}>
            {session?.user.emailVerified ? "我的空间" : "登录 / 注册"}
            <ArrowUpRight size={15} />
          </Button>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-lede">
            <h1>
              一句话，
              <br />
              把事<span>记下。</span>
            </h1>
            <p>
              云上小肥鱼帮你把待办、记忆和对话放在同一个账号里。网页和微信共用一条对话，换设备接着说。
            </p>
            <div className="hero-actions">
              <Button className="primary" onClick={enter}>
                {session?.user.emailVerified ? "进入我的空间" : "免费注册"}
              </Button>
              <a
                className="text-link"
                href={repository}
                target="_blank"
                rel="noreferrer"
              >
                源代码
                <ArrowUpRight size={15} />
              </a>
            </div>
          </div>

          <figure className="hero-demo glass" aria-hidden="true">
            <div className="demo-head">
              <Mark />
              <span>小肥鱼</span>
            </div>
            <div className="demo-thread">
              <p className="demo-bubble">帮我记个待办：周五前交材料</p>
              <p className="demo-said">记下了。</p>
              <div className="demo-task">
                <span className="demo-check" />
                <span>周五前交材料</span>
                <em>待办</em>
              </div>
              <p className="demo-bubble">以后回答简短一点</p>
              <p className="demo-said">好。</p>
            </div>
          </figure>
        </section>

        <section className="landing-block" id="what">
          <h2>它能替你做什么</h2>
          <div className="landing-capabilities">
            {capabilities.map(({ icon: Icon, title, body }) => (
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
          <h2>现在能做到哪一步</h2>
          <p>
            这是开发预览版，托管服务还没公开。下面是目前的真实状态，也可以先在自己的机器上跑起来看。
          </p>
          <div className="status-grid">
            {status.map(({ tone, label, body }) => (
              <div className="status-col" key={label}>
                <h3 data-tone={tone}>{label}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-block landing-os" id="open-source">
          <h2>代码和文档都在 GitHub。</h2>
          <p>
            可以了解项目实现，也可以在自己的机器上运行。多个账号共用一套服务，对话、待办和记忆按账号分开。
          </p>
          <a
            className="text-link"
            href={repository}
            target="_blank"
            rel="noreferrer"
          >
            查看仓库和文档
            <ArrowUpRight size={15} />
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="wordmark" href="/">
              <Mark />
              <span>云上小肥鱼</span>
            </Link>
            <p>
              私人 AI 助手。待办、记忆和对话都在一个账号里，网页和微信共用同一条记录。
            </p>
          </div>
          <nav className="footer-cols" aria-label="页脚导航">
            <div className="footer-col">
              <h3>产品</h3>
              <ul>
                <li>
                  <a href="#what">能做什么</a>
                </li>
                <li>
                  <a href="#status">当前进度</a>
                </li>
                <li>
                  <a href="#open-source">代码与文档</a>
                </li>
                <li>
                  <button type="button" onClick={enter}>
                    {session?.user.emailVerified ? "我的空间" : "登录 / 注册"}
                  </button>
                </li>
              </ul>
            </div>
            <div className="footer-col">
              <h3>文档</h3>
              <ul>
                <li>
                  <a
                    href={`${repository}/blob/main/docs/workspace.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    使用说明
                  </a>
                </li>
                <li>
                  <a
                    href={`${repository}/blob/main/docs/deployment.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    自己部署
                  </a>
                </li>
                <li>
                  <a
                    href={`${repository}/blob/main/docs/architecture.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    实现架构
                  </a>
                </li>
                <li>
                  <a
                    href={`${repository}/blob/main/docs/PRD.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    产品规划
                  </a>
                </li>
              </ul>
            </div>
            <div className="footer-col">
              <h3>项目</h3>
              <ul>
                <li>
                  <a href={repository} target="_blank" rel="noreferrer">
                    源代码
                  </a>
                </li>
                <li>
                  <a
                    href={`${repository}/issues`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    问题反馈
                  </a>
                </li>
                <li>
                  <a
                    href={`${repository}/blob/main/README.en.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    English README
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="footer-bottom">
          <p>
            © 2026 云上小肥鱼
            <span aria-hidden="true">·</span>
            <a href="https://jobo.ink" target="_blank" rel="noreferrer">
              JOBO 维护
            </a>
            <span aria-hidden="true">·</span>
            开发预览版
          </p>
          <div className="footer-links">
            <a
              href={`${repository}/blob/main/LICENSE`}
              target="_blank"
              rel="noreferrer"
            >
              许可说明
            </a>
            <a
              className="footer-icon"
              href={repository}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 仓库"
            >
              <Code2 size={16} />
            </a>
          </div>
        </div>
        {/* 备案号与域名绑定，换域名需同步更新主体备案 */}
        <div className="footer-legal">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
            浙ICP备2025148802号-3
          </a>
          <a
            className="footer-police"
            href="https://beian.mps.gov.cn/#/query/webSearch?code=33010602015015"
            target="_blank"
            rel="noreferrer"
          >
            {/* 固定尺寸的官方徽标，走静态资源比过图片优化器更简单 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/police-beian.png" alt="" width={14} height={14} />
            浙公网安备33010602015015号
          </a>
        </div>
      </footer>

      {login && (
        <Modal
          title="云上小肥鱼账号"
          bare
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
