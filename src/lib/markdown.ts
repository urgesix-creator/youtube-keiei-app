import { formatDuration, sanitizeFileSegment } from "@/lib/youtube";
import type { ContentJob, GeneratedOutputs, TranscriptSource } from "@/lib/types";

export function buildMarkdown(input: {
  job: ContentJob;
  outputs: GeneratedOutputs;
  transcriptText: string;
  transcriptSource: TranscriptSource;
}): string {
  const { job, outputs, transcriptText, transcriptSource } = input;
  const tags = outputs.hashtags.length >= 7 ? outputs.hashtags : defaultTags();

  return `---
title: "${escapeYaml(outputs.generatedTitle)}"
source_title: "${escapeYaml(job.source_title ?? "不明")}"
source_url: "${escapeYaml(job.source_url)}"
video_id: "${escapeYaml(job.video_id)}"
created_at: "${new Date().toISOString()}"
output_mode: "${job.output_mode}"
status: "done"
transcript_source: "${transcriptSource}"
tags:
${tags.map((tag) => `  - ${tag}`).join("\n")}
---

# ${outputs.generatedTitle}

## 共通メタ情報
- 元動画タイトル: ${job.source_title ?? "不明"}
- 元動画URL: ${job.source_url}
- 動画ID: ${job.video_id}
- 動画時間: ${formatDuration(job.duration_seconds)}
- 文字起こし取得方法: ${transcriptSource}
- 処理ステータス: done
- 要確認事項: ${outputs.handoffNotes.filter((note) => note.tag === "要確認").map((note) => note.text).join(" / ") || "なし"}

## 経営実践レポート

${outputs.report}

## X投稿

${outputs.xPost}

## Threads投稿

${outputs.threadsPosts.map((post, index) => `### Threads ${index + 1}\n\n${post}`).join("\n\n")}

## note記事

${outputs.noteArticle}

## Instagramカルーセル

${outputs.instagramCarousel
  .map((slide) => `### ${slide.index}枚目 ${slide.title}\n\n${slide.body}`)
  .join("\n\n")}

## Instagramキャプション

${outputs.instagramCaption}

## Instagramリール台本

### 冒頭3秒

${outputs.instagramReelScript.hook}

### テロップ

${outputs.instagramReelScript.telops.map((line) => `- ${line}`).join("\n")}

### ナレーション

${outputs.instagramReelScript.narration.map((line) => `- ${line}`).join("\n")}

## 発信者への申し送り

${outputs.handoffNotes.map((note) => `- 【${note.tag}】${note.text}`).join("\n") || "- なし"}

## ハッシュタグ一覧

${tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}

## 文字起こし全文

取得方法: ${transcriptSource}

本文:

${transcriptText}
`;
}

export function buildMarkdownFileName(generatedTitle: string, videoId: string): string {
  const date = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("/", "");

  const title = sanitizeFileSegment(generatedTitle);
  return `${date}_${title}_${videoId}.md`;
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function defaultTags(): string[] {
  return ["中小企業", "AI活用", "業務改善", "経営実践", "YouTube要約", "SNS変換", "動画メモ"];
}
