import fixture from "../../../contracts/examples/demo.json";
import { ApiError } from "./http";
import type { RecruitmentInput } from "./types";

/** Validates and normalizes a simulated recruitment. */
export function recruitmentDraft(body: RecruitmentInput) {
  if (
    !fixture.competitions.items.some((c) => c.name === body.competition.trim())
  )
    throw new ApiError(
      "请选择官方比赛",
      { competition: "请选择官方比赛" },
      "validation_error",
    );
  if (
    body.requirements.some(
      (item) => !item.skills?.length && !item.expectation?.trim(),
    )
  )
    throw new ApiError(
      "请为每条需求选择技能或填写期望",
      { requirements: "请为每条需求选择技能或填写期望" },
      "validation_error",
    );
  return {
    ...body,
    competition: body.competition.trim(),
    openings: body.openings?.trim() || null,
    requirements: body.requirements.map((item) => ({
      skills: [...new Set(item.skills ?? [])],
      expectation: item.expectation?.trim() || null,
    })),
    skills: [
      ...new Set(body.requirements.flatMap((item) => item.skills ?? [])),
    ],
  };
}
