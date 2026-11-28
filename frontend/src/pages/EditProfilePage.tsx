import { useEffect, useRef, useState } from "react";
import { ApiError, api, type Me, type ProfileInput } from "../api/client";
import { copy as t } from "../copy";
import ProfileEditor from "../ProfileEditor";
import EvidenceImage from "../EvidenceImage";
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_COUNT,
  EvidenceError,
  prepareEvidence,
  type EvidenceDraft,
  type ImageProblem,
} from "../evidence";
import { showToast } from "../ui/ActionToast";
import { Alert, Back, Heading, useAction, type PageProps } from "./shared";

import { LoadingStatus } from "./LoadingStatus";

/** 加载并保存当前用户的名片草稿。 */
export default function EditProfilePage({
  me,
  navigate,
  updateMe,
  refreshCenter,
}: PageProps & {
  updateMe: (user: Me) => void;
  refreshCenter: () => Promise<void>;
}) {
  const { run, busy, error, fieldError, fieldErrors, setFieldErrors } =
    useAction();
  const [profile, setProfile] = useState<ProfileInput | null>(null);
  const [creating, setCreating] = useState(false);
  const [proofs, setProofs] = useState<EvidenceDraft[]>([]);
  const [preparingImages, setPreparingImages] = useState(false);
  const [imageProblem, setImageProblem] = useState<ImageProblem | null>(null);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    if (me)
      void run(
        async () => {
          try {
            const {
              userId: _userId,
              listed: _listed,
              evidenceIds,
              ...details
            } = await api.ownProfile();
            return {
              draft: {
                ...details,
                college: details.college ?? "",
                major: details.major ?? "",
                grade: details.grade ?? "",
                qq: details.qq ?? "",
              },
              evidenceIds,
              isNew: false,
            };
          } catch (error) {
            if (!(error instanceof ApiError) || error.code !== "not_found")
              throw error;
            return {
              draft: {
                nickname: "kind" in me ? "" : me.nickname,
                college: "",
                major: "",
                grade: "",
                qq: "",
                contribution: "",
                skills: [],
                publicFields: {
                  qq: true,
                  college: true,
                  major: false,
                  grade: false,
                  experience: false,
                  competitionIntent: false,
                },
              },
              evidenceIds: [],
              isNew: "kind" in me,
            };
          }
        },
        ({ draft, evidenceIds, isNew }) => {
          setProfile(draft);
          setCreating(isNew);
          setProofs(evidenceIds.map((id) => ({ id })));
        },
        false,
      );
    return () => {
      active.current = false;
    };
    // The session shell remounts this page when its active identity changes.
  }, [me]);

  /** 准备新增证明图片并更新草稿。 */
  async function addImages(files: File[]) {
    if (!files.length) return;
    if (files.length + proofs.length > EVIDENCE_COUNT) {
      setImageProblem("imageCount");
      return;
    }
    setImageProblem(null);
    setPreparingImages(true);
    try {
      const prepared: EvidenceDraft[] = [];
      for (const file of files) prepared.push(await prepareEvidence(file));
      if (active.current) setProofs((current) => [...current, ...prepared]);
    } catch (error) {
      if (active.current)
        setImageProblem(
          error instanceof EvidenceError ? error.issue : "imageFailed",
        );
    } finally {
      if (active.current) setPreparingImages(false);
    }
  }

  return (
    <>
      <Back label={t.center} onClick={() => navigate("/center")} />
      <Heading title={creating ? "创建个人名片" : t.profile} />
      <Alert message={error} />
      {!me ? (
        <p className="empty">{t.needPersona}</p>
      ) : profile ? (
        <ProfileEditor
          profile={profile}
          onChange={setProfile}
          fieldError={fieldError}
          skillError={fieldErrors.skills}
          saveLabel={creating ? "发布名片" : undefined}
          busy={busy || preparingImages}
          onSave={() => {
            if (preparingImages) return;
            const customSkills = (profile.customSkills ?? [])
              .map((skill) => skill.trim())
              .filter(Boolean);
            if (!profile.skills.length && !customSkills.length) {
              setFieldErrors({ skills: t.pickSkill });
              showToast(t.pickSkill, "error");
              return;
            }
            void run(
              async () => {
                const saved = await api.saveProfile({
                  ...profile,
                  customSkills,
                  evidence: proofs.map((item) =>
                    item.dataUrl
                      ? { image: item.dataUrl.split(",", 2)[1] }
                      : { id: item.id },
                  ),
                });
                await refreshCenter();
                return saved;
              },
              (savedProfile) => {
                if (me.nickname !== savedProfile.nickname)
                  updateMe({ ...me, nickname: savedProfile.nickname });
                navigate("/center", "saved", true);
              },
            );
          }}
        >
          <fieldset className="proofs">
            <legend>{t.evidence}</legend>
            <div className="proof-grid">
              {proofs.map((entry, index) => (
                <div className="proof-item" key={entry.id}>
                  <EvidenceImage
                    entry={entry}
                    userId={me?.userId ?? ""}
                    label={t.evidenceLabel(index + 1)}
                  />
                  <button
                    type="button"
                    className="icon-button proof-remove"
                    aria-label={
                      t.removeImage + " " + t.evidenceLabel(index + 1)
                    }
                    disabled={busy}
                    onClick={() => {
                      setProofs((items) =>
                        items.filter((item) => item.id !== entry.id),
                      );
                      setImageProblem(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {proofs.length < EVIDENCE_COUNT && (
                <label className="proof-add">
                  <span aria-hidden="true">＋</span>
                  {t.addImage}
                  <input
                    type="file"
                    multiple
                    accept={EVIDENCE_ACCEPT}
                    disabled={preparingImages || busy}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = "";
                      void addImages(files);
                    }}
                  />
                </label>
              )}
            </div>
            {preparingImages && (
              <p role="status" className="consent">
                {t.preparing}
              </p>
            )}
            {imageProblem && (
              <p role="alert" className="field-error">
                {t[imageProblem]}
              </p>
            )}
            {fieldError("evidence")}
          </fieldset>
        </ProfileEditor>
      ) : (
        !error && <LoadingStatus />
      )}
    </>
  );
}
