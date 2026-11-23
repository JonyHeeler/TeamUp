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
const current = () => {
  if (!persona) throw new ApiError("请先选择演示身份。");
  return data.personas[persona];
};
const publicProfile = (p: OwnProfile): Profile => {
  const { publicFields, major, grade, experience, ...rest } = p;
  return {
    ...rest,
    ...(publicFields.major && major ? { major } : {}),
    ...(publicFields.grade && grade ? { grade } : {}),
    ...(publicFields.experience && experience ? { experience } : {}),
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
  me: async () => current(),
  session: async (p) => {
    persona = p;
    return current();
  },
  profiles: async (skill = "") => ({
    items: Object.values(data.ownProfiles)
      .map(publicProfile)
      .filter((p) => !skill || p.skills.includes(skill as Skill)),
  }),
  profile: async (id) => {
    const p = Object.values(data.ownProfiles).find((x) => x.userId === id);
    if (!p) throw new ApiError("未找到名片。");
    return publicProfile(p);
  },
  ownProfile: async () => {
    current();
    return data.ownProfiles[persona!];
  },
  saveProfile: async (body) => {
    current();
    const p = data.ownProfiles[persona!];
    Object.assign(p, body);
    return p;
  },
  recruitments: async (skill = "") => ({
    items: data.recruitments.items.filter(
      (t) => !skill || t.skills.includes(skill as Skill),
    ),
  }),
  createRecruitment: async (body) => {
    const t: Recruitment = {
      ...body,
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
