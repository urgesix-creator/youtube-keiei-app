create extension if not exists pgcrypto;

create table if not exists public.content_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  video_id text not null,
  source_url text not null,
  source_title text,
  generated_title text,
  duration_seconds integer,
  status text not null default 'queued',
  output_mode text not null default 'all',
  selected_outputs jsonb not null default '[]'::jsonb,
  transcript_source text,
  transcript_excerpt text,
  drive_file_id text,
  drive_url text,
  app_result_url text,
  tags text[],
  error_code text,
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0 and retry_count <= 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint content_jobs_user_video_unique unique (user_id, video_id),
  constraint content_jobs_status_check check (
    status in (
      'queued',
      'chrome_worker_processing',
      'chrome_retrying',
      'transcript_extracted',
      'summarizing',
      'generating',
      'saving_drive',
      'done',
      'manual_transcript_required',
      'chrome_automation_failed',
      'chrome_worker_offline',
      'long_video_review_required',
      'daily_limit_reached',
      'failed'
    )
  ),
  constraint content_jobs_output_mode_check check (output_mode in ('all', 'individual'))
);

create table if not exists public.content_outputs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.content_jobs(id) on delete cascade,
  report text,
  x_post text,
  threads_posts jsonb,
  note_article text,
  instagram_carousel jsonb,
  instagram_caption text,
  instagram_reel_script jsonb,
  handoff_notes jsonb,
  hashtags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_outputs_job_unique unique (job_id)
);

create table if not exists public.worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null unique,
  machine_name text,
  last_seen_at timestamptz not null default now(),
  current_job_id uuid references public.content_jobs(id) on delete set null,
  status text not null default 'idle',
  updated_at timestamptz not null default now(),
  constraint worker_heartbeats_status_check check (status in ('idle', 'processing', 'error'))
);

create table if not exists public.slack_notifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.content_jobs(id) on delete cascade,
  notification_type text not null,
  slack_channel_id text,
  sent_at timestamptz not null default now(),
  message_ts text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists content_jobs_user_created_idx
  on public.content_jobs (user_id, created_at desc);

create index if not exists content_jobs_status_created_idx
  on public.content_jobs (status, created_at asc);

create index if not exists content_jobs_search_idx
  on public.content_jobs using gin (
    to_tsvector(
      'simple',
      coalesce(generated_title, '') || ' ' ||
      coalesce(source_title, '') || ' ' ||
      coalesce(source_url, '') || ' ' ||
      coalesce(video_id, '')
    )
  );

create index if not exists worker_heartbeats_current_job_id_idx
  on public.worker_heartbeats (current_job_id);

create index if not exists slack_notifications_job_id_idx
  on public.slack_notifications (job_id);

alter table public.content_jobs enable row level security;
alter table public.content_outputs enable row level security;
alter table public.worker_heartbeats enable row level security;
alter table public.slack_notifications enable row level security;

drop policy if exists "content_jobs_select_own" on public.content_jobs;
create policy "content_jobs_select_own"
  on public.content_jobs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "content_jobs_insert_own" on public.content_jobs;
create policy "content_jobs_insert_own"
  on public.content_jobs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "content_jobs_update_own" on public.content_jobs;
create policy "content_jobs_update_own"
  on public.content_jobs
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "content_outputs_select_own_job" on public.content_outputs;
create policy "content_outputs_select_own_job"
  on public.content_outputs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.content_jobs
      where content_jobs.id = content_outputs.job_id
        and content_jobs.user_id = (select auth.uid())
    )
  );

drop policy if exists "content_outputs_insert_own_job" on public.content_outputs;
create policy "content_outputs_insert_own_job"
  on public.content_outputs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.content_jobs
      where content_jobs.id = content_outputs.job_id
        and content_jobs.user_id = (select auth.uid())
    )
  );

drop policy if exists "content_outputs_update_own_job" on public.content_outputs;
create policy "content_outputs_update_own_job"
  on public.content_outputs
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.content_jobs
      where content_jobs.id = content_outputs.job_id
        and content_jobs.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.content_jobs
      where content_jobs.id = content_outputs.job_id
        and content_jobs.user_id = (select auth.uid())
    )
  );

-- worker_heartbeats と slack_notifications はサーバー側 service_role 経由で扱う。
-- 公開クライアントからの直接読み書きは許可しない。
drop policy if exists "worker_heartbeats_no_client_access" on public.worker_heartbeats;
create policy "worker_heartbeats_no_client_access"
  on public.worker_heartbeats
  for select
  to authenticated
  using (false);

drop policy if exists "slack_notifications_no_client_access" on public.slack_notifications;
create policy "slack_notifications_no_client_access"
  on public.slack_notifications
  for select
  to authenticated
  using (false);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.content_jobs to authenticated;
grant select, insert, update, delete on public.content_outputs to authenticated;
grant select on public.worker_heartbeats to authenticated;
grant select on public.slack_notifications to authenticated;
