import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../contracts/examples/demo.json";
import type { Me, Profile } from "../api/client";
import { skillGroups } from "../SkillFields";
import PeoplePage from "./PeoplePage";
import { filterPeople, toSkillGroupFilterValue } from "./peopleFilter";

const captainMe: Me = {
  ...fixture.personas.captain,
  persona: "captain",
};

const candidateAMe: Me = {
  ...fixture.personas["candidate-a"],
  persona: "candidate-a",
};

const sampleProfiles: Profile[] = [
  ...(fixture.profiles.items as Profile[]),
  {
    userId: "00000000-0000-4000-8000-000000000004",
    nickname: "陈默",
    skills: [],
    customSkills: [],
    contribution: "暂未填写技能的测试名片。",
    college: "经济学院",
    major: "经济学",
    grade: "大一",
  },
];

async function chooseFilter(label: string, choice: string) {
  screen.getByRole("combobox", { name: label }).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(await screen.findByRole("option", { name: choice }));
}

describe("peopleFilter", () => {
  it("supports filtering by every skill group from skillGroups", () => {
    for (const group of skillGroups) {
      const matched = filterPeople(sampleProfiles, {
        skillFilter: toSkillGroupFilterValue(group.label),
        skillKeyword: "",
        collegeFilter: "",
        gradeFilter: "",
      });
      for (const profile of matched) {
        expect(
          group.skills.some((code) => profile.skills.includes(code)),
        ).toBe(true);
      }
      const expectedCount = sampleProfiles.filter((profile) =>
        group.skills.some((code) => profile.skills.includes(code)),
      ).length;
      expect(matched).toHaveLength(expectedCount);
    }
  });

  it("matches official skill names and custom skills case-insensitively with trimmed spaces", () => {
    expect(
      filterPeople(sampleProfiles, {
        skillFilter: "",
        skillKeyword: "  建模  ",
        collegeFilter: "",
        gradeFilter: "",
      }).map((item) => item.nickname),
    ).toEqual(["许言"]);

    expect(
      filterPeople(sampleProfiles, {
        skillFilter: "",
        skillKeyword: "  fIgMa  ",
        collegeFilter: "",
        gradeFilter: "",
      }).map((item) => item.nickname),
    ).toEqual(["周禾"]);

    expect(
      filterPeople(sampleProfiles, {
        skillFilter: "",
        skillKeyword: "NOTEBOOK",
        collegeFilter: "",
        gradeFilter: "",
      }).map((item) => item.nickname),
    ).toEqual(["许言"]);
  });

  it("safely handles profiles with empty skill lists and combines all filters", () => {
    expect(
      filterPeople(sampleProfiles, {
        skillFilter: "",
        skillKeyword: "   ",
        collegeFilter: "",
        gradeFilter: "",
        currentUserId: fixture.personas.captain.userId,
      }).map((item) => item.nickname),
    ).toEqual(["许言", "周禾", "陈默"]);

    expect(
      filterPeople(sampleProfiles, {
        skillFilter: toSkillGroupFilterValue("数据与建模"),
        skillKeyword: "notebook",
        collegeFilter: "统计学院",
        gradeFilter: "大二",
        currentUserId: fixture.personas.captain.userId,
      }).map((item) => item.nickname),
    ).toEqual(["许言"]);

    expect(
      filterPeople(sampleProfiles, {
        skillFilter: "development",
        skillKeyword: "Python",
        collegeFilter: "经济学院",
        gradeFilter: "大一",
      }),
    ).toEqual([]);
  });
});

describe("PeoplePage filters", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    Element.prototype.scrollIntoView ??= vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/profiles")) {
          return Response.json({ items: sampleProfiles });
        }
        return Response.json({ items: [] });
      }),
    );
  });

  it("filters by skill category, specific skill, keyword, and resets all filters", async () => {
    render(<PeoplePage me={captainMe} />);

    expect(await screen.findByText("许言")).toBeInTheDocument();
    expect(screen.getByText("周禾")).toBeInTheDocument();
    expect(screen.getByText("陈默")).toBeInTheDocument();
    expect(screen.queryByText("林舟")).not.toBeInTheDocument();

    await chooseFilter("按技能筛选", "全部技术与开发");
    expect(screen.getByText("周禾")).toBeInTheDocument();
    expect(screen.queryByText("许言")).not.toBeInTheDocument();
    expect(screen.queryByText("陈默")).not.toBeInTheDocument();

    await chooseFilter("按技能筛选", "数据分析");
    expect(screen.getByText("许言")).toBeInTheDocument();
    expect(screen.queryByText("周禾")).not.toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "按技能关键词搜索" });
    expect(search).not.toHaveAttribute("placeholder");
    const tools = search.closest(".view-tools");
    const labels = Array.from(
      tools?.querySelectorAll(".filter-category") ?? [],
    ).map((node) => node.textContent);
    expect(labels).toEqual(["技能", "学院", "年级", "技能关键词"]);
    await userEvent.type(search, "  FIGMA ");
    expect(screen.getByText("暂无符合条件的名片")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getByText("许言")).toBeInTheDocument();
    expect(screen.getByText("周禾")).toBeInTheDocument();
    expect(screen.getByText("陈默")).toBeInTheDocument();
    expect(search).toHaveValue("");

    await userEvent.type(search, "figma");
    expect(screen.getByText("周禾")).toBeInTheDocument();
    expect(screen.queryByText("许言")).not.toBeInTheDocument();
  });
});

describe("PeoplePage dual-mode invitation", () => {
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

  it("defaults to team mode when user has published teams and lets user switch to personal mode", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/profiles"))
        return Response.json({ items: sampleProfiles });
      if (path.includes("/profiles/"))
        return Response.json(fixture.profiles.items[1]);
      if (path.endsWith("/me/recruitments"))
        return Response.json(fixture.recruitments);
      if (path.endsWith("/intents") && init?.method === "POST")
        return Response.json({ status: "pending" }, { status: 201 });
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PeoplePage me={captainMe} />);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "查看名片" }))[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "许言" });
    expect(
      screen.getByRole("combobox", { name: "选择队伍" }),
    ).toBeInTheDocument();
    const teamBtn = screen.getByRole("button", { name: "队伍" });
    const personalBtn = screen.getByRole("button", { name: "个人" });
    expect(teamBtn).toHaveAttribute("aria-pressed", "true");
    expect(personalBtn).toHaveAttribute("aria-pressed", "false");

    // Switching mode hides team select and creates no intent
    await userEvent.click(personalBtn);
    expect(
      screen.queryByRole("combobox", { name: "选择队伍" }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).endsWith("/intents")),
    ).toBe(false);

    await userEvent.type(
      screen.getByRole("textbox", { name: /附言/ }),
      "先认识一下",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "发送击掌邀请" }),
    );
    const postCall = fetchMock.mock.calls.find(
      ([u, init]) => String(u).endsWith("/intents") && init?.method === "POST",
    );
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      kind: "personal",
      candidateId: fixture.profiles.items[1].userId,
      message: "先认识一下",
    });
    expect(dialog).not.toBeInTheDocument();
  });

  it("defaults to personal mode and disables team mode when user has no published teams", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.endsWith("/profiles"))
          return Response.json({ items: sampleProfiles });
        if (path.includes("/profiles/"))
          return Response.json(fixture.profiles.items[2]);
        if (path.endsWith("/me/recruitments"))
          return Response.json({
            items: [
              {
                ...fixture.recruitments.items[0],
                ownerId: fixture.personas["candidate-a"].userId,
                isPublished: false,
              },
            ],
          });
        return Response.json({ items: [] });
      }),
    );

    render(<PeoplePage me={candidateAMe} />);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "查看名片" }))[1],
    );
    await screen.findByRole("dialog", { name: "周禾" });
    expect(screen.getByRole("button", { name: "队伍" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "个人" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText(/你的队伍目前均已下架/),
    ).toBeInTheDocument();
  });
});
