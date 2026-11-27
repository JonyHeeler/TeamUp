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
