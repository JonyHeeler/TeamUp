export type MusicNote = readonly [
  step: number,
  midi: number,
  lengthInSteps: number,
  velocity?: number,
];

export type MusicBar = {
  lead?: readonly MusicNote[];
  bass?: readonly MusicNote[];
  harmony?: readonly MusicNote[];
  kick?: readonly number[];
  snare?: readonly number[];
  hat?: readonly number[];
};

export type Arrangement = {
  leadVoice: "bell" | "pluck" | "chip";
  bassWave: "sine" | "triangle" | "square";
  bars: readonly MusicBar[];
};

export type TrackDefinition = {
  id: string;
  title: string;
  genre: string;
  difficulty: "入门" | "进阶" | "挑战";
  bpm: number;
  bars: readonly string[];
  music?: Arrangement;
};
