import { useEffect, useState } from "react";
import { api } from "./api/client";
import type { EvidenceDraft } from "./evidence";

export default function EvidenceImage({
  entry,
  userId,
  label,
}: {
  entry: EvidenceDraft;
  userId: string;
  label: string;
}) {
  const [mediaUrl, setMediaUrl] = useState("");
  useEffect(() => {
    if (entry.dataUrl) return;
    let active = true;
    let url = "";
    void api
      .evidence(userId, entry.id)
      .then((image) => {
        if (!active) return;
        url = URL.createObjectURL(image);
        setMediaUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry.id, entry.dataUrl, userId]);
  const source = entry.dataUrl || mediaUrl;
  if (!source) return <span className="proof-preview" />;
  return entry.dataUrl ? (
    <img className="proof-preview" src={source} alt={label} />
  ) : (
    <a className="proof-preview" href={source} target="_blank" rel="noreferrer">
      <img src={source} alt={label} />
    </a>
  );
}
