import { copy as t } from "../copy";
import { showToast } from "../ui/ActionToast";
import { Button } from "../ui/Button";
import { Back, Heading, type Navigate } from "./shared";
import "./about.css";

const feedbackGroup = "1138062501";

/** 复制反馈群号，并提示复制结果。 */
async function copyFeedbackGroup() {
  try {
    await navigator.clipboard.writeText(feedbackGroup);
    showToast("已复制反馈群号", "success");
  } catch {
    showToast("复制失败，请手动复制群号", "error");
  }
}

/** 介绍 TeamUP，并提供网站和反馈群入口。 */
export default function AboutPage({ navigate }: { navigate: Navigate }) {
  return (
    <div className="about-page">
      <Back label={t.backHome} onClick={() => navigate("/")} />
      <Heading title={t.about} />
      <p className="about-lead">
        一拍即合 TeamUP 是西南财经大学 AI 智能体 +
        协会开发的竞赛组队平台，帮助同学发布招募、展示技能和寻找队友。
      </p>
      <section
        className="about-association"
        aria-labelledby="about-association-title"
      >
        <h2 id="about-association-title">AI 智能体 + 协会</h2>
        <p>
          协会成立于 2025 年 9
          月，依托西南财经大学计算机与人工智能学院。我们面向全校同学推广 AI
          智能体的使用与开发，鼓励不同专业的同学把各自的知识带进项目，一起探索财经和其他行业中的实际应用。
        </p>
        <p>
          协会平时组织技术分享和项目实践，内容包括用 AI
          辅助编程、参与开源社区，以及用 Git 和 GitHub
          协作开发。零基础的同学也可以从制作网页、桌面应用或简单的智能体入手，逐步做出可以交流、展示或参赛的作品。
        </p>
        <p>
          协会活动向全校同学开放，学习资料也公开分享。欢迎带着自己的问题或想法来参加活动、交流经验，一起做项目。
        </p>
        <nav className="about-links" aria-label="相关网站">
          <a
            className="button button--blue"
            href="https://jonywang.xyz/AgentClub/"
            target="_blank"
            rel="noreferrer"
          >
            协会官网 <span aria-hidden="true">↗</span>
          </a>
          <a
            className="button button--blue"
            href="https://jonywang.xyz/"
            target="_blank"
            rel="noreferrer"
          >
            Jony 的个人主页 <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </section>
      <section
        className="about-feedback"
        aria-labelledby="about-feedback-title"
      >
        <h2 id="about-feedback-title">QQ 意见反馈群</h2>
        <p>用移动端 QQ 扫码</p>
        <img
          className="about-feedback-code"
          src={import.meta.env.BASE_URL + "brand/feedback-qq.svg"}
          alt="用手机 QQ 扫码加入意见反馈群"
          width={240}
          height={240}
        />
        <Button
          className="about-feedback-copy"
          type="button"
          onClick={() => void copyFeedbackGroup()}
        >
          复制群号 {feedbackGroup}
          <span className="about-copy-icon" aria-hidden="true" />
        </Button>
      </section>
    </div>
  );
}
