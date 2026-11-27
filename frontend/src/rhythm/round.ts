import type { Lane, Note } from "./chart";

export const hitWindow = 0.145;
const perfectWindow = 0.07;

type Judgment = "perfect" | "good" | "miss" | "empty";
type Feedback = { kind: Judgment; time: number };
type HandHit = { id: string; step: number; time: number };
const pairWindow = 0.11;

/** 记录一局的音符判定、连击和分数。 */
export class Round {
  readonly resolved = new Set<string>();
  readonly hands: Partial<Record<Lane, HandHit>> = {};
  feedback: Feedback | undefined;
  highFive: HandHit | undefined;
  highFives = 0;
  points = 0;
  combo = 0;
  bestCombo = 0;
  perfect = 0;
  good = 0;
  missed = 0;

  /** 将判定绑定到开局时选择的谱面。 */
  constructor(private readonly notes: readonly Note[]) {}

  /** 将超出判定窗口的音符记为漏拍。 */
  advance(time: number) {
    for (const note of this.notes) {
      if (note.time >= time - hitWindow) break;
      if (this.resolved.has(note.id)) continue;
      this.resolved.add(note.id);
      this.missed += 1;
      this.combo = 0;
      this.feedback = { kind: "miss", time };
    }
  }

  /** 判定同一轨道上距离击打时刻最近的音符。 */
  strike(lane: Lane, time: number) {
    this.advance(time);
    let closest: Note | undefined;
    let error = hitWindow;
    for (const note of this.notes) {
      if (note.time > time + hitWindow) break;
      if (note.lane !== lane || this.resolved.has(note.id)) continue;
      const offset = Math.abs(note.time - time);
      if (offset > error) continue;
      closest = note;
      error = offset;
    }

    if (!closest) {
      this.combo = 0;
      this.feedback = { kind: "empty", time };
      return;
    }

    const hit = { id: closest.id, step: closest.step, time };
    this.resolved.add(closest.id);
    this.hands[lane] = hit;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (error <= perfectWindow) {
      this.perfect += 1;
      this.points += 100;
      this.feedback = { kind: "perfect", time };
    } else {
      this.good += 1;
      this.points += 60;
      this.feedback = { kind: "good", time };
    }

    const other = this.hands[lane === "left" ? "right" : "left"];
    if (
      closest.kind === "pair" &&
      other?.step === closest.step &&
      time - other.time <= pairWindow
    ) {
      this.highFive = hit;
      this.highFives += 1;
      this.points += 40;
      return "pair";
    }
    return "single";
  }
}
