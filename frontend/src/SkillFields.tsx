import { useId } from "react";
import type { Skill } from "./api/client";
import { copy as t } from "./copy";

export const skillGroups = [
  {
    label: "技术与开发",
    skills: [
      "development",
      "frontend",
      "backend",
      "mobile-development",
      "agent-development",
    ],
  },
  {
    label: "数据与建模",
    skills: [
      "data-collection",
      "data-analysis",
      "statistics",
      "mathematical-modeling",
      "machine-learning",
      "data-visualization",
    ],
  },
  {
    label: "设计与视觉",
    skills: ["design", "ui-ux", "graphic-design", "video-editing"],
  },
  {
    label: "产品与管理",
    skills: ["product-management", "user-research", "project-management"],
  },
  {
    label: "商业与金融",
    skills: [
      "market-research",
      "business-analysis",
      "business-planning",
      "finance",
    ],
  },
  {
    label: "写作与表达",
    skills: ["academic-writing", "copywriting", "slide-design", "presentation"],
  },
] satisfies { label: string; skills: Skill[] }[];

export function Tags({
  skills,
  custom = [],
}: {
  skills: Skill[];
  custom?: string[];
}) {
  if (!skills.length && !custom.length) return null;
  return (
    <ul className="tags" aria-label={t.skills}>
      {skills.map((skill) => (
        <li key={skill}>{t.skillNames[skill]}</li>
      ))}
      {custom.map((skill) => (
        <li className="custom-tag" key={"custom-" + skill}>
          {skill}
        </li>
      ))}
    </ul>
  );
}

export function Skills({
  value,
  onChange,
  error,
  grouped = false,
}: {
  value: Skill[];
  onChange: (skills: Skill[]) => void;
  error?: string;
  grouped?: boolean;
}) {
  const errorId = useId();
  const option = (skill: Skill) => (
    <label className="skill-option" key={skill}>
      <input
        type="checkbox"
        checked={value.includes(skill)}
        onChange={(event) =>
          onChange(
            event.target.checked
              ? [...value, skill]
              : value.filter((item) => item !== skill),
          )
        }
      />
      {t.skillNames[skill]}
    </label>
  );
  return (
    <fieldset
      className="skill-picker"
      aria-describedby={error ? errorId : undefined}
    >
      <legend>{t.skills}</legend>
      {grouped ? (
        skillGroups.map(({ label, skills }) => (
          <fieldset className="skill-group" key={label}>
            <legend>{label}</legend>
            <div className="skill-options">{skills.map(option)}</div>
          </fieldset>
        ))
      ) : (
        <div className="skill-options">
          {(Object.keys(t.skillNames) as Skill[]).map(option)}
        </div>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
