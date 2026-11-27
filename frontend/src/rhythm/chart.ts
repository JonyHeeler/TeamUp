import type { TrackDefinition } from "./tracks/types";

export const lanes = ["left", "right"] as const;
export type Lane = (typeof lanes)[number];
type NoteKind = "tap" | "pair" | "roll";

export type Note = {
  id: string;
  step: number;
  time: number;
  lane: Lane;
  kind: NoteKind;
};

export const leadIn = 2.5;
export const approachTime = 1.7;
const handsForMark: Record<string, readonly Lane[]> = {
  F: ["left"],
  J: ["right"],
  X: lanes,
};

/** 将每拍四格的谱面转换为可判定的音符和教程阶段。 */
export function buildTrack(definition: TrackDefinition) {
  const beat = 60 / definition.bpm;
  const duration = definition.bars.length * 4 * beat;
  const cues = definition.bars.flatMap((bar, index) =>
    Array.from(bar.replaceAll(" ", "")).flatMap((mark, offset) => {
      const hands = handsForMark[mark.toUpperCase()];
      if (!hands) return [];
      const step = index * 16 + offset;
      const time = (step / 4) * beat;
      const kind: NoteKind =
        mark === "X" ? "pair" : mark === mark.toLowerCase() ? "roll" : "tap";
      const notes: Note[] = hands.map((lane) => ({
        id: `${step}-${lane}`,
        step,
        time,
        lane,
        kind,
      }));
      return [{ step, time, kind, notes }];
    }),
  );
  const sections = [{ name: "单拍", start: 0, hint: "橙色按 F，蓝色按 J。" }];
  const pair = cues.find((cue) => cue.kind === "pair");
  const roll = cues.find((cue) => cue.kind === "roll");
  if (pair)
    sections.push({
      name: "双手同拍",
      start: pair.time,
      hint: "连线音符落下时，F 和 J 一起按。",
    });
  if (roll)
    sections.push({
      name: "快速连拍",
      start: roll.time,
      hint: "遇到密集条纹，跟着节奏逐个点按。",
    });
  sections.sort((left, right) => left.start - right.start);
  return {
    ...definition,
    beat,
    duration,
    cues,
    sections,
    notes: cues.flatMap((cue) => cue.notes),
  };
}

export type Track = ReturnType<typeof buildTrack>;

/** 把 F 和 J 映射到左右手，过滤长按和系统快捷键。 */
export function laneForKey(event: KeyboardEvent): Lane | undefined {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.code === "KeyF") return "left";
  if (event.code === "KeyJ") return "right";
  if (event.key.toLowerCase() === "f") return "left";
  if (event.key.toLowerCase() === "j") return "right";
}
