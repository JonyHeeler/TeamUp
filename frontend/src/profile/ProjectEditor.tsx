import { useState, type ReactNode } from "react";
import type { ProfileInput } from "../api/client";
import { copy as t } from "../copy";
import { Button } from "../ui/Button";
import { projectFields } from "./fields";

type Project = NonNullable<ProfileInput["projects"]>[number];

/** 编辑名片中的项目经历。 */
export default function ProjectEditor({
  projects,
  setProjects,
  fieldError,
}: {
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  fieldError: (field: string) => ReactNode;
}) {
  const [addedIndex, setAddedIndex] = useState<number>();
  return (
    <div className="custom-editor">
      {projects.map((project, index) => (
        <fieldset
          className="project-editor"
          key={index}
          data-project-reveal={index === addedIndex || undefined}
        >
          <legend>
            {t.project} {index + 1}
          </legend>
          {projectFields.map(([field, label]) => {
            const props = {
              value: project[field] ?? "",
              /** 更新当前项目的单个表单字段。 */
              onChange: (
                event: React.ChangeEvent<
                  HTMLInputElement | HTMLTextAreaElement
                >,
              ) =>
                setProjects(
                  projects.map((item, position) =>
                    position === index
                      ? { ...item, [field]: event.target.value }
                      : item,
                  ),
                ),
            };
            return (
              <label key={field}>
                {label}
                {field === "description" ? (
                  <textarea {...props} maxLength={500} />
                ) : (
                  <input
                    {...props}
                    required={field === "competition"}
                    maxLength={80}
                  />
                )}
                {fieldError(`projects.${index}.${field}`)}
              </label>
            );
          })}
          <Button
            type="button"

            aria-label={t.removeProject + " " + (index + 1)}
            onClick={() => {
              setAddedIndex(undefined);
              setProjects(projects.filter((_, position) => position !== index));
            }}
          >
            {t.removeProject}
          </Button>
        </fieldset>
      ))}
      {projects.length < 20 && (
        <Button
          type="button"

          onClick={() => {
            setAddedIndex(projects.length);
            setProjects([
              ...projects,
              { competition: "", role: "", award: "", description: "" },
            ]);
          }}
        >
          {t.addProject}
        </Button>
      )}
      {fieldError("projects")}
    </div>
  );
}
