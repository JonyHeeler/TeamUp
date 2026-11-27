import { copy } from "../copy";
import type { Profile } from "../api/client";

const programmingTerms = new Set([
  "编程",
  "代码",
  "开发",
  "programming",
  "coding",
  "development",
]);
const programmingSkills =
  /编程|代码|开发|programming|coding|development|前端|后端|front[ -]?end|back[ -]?end|\b(?:python|javascript|typescript|java|rust|react|vue|sql)\b/iu;

/** 匹配预设及自定义技能，并将宽泛的编程词映射到相关技能。 */
export function matchesSkill(profile: Profile, query: string): boolean {
  const term = query.trim().normalize("NFKC").toLowerCase();
  if (!term) return true;
  const labels = [
    ...profile.skills,
    ...profile.skills.map((skill) => copy.skillNames[skill]),
    ...(profile.customSkills ?? []),
  ];
  const matchesText = [...labels, profile.contribution].some((value) =>
    value.normalize("NFKC").toLowerCase().includes(term),
  );
  return (
    matchesText ||
    (programmingTerms.has(term) &&
      labels.some((value) => programmingSkills.test(value))) ||
    (term === "前端" &&
      labels.some((value) => /front[ -]?end|\b(?:react|vue)\b/iu.test(value)))
  );
}
