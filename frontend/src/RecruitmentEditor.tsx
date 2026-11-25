import { Button } from "./ui/Button";
import { useRef, useState, type ReactNode } from "react";
import type {
  Competition,
  Recruitment,
  RecruitmentDuration,
  RecruitmentInput,
  Skill,
} from "./api/client";
import { copy as t } from "./copy";
import { Skills, Tags } from "./SkillFields";

type RequirementDraft = {
  id: string;
  skills: Skill[];
  expectation: string;
  expanded: boolean;
};

const MAX_POSITIONS = 100;

export default function RecruitmentEditor({
  competitions,
  initialTeam,
  busy,
  fieldError,
  onPublish,
  submitLabel,
  extraSection,
  showPublishToggle = false,
  publishRecruitment = true,
  onPublishToggle,
  showDurationPicker = false,
}: {
  competitions: Competition[];
  initialTeam?: Recruitment;
  busy: boolean;
  fieldError: (field: string) => ReactNode;
  onPublish: (team: RecruitmentInput) => void;
  submitLabel?: string;
  extraSection?: ReactNode;
  showPublishToggle?: boolean;
  publishRecruitment?: boolean;
  onPublishToggle?: (publish: boolean) => void;
  showDurationPicker?: boolean;
}) {
  const nextId = useRef(0);
  const makeId = () => `req-${++nextId.current}`;
  const [competition, setCompetition] = useState(
    initialTeam?.competition ?? "",
  );
  const [teamName, setTeamName] = useState(initialTeam?.teamName ?? "");
  const [openings, setOpenings] = useState(initialTeam?.openings ?? "");
  const [requirements, setRequirements] = useState<RequirementDraft[]>(() =>
    (initialTeam?.requirements ?? []).slice(0, MAX_POSITIONS).map((item) => ({
      id: makeId(),
      skills: [...(item.skills ?? [])],
      expectation: item.expectation ?? "",
      expanded: false,
    })),
  );
  const [requirementsOpen, setRequirementsOpen] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [background, setBackground] = useState(initialTeam?.background ?? "");
  const [durationDays, setDurationDays] = useState<RecruitmentDuration>(14);
  const [checked, setChecked] = useState(false);

  const updateRequirement = (
    id: string,
    patch: Partial<Omit<RequirementDraft, "id">>,
  ) =>
    setRequirements((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  const addRequirement = () => {
    if (requirements.length >= MAX_POSITIONS) return;
    setRequirementsOpen(true);
    setConfirmDeleteId(null);
    setRequirements((current) => [
      ...current,
      { id: makeId(), skills: [], expectation: "", expanded: true },
    ]);
  };

  const removeRequirement = (id: string) => {
    setConfirmDeleteId((current) => (current === id ? null : current));
    setRequirements((current) => current.filter((entry) => entry.id !== id));
  };

  const showRecruitmentFields = !showPublishToggle || publishRecruitment;

  return (
    <form
      className="editor team-editor"
      onSubmit={(event) => {
        event.preventDefault();
        setChecked(true);
        if (showRecruitmentFields) {
          const invalidIds = new Set(
            requirements
              .filter((item) => !item.skills.length && !item.expectation.trim())
              .map((item) => item.id),
          );
          if (invalidIds.size > 0) {
            setRequirementsOpen(true);
            setRequirements((current) =>
              current.map((item) =>
                invalidIds.has(item.id) ? { ...item, expanded: true } : item,
              ),
            );
            return;
          }
        }
        onPublish({
          competition,
          teamName: teamName.trim() || undefined,
          openings: showRecruitmentFields
            ? openings.trim() || undefined
            : undefined,
          requirements: showRecruitmentFields
            ? requirements.map(({ skills, expectation }) => ({
                skills,
                expectation,
              }))
            : [],
          background,
          ...(showDurationPicker && showRecruitmentFields
            ? { durationDays }
            : {}),
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
        <div className={showRecruitmentFields ? "form-row" : undefined}>
          <label>
            {t.teamName}
            <input
              value={teamName}
              maxLength={80}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder={t.defaultTeamNumber}
            />
            {fieldError("teamName")}
          </label>
          {showRecruitmentFields && (
            <label>
              {t.openings}
              <input
                type="text"
                maxLength={40}
                value={openings}
                placeholder={t.openingsPlaceholder}
                onChange={(event) => setOpenings(event.target.value)}
              />
              {fieldError("openings")}
            </label>
          )}
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
          {fieldError("description")}
        </label>
        {showDurationPicker && showRecruitmentFields && (
          <label>
            {t.recruitmentDuration}
            <select
              value={durationDays}
              disabled={busy}
              onChange={(event) =>
                setDurationDays(
                  Number(event.target.value) as RecruitmentDuration,
                )
              }
            >
              {([7, 14, 30] as const).map((days) => (
                <option key={days} value={days}>
                  {t.durationOption(days)}
                </option>
              ))}
            </select>
            {fieldError("durationDays")}
          </label>
        )}
        {showPublishToggle && onPublishToggle && (
          <div className="publish-recruitment-toggle">
            <label className="visibility">
              <span>{t.publishRecruitmentToggle}</span>
              <input
                type="checkbox"
                role="switch"
                checked={publishRecruitment}
                disabled={busy}
                onChange={(event) => onPublishToggle(event.target.checked)}
              />
            </label>
            <small className="consent">{t.publishRecruitmentHint}</small>
          </div>
        )}
      </div>

      {showRecruitmentFields && (
        <section className="editor-section" aria-labelledby="team-requirements">
          <div className="requirements-header">
            <button
              type="button"
              id="team-requirements"
              className="requirements-toggle"
              aria-expanded={requirementsOpen}
              onClick={() => setRequirementsOpen((open) => !open)}
            >
              <span>{t.requirementsTitle(requirements.length)}</span>
              <span
                className={`collapse-chevron${requirementsOpen ? " open" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
          {fieldError("requirements")}
          {requirementsOpen && (
            <div className="requirements-list">
              {requirements.map((item, index) => {
                const hasContent =
                  item.skills.length > 0 || item.expectation.trim().length > 0;
                const isConfirmingDelete = confirmDeleteId === item.id;
                const itemFieldError = fieldError("requirements." + index);
                return (
                  <div className="position-editor" key={item.id}>
                    <div className="requirement-card-header">
                      <button
                        type="button"
                        className="requirement-toggle"
                        aria-expanded={item.expanded}
                        onClick={() =>
                          updateRequirement(item.id, {
                            expanded: !item.expanded,
                          })
                        }
                      >
                        <strong className="requirement-label">
                          {t.requirement(index + 1)}
                        </strong>
                        <span
                          className={`collapse-chevron${item.expanded ? " open" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                      <div className="requirement-delete-actions">
                        {isConfirmingDelete ? (
                          <>
                            <button
                              type="button"
                              className="requirement-delete-confirm"
                              disabled={busy}
                              onClick={() => removeRequirement(item.id)}
                            >
                              {t.confirmDelete}
                            </button>
                            <button
                              type="button"
                              className="requirement-delete-cancel"
                              disabled={busy}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              {t.cancel}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="requirement-delete"
                            aria-label={t.removeRequirement(index + 1)}
                            disabled={busy}
                            onClick={() =>
                              hasContent
                                ? setConfirmDeleteId(item.id)
                                : removeRequirement(item.id)
                            }
                          >
                            {t.removeImage}
                          </button>
                        )}
                      </div>
                    </div>
                    {item.expanded && (
                      <div className="requirement-card-body">
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
                              updateRequirement(item.id, { skills })
                            }
                          />
                        </details>
                        <Tags skills={item.skills} />
                        <label>
                          {t.expectation}
                          <textarea
                            maxLength={500}
                            value={item.expectation}
                            onChange={(event) =>
                              updateRequirement(item.id, {
                                expectation: event.target.value,
                              })
                            }
                          />
                        </label>
                        {checked && !hasContent && (
                          <p className="field-error">{t.pickRequirement}</p>
                        )}
                        {itemFieldError}
                      </div>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                disabled={busy || requirements.length >= MAX_POSITIONS}
                onClick={addRequirement}
              >
                {t.addRequirement}
              </Button>
            </div>
          )}
        </section>
      )}
      {extraSection}
      <div className="form-actions">
        <Button tone="blue" disabled={busy}>
          {submitLabel ?? (initialTeam ? "保存招募" : t.create)}
        </Button>
      </div>
    </form>
  );
}

export function RecruitmentDetails({
  recruitment,
}: {
  recruitment: Recruitment;
}) {
  return (
    <>
      {recruitment.teamName !== recruitment.teamNumber && (
        <span className="team-competition">
          {t.teamNumber} {recruitment.teamNumber}
        </span>
      )}
      <p className="body-text">{recruitment.background}</p>
      {recruitment.requirements.length > 0 ? (
        <section className="recruitment-positions" aria-label={t.requirements}>
          <h3>{t.requirements}</h3>
          <ol>
            {recruitment.requirements.map((item, index) => (
              <li key={index}>
                <strong>{t.requirement(index + 1)}</strong>
                <Tags skills={item.skills ?? []} />
                {item.expectation && (
                  <p className="body-text">{item.expectation}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : recruitment.skills.length > 0 ? (
        <Tags skills={recruitment.skills} />
      ) : null}
    </>
  );
}
