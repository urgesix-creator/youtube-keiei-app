import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import { getAllowedEmails, getOptionalEnv } from "@/lib/env";
import { getSupabaseAuth } from "@/lib/supabase/server";

export type RequestUser = {
  id: string;
  email: string;
};

export async function requireRequestUser(request: Request): Promise<RequestUser> {
  const localUser = requireLocalPasswordLogin(request);
  if (localUser) {
    return localUser;
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    throw new AppError("unauthorized", "ログイン情報がありません。", 401);
  }

  const { data, error } = await getSupabaseAuth().auth.getUser(token);
  if (error || !data.user?.email) {
    throw new AppError("unauthorized", "ログイン情報を確認できません。", 401);
  }

  const email = data.user.email.toLowerCase();
  const allowedEmails = getAllowedEmails();
  if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
    throw new AppError("forbidden", "このGoogleアカウントは許可されていません。", 403);
  }

  return {
    id: data.user.id,
    email,
  };
}

function requireLocalPasswordLogin(request: Request): RequestUser | null {
  const expectedLoginId = getOptionalEnv("APP_LOGIN_ID");
  const expectedPassword = getOptionalEnv("APP_LOGIN_PASSWORD");
  const userId = getOptionalEnv("APP_USER_ID");
  const actualLoginId = request.headers.get("x-app-login-id")?.trim() ?? null;
  const actualPassword = request.headers.get("x-app-login-password");

  if (!expectedLoginId && !expectedPassword && !actualLoginId && !actualPassword) {
    return null;
  }

  if (!expectedLoginId || !expectedPassword || !userId) {
    throw new AppError("local_auth_not_configured", "APP_LOGIN_ID、APP_LOGIN_PASSWORD、APP_USER_ID のいずれかが未設定です。", 500);
  }

  if (
    !actualLoginId ||
    !actualPassword ||
    !safeEqual(actualLoginId, expectedLoginId) ||
    !safeEqual(actualPassword, expectedPassword)
  ) {
    throw new AppError("unauthorized", "IDまたはパスワードが違います。", 401);
  }

  return {
    id: userId,
    email: actualLoginId,
  };
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireWorkerToken(request: Request): void {
  const expected = getOptionalEnv("WORKER_TOKEN");
  const actual = request.headers.get("x-worker-token");

  if (!expected) {
    throw new AppError("worker_token_missing", "WORKER_TOKEN が未設定です。", 500);
  }

  if (actual !== expected) {
    throw new AppError("worker_unauthorized", "ワーカー認証に失敗しました。", 401);
  }
}
