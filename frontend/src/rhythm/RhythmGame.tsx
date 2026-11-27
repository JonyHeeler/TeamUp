import { useEffect, useRef, useState } from "react";
import type { Track } from "./chart";
import RhythmStage, { RhythmPads } from "./RhythmStage";
import TrackPicker from "./TrackPicker";
import { tracks } from "./tracks";
import { useRhythmGame } from "./useRhythmGame";
import { useTrackPreview } from "./useTrackPreview";
import "./rhythm.css";

const judgments = {
  perfect: "精准拍手",
  good: "拍到了",
  miss: "漏拍",
  empty: "空拍",
};

/** 展示独立的双轨击掌游戏页和本局成绩。 */
export default function RhythmGame({ exit }: { exit: () => void }) {
  const [track, setTrack] = useState(tracks[0]);
  const { start, strike, frame, starting, pressedPads, reset } =
    useRhythmGame(track);
  const preview = useTrackPreview();
  const { duration, notes, sections } = track;
  const heading = useRef<HTMLHeadingElement>(null);
  const time = frame?.time ?? 0;
  const round = frame?.round;
  const finished = Boolean(frame && time >= duration && !starting);
  const playing = Boolean(frame && !finished && !starting);
  const section = sections.reduce((current, next) =>
    time >= next.start ? next : current,
  );
  const accuracy = round
    ? Math.round(((round.perfect + round.good) / notes.length) * 100)
    : 0;
  const feedback = round?.feedback;
  const judgment =
    feedback && time - feedback.time < 0.23 ? feedback.kind : undefined;
  const paired = round?.highFive && time - round.highFive.time < 0.33;

  /** 停止旧曲目并以新曲目的谱面回到开局界面。 */
  function chooseTrack(selected: Track) {
    preview.stop();
    reset();
    setTrack(selected);
  }

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    /** 让键盘玩家从游戏页直接回到 TeamUP。 */
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.repeat && !event.defaultPrevented)
        exit();
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [exit]);

  return (
    <div className="rhythm-page">
      <header className="rhythm-header">
        <p className="rhythm-brand">
          <img src="/brand/high-five-mark.svg" width={36} height={36} alt="" />
          <span>
            一拍即合 <small lang="en">TeamUP</small>
          </span>
        </p>
        <button className="rhythm-exit" type="button" onClick={exit}>
          ← 返回 TeamUP
        </button>
      </header>

      <main className="rhythm-layout">
        <section className="rhythm-intro" aria-labelledby="rhythm-title">
          <h1 id="rhythm-title" ref={heading} tabIndex={-1}>
            一拍<span>即响</span>
          </h1>
        </section>

        <TrackPicker
          track={track}
          choose={chooseTrack}
          preview={preview}
          locked={starting || playing}
        />

        <section className="rhythm-play" aria-label="双轨击掌谱面">
          <div className="rhythm-stage-header">
            <span>{finished ? "曲目完成" : section.name}</span>
            <progress
              max={duration}
              value={Math.min(duration, Math.max(0, time))}
              aria-label="歌曲进度"
            />
          </div>
          <RhythmStage
            cues={track.cues}
            time={playing ? time : null}
            round={playing ? round : undefined}
            showPreview={!frame}
          >
            {playing ? (
              time < 0 ? (
                <p
                  className="rhythm-countdown"
                  aria-label={"倒数 " + Math.ceil(-time)}
                >
                  {Math.ceil(-time)}
                </p>
              ) : (
                (paired || judgment) && (
                  <p
                    className="rhythm-feedback"
                    data-judgment={paired ? "pair" : judgment}
                  >
                    {paired ? "一拍即合！" : judgment && judgments[judgment]}
                  </p>
                )
              )
            ) : (
              <div className="rhythm-action">
                <p role={finished ? "status" : undefined}>
                  {finished
                    ? "命中率 " +
                      accuracy +
                      "% · 最长 " +
                      (round?.bestCombo ?? 0) +
                      " 连击"
                    : "音符落到判定线时，按对应的键。"}
                </p>
                <button
                  className="rhythm-start"
                  type="button"
                  disabled={starting}
                  onClick={() => {
                    preview.stop();
                    void start();
                  }}
                >
                  {starting ? "准备中…" : finished ? "再来一局" : "开始拍手"}
                </button>
              </div>
            )}
          </RhythmStage>
          <RhythmPads pressed={pressedPads} strike={strike} />
        </section>

        <section className="rhythm-guide" aria-label="拍手方法">
          <ol className="rhythm-lessons">
            {sections.map((item) => (
              <li
                key={item.name}
                aria-current={section === item ? "step" : undefined}
              >
                <strong>{item.name}</strong>
                <p>{item.hint}</p>
              </li>
            ))}
          </ol>
        </section>

        <dl className="rhythm-stats" aria-label="本局成绩">
          <div>
            <dt>得分</dt>
            <dd>{String(round?.points ?? 0).padStart(5, "0")}</dd>
          </div>
          <div>
            <dt>连击</dt>
            <dd>{round?.combo ?? 0}</dd>
          </div>
          <div>
            <dt>双手击掌</dt>
            <dd>{round?.highFives ?? 0}</dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
