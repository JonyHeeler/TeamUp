import type { components } from "./schema";
type Schemas = components["schemas"];
export type Persona = Schemas["SessionInput"]["persona"];
export type Me = Schemas["User"];
export type Profile = Schemas["PublicProfile"];
export type OwnProfile = Schemas["Profile"] & {
  publicFields: Schemas["PublicFields"];
};
export type Recruitment = Schemas["Recruitment"];
export type RecruitmentRequirement = Schemas["RecruitmentRequirement"];
export type Competition = Schemas["Competition"];
export type Intent = Schemas["IntentDetail"];
export type RecruitmentInput = Schemas["RecruitmentInput"];
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
async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
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
  session: (persona: Persona) =>
    request<Me>("/demo/session", write("POST", { persona })),
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
  createRecruitment: (body: RecruitmentInput) =>
    request<Recruitment>("/recruitments", write("POST", body)),
  intents: () => request<{ items: Intent[] }>("/me/intents"),
  intent: (id: string) => request<Intent>(`/intents/${id}`),
  createIntent: (body: {
    kind: "apply" | "invite";
    recruitmentId: string;
    candidateId?: string;
  }) => request<Intent>("/intents", write("POST", body)),
  respond: (id: string, decision: "accepted" | "declined") =>
    request<Intent>(`/intents/${id}/response`, write("POST", { decision })),
};
export type Api = typeof httpApi;

export const api: Api =
  import.meta.env.VITE_TEAMUP_MOCK === "true"
    ? new Proxy({} as Api, {
        get:
          (_target, key: keyof Api) =>
          (...args: unknown[]) =>
            import("./mock").then(({ mockApi }) =>
              (mockApi[key] as (...args: unknown[]) => Promise<unknown>)(
                ...args,
              ),
            ),
      })
    : httpApi;
