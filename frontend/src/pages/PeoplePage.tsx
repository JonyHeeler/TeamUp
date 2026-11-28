import { SummaryCard } from "../ui/SummaryCard";
import { FilterSelect } from "../ui/FilterSelect";
import { Button } from "../ui/Button";
import { useState } from "react";
import "./people.css";
import { api, type Profile, type Skill } from "../api/client";
import { copy as t } from "../copy";
import { ProfileSummary } from "../profile/ProfileViews";
import { LoadingStatus } from "./LoadingStatus";
import { SkillFilter } from "./SkillFilter";
import { SkillSearch, useSkillSearch } from "./SkillSearch";
import type { TeamDiscovery } from "./teamDiscovery";
import PersonDialog from "./PersonDialog";
import { Feedback, Heading, useAction, type PageProps } from "./shared";

/** 按公开资料筛选同学并发出组队邀请。 */
export default function PeoplePage({
  me,
  unfiltered,
}: Pick<PageProps, "me"> & { unfiltered: TeamDiscovery["profiles"] }) {
  const { run } = useAction();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState("");
  const list = useSkillSearch(api.profiles, search, unfiltered);
  const [collegeFilter, setCollegeFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [person, setPerson] = useState<Profile | null>(null);
  const people = unfiltered.data?.items ?? [];
  const colleges = [
    ...new Set(
      people.flatMap((entry) => (entry.college ? [entry.college] : [])),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh"));
  const grades = [
    ...new Set(people.flatMap((entry) => (entry.grade ? [entry.grade] : []))),
  ].sort((a, b) => a.localeCompare(b, "zh"));
  const waiting = !list.error && (!list.data || list.pending);
  const matchingPeople = (list.data?.items ?? []).filter(
    (entry) =>
      entry.userId !== me?.userId &&
      (!gradeFilter || entry.grade === gradeFilter) &&
      (!skills.length ||
        entry.skills.some((skill) => skills.includes(skill))) &&
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
        <SkillSearch value={search} onChange={setSearch} />
        <SkillFilter value={skills} onChange={setSkills} />
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
      <div className="results" aria-busy={waiting}>
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
        {!matchingPeople.length &&
          !list.error &&
          (waiting ? (
            <LoadingStatus />
          ) : (
            <p className="empty">{t.emptyPeople}</p>
          ))}
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
