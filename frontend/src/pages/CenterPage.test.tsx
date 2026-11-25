import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../contracts/examples/demo.json";
import type {
  Intent,
  Me,
  Recruitment,
  TeamInvitation,
  TeamSummary,
} from "../api/client";
import CenterPage from "./CenterPage";

const captainMe: Me = {
  ...fixture.personas.captain,
  persona: "captain",
};

const candidateAMe: Me = {
  ...fixture.personas["candidate-a"],
  persona: "candidate-a",
};

const FUTURE_EXPIRY = new Date(
  Date.now() + 5 * 24 * 60 * 60 * 1000,
).toISOString();

function buildTeamSummary(
  rec: Recruitment,
  role: "captain" | "member" = "captain",
): TeamSummary {
  return {
    id: rec.id,
    teamNumber: rec.teamNumber,
    competition: rec.competition,
    teamName: rec.teamName,
    description: rec.background,
    captainId: rec.ownerId,
    status: "active",
    myRole: role,
    memberCount: role === "member" ? 2 : 1,
    members: [
      {
        userId: rec.ownerId,
        nickname: fixture.personas.captain.nickname,
        role: "captain",
        joinedAt: rec.createdAt,
        skills: [],
        customSkills: [],
        hasProfile: fixture.profiles.items.some(
          (item) => item.userId === rec.ownerId,
        ),
      },
    ],
    recruitment: rec,
    createdAt: rec.createdAt,
  };
}

function buildIntent(overrides: Partial<Intent>): Intent {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    recruitmentId: "10000000-0000-4000-8000-000000000001",
    candidateId: fixture.personas["candidate-a"].userId,
    ownerId: fixture.personas.captain.userId,
    senderId: fixture.personas["candidate-a"].userId,
    recipientId: fixture.personas.captain.userId,
    kind: "apply",
    status: "pending",
    createdAt: "2026-11-24T01:02:03Z",
    expiresAt: FUTURE_EXPIRY,
    isExpired: false,
    canRespond: true,
    teamName: "城市脉络建模队",
    counterpartNickname: "许言",
    ...overrides,
  };
}

describe("CenterPage intent response", () => {
  let intentsStore: Record<string, Intent>;
  let failRespondOnce: boolean;

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    failRespondOnce = false;
    Element.prototype.scrollIntoView ??= vi.fn();
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    }

    const first = buildIntent({
      id: "intent-1",
      teamName: "城市脉络建模队",
      counterpartNickname: "许言",
      message: "我可以负责数据清洗。",
    });
    const second = buildIntent({
      id: "intent-2",
      teamName: "校园借用助手队",
      counterpartNickname: "周禾",
      candidateId: fixture.personas["candidate-b"].userId,
      senderId: fixture.personas["candidate-b"].userId,
      recipientId: fixture.personas.captain.userId,
    });
    intentsStore = { [first.id]: first, [second.id]: second };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url);
        if (path.endsWith("/me/profile")) {
          return Response.json(fixture.ownProfiles.captain);
        }
        if (path.includes("/profiles/")) {
          return Response.json(fixture.profiles.items[0]);
        }
        if (path.endsWith("/me/teams")) {
          return Response.json({
            items: (fixture.recruitments.items as Recruitment[]).map((r) =>
              buildTeamSummary(r),
            ),
          });
        }
        if (path.endsWith("/me/team-invitations")) {
          return Response.json({ items: [] });
        }
        if (path.endsWith("/me/recruitments")) {
          return Response.json({ items: fixture.recruitments.items });
        }
        if (path.endsWith("/me/intents")) {
          return Response.json({
            items: Object.values(intentsStore).map(
              ({ message: _m, responseMessage: _r, counterpartQq: _q, ...s }) =>
                s,
            ),
          });
        }
        if (path.endsWith("/response") && init?.method === "POST") {
          if (failRespondOnce) {
            failRespondOnce = false;
            return Response.json(
              { error: { code: "server_error", message: "提交失败，请重试" } },
              { status: 500 },
            );
          }
          const id = path.split("/").slice(-2)[0];
          const body = JSON.parse(String(init.body)) as {
            decision: "accepted" | "declined";
            responseMessage?: string;
          };
          const current = intentsStore[id];
          const cleaned = body.responseMessage?.trim();
          intentsStore[id] = {
            ...current,
            status: body.decision,
            canRespond: false,
            respondedAt: "2026-11-24T01:05:00Z",
            expiresAt: FUTURE_EXPIRY,
            isExpired: false,
            ...(cleaned ? { responseMessage: cleaned } : {}),
            ...(body.decision === "accepted"
              ? { counterpartQq: "DEMO-QQ-002" }
              : {}),
          };
          const {
            message: _m,
            responseMessage: _r,
            counterpartQq: _q,
            ...summary
          } = intentsStore[id];
          return Response.json(summary);
        }
        if (path.includes("/intents/")) {
          const id = path.split("/").pop()!;
          return Response.json(intentsStore[id]);
        }
        return Response.json(
          { error: { message: "请求失败" } },
          { status: 404 },
        );
      }),
    );
  });

  it("isolates response drafts across intents, preserves draft on failure, and displays accepted/declined responses", async () => {
    render(<CenterPage me={captainMe} navigate={vi.fn()} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /城市脉络建模队/ }),
    );
    let dialog = within(
      await screen.findByRole("dialog", { name: "城市脉络建模队" }),
    );
    const input1 = dialog.getByRole("textbox", { name: "回应" });
    await userEvent.type(input1, "临时草稿内容");
    await userEvent.click(dialog.getByRole("button", { name: "关闭" }));

    // Open second intent without sender message: draft must not leak from first intent
    await userEvent.click(
      screen.getByRole("button", { name: /校园借用助手队/ }),
    );
    dialog = within(
      await screen.findByRole("dialog", { name: "校园借用助手队" }),
    );
    const input2 = dialog.getByRole("textbox", { name: "回应" });
    expect(input2).toHaveValue("");

    // Decline with response: response visible, QQ NOT unlocked, textarea removed
    await userEvent.type(input2, "这轮名额已满，下次再合作。");
    await userEvent.click(dialog.getByRole("button", { name: "婉拒" }));
    expect(
      await dialog.findByText("这轮名额已满，下次再合作。"),
    ).toBeInTheDocument();
    expect(dialog.queryByText(/DEMO-QQ/)).not.toBeInTheDocument();
    expect(
      dialog.queryByRole("textbox", { name: "回应" }),
    ).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "关闭" }));

    // Re-open first intent: submit failure preserves typed response, retry succeeds & shows QQ
    await userEvent.click(
      screen.getByRole("button", { name: /城市脉络建模队/ }),
    );
    dialog = within(
      await screen.findByRole("dialog", { name: "城市脉络建模队" }),
    );
    const retryInput = dialog.getByRole("textbox", { name: "回应" });
    expect(retryInput).toHaveValue("");
    await userEvent.type(retryInput, "欢迎加入，周末一起对数据。");
    failRespondOnce = true;
    await userEvent.click(
      dialog.getByRole("button", { name: "同意并交换 QQ" }),
    );
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "提交失败，请重试",
    );
    expect(retryInput).toHaveValue("欢迎加入，周末一起对数据。");

    await userEvent.click(
      dialog.getByRole("button", { name: "同意并交换 QQ" }),
    );
    expect(
      await dialog.findByText("欢迎加入，周末一起对数据。"),
    ).toBeInTheDocument();
    expect(dialog.getByText("DEMO-QQ-002")).toBeInTheDocument();
    expect(
      dialog.queryByRole("textbox", { name: "回应" }),
    ).not.toBeInTheDocument();
  });
});

describe("CenterPage personal pairing follow-up and formal team invitations", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    Element.prototype.scrollIntoView ??= vi.fn();
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    }
  });

  it("shows formal follow-up actions only for original sender's accepted personal intent and sends formal invitation", async () => {
    const acceptedPersonal: Intent = {
      id: "personal-1",
      candidateId: fixture.personas["candidate-b"].userId,
      senderId: fixture.personas.captain.userId,
      recipientId: fixture.personas["candidate-b"].userId,
      kind: "personal",
      status: "accepted",
      createdAt: "2026-11-24T02:00:00Z",
      respondedAt: "2026-11-24T02:05:00Z",
      expiresAt: FUTURE_EXPIRY,
      isExpired: false,
      canRespond: false,
      counterpartNickname: "周禾",
      message: "先加个好友沟通",
      responseMessage: "没问题",
      counterpartQq: "DEMO-QQ-003",
    };
    const receivedAcceptedPersonal: Intent = {
      id: "personal-2",
      candidateId: fixture.personas.captain.userId,
      senderId: fixture.personas["candidate-a"].userId,
      recipientId: fixture.personas.captain.userId,
      kind: "personal",
      status: "accepted",
      createdAt: "2026-11-24T02:10:00Z",
      respondedAt: "2026-11-24T02:12:00Z",
      expiresAt: FUTURE_EXPIRY,
      isExpired: false,
      canRespond: false,
      counterpartNickname: "许言",
      counterpartQq: "DEMO-QQ-002",
    };
    const byId: Record<string, Intent> = {
      [acceptedPersonal.id]: acceptedPersonal,
      [receivedAcceptedPersonal.id]: receivedAcceptedPersonal,
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/me/profile"))
        return Response.json(fixture.ownProfiles.captain);
      if (path.includes("/profiles/"))
        return Response.json(fixture.profiles.items[0]);
      if (path.endsWith("/me/teams"))
        return Response.json({
          items: (fixture.recruitments.items as Recruitment[]).map((r) =>
            buildTeamSummary(r),
          ),
        });
      if (path.endsWith("/me/team-invitations"))
        return Response.json({ items: [] });
      if (path.endsWith("/me/intents"))
        return Response.json({ items: Object.values(byId) });
      if (
        path.includes("/teams/") &&
        path.endsWith("/invitations") &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(String(init.body)) as {
          inviteeIds: string[];
          message?: string;
        };
        const created: TeamInvitation = {
          id: "formal-invite-1",
          teamId: fixture.recruitments.items[0].id,
          teamName: "城市脉络建模队",
          competition: "美赛",
          inviterId: fixture.personas.captain.userId,
          inviterNickname: fixture.personas.captain.nickname,
          inviteeId: body.inviteeIds[0],
          inviteeNickname: "周禾",
          status: "pending",
          message: body.message,
          createdAt: "2026-11-24T03:00:00Z",
          expiresAt: FUTURE_EXPIRY,
          isExpired: false,
          canRespond: false,
        };
        return Response.json({ items: [created] }, { status: 201 });
      }
      if (path.includes("/intents/")) {
        const id = path.split("/").pop()!;
        return Response.json(byId[id]);
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CenterPage me={captainMe} navigate={vi.fn()} />);

    // Received accepted personal intent must NOT show follow-up actions
    await userEvent.click(await screen.findByRole("button", { name: /许言/ }));
    let dialog = within(await screen.findByRole("dialog", { name: "许言" }));
    expect(
      dialog.queryByRole("button", { name: "创建队伍并邀请对方" }),
    ).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "关闭" }));

    // Sent accepted personal intent shows both follow-up actions and remaining QQ time
    await userEvent.click(screen.getByRole("button", { name: /周禾/ }));
    dialog = within(await screen.findByRole("dialog", { name: "周禾" }));
    expect(dialog.getByText(/QQ 查看权限剩余/)).toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "创建队伍并邀请对方" }),
    ).toBeInTheDocument();
    await userEvent.click(
      dialog.getByRole("button", { name: "邀请加入已有队伍" }),
    );

    const pathBDialog = within(
      await screen.findByRole("dialog", { name: "邀请加入已有队伍" }),
    );
    expect(pathBDialog.getByText("周禾")).toBeInTheDocument();
    await userEvent.selectOptions(
      pathBDialog.getByLabelText("选择队伍"),
      fixture.recruitments.items[0].id,
    );
    await userEvent.click(
      pathBDialog.getByRole("button", { name: "发送正式组队邀请" }),
    );
    const postCall = fetchMock.mock.calls.find(
      ([u, init]) =>
        String(u).endsWith(
          `/teams/${fixture.recruitments.items[0].id}/invitations`,
        ) &&
        init?.method === "POST",
    );
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      inviteeIds: [fixture.personas["candidate-b"].userId],
    });
  });

  it("displays independent formal team invitations and updates My Teams with member role badge on acceptance", async () => {
    let myTeams: TeamSummary[] = [];
    const pendingInvite: TeamInvitation = {
      id: "formal-inv-100",
      teamId: fixture.recruitments.items[0].id,
      teamName: "城市脉络建模队",
      competition: "美赛",
      inviterId: fixture.personas.captain.userId,
      inviterNickname: fixture.personas.captain.nickname,
      inviteeId: fixture.personas["candidate-a"].userId,
      inviteeNickname: fixture.personas["candidate-a"].nickname,
      status: "pending",
      message: "欢迎正式加入我们队伍",
      createdAt: "2026-11-24T04:00:00Z",
      expiresAt: FUTURE_EXPIRY,
      isExpired: false,
      canRespond: true,
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/me/profile"))
        return Response.json(fixture.ownProfiles["candidate-a"]);
      if (path.includes("/profiles/"))
        return Response.json(fixture.profiles.items[1]);
      if (path.endsWith("/me/teams")) return Response.json({ items: myTeams });
      if (path.endsWith("/me/team-invitations"))
        return Response.json({ items: [pendingInvite] });
      if (path.endsWith("/me/intents")) return Response.json({ items: [] });
      if (
        path.endsWith(`/team-invitations/${pendingInvite.id}/response`) &&
        init?.method === "POST"
      ) {
        myTeams = [
          buildTeamSummary(
            fixture.recruitments.items[0] as Recruitment,
            "member",
          ),
        ];
        return Response.json({
          ...pendingInvite,
          status: "accepted",
          canRespond: false,
          respondedAt: "2026-11-24T04:10:00Z",
        });
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CenterPage me={candidateAMe} navigate={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "正式组队邀请" }),
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: /城市脉络建模队.*待我回应/ }),
    );
    const dialog = within(
      await screen.findByRole("dialog", {
        name: /正式组队邀请.*城市脉络建模队/,
      }),
    );
    expect(dialog.getByText("欢迎正式加入我们队伍")).toBeInTheDocument();
    expect(
      dialog.getByText(/正式组队邀请不会自动交换 QQ/),
    ).toBeInTheDocument();
    const replyInput = dialog.getByRole("textbox", { name: "回应" });
    await userEvent.type(replyInput, "收到，准时参加首次例会！");
    await userEvent.click(
      dialog.getByRole("button", { name: "确认加入队伍" }),
    );
    const respCall = fetchMock.mock.calls.find(
      ([u, init]) =>
        String(u).endsWith(`/team-invitations/${pendingInvite.id}/response`) &&
        init?.method === "POST",
    );
    expect(JSON.parse(String(respCall?.[1]?.body))).toEqual({
      decision: "accepted",
      responseMessage: "收到，准时参加首次例会！",
    });

    const teamsSection = within(
      screen.getByRole("region", { name: "我的队伍" }),
    );
    expect(await teamsSection.findByText("城市脉络建模队")).toBeInTheDocument();
    expect(teamsSection.getByText("成员")).toBeInTheDocument();
    expect(
      teamsSection.getByRole("button", { name: "查看队员" }),
    ).toBeInTheDocument();
    expect(
      teamsSection.getByRole("button", { name: "退出队伍" }),
    ).toBeInTheDocument();
    expect(
      teamsSection.queryByRole("button", { name: "管理队伍" }),
    ).not.toBeInTheDocument();
  });

  it("supports unified team management modal, inline picker labels, member removal, and disband", async () => {
    const rec = fixture.recruitments.items[0] as Recruitment;
    const managedTeam: TeamSummary = {
      ...buildTeamSummary(rec, "captain"),
      memberCount: 2,
      members: [
        {
          userId: fixture.personas.captain.userId,
          nickname: fixture.personas.captain.nickname,
          role: "captain",
          joinedAt: rec.createdAt,
          skills: ["data-analysis"],
          customSkills: [],
          hasProfile: true,
        },
        {
          userId: fixture.personas["candidate-a"].userId,
          nickname: fixture.personas["candidate-a"].nickname,
          role: "member",
          joinedAt: "2026-11-24T05:00:00Z",
          skills: ["frontend"],
          customSkills: [],
          hasProfile: true,
        },
      ],
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/me/profile"))
        return Response.json(fixture.ownProfiles.captain);
      if (path.includes("/profiles/"))
        return Response.json(fixture.profiles.items[0]);
      if (path.endsWith("/competitions"))
        return Response.json(fixture.competitions);
      if (path.endsWith("/me/teams"))
        return Response.json({ items: [managedTeam] });
      if (
        path.endsWith("/me/team-invitations") ||
        path.endsWith(`/teams/${managedTeam.id}/invitations`)
      )
        return Response.json({ items: [] });
      if (path.includes("/me/high-five-candidates"))
        return Response.json({ items: [] });
      if (path.endsWith("/me/intents")) return Response.json({ items: [] });
      if (
        path.endsWith(
          `/teams/${managedTeam.id}/members/${fixture.personas["candidate-a"].userId}`,
        ) &&
        init?.method === "DELETE"
      ) {
        return Response.json({
          ...managedTeam,
          memberCount: 1,
          members: [managedTeam.members[0]],
        });
      }
      if (
        path.endsWith(`/teams/${managedTeam.id}/disband`) &&
        init?.method === "POST"
      ) {
        return Response.json({ ...managedTeam, status: "disbanded" });
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CenterPage me={captainMe} navigate={vi.fn()} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "管理队伍" }),
    );
    const dialog = within(
      await screen.findByRole("dialog", { name: /管理队伍.*城市脉络建模队/ }),
    );

    // Collapsible sections render with accurate counts
    expect(
      await dialog.findByRole("button", { name: /已有队员（2）/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      dialog.getByRole("button", { name: /待确认邀请（0）/ }),
    ).toHaveAttribute("aria-expanded", "true");

    // Inline invite picker uses polished headings & empty state & formal placeholder
    await userEvent.click(
      dialog.getByRole("button", { name: "＋ 邀请成员" }),
    );
    expect(dialog.getByText("已击掌")).toBeInTheDocument();
    expect(await dialog.findByText("无")).toBeInTheDocument();
    expect(dialog.getByLabelText("检索未击掌")).toBeInTheDocument();
    const messageBox = dialog.getByRole("textbox", { name: "附言" });
    expect(messageBox).toHaveAttribute(
      "placeholder",
      expect.stringContaining("邀请对方加入的原因"),
    );

    // Remove regular member with 2nd confirmation
    await userEvent.click(dialog.getByRole("button", { name: "移除" }));
    await userEvent.click(dialog.getByRole("button", { name: "确认移除" }));
    expect(
      await dialog.findByRole("button", { name: /已有队员（1）/ }),
    ).toBeInTheDocument();

    // Disband team with 2nd confirmation removes it from My Teams
    await userEvent.click(dialog.getByRole("button", { name: "解散队伍" }));
    await userEvent.click(dialog.getByRole("button", { name: "确认解散队伍" }));
    expect(
      screen.queryByRole("dialog", { name: /管理队伍/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("城市脉络建模队")).not.toBeInTheDocument();
  });

  it("renders candidate cards with right-aligned header checkbox and left-aligned tags, and shows expired recruitment state with republish", async () => {
    const expiredRec: Recruitment = {
      ...(fixture.recruitments.items[0] as Recruitment),
      status: "expired",
      isPubliclyActive: false,
      expiresAt: "2020-01-01T00:00:00Z",
    };
    const expiredTeam: TeamSummary = {
      ...buildTeamSummary(expiredRec, "captain"),
      recruitment: expiredRec,
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/me/profile"))
        return Response.json(fixture.ownProfiles.captain);
      if (path.includes("/profiles/"))
        return Response.json(fixture.profiles.items[0]);
      if (path.endsWith("/competitions"))
        return Response.json(fixture.competitions);
      if (path.endsWith("/me/teams"))
        return Response.json({ items: [expiredTeam] });
      if (
        path.endsWith("/me/team-invitations") ||
        path.endsWith(`/teams/${expiredTeam.id}/invitations`)
      )
        return Response.json({ items: [] });
      if (path.includes("/me/high-five-candidates"))
        return Response.json({
          items: [
            {
              userId: fixture.personas["candidate-a"].userId,
              nickname: "许言",
              skills: ["data-analysis", "statistics"],
              customSkills: ["可复现 Notebook"],
              expiresAt: FUTURE_EXPIRY,
              sources: [
                {
                  intentId: "hi-1",
                  kind: "personal",
                  expiresAt: FUTURE_EXPIRY,
                },
              ],
            },
          ],
        });
      if (path.endsWith("/me/intents")) return Response.json({ items: [] });
      if (
        path.endsWith(`/recruitments/${expiredRec.id}/republish`) &&
        init?.method === "POST"
      ) {
        return Response.json({
          ...expiredRec,
          status: "active",
          isPubliclyActive: true,
          expiresAt: FUTURE_EXPIRY,
          durationDays: 30,
        });
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CenterPage me={captainMe} navigate={vi.fn()} />);

    // Expired recruitment displays 招募已到期 and 重新发布 entry
    expect(await screen.findByText("招募已到期")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重新发布" }));
    const repubDialog = within(
      await screen.findByRole("dialog", { name: /重新发布.*城市脉络建模队/ }),
    );
    await userEvent.selectOptions(repubDialog.getByLabelText("招募期限"), "30");
    await userEvent.click(
      repubDialog.getByRole("button", { name: "确认重新发布" }),
    );
    expect(await screen.findByText("招募中")).toBeInTheDocument();

    // Candidate card layout structure in unified Manage Team -> inline invite picker
    await userEvent.click(screen.getByRole("button", { name: "管理队伍" }));
    const manageDialog = within(
      await screen.findByRole("dialog", { name: /管理队伍.*城市脉络建模队/ }),
    );
    await userEvent.click(
      manageDialog.getByRole("button", { name: "＋ 邀请成员" }),
    );
    const checkbox = await manageDialog.findByRole("checkbox", {
      name: "选择 许言",
    });
    const card = checkbox.closest(".candidate-card");
    expect(card).not.toBeNull();
    expect(card?.querySelector(".candidate-header .candidate-identity")).toHaveTextContent(
      /许言.*已击掌/,
    );
    expect(card?.querySelector(".candidate-header .candidate-checkbox")).toBe(
      checkbox,
    );
    expect(card?.querySelector(".candidate-tags")).toHaveTextContent("数据分析");

    // Clicking card toggles checkbox once; clicking checkbox directly toggles once
    await userEvent.click(card!);
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});
