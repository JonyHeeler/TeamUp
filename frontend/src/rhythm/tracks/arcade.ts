import type { TrackDefinition } from "./types";

type Chord = readonly [root: number, fifth: number, third: number];
type Phrase = {
  chart: string;
  chord: Chord;
  melody: readonly number[];
};
type Tone = readonly [
  step: number,
  midi: number,
  length: number,
  velocity: number,
];

const eMajor: Chord = [40, 47, 68];
const bMajor: Chord = [35, 42, 63];
const cSharpMinor: Chord = [37, 44, 64];
const aMajor: Chord = [33, 40, 61];
const fSharpMinor: Chord = [42, 49, 69];
const gSharpMinor: Chord = [44, 51, 71];

// 四小节引子与同拍段各复述一次主题，随后把主题展开成连续的十六分音符。
const phrases: readonly Phrase[] = [
  { chart: "F... ..J. F... J...", chord: eMajor, melody: [76, 80, 83, 80] },
  { chart: "J... ..F. J.F. ..J.", chord: bMajor, melody: [78, 75, 83, 78, 75] },
  {
    chart: "F... ..J. F.J. F...",
    chord: cSharpMinor,
    melody: [73, 76, 80, 83, 85],
  },
  { chart: "J... F.J. ..F. J...", chord: aMajor, melody: [81, 80, 76, 73, 76] },
  { chart: "X... ..F. J... X...", chord: eMajor, melody: [76, 80, 83, 88] },
  {
    chart: "J.F. J... X... ..F.",
    chord: gSharpMinor,
    melody: [87, 83, 78, 75, 78],
  },
  {
    chart: "X... F.J. ..F. X...",
    chord: cSharpMinor,
    melody: [85, 83, 80, 76, 73],
  },
  {
    chart: "F... J.F. X... F.J.",
    chord: bMajor,
    melody: [78, 75, 78, 83, 80, 78],
  },
  {
    chart: "fjf. J... jfj. F...",
    chord: cSharpMinor,
    melody: [73, 76, 80, 83, 85, 83, 80, 76],
  },
  {
    chart: "jjf. F.J. ffj. X...",
    chord: aMajor,
    melody: [76, 81, 85, 88, 85, 81, 83, 85, 88],
  },
  {
    chart: "fjj. F... jff. J.F.",
    chord: fSharpMinor,
    melody: [78, 81, 85, 88, 90, 88, 85, 81, 80],
  },
  {
    chart: "X... fjfj X... jfjf",
    chord: bMajor,
    melody: [83, 78, 83, 87, 90, 83, 87, 85, 83, 78],
  },
  {
    chart: "fjj. ..F. jff. X...",
    chord: eMajor,
    melody: [76, 80, 83, 88, 92, 88, 83, 88],
  },
  {
    chart: "jfjf F.J. fjfj J...",
    chord: gSharpMinor,
    melody: [80, 83, 87, 90, 87, 83, 80, 83, 87, 83, 80],
  },
  {
    chart: "X... fff. J.F. jjj.",
    chord: aMajor,
    melody: [81, 81, 83, 85, 88, 85, 90, 88, 85],
  },
  {
    chart: "ffjf jfj. X... fjfj",
    chord: bMajor,
    melody: [83, 83, 87, 90, 95, 90, 87, 83, 90, 88, 87, 83],
  },
  {
    chart: "F.J. X... fjfj jfjf",
    chord: bMajor,
    melody: [78, 75, 83, 78, 80, 82, 83, 85, 87, 90, 95],
  },
  { chart: "X... F.J. X... ....", chord: eMajor, melody: [88, 83, 80, 76] },
];

/** 根据谱面重音编排旋律和伴奏，给密集音符留出短暂间隙。 */
function arrangeBar({ chart, chord, melody }: Phrase, index: number) {
  const symbols = chart.replaceAll(" ", "");
  const onsets = Array.from(symbols.matchAll(/[^.]/g), (mark) => mark.index);
  const finalBar = index === phrases.length - 1;
  const [root, fifth, third] = chord;
  const lead = melody.map((pitch, noteIndex): Tone => {
    const step = onsets[noteIndex];
    const symbol = symbols[step];
    const next = onsets[noteIndex + 1] ?? 16;
    const velocity = symbol === "X" ? 1.02 : step % 4 === 0 ? 0.9 : 0.75;
    const length = Math.min(finalBar ? 5 : 2.6, next - step - 0.15);
    return [step, pitch, length, velocity];
  });
  const bass: Tone[] = finalBar
    ? [
        [0, root, 3.5, 0.92],
        [4, fifth, 2, 0.74],
        [8, root, 7, 0.91],
      ]
    : [
        [0, root, 2.2, 0.92],
        [4, fifth, 1.65, 0.74],
        [7, root + 12, 0.82, 0.75],
        [8, root, 2.45, 0.88],
        [12, fifth, 2.1, 0.75],
        [15, root + 12, 0.8, 0.65],
      ];
  const harmony: Tone[] = finalBar
    ? [
        [0, third, 3.5, 0.45],
        [8, third, 6.8, 0.58],
        [8, fifth + 24, 6.8, 0.55],
      ]
    : [
        [0, third, 3.4, 0.47],
        [6, fifth + 24, 1.4, 0.46],
        [10, third, 3.8, 0.45],
      ];
  return {
    lead,
    bass,
    harmony,
    kick: finalBar ? [0, 8] : index >= 8 ? [0, 6, 8, 11] : [0, 8, 14],
    snare: finalBar ? [4, 8] : index % 4 === 3 ? [4, 12, 14, 15] : [4, 12],
    hat: finalBar ? [2, 6] : [2, 6, 10, 14],
  };
}

export const arcade = {
  id: "neon-combo",
  title: "霓虹连击",
  genre: "8-bit 街机",
  difficulty: "挑战",
  bpm: 144,
  bars: phrases.map(({ chart }) => chart),
  music: {
    leadVoice: "chip",
    bassWave: "triangle",
    bars: phrases.map(arrangeBar),
  },
} satisfies TrackDefinition;
