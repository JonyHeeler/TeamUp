import { useId } from "react";
import type { Skill } from "./api/client";
import { copy as t } from "./copy";

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
}: {
  value: Skill[];
  onChange: (skills: Skill[]) => void;
  error?: string;
}) {
  const errorId = useId();
  return (
    <fieldset
      className="skill-picker"
      aria-describedby={error ? errorId : undefined}
    >
      <legend>{t.skills}</legend>
      <div>
        {(Object.keys(t.skillNames) as Skill[]).map((skill) => (
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
        ))}
      </div>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
