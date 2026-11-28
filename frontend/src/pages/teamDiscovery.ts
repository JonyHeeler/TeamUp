import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { describeError } from "./useRequest";

const freshFor = 30_000;

/** 复用有效的列表响应，并合并已经在途的读取。 */
class DiscoveryCache<T> {
  private saved?: { data: T; readAt: number };
  private pending?: Promise<T>;

  /** 绑定一个列表读取入口。 */
  constructor(private readonly request: () => Promise<T>) {}

  /** 读取最近一次成功加载的列表。 */
  get data() {
    return this.saved?.data;
  }

  /** 按需请求列表，刷新期间保留已有数据。 */
  read(): Promise<T> {
    if (this.saved && Date.now() - this.saved.readAt < freshFor) {
      return Promise.resolve(this.saved.data);
    }
    return (this.pending ??= this.request()
      .then((data) => {
        this.saved = { data, readAt: Date.now() };
        return data;
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "unauthorized") {
          this.saved = undefined;
        }
        throw error;
      })
      .finally(() => {
        this.pending = undefined;
      }));
  }
}

/** 在列表进入视图时读取，并通知当前视图刷新结果。 */
function useDiscoveryList<T>(cache: DiscoveryCache<T>, view?: string) {
  const [result, setResult] = useState<{
    cache: DiscoveryCache<T>;
    error?: string;
  }>();
  useEffect(() => {
    if (!view) return;
    let active = true;
    void cache.read().then(
      () => {
        if (active) setResult({ cache });
      },
      (error: unknown) => {
        if (active) setResult({ cache, error: describeError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [cache, view]);
  return {
    data: view ? cache.data : undefined,
    error: view && result?.cache === cache ? result.error : undefined,
  };
}

/** 缓存发现页默认列表，按会话隔离名片和招募数据。 */
export function useTeamDiscovery({
  teamView,
  showPeople,
  scope,
}: {
  teamView?: string;
  showPeople: boolean;
  scope?: string;
}) {
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [teamsVersion, setTeamsVersion] = useState(0);
  const catalogCache = useMemo(() => new DiscoveryCache(api.competitions), []);
  const profilesCache = useMemo(
    () => new DiscoveryCache(api.profiles),
    [scope, profilesVersion],
  );
  const teamsCache = useMemo(
    () => new DiscoveryCache(api.recruitments),
    [scope, teamsVersion],
  );
  const catalog = useDiscoveryList(catalogCache, teamView);
  const profiles = useDiscoveryList(
    profilesCache,
    showPeople && scope ? "people" : undefined,
  );
  const recruitments = useDiscoveryList(
    teamsCache,
    scope ? teamView : undefined,
  );

  /** 名片发布或可见性变化后，让下一次浏览使用最新名片。 */
  function invalidateProfiles() {
    setProfilesVersion((value) => value + 1);
  }

  /** 招募或队长公开昵称更新后，让下一次浏览使用最新队伍。 */
  function invalidateRecruitments() {
    setTeamsVersion((value) => value + 1);
  }

  return {
    catalog,
    profiles,
    recruitments,
    invalidateProfiles,
    invalidateRecruitments,
  };
}

export type TeamDiscovery = ReturnType<typeof useTeamDiscovery>;
