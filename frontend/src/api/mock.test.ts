import { afterEach, describe, expect, it } from "vitest";
import fixture from "../../../contracts/examples/demo.json";
import { mockApi, setMockNowForTest } from "./mock";

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
      expect(publicProfile).not.toHaveProperty("qq");
    }
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
    await expect(
      mockApi.respond(first.id, "accepted", "字".repeat(301)),
    ).rejects.toThrow();
    await mockApi.respond(first.id, "accepted", "  欢迎加入，我们周末对齐。  ");
    await mockApi.respond(first.id, "accepted", "不应覆盖已有回应");
    const acceptedDetail = await mockApi.intent(first.id);
    expect(acceptedDetail.counterpartQq).toMatch(/^DEMO-QQ-/);
    expect(acceptedDetail.responseMessage).toBe("欢迎加入，我们周末对齐。");
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
    await mockApi.respond(invitation.id, "declined", "  本轮时间排不开  ");
    const declinedDetail = await mockApi.intent(invitation.id);
    expect(declinedDetail.counterpartQq).toBeUndefined();
    expect(declinedDetail.responseMessage).toBe("本轮时间排不开");
    await mockApi.session("captain");
    await expect(
      mockApi.createIntent({
        kind: "invite",
        recruitmentId: teams.items[0].id,
        candidateId: candidate.userId,
      }),
    ).rejects.toThrow(/冷却期/);
  });
});

describe("personal pairing and follow-up team invites", () => {
  it("supports personal invites, deduplication, atomic team creation, and independent two-step confirmation", async () => {
    await mockApi.session("candidate-a");
    const candidateA = await mockApi.me();
    await mockApi.session("candidate-b");
    const candidateB = await mockApi.me();

    await mockApi.session("candidate-a");
    const personal = await mockApi.createIntent({
      kind: "personal",
      candidateId: candidateB.userId,
      message: "先聊聊 AI 校赛方向",
    });
    expect(personal.kind).toBe("personal");
    expect(personal.recruitmentId).toBeUndefined();
    expect(personal.senderId).toBe(candidateA.userId);
    expect(personal.recipientId).toBe(candidateB.userId);

    // Reverse personal invite returns existing record idempotently
    await mockApi.session("candidate-b");
    const reverse = await mockApi.createIntent({
      kind: "personal",
      candidateId: candidateA.userId,
    });
    expect(reverse.id).toBe(personal.id);

    // Non-participant cannot read personal intent
    await mockApi.session("captain");
    await expect(mockApi.intent(personal.id)).rejects.toThrow();

    // Accept personal invite with response
    await mockApi.session("candidate-b");
    await mockApi.respond(personal.id, "accepted", "好，加 QQ 聊聊");
    const acceptedForRecipient = await mockApi.intent(personal.id);
    expect(acceptedForRecipient.responseMessage).toBe("好，加 QQ 聊聊");
    expect(acceptedForRecipient.counterpartQq).toMatch(/^DEMO-QQ-/);

    // Recipient cannot invoke createTeamAndInvite
    await expect(
      mockApi.createTeamAndInvite(personal.id, {
        competition: "美赛",
        teamName: "越权建队",
        openings: "1",
        background: "测试越权",
        requirements: [{ skills: ["data-analysis"] }],
      }),
    ).rejects.toThrow();

    // Path A: Original sender atomically creates team + pending team invite
    await mockApi.session("candidate-a");
    const created = await mockApi.createTeamAndInvite(personal.id, {
      competition: "美赛",
      teamName: "配对新建队",
      openings: "1",
      background: "配对后创建的新队伍",
      requirements: [{ skills: ["frontend"] }],
      message: "欢迎加入新队伍",
    });
    expect(created.recruitment.teamName).toBe("配对新建队");
    expect(created.intent.kind).toBe("invite");
    expect(created.intent.status).toBe("pending");
    expect(created.intent.recruitmentId).toBe(created.recruitment.id);
    expect(created.intent.recipientId).toBe(candidateB.userId);

    // Second invite declined leaves original personal pairing accepted
    await mockApi.session("candidate-b");
    await mockApi.respond(created.intent.id, "declined", "方向不太一致");
    const stillAccepted = await mockApi.intent(personal.id);
    expect(stillAccepted.status).toBe("accepted");
    expect(stillAccepted.counterpartQq).toMatch(/^DEMO-QQ-/);
  });
});

describe("seven-day lifecycle, cooldown re-high-five, and valid candidates", () => {
  afterEach(() => {
    setMockNowForTest();
  });

  it("enforces 7-day expiry, QQ revocation, cooldown re-high-five, and candidate scoping", async () => {
    let now = new Date("2026-12-01T00:00:00.000Z");
    setMockNowForTest(() => now);

    await mockApi.session("captain");
    const captain = await mockApi.me();
    await mockApi.session("candidate-a");
    const candidateA = await mockApi.me();
    await mockApi.session("candidate-b");
    const candidateB = await mockApi.me();

    // 1. Personal high-five pending expires at exact 7-day boundary
    await mockApi.session("captain");
    const p1 = await mockApi.createIntent({
      kind: "personal",
      candidateId: candidateA.userId,
      message: "第一轮个人击掌",
    });
    now = new Date("2026-12-08T00:00:00.000Z");
    await mockApi.session("candidate-a");
    await expect(mockApi.respond(p1.id, "accepted")).rejects.toThrow(/到期|期限/);

    // 2. Re-high-five after expiry creates independent record & preserves old history
    now = new Date("2026-12-08T00:00:01.000Z");
    const p2 = await mockApi.createIntent({
      kind: "personal",
      candidateId: captain.userId,
      message: "第二轮个人击掌",
    });
    expect(p2.id).not.toBe(p1.id);
    expect((await mockApi.intent(p1.id)).message).toBe("第一轮个人击掌");

    // 3. Accept recomputes 7-day QQ authorization from accept time
    now = new Date("2026-12-10T12:00:00.000Z");
    await mockApi.session("captain");
    const accepted = await mockApi.respond(p2.id, "accepted", "同意沟通");
    expect(accepted.expiresAt).toBe("2026-12-17T12:00:00.000Z");

    // Duplicate accept does not extend expiresAt
    now = new Date("2026-12-11T12:00:00.000Z");
    const dup = await mockApi.respond(p2.id, "accepted", "覆盖尝试");
    expect(dup.expiresAt).toBe("2026-12-17T12:00:00.000Z");

    // Before expiry: QQ visible and included in validCandidates
    now = new Date("2026-12-17T11:59:59.000Z");
    expect((await mockApi.intent(p2.id)).counterpartQq).toMatch(/^DEMO-QQ-/);
    const newTeamCands = await mockApi.validCandidates();
    expect(newTeamCands.items.map((item) => item.userId)).toContain(
      candidateA.userId,
    );

    // Non-captain cannot query captain's team candidates
    const captainTeams = await mockApi.ownRecruitments();
    const teamId = captainTeams.items[0].id;
    await mockApi.session("candidate-b");
    await expect(mockApi.validCandidates(teamId)).rejects.toThrow(/队长/);

    // Exact expiry boundary: QQ revoked, status stays accepted, removed from candidates
    now = new Date("2026-12-17T12:00:00.000Z");
    await mockApi.session("captain");
    const expiredDetail = await mockApi.intent(p2.id);
    expect(expiredDetail.status).toBe("accepted");
    expect(expiredDetail.isExpired).toBe(true);
    expect(expiredDetail.counterpartQq).toBeUndefined();
    expect(
      (await mockApi.validCandidates()).items.some(
        (item) => item.userId === candidateA.userId,
      ),
    ).toBe(false);

    // Declined 7-day cooldown blocks re-high-five until cooldown ends
    const p3 = await mockApi.createIntent({
      kind: "personal",
      candidateId: candidateB.userId,
      message: "第三轮测试冷却",
    });
    await mockApi.session("candidate-b");
    await mockApi.respond(p3.id, "declined", "暂时不便");
    now = new Date("2026-12-24T11:59:59.000Z");
    await mockApi.session("captain");
    await expect(
      mockApi.createIntent({
        kind: "personal",
        candidateId: candidateB.userId,
      }),
    ).rejects.toThrow(/冷却期/);
    now = new Date("2026-12-24T12:00:00.000Z");
    const p4 = await mockApi.createIntent({
      kind: "personal",
      candidateId: candidateB.userId,
      message: "冷却结束后重新击掌",
    });
    expect(p4.id).not.toBe(p3.id);
  });
});

describe("decoupled recruitment openings and requirements in mockApi", () => {
  it("supports free-text/empty openings, zero requirements, and skill sync on update", async () => {
    await mockApi.session("captain");
    const created = await mockApi.createRecruitment({
      competition: "美赛",
      teamName: "Mock 解耦测试队",
      openings: "  2-4人  ",
      background: "支持范围人数与独立需求。",
      requirements: [
        { skills: ["data-analysis", "frontend"], expectation: "全栈数据" },
        { skills: ["data-analysis"], expectation: "统计建模" },
      ],
    });
    expect(created.openings).toBe("2-4人");
    expect(created.skills).toEqual(["data-analysis", "frontend"]);

    const updated = await mockApi.updateRecruitment(created.id, {
      competition: "美赛",
      teamName: "Mock 解耦测试队",
      openings: "   ",
      background: "删除第一条需求，保留第二条的共享技能。",
      requirements: [{ skills: ["data-analysis"], expectation: "统计建模" }],
    });
    expect(updated.openings).toBeNull();
    expect(updated.skills).toEqual(["data-analysis"]);

    const zeroReq = await mockApi.updateRecruitment(created.id, {
      competition: "美赛",
      teamName: "Mock 解耦测试队",
      openings: "若干",
      background: "零项需求",
      requirements: [],
    });
    expect(zeroReq.openings).toBe("若干");
    expect(zeroReq.requirements).toEqual([]);
    expect(zeroReq.skills).toEqual([]);
  });
});

describe("formal teams, membership, invitations, and user search in mockApi", () => {
  afterEach(() => {
    setMockNowForTest();
  });

  it("supports standalone team creation, formal invitation independent of high-five expiry, and member join without mutating recruitment", async () => {
    let now = new Date("2026-12-01T00:00:00.000Z");
    setMockNowForTest(() => now);

    await mockApi.session("captain");
    await mockApi.session("candidate-a");
    const candidateA = await mockApi.me();
    await mockApi.session("candidate-b");
    const candidateB = await mockApi.me();

    // 1. Standalone team (publishRecruitment: false) does not appear in public recruitments
    await mockApi.session("captain");
    const created = await mockApi.createTeam({
      competition: "美赛",
      teamName: "Mock 独立正式队",
      description: "仅定向邀请成员，不公开招募。",
      publishRecruitment: false,
      inviteeIds: [candidateA.userId],
      inviteMessage: "来一起打美赛",
    });
    expect(created.team.myRole).toBe("captain");
    expect(created.team.memberCount).toBe(1);
    expect(created.team.recruitment).toBeNull();
    expect(created.invitations).toBeDefined();
    if (!created.invitations) {
      throw new Error("Expected created.invitations to be defined");
    }
    expect(created.invitations).toHaveLength(1);
    const [firstInvitation] = created.invitations;
    expect(firstInvitation).toBeDefined();
    if (!firstInvitation) {
      throw new Error("Expected first formal invitation to exist");
    }
    expect(firstInvitation.status).toBe("pending");
    expect(firstInvitation.inviteeId).toBe(candidateA.userId);

    // Creating a team without invitees returns an empty invitations list
    const solo = await mockApi.createTeam({
      competition: "美赛",
      teamName: "Mock 仅建队",
      description: "暂不邀请成员。",
      publishRecruitment: false,
      inviteeIds: [],
    });
    expect(solo.invitations).toEqual([]);

    const publicList = await mockApi.recruitments();
    expect(publicList.items.some((r) => r.teamId === created.team.id)).toBe(
      false,
    );

    // 2. Formal invitation can be accepted within 7 days and adds member role
    now = new Date("2026-12-07T23:59:59.000Z");
    await mockApi.session("candidate-a");
    const accepted = await mockApi.respondTeamInvitation(
      firstInvitation.id,
      "accepted",
    );
    expect(accepted.status).toBe("accepted");
    const memberTeams = await mockApi.myTeams();
    const joined = memberTeams.items.find(
      (item) => item.id === created.team.id,
    );
    expect(joined?.myRole).toBe("member");
    expect(joined?.memberCount).toBe(2);

    // 3. Opt-in user search returns [] for empty query and excludes existing members
    await mockApi.session("captain");
    expect((await mockApi.searchUsers("   ")).items).toEqual([]);
    const foundB = await mockApi.searchUsers(
      candidateB.nickname,
      created.team.id,
    );
    expect(foundB.items.some((u) => u.userId === candidateB.userId)).toBe(true);
    const foundA = await mockApi.searchUsers(
      candidateA.nickname,
      created.team.id,
    );
    expect(foundA.items.some((u) => u.userId === candidateA.userId)).toBe(false);

    // 4. Publishing recruitment and inviting candidateB -> accepting does NOT alter recruitment openings/requirements
    const rec = await mockApi.upsertTeamRecruitment(created.team.id, {
      competition: "美赛",
      teamName: "Mock 独立正式队",
      openings: "2-3人",
      background: "公开发布后继续邀请。",
      requirements: [{ skills: ["frontend"], expectation: "可视化" }],
    });
    const sentB = await mockApi.createTeamInvitations(created.team.id, {
      inviteeIds: [candidateB.userId],
    });
    await mockApi.session("candidate-b");
    await mockApi.respondTeamInvitation(sentB.items[0].id, "accepted");
    const afterRec = (await mockApi.recruitments()).items.find(
      (r) => r.id === rec.id,
    );
    expect(afterRec?.openings).toBe("2-3人");
    expect(afterRec?.requirements).toEqual([
      { skills: ["frontend"], expectation: "可视化" },
    ]);
    expect(afterRec?.isPublished).toBe(true);
  });

  it("supports member leave, captain remove, rejoin, disband, formal responses, and public member display", async () => {
    let now = new Date("2026-12-15T00:00:00.000Z");
    setMockNowForTest(() => now);

    await mockApi.session("candidate-a");
    const candidateA = await mockApi.me();
    await mockApi.session("candidate-b");
    const candidateB = await mockApi.me();

    await mockApi.session("captain");
    const created = await mockApi.createTeam({
      competition: "美赛",
      teamName: "Mock 管理测试队",
      description: "验证退出、移除、解散与回应。",
      publishRecruitment: true,
      openings: "2人",
      requirements: [{ skills: ["frontend"], expectation: "前端" }],
      inviteeIds: [candidateA.userId],
    });
    expect(created.invitations).toBeDefined();
    if (!created.invitations || !created.invitations[0]) {
      throw new Error("Expected initial formal invitation");
    }
    const inv1 = created.invitations[0];

    // >300 char response rejected; valid response stored and not overwritten
    await mockApi.session("candidate-a");
    await expect(
      mockApi.respondTeamInvitation(inv1.id, "accepted", "字".repeat(301)),
    ).rejects.toThrow(/300/);
    const acc = await mockApi.respondTeamInvitation(
      inv1.id,
      "accepted",
      "  准时加入！  ",
    );
    expect(acc.responseMessage).toBe("准时加入！");
    const dup = await mockApi.respondTeamInvitation(
      inv1.id,
      "accepted",
      "不应覆盖",
    );
    expect(dup.responseMessage).toBe("准时加入！");

    // Public recruitment shows 2 members (captain first), hasProfile accurate, without QQ
    const pub = (await mockApi.recruitments()).items.find(
      (r) => r.teamId === created.team.id,
    );
    expect(pub?.memberCount).toBe(2);
    expect(pub?.members?.[0]?.role).toBe("captain");
    expect(pub?.members?.[0]?.hasProfile).toBe(true);
    expect(pub?.members?.[0]).not.toHaveProperty("qq");

    // Member leaves voluntarily; public recruitment memberCount drops to 1 while openings/requirements stay intact
    await mockApi.leaveTeam(created.team.id);
    const pubAfterLeave = (await mockApi.recruitments()).items.find(
      (r) => r.teamId === created.team.id,
    );
    expect(pubAfterLeave?.memberCount).toBe(1);
    expect(pubAfterLeave?.openings).toBe("2人");
    expect(
      (await mockApi.myTeams()).items.some((t) => t.id === created.team.id),
    ).toBe(false);
    await mockApi.respondTeamInvitation(inv1.id, "accepted");
    expect(
      (await mockApi.myTeams()).items.some((t) => t.id === created.team.id),
    ).toBe(false);

    // Captain cannot leave; re-invite + rejoin + captain remove works
    await mockApi.session("captain");
    await expect(mockApi.leaveTeam(created.team.id)).rejects.toThrow(/队长/);
    const reinv = await mockApi.createTeamInvitations(created.team.id, {
      inviteeIds: [candidateA.userId],
    });
    await mockApi.session("candidate-a");
    await mockApi.respondTeamInvitation(reinv.items[0].id, "accepted");
    await mockApi.session("captain");
    const afterRemove = await mockApi.removeTeamMember(
      created.team.id,
      candidateA.userId,
    );
    expect(afterRemove.memberCount).toBe(1);
    const pubAfterRemove = (await mockApi.recruitments()).items.find(
      (r) => r.teamId === created.team.id,
    );
    expect(pubAfterRemove?.memberCount).toBe(1);

    // Pending invite invalidated after disband & public recruitment hidden
    const pendingB = await mockApi.createTeamInvitations(created.team.id, {
      inviteeIds: [candidateB.userId],
    });
    await mockApi.disbandTeam(created.team.id);
    expect(
      (await mockApi.recruitments()).items.some(
        (r) => r.teamId === created.team.id,
      ),
    ).toBe(false);
    await mockApi.session("candidate-b");
    await expect(
      mockApi.respondTeamInvitation(pendingB.items[0].id, "accepted"),
    ).rejects.toThrow(/解散/);
  });

  it("enforces recruitment 7/14/30d expiry, edit isolation, idempotent renew, and republish in mockApi", async () => {
    let now = new Date("2026-12-01T00:00:00.000Z");
    setMockNowForTest(() => now);

    await mockApi.session("captain");
    const created = await mockApi.createTeam({
      competition: "美赛",
      teamName: "Mock 期限测试队",
      description: "验证 7 天招募期限、续期与重新发布。",
      publishRecruitment: true,
      durationDays: 7,
      openings: "2人",
      requirements: [{ skills: ["frontend"], expectation: "前端" }],
      inviteeIds: [],
    });
    const rec = created.recruitment;
    expect(rec).toBeDefined();
    if (!rec) throw new Error("Expected recruitment to be created");
    expect(rec.status).toBe("active");
    expect(rec.expiresAt).toBe("2026-12-08T00:00:00.000Z");

    // Ordinary edit does NOT extend expiresAt
    now = new Date("2026-12-03T00:00:00.000Z");
    const edited = await mockApi.updateRecruitment(rec.id, {
      competition: "美赛",
      teamName: "Mock 期限测试队",
      openings: "3人",
      background: "修改文案",
      requirements: [],
    });
    expect(edited.expiresAt).toBe("2026-12-08T00:00:00.000Z");

    // Renew preserves remaining time & rejects stale expectedExpiresAt
    const renewed = await mockApi.renewRecruitment(
      rec.id,
      7,
      "2026-12-08T00:00:00.000Z",
    );
    expect(renewed.expiresAt).toBe("2026-12-15T00:00:00.000Z");
    await expect(
      mockApi.renewRecruitment(rec.id, 7, "2026-12-08T00:00:00.000Z"),
    ).rejects.toThrow(/刷新/);

    // At expiry boundary: hidden from public list & blocks new intents
    now = new Date("2026-12-15T00:00:00.000Z");
    expect(
      (await mockApi.recruitments()).items.some((item) => item.id === rec.id),
    ).toBe(false);
    await mockApi.session("candidate-a");
    await expect(
      mockApi.createIntent({ kind: "apply", recruitmentId: rec.id }),
    ).rejects.toThrow(/到期/);

    // Captain republishes expired recruitment with 30-day window
    await mockApi.session("captain");
    const repub = await mockApi.republishRecruitment(rec.id, 30);
    expect(repub.id).toBe(rec.id);
    expect(repub.status).toBe("active");
    expect(repub.expiresAt).toBe("2027-01-14T00:00:00.000Z");
  });
});
