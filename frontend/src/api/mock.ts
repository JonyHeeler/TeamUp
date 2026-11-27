import { replaceMockEvidence } from "./mockEvidence";
import { publicProfile } from "./mockProfile";
import { matchesSkill } from "../profile/skillSearch";
import { recruitmentDraft } from "./mockRecruitment";
import fixture from "../../../contracts/examples/demo.json";
import type { Api } from "./client";
import { ApiError } from "./http";
import { createMockIntents, type MockData } from "./mockIntents";
import type { Persona, Recruitment, Skill } from "./types";

const data = structuredClone(fixture) as MockData;
for (const profile of Object.values(data.ownProfiles)) {
  profile.listed ??= true;
  profile.publicFields.qq ??= true;
}
const sessionKey = "teamup-mock-persona";
const previous = sessionStorage.getItem(sessionKey);
let persona: Persona | null =
  previous && Object.hasOwn(data.personas, previous)
    ? (previous as Persona)
    : null;
const pictures = new Map<string, Blob>();
const examplePictures = import.meta.glob<string>("./demo-evidence/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
/** Returns the current simulated identity. */
const current = () => {
  if (!persona) throw new ApiError("请先选择演示身份。");
  return data.personas[persona];
};
/** Finds a recruitment managed by the current identity. */
function ownedTeam(id: string) {
  const owner = current();
  const team = data.recruitments.items.find((item) => item.id === id);
  if (!team) throw new ApiError("未找到招募。");
  if (team.ownerId !== owner.userId) throw new ApiError("只有队长可以管理队伍");
  return team;
}

/** Projects a recruitment with its publisher's current nickname. */
function publicTeam(team: Recruitment): Recruitment {
  const owner = Object.values(data.ownProfiles).find(
    (profile) => profile.userId === team.ownerId,
  );
  return { ...team, ownerNickname: owner?.nickname ?? team.ownerNickname };
}

export const mockApi: Api = {
  /** Lists official competitions. */
  competitions: async () => fixture.competitions,
  /** Restores the current identity. */
  me: async () => current(),
  /** Switches the demo identity. */
  session: async (p) => {
    persona = p;
    sessionStorage.setItem(sessionKey, p);
    return current();
  },
  /** Lists public profiles. */
  profiles: async (skill = "") => ({
    items: Object.values(data.ownProfiles)
      .filter((p) => p.listed !== false)
      .map((p) => publicProfile(p))
      .filter((p) => matchesSkill(p, skill)),
  }),
  /** Loads one public profile. */
  profile: async (id) => {
    const p = Object.values(data.ownProfiles).find((x) => x.userId === id);
    if (!p || p.listed === false)
      throw new ApiError("未找到名片。", undefined, "not_found");
    return publicProfile(p, true);
  },
  /** Loads the current user profile. */
  ownProfile: async () => {
    current();
    return data.ownProfiles[persona!];
  },
  /** Loads a profile evidence image. */
  evidence: async (userId, id) => {
    const profile = Object.values(data.ownProfiles).find(
      (entry) => entry.userId === userId,
    );
    const image = pictures.get(id);
    const example = examplePictures[`./demo-evidence/${id}.webp`];
    if (
      (!image && !example) ||
      !profile?.evidenceIds.includes(id) ||
      ((profile.listed === false || !profile.publicFields.experience) &&
        (!persona || current().userId !== userId))
    )
      throw new ApiError("未找到图片", undefined, "not_found");
    if (image) return image;
    const response = await fetch(example);
    if (!response.ok) throw new ApiError("未找到图片", undefined, "not_found");
    return response.blob();
  },
  /** Saves the current user profile. */
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
    replaceMockEvidence(p, evidence, pictures);
    Object.assign(p, details);
    identity.nickname = p.nickname;
    return p;
  },
  /** Changes the current profile discovery state. */
  setProfileVisibility: async (listed) => {
    current();
    data.ownProfiles[persona!].listed = listed;
    return { listed };
  },
  /** Lists published recruitments. */
  recruitments: async (skill = "") => ({
    items: data.recruitments.items
      .filter(
        (t) => t.isPublished && (!skill || t.skills.includes(skill as Skill)),
      )
      .map(publicTeam),
  }),
  /** Lists the current user recruitments. */
  ownRecruitments: async () => {
    const ownerId = current().userId;
    return {
      items: data.recruitments.items
        .filter((team) => team.ownerId === ownerId)
        .map(publicTeam),
    };
  },
  /** Updates a recruitment. */
  updateRecruitment: async (id, body) => {
    const team = ownedTeam(id);
    Object.assign(team, recruitmentDraft(body), {
      teamName: body.teamName?.trim() || team.teamNumber,
    });
    return { ...team };
  },
  /** Changes a recruitment publication state. */
  setRecruitmentVisibility: async (id, isPublished) => {
    const team = ownedTeam(id);
    team.isPublished = isPublished;
    return { ...team };
  },
  /** Creates a recruitment. */
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
      ownerNickname: owner.nickname,
      createdAt: timestamp.toISOString(),
    };
    data.recruitments.items.unshift(t);
    return t;
  },
  ...createMockIntents(data, current),
};
