import { describe, expect, it } from "vitest";
import fixture from "../../../contracts/examples/demo.json";
import { mockApi } from "./mock";

describe("demo profiles", () => {
  it("exposes only the public fields from each complete mock profile", async () => {
    expect(await mockApi.profiles()).toEqual(fixture.profiles);

    for (const persona of ["captain", "candidate-a", "candidate-b"] as const) {
      const user = await mockApi.session(persona);
      const own = await mockApi.ownProfile();
      expect(own).toEqual(fixture.ownProfiles[persona]);
      const publicProfile = await mockApi.profile(user.userId);
      expect(publicProfile).toEqual({
        ...fixture.profiles.items.find((item) => item.userId === user.userId),
        ...(own.publicFields.experience
          ? { evidenceIds: own.evidenceIds }
          : {}),
      });
      expect(publicProfile.qq).toBe(own.qq);
    }
  });
});

describe("profile visibility", () => {
  it("hides optional education fields in the list and detail", async () => {
    const user = await mockApi.session("candidate-a");
    const original = structuredClone(await mockApi.ownProfile());
    await mockApi.saveProfile({
      ...original,
      qq: original.qq!,
      college: original.college!,
      major: original.major!,
      grade: original.grade!,
      publicFields: {
        ...original.publicFields,
        qq: false,
        college: false,
        major: false,
        grade: false,
      },
    });
    await expect(
      mockApi.saveProfile({
        ...original,
        qq: original.qq!,
        college: original.college!,
        major: original.major!,
        grade: original.grade!,
        evidence: [{ id: "00000000-0000-4000-8000-000000000000" }],
      }),
    ).rejects.toThrow();
    const card = (await mockApi.profiles()).items.find(
      (item) => item.userId === user.userId,
    )!;
    const detail = await mockApi.profile(user.userId);
    for (const profile of [card, detail]) {
      expect(profile).not.toHaveProperty("college");
      expect(profile).not.toHaveProperty("major");
      expect(profile).not.toHaveProperty("grade");
      expect(profile).not.toHaveProperty("qq");
    }
    await mockApi.saveProfile({
      ...original,
      qq: original.qq!,
      college: original.college!,
      major: original.major!,
      grade: original.grade!,
    });
  });
});

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
    expect((await mockApi.respond(first.id, "accepted")).status).toBe(
      "accepted",
    );
    await expect(mockApi.respond(first.id, "declined")).rejects.toThrow();
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
