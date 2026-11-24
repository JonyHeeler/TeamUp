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
  type RecruitmentInput,
  type Skill,
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
let intents: Intent[] = [];
const intentMessages = new Map<string, string>();
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
const view = (i: Intent): Intent => ({
  ...i,
  teamName: data.recruitments.items.find((team) => team.id === i.recruitmentId)
    ?.teamName,
  counterpartNickname: Object.values(data.personas).find(
    (user) =>
      user.userId ===
      (current().userId === i.candidateId ? i.ownerId : i.candidateId),
  )?.nickname,
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
  return {
    ...body,
    competition: body.competition.trim(),
    skills: [
      ...new Set(body.requirements.flatMap((item) => item.skills ?? [])),
    ],
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
  recruitments: async (skill = "") => ({
    items: data.recruitments.items.filter(
      (t) => t.isPublished && (!skill || t.skills.includes(skill as Skill)),
    ),
  }),
  ownRecruitments: async () => {
    const ownerId = current().userId;
    return {
      items: data.recruitments.items.filter((team) => team.ownerId === ownerId),
    };
  },
  updateRecruitment: async (id, body) => {
    const team = ownedTeam(id);
    Object.assign(team, recruitmentDraft(body), {
      teamName: body.teamName?.trim() || team.teamNumber,
    });
    return { ...team };
  },
  setRecruitmentVisibility: async (id, isPublished) => {
    const team = ownedTeam(id);
    team.isPublished = isPublished;
    return { ...team };
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
    const t: Recruitment = {
      ...fields,
      isPublished: true,
      teamName: body.teamName?.trim() || teamNumber,
      teamNumber,
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
    const message = intentMessages.get(i.id);
    const other = i.ownerId === current().userId ? i.candidateId : i.ownerId;
    const qq = Object.values(data.ownProfiles).find(
      (profile) => profile.userId === other,
    )?.qq;
    return {
      ...view(i),
      ...(message ? { message } : {}),
      ...(i.status === "accepted" && qq ? { counterpartQq: qq } : {}),
    };
  },
  createIntent: async (body) => {
    const user = current();
    const t = data.recruitments.items.find((x) => x.id === body.recruitmentId);
    if (!t) throw new ApiError("未找到招募。");
    if (!t.isPublished) throw new ApiError("这支队伍的招募已下架");
    const message = body.message?.trim();
    if (message && Array.from(message).length > 300)
      throw new ApiError(
        "附言最多 300 字。",
        { message: "附言最多 300 字。" },
        "validation_error",
      );
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
    if (message) intentMessages.set(i.id, message);
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
