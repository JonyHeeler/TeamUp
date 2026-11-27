import type { Intent, Me } from "./api/client";

export type Notice =
  | "saved"
  | "published"
  | "teamSaved"
  | "teamArchived"
  | "teamRestored"
  | Intent["status"];
export type Navigate = (
  href: string,
  notice?: Notice,
  replace?: boolean,
) => void;
export type PageProps = { me: Me | null; navigate: Navigate };
