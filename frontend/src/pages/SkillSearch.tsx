import { useEffect, useState } from "react";
import { describeError } from "./useRequest";

type SearchResult<T> = { data?: T; error?: string; pending?: boolean };

/** 合并连续输入，并在新请求期间保留上一组结果。 */
export function useSkillSearch<T>(
  request: (search: string) => Promise<T>,
  search: string,
  unfiltered: SearchResult<T>,
): SearchResult<T> {
  const query = search.trim();
  const [result, setResult] = useState<SearchResult<T> & { query: string }>();
  useEffect(() => {
    if (!query) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void request(query).then(
        (data) => {
          if (active) setResult({ query, data });
        },
        (error: unknown) => {
          if (active) setResult({ query, error: describeError(error) });
        },
      );
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, request]);
  if (!query) return unfiltered;
  return result?.query === query
    ? result
    : { data: result?.data ?? unfiltered.data, pending: true };
}

/** 显示两个发现页共用的关键词搜索输入框。 */
export function SkillSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (search: string) => void;
}) {
  return (
    <label className="skill-search">
      <span>搜索技能</span>
      <input
        type="search"
        value={value}
        placeholder="技能或关键词"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
