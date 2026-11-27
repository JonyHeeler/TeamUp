import { copy as t } from "../copy";

export const fields = [
  "college",
  "major",
  "grade",
  "competitionIntent",
  "experience",
] as const;

export const projectFields = [
  ["competition", t.projectCompetition],
  ["role", t.projectRole],
  ["award", t.projectAward],
  ["description", t.projectDescription],
] as const;
