export const resumeSections = [
  "college",
  "major",
  "grade",
  "qq",
  "competitionIntent",
  "contribution",
  "skills",
  "experience",
  "projects",
  "evidence",
  "credit",
] as const;
export type ResumeSection = (typeof resumeSections)[number];
