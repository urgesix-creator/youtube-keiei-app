import { AppError } from "@/lib/errors";
import { getAppBaseUrl } from "@/lib/env";
import { uploadMarkdownToDrive } from "@/lib/google-drive";
import { buildMarkdown, buildMarkdownFileName } from "@/lib/markdown";
import { generateContentPackage } from "@/lib/openai";
import { sendSlackDm } from "@/lib/slack";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  ContentJob,
  ContentOutput,
  GeneratedOutputs,
  JobStatus,
  JobWithOutput,
  OutputMode,
  SelectedOutput,
  TranscriptSource,
} from "@/lib/types";
import { fetchYouTubeMetadata } from "@/lib/youtube";

const DAILY_LIMIT = 10;
const LONG_VIDEO_SECONDS = 60 * 60;
const MAX_CHROME_RETRIES = 2;

export async function createJob(input: {
  userId: string;
  sourceUrl: string;
  outputMode: OutputMode;
  selectedOutputs: SelectedOutput[];
}): Promise<{ job: ContentJob; duplicate: boolean }> {
  const supabase = getSupabaseAdmin();
  const metadata = await fetchYouTubeMetadata(input.sourceUrl);

  const { data: existing, error: existingError } = await supabase
    .from("content_jobs")
    .select("*")
    .eq("user_id", input.userId)
    .eq("video_id", metadata.videoId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    return { job: existing as ContentJob, duplicate: true };
  }

  const dailyCount = await countTodayJobs(input.userId);
  let status: JobStatus = "queued";
  if (dailyCount >= DAILY_LIMIT) {
    status = "daily_limit_reached";
  } else if (metadata.durationSeconds != null && metadata.durationSeconds > LONG_VIDEO_SECONDS) {
    status = "long_video_review_required";
  }

  const { data, error } = await supabase
    .from("content_jobs")
    .insert({
      user_id: input.userId,
      video_id: metadata.videoId,
      source_url: input.sourceUrl,
      source_title: metadata.sourceTitle,
      duration_seconds: metadata.durationSeconds,
      status,
      output_mode: input.outputMode,
      selected_outputs: input.selectedOutputs,
      retry_count: 0,
    })
    .select("*")
    .single();

  if (error) throw error;

  if (status === "daily_limit_reached") {
    await sendSlackDm({
      jobId: data.id,
      type: "daily_limit",
      text: `【注意】日次上限に到達しました\n\n動画URL:\n${input.sourceUrl}\n\n対応:\n翌日以降に処理するか、アプリから追加処理を許可してください。`,
    });
  }

  if (status === "long_video_review_required") {
    await sendSlackDm({
      jobId: data.id,
      type: "long_video",
      text: `【要確認】60分を超える動画です\n\n動画URL:\n${input.sourceUrl}\n動画時間:\n${metadata.durationSeconds}秒\n\n対応:\nアプリで概算コストと処理時間を確認し、処理する場合は承認してください。`,
    });
  }

  return { job: data as ContentJob, duplicate: false };
}

export async function listJobs(input: {
  userId: string;
  query?: string | null;
  status?: string | null;
}): Promise<ContentJob[]> {
  let request = getSupabaseAdmin()
    .from("content_jobs")
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (input.status) {
    request = request.eq("status", input.status);
  }

  if (input.query) {
    const q = input.query.replace(/[%_]/g, "");
    request = request.or(
      `generated_title.ilike.%${q}%,source_title.ilike.%${q}%,source_url.ilike.%${q}%,video_id.ilike.%${q}%`,
    );
  }

  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as ContentJob[];
}

export async function getJobForUser(jobId: string, userId: string): Promise<JobWithOutput> {
  const { data: job, error } = await getSupabaseAdmin()
    .from("content_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (error || !job) {
    throw new AppError("not_found", "ジョブが見つかりません。", 404);
  }

  const output = await getOutput(jobId);
  return { ...(job as ContentJob), output };
}

export async function approveLongVideo(jobId: string, userId: string): Promise<ContentJob> {
  const job = await getJobForUser(jobId, userId);
  if (job.status !== "long_video_review_required") {
    throw new AppError("invalid_status", "長尺確認待ちのジョブではありません。", 400);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("content_jobs")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as ContentJob;
}

export async function claimNextWorkerJob(): Promise<ContentJob | null> {
  const supabase = getSupabaseAdmin();
  const { data: job, error } = await supabase
    .from("content_jobs")
    .select("*")
    .in("status", ["queued", "chrome_retrying"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!job) return null;

  const { data: updated, error: updateError } = await supabase
    .from("content_jobs")
    .update({
      status: "chrome_worker_processing",
      error_code: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .in("status", ["queued", "chrome_retrying"])
    .select("*")
    .single();

  if (updateError) throw updateError;
  return updated as ContentJob;
}

export async function completeJobFromTranscript(input: {
  jobId: string;
  transcriptText: string;
  transcriptSource: TranscriptSource;
  sourceTitle?: string | null;
  durationSeconds?: number | null;
}): Promise<JobWithOutput> {
  const supabase = getSupabaseAdmin();

  const { data: jobData, error: jobError } = await supabase
    .from("content_jobs")
    .select("*")
    .eq("id", input.jobId)
    .single();

  if (jobError || !jobData) {
    throw new AppError("not_found", "ジョブが見つかりません。", 404);
  }

  let job = jobData as ContentJob;
  const transcriptExcerpt = input.transcriptText.slice(0, 1000);

  await updateJobStatus(job.id, "summarizing", {
    transcript_source: input.transcriptSource,
    transcript_excerpt: transcriptExcerpt,
    source_title: input.sourceTitle ?? job.source_title,
    duration_seconds: input.durationSeconds ?? job.duration_seconds,
  });

  const outputs = await generateContentPackage({
    transcriptText: input.transcriptText,
    sourceTitle: input.sourceTitle ?? job.source_title,
    sourceUrl: job.source_url,
    selectedOutputs: job.selected_outputs ?? [],
    outputMode: job.output_mode,
  });

  await updateJobStatus(job.id, "saving_drive", {
    generated_title: outputs.generatedTitle,
    tags: outputs.hashtags,
  });

  const freshJob = await getJobById(job.id);
  job = { ...freshJob, generated_title: outputs.generatedTitle, tags: outputs.hashtags };
  const markdown = buildMarkdown({
    job,
    outputs,
    transcriptText: input.transcriptText,
    transcriptSource: input.transcriptSource,
  });

  const filename = buildMarkdownFileName(outputs.generatedTitle, job.video_id);
  const appResultUrl = `${getAppBaseUrl()}/?job=${job.id}`;
  const driveResult = await uploadMarkdownToDrive({
    filename,
    markdown,
    fallbackUrl: appResultUrl,
  });

  const output = await upsertOutputs(job.id, outputs);
  const { data: updatedJob, error: updateError } = await supabase
    .from("content_jobs")
    .update({
      status: "done",
      generated_title: outputs.generatedTitle,
      drive_file_id: driveResult.fileId,
      drive_url: driveResult.webViewLink,
      app_result_url: appResultUrl,
      tags: outputs.hashtags,
      error_code: null,
      error_message: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  await sendSlackDm({
    jobId: job.id,
    type: "completed",
    text: `【完了】YouTubeコンテンツ化が完了しました\n\n生成タイトル:\n${outputs.generatedTitle}\n\n動画URL:\n${job.source_url}\n\nアプリで開く:\n${appResultUrl}\n\nGoogle Driveで開く:\n${driveResult.webViewLink}`,
  });

  return { ...(updatedJob as ContentJob), output };
}

export async function recordChromeFailure(input: {
  jobId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<ContentJob> {
  const job = await getJobById(input.jobId);
  const nextRetryCount = job.retry_count + 1;
  const shouldRetry = nextRetryCount <= MAX_CHROME_RETRIES;
  const status: JobStatus = shouldRetry ? "chrome_retrying" : "chrome_automation_failed";

  const { data, error } = await getSupabaseAdmin()
    .from("content_jobs")
    .update({
      status,
      retry_count: nextRetryCount,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId)
    .select("*")
    .single();

  if (error) throw error;

  if (!shouldRetry) {
    await sendSlackDm({
      jobId: input.jobId,
      type: "manual_required",
      text: `【要確認】YouTubeの文字起こし取得に失敗しました\n\n動画URL:\n${job.source_url}\n動画ID:\n${job.video_id}\n失敗理由:\n${input.errorMessage}\n\n対応:\n手動で文字起こしを取得し、アプリの「手動文字起こし貼り付け」から再開してください。`,
    });
  }

  return data as ContentJob;
}

export async function updateWorkerHeartbeat(input: {
  workerName: string;
  machineName: string | null;
  status: "idle" | "processing" | "error";
  currentJobId: string | null;
}) {
  const { error } = await getSupabaseAdmin().from("worker_heartbeats").upsert(
    {
      worker_name: input.workerName,
      machine_name: input.machineName,
      status: input.status,
      current_job_id: input.currentJobId,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "worker_name" },
  );

  if (error) throw error;
}

async function countTodayJobs(userId: string): Promise<number> {
  const [start, end] = getTokyoDayRange();
  const { count, error } = await getSupabaseAdmin()
    .from("content_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .not("status", "in", "(failed,chrome_automation_failed,manual_transcript_required)");

  if (error) throw error;
  return count ?? 0;
}

function getTokyoDayRange(): [Date, Date] {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);
  const start = new Date(`${today}T00:00:00+09:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return [start, end];
}

async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  patch: Record<string, unknown> = {},
) {
  const { error } = await getSupabaseAdmin()
    .from("content_jobs")
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq("id", jobId);

  if (error) throw error;
}

async function getJobById(jobId: string): Promise<ContentJob> {
  const { data, error } = await getSupabaseAdmin()
    .from("content_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !data) throw new AppError("not_found", "ジョブが見つかりません。", 404);
  return data as ContentJob;
}

async function getOutput(jobId: string): Promise<ContentOutput | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("content_outputs")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) throw error;
  return (data as ContentOutput | null) ?? null;
}

async function upsertOutputs(jobId: string, outputs: GeneratedOutputs): Promise<ContentOutput> {
  const { data, error } = await getSupabaseAdmin()
    .from("content_outputs")
    .upsert(
      {
        job_id: jobId,
        report: outputs.report,
        x_post: outputs.xPost,
        threads_posts: outputs.threadsPosts,
        note_article: outputs.noteArticle,
        instagram_carousel: outputs.instagramCarousel,
        instagram_caption: outputs.instagramCaption,
        instagram_reel_script: outputs.instagramReelScript,
        handoff_notes: outputs.handoffNotes,
        hashtags: outputs.hashtags,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as ContentOutput;
}
