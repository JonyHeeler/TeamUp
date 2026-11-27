import { SummaryCard } from "../ui/SummaryCard";
import { FilterSelect } from "../ui/FilterSelect";
import { Button } from "../ui/Button";
import { useState } from "react";
import "./people.css";
import { api, type Profile, type Skill } from "../api/client";
import { copy as t } from "../copy";
import { ProfileSummary } from "../profile/ProfileViews";
import { skillGroups } from "../SkillFields";
import { matchesSkill } from "../profile/skillSearch";
import PersonDialog from "./PersonDialog";
import {
  Feedback,
  Heading,
  useAction,
  useResource,
  type PageProps,
} from "./shared";

/** 按公开资料筛选同学并发出组队邀请。 */
export default function PeoplePage({ me }: Pick<PageProps, "me">) {
  const list = useResource(api.profiles);
  const { run } = useAction();
  const [skill, setSkill] = useState("");
  const [search, setSearch] = useState("");
  const [collegeFilter, setCollegeFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [person, setPerson] = useState<Profile | null>(null);
  const people = list.data?.items ?? [];
  const customSkills = [
    ...new Set(people.flatMap((entry) => entry.customSkills ?? [])),
  ].sort((a, b) => a.localeCompare(b, "zh"));
  const colleges = [
    ...new Set(
      people.flatMap((entry) => (entry.college ? [entry.college] : [])),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh"));
  const grades = [
    ...new Set(people.flatMap((entry) => (entry.grade ? [entry.grade] : []))),
  ].sort((a, b) => a.localeCompare(b, "zh"));
  const matchingPeople = people.filter(
    (entry) =>
      entry.userId !== me?.userId &&
      (!gradeFilter || entry.grade === gradeFilter) &&
      (!skill ||
        (skill.startsWith("custom:")
          ? entry.customSkills?.includes(skill.slice("custom:".length))
          : entry.skills.includes(skill as Skill))) &&
      matchesSkill(entry, search) &&
      (!collegeFilter || entry.college === collegeFilter),
  );

  /** 加载所选候选人的公开名片。 */
  function openProfile(userId: string) {
    void run(() => api.profile(userId), setPerson, false);
  }

  return (
    <>
      <Heading title={t.people} />
      <div className="view-tools">
        <label className="skill-search">
          <span>搜索技能</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="技能或关键词"
          />
        </label>
        <FilterSelect
          label={t.filter}
          category={t.skills}
          value={skill}
          onChange={setSkill}
          all={t.allSkills}
          groups={[
            ...skillGroups.map(({ label, skills }) => ({
              label,
              options: skills.map((value) => ({
                value,
                label: t.skillNames[value],
              })),
            })),
            ...(customSkills.length
              ? [
                  {
                    label: t.customSkills,
                    options: customSkills.map((label) => ({
                      value: "custom:" + label,
                      label,
                    })),
                  },
                ]
              : []),
          ]}
        />
        <FilterSelect
          label={t.filterCollege}
          category={t.college}
          value={collegeFilter}
          onChange={setCollegeFilter}
          all={t.allColleges}
          options={colleges.map((value) => ({ value, label: value }))}
        />
        <FilterSelect
          label="按年级筛选"
          category={t.grade}
          value={gradeFilter}
          onChange={setGradeFilter}
          all="全部年级"
          options={grades.map((value) => ({ value, label: value }))}
        />
      </div>
      {!person && <Feedback error={list.error} />}
      <div className="results">
        {matchingPeople.map((entry) => (
          <SummaryCard
            key={entry.userId}
            title={entry.nickname}
            actions={
              <Button onClick={() => openProfile(entry.userId)}>
                {t.card}
              </Button>
            }
          >
            <ProfileSummary profile={entry} />
          </SummaryCard>
        ))}
        {!matchingPeople.length && !list.error && (
          <p className="empty">{list.data ? t.emptyPeople : t.loading}</p>
        )}
      </div>
      {person && (
        <PersonDialog
          key={person.userId}
          person={person}
          canSend={Boolean(me)}
          close={() => setPerson(null)}
        />
      )}
    </>
  );
}
