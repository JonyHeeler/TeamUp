import type { OwnProfile, Profile } from "./types";

/** Projects a profile according to its visibility settings. */
export const publicProfile = (p: OwnProfile, withEvidence = false): Profile => {
  const result: Profile = {
    userId: p.userId,
    nickname: p.nickname,
    skills: p.skills,
    contribution: p.contribution,
    customSkills: p.customSkills,
  };
  if (p.publicFields.qq !== false && p.qq) result.qq = p.qq;
  for (const field of [
    "college",
    "major",
    "grade",
    "experience",
    "competitionIntent",
  ] as const) {
    if (p.publicFields[field] && p[field]) result[field] = p[field];
  }
  if (p.publicFields.experience && p.projects?.length)
    result.projects = p.projects;
  if (withEvidence && p.publicFields.experience && p.evidenceIds.length)
    result.evidenceIds = p.evidenceIds;
  return result;
};
