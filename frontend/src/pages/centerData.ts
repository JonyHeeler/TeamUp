import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ApiError, api } from "../api/client";
import { describeError } from "./shared";

/** 获取当前名片，尚未创建时返回空值。 */
async function loadOwnProfile() {
  try {
    return await api.ownProfile();
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") return null;
    throw error;
  }
}

/** 保留单个仪表盘请求的结果或错误。 */
function sectionResult<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled"
    ? { data: result.value }
    : { error: describeError(result.reason) };
}

/** 并行读取个人中心各个区块。 */
export async function loadDashboard(userId: string) {
  const ownProfile = loadOwnProfile();
  const [profile, publicProfile, teams, requests] = await Promise.allSettled([
    ownProfile,
    ownProfile.then((entry) => (entry?.listed ? api.profile(userId) : null)),
    api.ownRecruitments(),
    api.intents(),
  ]);
  return {
    profile: sectionResult(profile),
    publicProfile: sectionResult(publicProfile),
    teams: sectionResult(teams),
    requests: sectionResult(requests),
  };
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

type DashboardEntry = { userId: string; data: Dashboard };
type DashboardRequest = { userId: string; done: Promise<void> };

/** 在主标签间复用当前身份的个人中心，刷新时保留已渲染的数据。 */
export function useCenterDashboard(
  userId: string | undefined,
  visible: boolean,
  prefetch: boolean,
) {
  const [entry, setEntry] = useState<DashboardEntry>();
  const inFlight = useRef<DashboardRequest | null>(null);

  /** 复用同一会话的请求，写入成功后可强制重新读取。 */
  const refresh = useCallback(
    (replace = false) => {
      if (!userId) return Promise.resolve();
      if (!replace && inFlight.current?.userId === userId) {
        return inFlight.current.done;
      }
      const done = loadDashboard(userId).then((data) => {
        if (inFlight.current?.done !== done) return;
        inFlight.current = null;
        // 冷启动导航等待此请求，确保目标页首帧已经拿到数据。
        flushSync(() => setEntry({ userId, data }));
      });
      inFlight.current = { userId, done };
      return done;
    },
    [userId],
  );

  /** 合并服务端确认的修改，并作废修改前启动的查询。 */
  function update(change: (dashboard: Dashboard) => Dashboard) {
    inFlight.current = null;
    setEntry((current) =>
      current && current.userId === userId
        ? { ...current, data: change(current.data) }
        : current,
    );
  }

  useEffect(() => {
    setEntry((current) => (current?.userId === userId ? current : undefined));
    return () => {
      inFlight.current = null;
    };
  }, [userId]);

  useEffect(() => {
    if (visible || prefetch) void refresh();
  }, [visible, prefetch, refresh]);

  return {
    data: userId && entry?.userId === userId ? entry.data : undefined,
    refresh,
    update,
  };
}
