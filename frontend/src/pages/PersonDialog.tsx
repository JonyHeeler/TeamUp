import { useState } from "react";
import type { Profile } from "../api/client";
import { api } from "../api/client";
import { copy as t } from "../copy";
import { ProfileDetails } from "../profile/ProfileViews";
import { Button } from "../ui/Button";
import { Alert, Dialog, IntentMessage, useAction, useResource } from "./shared";

/** 显示名片并提交个人击掌或关联队伍的邀请。 */
export default function PersonDialog({
  person,
  canSend,
  close,
}: {
  person: Profile;
  canSend: boolean;
  close: () => void;
}) {
  const { data: teams, error: teamsError } = useResource(
    api.ownRecruitments,
    canSend,
  );
  const { busy, run, error, fieldError } = useAction();
  const [team, setTeam] = useState("");
  const [message, setMessage] = useState("");
  const published = teams?.items.filter((entry) => entry.isPublished) ?? [];

  return (
    <Dialog
      title={person.nickname}
      closeLabel={t.close}
      close={close}
      busy={busy}
      className="profile-dialog"
    >
      {(dismiss) => (
        <>
          <Alert message={error} />
          <ProfileDetails profile={person} />
          {canSend && (
            <form
              className="dialog-section"
              onSubmit={(event) => {
                event.preventDefault();
                const target = { candidateId: person.userId, message };
                void run(
                  () =>
                    api.createIntent(
                      team
                        ? { ...target, kind: "invite", recruitmentId: team }
                        : { ...target, kind: "personal" },
                    ),
                  dismiss,
                  {
                    success: ({ created }) =>
                      team
                        ? created
                          ? "邀请已发送"
                          : "已有入队邀请"
                        : created
                          ? "个人击掌已发送"
                          : "已有个人击掌申请",
                  },
                );
              }}
            >
              {published.length > 0 && (
                <label>
                  击掌方式
                  <select
                    value={team}
                    disabled={busy}
                    onChange={(event) => setTeam(event.target.value)}
                  >
                    <option value="">个人击掌</option>
                    {published.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        邀请加入 {entry.teamName} · {entry.competition}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {teamsError && (
                <p className="consent">暂时无法加载队伍，仍可发起个人击掌。</p>
              )}
              <IntentMessage
                value={message}
                onChange={setMessage}
                kind={team ? "invite" : "personal"}
                error={fieldError("message")}
              />
              <div className="dialog-actions">
                <Button type="submit" tone="blue" disabled={busy}>
                  {team ? t.invite : "发起个人击掌"}
                </Button>
              </div>
              <small className="consent">{t.share}</small>
            </form>
          )}
        </>
      )}
    </Dialog>
  );
}
