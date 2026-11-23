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
  const { publicFields, major, grade, experience, evidenceIds, ...rest } = p;
  return {
    ...rest,
    ...(publicFields.major && major ? { major } : {}),
    ...(publicFields.grade && grade ? { grade } : {}),
    ...(publicFields.experience && experience ? { experience } : {}),
    ...(withEvidence && publicFields.experience && evidenceIds.length
      ? { evidenceIds }
      : {}),
  };
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
  if (!i) throw new ApiError("未找到意向。");
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
    current();
    const p = data.ownProfiles[persona!];
    const { evidence, ...details } = body;
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
    const t: Recruitment = {
      ...body,
      competition: body.competition.trim(),
      id: crypto.randomUUID(),
      ownerId: current().userId,
      createdAt: new Date().toISOString(),
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
    return {
      ...view(i),
      ...(i.status === "accepted"
        ? {
            counterpartQq: `DEMO-QQ-${i.ownerId === current().userId ? "CANDIDATE" : "CAPTAIN"}`,
          }
        : {}),
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
      throw new ApiError("无法创建该意向。");
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
    if (!view(i).canRespond) throw new ApiError("该意向无法回应。");
    i.status = decision;
    i.respondedAt = new Date().toISOString();
    return view(i);
  },
};
