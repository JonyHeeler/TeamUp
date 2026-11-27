import type { CSSProperties, ReactNode } from "react";
import { approachTime, lanes, type Lane, type Track } from "./chart";
import type { Round } from "./round";

const hitLine = 83;
const laneKeys = { left: "F", right: "J" };
const handLabels = { left: "左手", right: "右手" };
const preview = [
  { lane: "left", top: 16 },
  { lane: "right", top: 28 },
  { lane: "left", top: 58 },
  { lane: "right", top: 70 },
] as const;

/** 让品牌手掌跟随命中摆动，双手同拍时碰出星芒。 */
function RhythmHands({ round, time }: { round?: Round; time: number }) {
  const paired =
    round?.highFive && time - round.highFive.time < 0.33
      ? round.highFive
      : undefined;
  return (
    <svg className="rhythm-hands" viewBox="0 0 640 674" aria-hidden="true">
      {paired && (
        <use
          className="rhythm-spark"
          key={paired.id}
          href="/brand/high-five.svg#burst"
        />
      )}
      {lanes.map((lane) => {
        const hit = round?.hands[lane];
        const swing = hit && time - hit.time < 0.25 ? hit : undefined;
        return (
          <use
            className="rhythm-hand"
            data-lane={lane}
            data-motion={paired ? "pair" : swing ? "tap" : undefined}
            key={[lane, paired?.id ?? swing?.id ?? "rest"].join(":")}
            href={
              lane === "left"
                ? "/brand/high-five.svg#orange-hand"
                : "/brand/high-five.svg#blue-hand"
            }
          />
        );
      })}
    </svg>
  );
}

/** 绘制竖向谱面、双键连线、判定线及击掌反馈。 */
export default function RhythmStage({
  cues,
  time,
  round,
  showPreview,
  children,
}: {
  cues: Track["cues"];
  time: number | null;
  round: Round | undefined;
  showPreview: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="rhythm-stage"
      style={{ "--rhythm-hit-line": hitLine + "%" } as CSSProperties}
    >
      <div className="rhythm-notes" aria-hidden="true">
        {showPreview &&
          preview.map(({ lane, top }) => (
            <div
              className="rhythm-note-row rhythm-note-row--preview"
              key={top}
              style={{ top: top + "%" }}
            >
              <span className="rhythm-note" data-lane={lane} />
            </div>
          ))}
        {time !== null &&
          cues.map((cue) => {
            const until = cue.time - time;
            if (until > approachTime || until < -0.16) return null;
            const pending = cue.notes.filter(
              (note) => !round?.resolved.has(note.id),
            );
            if (!pending.length) return null;
            const position = hitLine * (1 - until / approachTime);
            return (
              <div
                className="rhythm-note-row"
                data-kind={cue.kind}
                key={cue.step}
                style={{ top: position + "%" }}
              >
                {pending.length === 2 && <span className="rhythm-note-link" />}
                {pending.map((note) => (
                  <span
                    className="rhythm-note"
                    data-lane={note.lane}
                    data-note={note.id}
                    key={note.id}
                  />
                ))}
              </div>
            );
          })}
      </div>
      <RhythmHands time={time ?? 0} round={round} />
      <div className="rhythm-hit-line" aria-hidden="true">
        {lanes.map((lane) => {
          const hit = round?.hands[lane];
          return (
            <span
              data-lane={lane}
              data-hit={Boolean(hit && time !== null && time - hit.time < 0.15)}
              key={lane}
            />
          );
        })}
      </div>
      {children}
    </div>
  );
}

/** 让键盘、触屏和辅助技术共用同一对击掌键。 */
export function RhythmPads({
  pressed,
  strike,
}: {
  pressed: Record<Lane, boolean>;
  strike: (lane: Lane) => void;
}) {
  return (
    <div className="rhythm-pads">
      {lanes.map((lane) => (
        <button
          className="rhythm-pad"
          data-lane={lane}
          data-pressed={pressed[lane]}
          key={lane}
          type="button"
          aria-keyshortcuts={laneKeys[lane]}
          onPointerDown={(event) => {
            if (event.button === 0) strike(lane);
          }}
          onClick={(event) => {
            if (event.detail === 0) strike(lane);
          }}
        >
          <kbd>{laneKeys[lane]}</kbd>
          <span>{handLabels[lane]}</span>
        </button>
      ))}
    </div>
  );
}
