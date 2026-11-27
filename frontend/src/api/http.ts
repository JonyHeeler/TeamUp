/** Describes a failed API request and field errors. */
export class ApiError extends Error {
  /** Stores the error details for display. */
  constructor(
    message: string,
    public fields?: Record<string, string>,
    public code?: string,
  ) {
    super(message);
  }
}
let csrfToken = "";
/** Sends a same-origin request and handles errors and session tokens. */
export async function send(
  path: string,
  init?: RequestInit,
): Promise<Response> {
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
/** Sends a request and parses its JSON response. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>;
}
/** Creates a JSON write request. */
export const write = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

/** Clears the current CSRF token after an identity change. */
export function clearCsrfToken() {
  csrfToken = "";
}
