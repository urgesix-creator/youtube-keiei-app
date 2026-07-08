import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { google } from "googleapis";

const folderId = requiredEnv("GOOGLE_DRIVE_FOLDER_ID");
const vaultPath = requiredEnv("OBSIDIAN_VAULT_PATH");
const targetDir = process.env.OBSIDIAN_TARGET_DIR || "SNS発信/動画情報";
const targetPath = path.join(vaultPath, targetDir);
const logPath = path.join(targetPath, "_youtube_keiei_sync_log.json");

await mkdir(targetPath, { recursive: true });

const drive = google.drive({ version: "v3", auth: getGoogleAuth() });
const syncLog = await readJson(logPath, {});

const files = await listMarkdownFiles();
let copied = 0;

for (const file of files) {
  if (!file.id || !file.name) continue;
  if (syncLog[file.id] === file.modifiedTime) continue;

  const markdown = await downloadFile(file.id);
  const safeName = sanitizeFileName(file.name);
  await writeFile(path.join(targetPath, safeName), markdown, "utf8");
  syncLog[file.id] = file.modifiedTime;
  copied += 1;
}

await writeFile(logPath, JSON.stringify(syncLog, null, 2), "utf8");
console.log(`Obsidian同期完了: ${copied}件`);

async function listMarkdownFiles() {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and (mimeType = 'text/markdown' or name contains '.md')`,
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
  });

  return response.data.files || [];
}

async function downloadFile(fileId) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" },
  );
  return String(response.data);
}

function getGoogleAuth() {
  return new google.auth.JWT({
    email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} が未設定です。`);
  }
  return value;
}
