import type { components } from "./schema";
type Schemas = components["schemas"];
export type Persona = Schemas["SessionInput"]["persona"];
export type AuthMode = Schemas["AuthCapabilities"]["mode"];
export type Me =
  | Schemas["SessionUser"]
  | (Schemas["StudentSessionUser"] & { persona?: never });
export type Profile = Schemas["PublicProfile"];
export type OwnProfile = Schemas["Profile"] & {
  publicFields: Schemas["PublicFields"];
};
export type Recruitment = Schemas["Recruitment"];
export type RecruitmentRequirement = Schemas["RecruitmentRequirement"];
export type RecruitmentDuration = 7 | 14 | 30;
export type Competition = Schemas["Competition"];
export type Intent = Schemas["IntentDetail"];
export type RecruitmentInput = Schemas["RecruitmentInput"];
export type CreateTeamInviteInput = Schemas["CreateTeamInviteInput"];
export type TeamInviteResult = Schemas["TeamInviteResult"];
export type HighFiveCandidate = Schemas["HighFiveCandidate"];
export type HighFiveCandidateSource = Schemas["HighFiveCandidateSource"];
export type TeamSummary = Schemas["TeamSummary"];
export type TeamMemberInfo = Schemas["TeamMemberInfo"];
export type CreateTeamInput = Schemas["CreateTeamInput"];
export type CreateTeamResult = Schemas["CreateTeamResult"];
export type UpdateTeamInput = Schemas["UpdateTeamInput"];
export type TeamInvitation = Schemas["TeamInvitation"];
export type TeamInvitationInput = Schemas["TeamInvitationInput"];
export type UserSearchItem = Schemas["UserSearchItem"];
export type ProfileInput = Schemas["ProfileInput"] & {
  publicFields: Schemas["PublicFields"];
};
export type Skill = Profile["skills"][number];
export class ApiError extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string>,
    public code?: string,
  ) {
    super(message);
  }
}
let csrfToken = "";
async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(csrfToken && init?.method && init.method !== "GET"
          ? { "X-CSRF-Token": csrfToken }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "服务暂不可用，请稍后重试。",
      undefined,
      "connection_failed",
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.error?.message || `请求失败（${response.status}）`,
      data.error?.fields,
      data.error?.code,
    );
  }
  const token = response.headers.get("X-CSRF-Token");
  if (token) csrfToken = token;
  return response;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>;
}
const write = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export const httpApi = {
  competitions: () => request<Schemas["CompetitionList"]>("/competitions"),
  me: () => request<Me>("/me"),
  session: (persona: Persona) => {
    csrfToken = "";
    return request<Me>("/demo/session", write("POST", { persona }));
  },
  profiles: (skill = "") =>
    request<{ items: Profile[] }>(
      `/profiles${skill ? `?skill=${encodeURIComponent(skill)}` : ""}`,
    ),
  profile: (id: string) => request<Profile>(`/profiles/${id}`),
  evidence: async (userId: string, id: string) =>
    (await send(`/profiles/${userId}/evidence/${id}`)).blob(),
  ownProfile: () => request<OwnProfile>("/me/profile"),
  saveProfile: (body: ProfileInput) =>
    request<OwnProfile>("/me/profile", write("PUT", body)),
  recruitments: (skill = "") =>
    request<{ items: Recruitment[] }>(
      `/recruitments${skill ? `?skill=${encodeURIComponent(skill)}` : ""}`,
    ),
  ownRecruitments: () => request<{ items: Recruitment[] }>("/me/recruitments"),
  updateRecruitment: (id: string, body: RecruitmentInput) =>
    request<Recruitment>(`/recruitments/${id}`, write("PUT", body)),
  setRecruitmentVisibility: (
    id: string,
    isPublished: boolean,
    durationDays?: RecruitmentDuration,
  ) =>
    request<Recruitment>(
      `/recruitments/${id}/visibility`,
      write("PATCH", {
        isPublished,
        ...(durationDays !== undefined ? { durationDays } : {}),
      }),
    ),
  republishRecruitment: (id: string, durationDays: RecruitmentDuration = 14) =>
    request<Recruitment>(
      `/recruitments/${id}/republish`,
      write("POST", { durationDays }),
    ),
  renewRecruitment: (
    id: string,
    durationDays: RecruitmentDuration = 14,
    expectedExpiresAt?: string,
  ) =>
    request<Recruitment>(
      `/recruitments/${id}/renew`,
      write("POST", {
        durationDays,
        ...(expectedExpiresAt ? { expectedExpiresAt } : {}),
      }),
    ),
  createRecruitment: (body: RecruitmentInput) =>
    request<Recruitment>("/recruitments", write("POST", body)),
  intents: () => request<{ items: Intent[] }>("/me/intents"),
  validCandidates: (
    scope?: string | { recruitmentId?: string; teamId?: string },
  ) => {
    const params = new URLSearchParams();
    if (typeof scope === "string" && scope) {
      params.set("recruitmentId", scope);
    } else if (scope && typeof scope === "object") {
      if (scope.recruitmentId) params.set("recruitmentId", scope.recruitmentId);
      if (scope.teamId) params.set("teamId", scope.teamId);
    }
    const qs = params.toString();
    return request<{ items: HighFiveCandidate[] }>(
      `/me/high-five-candidates${qs ? `?${qs}` : ""}`,
    );
  },
  searchUsers: (q: string, teamId?: string) => {
    const params = new URLSearchParams({ q });
    if (teamId) params.set("teamId", teamId);
    return request<{ items: UserSearchItem[] }>(
      `/users/search?${params.toString()}`,
    );
  },
  myTeams: () => request<{ items: TeamSummary[] }>("/me/teams"),
  createTeam: (body: CreateTeamInput) =>
    request<CreateTeamResult>("/teams", write("POST", body)),
  updateTeam: (teamId: string, body: UpdateTeamInput) =>
    request<TeamSummary>(`/teams/${teamId}`, write("PUT", body)),
  upsertTeamRecruitment: (teamId: string, body: RecruitmentInput) =>
    request<Recruitment>(`/teams/${teamId}/recruitment`, write("PUT", body)),
  teamInvitationsForTeam: (teamId: string) =>
    request<{ items: TeamInvitation[] }>(`/teams/${teamId}/invitations`),
  createTeamInvitations: (teamId: string, body: TeamInvitationInput) =>
    request<{ items: TeamInvitation[] }>(
      `/teams/${teamId}/invitations`,
      write("POST", body),
    ),
  leaveTeam: async (teamId: string) => {
    await send(`/teams/${teamId}/members/me`, { method: "DELETE" });
  },
  removeTeamMember: (teamId: string, memberUserId: string) =>
    request<TeamSummary>(
      `/teams/${teamId}/members/${memberUserId}`,
      { method: "DELETE" },
    ),
  disbandTeam: (teamId: string) =>
    request<TeamSummary>(`/teams/${teamId}/disband`, { method: "POST" }),
  teamInvitations: () =>
    request<{ items: TeamInvitation[] }>("/me/team-invitations"),
  teamInvitation: (id: string) =>
    request<TeamInvitation>(`/team-invitations/${id}`),
  respondTeamInvitation: (
    id: string,
    decision: "accepted" | "declined",
    responseMessage?: string,
  ) =>
    request<TeamInvitation>(
      `/team-invitations/${id}/response`,
      write("POST", {
        decision,
        ...(responseMessage !== undefined ? { responseMessage } : {}),
      }),
    ),
  intent: (id: string) => request<Intent>(`/intents/${id}`),
  createIntent: (body: {
    kind: "apply" | "invite" | "personal";
    recruitmentId?: string;
    candidateId?: string;
    message?: string;
    sourcePersonalIntentId?: string;
  }) => request<Intent>("/intents", write("POST", body)),
  createTeamAndInvite: (intentId: string, body: CreateTeamInviteInput) =>
    request<TeamInviteResult>(
      `/intents/${intentId}/create-team-invite`,
      write("POST", body),
    ),
  respond: (
    id: string,
    decision: "accepted" | "declined",
    responseMessage?: string,
  ) =>
    request<Intent>(
      `/intents/${id}/response`,
      write("POST", {
        decision,
        ...(responseMessage !== undefined ? { responseMessage } : {}),
      }),
    ),
};
export type Api = typeof httpApi;

const mockMethods = new Map<
  keyof Api,
  (...args: unknown[]) => Promise<unknown>
>();

export const api: Api =
  import.meta.env.VITE_TEAMUP_MOCK === "true"
    ? new Proxy({} as Api, {
        get(_target, key: keyof Api) {
          let method = mockMethods.get(key);
          if (!method) {
            method = (...args: unknown[]) =>
              import("./mock").then(({ mockApi }) =>
                (mockApi[key] as (...args: unknown[]) => Promise<unknown>)(
                  ...args,
                ),
              );
            mockMethods.set(key, method);
          }
          return method;
        },
      })
    : httpApi;

export const authApi = {
  capabilities: () =>
    request<Schemas["AuthCapabilities"]>("/auth/capabilities"),
  login: (payload: Schemas["AuthCredentials"]) =>
    request<Schemas["StudentSessionUser"]>(
      "/auth/login",
      write("POST", payload),
    ),
  register: (payload: Schemas["Registration"]) =>
    request<Schemas["StudentSessionUser"]>(
      "/auth/register",
      write("POST", payload),
    ),
  reset: async (payload: Schemas["ResetPassword"]) => {
    await send("/auth/password/reset/confirm", write("POST", payload));
    csrfToken = "";
  },
  change: async (payload: Schemas["ChangePassword"]) => {
    await send("/auth/password/change", write("POST", payload));
    csrfToken = "";
  },
  logout: async () => {
    await send("/auth/logout", { method: "POST" });
    csrfToken = "";
  },
};
