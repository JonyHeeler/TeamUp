import { clearCsrfToken, request, send, write } from "./http";
import type {
  Intent,
  IntentDetail,
  IntentInput,
  Me,
  OwnProfile,
  Persona,
  Profile,
  ProfileInput,
  Recruitment,
  RecruitmentInput,
  Schemas,
} from "./types";

/** Calls the HTTP endpoints for demo business operations. */
export const httpApi = {
  /** Lists official competitions. */
  competitions: () => request<Schemas["CompetitionList"]>("/competitions"),
  /** Restores the current identity. */
  me: () => request<Me>("/me"),
  /** Switches the demo identity. */
  session: (persona: Persona) => {
    clearCsrfToken();
    return request<Me>("/demo/session", write("POST", { persona }));
  },
  /** Lists public profiles. */
  profiles: (search = "") =>
    request<{ items: Profile[] }>(
      `/profiles${search ? `?${new URLSearchParams({ search })}` : ""}`,
    ),
  /** Loads one public profile. */
  profile: (id: string) => request<Profile>(`/profiles/${id}`),
  /** Loads a profile evidence image. */
  evidence: async (userId: string, id: string) =>
    (await send(`/profiles/${userId}/evidence/${id}`)).blob(),
  /** Loads the current user profile. */
  ownProfile: () => request<OwnProfile>("/me/profile"),
  /** Saves the current user profile. */
  saveProfile: (body: ProfileInput) =>
    request<OwnProfile>("/me/profile", write("PUT", body)),
  /** Changes whether the current profile is discoverable. */
  setProfileVisibility: (listed: boolean) =>
    request<{ listed: boolean }>(
      "/me/profile/visibility",
      write("PATCH", { listed }),
    ),
  /** Lists published recruitments. */
  recruitments: (search = "") =>
    request<{ items: Recruitment[] }>(
      `/recruitments${search ? `?${new URLSearchParams({ search })}` : ""}`,
    ),
  /** Lists the current user recruitments. */
  ownRecruitments: () => request<{ items: Recruitment[] }>("/me/recruitments"),
  /** Updates a recruitment. */
  updateRecruitment: (id: string, body: RecruitmentInput) =>
    request<Recruitment>(`/recruitments/${id}`, write("PUT", body)),
  /** Changes a recruitment publication state. */
  setRecruitmentVisibility: (id: string, isPublished: boolean) =>
    request<Recruitment>(
      `/recruitments/${id}/visibility`,
      write("PATCH", { isPublished }),
    ),
  /** Creates a recruitment. */
  createRecruitment: (body: RecruitmentInput) =>
    request<Recruitment>("/recruitments", write("POST", body)),
  /** Lists the current user intents. */
  intents: () => request<{ items: Intent[] }>("/me/intents"),
  /** Loads an intent detail. */
  intent: (id: string) => request<IntentDetail>(`/intents/${id}`),
  /** Creates an intent and distinguishes an existing record from a new one. */
  createIntent: async (
    body: IntentInput,
  ): Promise<Intent & { created: boolean }> => {
    const response = await send("/intents", write("POST", body));
    const intent: Intent = await response.json();
    return { ...intent, created: response.status === 201 };
  },
  /** Responds to an intent. */
  respond: (id: string, decision: "accepted" | "declined", message?: string) =>
    request<Intent>(
      `/intents/${id}/response`,
      write("POST", { decision, message }),
    ),
};
