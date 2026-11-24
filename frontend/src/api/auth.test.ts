import { afterEach, expect, it, vi } from "vitest";
import { authApi, httpApi } from "./client";

afterEach(() => vi.unstubAllGlobals());

it("keeps the student CSRF token in memory and sends it on writes", async () => {
  const session = () =>
    new Response(
      JSON.stringify({ userId: "student", nickname: "同学", kind: "student" }),
      { headers: { "X-CSRF-Token": "csrf-value" } },
    );
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          userId: "demo",
          nickname: "队长",
          persona: "captain",
        }),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const credentials = { studentId: "123", password: "password" };
  await authApi.login(credentials);
  await authApi.change({ currentPassword: "old", password: "new" });
  expect(fetchMock.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("csrf-value");
  await authApi.login(credentials);
  expect(fetchMock.mock.calls[2][1].headers["X-CSRF-Token"]).toBeUndefined();
  await authApi.logout();
  expect(fetchMock.mock.calls[3][1].headers["X-CSRF-Token"]).toBe("csrf-value");
  await httpApi.session("captain");
  expect(fetchMock.mock.calls[4][1].headers["X-CSRF-Token"]).toBeUndefined();
});
