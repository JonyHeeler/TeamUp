import type { Profile, Skill } from "../api/client";
import { copy as t } from "../copy";
import { skillGroups } from "../SkillFields";

export const SKILL_GROUP_PREFIX = "group:";

export type SkillFilterValue =
  | ""
  | Skill
  | `${typeof SKILL_GROUP_PREFIX}${string}`;

export type PeopleFilterCriteria = {
  skillFilter: SkillFilterValue;
  skillKeyword: string;
  collegeFilter: string;
  gradeFilter: string;
  currentUserId?: string;
};

export function toSkillGroupFilterValue(label: string): SkillFilterValue {
  return `${SKILL_GROUP_PREFIX}${label}`;
}

export function buildSkillFilterGroups() {
  return skillGroups.map(({ label, skills }) => ({
    label,
    options: [
      {
        value: toSkillGroupFilterValue(label),
        label: t.allSkillGroup(label),
      },
      ...skills.map((value) => ({
        value,
        label: t.skillNames[value],
      })),
    ],
  }));
}

export function matchesSkillFilter(
  profile: Profile,
  skillFilter: SkillFilterValue,
): boolean {
  if (!skillFilter) return true;
  const skills = profile.skills ?? [];
  if (skillFilter.startsWith(SKILL_GROUP_PREFIX)) {
    const groupLabel = skillFilter.slice(SKILL_GROUP_PREFIX.length);
    const group = skillGroups.find((item) => item.label === groupLabel);
    if (!group) return false;
    return group.skills.some((code) => skills.includes(code));
  }
  return skills.includes(skillFilter as Skill);
}

export function matchesSkillKeyword(
  profile: Profile,
  rawKeyword: string,
): boolean {
  const keyword = rawKeyword.trim().toLowerCase();
  if (!keyword) return true;
  const officialMatched = (profile.skills ?? []).some((code) =>
    (t.skillNames[code] ?? "").toLowerCase().includes(keyword),
  );
  if (officialMatched) return true;
  return (profile.customSkills ?? []).some((item) =>
    item.toLowerCase().includes(keyword),
  );
}

export function filterPeople(
  people: Profile[],
  {
    skillFilter,
    skillKeyword,
    collegeFilter,
    gradeFilter,
    currentUserId,
  }: PeopleFilterCriteria,
): Profile[] {
  return people.filter(
    (entry) =>
      entry.userId !== currentUserId &&
      matchesSkillFilter(entry, skillFilter) &&
      matchesSkillKeyword(entry, skillKeyword) &&
      (!collegeFilter || entry.college === collegeFilter) &&
      (!gradeFilter || entry.grade === gradeFilter),
  );
}
