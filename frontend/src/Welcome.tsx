import { Button } from "./ui/Button";
import type { ReactNode, Ref } from "react";
import { copy } from "./copy";
import HighFiveScene from "./HighFiveScene";

/** 绘制导航中使用的一拍即合标志。 */
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

/** 展示站点介绍和比赛目录。 */
export default function Welcome({
  heading,
  onAbout,
  children,
}: {
  heading: Ref<HTMLHeadingElement>;
  onAbout: () => void;
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
              {
                "“一拍即合 TeamUP”是西南财经大学 AI 智能体 + 协会开发的竞赛组队平台。"
              }
            </p>
            <p>
              {
                "如果你的队伍缺少优秀队员，可以发布招募，介绍你对同学的期望与加入后的具体分工。如果你想参赛，可以浏览招募，也可以发布名片，让队长了解你。你的名片可以被导出为一个简历。"
              }
            </p>
            <p>
              {
                "遇到合适的队伍或队友，可以发一条击掌申请。对方同意后，双方可在申请详情里查看彼此的联系方式。祝组队顺利、顺利比赛。"
              }
            </p>
            <div>
              <Button type="button" onClick={onAbout}>
                {copy.about}
              </Button>
            </div>
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
