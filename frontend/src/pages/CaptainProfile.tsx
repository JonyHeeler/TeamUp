import { useCallback, useState } from "react";
import { api } from "../api/client";
import { ProfileDetails } from "../profile/ProfileViews";
import EvidenceImage from "../EvidenceImage";
import { Button } from "../ui/Button";
import { copy as t } from "../copy";
import { Dialog, useResource } from "./shared";

/** 通过弹窗展示队长已公开的名片。 */
export default function CaptainProfile({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const request = useCallback(() => api.profile(userId), [userId]);
  const { data, error } = useResource(request, open);
  return (
    <div className="dialog-section">
      <Button onClick={() => setOpen(true)}>查看队长名片</Button>
      {open && (
        <Dialog
          title={data ? `队长名片 · ${data.nickname}` : "队长名片"}
          closeLabel={t.close}
          close={() => setOpen(false)}
        >
          {data ? (
            <>
              <ProfileDetails profile={data} />
              {Boolean(data.evidenceIds?.length) && (
                <div
                  className="proof-grid"
                  role="group"
                  aria-label={t.evidence}
                >
                  {data.evidenceIds?.map((id, index) => (
                    <EvidenceImage
                      key={id}
                      entry={{ id }}
                      userId={data.userId}
                      label={t.evidenceLabel(index + 1)}
                    />
                  ))}
                </div>
              )}
            </>
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
