import { useCallback, useState } from "react";
import { api } from "../api/client";
import { ProfileDetails } from "../profile/ProfileViews";
import { Button } from "../ui/Button";
import { copy as t } from "../copy";
import { Dialog, useResource } from "./shared";

/** 通过弹窗展示队长已公开的名片。 */
export default function CaptainProfile({
  userId,
  nickname,
}: {
  userId: string;
  nickname: string;
}) {
  const [open, setOpen] = useState(false);
  const request = useCallback(() => api.profile(userId), [userId]);
  const { data, error } = useResource(request, open);
  return (
    <div className="team-captain">
      <div className="team-captain-name">
        <span>队长</span>
        <strong>{nickname}</strong>
      </div>
      <Button
        className="team-captain-button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        查看队长名片
      </Button>
      {open && (
        <Dialog
          title={data ? `队长名片 · ${data.nickname}` : "队长名片"}
          closeLabel={t.close}
          close={() => setOpen(false)}
          className="profile-dialog"
        >
          {data ? (
            <ProfileDetails profile={data} />
          ) : (
            <p className="consent">
              {error ? "队长名片暂时无法查看。" : "正在加载队长名片…"}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
