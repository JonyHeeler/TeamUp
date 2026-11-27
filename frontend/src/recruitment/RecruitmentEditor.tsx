import { Button } from "../ui/Button";
import { useState, type ReactNode } from "react";
import type {
  Competition,
  Recruitment,
  RecruitmentInput,
  Skill,
} from "../api/client";
import { copy as t } from "../copy";
import { Skills, Tags } from "../SkillFields";

type RequirementDraft = {
  id: string;
  skills: Skill[];
  expectation: string;
  initiallyOpen?: boolean;
};
const MAX_REQUIREMENTS = 100;
/** 生成一个可编辑的招募要求草稿。 */
const newRequirement = (): RequirementDraft => ({
  id: crypto.randomUUID(),
  skills: [],
  expectation: "",
  initiallyOpen: true,
});

/** 编辑队伍招募资料和各名额的要求。 */
export default function RecruitmentEditor({
  competitions,
  initialTeam,
  busy,
  fieldError,
  onPublish,
}: {
  competitions: Competition[];
  initialTeam?: Recruitment;
  busy: boolean;
  fieldError: (field: string) => ReactNode;
  onPublish: (team: RecruitmentInput) => void;
}) {
  const [competition, setCompetition] = useState(
    initialTeam?.competition ?? "",
  );
  const [teamName, setTeamName] = useState(initialTeam?.teamName ?? "");
  const [openings, setOpenings] = useState(initialTeam?.openings ?? "");
  const [requirements, setRequirements] = useState<RequirementDraft[]>(() =>
    (initialTeam?.requirements ?? []).map((item, index) => ({
      id: String(index),
      skills: item.skills ?? [],
      expectation: item.expectation ?? "",
    })),
  );
  const [background, setBackground] = useState(initialTeam?.background ?? "");
  const [checked, setChecked] = useState(false);

  /** 更新指定位置的招募要求。 */
  const updateRequirement = (index: number, item: RequirementDraft) =>
    setRequirements((current) =>
      current.map((entry, position) => (position === index ? item : entry)),
    );

  return (
    <form
      className="editor team-editor"
      onSubmit={(event) => {
        event.preventDefault();
        setChecked(true);
        if (
          requirements.some(
            (item) => !item.skills.length && !item.expectation.trim(),
          )
        )
          return;
        onPublish({
          competition,
          teamName: teamName.trim() || undefined,
          openings: openings.trim() || null,
          requirements: requirements.map(({ skills, expectation }) => ({
            skills,
            expectation,
          })),
          background,
        });
      }}
    >
      <div className="editor-section">
        <label>
          {t.catalogCompetition}
          <select
            value={competition}
            onChange={(event) => setCompetition(event.target.value)}
            required
          >
            <option value="" disabled>
              {t.chooseCompetition}
            </option>
            {competitions.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          {fieldError("competition")}
        </label>
        <div className="form-row">
          <label>
            {t.teamName}
            <input
              value={teamName}
              aria-label={t.teamName}
              maxLength={80}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="例如：数学建模队"
              aria-describedby="team-name-hint"
            />
            <small id="team-name-hint" className="consent">
              {t.defaultTeamNumber}
            </small>
            {fieldError("teamName")}
          </label>
          <label>
            {t.openings}
            <input
              maxLength={40}
              value={openings}
              onChange={(event) => setOpenings(event.target.value)}
              placeholder="选填，例如：1–2 人"
            />
            {fieldError("openings")}
          </label>
        </div>
        <label>
          {t.background}
          <textarea
            required
            maxLength={1200}
            value={background}
            onChange={(event) => setBackground(event.target.value)}
            placeholder={t.backgroundHint}
          />
          {fieldError("background")}
        </label>
      </div>

      <section className="editor-section" aria-labelledby="team-requirements">
        <h2 id="team-requirements">{t.requirements}</h2>
        {fieldError("requirements")}
        {requirements.map((item, index) => (
          <details
            className="position-editor"
            key={item.id}
            open={
              item.initiallyOpen ||
              (checked && !item.skills.length && !item.expectation.trim())
            }
          >
            <summary>{t.requirement(index + 1)}</summary>
            <details className="position-skills">
              <summary>
                {t.selectTags}
                {item.skills.length > 0 && (
                  <span className="badge">{item.skills.length}</span>
                )}
              </summary>
              <Skills
                grouped
                value={item.skills}
                onChange={(skills) =>
                  updateRequirement(index, { ...item, skills })
                }
              />
            </details>
            <Tags skills={item.skills} />
            <label>
              {t.expectation}
              <textarea
                maxLength={500}
                placeholder="描述希望队友具备的能力和承担的任务，例如：熟悉数据分析，负责清洗问卷数据。"
                value={item.expectation}
                onChange={(event) =>
                  updateRequirement(index, {
                    ...item,
                    expectation: event.target.value,
                  })
                }
              />
            </label>
            {checked && !item.skills.length && !item.expectation.trim() && (
              <p className="field-error">{t.pickRequirement}</p>
            )}
            {fieldError("requirements." + index)}
            <Button
              type="button"
              onClick={() =>
                setRequirements((current) =>
                  current.filter((_, position) => position !== index),
                )
              }
            >
              删除需求
            </Button>
          </details>
        ))}
        <Button
          type="button"
          disabled={requirements.length >= MAX_REQUIREMENTS}
          onClick={() => {
            const item = newRequirement();
            setRequirements((current) => [...current, item]);
          }}
        >
          添加需求
        </Button>
      </section>
      <div className="form-actions">
        <Button tone="blue" disabled={busy}>
          {initialTeam ? "保存招募" : t.create}
        </Button>
      </div>
    </form>
  );
}
