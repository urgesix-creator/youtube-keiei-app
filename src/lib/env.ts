import { ConfigError } from "@/lib/errors";

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new ConfigError(`${name} が未設定です。`);
  }
  return value;
}

export function getOptionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : null;
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
