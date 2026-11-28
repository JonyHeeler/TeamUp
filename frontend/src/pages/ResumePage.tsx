import { Button } from "../ui/Button";
import { showToast } from "../ui/ActionToast";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import {
  resumeSections as sections,
  type ResumeSection as Section,
} from "./resumeSections";
import { copy as t } from "../copy";
import { Tags } from "../SkillFields";
import {
  Alert,
  Back,
  Feedback,
  Heading,
  useResource,
  type PageProps,
} from "./shared";
import "./resume.css";

const labels: Record<Section, string> = {
  college: "学院",
  major: "专业",
  grade: "年级",
  qq: "QQ",
  competitionIntent: "比赛意向",
  contribution: "自我介绍",
  skills: "技能",
  experience: "经历",
  projects: "项目经历",
  evidence: "经历证明",
  credit: "平台标识",
};

import { LoadingStatus } from "./LoadingStatus";

/** 预览按用户选择字段生成的简历。 */
export default function ResumePage({ me, navigate }: PageProps) {
  const profile = useResource(api.ownProfile, Boolean(me));
  const [name, setName] = useState("");
  const [visible, setVisible] = useState<Record<Section, boolean>>(
    () =>
      Object.fromEntries(sections.map((key) => [key, key !== "qq"])) as Record<
        Section,
        boolean
      >,
  );
  const p = profile.data;
  const hasEvidence = !!p && visible.evidence && p.evidenceIds.length > 0;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [evidence, setEvidence] = useState<{
    urls: string[];
    error: boolean;
    ready: boolean;
  }>({ urls: [], error: false, ready: false });
  useEffect(() => {
    if (!p || !me) return;
    let active = true;
    const urls: string[] = [];
    setEvidence({ urls: [], error: false, ready: false });
    void Promise.all(
      p.evidenceIds.map(async (id) => {
        const blob = await api.evidence(me.userId, id);
        if (!active) return "";
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return url;
      }),
    )
      .then((results) => {
        if (active) setEvidence({ urls: results, error: false, ready: true });
      })
      .catch(() => {
        if (active) setEvidence({ urls: [], error: true, ready: true });
      });
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [p, me]);
  /** 准备图片数据并下载简历 PDF。 */
  async function exportResume() {
    if (!p || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const { downloadResume } = await import("./resumePdf");
      await downloadResume({
        name,
        profile: p,
        visible,
        evidenceUrls: evidence.urls,
      });
      showToast("简历 PDF 已导出", "success");
    } catch {
      setExportError("简历生成失败，请重试。");
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <div className="resume-controls">
        <Back label={t.center} onClick={() => navigate("/center")} />
        <Heading title="个人简历" />
        {!me ? (
          <p>{t.needPersona}</p>
        ) : profile.error ? (
          <Alert message={profile.error} />
        ) : !p ? (
          <LoadingStatus />
        ) : (
          <div className="editor resume-settings">
            <label className="resume-name">
              简历姓名
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={p.nickname}
                maxLength={80}
              />
            </label>
            <fieldset>
              <legend>选择简历中展示的内容</legend>
              <div className="resume-options">
                {sections.map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={visible[key]}
                      onChange={(event) =>
                        setVisible({ ...visible, [key]: event.target.checked })
                      }
                    />
                    {labels[key]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-actions">
              <Button
                tone="blue"
                disabled={
                  exporting ||
                  (hasEvidence && (!evidence.ready || evidence.error))
                }
                onClick={() => void exportResume()}
              >
                {exporting ? "正在生成 PDF…" : "导出 PDF"}
              </Button>
            </div>
            {visible.evidence && evidence.error && (
              <Alert message="经历证明加载失败，请刷新重试，或取消勾选经历证明。" />
            )}
            <Feedback
              error={exportError}
              onDismiss={() => setExportError("")}
            />
          </div>
        )}
      </div>
      {p && me && (
        <article className="resume-sheet" aria-label="简历预览">
          <header>
            <h1>{name.trim() || p.nickname}</h1>
            <p>
              {[
                visible.college && p.college,
                visible.major && p.major,
                visible.grade && p.grade,
                visible.qq && p.qq && `QQ ${p.qq}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>
          {visible.contribution && p.contribution && (
            <section>
              <h2>自我介绍</h2>
              <p>{p.contribution}</p>
            </section>
          )}
          {visible.competitionIntent && p.competitionIntent && (
            <section>
              <h2>比赛意向</h2>
              <p>{p.competitionIntent}</p>
            </section>
          )}
          {visible.skills &&
            (p.skills.length > 0 || (p.customSkills?.length ?? 0) > 0) && (
              <section>
                <h2>技能</h2>
                <Tags skills={p.skills} custom={p.customSkills} />
              </section>
            )}
          {visible.experience && p.experience && (
            <section>
              <h2>经历</h2>
              <p>{p.experience}</p>
            </section>
          )}
          {visible.projects && (p.projects?.length ?? 0) > 0 && (
            <section>
              <h2>项目经历</h2>
              {p.projects?.map((project, index) => (
                <div className="resume-project" key={index}>
                  <h3>{project.competition}</h3>
                  <p>
                    {[project.role, project.award].filter(Boolean).join(" · ")}
                  </p>
                  {project.description && <p>{project.description}</p>}
                </div>
              ))}
            </section>
          )}
          {hasEvidence && (
            <section className="resume-tail">
              <h2>经历证明</h2>
              <div className="resume-evidence">
                {evidence.urls.map((url, index) => (
                  <img
                    className="proof-preview"
                    key={url}
                    src={url}
                    alt={t.evidenceLabel(index + 1)}
                  />
                ))}
              </div>
            </section>
          )}
          {visible.credit && <ResumeCredit />}
        </article>
      )}
    </>
  );
}

/** 显示可选的平台署名。 */
function ResumeCredit() {
  return (
    <footer>
      <img src="/brand/high-five-mark.svg" alt="" />
      <span>一拍即合 TeamUP</span>
    </footer>
  );
}
