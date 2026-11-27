import type { Intent } from "../api/client";
import { copy as t } from "../copy";

/** 定义列表和详情共用的击掌标题及类型。 */
export function intentLabels(intent: Intent) {
  if (intent.kind === "personal") {
    return {
      title: intent.counterpartNickname ?? "个人击掌",
      context: "个人击掌",
    };
  }
  const kind = intent.kind === "apply" ? t.application : t.invitation;
  return {
    title: intent.teamName ?? t.unknownTeam,
    context: [kind, intent.counterpartNickname].filter(Boolean).join(" · "),
  };
}
