import { CardFacts, SummaryCard } from "../ui/SummaryCard";
import { FilterSelect } from "../ui/FilterSelect";
import { Button } from "../ui/Button";
import { useState } from "react";
import { api, type Recruitment, type Skill } from "../api/client";
import { Tags } from "../SkillFields";
import "./people.css";
import { copy as t } from "../copy";
import { RecruitmentDetails } from "../recruitment/RecruitmentDetails";
import { LoadingStatus } from "./LoadingStatus";
import type { TeamDiscovery } from "./teamDiscovery";
import { SkillFilter } from "./SkillFilter";
import { SkillSearch, useSkillSearch } from "./SkillSearch";
import {
  Alert,
  Dialog,
  IntentMessage,
  Feedback,
  Heading,
  teamsHref,
  useAction,
  type Notice,
  type PageProps,
} from "./shared";

/** 浏览招募并提交加入申请。 */
export default function TeamsPage({
  me,
  navigate,
  competitionId,
  discovery,
}: PageProps & {
  competitionId: string;
  discovery: TeamDiscovery;
}) {
  const { catalog, recruitments } = discovery;
  const { busy, run, clear, setError, error, fieldError } = useAction();
  const [notice, setNotice] = useState<Notice>();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState("");
  const list = useSkillSearch(api.recruitments, search, recruitments);
  const [team, setTeam] = useState<Recruitment | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");

  /** 加载选中的招募详情。 */
  function openTeam(entry: Recruitment) {
    clear();
    setMessage("");
    setApplying(false);
    setTeam(entry);
  }

  /** 关闭队伍详情并清除申请表单状态。 */
  function closeTeam() {
    clear();
    setTeam(null);
  }
  const competitions = catalog.data?.items ?? [];
  const competition =
    competitions.find((item) => item.id === competitionId)?.name ?? "";
  const waitingForCompetition = Boolean(
    competitionId && !catalog.data && !catalog.error,
  );
  const matchingTeams = (waitingForCompetition ? [] : (list.data?.items ?? []))
    .filter(
      (entry) =>
        (!competition || entry.competition === competition) &&
        (!skills.length ||
          entry.skills.some((skill) => skills.includes(skill))),
    )
    .sort(
      (first, second) =>
        Date.parse(second.createdAt) - Date.parse(first.createdAt),
    );
  const feedback = list.error || catalog.error;
  const waiting =
    !list.error && (waitingForCompetition || !list.data || list.pending);

  return (
    <>
      <Heading title={t.teams} />
      <div className="view-tools">
        <SkillSearch value={search} onChange={setSearch} />
        <FilterSelect
          label={t.filterCompetition}
          category={t.catalogCompetition}
          value={competition}
          onChange={(value) => {
            clear();
            setNotice(undefined);
            navigate(
              teamsHref(competitions.find((item) => item.name === value)?.id),
            );
          }}
          all={t.allCompetitions}
          options={competitions.map((item) => ({
            value: item.name,
            label: item.name,
          }))}
        />
        <SkillFilter value={skills} onChange={setSkills} />
      </div>
      {!team && (
        <Feedback
          error={feedback}
          notice={notice}
          onDismiss={() => {
            clear();
            setNotice(undefined);
          }}
        />
      )}
      <div className="results" aria-busy={waiting}>
        {matchingTeams.map((entry) => (
          <SummaryCard
            key={entry.id}
            title={entry.teamName}
            badge={
              entry.ownerId === me?.userId && (
                <span className="badge">{t.yourTeam}</span>
              )
            }
            actions={
              <Button onClick={() => openTeam(entry)}>{t.viewTeam}</Button>
            }
          >
            <CardFacts
              items={[
                [t.catalogCompetition, entry.competition],
                ...(entry.openings
                  ? [[t.openings, entry.openings] as [string, string]]
                  : []),
              ]}
            />
            <p className="profile-card-summary">{entry.background}</p>
            <Tags skills={entry.skills.slice(0, 4)} />
          </SummaryCard>
        ))}
        {!matchingTeams.length &&
          !list.error &&
          (waiting ? (
            <LoadingStatus />
          ) : (
            <p className="empty">
              {competition || skills.length || search.trim()
                ? t.emptyMatches
                : t.emptyTeams}
            </p>
          ))}
      </div>
      {team && (
        <Dialog
          title={team.teamName}
          closeLabel={t.close}
          close={closeTeam}
          busy={busy}
          className="team-detail-dialog"
        >
          {(dismiss) => (
            <>
              <Alert message={error} />
              <RecruitmentDetails recruitment={team} />
              {team.ownerId === me?.userId ? (
                <span className="owned">{t.yourTeam}</span>
              ) : applying ? (
                <form
                  className="dialog-section motion-reveal"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(
                      () =>
                        api.createIntent({
                          kind: "apply",
                          recruitmentId: team.id,
                          message,
                        }),
                      dismiss,
                      {
                        success: (result) =>
                          result.created === false
                            ? "已有加入申请"
                            : "申请已发送",
                      },
                    );
                  }}
                >
                  <IntentMessage
                    value={message}
                    onChange={setMessage}
                    kind="apply"
                    error={fieldError("message")}
                  />
                  <div className="team-apply-actions">
                    <small className="consent">{t.share}</small>
                    <Button tone="blue" disabled={busy}>
                      {t.sendApplication}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="dialog-section team-apply-actions">
                  <small className="consent">{t.share}</small>
                  <Button
                    tone="blue"
                    onClick={() =>
                      me ? setApplying(true) : setError(t.needPersona)
                    }
                  >
                    {t.apply}
                  </Button>
                </div>
              )}
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
