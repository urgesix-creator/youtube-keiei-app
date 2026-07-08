import { ConfigError } from "@/lib/errors";

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  const cleaned = cleanEnvValue(value);
  if (!cleaned) {
    throw new ConfigError(`${name} が未設定です。`);
  }
  return cleaned;
}

export function getOptionalEnv(name: string): string | null {
  return cleanEnvValue(process.env[name]);
}

export function getAllowedEmails(): string[] {
  return (getOptionalEnv("ALLOWED_USER_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getAppBaseUrl(): string {
  return getOptionalEnv("APP_BASE_URL") ?? "http://localhost:3000";
}

export function shouldUseMockAi(): boolean {
  return getOptionalEnv("USE_MOCK_AI") === "true";
}

function cleanEnvValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/(?:\\n)+$/g, "").trim();
  return cleaned === "" ? null : cleaned;
}
