import { describe, expect, it } from "vitest";
import { mockApi } from "./mock";

describe("demo intent flow", () => {
  it("keeps contacts private until accepted and preserves a declined duplicate", async () => {
    await mockApi.session("candidate-a");
    const teams = await mockApi.recruitments();
    const first = await mockApi.createIntent({
      kind: "apply",
      recruitmentId: teams.items[0].id,
    });
    expect((await mockApi.intent(first.id)).counterpartQq).toBeUndefined();
    await mockApi.session("candidate-b");
    await expect(mockApi.intent(first.id)).rejects.toThrow();
    await mockApi.session("captain");
    await mockApi.respond(first.id, "accepted");
    expect((await mockApi.intent(first.id)).counterpartQq).toMatch(/^DEMO-QQ-/);
    const people = await mockApi.profiles();
    const candidate = people.items.find(
      (p) => p.userId !== first.candidateId && p.userId !== first.ownerId,
    )!;
    const invitation = await mockApi.createIntent({
      kind: "invite",
      recruitmentId: teams.items[0].id,
      candidateId: candidate.userId,
    });
    await mockApi.session("candidate-b");
    await mockApi.respond(invitation.id, "declined");
    expect((await mockApi.intent(invitation.id)).counterpartQq).toBeUndefined();
    await mockApi.session("captain");
    expect(
      (
        await mockApi.createIntent({
          kind: "invite",
          recruitmentId: teams.items[0].id,
          candidateId: candidate.userId,
        })
      ).status,
    ).toBe("declined");
  });
});
