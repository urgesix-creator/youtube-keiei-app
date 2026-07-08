import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { getAppBaseUrl, getOptionalEnv, getRequiredEnv } from "@/lib/env";

export type DriveUploadResult = {
  fileId: string;
  webViewLink: string;
};

export async function uploadMarkdownToDrive(input: {
  filename: string;
  markdown: string;
  fallbackUrl?: string;
}): Promise<DriveUploadResult> {
  if (!hasGoogleDriveConfig() && isVercelRuntime()) {
    return {
      fileId: `vercel:${input.filename}`,
      webViewLink: input.fallbackUrl ?? getAppBaseUrl(),
    };
  }

  await saveMarkdownLocally(input);
  await saveMarkdownToObsidian(input);

  if (!hasGoogleDriveConfig()) {
    return {
      fileId: `local:${input.filename}`,
      webViewLink: `${getAppBaseUrl()}/api/files/${encodeURIComponent(input.filename)}`,
    };
  }

  const drive = google.drive({ version: "v3", auth: getGoogleAuth() });
  const folderId = getRequiredEnv("GOOGLE_DRIVE_FOLDER_ID");

  const response = await drive.files.create({
    requestBody: {
      name: input.filename,
      mimeType: "text/markdown",
      parents: [folderId],
    },
    media: {
      mimeType: "text/markdown",
      body: input.markdown,
    },
    fields: "id, webViewLink",
  });

  const fileId = response.data.id;
  if (!fileId) {
    throw new Error("Google DriveファイルIDが返りませんでした。");
  }

  return {
    fileId,
    webViewLink: response.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}

async function saveMarkdownLocally(input: { filename: string; markdown: string }): Promise<void> {
  const outputDir = path.join(process.cwd(), "outputs", "markdown");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, input.filename), input.markdown, "utf8");
}

async function saveMarkdownToObsidian(input: { filename: string; markdown: string }): Promise<void> {
  const vaultPath = getOptionalEnv("OBSIDIAN_VAULT_PATH");
  const targetDir = getOptionalEnv("OBSIDIAN_TARGET_DIR");

  if (!vaultPath || !targetDir) {
    return;
  }

  const outputDir = path.join(vaultPath, targetDir);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, input.filename), input.markdown, "utf8");
}

function hasGoogleDriveConfig(): boolean {
  return Boolean(
    getOptionalEnv("GOOGLE_DRIVE_FOLDER_ID") &&
      getOptionalEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
      getOptionalEnv("GOOGLE_PRIVATE_KEY"),
  );
}

function isVercelRuntime(): boolean {
  return getOptionalEnv("VERCEL") === "1";
}

export function getGoogleAuth() {
  const privateKey = getRequiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}
