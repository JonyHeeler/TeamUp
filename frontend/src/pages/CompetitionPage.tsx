import { Button } from "../ui/Button";
import { Back, teamsHref, type Navigate } from "./shared";

/** 按比赛编号显示官方赛题介绍。 */
export default function CompetitionPage({
  id,
  navigate,
}: {
  id: string;
  navigate: Navigate;
}) {
  return (
    <article className="competition-detail">
      <Back label="返回首页" onClick={() => navigate("/")} />
      {id === "mcm-icm" ? <ModelingIntro /> : <AgentIntro />}
      <Button tone="blue" onClick={() => navigate(teamsHref(id))}>
        查看该赛事的队伍
      </Button>
    </article>
  );
}

/** 展示美赛的简介和参与方式。 */
function ModelingIntro() {
  return (
    <>
      <p className="competition-eyebrow">MCM / ICM</p>
      <h1 tabIndex={-1}>美赛</h1>
      <p className="competition-lead">用数学建模回应真实世界的问题。</p>
      <h2>关于比赛</h2>
      <p>
        美国大学生数学建模竞赛（MCM）及交叉学科建模竞赛（ICM）由 COMAP
        举办。参赛队围绕开放性问题展开分析、建立模型并提交解决方案报告。
      </p>
      <h2>组队时可以聊什么</h2>
      <p>
        从问题分析、数据处理、模型求解到论文写作，提前交流各自擅长的工作与协作方式，找到能一起探索问题的伙伴。
      </p>
      <p>
        <a
          href="https://contest.comap.org/undergraduate/contests/mcm/instructions.php"
          target="_blank"
          rel="noreferrer"
        >
          查看 COMAP 官方规则与最新赛程 ↗
        </a>
      </p>
    </>
  );
}

/** 展示 AI 智能体校赛的简介和参与方式。 */
function AgentIntro() {
  return (
    <>
      <p className="competition-eyebrow">AI AGENT+</p>
      <h1 tabIndex={-1}>AI 智能体+ 大赛校赛</h1>
      <p className="competition-lead">
        围绕智能体创意，寻找一起探索和实践的队友。
      </p>
      <h2>从想法到协作</h2>
      <p>
        无论你擅长场景研究、开发实现，还是设计与展示，都可以在这里介绍自己的想法和希望承担的工作，与感兴趣的同学组队。
      </p>
      <h2>比赛信息</h2>
      <p>报名时间、参赛要求和赛程请以学校发布的正式通知为准。</p>
    </>
  );
}
