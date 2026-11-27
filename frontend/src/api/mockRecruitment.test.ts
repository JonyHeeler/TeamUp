import { describe, expect, it } from "vitest";
import { recruitmentDraft } from "./mockRecruitment";
import fixture from "../../../contracts/examples/demo.json";

const draft = {
  competition: fixture.competitions.items[0].name,
  background: "项目背景",
  openings: "周末可加入 1–2 人",
  requirements: [
    {
      skills: ["data-analysis", "data-analysis"] as "data-analysis"[],
      expectation: "",
    },
    { skills: ["data-analysis"] as "data-analysis"[], expectation: "验证" },
  ],
};

describe("recruitment requirements", () => {
  it("aggregates unique skills independently of free-text openings", () => {
    const saved = recruitmentDraft(draft);
    expect(saved.skills).toEqual(["data-analysis"]);
    expect(saved.requirements[0].skills).toEqual(["data-analysis"]);
    expect(
      recruitmentDraft({ ...draft, openings: "", requirements: [] }).openings,
    ).toBeNull();
    expect(() =>
      recruitmentDraft({
        ...draft,
        requirements: [{ skills: [], expectation: " " }],
      }),
    ).toThrow();
  });
});
