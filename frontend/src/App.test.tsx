import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import App from "./App";
import fixture from "../../contracts/examples/demo.json";
import { matchesSkill } from "./api/skillSearch";
import type { Skill } from "./api/client";

async function chooseFilter(label: string, choice: string) {
  screen.getByRole("combobox", { name: label }).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(await screen.findByRole("option", { name: choice }));
}

describe("TeamUP", () => {
  let competitions: typeof fixture.competitions;
  let activePersona: keyof typeof fixture.personas | null;
  let pendingIntents: Promise<void> | undefined;
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    competitions = fixture.competitions;
    activePersona = null;
    pendingIntents = undefined;
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal("scrollTo", vi.fn());
    Element.prototype.scrollIntoView ??= vi.fn();
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    }
    let ownProfile = { ...fixture.ownProfiles["candidate-a"] };
    const teams = structuredClone(fixture.recruitments.items);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url);
        if (path.endsWith("/me"))
          return activePersona
            ? Response.json(fixture.personas[activePersona])
            : Response.json(
                { error: { code: "unauthorized" } },
                { status: 401 },
              );
        if (path.endsWith("/demo/session")) {
          activePersona = JSON.parse(String(init?.body))
            .persona as keyof typeof fixture.personas;
          ownProfile = { ...fixture.ownProfiles[activePersona] };
          return Response.json(fixture.personas[activePersona]);
        }
        if (path.endsWith("/me/recruitments")) {
          const owner = activePersona
            ? fixture.personas[activePersona].userId
            : null;
          return Response.json({
            items: teams.filter((team) => team.ownerId === owner),
          });
        }
        if (path.split("?")[0].endsWith("/recruitments")) {
          const search =
            new URLSearchParams(path.split("?")[1]).get("search") ?? "";
          return Response.json({
            items: teams.filter(
              (team) =>
                team.isPublished &&
                matchesSkill(search, team.skills as Skill[], [
                  team.background,
                  ...team.requirements.map((item) => item.expectation ?? ""),
                ]),
            ),
          });
        }
        if (path.includes("/recruitments/")) {
          const team = teams.find((entry) => path.includes(entry.id));
          if (team && init?.body) {
            Object.assign(team, JSON.parse(String(init.body)));
            return Response.json(team);
          }
        }
        if (path.endsWith("/competitions")) return Response.json(competitions);
        if (path.endsWith("/profiles")) return Response.json(fixture.profiles);
        if (path.includes("/profiles/")) {
          const userId = path.split("/").pop();
          const profile = fixture.profiles.items.find(
            (item) => item.userId === userId,
          );
          if (
            activePersona &&
            userId === fixture.personas[activePersona].userId
          ) {
            const { experience, ...visible } = ownProfile;
            return Response.json({ ...profile, ...visible });
          }
          return Response.json(profile);
        }
        if (path.endsWith("/me/profile")) {
          if (init?.method === "PUT") {
            ownProfile = { ...ownProfile, ...JSON.parse(String(init.body)) };
          }
          return Response.json(ownProfile);
        }
        if (path.endsWith("/me/intents")) {
          await pendingIntents;
          return Response.json({ items: [] });
        }
        if (path.endsWith("/intents") && init?.method === "POST")
          return Response.json({ status: "pending" }, { status: 201 });
        return Response.json(
          { error: { message: "请求失败" } },
          { status: 400 },
        );
      }),
    );
  });

  it("keeps the center layout in its loading state until all sections are ready", async () => {
    activePersona = "captain";
    let showIntents = () => {};
    pendingIntents = new Promise<void>((resolve) => {
      showIntents = resolve;
    });
    render(<App />);
    await waitFor(() =>
      expect(screen.getByLabelText("演示身份")).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(
      await screen.findByRole("status", { name: "加载中…" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("article", { name: "我的公开名片" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "我的队伍" }),
    ).not.toBeInTheDocument();

    showIntents();
    expect(
      await screen.findByRole("article", { name: "我的公开名片" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "我的队伍" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "加载中…" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the discovery page until the first center snapshot and reuses it on return", async () => {
    activePersona = "candidate-a";
    window.history.replaceState(null, "", "/people");
    let finishFirstRead = () => {};
    pendingIntents = new Promise<void>((resolve) => {
      finishFirstRead = resolve;
    });
    render(<App />);
    await screen.findByText(fixture.profiles.items[0].contribution);

    await userEvent.click(screen.getByRole("button", { name: "个人中心" }));
    expect(screen.getByRole("heading", { name: "找队友" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "个人中心" })).toBeNull();
    finishFirstRead();
    expect(
      await screen.findByRole("article", { name: "我的公开名片" }),
    ).toBeVisible();

    let finishRefresh = () => {};
    pendingIntents = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    await userEvent.click(screen.getByRole("button", { name: "找队友" }));
    await userEvent.click(screen.getByRole("button", { name: "个人中心" }));
    expect(screen.getByRole("article", { name: "我的公开名片" })).toBeVisible();
    expect(screen.queryByRole("status", { name: "加载中…" })).toBeNull();
    finishRefresh();
  });

  it("slides the main content between all four primary tabs", async () => {
    activePersona = "candidate-a";
    render(<App />);
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(screen.getByRole("main"), "animate", {
      value: animate,
    });

    const nav = within(screen.getByRole("navigation"));
    for (const [tab, title] of [
      ["找队伍", "找队伍"],
      ["找队友", "找队友"],
      ["个人中心", "个人中心"],
      ["欢迎", "平台介绍"],
    ]) {
      await userEvent.click(nav.getByRole("button", { name: tab }));
      await screen.findByRole("heading", { name: title });
    }

    expect(animate).toHaveBeenCalledTimes(4);
    expect(animate.mock.calls).toEqual(
      [48, 48, 48, -48].map((offset) => [
        [{ transform: "translateX(" + offset + "px)" }, { transform: "none" }],
        expect.objectContaining({ duration: 220 }),
      ]),
    );
  });

  it("reuses discovery lists across tabs and refreshes an expired list on return", async () => {
    const clock = vi.spyOn(Date, "now");
    try {
      activePersona = "candidate-a";
      window.history.replaceState(null, "", "/people");
      render(<App />);
      const nav = within(screen.getByRole("navigation"));
      const person = fixture.profiles.items[0];
      const team = fixture.recruitments.items[0];
      /** 统计默认列表的请求次数。 */
      const reads = (path: string) =>
        vi.mocked(fetch).mock.calls.filter(([url]) => url === path).length;

      await screen.findByRole("heading", { name: person.nickname });
      await userEvent.click(nav.getByRole("button", { name: "找队伍" }));
      await screen.findByRole("heading", { name: team.teamName });
      await userEvent.click(nav.getByRole("button", { name: "找队友" }));
      expect(
        screen.getByRole("heading", { name: person.nickname }),
      ).toBeVisible();
      await userEvent.click(nav.getByRole("button", { name: "找队伍" }));
      expect(
        screen.getByRole("heading", { name: team.teamName }),
      ).toBeVisible();
      expect(reads("/api/v1/profiles")).toBe(1);
      expect(reads("/api/v1/recruitments")).toBe(1);
      expect(reads("/api/v1/competitions")).toBe(1);

      clock.mockReturnValue(Date.now() + 31_000);
      await userEvent.click(nav.getByRole("button", { name: "找队友" }));
      expect(
        screen.getByRole("heading", { name: person.nickname }),
      ).toBeVisible();
      await waitFor(() => expect(reads("/api/v1/profiles")).toBe(2));
    } finally {
      clock.mockRestore();
    }
  });

  it("manages a signed-in captain's recruitment from the personal center", async () => {
    activePersona = "captain";
    window.history.replaceState(null, "", "/center");
    render(<App />);
    expect(
      await screen.findByRole("button", { name: "创建队伍" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "找队伍" }));
    await screen.findByRole("heading", { name: "城市脉络建模队" });
    await userEvent.click(screen.getByRole("button", { name: "个人中心" }));
    const row = () => within(screen.getByText("城市脉络建模队").closest("li")!);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "编辑招募" }))[0],
    );
    const editor = await screen.findByRole("dialog", { name: "编辑招募" });
    expect(
      await within(editor).findByRole("textbox", { name: "队伍名称" }),
    ).toHaveValue("城市脉络建模队");
    await userEvent.click(within(editor).getByRole("button", { name: "关闭" }));
    await userEvent.click(row().getByRole("button", { name: "下架" }));
    const confirmation = screen.getByRole("dialog", { name: "下架招募" });
    await userEvent.click(
      within(confirmation).getByRole("button", { name: "确认下架" }),
    );
    expect(await row().findByText("已下架")).toBeInTheDocument();
    expect(row().getByRole("button", { name: "重新上架" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "找队伍" }));
    expect(await screen.findByText("校园借用助手队")).toBeInTheDocument();
    expect(screen.queryByText("城市脉络建模队")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "创建队伍" }),
    ).not.toBeInTheDocument();
  });

  it("uses the direct registration link and lets a new account skip its card", async () => {
    const request = vi.mocked(fetch).getMockImplementation()!;
    const student = {
      userId: "new-student",
      nickname: "未设置昵称",
      kind: "student",
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/auth/capabilities"))
        return Response.json({ mode: "student" });
      if (path.endsWith("/auth/register"))
        return Response.json(student, { status: 201 });
      if (
        path.endsWith("/me/profile") ||
        path.endsWith("/profiles/new-student")
      ) {
        return Response.json({ error: { code: "not_found" } }, { status: 404 });
      }
      return request(input, init);
    });
    window.history.replaceState(null, "", "/register#token=test-activation");
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("学号"), "0012345678");
    await user.type(
      screen.getByLabelText(/TeamUP 密码/),
      "Cloud-Wheel-River-272",
    );
    expect(window.location.hash).toBe("");
    await user.click(screen.getByRole("button", { name: "注册" }));
    const registration = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/auth/register"));
    expect(JSON.parse(String(registration?.[1]?.body))).toMatchObject({
      studentId: "0012345678",
      activationToken: "test-activation",
    });
    await user.click(await screen.findByRole("button", { name: "稍后再说" }));
    expect(
      await screen.findByRole("button", { name: "创建名片" }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/me/profile") && init?.method === "PUT",
        ),
    ).toBe(false);
  });

  it("opens the about page from the homepage and returns to the introduction", async () => {
    render(<App />);
    expect(
      screen.getByText(
        "“一拍即合 TeamUP”是西南财经大学 AI 智能体 + 协会开发的竞赛组队平台。",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关于我们" }));
    expect(window.location.pathname).toBe("/about");
    expect(screen.getByRole("heading", { name: "关于我们" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "返回首页" }));
    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { name: "平台介绍" })).toHaveFocus();
  });

  it("shows Chinese discovery and switches persona before applying", async () => {
    localStorage.setItem("teamup-locale", "en");
    render(<App />);
    expect(
      screen.getByRole("button", { name: "一拍即合 · TeamUP" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /切换到英文|Switch to Chinese/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /美赛/ }));
    expect(window.location.pathname).toBe("/competitions/mcm-icm");
    expect(screen.getByRole("heading", { name: "美赛" })).toHaveFocus();
    expect(screen.getByRole("link", { name: /COMAP/ })).toHaveAttribute(
      "href",
      "https://contest.comap.org/undergraduate/contests/mcm/instructions.php",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "查看该赛事的队伍" }),
    );
    expect(window.location.search).toBe("?competition=mcm-icm");
    expect(await screen.findByText("城市脉络建模队")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("演示身份")).toBeEnabled(),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("演示身份"),
      "candidate-a",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("option", {
          name: "同学甲 · " + fixture.personas["candidate-a"].nickname,
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("招募需求")).not.toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "查看队伍" }),
    );
    const details = within(
      screen.getByRole("dialog", { name: "城市脉络建模队" }),
    );
    expect(details.getByText("招募需求")).toBeInTheDocument();
    expect(
      details.getByText(/同意后，双方可在击掌申请详情/),
    ).toBeInTheDocument();
    await userEvent.click(details.getByRole("button", { name: "申请加入" }));
    await userEvent.type(
      details.getByRole("textbox", { name: /附言/ }),
      "我可以清洗问卷并验证模型。",
    );
    await userEvent.click(details.getByRole("button", { name: "发送申请" }));
    expect(await screen.findByText("申请已发送")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const request = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/intents") && init?.method === "POST",
      );
    expect(JSON.parse(String(request?.[1]?.body)).message).toBe(
      "我可以清洗问卷并验证模型。",
    );
    await userEvent.click(screen.getByRole("button", { name: "找队友" }));
    expect(
      await screen.findByText(fixture.profiles.items[0].contribution),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: fixture.personas["candidate-a"].nickname,
      }),
    ).not.toBeInTheDocument();
    await chooseFilter("按年级筛选", "大三");
    expect(
      screen.getByText(fixture.profiles.items[0].contribution),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(fixture.profiles.items[2].contribution),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(fixture.ownProfiles["candidate-a"].experience),
    ).not.toBeInTheDocument();
  });

  it("edits competition intent and experience projects from the personal center", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByLabelText("演示身份")).toBeEnabled(),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("演示身份"),
      "candidate-a",
    );
    await userEvent.click(screen.getByRole("button", { name: "找队友" }));
    expect(
      screen.queryByRole("button", { name: "编辑名片" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "个人中心" }));
    expect(
      await screen.findByText(fixture.ownProfiles["candidate-a"].contribution),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(fixture.ownProfiles["candidate-a"].experience),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/DEMO-QQ/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "我发出的击掌申请" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "我收到的击掌申请" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "编辑名片" }));
    const intent = await screen.findByRole("textbox", { name: "比赛意向" });
    for (const direction of [
      "技术与开发",
      "数据与建模",
      "设计与视觉",
      "产品与管理",
      "商业与金融",
      "写作与表达",
    ]) {
      expect(
        screen.getByRole("group", { name: direction }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: "数据分析" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "演讲表达" }));
    expect(intent).toHaveValue(
      fixture.ownProfiles["candidate-a"].competitionIntent,
    );
    await userEvent.clear(intent);
    await userEvent.type(intent, "想参加数学建模比赛");
    expect(screen.queryByText("自定义字段")).not.toBeInTheDocument();
    for (const field of ["意向角色", "可投入时间", "参赛方向"]) {
      expect(screen.queryByLabelText(field)).not.toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: "添加项目" }));
    const project = within(screen.getByRole("group", { name: "项目 3" }));
    await userEvent.type(project.getByLabelText("比赛名称"), "数学建模校赛");
    await userEvent.type(project.getByLabelText("个人角色"), "数据分析");
    await userEvent.type(project.getByLabelText("奖项"), "二等奖");
    await userEvent.type(
      project.getByLabelText("说明", { exact: true }),
      "清洗问卷数据",
    );
    await userEvent.click(screen.getByRole("button", { name: "添加项目" }));
    await userEvent.click(screen.getByRole("button", { name: "移除项目 4" }));
    await userEvent.click(screen.getByRole("button", { name: "发布名片" }));
    await screen.findByRole("heading", { name: "我的公开名片" });
    const profileWrite = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/me/profile") && init?.method === "PUT",
      );
    const submitted = JSON.parse(String(profileWrite?.[1]?.body));
    expect(submitted.projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ award: "二等奖" })]),
    );
    expect(submitted.competitionIntent).toBe("想参加数学建模比赛");
    expect(submitted.skills).toContain("presentation");
  });

  it("restores the API session on a direct link and fetches only the current page data", async () => {
    activePersona = "candidate-a";
    window.history.replaceState(null, "", "/center");
    render(<App />);
    expect(
      await screen.findByText(fixture.ownProfiles["candidate-a"].contribution),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("演示身份")).toHaveValue("candidate-a");
    const requested = () =>
      vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(requested()).toContain("/api/v1/me/intents");
    expect(requested()).not.toContain("/api/v1/profiles");
    expect(requested()).not.toContain("/api/v1/recruitments");

    await userEvent.selectOptions(
      screen.getByLabelText("演示身份"),
      "candidate-b",
    );
    expect(
      await screen.findByText(fixture.ownProfiles["candidate-b"].contribution),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(fixture.ownProfiles["candidate-a"].contribution),
    ).not.toBeInTheDocument();

    vi.mocked(fetch).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "找队友" }));
    expect(window.location.pathname).toBe("/people");
    expect(
      await screen.findByText(fixture.profiles.items[0].contribution),
    ).toBeInTheDocument();
    expect(requested()).toContain("/api/v1/profiles");
    expect(requested()).not.toContain("/api/v1/recruitments");
    window.history.back();
    expect(
      await screen.findByRole("heading", { name: "个人中心" }),
    ).toBeInTheDocument();
  });

  it("uses dedicated covers and falls back for other competitions", async () => {
    competitions = {
      items: [
        ...fixture.competitions.items,
        { id: "other", name: "其他赛事", nameEn: "Other Contest" },
      ],
    };
    render(<App />);
    for (const [name, file] of [
      [/美赛/, "mcm-icm.svg"],
      [/AI 智能体/, "ai-agent-campus.svg"],
      [/其他赛事/, "default.svg"],
    ] as const) {
      const card = await screen.findByRole("button", { name });
      expect(card.querySelector("img")).toHaveAttribute(
        "src",
        "/competitions/" + file,
      );
    }
  });

  it("shows published recruitments newest first even if the response is unsorted", async () => {
    const request = vi.mocked(fetch).getMockImplementation()!;
    const [older, newer] = fixture.recruitments.items;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (url === "/api/v1/recruitments") {
        return Promise.resolve(
          Response.json({
            items: [
              { ...older, createdAt: "2026-11-23T13:00:00Z" },
              { ...newer, createdAt: "2026-11-24T08:00:00Z" },
            ],
          }),
        );
      }
      return request(url, init);
    });
    window.history.replaceState(null, "", "/teams");
    render(<App />);

    const cards = await screen.findAllByRole("article");
    expect(
      within(cards[0]).getByRole("heading", { name: newer.teamName }),
    ).toBeVisible();
    expect(
      within(cards[1]).getByRole("heading", { name: older.teamName }),
    ).toBeVisible();
  });

  it("combines keyword search with any selected skill on team discovery", async () => {
    window.history.replaceState(null, "", "/teams");
    render(<App />);
    const [modelingTeam, campusTeam] = fixture.recruitments.items;
    await screen.findByRole("heading", { name: modelingTeam.teamName });
    await userEvent.click(screen.getByRole("button", { name: "按技能筛选" }));
    const filter = screen.getByRole("dialog", { name: "按技能筛选" });
    await userEvent.click(
      within(filter).getByRole("checkbox", { name: "数据分析" }),
    );
    await userEvent.click(
      within(filter).getByRole("checkbox", { name: "智能体开发" }),
    );
    await userEvent.click(
      within(filter).getByRole("button", { name: "匹配任一选中技能（2）" }),
    );
    expect(
      screen.getByRole("heading", { name: modelingTeam.teamName }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: campusTeam.teamName }),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "搜索技能" }),
      "编程",
    );
    expect(
      screen.getByRole("heading", { name: modelingTeam.teamName }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: modelingTeam.teamName }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: campusTeam.teamName }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/recruitments?search=%E7%BC%96%E7%A8%8B",
      expect.anything(),
    );
  });

  it("opens the AI competition introduction and its filtered teams", async () => {
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: /AI 智能体\+ 大赛校赛/ }),
    );
    expect(window.location.pathname).toBe("/competitions/ai-agent-campus");
    expect(
      screen.getByRole("heading", { name: "AI 智能体+ 大赛校赛" }),
    ).toHaveFocus();
    expect(screen.getByText(/以学校发布的正式通知为准/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "查看该赛事的队伍" }),
    );
    expect(window.location.search).toBe("?competition=ai-agent-campus");
    expect(await screen.findByText("校园借用助手队")).toBeInTheDocument();
    expect(screen.queryByText("城市脉络建模队")).not.toBeInTheDocument();
  });

  it("opens Welcome first and filters team discovery by competition", async () => {
    render(<App />);
    const welcome = screen.getByRole("button", { name: "欢迎" });
    expect(welcome).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("heading", { name: "平台介绍" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "比赛目录" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "找队伍" }));
    expect(screen.getByRole("heading", { name: "找队伍" })).toHaveFocus();
    expect(await screen.findByText("城市脉络建模队")).toBeInTheDocument();
    expect(screen.getByText("校园借用助手队")).toBeInTheDocument();
    await chooseFilter("按比赛筛选", "AI 智能体+ 大赛校赛");
    expect(screen.queryByText("城市脉络建模队")).not.toBeInTheDocument();
    expect(screen.getByText("校园借用助手队")).toBeInTheDocument();
    expect(screen.getByLabelText("按技能筛选")).toBeInTheDocument();
    await userEvent.click(welcome);
    expect(screen.getByRole("heading", { name: "平台介绍" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "找队友" }));
    expect(screen.getByRole("heading", { name: "找队友" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "个人中心" }));
    expect(
      screen.getByRole("heading", { name: "个人中心" }),
    ).toBeInTheDocument();
  });
});
