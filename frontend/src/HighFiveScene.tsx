/** 绘制欢迎页的击掌图形。 */
export default function HighFiveScene() {
  return (
    <svg
      className="high-five-art"
      viewBox="0 0 640 674"
      width={640}
      height={674}
      role="img"
      aria-label="橙色和蓝色手掌击掌，掌心相碰时迸出黄色星芒"
    >
      <use className="high-five-burst" href="/brand/high-five.svg#burst" />
      <use className="high-five-blue" href="/brand/high-five.svg#blue-hand" />
      <use
        className="high-five-orange"
        href="/brand/high-five.svg#orange-hand"
      />
    </svg>
  );
}
