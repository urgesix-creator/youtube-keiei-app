import { WebClient } from "@slack/web-api";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";

let slackClient: WebClient | null = null;

function getSlackClient(): WebClient {
  if (!slackClient) {
    slackClient = new WebClient(getRequiredEnv("SLACK_BOT_TOKEN"));
  }
  return slackClient;
}

export async function sendSlackDm(input: {
  jobId?: string;
  type: "completed" | "manual_required" | "worker_offline" | "daily_limit" | "long_video";
  text: string;
  blocks?: unknown[];
}): Promise<void> {
  if (!getOptionalEnv("SLACK_BOT_TOKEN") || !getOptionalEnv("SLACK_USER_ID")) {
    return;
  }

  const openResult = await getSlackClient().conversations.open({
    users: getRequiredEnv("SLACK_USER_ID"),
  });
  const channelId = openResult.channel?.id;
  if (!channelId) {
    throw new Error("Slack DMチャンネルを開けませんでした。");
  }

  const result = await getSlackClient().chat.postMessage({
    channel: channelId,
    text: input.text,
    blocks: input.blocks as never,
  });

  if (input.jobId) {
    await getSupabaseAdmin().from("slack_notifications").insert({
      job_id: input.jobId,
      notification_type: input.type,
      slack_channel_id: channelId,
      message_ts: result.ts ?? null,
      payload: { text: input.text },
    });
  }
}
