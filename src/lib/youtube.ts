import { getOptionalEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export type YouTubeMetadata = {
  videoId: string;
  sourceTitle: string | null;
  durationSeconds: number | null;
};

export function extractYouTubeVideoId(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("invalid_youtube_url", "YouTube URLを確認してください。", 400);
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id) return id;
  }

  if (host.endsWith("youtube.com")) {
    const watchId = url.searchParams.get("v");
    if (watchId) return watchId;

    const parts = url.pathname.split("/").filter(Boolean);
    const knownPrefixes = new Set(["shorts", "embed", "live"]);
    if (parts.length >= 2 && knownPrefixes.has(parts[0])) {
      return parts[1];
    }
  }

  throw new AppError("invalid_youtube_url", "対応しているYouTube URLではありません。", 400);
}

export async function fetchYouTubeMetadata(sourceUrl: string): Promise<YouTubeMetadata> {
  const videoId = extractYouTubeVideoId(sourceUrl);
  const apiKey = getOptionalEnv("YOUTUBE_DATA_API_KEY");

  if (apiKey) {
    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    apiUrl.searchParams.set("part", "snippet,contentDetails");
    apiUrl.searchParams.set("id", videoId);
    apiUrl.searchParams.set("key", apiKey);

    const response = await fetch(apiUrl);
    if (response.ok) {
      const payload = (await response.json()) as {
        items?: Array<{
          snippet?: { title?: string };
          contentDetails?: { duration?: string };
        }>;
      };
      const item = payload.items?.[0];
      if (item) {
        return {
          videoId,
          sourceTitle: item.snippet?.title ?? null,
          durationSeconds: item.contentDetails?.duration
            ? parseIso8601Duration(item.contentDetails.duration)
            : null,
        };
      }
    }
  }

  const title = await fetchOEmbedTitle(sourceUrl);
  return {
    videoId,
    sourceTitle: title,
    durationSeconds: null,
  };
}

async function fetchOEmbedTitle(sourceUrl: string): Promise<string | null> {
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", sourceUrl);
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}

function parseIso8601Duration(duration: string): number {
  const match = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

export function sanitizeFileSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|#%{}$!@+`=]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 42);
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "不明";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}時間${m}分${s}秒`;
  return `${m}分${s}秒`;
}
