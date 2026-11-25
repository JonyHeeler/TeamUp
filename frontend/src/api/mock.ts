import fixture from "../../../contracts/examples/demo.json";
import {
  ApiError,
  type Api,
  type HighFiveCandidate,
  type HighFiveCandidateSource,
  type Intent,
  type Me,
  type OwnProfile,
  type Persona,
  type Profile,
  type Recruitment,
  type RecruitmentDuration,
  type RecruitmentInput,
  type Skill,
  type TeamInvitation,
  type TeamMemberInfo,
  type TeamSummary,
  type UserSearchItem,
} from "./client";
const data = structuredClone(fixture) as {
  personas: Record<Persona, Me>;
  ownProfiles: Record<Persona, OwnProfile>;
  recruitments: { items: Recruitment[] };
};
const sessionKey = "teamup-mock-persona";
const previous = sessionStorage.getItem(sessionKey);
let persona: Persona | null =
  previous && Object.hasOwn(data.personas, previous)
    ? (previous as Persona)
    : null;
const DAY_MS = 24 * 60 * 60 * 1000;
const INTENT_TTL_MS = 7 * DAY_MS;
const VALID_DURATIONS = new Set<number>([7, 14, 30]);
function normalizeDurationDays(raw?: number | null): RecruitmentDuration {
  if (raw === undefined || raw === null) return 14;
  if (!VALID_DURATIONS.has(raw))
    throw new ApiError(
      "招募期限仅支持 7、14 或 30 天",
      { durationDays: "招募期限仅支持 7、14 或 30 天" },
      "validation_error",
    );
  return raw as RecruitmentDuration;
}
let mockNowProvider: () => Date = () => new Date();
export function setMockNowForTest(provider?: () => Date) {
  mockNowProvider = provider ?? (() => new Date());
}
const currentNow = () => mockNowProvider();
let intents: Intent[] = [];
const intentMessages = new Map<string, string>();
const intentResponses = new Map<string, string>();
type MockTeamRecord = {
  id: string;
  captainId: string;
  competition: string;
  teamName: string;
  teamNumber: string;
  description: string;
  status: "active" | "disbanded";
  createdAt: string;
};
for (const rec of data.recruitments.items) {
  const pubMs = currentNow().getTime();
  rec.publishedAt = new Date(pubMs).toISOString();
  rec.expiresAt = new Date(pubMs + 14 * DAY_MS).toISOString();
  rec.durationDays = 14;
}
const teamsStore: MockTeamRecord[] = data.recruitments.items.map((rec) => ({
  id: rec.id,
  captainId: rec.ownerId,
  competition: rec.competition,
  teamName: rec.teamName,
  teamNumber: rec.teamNumber,
  description: rec.background,
  status: "active",
  createdAt: rec.createdAt,
}));
const teamMembersStore: {
  teamId: string;
  userId: string;
  role: "captain" | "member";
  joinedAt: string;
}[] = teamsStore.map((team) => ({
  teamId: team.id,
  userId: team.captainId,
  role: "captain",
  joinedAt: team.createdAt,
}));
const teamInvitationsStore: TeamInvitation[] = [];
const activeTeamInvites = new Map<string, string>();
const pictures = new Map<string, Blob>();
const examplePictures = import.meta.glob<string>("./demo-evidence/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const current = () => {
  if (!persona) throw new ApiError("请先选择演示身份。");
  return data.personas[persona];
};
const publicProfile = (p: OwnProfile, withEvidence = false): Profile => {
  const result: Profile = {
    userId: p.userId,
    nickname: p.nickname,
    skills: p.skills,
    contribution: p.contribution,
    customSkills: p.customSkills,
  };
  for (const field of [
    "college",
    "major",
    "grade",
    "experience",
    "competitionIntent",
  ] as const) {
    if (
      (["college", "major", "grade"].includes(field) ||
        p.publicFields[field]) &&
      p[field]
    )
      result[field] = p[field];
  }
  if (p.publicFields.experience && p.projects?.length)
    result.projects = p.projects;
  if (withEvidence && p.publicFields.experience && p.evidenceIds.length)
    result.evidenceIds = p.evidenceIds;
  return result;
};
const makePersonalPairKey = (a: string, b: string) =>
  [a, b].sort().join(":");
const makeActiveRelationKey = (
  kind: Intent["kind"],
  senderId: string,
  recipientId: string,
  recruitmentId?: string | null,
) => {
  if (kind === "personal")
    return `p:${makePersonalPairKey(senderId, recipientId)}`;
  const candidateId = kind === "apply" ? senderId : recipientId;
  return `r:${recruitmentId}:${candidateId}`;
};
const activeRelations = new Map<string, string>();
const isIntentExpiredAt = (i: Intent, nowMs: number) =>
  nowMs >= Date.parse(i.expiresAt);
const view = (i: Intent, nowMs = currentNow().getTime()): Intent => {
  const meId = current().userId;
  const otherId = meId === i.senderId ? i.recipientId : i.senderId;
  const expired = isIntentExpiredAt(i, nowMs);
  const teamName = i.recruitmentId
    ? data.recruitments.items.find((team) => team.id === i.recruitmentId)
        ?.teamName
    : undefined;
  return {
    ...i,
    ...(teamName ? { teamName } : {}),
    isExpired: expired,
    counterpartNickname: Object.values(data.personas).find(
      (user) => user.userId === otherId,
    )?.nickname,
    canRespond: i.status === "pending" && !expired && i.recipientId === meId,
  };
};
const lookup = (id: string) => {
  const meId = current().userId;
  const i = intents.find(
    (x) => x.id === id && [x.senderId, x.recipientId].includes(meId),
  );
  if (!i) throw new ApiError("未找到击掌申请。");
  return i;
};
function verifyPersonalPairing(
  personalIntentId: string,
  candidateId?: string,
  nowMs = currentNow().getTime(),
) {
  const pairing = lookup(personalIntentId);
  if (pairing.kind !== "personal")
    throw new ApiError(
      "仅支持从个人击掌发起后续队伍击掌",
      undefined,
      "conflict",
    );
  if (pairing.senderId !== current().userId)
    throw new ApiError(
      "只有原个人击掌发送方可以发起后续队伍击掌",
      undefined,
      "forbidden",
    );
  if (pairing.status !== "accepted")
    throw new ApiError(
      "仅已同意的个人击掌可发起后续队伍击掌",
      undefined,
      "conflict",
    );
  if (isIntentExpiredAt(pairing, nowMs))
    throw new ApiError(
      "该个人击掌已超过 7 天有效期，请重新发起击掌",
      undefined,
      "expired",
    );
  if (candidateId && pairing.recipientId !== candidateId)
    throw new ApiError(
      "击掌对象必须与原个人击掌对象一致",
      undefined,
      "validation_error",
    );
  return pairing;
}
function resolveActiveRelation(relKey: string, nowMs: number): Intent | null {
  const existingId = activeRelations.get(relKey);
  if (!existingId) return null;
  const existing = intents.find((item) => item.id === existingId);
  if (!existing) {
    activeRelations.delete(relKey);
    return null;
  }
  if (!isIntentExpiredAt(existing, nowMs)) {
    if (existing.status === "declined")
      throw new ApiError(
        "该击掌已被婉拒，7 天冷却期内暂不可重新发起",
        undefined,
        "cooldown",
      );
    return existing;
  }
  activeRelations.delete(relKey);
  return null;
}
function ownedTeam(id: string) {
  const owner = current();
  const team = data.recruitments.items.find((item) => item.id === id);
  if (!team) throw new ApiError("未找到招募。");
  if (team.ownerId !== owner.userId) throw new ApiError("只有队长可以管理队伍");
  return team;
}

function recruitmentDraft(body: RecruitmentInput) {
  if (
    !fixture.competitions.items.some((c) => c.name === body.competition.trim())
  )
    throw new ApiError(
      "请选择官方比赛",
      { competition: "请选择官方比赛" },
      "validation_error",
    );
  const openings = body.openings?.trim() || null;
  if (openings && Array.from(openings).length > 40)
    throw new ApiError(
      "招募人数最多 40 字",
      { openings: "招募人数最多 40 字" },
      "validation_error",
    );
  const requirements = body.requirements ?? [];
  if (requirements.length > 100)
    throw new ApiError(
      "招募需求列表超出上限",
      { requirements: "招募需求列表超出上限" },
      "validation_error",
    );
  if (
    requirements.some(
      (item) => !item.skills?.length && !item.expectation?.trim(),
    )
  )
    throw new ApiError(
      "请为每条需求选择技能标签或填写期望",
      { requirements: "请为每条需求选择技能标签或填写期望" },
      "validation_error",
    );
  return {
    ...body,
    openings,
    requirements,
    competition: body.competition.trim(),
    skills: [
      ...new Set(requirements.flatMap((item) => item.skills ?? [])),
    ],
  };
}

function mockPublicMembersForTeam(teamId: string): TeamMemberInfo[] {
  const rows = teamMembersStore
    .filter((m) => m.teamId === teamId)
    .sort((a, b) => {
      const roleDiff =
        (a.role === "captain" ? 0 : 1) - (b.role === "captain" ? 0 : 1);
      if (roleDiff !== 0) return roleDiff;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
  return rows.map((m) => {
    const profile = Object.values(data.ownProfiles).find(
      (p) => p.userId === m.userId,
    );
    const nickname =
      Object.values(data.personas).find((u) => u.userId === m.userId)
        ?.nickname ??
      profile?.nickname ??
      "";
    return {
      userId: m.userId,
      nickname,
      role: m.role,
      joinedAt: m.joinedAt,
      skills: profile ? [...profile.skills].sort() : [],
      customSkills: profile?.customSkills ?? [],
      hasProfile: Boolean(profile),
    };
  });
}

function mockRecruitmentLifecycle(
  rec: Pick<Recruitment, "teamId" | "isPublished" | "expiresAt">,
  nowMs: number,
): { status: "active" | "unpublished" | "expired"; isPubliclyActive: boolean } {
  const entity = teamsStore.find((item) => item.id === rec.teamId);
  if (entity && entity.status !== "active") {
    return { status: "unpublished", isPubliclyActive: false };
  }
  if (!rec.isPublished) {
    return { status: "unpublished", isPubliclyActive: false };
  }
  if (!rec.expiresAt || nowMs >= Date.parse(rec.expiresAt)) {
    return { status: "expired", isPubliclyActive: false };
  }
  return { status: "active", isPubliclyActive: true };
}

function mockBuildRecruitment(
  base: Omit<
    Recruitment,
    "memberCount" | "members" | "status" | "isPubliclyActive"
  >,
): Recruitment {
  const members = mockPublicMembersForTeam(base.teamId);
  const { status, isPubliclyActive } = mockRecruitmentLifecycle(
    base,
    currentNow().getTime(),
  );
  return {
    ...base,
    memberCount: members.length,
    members,
    status,
    isPubliclyActive,
  };
}

function mockEnrichRecruitment(rec: Recruitment): Recruitment {
  return mockBuildRecruitment(rec);
}

function mockBuildTeamSummary(
  entity: MockTeamRecord,
  myRole: "captain" | "member",
): TeamSummary {
  const members = mockPublicMembersForTeam(entity.id);
  const linked = data.recruitments.items.find((r) => r.teamId === entity.id);
  return {
    ...entity,
    myRole,
    memberCount: members.length,
    members,
    recruitment: linked ? mockEnrichRecruitment(linked) : null,
  };
}

export const mockApi: Api = {
  competitions: async () => fixture.competitions,
  me: async () => current(),
  session: async (p) => {
    persona = p;
    sessionStorage.setItem(sessionKey, p);
    return current();
  },
  profiles: async (skill = "") => ({
    items: Object.values(data.ownProfiles)
      .map((p) => publicProfile(p))
      .filter((p) => !skill || p.skills.includes(skill as Skill)),
  }),
  profile: async (id) => {
    const p = Object.values(data.ownProfiles).find((x) => x.userId === id);
    if (!p) throw new ApiError("未找到名片。");
    return publicProfile(p, true);
  },
  ownProfile: async () => {
    current();
    return data.ownProfiles[persona!];
  },
  evidence: async (userId, id) => {
    const profile = Object.values(data.ownProfiles).find(
      (entry) => entry.userId === userId,
    );
    const image = pictures.get(id);
    const example = examplePictures[`./demo-evidence/${id}.webp`];
    if (
      (!image && !example) ||
      !profile?.evidenceIds.includes(id) ||
      (!profile.publicFields.experience &&
        (!persona || current().userId !== userId))
    )
      throw new ApiError("未找到图片", undefined, "not_found");
    if (image) return image;
    const response = await fetch(example);
    if (!response.ok) throw new ApiError("未找到图片", undefined, "not_found");
    return response.blob();
  },
  saveProfile: async (body) => {
    const identity = current();
    const p = data.ownProfiles[persona!];
    const { evidence, ...details } = body;
    for (const [field, label] of [
      ["college", "学院"],
      ["major", "专业"],
      ["grade", "年级"],
    ] as const) {
      if (!body[field]?.trim())
        throw new ApiError(
          `请填写${label}`,
          { [field]: `请填写${label}` },
          "validation_error",
        );
    }
    if (!/^[0-9]{5,12}$/.test(body.qq.trim()) && body.qq !== p.qq)
      throw new ApiError(
        "请输入 5 至 12 位数字的 QQ 号",
        { qq: "请输入 5 至 12 位数字的 QQ 号" },
        "validation_error",
      );
    if (!body.skills.length && !body.customSkills?.length)
      throw new ApiError(
        "请至少选择或填写一项技能",
        { skills: "请至少选择或填写一项技能" },
        "validation_error",
      );
    if (evidence) {
      const ids = evidence.map((item) => {
        if ("id" in item) return item.id;
        const id = crypto.randomUUID();
        const type = item.image.startsWith("iVBOR")
          ? "image/png"
          : item.image.startsWith("/9j/")
            ? "image/jpeg"
            : "image/webp";
        const bytes = Uint8Array.from(atob(item.image), (character) =>
          character.charCodeAt(0),
        );
        pictures.set(id, new Blob([bytes], { type }));
        return id;
      });
      for (const id of p.evidenceIds)
        if (!ids.includes(id)) pictures.delete(id);
      p.evidenceIds = ids;
    }
    Object.assign(p, details);
    identity.nickname = p.nickname;
    return p;
  },
  recruitments: async (skill = "") => {
    const nowMs = currentNow().getTime();
    return {
      items: data.recruitments.items
        .filter(
          (t) =>
            mockRecruitmentLifecycle(t, nowMs).isPubliclyActive &&
            (!skill || t.skills.includes(skill as Skill)),
        )
        .map(mockEnrichRecruitment),
    };
  },
  ownRecruitments: async () => {
    const ownerId = current().userId;
    return {
      items: data.recruitments.items
        .filter((team) => {
          const entity = teamsStore.find((item) => item.id === team.teamId);
          return team.ownerId === ownerId && (!entity || entity.status === "active");
        })
        .map(mockEnrichRecruitment),
    };
  },
  updateRecruitment: async (id, body) => {
    const team = ownedTeam(id);
    const updatedName = body.teamName?.trim() || team.teamNumber;
    Object.assign(team, recruitmentDraft(body), {
      teamName: updatedName,
    });
    const entity = teamsStore.find((item) => item.id === team.teamId);
    if (entity) {
      entity.competition = team.competition;
      entity.teamName = team.teamName;
      entity.description = team.background;
    }
    return mockEnrichRecruitment(team);
  },
  setRecruitmentVisibility: async (id, isPublished, durationDays) => {
    const team = ownedTeam(id);
    if (isPublished) {
      const days = normalizeDurationDays(durationDays);
      const nowMs = currentNow().getTime();
      team.isPublished = true;
      team.publishedAt = new Date(nowMs).toISOString();
      team.expiresAt = new Date(nowMs + days * DAY_MS).toISOString();
      team.durationDays = days;
    } else {
      team.isPublished = false;
    }
    return mockEnrichRecruitment(team);
  },
  republishRecruitment: async (id, durationDays = 14) => {
    const team = ownedTeam(id);
    const entity = teamsStore.find((item) => item.id === team.teamId);
    if (entity && entity.status !== "active")
      throw new ApiError(
        "该队伍已解散，无法重新发布招募",
        undefined,
        "conflict",
      );
    const nowMs = currentNow().getTime();
    if (mockRecruitmentLifecycle(team, nowMs).isPubliclyActive)
      throw new ApiError(
        "招募当前正在进行中，如需延长期限请使用续期",
        undefined,
        "conflict",
      );
    const days = normalizeDurationDays(durationDays);
    team.isPublished = true;
    team.publishedAt = new Date(nowMs).toISOString();
    team.expiresAt = new Date(nowMs + days * DAY_MS).toISOString();
    team.durationDays = days;
    return mockEnrichRecruitment(team);
  },
  renewRecruitment: async (id, durationDays = 14, expectedExpiresAt) => {
    const team = ownedTeam(id);
    const nowMs = currentNow().getTime();
    if (
      !mockRecruitmentLifecycle(team, nowMs).isPubliclyActive ||
      !team.expiresAt
    )
      throw new ApiError(
        "招募已到期或已下架，请使用重新发布功能",
        undefined,
        "conflict",
      );
    if (
      expectedExpiresAt &&
      Math.abs(Date.parse(team.expiresAt) - Date.parse(expectedExpiresAt)) > 1
    )
      throw new ApiError(
        "招募有效期已更新，请刷新后重试",
        undefined,
        "conflict",
      );
    const days = normalizeDurationDays(durationDays);
    team.expiresAt = new Date(
      Date.parse(team.expiresAt) + days * DAY_MS,
    ).toISOString();
    team.durationDays = days;
    return mockEnrichRecruitment(team);
  },
  createRecruitment: async (body) => {
    const owner = current();
    const fields = recruitmentDraft(body);
    const timestamp = new Date();
    const day = new Date(timestamp.getTime() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    const lastIndex = Math.max(
      0,
      ...data.recruitments.items
        .filter((item) => item.teamNumber.startsWith(day))
        .map((item) => Number.parseInt(item.teamNumber.slice(8), 36)),
    );
    if (lastIndex >= 36 ** 3 - 1)
      throw new ApiError("今天的队伍编号已用完，请明天再创建");
    const teamNumber =
      day + (lastIndex + 1).toString(36).toUpperCase().padStart(3, "0");
    const teamId = crypto.randomUUID();
    const resolvedName = body.teamName?.trim() || teamNumber;
    const createdAt = timestamp.toISOString();
    teamsStore.unshift({
      id: teamId,
      captainId: owner.userId,
      competition: fields.competition,
      teamName: resolvedName,
      teamNumber,
      description: fields.background,
      status: "active",
      createdAt,
    });
    teamMembersStore.push({
      teamId,
      userId: owner.userId,
      role: "captain",
      joinedAt: createdAt,
    });
    const durationDays = normalizeDurationDays(body.durationDays);
    const t = mockBuildRecruitment({
      ...fields,
      teamId,
      isPublished: true,
      teamName: resolvedName,
      teamNumber,
      id: teamId,
      ownerId: owner.userId,
      publishedAt: createdAt,
      expiresAt: new Date(
        Date.parse(createdAt) + durationDays * DAY_MS,
      ).toISOString(),
      durationDays,
      createdAt,
    });
    data.recruitments.items.unshift(t);
    return t;
  },
  intents: async () => {
    const nowMs = currentNow().getTime();
    return {
      items: intents
        .filter(
          (i) =>
            [i.senderId, i.recipientId].includes(current().userId) &&
            !isIntentExpiredAt(i, nowMs),
        )
        .map((i) => view(i, nowMs)),
    };
  },
  validCandidates: async (scope) => {
    const meId = current().userId;
    const nowMs = currentNow().getTime();
    const recruitmentIdParam =
      typeof scope === "string" ? scope : scope?.recruitmentId;
    const teamIdParam = typeof scope === "object" ? scope?.teamId : undefined;
    let resolvedRecruitmentId = recruitmentIdParam;
    const existingMemberIds = new Set<string>();
    if (teamIdParam) {
      const entity = teamsStore.find(
        (item) => item.id === teamIdParam && item.status === "active",
      );
      if (!entity) throw new ApiError("未找到队伍。", undefined, "not_found");
      if (entity.captainId !== meId)
        throw new ApiError(
          "只有队长可以查看该队伍的有效击掌候选对象",
          undefined,
          "forbidden",
        );
      for (const m of teamMembersStore) {
        if (m.teamId === entity.id) existingMemberIds.add(m.userId);
      }
      resolvedRecruitmentId = data.recruitments.items.find(
        (rec) => rec.teamId === entity.id,
      )?.id;
    } else if (recruitmentIdParam) {
      const team = data.recruitments.items.find(
        (item) => item.id === recruitmentIdParam,
      );
      if (!team) throw new ApiError("未找到招募。", undefined, "not_found");
      if (team.ownerId !== meId)
        throw new ApiError(
          "只有队长可以查看该队伍的有效击掌候选对象",
          undefined,
          "forbidden",
        );
      for (const m of teamMembersStore) {
        if (m.teamId === team.teamId) existingMemberIds.add(m.userId);
      }
    }
    const matching = intents.filter((i) => {
      if (i.status !== "accepted" || isIntentExpiredAt(i, nowMs)) return false;
      if (i.kind === "personal") {
        return i.senderId === meId || i.recipientId === meId;
      }
      return Boolean(
        resolvedRecruitmentId && i.recruitmentId === resolvedRecruitmentId,
      );
    });
    const grouped = new Map<
      string,
      { maxExpiresMs: number; sources: HighFiveCandidateSource[] }
    >();
    for (const entry of matching) {
      const otherId =
        entry.senderId === meId ? entry.recipientId : entry.senderId;
      if (otherId === meId || existingMemberIds.has(otherId)) continue;
      const teamName = entry.recruitmentId
        ? data.recruitments.items.find(
            (team) => team.id === entry.recruitmentId,
          )?.teamName
        : undefined;
      const source: HighFiveCandidateSource = {
        intentId: entry.id,
        kind: entry.kind,
        ...(entry.recruitmentId ? { recruitmentId: entry.recruitmentId } : {}),
        ...(teamName ? { teamName } : {}),
        expiresAt: entry.expiresAt,
      };
      const expMs = Date.parse(entry.expiresAt);
      const bucket = grouped.get(otherId);
      if (!bucket) {
        grouped.set(otherId, { maxExpiresMs: expMs, sources: [source] });
      } else {
        if (expMs > bucket.maxExpiresMs) bucket.maxExpiresMs = expMs;
        bucket.sources.push(source);
      }
    }
    const items: HighFiveCandidate[] = [];
    for (const [otherId, bucket] of grouped.entries()) {
      const profile = Object.values(data.ownProfiles).find(
        (item) => item.userId === otherId,
      );
      if (!profile) continue;
      items.push({
        userId: otherId,
        nickname: profile.nickname,
        skills: [...profile.skills].sort(),
        customSkills: profile.customSkills ?? [],
        expiresAt: new Date(bucket.maxExpiresMs).toISOString(),
        sources: bucket.sources,
      });
    }
    return { items };
  },
  intent: async (id) => {
    const nowMs = currentNow().getTime();
    const i = lookup(id);
    const message = intentMessages.get(i.id);
    const responseMessage = intentResponses.get(i.id);
    const other = i.senderId === current().userId ? i.recipientId : i.senderId;
    const qq = Object.values(data.ownProfiles).find(
      (profile) => profile.userId === other,
    )?.qq;
    const expired = isIntentExpiredAt(i, nowMs);
    return {
      ...view(i, nowMs),
      ...(message ? { message } : {}),
      ...(responseMessage ? { responseMessage } : {}),
      ...(i.status === "accepted" && !expired && qq
        ? { counterpartQq: qq }
        : {}),
    };
  },
  createIntent: async (body) => {
    const user = current();
    const nowDate = currentNow();
    const nowMs = nowDate.getTime();
    const message = body.message?.trim();
    if (message && Array.from(message).length > 300)
      throw new ApiError(
        "附言最多 300 字。",
        { message: "附言最多 300 字。" },
        "validation_error",
      );
    if (body.kind === "personal") {
      const candidateId = body.candidateId;
      const targetExists = Object.values(data.ownProfiles).some(
        (profile) => profile.userId === candidateId,
      );
      if (!candidateId || candidateId === user.userId || !targetExists)
        throw new ApiError(
          "候选人无效或尚未发布名片",
          undefined,
          "validation_error",
        );
      const relKey = makeActiveRelationKey("personal", user.userId, candidateId);
      const existing = resolveActiveRelation(relKey, nowMs);
      if (existing) return view(existing, nowMs);
      const i: Intent = {
        id: crypto.randomUUID(),
        candidateId,
        senderId: user.userId,
        recipientId: candidateId,
        kind: "personal",
        status: "pending",
        createdAt: nowDate.toISOString(),
        expiresAt: new Date(nowMs + INTENT_TTL_MS).toISOString(),
        isExpired: false,
        canRespond: false,
      };
      activeRelations.set(relKey, i.id);
      if (message) intentMessages.set(i.id, message);
      intents.unshift(i);
      return view(i, nowMs);
    }
    const t = data.recruitments.items.find((x) => x.id === body.recruitmentId);
    if (!t) throw new ApiError("未找到招募。");
    const recState = mockRecruitmentLifecycle(t, nowMs);
    if (!recState.isPubliclyActive) {
      if (recState.status === "expired")
        throw new ApiError("该招募已到期，暂无法发起新的击掌", undefined, "expired");
      throw new ApiError("这支队伍的招募已下架", undefined, "conflict");
    }
    const candidateId = body.kind === "apply" ? user.userId : body.candidateId;
    if (
      !candidateId ||
      candidateId === t.ownerId ||
      (body.kind === "invite" && t.ownerId !== user.userId)
    )
      throw new ApiError("无法发出这条击掌申请。");
    if (body.kind === "invite" && body.sourcePersonalIntentId) {
      verifyPersonalPairing(body.sourcePersonalIntentId, candidateId, nowMs);
    }
    const senderId = body.kind === "apply" ? candidateId : t.ownerId;
    const recipientId = body.kind === "apply" ? t.ownerId : candidateId;
    const relKey = makeActiveRelationKey(
      body.kind,
      senderId,
      recipientId,
      t.id,
    );
    const existing = resolveActiveRelation(relKey, nowMs);
    if (existing) return view(existing, nowMs);
    const i: Intent = {
      id: crypto.randomUUID(),
      recruitmentId: t.id,
      candidateId,
      ownerId: t.ownerId,
      senderId,
      recipientId,
      kind: body.kind,
      status: "pending",
      createdAt: nowDate.toISOString(),
      expiresAt: new Date(nowMs + INTENT_TTL_MS).toISOString(),
      isExpired: false,
      canRespond: false,
    };
    activeRelations.set(relKey, i.id);
    if (message) intentMessages.set(i.id, message);
    intents.unshift(i);
    return view(i, nowMs);
  },
  createTeamAndInvite: async (intentId, body) => {
    const owner = current();
    const nowDate = currentNow();
    const nowMs = nowDate.getTime();
    const pairing = verifyPersonalPairing(intentId, undefined, nowMs);
    const { message: rawMessage, ...recruitmentInput } = body;
    const message = rawMessage?.trim();
    if (message && Array.from(message).length > 300)
      throw new ApiError(
        "附言最多 300 字。",
        { message: "附言最多 300 字。" },
        "validation_error",
      );
    const fields = recruitmentDraft(recruitmentInput);
    const day = new Date(nowMs + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    const lastIndex = Math.max(
      0,
      ...data.recruitments.items
        .filter((item) => item.teamNumber.startsWith(day))
        .map((item) => Number.parseInt(item.teamNumber.slice(8), 36)),
    );
    if (lastIndex >= 36 ** 3 - 1)
      throw new ApiError("今天的队伍编号已用完，请明天再创建");
    const teamNumber =
      day + (lastIndex + 1).toString(36).toUpperCase().padStart(3, "0");
    const teamId = crypto.randomUUID();
    const resolvedName = body.teamName?.trim() || teamNumber;
    const createdAt = nowDate.toISOString();
    teamsStore.unshift({
      id: teamId,
      captainId: owner.userId,
      competition: fields.competition,
      teamName: resolvedName,
      teamNumber,
      description: fields.background,
      status: "active",
      createdAt,
    });
    teamMembersStore.push({
      teamId,
      userId: owner.userId,
      role: "captain",
      joinedAt: createdAt,
    });
    const durationDays = normalizeDurationDays(body.durationDays);
    const recruitment = mockBuildRecruitment({
      ...fields,
      teamId,
      isPublished: true,
      teamName: resolvedName,
      teamNumber,
      id: teamId,
      ownerId: owner.userId,
      publishedAt: createdAt,
      expiresAt: new Date(nowMs + durationDays * DAY_MS).toISOString(),
      durationDays,
      createdAt,
    });
    data.recruitments.items.unshift(recruitment);
    const relKey = makeActiveRelationKey(
      "invite",
      owner.userId,
      pairing.recipientId,
      recruitment.id,
    );
    const createdIntent: Intent = {
      id: crypto.randomUUID(),
      recruitmentId: recruitment.id,
      candidateId: pairing.recipientId,
      ownerId: owner.userId,
      senderId: owner.userId,
      recipientId: pairing.recipientId,
      kind: "invite",
      status: "pending",
      createdAt: nowDate.toISOString(),
      expiresAt: new Date(nowMs + INTENT_TTL_MS).toISOString(),
      isExpired: false,
      canRespond: false,
    };
    activeRelations.set(relKey, createdIntent.id);
    if (message) intentMessages.set(createdIntent.id, message);
    intents.unshift(createdIntent);
    return { recruitment, intent: view(createdIntent, nowMs) };
  },
  respond: async (id, decision, responseMessage) => {
    const nowDate = currentNow();
    const nowMs = nowDate.getTime();
    const i = lookup(id);
    if (i.recipientId !== current().userId)
      throw new ApiError("只有收件人可以回应", undefined, "forbidden");
    const cleaned = responseMessage?.trim();
    if (cleaned && Array.from(cleaned).length > 300)
      throw new ApiError(
        "回应最多 300 字。",
        { responseMessage: "回应最多 300 字。" },
        "validation_error",
      );
    if (i.status === "pending" && isIntentExpiredAt(i, nowMs))
      throw new ApiError(
        "该击掌已超过 7 天待回应期限，无法继续处理",
        undefined,
        "expired",
      );
    if (i.status !== "pending") {
      if (i.status !== decision)
        throw new ApiError("击掌申请已有不同回应", undefined, "conflict");
      return view(i, nowMs);
    }
    i.status = decision;
    i.respondedAt = nowDate.toISOString();
    i.expiresAt = new Date(nowMs + INTENT_TTL_MS).toISOString();
    if (cleaned) intentResponses.set(i.id, cleaned);
    return view(i, nowMs);
  },
  searchUsers: async (q, teamId) => {
    const meId = current().userId;
    const keyword = q.trim().toLowerCase();
    if (!keyword) return { items: [] };
    const excluded = new Set<string>([meId]);
    if (teamId) {
      const entity = teamsStore.find(
        (item) => item.id === teamId && item.status === "active",
      );
      if (!entity) throw new ApiError("未找到队伍。", undefined, "not_found");
      if (entity.captainId !== meId)
        throw new ApiError(
          "只有队长可以为该队伍搜索邀请对象",
          undefined,
          "forbidden",
        );
      for (const m of teamMembersStore) {
        if (m.teamId === entity.id) excluded.add(m.userId);
      }
    }
    const items: UserSearchItem[] = Object.values(data.ownProfiles)
      .filter(
        (p) =>
          !excluded.has(p.userId) &&
          p.nickname.toLowerCase().includes(keyword),
      )
      .map((p) => ({
        userId: p.userId,
        nickname: p.nickname,
        skills: [...p.skills].sort(),
        customSkills: p.customSkills ?? [],
      }));
    return { items };
  },
  myTeams: async () => {
    const meId = current().userId;
    const myMemberships = teamMembersStore.filter((m) => m.userId === meId);
    const items: TeamSummary[] = [];
    for (const membership of myMemberships) {
      const entity = teamsStore.find(
        (t) => t.id === membership.teamId && t.status === "active",
      );
      if (!entity) continue;
      items.push(mockBuildTeamSummary(entity, membership.role));
    }
    return { items };
  },
  createTeam: async (body) => {
    const owner = current();
    const nowDate = currentNow();
    const nowMs = nowDate.getTime();
    if (
      !fixture.competitions.items.some((c) => c.name === body.competition.trim())
    )
      throw new ApiError(
        "请选择官方比赛",
        { competition: "请选择官方比赛" },
        "validation_error",
      );
    const description = body.description.trim();
    if (!description)
      throw new ApiError(
        "请填写队伍介绍",
        { description: "请填写队伍介绍" },
        "validation_error",
      );
    const inviteMessage = body.inviteMessage?.trim();
    if (inviteMessage && Array.from(inviteMessage).length > 300)
      throw new ApiError(
        "附言最多 300 字。",
        { inviteMessage: "附言最多 300 字。" },
        "validation_error",
      );
    const inviteeIds = [...new Set(body.inviteeIds ?? [])];
    for (const id of inviteeIds) {
      const exists = Object.values(data.ownProfiles).some(
        (p) => p.userId === id,
      );
      if (!exists || id === owner.userId)
        throw new ApiError(
          "被邀请用户无效或尚未发布公开名片",
          undefined,
          "validation_error",
        );
    }
    const recFields = body.publishRecruitment
      ? recruitmentDraft({
          competition: body.competition,
          teamName: body.teamName,
          openings: body.openings,
          requirements: body.requirements ?? [],
          background: description,
        })
      : null;
    const day = new Date(nowMs + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    const lastIndex = Math.max(
      0,
      ...teamsStore
        .filter((item) => item.teamNumber.startsWith(day))
        .map((item) => Number.parseInt(item.teamNumber.slice(8), 36)),
    );
    const teamNumber =
      day + (lastIndex + 1).toString(36).toUpperCase().padStart(3, "0");
    const teamId = crypto.randomUUID();
    const teamName = body.teamName?.trim() || teamNumber;
    const createdAt = nowDate.toISOString();
    const entity: MockTeamRecord = {
      id: teamId,
      captainId: owner.userId,
      competition: body.competition.trim(),
      teamName,
      teamNumber,
      description,
      status: "active",
      createdAt,
    };
    teamsStore.unshift(entity);
    teamMembersStore.push({
      teamId,
      userId: owner.userId,
      role: "captain",
      joinedAt: createdAt,
    });
    let recruitment: Recruitment | null = null;
    if (recFields) {
      const durationDays = normalizeDurationDays(body.durationDays);
      const createdRecruitment = mockBuildRecruitment({
        ...recFields,
        id: teamId,
        teamId,
        ownerId: owner.userId,
        teamName,
        teamNumber,
        isPublished: true,
        publishedAt: createdAt,
        expiresAt: new Date(nowMs + durationDays * DAY_MS).toISOString(),
        durationDays,
        createdAt,
      });
      data.recruitments.items.unshift(createdRecruitment);
      recruitment = createdRecruitment;
    }
    const createdInvs: TeamInvitation[] = [];
    for (const inviteeId of inviteeIds) {
      const inv: TeamInvitation = {
        id: crypto.randomUUID(),
        teamId,
        teamName,
        competition: entity.competition,
        inviterId: owner.userId,
        inviterNickname: owner.nickname,
        inviteeId,
        inviteeNickname: Object.values(data.personas).find(
          (u) => u.userId === inviteeId,
        )?.nickname,
        status: "pending",
        ...(inviteMessage ? { message: inviteMessage } : {}),
        createdAt,
        expiresAt: new Date(nowMs + INTENT_TTL_MS).toISOString(),
        isExpired: false,
        canRespond: false,
      };
      activeTeamInvites.set(`${teamId}:${inviteeId}`, inv.id);
      teamInvitationsStore.unshift(inv);
      createdInvs.push(inv);
    }
    const summary = mockBuildTeamSummary(entity, "captain");
    return {
      team: summary,
      recruitment,
      invitations: createdInvs,
    };
  },
  updateTeam: async (teamId, body) => {
    const owner = current();
    const entity = teamsStore.find((t) => t.id === teamId);
    if (!entity) throw new ApiError("未找到队伍", undefined, "not_found");
    if (entity.status !== "active")
      throw new ApiError("该队伍已解散", undefined, "conflict");
    const membership = teamMembersStore.find(
      (m) => m.teamId === teamId && m.userId === owner.userId,
    );
    if (!membership || membership.role !== "captain")
      throw new ApiError("只有队长可以管理该队伍", undefined, "forbidden");
    if (
      !fixture.competitions.items.some((c) => c.name === body.competition.trim())
    )
      throw new ApiError(
        "请选择官方比赛",
        { competition: "请选择官方比赛" },
        "validation_error",
      );
    const description = body.description.trim();
    if (!description)
      throw new ApiError(
        "请填写队伍介绍",
        { description: "请填写队伍介绍" },
        "validation_error",
      );
    entity.competition = body.competition.trim();
    entity.teamName = body.teamName?.trim() || entity.teamNumber;
    entity.description = description;
    const linked = data.recruitments.items.find((r) => r.teamId === entity.id);
    if (linked) {
      linked.competition = entity.competition;
      linked.teamName = entity.teamName;
      linked.background = entity.description;
    }
    return mockBuildTeamSummary(entity, "captain");
  },
  teamInvitationsForTeam: async (teamId) => {
    const owner = current();
    const entity = teamsStore.find(
      (t) => t.id === teamId && t.status === "active",
    );
    if (!entity) throw new ApiError("未找到队伍", undefined, "not_found");
    const membership = teamMembersStore.find(
      (m) => m.teamId === teamId && m.userId === owner.userId,
    );
    if (!membership || membership.role !== "captain")
      throw new ApiError(
        "只有队长可以查看队伍正式邀请",
        undefined,
        "forbidden",
      );
    const nowMs = currentNow().getTime();
    const recentCutoff = nowMs - INTENT_TTL_MS;
    return {
      items: teamInvitationsStore
        .filter(
          (inv) =>
            inv.teamId === teamId && Date.parse(inv.expiresAt) > recentCutoff,
        )
        .map((inv) => ({
          ...inv,
          isExpired: nowMs >= Date.parse(inv.expiresAt),
          canRespond: false,
        })),
    };
  },
  leaveTeam: async (teamId) => {
    const me = current();
    const entity = teamsStore.find(
      (t) => t.id === teamId && t.status === "active",
    );
    if (!entity) throw new ApiError("未找到队伍", undefined, "not_found");
    const idx = teamMembersStore.findIndex(
      (m) => m.teamId === teamId && m.userId === me.userId,
    );
    if (idx < 0) throw new ApiError("未找到成员关系", undefined, "not_found");
    if (teamMembersStore[idx].role === "captain")
      throw new ApiError(
        "队长暂不支持直接退出队伍，如需结束队伍请使用解散队伍",
        undefined,
        "captain_cannot_leave",
      );
    teamMembersStore.splice(idx, 1);
  },
  removeTeamMember: async (teamId, memberUserId) => {
    const owner = current();
    const entity = teamsStore.find((t) => t.id === teamId);
    if (!entity) throw new ApiError("未找到队伍", undefined, "not_found");
    if (entity.status !== "active")
      throw new ApiError("该队伍已解散", undefined, "conflict");
    const caller = teamMembersStore.find(
      (m) => m.teamId === teamId && m.userId === owner.userId,
    );
    if (!caller || caller.role !== "captain")
      throw new ApiError("只有队长可以管理该队伍", undefined, "forbidden");
    const idx = teamMembersStore.findIndex(
      (m) => m.teamId === teamId && m.userId === memberUserId,
    );
    if (idx < 0) throw new ApiError("未找到成员关系", undefined, "not_found");
    if (teamMembersStore[idx].role === "captain")
      throw new ApiError(
        "不能移除队长本人",
        undefined,
        "captain_cannot_remove_self",
      );
    teamMembersStore.splice(idx, 1);
    return mockBuildTeamSummary(entity, "captain");
  },
  disbandTeam: async (teamId) => {
    const owner = current();
    const entity = teamsStore.find((t) => t.id === teamId);
    if (!entity) throw new ApiError("未找到队伍", undefined, "not_found");
    if (entity.status !== "active")
      throw new ApiError("该队伍已解散", undefined, "conflict");
    const caller = teamMembersStore.find(
      (m) => m.teamId === teamId && m.userId === owner.userId,
    );
    if (!caller || caller.role !== "captain")
      throw new ApiError("只有队长可以管理该队伍", undefined, "forbidden");
    entity.status = "disbanded";
    const linked = data.recruitments.items.find((r) => r.teamId === entity.id);
    if (linked) linked.isPublished = false;
    for (const [key, invId] of activeTeamInvites.entries()) {
      if (key.startsWith(`${teamId}:`)) {
        activeTeamInvites.delete(key);
        const inv = teamInvitationsStore.find((i) => i.id === invId);
        if (inv) inv.canRespond = false;
      }
    }
    return mockBuildTeamSummary(entity, "captain");
  },
  upsertTeamRecruitment: async (teamId, body) => {
    const owner = current();
    const entity = teamsStore.find(
      (t) => t.id === teamId && t.status === "active",
    );
    if (!entity) throw new ApiError("未找到队伍。", undefined, "not_found");
    if (entity.captainId !== owner.userId)
      throw new ApiError("只有队长可以管理队伍招募", undefined, "forbidden");
    const fields = recruitmentDraft(body);
    const teamName = body.teamName?.trim() || entity.teamNumber;
    entity.competition = fields.competition;
    entity.teamName = teamName;
    entity.description = fields.background;
    const existing = data.recruitments.items.find(
      (r) => r.teamId === entity.id,
    );
    let resultRecruitment: Recruitment;
    if (!existing) {
      const nowDate = currentNow();
      const durationDays = normalizeDurationDays(body.durationDays);
      resultRecruitment = mockBuildRecruitment({
        ...fields,
        id: entity.id,
        teamId: entity.id,
        ownerId: owner.userId,
        teamName,
        teamNumber: entity.teamNumber,
        isPublished: true,
        publishedAt: nowDate.toISOString(),
        expiresAt: new Date(
          nowDate.getTime() + durationDays * DAY_MS,
        ).toISOString(),
        durationDays,
        createdAt: nowDate.toISOString(),
      });
      data.recruitments.items.unshift(resultRecruitment);
    } else {
      Object.assign(existing, fields, { teamName });
      resultRecruitment = mockEnrichRecruitment(existing);
    }
    return resultRecruitment;
  },
  createTeamInvitations: async (teamId, body) => {
    const owner = current();
    const nowDate = currentNow();
    const nowMs = nowDate.getTime();
    const entity = teamsStore.find((t) => t.id === teamId);
    if (!entity) throw new ApiError("未找到队伍。", undefined, "not_found");
    if (entity.status !== "active")
      throw new ApiError("该队伍当前不可发送正式组队邀请", undefined, "conflict");
    if (entity.captainId !== owner.userId)
      throw new ApiError("只有队长可以发送正式组队邀请", undefined, "forbidden");
    const cleanedMessage = body.message?.trim();
    if (cleanedMessage && Array.from(cleanedMessage).length > 300)
      throw new ApiError(
        "附言最多 300 字。",
        { message: "附言最多 300 字。" },
        "validation_error",
      );
    const uniqueIds = [...new Set(body.inviteeIds)];
    const results: TeamInvitation[] = [];
    for (const inviteeId of uniqueIds) {
      const exists = Object.values(data.ownProfiles).some(
        (p) => p.userId === inviteeId,
      );
      if (!exists || inviteeId === owner.userId)
        throw new ApiError(
          "被邀请用户无效或尚未发布公开名片",
          undefined,
          "validation_error",
        );
      if (
        teamMembersStore.some(
          (m) => m.teamId === entity.id && m.userId === inviteeId,
        )
      )
        throw new ApiError(
          "该用户已经是队伍正式成员",
          undefined,
          "already_member",
        );
      const key = `${entity.id}:${inviteeId}`;
      const existingId = activeTeamInvites.get(key);
      const existing = existingId
        ? teamInvitationsStore.find((item) => item.id === existingId)
        : undefined;
      if (existing) {
        if (nowMs < Date.parse(existing.expiresAt)) {
          if (existing.status === "declined")
            throw new ApiError(
              "对方已拒绝该队伍邀请，7 天冷却期内暂不可重复邀请",
              undefined,
              "cooldown",
            );
          results.push({ ...existing, isExpired: false, canRespond: false });
          continue;
        }
        activeTeamInvites.delete(key);
      }
      const inv: TeamInvitation = {
        id: crypto.randomUUID(),
        teamId: entity.id,
        teamName: entity.teamName,
        competition: entity.competition,
        inviterId: owner.userId,
        inviterNickname: owner.nickname,
        inviteeId,
        inviteeNickname: Object.values(data.personas).find(
          (u) => u.userId === inviteeId,
        )?.nickname,
        status: "pending",
        ...(cleanedMessage ? { message: cleanedMessage } : {}),
        createdAt: nowDate.toISOString(),
        expiresAt: new Date(nowMs + INTENT_TTL_MS).toISOString(),
        isExpired: false,
        canRespond: false,
      };
      activeTeamInvites.set(key, inv.id);
      teamInvitationsStore.unshift(inv);
      results.push(inv);
    }
    return { items: results };
  },
  teamInvitations: async () => {
    const meId = current().userId;
    const nowMs = currentNow().getTime();
    return {
      items: teamInvitationsStore
        .filter(
          (inv) =>
            (inv.inviterId === meId || inv.inviteeId === meId) &&
            nowMs < Date.parse(inv.expiresAt),
        )
        .map((inv) => ({
          ...inv,
          isExpired: false,
          canRespond: inv.status === "pending" && inv.inviteeId === meId,
        })),
    };
  },
  teamInvitation: async (id) => {
    const meId = current().userId;
    const nowMs = currentNow().getTime();
    const inv = teamInvitationsStore.find(
      (item) =>
        item.id === id && (item.inviterId === meId || item.inviteeId === meId),
    );
    if (!inv) throw new ApiError("未找到正式组队邀请。", undefined, "not_found");
    const expired = nowMs >= Date.parse(inv.expiresAt);
    return {
      ...inv,
      isExpired: expired,
      canRespond: inv.status === "pending" && !expired && inv.inviteeId === meId,
    };
  },
  respondTeamInvitation: async (id, decision, responseMessage) => {
    const meId = current().userId;
    const nowDate = currentNow();
    const nowMs = nowDate.getTime();
    const trimmedResponse = responseMessage?.trim();
    if (trimmedResponse && Array.from(trimmedResponse).length > 300)
      throw new ApiError(
        "回应最多 300 字。",
        { responseMessage: "回应最多 300 字。" },
        "validation_error",
      );
    const inv = teamInvitationsStore.find(
      (item) =>
        item.id === id && (item.inviterId === meId || item.inviteeId === meId),
    );
    if (!inv) throw new ApiError("未找到正式组队邀请。", undefined, "not_found");
    if (inv.inviteeId !== meId)
      throw new ApiError(
        "只有被邀请者可以处理该正式组队邀请",
        undefined,
        "forbidden",
      );
    if (inv.status === "pending" && nowMs >= Date.parse(inv.expiresAt))
      throw new ApiError(
        "该正式组队邀请已超过 7 天有效期，无法继续处理",
        undefined,
        "expired",
      );
    const team = teamsStore.find((t) => t.id === inv.teamId);
    if (inv.status === "pending" && (!team || team.status !== "active"))
      throw new ApiError(
        "该队伍已解散，无法继续处理正式组队邀请",
        undefined,
        "conflict",
      );
    if (inv.status !== "pending") {
      if (inv.status !== decision)
        throw new ApiError("该正式组队邀请已有不同回应", undefined, "conflict");
      return {
        ...inv,
        isExpired: nowMs >= Date.parse(inv.expiresAt),
        canRespond: false,
      };
    }
    inv.status = decision;
    inv.respondedAt = nowDate.toISOString();
    if (trimmedResponse) inv.responseMessage = trimmedResponse;
    if (decision === "accepted") {
      activeTeamInvites.delete(`${inv.teamId}:${inv.inviteeId}`);
      if (
        !teamMembersStore.some(
          (m) => m.teamId === inv.teamId && m.userId === meId,
        )
      ) {
        teamMembersStore.push({
          teamId: inv.teamId,
          userId: meId,
          role: "member",
          joinedAt: nowDate.toISOString(),
        });
      }
    } else {
      inv.expiresAt = new Date(nowMs + INTENT_TTL_MS).toISOString();
    }
    return { ...inv, isExpired: false, canRespond: false };
  },
};
