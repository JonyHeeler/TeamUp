import type { ReactNode, Ref } from "react";
import { copy } from "./copy";
import HighFiveScene from "./HighFiveScene";

export function BrandMark() {
  return (
    <img
      className="brand-symbol"
      src="/brand/high-five-mark.svg"
      alt=""
      width={48}
      height={48}
    />
  );
}

export default function Welcome({
  heading,
  children,
}: {
  heading: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <>
      <section className="about-hero" aria-labelledby="welcome-title">
        <div className="about-shell hero-poster">
          <div className="hero-intro">
            <h1
              id="welcome-title"
              className="welcome-title"
              ref={heading}
              tabIndex={-1}
            >
              平台介绍
            </h1>
            <p>
              {"这是西南财经大学 AI 智能体 + 协会开发的大学生竞赛组队平台。"}
            </p>
            <p>
              {
                "如果你已经有了 idea，希望找到靠谱的队友，请你在“找队伍”页面发布队伍，介绍你的队伍还缺几人、需要哪些技能，以及入队后要做什么。"
              }
            </p>
            <p>
              {
                "如果你希望找到队伍，可以发布名片介绍自己，等待队长发出邀约或者主动联系队长。祝组队顺利。"
              }
            </p>
          </div>
          <HighFiveScene />
        </div>
      </section>
      <section className="welcome-catalog" aria-labelledby="welcome-catalog">
        <div className="about-shell">
          <h2 id="welcome-catalog">{copy.catalog}</h2>
          {children}
        </div>
      </section>
    </>
  );
}
