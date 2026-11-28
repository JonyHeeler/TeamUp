import { useRef } from "react";
import type { AuthMode, Me, Persona } from "../api/client";
import { copy as t } from "../copy";
import { BrandMark } from "../Welcome";
import type { usePageNavigation } from "../ui/usePageNavigation";

const tripleClickWindow = 950;

/** 提供主导航和演示身份选择。 */
export default function AppHeader({
  page,
  mode,
  me,
  restoring,
  switching,
  move,
  switchPersona,
}: {
  page: string;
  mode: AuthMode | null;
  me: Me | null;
  restoring: boolean;
  switching: boolean;
  move: ReturnType<typeof usePageNavigation>["move"];
  switchPersona: (persona: Persona) => Promise<void>;
}) {
  const taps = useRef({ count: 0, startedAt: 0 });

  /** 单击返回首页，连续三击打开节奏彩蛋。 */
  function tapBrand() {
    const now = performance.now();
    if (now - taps.current.startedAt > tripleClickWindow)
      taps.current.count = 0;
    taps.current.count += 1;
    if (taps.current.count === 1) {
      taps.current.startedAt = now;
      move("/", undefined, "push", false);
    }
    if (taps.current.count === 3) {
      taps.current.count = 0;
      move("/rhythm", undefined, "push", false);
    }
  }

  const activeTab =
    page === "teams"
      ? 1
      : page === "people"
        ? 2
        : ["center", "profile", "resume", "security", "onboarding"].includes(
              page,
            )
          ? 3
          : 0;
  return (
    <header className="topbar">
      <div className="toolbar">
        <button
          className="brand"
          aria-label={t.brand + " · " + t.brandEnglish}
          onClick={tapBrand}
        >
          <span className="brand-mark" aria-hidden="true">
            <BrandMark />
          </span>
          <span className="brand-wordmark">
            {t.brand}
            <span lang="en">{t.brandEnglish}</span>
          </span>
        </button>
        <nav aria-label={t.navigation} data-tab={activeTab}>
          <span className="nav-indicator" aria-hidden="true" />
          <button
            aria-current={
              ["welcome", "competition", "about"].includes(page)
                ? "page"
                : undefined
            }
            onClick={() => move("/")}
          >
            {t.welcome}
          </button>
          <button
            aria-current={page === "teams" ? "page" : undefined}
            onClick={() => move("/teams")}
          >
            {t.teams}
          </button>
          <button
            aria-current={page === "people" ? "page" : undefined}
            onClick={() => move("/people")}
          >
            {t.people}
          </button>
          <button
            aria-current={
              [
                "center",
                "profile",
                "resume",
                "security",
                "onboarding",
              ].includes(page)
                ? "page"
                : undefined
            }
            onClick={() => move("/center")}
          >
            {t.center}
          </button>
        </nav>
        <div className="toolbar-actions">
          {mode === "demo" ? (
            <select
              aria-label={t.persona}
              className="persona"
              value={me?.persona ?? ""}
              disabled={restoring || switching}
              onChange={(event) =>
                void switchPersona(event.target.value as Persona)
              }
            >
              <option value="" disabled>
                {t.choosePersona}
              </option>
              <option value="captain">
                {t.captain}
                {me?.persona === "captain" && me ? " · " + me.nickname : ""}
              </option>
              <option value="candidate-a">
                {t.candidateA}
                {me?.persona === "candidate-a" && me ? " · " + me.nickname : ""}
              </option>
              <option value="candidate-b">
                {t.candidateB}
                {me?.persona === "candidate-b" && me ? " · " + me.nickname : ""}
              </option>
              <option value="candidate-c">
                同学丙
                {me?.persona === "candidate-c" && me ? " · " + me.nickname : ""}
              </option>
            </select>
          ) : me && "kind" in me && me.kind === "student" ? (
            <span>{me.nickname}</span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
