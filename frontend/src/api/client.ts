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
  setRecruitmentVisibility: (id: string, isPublished: boolean) =>
    request<Recruitment>(
      `/recruitments/${id}/visibility`,
      write("PATCH", { isPublished }),
    ),
  createRecruitment: (body: RecruitmentInput) =>
    request<Recruitment>("/recruitments", write("POST", body)),
  intents: () => request<{ items: Intent[] }>("/me/intents"),
  intent: (id: string) => request<Intent>(`/intents/${id}`),
  createIntent: (body: {
    kind: "apply" | "invite";
    recruitmentId: string;
    candidateId?: string;
    message?: string;
  }) => request<Intent>("/intents", write("POST", body)),
  respond: (id: string, decision: "accepted" | "declined") =>
    request<Intent>(`/intents/${id}/response`, write("POST", { decision })),
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
