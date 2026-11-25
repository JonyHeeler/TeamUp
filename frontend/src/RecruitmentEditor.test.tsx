import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../contracts/examples/demo.json";
import type { Competition, Recruitment } from "./api/client";
import RecruitmentEditor from "./RecruitmentEditor";

const competitions: Competition[] = fixture.competitions.items;

const existingTeam: Recruitment = {
  ...(fixture.recruitments.items[1] as Recruitment),
  openings: "2-4人",
  requirements: [
    { skills: ["backend"], expectation: "需求A期望" },
    { skills: ["frontend"], expectation: "需求B期望" },
    { skills: ["presentation"], expectation: "需求C期望" },
  ],
};

describe("RecruitmentEditor decoupled openings and requirements", () => {
  afterEach(() => {
    cleanup();
  });

  it("allows free-text/empty openings and zero requirements without mutating requirement list", async () => {
    const onPublish = vi.fn();
    render(
      <RecruitmentEditor
        competitions={competitions}
        busy={false}
        fieldError={() => null}
        onPublish={onPublish}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText("比赛"), "美赛");
    const openingsInput = screen.getByLabelText("招募人数");
    expect(openingsInput).toHaveAttribute("type", "text");
    expect(openingsInput).toHaveAttribute("placeholder", "如 2-4人");
    await userEvent.type(openingsInput, "  2-4人  ");
    await userEvent.type(screen.getByLabelText("队伍 BG 介绍"), "零需求测试");

    await userEvent.click(screen.getByRole("button", { name: "创建队伍" }));
    expect(onPublish).toHaveBeenCalledWith({
      competition: "美赛",
      teamName: undefined,
      openings: "2-4人",
      requirements: [],
      background: "零需求测试",
    });
  });

  it("shows only requirement index when collapsed and deletes middle requirement permanently", async () => {
    const onPublish = vi.fn();
    render(
      <RecruitmentEditor
        competitions={competitions}
        initialTeam={existingTeam}
        busy={false}
        fieldError={() => null}
        onPublish={onPublish}
      />,
    );

    // Editing existing team: overall open, individual items collapsed by default
    expect(
      screen.getByRole("button", { name: /招募需求（3）/ }),
    ).toHaveAttribute("aria-expanded", "true");
    const collapsedToggle = screen.getByRole("button", { name: "需求 2" });
    expect(collapsedToggle).toHaveAttribute("aria-expanded", "false");
    // DEV-04C layout fix: collapsed header must NOT display skill/expectation summary text
    expect(screen.queryByText(/需求A期望/)).not.toBeInTheDocument();
    expect(screen.queryByText(/需求B期望/)).not.toBeInTheDocument();
    expect(screen.queryByText(/前端开发/)).not.toBeInTheDocument();

    // Delete middle item (filled -> inline confirmation)
    await userEvent.click(screen.getByRole("button", { name: "删除需求 2" }));
    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(
      screen.getByRole("button", { name: /招募需求（2）/ }),
    ).toBeInTheDocument();

    // Changing openings must not alter or restore requirements
    const openingsInput = screen.getByLabelText("招募人数");
    await userEvent.clear(openingsInput);
    await userEvent.type(openingsInput, "若干");
    expect(
      screen.getByRole("button", { name: /招募需求（2）/ }),
    ).toBeInTheDocument();

    // Adding a new requirement auto-expands it as blank (never restores deleted 需求B期望)
    await userEvent.click(
      screen.getByRole("button", { name: "＋ 添加招募需求" }),
    );
    expect(
      screen.getByRole("button", { name: /招募需求（3）/ }),
    ).toBeInTheDocument();
    const newToggle = screen.getByRole("button", { name: "需求 3" });
    expect(newToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByDisplayValue("需求B期望")).not.toBeInTheDocument();

    // Collapse the blank requirement and collapse overall section, then submit -> validation auto-expands it
    await userEvent.click(newToggle);
    await userEvent.click(
      screen.getByRole("button", { name: /招募需求（3）/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "保存招募" }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByText("请选技能标签或填写期望。")).toBeInTheDocument();

    // Delete the blank item immediately (no confirmation needed) and save
    await userEvent.click(screen.getByRole("button", { name: "删除需求 3" }));
    await userEvent.click(screen.getByRole("button", { name: "保存招募" }));
    expect(onPublish).toHaveBeenCalledWith({
      competition: existingTeam.competition,
      teamName: existingTeam.teamName,
      openings: "若干",
      requirements: [
        { skills: ["backend"], expectation: "需求A期望" },
        { skills: ["presentation"], expectation: "需求C期望" },
      ],
      background: existingTeam.background,
    });
  });
});
