import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  api,
  type Competition,
  type Intent,
  type Me,
  type Persona,
  type Profile,
  type ProfileInput,
  type Recruitment,
  type Skill,
} from "./api/client";
import { copy as t } from "./copy";
import ProfileEditor, { ProfileDetails } from "./ProfileEditor";
import RecruitmentEditor, { RecruitmentDetails } from "./RecruitmentEditor";
import Welcome, { BrandMark } from "./Welcome";
import EvidenceImage from "./EvidenceImage";
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_COUNT,
  EvidenceError,
  prepareEvidence,
  type EvidenceDraft,
  type ImageProblem,
} from "./evidence";
import "./style.css";

type Page = "welcome" | "teams" | "people" | "intents" | "profile" | "publish";
function CompetitionArt({ id }: { id: string }) {
  const chart = id === "math-modeling";
  return (
    <span
      className={chart ? "competition-art graph" : "competition-art objects"}
      aria-hidden="true"
    >
      <span className="illustration">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

function Dialog({
  title,
  close,
  closeLabel,
  children,
}: {
  title: string;
  close: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-content">
        <button
          className="icon-button close"
          aria-label={closeLabel}
          onClick={close}
        >
          ×
        </button>
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

function Alert({ message }: { message: string }) {
  return (
    message && (
      <p className="alert" role="alert">
        {message}
      </p>
    )
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("welcome");
  const [competitions, setCompetitions] = useState<Competition[] | null>(null);
  const [competition, setCompetition] = useState("");
  const [teams, setTeams] = useState<Recruitment[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [persona, setPersona] = useState<Persona | "">("");
  const [skill, setSkill] = useState<Skill | "">("");
  const [collegeFilter, setCollegeFilter] = useState("");
  const [failure, setFailure] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<
    "" | "saved" | "published" | Intent["status"]
  >("");
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [person, setPerson] = useState<Profile | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [inviteTeam, setInviteTeam] = useState("");
  const [profile, setProfile] = useState<ProfileInput | null>(null);
  const [proofs, setProofs] = useState<EvidenceDraft[]>([]);
  const [preparingImages, setPreparingImages] = useState(false);
  const [imageProblem, setImageProblem] = useState<ImageProblem | null>(null);
  const epoch = useRef(0);
  const requestRevision = useRef(0);
  const viewRevision = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  const teamsFor = (item: Competition) =>
    teams.filter((entry) => entry.competition === item.name);
  const ownTeams = me
    ? teams.filter((entry) => entry.ownerId === me.userId)
    : [];
  const matchingTeams = competition
    ? teams.filter((entry) => entry.competition === competition)
    : teams;
  const colleges = [
    ...new Set(
      people.flatMap((entry) => (entry.college ? [entry.college] : [])),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh"));
  const matchingPeople = people.filter(
    (entry) =>
      (!skill || entry.skills.includes(skill)) &&
      (!collegeFilter || entry.college === collegeFilter),
  );
  const teamName = (id: string) =>
    teams.find((entry) => entry.id === id)?.teamName ?? t.unknownTeam;
  const personName = (id: string) =>
    id === me?.userId
      ? me.nickname
      : people.find((entry) => entry.userId === id)?.nickname;
  const otherParty = (entry: Intent) =>
    personName(
      entry.candidateId === me?.userId ? entry.ownerId : entry.candidateId,
    );
  const sentIntents: Intent[] = [];
  const receivedIntents: Intent[] = [];
  for (const entry of intents) {
    const sender = entry.kind === "apply" ? entry.candidateId : entry.ownerId;
    (sender === me?.userId ? sentIntents : receivedIntents).push(entry);
  }
  const requestColumns = [
    {
      id: "sent-requests",
      title: t.sentIntents,
      empty: t.emptySentIntents,
      items: sentIntents,
    },
    {
      id: "received-requests",
      title: t.receivedIntents,
      empty: t.emptyReceivedIntents,
      items: receivedIntents,
    },
  ];

  function describeError(error: unknown): string {
    if (!(error instanceof ApiError)) return t.failed;
    if (error.code === "unauthorized") return t.needPersona;
    return error.message;
  }
  const error = failure ? describeError(failure) : "";
  const fieldError = (key: string) => {
    const message = Object.entries(fieldErrors).find(
      ([field]) => field === key || field.startsWith(key + "."),
    )?.[1];
    return message && <small className="field-error">{message}</small>;
  };

  const load = useCallback(async (user: Me | null, generation: number) => {
    const revision = ++requestRevision.current;
    try {
      const [teamResponse, peopleResponse, intentResponse] = await Promise.all([
        api.recruitments(),
        api.profiles(),
        user ? api.intents() : Promise.resolve({ items: [] }),
      ]);
      if (generation !== epoch.current || revision !== requestRevision.current)
        return;
      setTeams(teamResponse.items);
      setPeople(peopleResponse.items);
      setIntents(intentResponse.items);
      setLoaded(true);
    } catch (error) {
      if (generation === epoch.current && revision === requestRevision.current)
        setFailure(error);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .competitions()
      .then((response) => {
        if (active) setCompetitions(response.items);
      })
      .catch((error: unknown) => {
        if (active) setFailure(error);
      });
    void api
      .me()
      .then((user) => {
        if (!active || epoch.current) return;
        const previous = sessionStorage.getItem("teamup-persona");
        if (
          previous === "captain" ||
          previous === "candidate-a" ||
          previous === "candidate-b"
        )
          setPersona(previous);
        setMe(user);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void load(me, epoch.current);
  }, [me, load]);

  useEffect(() => {
    if (focusHeading.current) {
      heading.current?.focus();
      focusHeading.current = false;
    }
  }, [page, competition]);

  function clearFeedback() {
    setFailure(null);
    setFieldErrors({});
    setNotice("");
  }

  function navigate(next: Page) {
    viewRevision.current += 1;
    focusHeading.current = next !== page;
    setPage(next);
    setPreparingImages(false);
    setImageProblem(null);
    setSkill("");
    setCollegeFilter("");
    setPerson(null);
    setIntent(null);
    clearFeedback();
    window.scrollTo(0, 0);
  }

  async function switchPersona(next: Persona) {
    const generation = ++epoch.current;
    setSwitching(true);
    clearFeedback();
    try {
      const user = await api.session(next);
      if (generation !== epoch.current) return;
      setPerson(null);
      setIntent(null);
      setInviteTeam("");
      setIntents([]);
      setProfile(null);
      setProofs([]);
      sessionStorage.setItem("teamup-persona", next);
      setPersona(next);
      setMe(user);
      navigate(
        page === "publish" ? "teams" : page === "profile" ? "people" : page,
      );
    } catch (error) {
      if (generation === epoch.current) setFailure(error);
    } finally {
      if (generation === epoch.current) setSwitching(false);
    }
  }

  async function run<Result>(
    write: () => Promise<Result>,
    onSuccess: (result: Result) => void,
  ) {
    const generation = epoch.current;
    const view = viewRevision.current;
    setBusy(true);
    clearFeedback();
    try {
      const result = await write();
      if (generation !== epoch.current) return;
      if (view === viewRevision.current) onSuccess(result);
      void load(me, generation);
    } catch (error) {
      if (generation === epoch.current && view === viewRevision.current) {
        setFailure(error);
        if (error instanceof ApiError) setFieldErrors(error.fields ?? {});
      }
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  }

  async function openProfile() {
    if (!me) {
      setFailure(new ApiError(t.needPersona, undefined, "unauthorized"));
      return;
    }
    if (page === "profile") return;
    navigate("profile");
    setProfile(null);
    const generation = epoch.current;
    const view = viewRevision.current;
    try {
      const {
        userId: _userId,
        evidenceIds,
        ...details
      } = await api.ownProfile();
      if (generation === epoch.current && view === viewRevision.current) {
        setProfile({
          ...details,
          college: details.college ?? "",
          qq: details.qq ?? "",
        });
        setProofs((evidenceIds ?? []).map((id) => ({ id })));
      }
    } catch (error) {
      if (generation === epoch.current && view === viewRevision.current) {
        if (error instanceof ApiError && error.code === "not_found") {
          setProfile({
            nickname: me.nickname,
            college: "",
            qq: "",
            contribution: "",
            skills: [],
            publicFields: {
              college: true,
              major: false,
              grade: false,
              experience: false,
              availability: false,
              preferredRole: false,
              interests: false,
            },
          });
          setProofs([]);
        } else {
          setFailure(error);
        }
      }
    }
  }

  async function addImages(files: File[]) {
    if (!files.length) return;
    if (files.length + proofs.length > EVIDENCE_COUNT) {
      setImageProblem("imageCount");
      return;
    }
    const view = viewRevision.current;
    const generation = epoch.current;
    setImageProblem(null);
    setPreparingImages(true);
    try {
      const prepared: EvidenceDraft[] = [];
      for (const file of files) prepared.push(await prepareEvidence(file));
      if (view === viewRevision.current && generation === epoch.current)
        setProofs((current) => [...current, ...prepared]);
    } catch (error) {
      if (view === viewRevision.current && generation === epoch.current)
        setImageProblem(
          error instanceof EvidenceError ? error.issue : "imageFailed",
        );
    } finally {
      if (view === viewRevision.current && generation === epoch.current)
        setPreparingImages(false);
    }
  }

  async function openDetail<Result>(
    request: () => Promise<Result>,
    show: (value: Result) => void,
  ) {
    const generation = epoch.current;
    const view = ++viewRevision.current;
    clearFeedback();
    try {
      const result = await request();
      if (generation === epoch.current && view === viewRevision.current)
        show(result);
    } catch (error) {
      if (generation === epoch.current && view === viewRevision.current)
        setFailure(error);
    }
  }

  function closeDetail() {
    viewRevision.current += 1;
    setIntent(null);
    setPerson(null);
    clearFeedback();
  }

  function chooseCompetition(item: Competition) {
    setCompetition(item.name);
    navigate("teams");
  }

  function createTeam() {
    if (!me) {
      setFailure(new ApiError(t.needPersona, undefined, "unauthorized"));
      return;
    }
    navigate("publish");
  }

  const title = {
    welcome: t.welcome,
    teams: t.teams,
    people: t.people,
    intents: t.intents,
    profile: t.profile,
    publish: t.create,
  }[page];
  const status = (entry: Intent) => (
    <span className={"status " + entry.status}>{t[entry.status]}</span>
  );

  return (
    <>
      <header className="topbar">
        <div className="toolbar">
          <button
            className="brand"
            aria-label={t.brand + " · " + t.brandEnglish}
            onClick={() => navigate("welcome")}
          >
            <span className="brand-mark" aria-hidden="true">
              <BrandMark />
            </span>
            <span className="brand-wordmark">
              {t.brand}
              <span lang="en">{t.brandEnglish}</span>
            </span>
          </button>
          <nav aria-label={t.navigation}>
            <button
              aria-current={page === "welcome" ? "page" : undefined}
              onClick={() => navigate("welcome")}
            >
              {t.welcome}
            </button>
            <button
              aria-current={
                ["teams", "publish"].includes(page) ? "page" : undefined
              }
              onClick={() => {
                setCompetition("");
                navigate("teams");
              }}
            >
              {t.teams}
            </button>
            <button
              aria-current={
                ["people", "profile"].includes(page) ? "page" : undefined
              }
              onClick={() => navigate("people")}
            >
              {t.people}
            </button>
            <button
              aria-current={page === "intents" ? "page" : undefined}
              onClick={() => navigate("intents")}
            >
              {t.intents}
            </button>
          </nav>
          <div className="toolbar-actions">
            <select
              aria-label={t.persona}
              className="persona"
              value={persona}
              disabled={busy || switching}
              onChange={(event) =>
                void switchPersona(event.target.value as Persona)
              }
            >
              <option value="" disabled>
                {t.choosePersona}
              </option>
              <option value="captain">
                {t.captain}
                {persona === "captain" && me ? " · " + me.nickname : ""}
              </option>
              <option value="candidate-a">
                {t.candidateA}
                {persona === "candidate-a" && me ? " · " + me.nickname : ""}
              </option>
              <option value="candidate-b">
                {t.candidateB}
                {persona === "candidate-b" && me ? " · " + me.nickname : ""}
              </option>
            </select>
          </div>
        </div>
      </header>
      <main
        className={page === "welcome" ? "welcome-page" : "workspace"}
        inert={switching}
        aria-busy={switching}
      >
        {(page === "publish" || page === "profile") && (
          <button
            className="back"
            onClick={() => navigate(page === "publish" ? "teams" : "people")}
          >
            <span className="chevron left" aria-hidden="true" />
            {page === "publish" ? t.teams : t.people}
          </button>
        )}
        {page === "welcome" ? (
          <Welcome heading={heading}>
            {competitions ? (
              competitions.length > 0 ? (
                <div className="competition-grid">
                  {competitions.map((item) => (
                    <button
                      className="competition-card"
                      key={item.id}
                      onClick={() => chooseCompetition(item)}
                    >
                      <CompetitionArt id={item.id} />
                      <span className="competition-caption">
                        <span className="caption-content">
                          <strong>{item.name}</strong>
                          {loaded && (
                            <span>{t.teamCount(teamsFor(item).length)}</span>
                          )}
                        </span>
                        <span className="card-arrow" aria-hidden="true">
                          <i className="chevron" />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty">{t.emptyCatalog}</p>
              )
            ) : error ? (
              <Alert message={error} />
            ) : (
              <p className="empty" role="status">
                {t.loading}
              </p>
            )}
          </Welcome>
        ) : (
          <div className="page-heading">
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
            {page === "teams" && (
              <button className="primary" onClick={createTeam}>
                <span aria-hidden="true">＋</span> {t.create}
              </button>
            )}
            {page === "people" && (
              <button className="secondary" onClick={() => void openProfile()}>
                {t.editProfile}
              </button>
            )}
          </div>
        )}
        {page === "teams" && (
          <div className="view-tools">
            <select
              aria-label={t.filterCompetition}
              value={competition}
              onChange={(event) => {
                setCompetition(event.target.value);
                clearFeedback();
              }}
            >
              <option value="">{t.allCompetitions}</option>
              {competitions?.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {page === "people" && (
          <div className="view-tools">
            <select
              aria-label={t.filter}
              value={skill}
              onChange={(event) => setSkill(event.target.value as Skill | "")}
            >
              <option value="">{t.allSkills}</option>
              {(Object.keys(t.skillNames) as Skill[]).map((entry) => (
                <option key={entry} value={entry}>
                  {t.skillNames[entry]}
                </option>
              ))}
            </select>
            <select
              aria-label={t.filterCollege}
              value={collegeFilter}
              onChange={(event) => setCollegeFilter(event.target.value)}
            >
              <option value="">{t.allColleges}</option>
              {colleges.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        )}
        {page !== "welcome" && !person && !intent && <Alert message={error} />}
        {page !== "welcome" && notice && (
          <p className="notice" role="status">
            {t[notice]}
          </p>
        )}

        {page === "teams" && (
          <div className="results">
            {matchingTeams.map((entry) => (
              <article className="result-card" key={entry.id}>
                <div className="result-heading">
                  <h2>{entry.teamName}</h2>
                  <span className="badge">{t.openCount(entry.openings)}</span>
                </div>
                <p className="team-competition">{entry.competition}</p>
                <RecruitmentDetails recruitment={entry} />
                {entry.ownerId === me?.userId ? (
                  <span className="owned">{t.yourTeam}</span>
                ) : (
                  <div className="row-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (!me) {
                          setFailure(
                            new ApiError(
                              t.needPersona,
                              undefined,
                              "unauthorized",
                            ),
                          );
                          return;
                        }
                        void run(
                          () =>
                            api.createIntent({
                              kind: "apply",
                              recruitmentId: entry.id,
                            }),
                          (result) => setNotice(result.status),
                        );
                      }}
                    >
                      {t.apply}
                    </button>
                    <small>{t.share}</small>
                  </div>
                )}
              </article>
            ))}
            {!matchingTeams.length && !error && (
              <p className="empty">
                {loaded
                  ? competition
                    ? t.emptyMatches
                    : t.emptyTeams
                  : t.loading}
              </p>
            )}
          </div>
        )}

        {page === "people" && (
          <div className="results">
            {matchingPeople.map((entry) => (
              <article className="result-card profile-card" key={entry.userId}>
                <div className="result-heading">
                  <div className="person-name">
                    <span className="avatar" aria-hidden="true">
                      {Array.from(entry.nickname)[0]}
                    </span>
                    <h2>{entry.nickname}</h2>
                  </div>
                  {entry.userId !== me?.userId && (
                    <button
                      className="secondary"
                      onClick={() =>
                        void openDetail(
                          () => api.profile(entry.userId),
                          (detail) => {
                            setPerson(detail);
                            setInviteTeam("");
                          },
                        )
                      }
                    >
                      {t.card}
                    </button>
                  )}
                </div>
                <ProfileDetails profile={entry} />
              </article>
            ))}
            {!matchingPeople.length && !error && (
              <p className="empty">{loaded ? t.emptyPeople : t.loading}</p>
            )}
          </div>
        )}

        {page === "intents" &&
          (me ? (
            <div className="request-columns">
              {requestColumns.map(({ id, title, empty, items }) => (
                <section
                  key={id}
                  aria-labelledby={id}
                  className="request-column"
                >
                  <h2 id={id}>{title}</h2>
                  <div className="request-list">
                    {items.map((entry) => (
                      <button
                        className="request-row"
                        key={entry.id}
                        onClick={() =>
                          void openDetail(() => api.intent(entry.id), setIntent)
                        }
                      >
                        <span className="request-text">
                          <strong>{teamName(entry.recruitmentId)}</strong>
                          <span>
                            {[
                              entry.kind === "apply"
                                ? t.application
                                : t.invitation,
                              otherParty(entry),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {entry.canRespond ? (
                          <span className="status pending">
                            {t.actionRequired}
                          </span>
                        ) : (
                          status(entry)
                        )}
                        <span className="chevron" aria-hidden="true" />
                      </button>
                    ))}
                    {!items.length && (
                      <p className="empty">{loaded ? empty : t.loading}</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="empty">{t.needPersona}</p>
          ))}

        {page === "publish" && (
          <RecruitmentEditor
            competitions={competitions ?? []}
            initialCompetition={competition}
            busy={busy}
            fieldError={fieldError}
            onPublish={(draft) =>
              void run(
                () => api.createRecruitment(draft),
                (created) => {
                  setTeams((items) => [
                    created,
                    ...items.filter((item) => item.id !== created.id),
                  ]);
                  setCompetition(created.competition);
                  navigate("teams");
                  setNotice("published");
                },
              )
            }
          />
        )}

        {page === "profile" &&
          (profile ? (
            <ProfileEditor
              profile={profile}
              onChange={setProfile}
              fieldError={fieldError}
              skillError={fieldErrors.skills}
              busy={busy || preparingImages}
              onSave={() => {
                if (preparingImages) return;
                const customSkills = (profile.customSkills ?? [])
                  .map((skill) => skill.trim())
                  .filter(Boolean);
                if (!profile.skills.length && !customSkills.length) {
                  setFieldErrors({ skills: t.pickSkill });
                  return;
                }
                void run(
                  () =>
                    api.saveProfile({
                      ...profile,
                      customSkills,
                      evidence: proofs.map((item) =>
                        item.dataUrl
                          ? { image: item.dataUrl.split(",", 2)[1] }
                          : { id: item.id },
                      ),
                    }),
                  (savedProfile) => {
                    if (me && me.nickname !== savedProfile.nickname)
                      setMe({ ...me, nickname: savedProfile.nickname });
                    setNotice("saved");
                    setProofs(savedProfile.evidenceIds.map((id) => ({ id })));
                  },
                );
              }}
            >
              <fieldset className="proofs">
                <legend>{t.evidence}</legend>
                <div className="proof-grid">
                  {proofs.map((entry, index) => (
                    <div className="proof-item" key={entry.id}>
                      <EvidenceImage
                        entry={entry}
                        userId={me?.userId ?? ""}
                        label={t.evidenceLabel(index + 1)}
                      />
                      <button
                        type="button"
                        className="icon-button proof-remove"
                        aria-label={
                          t.removeImage + " " + t.evidenceLabel(index + 1)
                        }
                        disabled={busy}
                        onClick={() => {
                          setProofs((items) =>
                            items.filter((item) => item.id !== entry.id),
                          );
                          setImageProblem(null);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {proofs.length < EVIDENCE_COUNT && (
                    <label className="proof-add">
                      <span aria-hidden="true">＋</span>
                      {t.addImage}
                      <input
                        type="file"
                        multiple
                        accept={EVIDENCE_ACCEPT}
                        disabled={preparingImages || busy}
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          void addImages(files);
                        }}
                      />
                    </label>
                  )}
                </div>
                {preparingImages && (
                  <p role="status" className="consent">
                    {t.preparing}
                  </p>
                )}
                {imageProblem && (
                  <p role="alert" className="field-error">
                    {t[imageProblem]}
                  </p>
                )}
                {fieldError("evidence")}
              </fieldset>
            </ProfileEditor>
          ) : (
            !error && (
              <p className="empty" role="status">
                {t.loading}
              </p>
            )
          ))}
      </main>

      {person && (
        <Dialog
          title={person.nickname}
          closeLabel={t.close}
          close={closeDetail}
        >
          <Alert message={error} />
          <ProfileDetails profile={person} />
          {person.evidenceIds && person.evidenceIds.length > 0 && (
            <div className="proof-grid" role="group" aria-label={t.evidence}>
              {person.evidenceIds.map((id, index) => (
                <EvidenceImage
                  key={id}
                  entry={{ id }}
                  userId={person.userId}
                  label={t.evidenceLabel(index + 1)}
                />
              ))}
            </div>
          )}
          {ownTeams.length ? (
            <div className="dialog-section">
              <select
                aria-label={t.inviteTeam}
                value={inviteTeam}
                onChange={(event) => setInviteTeam(event.target.value)}
              >
                <option value="">{t.inviteTeam}</option>
                {ownTeams.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.teamName} · {entry.competition}
                  </option>
                ))}
              </select>
              <button
                className="primary"
                disabled={!inviteTeam || busy}
                onClick={() =>
                  void run(
                    () =>
                      api.createIntent({
                        kind: "invite",
                        recruitmentId: inviteTeam,
                        candidateId: person.userId,
                      }),
                    (result) => {
                      setPerson(null);
                      setNotice(result.status);
                    },
                  )
                }
              >
                {t.invite}
              </button>
              <small className="consent">{t.share}</small>
            </div>
          ) : (
            me && <p className="consent">{t.needTeam}</p>
          )}
        </Dialog>
      )}

      {intent && (
        <Dialog
          title={teamName(intent.recruitmentId)}
          closeLabel={t.close}
          close={closeDetail}
        >
          <Alert message={error} />
          <div className="request-meta">
            {status(intent)}
            <span>
              {[
                intent.kind === "apply" ? t.application : t.invitation,
                otherParty(intent),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {intent.status === "accepted" && intent.counterpartQq && (
            <div className="contact">
              <small>{t.otherContact}</small>
              <strong>{intent.counterpartQq}</strong>
            </div>
          )}
          {intent.canRespond && (
            <div className="dialog-section">
              <div className="dialog-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => api.respond(intent.id, "declined"),
                      setIntent,
                    )
                  }
                >
                  {t.decline}
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => api.respond(intent.id, "accepted"),
                      (accepted) => {
                        setIntent(accepted);
                        void openDetail(() => api.intent(intent.id), setIntent);
                      },
                    )
                  }
                >
                  {t.accept}
                </button>
              </div>
              <small className="consent">{t.share}</small>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
