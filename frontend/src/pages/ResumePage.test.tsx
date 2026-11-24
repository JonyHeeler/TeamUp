import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ResumePage from "./ResumePage";
import { downloadResume } from "./resumePdf";
import { api } from "../api/client";
import fixture from "../../../contracts/examples/demo.json";

vi.mock("../api/client", () => ({
  api: { ownProfile: vi.fn(), evidence: vi.fn() },
}));
vi.mock("./resumePdf", () => ({ downloadResume: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it("previews the chosen name and fields and downloads the PDF without opening print", async () => {
  const person = {
    ...fixture.personas["candidate-a"],
    persona: "candidate-a" as const,
  };
  vi.mocked(api.ownProfile).mockResolvedValue({
    ...fixture.ownProfiles["candidate-a"],
    evidenceIds: [],
  } as Awaited<ReturnType<typeof api.ownProfile>>);
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  render(<ResumePage me={person} navigate={vi.fn()} />);
  const preview = await screen.findByRole("article", { name: "简历预览" });
  await userEvent.type(screen.getByLabelText("简历姓名"), "新姓名");
  expect(within(preview).getByText("新姓名")).toBeInTheDocument();
  expect(within(preview).queryByText(/QQ/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: "QQ" }));
  expect(within(preview).getByText(/QQ/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: "平台标识" }));
  expect(
    within(preview).queryByText("一拍即合 TeamUP"),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "导出 PDF" }));
  await waitFor(() =>
    expect(downloadResume).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "新姓名",
        visible: expect.objectContaining({ qq: true, credit: false }),
      }),
    ),
  );
  expect(print).not.toHaveBeenCalled();
});
