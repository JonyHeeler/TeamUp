import { ApiError } from "./http";
import type { OwnProfile, ProfileInput } from "./types";

/** Replaces a profile's simulated evidence after checking retained IDs. */
export function replaceMockEvidence(
  p: OwnProfile,
  evidence: ProfileInput["evidence"],
  pictures: Map<string, Blob>,
) {
  if (evidence) {
    if (
      evidence.some((item) => "id" in item && !p.evidenceIds.includes(item.id))
    )
      throw new ApiError(
        "有一张图片证明已失效，请重新打开名片",
        { evidence: "有一张图片证明已失效，请重新打开名片" },
        "validation_error",
      );
    const ids = evidence.map((item) => {
      if ("id" in item) return item.id;
      const id = crypto.randomUUID();
      const type = item.image.startsWith("iVBOR")
        ? "image/png"
        : item.image.startsWith("/9j/")
          ? "image/jpeg"
          : "image/webp";
      const bytes = Uint8Array.from(atob(item.image), (character) =>
        character.charCodeAt(0),
      );
      pictures.set(id, new Blob([bytes], { type }));
      return id;
    });
    for (const id of p.evidenceIds) if (!ids.includes(id)) pictures.delete(id);
    p.evidenceIds = ids;
  }
}
