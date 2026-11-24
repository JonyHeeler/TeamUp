import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import fixture from "../../contracts/examples/demo.json";

describe("TeamUP", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url);
        if (path.endsWith("/me")) return new Response("{}", { status: 401 });
        if (path.endsWith("/demo/session"))
          return Response.json(
            fixture.personas[
              JSON.parse(String(init?.body))
                .persona as keyof typeof fixture.personas
            ],
          );
        if (path.includes("/recruitments"))
          return Response.json(fixture.recruitments);
        if (path.endsWith("/competitions"))
          return Response.json(fixture.competitions);
        if (path.includes("/profiles")) return Response.json(fixture.profiles);
        if (path.endsWith("/me/intents")) return Response.json({ items: [] });
        return Response.json(
          { error: { message: "请求失败" } },
          { status: 400 },
        );
      }),
    );
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
    await userEvent.click(
      await screen.findByRole("button", { name: /数学建模校赛/ }),
    );
    expect(await screen.findByText("数学建模队")).toBeInTheDocument();
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
    expect(
      screen.getAllByText(/同意后，双方可在击掌申请详情/).length,
    ).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "找队友" }));
    expect(
      await screen.findByText(fixture.profiles.items[1].contribution),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("参加过学院数据分析训练营。"),
    ).not.toBeInTheDocument();
  });

  it("opens Welcome first and filters team discovery by competition", async () => {
    render(<App />);
    const welcome = screen.getByRole("button", { name: "欢迎" });
    expect(welcome).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("heading", { name: "使用说明" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "比赛目录" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "同意击掌，再交换 QQ" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole("button", { name: "浏览队伍招募" })[0],
    );
    expect(screen.getByRole("heading", { name: "找队伍" })).toHaveFocus();
    expect(await screen.findByText("数学建模队")).toBeInTheDocument();
    expect(screen.getByText("校园创新组")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "按比赛筛选" }),
      "校园创新创业大赛",
    );
    expect(screen.queryByText("数学建模队")).not.toBeInTheDocument();
    expect(screen.getByText("校园创新组")).toBeInTheDocument();
    expect(screen.queryByLabelText("按技能筛选")).not.toBeInTheDocument();
    await userEvent.click(welcome);
    expect(
      screen.getByRole("heading", { name: "找到同频队友，一拍即合。" }),
    ).toHaveFocus();
    await userEvent.click(
      screen.getAllByRole("button", { name: "浏览队友名片" })[0],
    );
    expect(screen.getByRole("heading", { name: "找队友" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "击掌申请" }));
    expect(
      screen.getByRole("heading", { name: "击掌申请" }),
    ).toBeInTheDocument();
  });
});
