import { copy as t } from "../copy";

/** 在个人中心加载期间展示占位内容。 */
export default function CenterLoading() {
  return (
    <div className="center-loading" role="status" aria-label={t.loading}>
      <div className="center-loading-profile" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="center-loading-team" aria-hidden="true" />
      <div className="request-columns" aria-hidden="true">
        <div className="center-loading-request" />
        <div className="center-loading-request" />
      </div>
    </div>
  );
}
