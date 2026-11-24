import fixture from "../../../contracts/examples/demo.json";
import {
  ApiError,
  type Api,
  type Intent,
  type Me,
  type OwnProfile,
  type Persona,
  type Profile,
  type Recruitment,
  type Skill,
} from "./client";
const data = structuredClone(fixture) as {
  personas: Record<Persona, Me>;
  ownProfiles: Record<Persona, OwnProfile>;
  recruitments: { items: Recruitment[] };
};
let persona: Persona | null = null;
let intents: Intent[] = [];
const pictures = new Map<string, Blob>();
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
    customFields: p.customFields
      ?.filter((item) => item.isPublic)
      .map(({ label, value }) => ({ label, value })),
  };
  for (const field of [
    "college",
    "major",
    "grade",
    "experience",
    "availability",
    "preferredRole",
    "interests",
  ] as const) {
    if (p.publicFields[field] && p[field]) result[field] = p[field];
  }
  if (withEvidence && p.publicFields.experience && p.evidenceIds.length)
    result.evidenceIds = p.evidenceIds;
  return result;
};
const view = (i: Intent): Intent => ({
  ...i,
  canRespond:
    i.status === "pending" &&
    (i.kind === "apply" ? i.ownerId : i.candidateId) === current().userId,
});
const lookup = (id: string) => {
  const i = intents.find(
    (x) => x.id === id && [x.ownerId, x.candidateId].includes(current().userId),
  );
  if (!i) throw new ApiError("未找到击掌申请。");
  return i;
};
export const mockApi: Api = {
  competitions: async () => fixture.competitions,
  me: async () => current(),
  session: async (p) => {
    persona = p;
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
    if (
      !image ||
      !profile?.evidenceIds.includes(id) ||
      (!profile.publicFields.experience &&
        (!persona || current().userId !== userId))
    )
      throw new ApiError("未找到图片", undefined, "not_found");
    return image;
  },
  saveProfile: async (body) => {
    const identity = current();
    const p = data.ownProfiles[persona!];
    const { evidence, ...details } = body;
    if (!body.college.trim())
      throw new ApiError(
        "请填写学院",
        { college: "请填写学院" },
        "validation_error",
      );
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
  recruitments: async (skill = "") => ({
    items: data.recruitments.items.filter(
      (t) => !skill || t.skills.includes(skill as Skill),
    ),
  }),
  createRecruitment: async (body) => {
    if (
      !fixture.competitions.items.some(
        (c) => c.name === body.competition.trim(),
      )
    )
      throw new ApiError(
        "请选择官方比赛",
        { competition: "请选择官方比赛" },
        "validation_error",
      );
    const owner = current();
    if (
      body.requirements.length !== body.openings ||
      body.requirements.some(
        (item) => !item.skills?.length && !item.expectation?.trim(),
      )
    )
      throw new ApiError(
        "请填写每个招募名额的需求",
        { requirements: "请填写每个招募名额的需求" },
        "validation_error",
      );
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
    const t: Recruitment = {
      ...body,
      competition: body.competition.trim(),
      teamName: body.teamName?.trim() || teamNumber,
      teamNumber,
      skills: [
        ...new Set(body.requirements.flatMap((item) => item.skills ?? [])),
      ],
      id: crypto.randomUUID(),
      ownerId: owner.userId,
      createdAt: timestamp.toISOString(),
    };
    data.recruitments.items.unshift(t);
    return t;
  },
  intents: async () => ({
    items: intents
      .filter((i) => [i.ownerId, i.candidateId].includes(current().userId))
      .map(view),
  }),
  intent: async (id) => {
    const i = lookup(id);
    const other = i.ownerId === current().userId ? i.candidateId : i.ownerId;
    const qq = Object.values(data.ownProfiles).find(
      (profile) => profile.userId === other,
    )?.qq;
    return {
      ...view(i),
      ...(i.status === "accepted" && qq ? { counterpartQq: qq } : {}),
    };
  },
  createIntent: async (body) => {
    const user = current();
    const t = data.recruitments.items.find((x) => x.id === body.recruitmentId);
    if (!t) throw new ApiError("未找到招募。");
    const candidateId = body.kind === "apply" ? user.userId : body.candidateId;
    if (
      !candidateId ||
      candidateId === t.ownerId ||
      (body.kind === "invite" && t.ownerId !== user.userId)
    )
      throw new ApiError("无法发出这条击掌申请。");
    const existing = intents.find(
      (i) => i.recruitmentId === t.id && i.candidateId === candidateId,
    );
    if (existing) return view(existing);
    const i: Intent = {
      id: crypto.randomUUID(),
      recruitmentId: t.id,
      candidateId,
      ownerId: t.ownerId,
      kind: body.kind,
      status: "pending",
      createdAt: new Date().toISOString(),
      canRespond: false,
    };
    intents.unshift(i);
    return view(i);
  },
  respond: async (id, decision) => {
    const i = lookup(id);
    if (!view(i).canRespond) throw new ApiError("该击掌申请无法回应。");
    i.status = decision;
    i.respondedAt = new Date().toISOString();
    return view(i);
  },
};
