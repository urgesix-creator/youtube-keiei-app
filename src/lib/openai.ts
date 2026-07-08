import OpenAI from "openai";
import { z } from "zod";
import { getOptionalEnv, getRequiredEnv, shouldUseMockAi } from "@/lib/env";
import { generationRules, outputSchemaInstruction } from "@/lib/prompts";
import type { GeneratedOutputs, SelectedOutput } from "@/lib/types";

const slideSchema = z.object({
  index: z.number(),
  role: z.enum(["cover", "body", "summary"]),
  title: z.string(),
  body: z.string(),
});

const generatedOutputsSchema = z.object({
  generatedTitle: z.string().min(1),
  report: z.string(),
  xPost: z.string(),
  threadsPosts: z.array(z.string()).min(0).max(5),
  noteArticle: z.string(),
  instagramCarousel: z.array(slideSchema).min(0).max(11),
  instagramCaption: z.string(),
  instagramReelScript: z.object({
    hook: z.string(),
    telops: z.array(z.string()),
    narration: z.array(z.string()),
  }),
  handoffNotes: z.array(
    z.object({
      tag: z.enum(["注意", "要確認", "補足", "憶測"]),
      text: z.string(),
    }),
  ),
  hashtags: z.array(z.string()).min(7),
});

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: getRequiredEnv("OPENAI_API_KEY") });
  }
  return client;
}

export async function generateContentPackage(input: {
  transcriptText: string;
  sourceTitle: string | null;
  sourceUrl: string;
  selectedOutputs: SelectedOutput[];
  outputMode: "all" | "individual";
}): Promise<GeneratedOutputs> {
  if (shouldUseMockAi()) {
    return buildMockOutputs(input.sourceTitle);
  }

  const chunkSummaries = await summarizeTranscriptChunks(input.transcriptText);
  const selected =
    input.outputMode === "all" || input.selectedOutputs.length === 0
      ? "all"
      : input.selectedOutputs.join(", ");

  const prompt = `
${generationRules}

出力対象: ${selected}
元動画タイトル: ${input.sourceTitle ?? "不明"}
元動画URL: ${input.sourceUrl}

統合用の要約素材:
${chunkSummaries.join("\n\n---\n\n")}

${outputSchemaInstruction}
`;

  const text = await createText(prompt, getOptionalEnv("OPENAI_MODEL") ?? "gpt-5.2");
  return parseGeneratedOutputs(text);
}

async function summarizeTranscriptChunks(transcriptText: string): Promise<string[]> {
  const chunks = chunkText(transcriptText, 12000);
  if (chunks.length === 1) {
    return [chunks[0]];
  }

  const model = getOptionalEnv("OPENAI_CHUNK_MODEL") ?? getOptionalEnv("OPENAI_MODEL") ?? "gpt-5.2";
  const summaries: string[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const prompt = `
${generationRules}

以下は長い文字起こしの ${index + 1}/${chunks.length} です。
中小企業の経営実践に使える論点、具体例、要確認事項、除外すべき勧誘・販売要素を分けて要約してください。

文字起こし:
${chunk}
`;
    summaries.push(await createText(prompt, model));
  }

  return summaries;
}

async function createText(prompt: string, model: string): Promise<string> {
  const response = await getOpenAIClient().responses.create({
    model,
    input: prompt,
  });

  const outputText = response.output_text;
  if (!outputText || outputText.trim() === "") {
    throw new Error("OpenAIから本文が返りませんでした。");
  }

  return outputText;
}

function parseGeneratedOutputs(text: string): GeneratedOutputs {
  const cleaned = stripCodeFence(text);
  const parsed = JSON.parse(cleaned) as unknown;
  return generatedOutputsSchema.parse(parsed);
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function chunkText(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += maxChars) {
    chunks.push(normalized.slice(start, start + maxChars));
  }
  return chunks.length > 0 ? chunks : [""];
}

function buildMockOutputs(sourceTitle: string | null): GeneratedOutputs {
  const title = "中小企業がAIで定型業務を減らす実践ステップ";
  return {
    generatedTitle: title,
    report:
      "この動画の題材は、中小企業が日々の定型業務を見直し、AIを現場の補助役として使う考え方です。重要なのは、いきなり大きな仕組みを作ることではなく、毎日繰り返している作業を一つ選び、入力、判断、出力のどこに時間がかかっているかを分けて見ることです。たとえば営業担当者なら、商談メモから提案書のたたき台を作る業務に使えます。経理担当者なら、請求内容の確認や社内向け説明文の整理に使えます。管理職なら、週報や日報を読みやすくまとめ、次の打ち手を考える材料にできます。AIは万能な担当者ではなく、下書き係として置くと失敗しにくくなります。人が判断すべき部分と、AIに任せてよい部分を分けることで、現場の負担を減らしながら品質も保てます。まずは一部署で小さく試し、使えた型だけを社内ルールにして広げるのが現実的です。",
    xPost:
      "AI活用は大きな改革から始めるより、毎日の定型業務を1つ減らすところから始めると現場に定着します。営業メモ、週報、問い合わせ整理など、下書き係として使うのが実務的です。#中小企業 #AI活用 #業務改善",
    threadsPosts: [
      "AIを導入するとき、最初から全社改革を狙うと止まりやすいです。\n\n中小企業では、まず毎日繰り返している作業を1つ選ぶ方が現実的です。営業メモ、週報、問い合わせ対応など、下書きが多い業務から始めると効果が見えます。\n\nあなたの会社で一番時間を取られている定型作業は何ですか？プロフィールでも中小企業のAI活用を整理しています。",
      "AIは万能な担当者ではなく、下書き係として置くと使いやすくなります。\n\n人が判断する部分と、AIに任せる部分を分けるだけで、現場の心理的な抵抗が下がります。たとえば商談メモを提案書の骨子にする、日報を週次報告にまとめる、といった使い方です。\n\nまず任せたい下書き業務はどれですか？プロフィールから他の実例も見られます。",
      "中小企業のAI活用で大事なのは、ツール選びより業務の切り分けです。\n\n入力、判断、出力のどこに時間がかかっているかを見れば、AIに任せる場所が見えてきます。判断は人、整理と下書きはAI。この分担が一番始めやすいです。\n\n社内で試すなら、どの部署から始めますか？プロフィールで実務例をまとめています。",
    ],
    noteArticle: `タイトル案\n1. 中小企業がAIで定型業務を減らす実践ステップ\n2. 現場に定着するAI活用は小さな業務改善から始まる\n3. AIを下書き係にして社内業務を軽くする方法\n\nリード\nAI活用は大きな改革ではなく、日々の仕事を少し軽くするところから始めると定着します。\n\n■定型業務を1つ選ぶ\n営業メモ、週報、問い合わせ整理など、繰り返し発生する業務を対象にします。\n\n■AIは下書き係にする\n判断は人が行い、文章整理や要約の下書きをAIに任せます。\n\n■まとめ\n最初は小さく試し、使えた型だけを社内ルールにすることが現実的です。\n\n#中小企業 #AI活用 #業務改善 #経営実践 #DX #生産性向上 #社内運用`,
    instagramCarousel: [
      { index: 1, role: "cover", title, body: "AI活用は定型業務を1つ減らすところから始めます。" },
      { index: 2, role: "body", title: "最初に選ぶ業務", body: "毎日繰り返す作業を1つ選びます。" },
      { index: 3, role: "body", title: "入力を分ける", body: "メモ、日報、問い合わせなど素材を整理します。" },
      { index: 4, role: "body", title: "判断は人", body: "最終判断は担当者が行います。" },
      { index: 5, role: "body", title: "AIは下書き", body: "文章化や要約の下書きを任せます。" },
      { index: 6, role: "body", title: "小さく試す", body: "一部署で試して型を作ります。" },
      { index: 7, role: "summary", title: "まとめ", body: "保存して社内のAI活用チェックに使ってください。" },
    ],
    instagramCaption:
      "AI活用は、大きな改革よりも毎日の定型業務を1つ減らすところから始めると定着します。\n\n営業メモ、週報、問い合わせ整理など、下書きが多い業務は特に相性があります。判断は人が行い、整理や文章化をAIに任せると、現場の負担を減らしやすくなります。\n\nまずは一部署で小さく試し、使えた型だけを社内ルールにするのが現実的です。\n\n保存して、社内のAI活用を考えるときに見返してください。\n\n#中小企業 #AI活用 #業務改善 #経営実践 #DX #生産性向上 #社内運用 #営業効率化 #バックオフィス #生成AI",
    instagramReelScript: {
      hook: "AI活用、最初から全社改革を狙わないでください。",
      telops: ["定型業務を1つ選ぶ", "AIは下書き係", "判断は人が行う", "小さく試して広げる"],
      narration: [
        "中小企業のAI活用は、毎日の定型業務を1つ減らすところから始めます。",
        "営業メモや週報など、下書きが多い業務に使うと効果が見えやすいです。",
        "判断は人が行い、整理と文章化をAIに任せます。",
      ],
    },
    handoffNotes: [
      {
        tag: "補足",
        text: `ローカル検証用のモック出力です。元動画タイトル: ${sourceTitle ?? "不明"}`,
      },
    ],
    hashtags: ["中小企業", "AI活用", "業務改善", "経営実践", "DX", "生産性向上", "社内運用"],
  };
}
