import { copy as t } from "../copy";
import { Back, Heading, type Navigate } from "./shared";

/** 介绍组队流程和联系方式的公开时机。 */
export default function AboutPage({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <Back label={t.backHome} onClick={() => navigate("/")} />
      <Heading title={t.about} />
      <div className="about-copy">
        <p className="body-text">
          我们是西南财经大学 AI 智能体 + 协会。一拍即合 TeamUP
          由协会开发，帮助同学围绕校内外竞赛找到合适的队友。
        </p>
        <p className="consent">协会介绍与团队成员资料将在这里更新。</p>
      </div>
    </>
  );
}
