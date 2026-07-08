"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Clipboard,
  ExternalLink,
  History,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  Search,
  Send,
  Upload,
  UserRound,
} from "lucide-react";
import type { ContentJob, JobStatus, JobWithOutput, SelectedOutput } from "@/lib/types";

type View = "new" | "history" | "result" | "manual";
type ApiState = "idle" | "loading" | "error";
type LoginCredentials = {
  loginId: string;
  password: string;
};

const credentialsStorageKey = "youtube-keiei-login-credentials";
const legacyAccessCodeStorageKey = "youtube-keiei-access-code";

const outputOptions: Array<{ id: SelectedOutput; label: string }> = [
  { id: "report", label: "経営実践レポート" },
  { id: "x", label: "X" },
  { id: "threads", label: "Threads" },
  { id: "note", label: "note" },
  { id: "instagram_carousel", label: "カルーセル" },
  { id: "instagram_caption", label: "キャプション" },
  { id: "instagram_reel", label: "リール台本" },
  { id: "handoff", label: "申し送り" },
];

const statusLabels: Record<JobStatus, string> = {
  queued: "処理待ち",
  chrome_worker_processing: "Chrome処理中",
  chrome_retrying: "Chrome再試行中",
  transcript_extracted: "文字起こし取得済み",
  summarizing: "要約中",
  generating: "生成中",
  saving_drive: "Drive保存中",
  done: "完了",
  manual_transcript_required: "手動文字起こし待ち",
  chrome_automation_failed: "Chrome失敗",
  chrome_worker_offline: "ワーカー停止疑い",
  long_video_review_required: "長尺確認待ち",
  daily_limit_reached: "日次上限",
  failed: "失敗",
};

export function YoutubeApp() {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    loginId: "",
    password: "",
  });
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [view, setView] = useState<View>("new");
  const [jobs, setJobs] = useState<ContentJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobWithOutput | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [outputMode, setOutputMode] = useState<"all" | "individual">("all");
  const [selectedOutputs, setSelectedOutputs] = useState<SelectedOutput[]>(["report"]);
  const [manualTranscript, setManualTranscript] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [apiState, setApiState] = useState<ApiState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.removeItem(legacyAccessCodeStorageKey);

    const savedCredentials = window.localStorage.getItem(credentialsStorageKey);
    if (!savedCredentials) return;

    try {
      const parsed = JSON.parse(savedCredentials) as Partial<LoginCredentials>;
      if (parsed.loginId && parsed.password) {
        window.queueMicrotask(() => {
          setCredentials({
            loginId: parsed.loginId ?? "",
            password: parsed.password ?? "",
          });
          setIsUnlocked(true);
        });
      }
    } catch {
      window.localStorage.removeItem(credentialsStorageKey);
    }
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    void loadJobs();

    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    if (jobId) {
      void openJob(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked]);

  async function signIn() {
    const normalizedLoginId = credentials.loginId.trim();
    const password = credentials.password;
    if (!normalizedLoginId || !password) {
      setMessage("IDとパスワードを入力してください。");
      return;
    }

    setApiState("loading");
    try {
      const normalizedCredentials = {
        loginId: normalizedLoginId,
        password,
      };
      const response = await fetch("/api/auth/check", {
        method: "POST",
        headers: buildAuthHeaders(normalizedCredentials),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "ログインに失敗しました。");
      }

      window.localStorage.setItem(credentialsStorageKey, JSON.stringify(normalizedCredentials));
      setCredentials(normalizedCredentials);
      setIsUnlocked(true);
      setMessage(null);
      setApiState("idle");
    } catch (error) {
      setApiState("error");
      setMessage(error instanceof Error ? error.message : "ログインに失敗しました。");
    }
  }

  function signOut() {
    window.localStorage.removeItem(credentialsStorageKey);
    window.localStorage.removeItem(legacyAccessCodeStorageKey);
    setIsUnlocked(false);
    setCredentials({
      loginId: "",
      password: "",
    });
    setSelectedJob(null);
    setJobs([]);
  }

  async function apiFetch(path: string, init: RequestInit = {}) {
    if (!credentials.loginId || !credentials.password) {
      throw new Error("ログイン情報がありません。");
    }

    const response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...buildAuthHeaders(credentials),
        ...init.headers,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message ?? "APIエラーです。");
    }

    return data;
  }

  async function loadJobs() {
    setApiState("loading");
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiFetch(`/api/jobs?${params.toString()}`);
      setJobs(data.jobs);
      setApiState("idle");
    } catch (error) {
      setApiState("error");
      setMessage(error instanceof Error ? error.message : "履歴取得に失敗しました。");
    }
  }

  async function submitJob() {
    setApiState("loading");
    setMessage(null);
    try {
      const data = await apiFetch("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          sourceUrl,
          outputMode,
          selectedOutputs: outputMode === "all" ? [] : selectedOutputs,
        }),
      });
      setSourceUrl("");
      setSelectedJob({ ...data.job, output: null });
      setView(data.job.status === "done" ? "result" : "history");
      await loadJobs();
      setMessage(data.duplicate ? "既に処理済みの動画です。履歴を表示しました。" : "ジョブを作成しました。");
      setApiState("idle");
    } catch (error) {
      setApiState("error");
      setMessage(error instanceof Error ? error.message : "ジョブ作成に失敗しました。");
    }
  }

  async function openJob(jobId: string) {
    setApiState("loading");
    try {
      const data = await apiFetch(`/api/jobs/${jobId}`);
      setSelectedJob(data.job);
      setView(data.job.status === "done" ? "result" : "manual");
      setApiState("idle");
    } catch (error) {
      setApiState("error");
      setMessage(error instanceof Error ? error.message : "ジョブ取得に失敗しました。");
    }
  }

  async function approveLongVideo(jobId: string) {
    setApiState("loading");
    try {
      const data = await apiFetch(`/api/jobs/${jobId}/approve-long-video`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelectedJob({ ...data.job, output: selectedJob?.output ?? null });
      await loadJobs();
      setApiState("idle");
      setMessage("長尺動画の処理を許可しました。");
    } catch (error) {
      setApiState("error");
      setMessage(error instanceof Error ? error.message : "承認に失敗しました。");
    }
  }

  async function resumeWithManualTranscript() {
    if (!selectedJob) return;
    setApiState("loading");
    setMessage(null);
    try {
      const data = await apiFetch(`/api/jobs/${selectedJob.id}/manual-transcript`, {
        method: "POST",
        body: JSON.stringify({ transcriptText: manualTranscript }),
      });
      setSelectedJob(data.job);
      setManualTranscript("");
      setView("result");
      await loadJobs();
      setApiState("idle");
      setMessage("手動文字起こしから生成を完了しました。");
    } catch (error) {
      setApiState("error");
      setMessage(error instanceof Error ? error.message : "再開に失敗しました。");
    }
  }

  async function copyText(text: string | null | undefined) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setMessage("コピーしました。");
  }

  if (!isUnlocked) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-md flex-col justify-center">
          <div className="border border-stone-300 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-950">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              自分専用
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              YouTube経営実践アプリ
            </h1>
            <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-300">
              IDとパスワードを入れると、YouTubeリンクから文字起こし取得、要約、媒体別原稿生成、Drive保存まで実行できます。
            </p>
            <label className="mt-6 block text-sm font-medium" htmlFor="login-id">
              ID
            </label>
            <input
              id="login-id"
              value={credentials.loginId}
              onChange={(event) =>
                setCredentials((current) => ({
                  ...current,
                  loginId: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void signIn();
              }}
              type="text"
              autoComplete="username"
              className="mt-2 h-12 w-full border border-stone-300 bg-white px-3 text-base outline-none focus:border-teal-600 dark:border-stone-700 dark:bg-stone-900"
            />
            <label className="mt-4 block text-sm font-medium" htmlFor="login-password">
              パスワード
            </label>
            <input
              id="login-password"
              value={credentials.password}
              onChange={(event) =>
                setCredentials((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void signIn();
              }}
              type="password"
              autoComplete="current-password"
              className="mt-2 h-12 w-full border border-stone-300 bg-white px-3 text-base outline-none focus:border-teal-600 dark:border-stone-700 dark:bg-stone-900"
            />
            {message ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{message}</p> : null}
            <button
              type="button"
              onClick={() => void signIn()}
              disabled={apiState === "loading"}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-700 dark:bg-teal-400 dark:text-stone-950 dark:hover:bg-teal-300"
            >
              {apiState === "loading" ? <Loader2 className="animate-spin" size={18} /> : <UserRound size={18} />}
              開く
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-3 border-b border-stone-300 pb-4 dark:border-stone-700 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              YouTube to Practice Pack
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              YouTube経営実践アプリ
            </h1>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-stone-600 dark:text-stone-300">
            <span className="truncate">自分専用モード</span>
            <button
              type="button"
              onClick={signOut}
              className="flex h-9 items-center gap-1 border border-stone-300 px-3 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
            >
              <LogOut size={16} />
              ログアウト
            </button>
          </div>
        </header>

        <nav className="mt-4 grid grid-cols-4 gap-2 text-sm">
          <NavButton active={view === "new"} onClick={() => setView("new")} label="新規" icon={<Play size={16} />} />
          <NavButton active={view === "history"} onClick={() => setView("history")} label="履歴" icon={<History size={16} />} />
          <NavButton active={view === "result"} onClick={() => setView("result")} label="完成" icon={<Check size={16} />} />
          <NavButton active={view === "manual"} onClick={() => setView("manual")} label="手動" icon={<Upload size={16} />} />
        </nav>

        {message ? (
          <div className="mt-4 flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <AlertCircle className="mt-0.5 shrink-0" size={16} />
            <p>{message}</p>
          </div>
        ) : null}

        {view === "new" ? (
          <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="border border-stone-300 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-950">
              <h2 className="text-lg font-semibold">URL入力</h2>
              <label className="mt-4 block text-sm font-medium" htmlFor="source-url">
                YouTube URL
              </label>
              <input
                id="source-url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="mt-2 h-12 w-full border border-stone-300 bg-white px-3 text-base outline-none focus:border-teal-600 dark:border-stone-700 dark:bg-stone-900"
              />

              <div className="mt-5 grid grid-cols-2 gap-2">
                <ModeButton active={outputMode === "all"} onClick={() => setOutputMode("all")} label="一括出力" />
                <ModeButton active={outputMode === "individual"} onClick={() => setOutputMode("individual")} label="個別出力" />
              </div>

              {outputMode === "individual" ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {outputOptions.map((option) => (
                    <label
                      key={option.id}
                      className="flex min-h-11 items-center gap-2 border border-stone-300 px-3 text-sm dark:border-stone-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOutputs.includes(option.id)}
                        onChange={(event) => {
                          setSelectedOutputs((current) =>
                            event.target.checked
                              ? [...current, option.id]
                              : current.filter((id) => id !== option.id),
                          );
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                disabled={!sourceUrl || apiState === "loading"}
                onClick={submitJob}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {apiState === "loading" ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                処理を開始
              </button>
            </div>

            <div className="border border-stone-300 bg-stone-50 p-4 text-sm leading-6 dark:border-stone-700 dark:bg-stone-900">
              <h2 className="text-lg font-semibold">処理の流れ</h2>
              <ol className="mt-4 space-y-2">
                <li>1. Supabaseにジョブ作成</li>
                <li>2. MacワーカーがChrome専用プロファイルを起動</li>
                <li>3. YouTube Summaryから文字起こし/翻訳を取得</li>
                <li>4. OpenAIで一括または個別生成</li>
                <li>5. Markdownをローカル/Obsidianに保存</li>
                <li>6. Slack DMに完成リンク送信</li>
              </ol>
            </div>
          </section>
        ) : null}

        {view === "history" ? (
          <section className="mt-5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-stone-500" size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="生成タイトル、元動画タイトル、URL、動画IDで検索"
                  className="h-11 w-full border border-stone-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-teal-600 dark:border-stone-700 dark:bg-stone-950"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-11 border border-stone-300 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-950"
              >
                <option value="">すべて</option>
                {Object.entries(statusLabels).map(([status, label]) => (
                  <option key={status} value={status}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={loadJobs}
                className="flex h-11 items-center justify-center gap-2 border border-stone-300 px-4 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
              >
                <RefreshCw size={16} />
                更新
              </button>
            </div>

            <div className="mt-4 divide-y divide-stone-200 border border-stone-300 bg-white dark:divide-stone-800 dark:border-stone-700 dark:bg-stone-950">
              {jobs.length === 0 ? (
                <p className="p-4 text-sm text-stone-500">履歴はまだありません。</p>
              ) : (
                jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => openJob(job.id)}
                    className="block w-full p-4 text-left hover:bg-stone-50 dark:hover:bg-stone-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {job.generated_title ?? job.source_title ?? job.video_id}
                        </p>
                        <p className="mt-1 truncate text-xs text-stone-500">{job.source_url}</p>
                      </div>
                      <span className="shrink-0 border border-stone-300 px-2 py-1 text-xs dark:border-stone-700">
                        {statusLabels[job.status]}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : null}

        {view === "result" ? (
          <ResultView job={selectedJob} onCopy={copyText} />
        ) : null}

        {view === "manual" ? (
          <section className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="border border-stone-300 bg-white p-4 dark:border-stone-700 dark:bg-stone-950">
              <h2 className="text-lg font-semibold">対象動画</h2>
              {selectedJob ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="font-semibold">{selectedJob.generated_title ?? selectedJob.source_title ?? selectedJob.video_id}</p>
                  <p className="break-all text-stone-500">{selectedJob.source_url}</p>
                  <p>状態: {statusLabels[selectedJob.status]}</p>
                  {selectedJob.status === "long_video_review_required" ? (
                    <button
                      type="button"
                      onClick={() => approveLongVideo(selectedJob.id)}
                      className="mt-3 h-10 w-full bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"
                    >
                      この長尺動画を処理する
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-stone-500">履歴から手動対応対象を選んでください。</p>
              )}
            </div>
            <div className="border border-stone-300 bg-white p-4 dark:border-stone-700 dark:bg-stone-950">
              <h2 className="text-lg font-semibold">手動文字起こし貼り付け</h2>
              <textarea
                value={manualTranscript}
                onChange={(event) => setManualTranscript(event.target.value)}
                placeholder="YouTube Summaryや手動取得した文字起こし全文を貼り付け"
                className="mt-3 min-h-80 w-full border border-stone-300 bg-white p-3 text-sm leading-6 outline-none focus:border-teal-600 dark:border-stone-700 dark:bg-stone-900"
              />
              <button
                type="button"
                disabled={!selectedJob || manualTranscript.length < 100 || apiState === "loading"}
                onClick={resumeWithManualTranscript}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {apiState === "loading" ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                元の出力モードで再開
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function buildAuthHeaders(credentials: LoginCredentials): Record<string, string> {
  return {
    "x-app-login-id": credentials.loginId.trim(),
    "x-app-login-password": credentials.password,
  };
}

function NavButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center justify-center gap-1 border px-2 font-semibold ${
        active
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-stone-300 bg-white hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-950 dark:hover:bg-stone-900"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 border px-3 text-sm font-semibold ${
        active
          ? "border-teal-700 bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100"
          : "border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-950"
      }`}
    >
      {label}
    </button>
  );
}

function ResultView({
  job,
  onCopy,
}: {
  job: JobWithOutput | null;
  onCopy: (text: string | null | undefined) => void;
}) {
  if (!job) {
    return (
      <section className="mt-5 border border-stone-300 bg-white p-4 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-950">
        履歴から完了済みの動画を選んでください。
      </section>
    );
  }

  if (job.status !== "done" || !job.output) {
    return (
      <section className="mt-5 border border-stone-300 bg-white p-4 dark:border-stone-700 dark:bg-stone-950">
        <h2 className="text-lg font-semibold">{job.generated_title ?? job.source_title ?? job.video_id}</h2>
        <p className="mt-2 text-sm">現在の状態: {statusLabels[job.status]}</p>
      </section>
    );
  }

  const allText = [
    job.output.report,
    job.output.x_post,
    ...(job.output.threads_posts ?? []),
    job.output.note_article,
    ...(job.output.instagram_carousel ?? []).map((slide) => `${slide.title}\n${slide.body}`),
    job.output.instagram_caption,
    job.output.instagram_reel_script
      ? [
          job.output.instagram_reel_script.hook,
          ...job.output.instagram_reel_script.telops,
          ...job.output.instagram_reel_script.narration,
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  return (
    <section className="mt-5 space-y-4">
      <div className="border border-stone-300 bg-white p-4 dark:border-stone-700 dark:bg-stone-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{job.generated_title}</h2>
            <p className="mt-1 break-all text-xs text-stone-500">{job.source_url}</p>
          </div>
          <div className="flex gap-2">
            {job.drive_url ? (
              <a
                href={job.drive_url}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center gap-1 border border-stone-300 px-3 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
              >
                <ExternalLink size={16} />
                Drive
              </a>
            ) : null}
            <CopyButton label="全体" onClick={() => onCopy(allText)} />
          </div>
        </div>
      </div>

      <OutputBlock title="経営実践レポート" text={job.output.report} onCopy={onCopy} />
      <OutputBlock title="X投稿" text={job.output.x_post} onCopy={onCopy} />
      {(job.output.threads_posts ?? []).map((post, index) => (
        <OutputBlock key={index} title={`Threads ${index + 1}`} text={post} onCopy={onCopy} />
      ))}
      <OutputBlock title="note記事" text={job.output.note_article} onCopy={onCopy} />
      {(job.output.instagram_carousel ?? []).map((slide) => (
        <OutputBlock key={slide.index} title={`Instagram ${slide.index}枚目: ${slide.title}`} text={slide.body} onCopy={onCopy} />
      ))}
      <OutputBlock title="Instagramキャプション" text={job.output.instagram_caption} onCopy={onCopy} />
      <OutputBlock
        title="Instagramリール台本"
        text={
          job.output.instagram_reel_script
            ? [
                `冒頭3秒: ${job.output.instagram_reel_script.hook}`,
                "テロップ:",
                ...job.output.instagram_reel_script.telops.map((line) => `- ${line}`),
                "ナレーション:",
                ...job.output.instagram_reel_script.narration.map((line) => `- ${line}`),
              ].join("\n")
            : ""
        }
        onCopy={onCopy}
      />
      <OutputBlock
        title="発信者への申し送り"
        text={(job.output.handoff_notes ?? []).map((note) => `【${note.tag}】${note.text}`).join("\n")}
        onCopy={onCopy}
      />
    </section>
  );
}

function OutputBlock({
  title,
  text,
  onCopy,
}: {
  title: string;
  text: string | null | undefined;
  onCopy: (text: string | null | undefined) => void;
}) {
  return (
    <div className="border border-stone-300 bg-white p-4 dark:border-stone-700 dark:bg-stone-950">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <CopyButton label="コピー" onClick={() => onCopy(text)} />
      </div>
      <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700 dark:text-stone-200">
        {text || "未生成"}
      </pre>
    </div>
  );
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1 border border-stone-300 px-3 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
    >
      <Clipboard size={15} />
      {label}
    </button>
  );
}
