import type { Api } from "./client";
import { ApiError } from "./http";
import type { Intent, Me, OwnProfile, Persona, Recruitment } from "./types";

export type MockData = {
  personas: Record<Persona, Me>;
  ownProfiles: Record<Persona, OwnProfile>;
  recruitments: { items: Recruitment[] };
};

/** Runs the intent workflow against the current offline demo state. */
export function createMockIntents(
  data: MockData,
  current: () => Me,
): Pick<Api, "intents" | "intent" | "createIntent" | "respond"> {
  const intents: Intent[] = [];
  const intentMessages = new Map<string, string>();
  const responseMessages = new Map<string, string>();

  /** Finds the other participant for the current viewer. */
  const counterpartId = (intent: Intent) =>
    intent.senderId === current().userId ? intent.recipientId : intent.senderId;

  /** Validates either optional note with the same rules as the API. */
  function note(value?: string | null) {
    const trimmed = value?.trim();
    if (trimmed && Array.from(trimmed).length > 300)
      throw new ApiError(
        "最多 300 字。",
        { message: "最多 300 字。" },
        "validation_error",
      );
    return trimmed;
  }

  /** Builds an intent summary for the current identity. */
  const view = (i: Intent): Intent => ({
    ...i,
    teamName: data.recruitments.items.find(
      (team) => team.id === i.recruitmentId,
    )?.teamName,
    counterpartNickname: Object.values(data.personas).find(
      (user) => user.userId === counterpartId(i),
    )?.nickname,
    canRespond: i.status === "pending" && i.recipientId === current().userId,
  });
  /** Finds an intent accessible to the current identity. */
  const lookup = (id: string) => {
    const { userId } = current();
    const i = intents.find(
      (x) => x.id === id && [x.senderId, x.recipientId].includes(userId),
    );
    if (!i) throw new ApiError("未找到击掌申请。");
    return i;
  };

  return {
    /** Lists the current user intents. */
    intents: async () => {
      const { userId } = current();
      return {
        items: intents
          .filter((i) => [i.senderId, i.recipientId].includes(userId))
          .map(view),
      };
    },
    /** Loads an intent detail. */
    intent: async (id) => {
      const i = lookup(id);
      const message = intentMessages.get(i.id);
      const responseMessage = responseMessages.get(i.id);
      const qq = Object.values(data.ownProfiles).find(
        (profile) => profile.userId === counterpartId(i),
      )?.qq;
      return {
        ...view(i),
        ...(message ? { message } : {}),
        ...(responseMessage ? { responseMessage } : {}),
        ...(i.status === "accepted" && qq ? { counterpartQq: qq } : {}),
      };
    },
    /** Creates an application or invitation. */
    createIntent: async (body) => {
      const user = current();
      const t = data.recruitments.items.find(
        (x) => x.id === body.recruitmentId,
      );
      const personal = body.kind === "personal";
      if (!personal && !t) throw new ApiError("未找到招募。");
      if (t && !t.isPublished) throw new ApiError("这支队伍的招募已下架");
      const message = note(body.message);
      const candidateId =
        body.kind === "apply" ? user.userId : body.candidateId;
      const ownerId = t?.ownerId ?? user.userId;
      const profiles = Object.values(data.ownProfiles);
      const candidate = profiles.find(
        (profile) => profile.userId === candidateId,
      );
      if (
        !candidateId ||
        candidateId === ownerId ||
        !candidate?.qq ||
        !profiles.some((profile) => profile.userId === ownerId && profile.qq) ||
        (candidate.listed === false && body.kind !== "apply") ||
        (body.kind === "invite" && ownerId !== user.userId)
      )
        throw new ApiError("无法发出这条击掌申请。");
      const existing = intents.find((i) =>
        personal
          ? i.kind === "personal" &&
            [i.senderId, i.recipientId].includes(user.userId) &&
            [i.senderId, i.recipientId].includes(candidateId)
          : i.recruitmentId === t?.id && i.candidateId === candidateId,
      );
      if (existing) return { ...view(existing), created: false };
      const i: Intent = {
        id: crypto.randomUUID(),
        ...(t ? { recruitmentId: t.id, ownerId } : {}),
        candidateId,
        senderId: user.userId,
        recipientId: body.kind === "apply" ? ownerId : candidateId,
        kind: body.kind,
        status: "pending",
        createdAt: new Date().toISOString(),
        canRespond: false,
      };
      if (message) intentMessages.set(i.id, message);
      intents.unshift(i);
      return { ...view(i), created: true };
    },
    /** Responds to an intent. */
    respond: async (id, decision, message) => {
      const i = lookup(id);
      const responseMessage = note(message);
      if (i.recipientId !== current().userId)
        throw new ApiError("该击掌申请无法回应。");
      if (i.status !== "pending") {
        if (i.status !== decision) throw new ApiError("击掌申请已有不同回应");
        return view(i);
      }
      i.status = decision;
      i.respondedAt = new Date().toISOString();
      if (responseMessage) responseMessages.set(i.id, responseMessage);
      return view(i);
    },
  };
}
