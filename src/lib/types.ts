export type JobStatus =
  | "queued"
  | "chrome_worker_processing"
  | "chrome_retrying"
  | "transcript_extracted"
  | "summarizing"
  | "generating"
  | "saving_drive"
  | "done"
  | "manual_transcript_required"
  | "chrome_automation_failed"
  | "chrome_worker_offline"
  | "long_video_review_required"
  | "daily_limit_reached"
  | "failed";

export type OutputMode = "all" | "individual";

export type TranscriptSource =
  | "youtube_summary_chrome"
  | "manual_transcript"
  | "fallback_tool";

export type SelectedOutput =
  | "report"
  | "x"
  | "threads"
  | "note"
  | "instagram_carousel"
  | "instagram_caption"
  | "instagram_reel"
  | "handoff";

export type HandoffTag = "注意" | "要確認" | "補足" | "憶測";

export type HandoffNote = {
  tag: HandoffTag;
  text: string;
};

export type InstagramCarouselSlide = {
  index: number;
  role: "cover" | "body" | "summary";
  title: string;
  body: string;
};

export type InstagramReelScript = {
  hook: string;
  telops: string[];
  narration: string[];
};

export type GeneratedOutputs = {
  generatedTitle: string;
  report: string;
  xPost: string;
  threadsPosts: string[];
  noteArticle: string;
  instagramCarousel: InstagramCarouselSlide[];
  instagramCaption: string;
  instagramReelScript: InstagramReelScript;
  handoffNotes: HandoffNote[];
  hashtags: string[];
};

export type ContentJob = {
  id: string;
  user_id: string;
  video_id: string;
  source_url: string;
  source_title: string | null;
  generated_title: string | null;
  duration_seconds: number | null;
  status: JobStatus;
  output_mode: OutputMode;
  selected_outputs: SelectedOutput[];
  transcript_source: TranscriptSource | null;
  transcript_excerpt: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  app_result_url: string | null;
  tags: string[] | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ContentOutput = {
  id: string;
  job_id: string;
  report: string | null;
  x_post: string | null;
  threads_posts: string[] | null;
  note_article: string | null;
  instagram_carousel: InstagramCarouselSlide[] | null;
  instagram_caption: string | null;
  instagram_reel_script: InstagramReelScript | null;
  handoff_notes: HandoffNote[] | null;
  hashtags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type JobWithOutput = ContentJob & {
  output: ContentOutput | null;
};
