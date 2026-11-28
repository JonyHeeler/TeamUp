import { useState } from "react";
import type { Skill } from "../api/client";
import { copy as t } from "../copy";
import { skillGroups } from "../SkillFields";
import { Button } from "../ui/Button";
import { Dialog } from "./shared";
import "./skill-filter.css";

const presetGroups = skillGroups.map(({ label, skills }) => ({
  label,
  options: skills.map((value) => ({ value, label: t.skillNames[value] })),
}));

/** 通过分类弹窗选择任一可匹配的技能。 */
export function SkillFilter({
  value,
  onChange,
}: {
  value: Skill[];
  onChange: (skills: Skill[]) => void;
}) {
  const [draft, setDraft] = useState<Skill[] | null>(null);
  const selected = value.length ? `已选 ${value.length} 项` : t.allSkills;

  return (
    <>
      <button
        type="button"
        className="filter-trigger"
        aria-label={t.filter}
        aria-description={selected}
        aria-haspopup="dialog"
        aria-expanded={draft !== null}
        data-filtered={value.length ? "" : undefined}
        onClick={() => setDraft(value)}
      >
        <span className="filter-trigger-text">
          <span className="filter-category">{t.skills}</span>
          <span>{selected}</span>
        </span>
        <span className="filter-chevron" aria-hidden="true">
          <span className="chevron" />
        </span>
      </button>
      {draft && (
        <Dialog
          className="skill-filter-dialog"
          title={t.filter}
          closeLabel={t.close}
          close={() => setDraft(null)}
        >
          {(dismiss) => (
            <>
              <div className="skill-filter-groups skill-picker">
                {presetGroups.map(({ label, options }) => (
                  <fieldset className="skill-group" key={label}>
                    <legend>{label}</legend>
                    <div className="skill-options">
                      {options.map(({ value, label }) => (
                        <label className="skill-option" key={value}>
                          <input
                            type="checkbox"
                            checked={draft.includes(value)}
                            onChange={(event) =>
                              setDraft(
                                event.target.checked
                                  ? [...draft, value]
                                  : draft.filter((item) => item !== value),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="skill-filter-actions">
                <button
                  type="button"
                  className="back"
                  disabled={!draft.length}
                  onClick={() => setDraft([])}
                >
                  清空
                </button>
                <Button
                  type="button"
                  onClick={() => {
                    onChange(draft);
                    dismiss();
                  }}
                >
                  {draft.length
                    ? `匹配任一选中技能（${draft.length}）`
                    : "显示全部技能"}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
