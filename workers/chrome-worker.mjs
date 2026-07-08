import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const appBaseUrl = requiredEnv("APP_BASE_URL");
const workerToken = requiredEnv("WORKER_TOKEN");
const workerName = process.env.WORKER_NAME || "mac-chrome-worker";
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 60000);
const errorBackoffMs = Number(process.env.WORKER_ERROR_BACKOFF_MS || 300000);
const profilePath =
  process.env.CHROME_PROFILE_PATH ||
  path.join(os.homedir(), "Library/Application Support/Google/Chrome YouTubeKeieiWorker");
const artifactDir = process.env.WORKER_ARTIFACT_DIR || "./worker-artifacts";
const headless = process.env.CHROME_HEADLESS === "true";

let consecutiveErrors = 0;

process.on("SIGINT", () => {
  console.log("停止します。");
  process.exit(0);
});

await mkdir(artifactDir, { recursive: true });
console.log(`Chromeワーカーを開始: ${workerName}`);
console.log(`Chromeプロファイル: ${profilePath}`);

while (true) {
  try {
    await heartbeat("idle", null);
    const claim = await apiPost("/api/worker/claim-next-job", {});
    const job = claim.job;

    if (!job) {
      consecutiveErrors = 0;
      await sleep(pollIntervalMs);
      continue;
    }

    console.log(`処理開始: ${job.id} ${job.source_url}`);
    await heartbeat("processing", job.id);

    try {
      const transcript = await extractTranscriptWithChrome(job);
      await apiPost(`/api/worker/jobs/${job.id}/transcript`, {
        transcriptText: transcript.text,
        sourceTitle: transcript.sourceTitle || job.source_title,
        durationSeconds: null,
      });
      console.log(`処理完了: ${job.id}`);
      consecutiveErrors = 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Chrome処理失敗: ${message}`);
      await apiPost(`/api/worker/jobs/${job.id}/failure`, {
        errorCode: "chrome_automation_error",
        errorMessage: message,
      });
    }
  } catch (error) {
    consecutiveErrors += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ワーカーエラー: ${message}`);
    await safeHeartbeat("error", null);
    await sleep(consecutiveErrors >= 2 ? errorBackoffMs : pollIntervalMs);
  }
}

async function extractTranscriptWithChrome(job) {
  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      channel: "chrome",
      headless,
      viewport: { width: 1440, height: 1000 },
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(30000);
    await page.goto(job.source_url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const sourceTitle = await page.title().catch(() => null);
    await openSummaryUi(page);
    await maybeSwitchToJapaneseTranslation(page);

    const text = await readTranscriptText(page);
    if (text.length < 500) {
      throw new Error(`取得テキストが短すぎます。文字数: ${text.length}`);
    }

    return { text, sourceTitle };
  } catch (error) {
    await saveFailureScreenshot(context, job.id);
    throw error;
  } finally {
    await context?.close().catch(() => {});
  }
}

async function openSummaryUi(page) {
  const selector = process.env.YOUTUBE_SUMMARY_OPEN_SELECTOR;
  if (selector && (await clickSelector(page, selector))) return;

  const labels = [
    /transcript/i,
    /summary/i,
    /youTube summary/i,
    /トランスクリプト/,
    /文字起こし/,
    /要約/,
  ];

  for (const label of labels) {
    if (await clickByText(page, label)) {
      await page.waitForTimeout(2500);
      return;
    }
  }

  await page.keyboard.press("Escape").catch(() => {});
}

async function maybeSwitchToJapaneseTranslation(page) {
  const selector = process.env.YOUTUBE_SUMMARY_TRANSLATE_SELECTOR;
  if (selector && (await clickSelector(page, selector))) {
    await page.waitForTimeout(2500);
    return;
  }

  const labels = [/translate/i, /translation/i, /日本語/, /翻訳/];
  for (const label of labels) {
    if (await clickByText(page, label)) {
      await page.waitForTimeout(2500);
      return;
    }
  }
}

async function readTranscriptText(page) {
  const selector = process.env.YOUTUBE_SUMMARY_TRANSCRIPT_SELECTOR;
  if (selector) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      const text = normalizeTranscript(await locator.innerText());
      if (text.length > 0) return text;
    }
  }

  const candidates = await page.evaluate(() => {
    const selectors = [
      "[role='dialog']",
      "ytd-engagement-panel-section-list-renderer",
      "#secondary",
      "aside",
      "body",
    ];

    return selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((element) => element.textContent || "")
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 200)
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);
  });

  const best = candidates.find((text) =>
    /(transcript|summary|文字起こし|翻訳|要約|AI|業務|会社|経営)/i.test(text),
  );

  return normalizeTranscript(best || candidates[0] || "");
}

async function clickSelector(page, selector) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return false;
  await locator.click({ timeout: 5000 });
  return true;
}

async function clickByText(page, pattern) {
  const locator = page.getByText(pattern).first();
  if ((await locator.count()) === 0) return false;
  await locator.click({ timeout: 5000 });
  return true;
}

function normalizeTranscript(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function saveFailureScreenshot(context, jobId) {
  try {
    const page = context?.pages()[0];
    if (!page) return;
    const file = path.join(artifactDir, `${new Date().toISOString().replace(/[:.]/g, "-")}_${jobId}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`失敗スクリーンショット: ${file}`);
  } catch {
    // スクリーンショット失敗は本体処理を妨げない。
  }
}

async function heartbeat(status, currentJobId) {
  await apiPost("/api/worker/heartbeat", {
    workerName,
    machineName: os.hostname(),
    status,
    currentJobId,
  });
}

async function safeHeartbeat(status, currentJobId) {
  try {
    await heartbeat(status, currentJobId);
  } catch {
    // API障害中の心拍失敗は次ループで再試行する。
  }
}

async function apiPost(pathname, body) {
  const response = await fetch(new URL(pathname, appBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-token": workerToken,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `APIエラー: ${response.status}`);
  }

  return payload;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} が未設定です。`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
