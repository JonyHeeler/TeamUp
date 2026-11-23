import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  httpApi,
  ApiError,
  type Api,
  type Intent,
  type Me,
  type OwnProfile,
  type Persona,
  type Profile,
  type ProfileInput,
  type Recruitment,
  type RecruitmentInput,
  type Skill,
} from "./api/client";

import "./style.css";

const skills: Record<string, string> = {
  "data-analysis": "数据分析",
  development: "程序开发",
  design: "设计",
  presentation: "演讲表达",
};
const skillName = (s: string) => skills[s] || s;
const labels: Record<Intent["status"], string> = {
  pending: "待回应",
  accepted: "已同意",
  declined: "已婉拒",
};
const blankProfile: ProfileInput = {
  nickname: "",
  skills: [],
  contribution: "",
  major: "",
  grade: "",
  experience: "",
  publicFields: { major: false, grade: false, experience: false },
};
const blankRecruitment: RecruitmentInput = {
  competition: "",
  teamName: "",
  openings: 1,
  skills: [],
  task: "",
};
type Page = "teams" | "people" | "intents" | "profile" | "publish";
const api: Api =
  import.meta.env.VITE_TEAMUP_MOCK === "true"
    ? new Proxy({} as Api, {
        get:
          (_target, key: keyof Api) =>
          (...args: unknown[]) =>
            import("./api/mock").then(({ mockApi }) =>
              (mockApi[key] as (...args: unknown[]) => Promise<unknown>)(
                ...args,
              ),
            ),
      })
    : httpApi;

function SkillPicker({
  value,
  onChange,
  error,
}: {
  value: Skill[];
  error?: string;
  onChange: (v: Skill[]) => void;
}) {
  return (
    <fieldset className="skill-picker">
      <legend>
        技能标签 <span>至少选一项</span>
      </legend>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        {Object.entries(skills).map(([code, label]) => (
          <label className="check-pill" key={code}>
            <input
              type="checkbox"
              checked={value.includes(code as Skill)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, code as Skill]
                    : value.filter((x) => x !== code),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function Tags({ values }: { values: string[] }) {
  return (
    <div className="tags">
      {values.map((s) => (
        <span key={s}>{skillName(s)}</span>
      ))}
    </div>
  );
}
function ErrorText({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="error">
      {error}
    </p>
  ) : null;
}
function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "操作失败，请重试。";
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [page, setPage] = useState<Page>("teams");
  const [teams, setTeams] = useState<Recruitment[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [skill, setSkill] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Intent | null>(null);
  const [person, setPerson] = useState<Profile | null>(null);
  const [inviteTeam, setInviteTeam] = useState("");
  const [profile, setProfile] = useState<ProfileInput>(blankProfile);
  const [recruitment, setRecruitment] =
    useState<RecruitmentInput>(blankRecruitment);
  const epoch = useRef(0);
  const revision = useRef(0);
  const [switching, setSwitching] = useState(false);
  const load = useCallback(
    async (
      who: Me | null,
      currentPage: Page,
      filter: string,
      generation: number,
    ) => {
      const requestRevision = ++revision.current;
      try {
        const [t, p, i] = await Promise.all([
          api.recruitments(currentPage === "teams" ? filter : ""),
          api.profiles(currentPage === "people" ? filter : ""),
          who ? api.intents() : Promise.resolve({ items: [] }),
        ]);
        if (
          generation !== epoch.current ||
          requestRevision !== revision.current
        )
          return;
        setTeams(t.items);
        setPeople(p.items);
        setIntents(i.items);
      } catch (e) {
        if (
          generation === epoch.current &&
          requestRevision === revision.current
        )
          setError(errorMessage(e));
      }
    },
    [],
  );
  useEffect(() => {
    let active = true;
    api
      .me()
      .then((m) => {
        if (active && epoch.current === 0) setMe(m);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!person && !selected) return;
    const previous = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>(".dialog .close")?.focus();
    return () => previous?.focus();
  }, [person, selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPerson(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    void load(me, page, skill, epoch.current);
  }, [me, page, skill, load]);
  async function switchPersona(persona: Persona) {
    const generation = ++epoch.current;
    setBusy(true);
    setSwitching(true);
    setError("");
    setNotice("");
    try {
      const m = await api.session(persona);
      if (generation === epoch.current) {
        setSelected(null);
        setPerson(null);
        setIntents([]);
        setProfile(blankProfile);
        setRecruitment(blankRecruitment);
        sessionStorage.setItem("teamup-persona", persona);
        setMe(m);
        setPage("teams");
        setSkill("");
      }
    } catch (e) {
      if (generation === epoch.current) setError(errorMessage(e));
    } finally {
      if (generation === epoch.current) {
        setBusy(false);
        setSwitching(false);
      }
    }
  }
  async function perform(
    action: () => Promise<unknown>,
    success: string,
    after?: () => void,
  ) {
    const generation = epoch.current;
    setBusy(true);
    setError("");
    setFieldErrors({});
    setNotice("");
    try {
      const result = await action();
      if (generation !== epoch.current) return;
      const intent = result as Partial<Intent> | null;
      setNotice(
        intent?.status
          ? `意向状态：${labels[intent.status]}。可在我的意向查看详情。`
          : success,
      );
      after?.();
      await load(me, page, skill, generation);
    } catch (e) {
      if (generation === epoch.current) {
        setError(errorMessage(e));
        if (e instanceof ApiError) setFieldErrors(e.fields || {});
      }
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  }
  async function openProfile() {
    if (!me) {
      setError("请先选择演示身份。");
      return;
    }
    setPage("profile");
    setError("");
    const generation = epoch.current;
    try {
      const p: OwnProfile = await api.ownProfile();
      if (generation === epoch.current)
        setProfile({
          nickname: p.nickname,
          skills: p.skills,
          contribution: p.contribution,
          major: p.major || "",
          grade: p.grade || "",
          experience: p.experience || "",
          publicFields: p.publicFields,
        });
    } catch (e) {
      if (generation === epoch.current) setError(errorMessage(e));
    }
  }
  async function showIntent(id: string) {
    const generation = epoch.current;
    setError("");
    try {
      const i = await api.intent(id);
      if (generation === epoch.current) setSelected(i);
    } catch (e) {
      if (generation === epoch.current) setError(errorMessage(e));
    }
  }
  function changePage(p: Page) {
    setPage(p);
    setSkill("");
    setError("");
    setNotice("");
    setSelected(null);
    setPerson(null);
  }
  const ownTeams = teams.filter((t) => t.ownerId === me?.userId);
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#top" onClick={() => changePage("teams")}>
          <span className="brand-mark">
            T<span>+</span>
          </span>{" "}
          TeamUp
        </a>
        <nav aria-label="主导航">
          <button
            className={page === "teams" ? "active" : ""}
            onClick={() => changePage("teams")}
          >
            找队伍
          </button>
          <button
            className={page === "people" ? "active" : ""}
            onClick={() => changePage("people")}
          >
            找队友
          </button>
          <button
            className={page === "intents" ? "active" : ""}
            onClick={() => changePage("intents")}
          >
            我的意向
          </button>
        </nav>
        <div className="identity">
          <label htmlFor="persona">演示身份</label>
          <select
            id="persona"
            value={
              me
                ? ["captain", "candidate-a", "candidate-b"].find(
                    (p) => sessionStorage.getItem("teamup-persona") === p,
                  ) || ""
                : ""
            }
            disabled={busy}
            onChange={(e) => {
              void switchPersona(e.target.value as Persona);
            }}
          >
            <option value="">选择身份</option>
            <option value="captain">队长</option>
            <option value="candidate-a">同学甲</option>
            <option value="candidate-b">同学乙</option>
          </select>
          {me && <span>{me.nickname}</span>}
        </div>
      </header>
      <main
        id="top"
        aria-busy={switching}
        style={switching ? { visibility: "hidden" } : undefined}
      >
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span></span> 校园竞赛组队
            </p>
            <h1>
              找到一起
              <br />
              <em>把想法做成的人。</em>
            </h1>
            <p>
              一个好队伍，从清楚彼此能做什么开始。
              <br />
              找一场想参加的比赛，也找到合拍的队友。
            </p>
            <div className="intro-actions">
              <button className="primary" onClick={() => changePage("publish")}>
                发布招募 <span>↗</span>
              </button>
              <button className="text-button" onClick={openProfile}>
                完善我的名片 →
              </button>
            </div>
          </div>
          <div className="intro-note">
            <span className="note-symbol">✳</span>
            <p>
              好的组队，
              <br />
              从一次<span>双向选择</span>开始。
            </p>
            <small>同意后，才会交换演示 QQ</small>
          </div>
        </section>
        <div className="content">
          <div className="section-head">
            <div>
              <h2>
                {
                  (
                    {
                      teams: "发现队伍",
                      people: "发现队友",
                      intents: "我的意向",
                      profile: "我的名片",
                      publish: "发布招募",
                    } as Record<Page, string>
                  )[page]
                }
              </h2>
              <p>
                {
                  (
                    {
                      teams: "看看大家在为哪场比赛寻找伙伴。",
                      people: "从技能和任务出发，找到合适的人。",
                      intents: "在这里查看申请与邀请的进展。",
                      profile: "告诉大家你擅长什么，以及愿意做什么。",
                      publish: "把比赛和具体分工说清楚，让合适的人找到你。",
                    } as Record<Page, string>
                  )[page]
                }
              </p>
            </div>
            {(page === "teams" || page === "people") && (
              <label className="filter">
                按技能筛选
                <select
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                >
                  <option value="">全部技能</option>
                  {Object.entries(skills).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <ErrorText error={error} />
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {page === "teams" && (
            <div className="cards">
              {teams.map((t) => (
                <article className="card" key={t.id}>
                  <div className="card-top">
                    <span className="category">{t.competition}</span>
                    <span className="openings">缺 {t.openings} 人</span>
                  </div>
                  <h3>{t.teamName}</h3>
                  <p className="card-label">需要这样的伙伴</p>
                  <Tags values={t.skills} />
                  <p className="task">{t.task}</p>
                  <div className="card-footer">
                    <small>
                      招募中 ·{" "}
                      {t.ownerId === me?.userId ? "我发布的" : "寻找队友"}
                    </small>
                    {t.ownerId !== me?.userId && (
                      <button
                        className="outline"
                        disabled={busy}
                        onClick={() => {
                          if (!me) {
                            setError("请先选择演示身份。");
                            return;
                          }
                          void perform(
                            () =>
                              api.createIntent({
                                kind: "apply",
                                recruitmentId: t.id,
                              }),
                            "申请已提交，可在我的意向查看进展。",
                          );
                        }}
                      >
                        申请加入 ↗
                      </button>
                    )}
                  </div>
                  {t.ownerId !== me?.userId && (
                    <p className="privacy">
                      对方同意后，双方可在意向详情查看彼此的演示 QQ。
                    </p>
                  )}
                </article>
              ))}
              {teams.length === 0 && (
                <p className="empty">
                  暂时没有符合条件的招募，换个技能看看或发布一条吧。
                </p>
              )}
            </div>
          )}
          {page === "people" && (
            <div className="cards">
              {people.map((p) => (
                <article className="card" key={p.userId}>
                  <div className="person-heading">
                    <span className="avatar">{p.nickname.slice(0, 1)}</span>
                    <div>
                      <span className="category">参赛伙伴</span>
                      <h3>{p.nickname}</h3>
                    </div>
                  </div>
                  <Tags values={p.skills} />
                  <p className="card-label">可以承担</p>
                  <p className="task">{p.contribution}</p>
                  <div className="details">
                    {p.major && <span>专业 · {p.major}</span>}
                    {p.grade && <span>年级 · {p.grade}</span>}
                    {p.experience && <span>经历 · {p.experience}</span>}
                  </div>
                  {p.userId !== me?.userId && (
                    <div className="card-footer">
                      <small>查看名片与邀请</small>
                      <button
                        className="outline"
                        onClick={() => {
                          const generation = epoch.current;
                          setError("");
                          void api
                            .profile(p.userId)
                            .then((detail) => {
                              if (generation === epoch.current) {
                                setPerson(detail);
                                setInviteTeam("");
                              }
                            })
                            .catch((e) => {
                              if (generation === epoch.current)
                                setError(errorMessage(e));
                            });
                        }}
                      >
                        查看名片 →
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {people.length === 0 && (
                <p className="empty">暂时没有符合条件的名片，试试其他技能。</p>
              )}
            </div>
          )}
          {page === "intents" &&
            (!me ? (
              <p className="empty">请先选择演示身份，查看你的申请和邀请。</p>
            ) : (
              <div className="intent-list">
                {intents.map((i) => (
                  <button
                    className="intent-row"
                    key={i.id}
                    onClick={() => void showIntent(i.id)}
                  >
                    <div>
                      <span className="category">
                        {i.kind === "apply" ? "加入申请" : "入队邀请"} ·{" "}
                        {i.canRespond
                          ? "待我回应"
                          : (i.kind === "apply" ? i.candidateId : i.ownerId) ===
                              me.userId
                            ? "我发出的"
                            : "收到的"}
                      </span>
                      <h3>
                        {teams.find((t) => t.id === i.recruitmentId)
                          ?.teamName || "组队意向"}
                      </h3>
                      <p>
                        {i.candidateId === me.userId
                          ? "候选人：我"
                          : `候选人：${people.find((p) => p.userId === i.candidateId)?.nickname || "同学"}`}
                      </p>
                    </div>
                    <span className={`status ${i.status}`}>
                      {labels[i.status]}
                    </span>
                    <span>→</span>
                  </button>
                ))}
                {intents.length === 0 && (
                  <p className="empty">
                    还没有意向。去找队伍或找队友，迈出第一步吧。
                  </p>
                )}
              </div>
            ))}
          {page === "publish" && (
            <form
              className="form-panel"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!me) {
                  setError("请先选择演示身份。");
                  return;
                }
                if (!recruitment.skills.length) {
                  setError("请至少选择一项技能。");
                  setFieldErrors({ skills: "请至少选择一项技能。" });
                  return;
                }
                void perform(
                  () => api.createRecruitment(recruitment),
                  "招募已发布。",
                  () => {
                    setRecruitment(blankRecruitment);
                    setPage("teams");
                  },
                );
              }}
            >
              <label>
                比赛名称
                <input
                  required
                  maxLength={80}
                  value={recruitment.competition}
                  onChange={(e) =>
                    setRecruitment({
                      ...recruitment,
                      competition: e.target.value,
                    })
                  }
                  placeholder="例如：全国大学生数学建模竞赛"
                />
              </label>
              <label>
                队伍名称
                <input
                  required
                  maxLength={80}
                  value={recruitment.teamName}
                  onChange={(e) =>
                    setRecruitment({ ...recruitment, teamName: e.target.value })
                  }
                  placeholder="给队伍起个名字"
                />
              </label>
              <label>
                招募人数
                <input
                  type="number"
                  min={1}
                  required
                  value={recruitment.openings}
                  onChange={(e) =>
                    setRecruitment({
                      ...recruitment,
                      openings: Number(e.target.value),
                    })
                  }
                />
              </label>
              <SkillPicker
                error={fieldErrors.skills}
                value={recruitment.skills}
                onChange={(v) => setRecruitment({ ...recruitment, skills: v })}
              />
              <label>
                任务说明
                <textarea
                  required
                  maxLength={500}
                  value={recruitment.task}
                  onChange={(e) =>
                    setRecruitment({ ...recruitment, task: e.target.value })
                  }
                  placeholder="希望队友负责什么？"
                />
              </label>
              <button className="primary" disabled={busy}>
                发布招募 ↗
              </button>
            </form>
          )}
          {page === "profile" && (
            <form
              className="form-panel"
              onSubmit={(e) => {
                e.preventDefault();
                if (!profile.skills.length) {
                  setError("请至少选择一项技能。");
                  return;
                }
                void perform(
                  () => api.saveProfile(profile),
                  "名片已保存并发布。",
                );
              }}
            >
              <label>
                昵称
                <input
                  required
                  maxLength={80}
                  value={profile.nickname || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, nickname: e.target.value })
                  }
                />
              </label>
              <SkillPicker
                value={profile.skills}
                onChange={(v) => setProfile({ ...profile, skills: v })}
              />
              <label>
                可承担的任务
                <textarea
                  required
                  maxLength={500}
                  value={profile.contribution}
                  onChange={(e) =>
                    setProfile({ ...profile, contribution: e.target.value })
                  }
                  placeholder="例如：清洗数据、建立预测模型"
                />
              </label>
              {(["major", "grade", "experience"] as const).map((key) => (
                <div className="optional" key={key}>
                  <label>
                    {{ major: "专业", grade: "年级", experience: "经历" }[key]}
                    （选填）
                    {key === "experience" ? (
                      <textarea
                        maxLength={500}
                        value={profile[key] || ""}
                        onChange={(e) =>
                          setProfile({ ...profile, [key]: e.target.value })
                        }
                      />
                    ) : (
                      <input
                        maxLength={80}
                        value={profile[key] || ""}
                        onChange={(e) =>
                          setProfile({ ...profile, [key]: e.target.value })
                        }
                      />
                    )}
                  </label>
                  <label className="show-check">
                    <input
                      type="checkbox"
                      checked={profile.publicFields[key]}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          publicFields: {
                            ...profile.publicFields,
                            [key]: e.target.checked,
                          },
                        })
                      }
                    />
                    在公开名片中展示
                  </label>
                </div>
              ))}
              <button className="primary" disabled={busy}>
                保存并发布名片 ↗
              </button>
            </form>
          )}
        </div>
      </main>
      <footer>
        <strong>TeamUp</strong>
        <span>找到一起参赛的人。</span>
        <span>校园竞赛组队 · Demo</span>
      </footer>
      {person && (
        <div className="overlay" onClick={() => setPerson(null)}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="关闭"
              onClick={() => setPerson(null)}
            >
              ×
            </button>
            <ErrorText error={error} />
            <p className="eyebrow">参赛伙伴</p>
            <h2 id="person-title">{person.nickname}</h2>
            <Tags values={person.skills} />
            <h4>可以承担</h4>
            <p>{person.contribution}</p>
            {person.major && <p>专业：{person.major}</p>}
            {person.grade && <p>年级：{person.grade}</p>}
            {person.experience && <p>经历：{person.experience}</p>}
            <hr />
            <label>
              邀请加入我的队伍
              <select
                value={inviteTeam}
                onChange={(e) => setInviteTeam(e.target.value)}
              >
                <option value="">选择一条招募</option>
                {ownTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.teamName} · {t.competition}
                  </option>
                ))}
              </select>
            </label>
            {ownTeams.length === 0 && <p>先发布招募，再邀请这位同学。</p>}
            <p className="privacy">
              对方同意后，双方可在意向详情查看彼此的演示 QQ。
            </p>
            <button
              className="primary"
              disabled={!inviteTeam || busy}
              onClick={() =>
                void perform(
                  () =>
                    api.createIntent({
                      kind: "invite",
                      recruitmentId: inviteTeam,
                      candidateId: person.userId,
                    }),
                  "邀请已提交，可在我的意向查看进展。",
                  () => setPerson(null),
                )
              }
            >
              发送邀请 ↗
            </button>
          </section>
        </div>
      )}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intent-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="关闭"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <ErrorText error={error} />
            <p className="eyebrow">
              {selected.kind === "apply" ? "加入申请" : "入队邀请"}
            </p>
            <h2 id="intent-title">
              {teams.find((t) => t.id === selected.recruitmentId)?.teamName ||
                "组队意向"}
            </h2>
            <p>
              状态：<strong>{labels[selected.status]}</strong>
            </p>
            <p>
              候选人：
              {people.find((p) => p.userId === selected.candidateId)
                ?.nickname || "同学"}
            </p>
            {selected.status === "accepted" && selected.counterpartQq ? (
              <div className="contact">
                <small>对方的演示 QQ</small>
                <strong>{selected.counterpartQq}</strong>
              </div>
            ) : (
              <p className="privacy">双方同意后，才会在此显示对方的演示 QQ。</p>
            )}
            {selected.canRespond && (
              <div className="dialog-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => api.respond(selected.id, "accepted"),
                      "已同意交换联系方式。",
                      () => {
                        void showIntent(selected.id);
                      },
                    )
                  }
                >
                  同意并交换 QQ
                </button>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => api.respond(selected.id, "declined"),
                      "已婉拒。",
                      () => {
                        void showIntent(selected.id);
                      },
                    )
                  }
                >
                  婉拒
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
