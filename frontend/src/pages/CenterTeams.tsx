import { useState } from "react";
import { api, type Recruitment, type RecruitmentInput } from "../api/client";
import { copy as t } from "../copy";
import RecruitmentEditor from "../recruitment/RecruitmentEditor";
import { Button } from "../ui/Button";
import {
  Alert,
  Dialog,
  Feedback,
  useAction,
  useResource,
  type Notice,
} from "./shared";
import "./center-teams.css";

/** 管理当前用户创建的队伍和招募可见性。 */
export default function CenterTeams({
  teams: initialTeams,
  loadError,
}: {
  teams: Recruitment[];
  loadError?: string;
}) {
  const [changes, setChanges] = useState<Recruitment[]>([]);
  const [editor, setEditor] = useState<Recruitment | "create" | null>(null);
  const [visibility, setVisibility] = useState<Recruitment | null>(null);
  const catalog = useResource(api.competitions, editor !== null);
  const { busy, error, clear, run, fieldError } = useAction();
  const [notice, setNotice] = useState<Notice>();
  const teams = [
    ...changes,
    ...initialTeams.filter(
      (team) => !changes.some((changed) => changed.id === team.id),
    ),
  ];

  /** 关闭管理弹窗并清除请求状态。 */
  function close() {
    clear();
    setEditor(null);
    setVisibility(null);
  }

  /** 将 API 确认的队伍写入列表并通知用户。 */
  function saveTeam(team: Recruitment) {
    setChanges((items) => [
      team,
      ...items.filter((item) => item.id !== team.id),
    ]);
    close();
  }

  /** 根据表单模式创建或更新招募。 */
  function submit(draft: RecruitmentInput) {
    if (!editor) return;
    const creating = editor === "create";
    void run(
      () =>
        creating
          ? api.createRecruitment(draft)
          : api.updateRecruitment(editor.id, draft),
      (team) => saveTeam(team),
      { success: creating ? "招募已发布" : "招募已保存" },
    );
  }

  return (
    <section className="center-teams" aria-labelledby="center-teams-title">
      <header className="center-teams-heading">
        <h2 id="center-teams-title">我的队伍</h2>
        <Button
          onClick={() => {
            clear();
            setNotice(undefined);
            setEditor("create");
          }}
        >
          <span aria-hidden="true">＋</span> {t.create}
        </Button>
      </header>
      {teams.length ? (
        <ul className="managed-teams">
          {teams.map((team) => (
            <li key={team.id}>
              <div className="managed-team-info">
                <h3>{team.teamName}</h3>
                <p>
                  {team.competition} · {team.openings && `${team.openings} · `}
                  {team.teamNumber}
                </p>
                <span
                  className={`status${team.isPublished ? " accepted" : ""}`}
                >
                  {team.isPublished ? "招募中" : "已下架"}
                </span>
              </div>
              <div className="managed-team-actions">
                <Button
                  onClick={() => {
                    clear();
                    setNotice(undefined);
                    setEditor(team);
                  }}
                >
                  编辑招募
                </Button>
                <Button
                  onClick={() => {
                    clear();
                    setNotice(undefined);
                    setVisibility(team);
                  }}
                >
                  {team.isPublished ? "下架" : "重新上架"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : loadError ? (
        <Alert message={loadError} />
      ) : (
        <p className="empty">还没有发布队伍招募。</p>
      )}
      {!editor && !visibility && (
        <Feedback
          error={error}
          notice={notice}
          onDismiss={() => setNotice(undefined)}
        />
      )}
      {editor && (
        <Dialog
          title={editor === "create" ? t.create : "编辑招募"}
          close={close}
          closeLabel={t.close}
          busy={busy}
        >
          <Alert message={error || catalog.error || ""} />
          {catalog.data ? (
            <RecruitmentEditor
              competitions={catalog.data.items}
              initialTeam={editor === "create" ? undefined : editor}
              busy={busy}
              fieldError={fieldError}
              onPublish={submit}
            />
          ) : (
            !catalog.error && <p role="status">{t.loading}</p>
          )}
        </Dialog>
      )}
      {visibility && (
        <Dialog
          title={visibility.isPublished ? "下架招募" : "重新上架招募"}
          close={close}
          closeLabel={t.close}
          busy={busy}
        >
          <p>
            {visibility.isPublished
              ? "下架后，其他同学无法在找队伍中看到这条招募或发起新申请。已有击掌记录仍可查看和处理。"
              : "重新上架后，这条招募会再次出现在找队伍。"}{" "}
          </p>
          <Alert message={error} />
          <div className="dialog-actions">
            <Button type="button" disabled={busy} onClick={close}>
              取消
            </Button>
            <Button
              disabled={busy}
              tone={visibility.isPublished ? "urgent" : "blue"}
              onClick={() =>
                void run(
                  () =>
                    api.setRecruitmentVisibility(
                      visibility.id,
                      !visibility.isPublished,
                    ),
                  (team) => saveTeam(team),
                  {
                    success: (team) =>
                      team.isPublished ? "招募已上架" : "招募已下架",
                  },
                )
              }
            >
              {visibility.isPublished ? "确认下架" : "确认上架"}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
