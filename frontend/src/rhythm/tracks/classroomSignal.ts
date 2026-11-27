import type { TrackDefinition } from "./types";

export const classroomSignal = {
  id: "classroom-signal",
  title: "课间信号",
  genre: "轻电子",
  difficulty: "进阶",
  bpm: 116,
  bars: [
    "F... J... F... J...",
    "J... F... J... F...",
    "F... F... J... J...",
    "F... J... F.J. F.J.",
    "X... F... J... X...",
    "F... X... J... X...",
    "X... J.F. X... F.J.",
    "F.J. X... J.F. X...",
    "fff. J... jjj. F...",
    "jjj. F... fff. J...",
    "fjj. F.J. jff. J.F.",
    "ffj. X... jjf. X...",
    "F.J. fjfj jfjf X...",
    "fff. J.F. jjj. F.J.",
    "fjjf X... jffj X...",
    "F... J... X... ....",
  ],
} satisfies TrackDefinition;
