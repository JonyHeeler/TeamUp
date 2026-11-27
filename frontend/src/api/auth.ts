import { clearCsrfToken, request, send, write } from "./http";
import type { Schemas } from "./types";

/** Calls the account authentication endpoints. */
export const authApi = {
  /** Loads available authentication modes. */
  capabilities: () =>
    request<Schemas["AuthCapabilities"]>("/auth/capabilities"),
  /** Signs in a student account. */
  login: (payload: Schemas["AuthCredentials"]) =>
    request<Schemas["StudentSessionUser"]>(
      "/auth/login",
      write("POST", payload),
    ),
  /** Registers and signs in a student account. */
  register: (payload: Schemas["Registration"]) =>
    request<Schemas["StudentSessionUser"]>(
      "/auth/register",
      write("POST", payload),
    ),
  /** Resets a student password. */
  reset: async (payload: Schemas["ResetPassword"]) => {
    await send("/auth/password/reset/confirm", write("POST", payload));
    clearCsrfToken();
  },
  /** Changes the current password. */
  change: async (payload: Schemas["ChangePassword"]) => {
    await send("/auth/password/change", write("POST", payload));
    clearCsrfToken();
  },
  /** Signs out the current account. */
  logout: async () => {
    await send("/auth/logout", { method: "POST" });
    clearCsrfToken();
  },
};
