import CenterTeams from "./CenterTeams";
import CenterLoading from "./CenterLoading";
import IntentDialog from "./IntentDialog";
import IntentLists from "./IntentLists";
import type { useCenterDashboard } from "./centerData";
import { SummaryCard } from "../ui/SummaryCard";
import { Button } from "../ui/Button";
import { showToast } from "../ui/ActionToast";
import { useState } from "react";
import { api, type IntentDetail } from "../api/client";
import { copy as t } from "../copy";
import { ProfileDetails, ProfileSummary } from "../profile/ProfileViews";
import {
  Alert,
  Dialog,
  Feedback,
  Heading,
  describeError,
  useAction,
  type Notice,
  type PageProps,
} from "./shared";
import "./center.css";

/** 汇总本人名片、队伍和组队意向。 */
export default function CenterPage({
  me,
  navigate,
  arrival,
  invalidateProfiles,
  invalidateRecruitments,
  dashboard: { data: dashboard, refresh, update },
}: PageProps & {
  arrival?: Notice;
  invalidateProfiles: () => void;
  invalidateRecruitments: () => void;
  dashboard: ReturnType<typeof useCenterDashboard>;
}) {
  const ownProfile = dashboard?.profile.data;
  const listed = ownProfile?.listed;
  const publicProfile = listed ? dashboard?.publicProfile.data : null;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [intent, setIntent] = useState<IntentDetail | null>(null);
  const { busy, run, clear, error, setError, fieldError } = useAction();
  const visibility = useAction();

  /** 上架或下架本人名片并刷新公开预览。 */
  function toggleProfile() {
    void visibility.run(
      () => api.setProfileVisibility(!listed),
      (result) => {
        invalidateProfiles();
        update((current) => ({
          ...current,
          profile: current.profile.data
            ? { data: { ...current.profile.data, listed: result.listed } }
            : current.profile,
          publicProfile: result.listed ? current.publicProfile : { data: null },
        }));
        void refresh();
      },
      { success: (result) => (result.listed ? "名片已上架" : "名片已下架") },
    );
  }
  /** 打开意向详情。 */
  function openIntent(id: string) {
    void run(() => api.intent(id), setIntent, false);
  }

  /** 关闭详情并作废未完成的请求。 */
  function closeDetail() {
    clear();
    setIntent(null);
  }

  /** 回应意向并刷新详情与列表状态。 */
  function respond(
    entry: IntentDetail,
    decision: "accepted" | "declined",
    message: string,
  ) {
    void run(
      async () => {
        const summary = await api.respond(entry.id, decision, message);
        try {
          return { summary, detail: await api.intent(entry.id) };
        } catch (error) {
          return { summary, error: describeError(error) };
        }
      },
      ({ summary, detail, error }) => {
        update((current) => ({
          ...current,
          requests: {
            data: {
              items: (current.requests.data?.items ?? []).map((item) =>
                item.id === summary.id ? summary : item,
              ),
            },
          },
        }));
        setIntent(detail ?? { ...entry, ...summary });
        if (error) {
          setError(error);
          showToast(error, "error", true);
        }
      },
      {
        success: decision === "accepted" ? "已同意击掌" : "已婉拒击掌",
        inDialog: true,
      },
    );
  }

  return (
    <>
      <Heading title={t.center} />
      <Feedback notice={arrival} />
      {!me ? (
        <p className="empty">{t.needPersona}</p>
      ) : !dashboard ? (
        <CenterLoading />
      ) : (
        <div className="center-dashboard">
          <SummaryCard
            title={ownProfile?.nickname ?? me.nickname}
            context="我的公开名片"
            actions={
              <>
                <div className="card-management">
                  <Button onClick={() => navigate("/center/profile")}>
                    {"kind" in me && ownProfile === null
                      ? "创建名片"
                      : t.editProfile}
                  </Button>
                  <Button onClick={() => navigate("/center/resume")}>
                    我的简历
                  </Button>
                  {ownProfile && (
                    <Button disabled={visibility.busy} onClick={toggleProfile}>
                      {listed ? "下架名片" : "上架名片"}
                    </Button>
                  )}
                </div>
                {publicProfile && (
                  <Button onClick={() => setPreviewOpen(true)}>
                    查看完整公开名片
                  </Button>
                )}
              </>
            }
          >
            {dashboard.profile.error ? (
              <Alert message={dashboard.profile.error} />
            ) : ownProfile && !listed ? (
              <p className="consent">
                名片已下架，其他同学无法在找队友中看到你。
              </p>
            ) : ownProfile && publicProfile ? (
              <ProfileSummary profile={publicProfile} />
            ) : ownProfile && dashboard.publicProfile.error ? (
              <Alert message={dashboard.publicProfile.error} />
            ) : (
              <p className="consent">{t.noProfile}</p>
            )}
          </SummaryCard>
          <CenterTeams
            teams={dashboard.teams.data?.items ?? []}
            loadError={dashboard.teams.error}
            onSaved={(team) => {
              invalidateRecruitments();
              update((current) => ({
                ...current,
                teams: {
                  data: {
                    items: [
                      team,
                      ...(current.teams.data?.items ?? []).filter(
                        (item) => item.id !== team.id,
                      ),
                    ],
                  },
                },
              }));
            }}
          />
          <IntentLists
            intents={dashboard.requests.data?.items ?? []}
            userId={me.userId}
            error={dashboard.requests.error}
            openIntent={openIntent}
          />
        </div>
      )}
      {previewOpen && publicProfile && me && (
        <Dialog
          title={`完整公开名片 · ${publicProfile.nickname}`}
          closeLabel={t.close}
          close={() => setPreviewOpen(false)}
          className="profile-dialog"
        >
          <ProfileDetails profile={publicProfile} />
        </Dialog>
      )}
      {intent && (
        <IntentDialog
          key={intent.id}
          intent={intent}
          busy={busy}
          error={error}
          close={closeDetail}
          respond={respond}
          fieldError={fieldError("message")}
        />
      )}
    </>
  );
}
