import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import fixture from "../../contracts/examples/demo.json";

describe("TeamUp", () => {
  beforeEach(() => {
    sessionStorage.clear();
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
        if (path.includes("/profiles")) return Response.json(fixture.profiles);
        if (path.endsWith("/me/intents")) return Response.json({ items: [] });
        return Response.json(
          { error: { message: "请求失败" } },
          { status: 400 },
        );
      }),
    );
  });
  it("shows discovery and switches persona before applying", async () => {
    render(<App />);
    expect(await screen.findByText("数学建模队")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText("演示身份"),
      "candidate-a",
    );
    await waitFor(() => expect(screen.getByText("许言")).toBeInTheDocument());
    expect(
      screen.getAllByText(/对方同意后，双方可在意向详情/).length,
    ).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "找队友" }));
    expect(
      await screen.findByText(fixture.profiles.items[1].contribution),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("参加过学院数据分析训练营。"),
    ).not.toBeInTheDocument();
  });
});
