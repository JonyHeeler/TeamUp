import { useCallback, useEffect, useId, useState } from "react";
import {
  api,
  type HighFiveCandidate,
  type Skill,
  type UserSearchItem,
} from "./api/client";
import { copy as t } from "./copy";
import { Tags } from "./SkillFields";
import { describeError } from "./pages/shared";

export type InviteeChoice = {
  userId: string;
  nickname: string;
  skills: Skill[];
  customSkills?: string[];
  origin: "high-five" | "search";
};

export default function MemberInvitePicker({
  teamId,
  selected,
  onChange,
  disabled = false,
}: {
  teamId?: string;
  selected: InviteeChoice[];
  onChange: (next: InviteeChoice[]) => void;
  disabled?: boolean;
}) {
  const searchId = useId();
  const [candidates, setCandidates] = useState<HighFiveCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    let active = true;
    setCandidatesLoading(true);
    setCandidatesError("");
    void api
      .validCandidates(teamId ? { teamId } : undefined)
      .then(
        (res) => {
          if (active) setCandidates(res.items);
        },
        (err: unknown) => {
          if (active) setCandidatesError(describeError(err));
        },
      )
      .finally(() => {
        if (active) setCandidatesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [teamId]);

  const runSearch = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setSearchResults([]);
        setSearchError("");
        return;
      }
      setSearching(true);
      setSearchError("");
      try {
        const res = await api.searchUsers(trimmed, teamId);
        setSearchResults(res.items);
      } catch (err: unknown) {
        setSearchError(describeError(err));
      } finally {
        setSearching(false);
      }
    },
    [teamId],
  );

  const selectedIds = new Set(selected.map((item) => item.userId));
  const candidateIds = new Set(candidates.map((item) => item.userId));

  function toggleChoice(choice: InviteeChoice) {
    if (selectedIds.has(choice.userId)) {
      onChange(selected.filter((item) => item.userId !== choice.userId));
    } else {
      onChange([...selected, choice]);
    }
  }

  function renderCandidateCard(
    item: {
      userId: string;
      nickname: string;
      skills: Skill[];
      customSkills?: string[];
    },
    origin: "high-five" | "search",
  ) {
    const checked = selectedIds.has(item.userId);
    const choice: InviteeChoice = {
      userId: item.userId,
      nickname: item.nickname,
      skills: item.skills,
      customSkills: item.customSkills,
      origin,
    };
    const hasTags =
      item.skills.length > 0 || (item.customSkills?.length ?? 0) > 0;
    return (
      <li key={item.userId}>
        <div
          className={`candidate-card${checked ? " selected" : ""}`}
          onClick={() => {
            if (!disabled) toggleChoice(choice);
          }}
        >
          <div className="candidate-header">
            <div className="candidate-identity">
              <strong className="candidate-name">{item.nickname}</strong>
              <span className="badge">
                {origin === "high-five" ? "已击掌" : "主动检索"}
              </span>
            </div>
            <input
              type="checkbox"
              className="candidate-checkbox"
              aria-label={`选择 ${item.nickname}`}
              disabled={disabled}
              checked={checked}
              onClick={(event) => event.stopPropagation()}
              onChange={() => toggleChoice(choice)}
            />
          </div>
          {hasTags && (
            <div className="candidate-tags">
              <Tags
                skills={item.skills.slice(0, 4)}
                custom={item.customSkills?.slice(0, 2)}
              />
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="member-invite-picker">
      <div className="picker-group">
        <div className="picker-header">
          <span className="picker-section-title">
            {t.validHighFiveCandidates}
          </span>
          {selected.length > 0 && (
            <span className="badge">
              {t.selectedInviteesCount(selected.length)}
            </span>
          )}
        </div>

        {selected.length > 0 && (
          <ul className="selected-invitees" aria-label={t.inviteTarget}>
            {selected.map((item) => (
              <li key={item.userId}>
                <span>
                  {item.nickname}
                  <small>
                    {item.origin === "high-five" ? "已击掌" : "主动检索"}
                  </small>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`取消选择 ${item.nickname}`}
                  onClick={() => toggleChoice(item)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {candidatesLoading ? (
          <small className="consent" role="status">
            {t.loading}
          </small>
        ) : candidatesError ? (
          <p className="field-error">{candidatesError}</p>
        ) : candidates.length > 0 ? (
          <ul className="candidate-list">
            {candidates.map((item) => renderCandidateCard(item, "high-five"))}
          </ul>
        ) : (
          <p className="picker-empty">{t.noValidCandidates}</p>
        )}
      </div>

      <div className="picker-group picker-search">
        <label htmlFor={searchId} className="picker-section-title">
          {t.searchUsersLabel}
        </label>
        <div className="picker-search-row">
          <input
            id={searchId}
            type="search"
            className="picker-search-input"
            value={query}
            disabled={disabled}
            placeholder={t.searchUsersPlaceholder}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              if (!next.trim()) {
                setSearchResults([]);
                setSearchError("");
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runSearch(query);
              }
            }}
          />
          <button
            type="button"
            className="picker-search-button"
            disabled={disabled || searching || !query.trim()}
            onClick={() => void runSearch(query)}
          >
            搜索
          </button>
        </div>
        {searchError && <p className="field-error">{searchError}</p>}
        {query.trim() && !searching && searchResults.length > 0 && (
          <ul className="candidate-list">
            {searchResults.map((item) =>
              renderCandidateCard(
                item,
                candidateIds.has(item.userId) ? "high-five" : "search",
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
