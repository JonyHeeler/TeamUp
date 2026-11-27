import type { TrackDefinition } from "./types";

const pocket = { kick: [0, 7, 10], snare: [4, 12], hat: [2, 6, 9, 14] };
const lift = { kick: [0, 5, 8, 11, 15], snare: [4, 12], hat: [2, 6, 10, 14] };

// Dm9 与 G13 的回句在三连和反拍前保留可辨认的贝斯动机。
const dBass = [
  [0, 38, 2.2, 1.1],
  [3, 45, 0.85, 0.63],
  [6, 48, 1.1, 0.9],
  [8, 50, 1.8, 1.0],
  [11, 48, 0.8, 0.7],
  [13, 45, 1.2, 0.92],
  [15, 41, 0.65, 0.68],
] as const;
const gBass = [
  [0, 43, 2, 1.1],
  [3, 50, 0.75, 0.72],
  [6, 47, 1.2, 0.95],
  [8, 55, 1.7, 1.0],
  [11, 53, 0.9, 0.7],
  [13, 50, 1.0, 0.87],
  [15, 45, 0.75, 0.72],
] as const;
const dChop = [
  [2, 60, 0.8, 0.72],
  [2, 65, 0.8, 0.65],
  [7, 64, 0.72, 0.57],
  [10, 60, 0.9, 0.6],
  [10, 65, 0.9, 0.67],
  [14, 64, 0.75, 0.47],
] as const;
const gChop = [
  [2, 59, 0.75, 0.68],
  [2, 65, 0.75, 0.65],
  [7, 64, 0.9, 0.63],
  [10, 59, 0.9, 0.6],
  [10, 65, 0.9, 0.66],
  [14, 64, 0.9, 0.54],
] as const;
const call = [
  [0, 65, 1.6, 0.9],
  [5, 69, 1.05, 0.76],
  [6, 72, 1.2, 0.97],
  [8, 69, 1.6, 0.9],
  [13, 67, 1.1, 0.81],
  [15, 64, 0.7, 0.51],
] as const;
const answer = [
  [0, 67, 1.6, 0.77],
  [5, 71, 1.1, 0.89],
  [7, 74, 0.8, 0.9],
  [8, 76, 1.8, 0.99],
  [10, 74, 1.4, 0.82],
  [14, 71, 1.1, 0.78],
] as const;
const drop = [
  [0, 74, 1.65, 1.0],
  [4, 72, 0.8, 0.68],
  [5, 69, 0.78, 0.9],
  [6, 65, 0.85, 0.82],
  [7, 67, 0.76, 0.7],
  [8, 69, 1.52, 0.99],
  [13, 72, 0.8, 0.82],
  [14, 74, 0.82, 0.96],
  [15, 69, 0.75, 0.65],
] as const;
const turn = [
  [0, 71, 1.5, 0.83],
  [4, 67, 0.8, 0.7],
  [5, 69, 0.82, 0.77],
  [6, 71, 0.85, 0.98],
  [7, 74, 0.75, 0.81],
  [8, 76, 1.52, 1.01],
  [10, 74, 1.16, 0.93],
  [12, 71, 0.89, 0.68],
  [13, 74, 0.83, 0.81],
  [14, 77, 0.82, 1.0],
  [15, 76, 0.69, 0.65],
] as const;

export const clubFunk = {
  id: "club-funk",
  title: "社团切分",
  genre: "切分放克",
  difficulty: "进阶",
  bpm: 122,
  bars: [
    "F... ..J. F... .J..",
    "J... .F.. ..J. ...F",
    "F... ...J F... ..J.",
    "J... F.J. F... ..J.",
    "X... ..J. F... .X..",
    "F... .J.. ..X. ...F",
    "X... ...J F... ..X.",
    "J... X.J. F... ..X.",
    "F... .fj. X... .jf.",
    "X... jfj. ..F. j.f.",
    "J... .fjf X... ..J.",
    "F... j.jf J... .fj.",
    "X... fjf. X... .jfj",
    "J... .fjf ..X. jfj.",
    "X... .ffj X... j.jf",
    "F... ..J. X... ....",
  ],
  music: {
    leadVoice: "pluck",
    bassWave: "triangle",
    bars: [
      { ...pocket, bass: dBass, harmony: dChop, lead: call },
      { ...pocket, bass: dBass, harmony: dChop, lead: answer },
      { ...pocket, bass: gBass, harmony: gChop, lead: answer },
      { ...pocket, bass: gBass, harmony: gChop, lead: turn },
      { ...pocket, bass: dBass, harmony: dChop, lead: call },
      { ...pocket, bass: dBass, harmony: dChop, lead: drop },
      { ...pocket, bass: gBass, harmony: gChop, lead: answer },
      { ...lift, bass: gBass, harmony: gChop, lead: turn },
      { ...lift, bass: dBass, harmony: dChop, lead: drop },
      { ...lift, bass: gBass, harmony: gChop, lead: turn },
      { ...lift, bass: dBass, harmony: dChop, lead: drop },
      { ...lift, bass: gBass, harmony: gChop, lead: turn },
      { ...lift, bass: dBass, harmony: dChop, lead: drop },
      { ...lift, bass: gBass, harmony: gChop, lead: turn },
      { ...lift, bass: gBass, harmony: gChop, lead: turn },
      {
        kick: [0, 8],
        snare: [4],
        hat: [2, 6],
        bass: [
          [0, 38, 1.8, 1.03],
          [3, 45, 0.82, 0.72],
          [6, 48, 1.1, 0.86],
          [8, 38, 4.8, 1.1],
        ],
        lead: [
          [0, 65, 1.8, 0.93],
          [5, 69, 0.7, 0.7],
          [6, 72, 1.15, 0.87],
          [8, 74, 5.0, 1.05],
        ],
        harmony: [
          [8, 60, 4.8, 0.68],
          [8, 64, 4.8, 0.65],
          [8, 65, 4.8, 0.71],
        ],
      },
    ],
  },
} satisfies TrackDefinition;
