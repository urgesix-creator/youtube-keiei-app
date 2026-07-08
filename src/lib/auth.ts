import { AppError } from "@/lib/errors";
import { getAllowedEmails, getOptionalEnv } from "@/lib/env";
import { getSupabaseAuth } from "@/lib/supabase/server";

export type RequestUser = {
  id: string;
  email: string;
};

export async function requireRequestUser(request: Request): Promise<RequestUser> {
  const localUser = requireLocalAccessCode(request);
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

function requireLocalAccessCode(request: Request): RequestUser | null {
  const expected = getOptionalEnv("APP_ACCESS_CODE");
  const userId = getOptionalEnv("APP_USER_ID");
  const actual = request.headers.get("x-app-access-code");

  if (!expected && !actual) {
    return null;
  }

  if (!expected || !userId) {
    throw new AppError("local_auth_not_configured", "APP_ACCESS_CODE または APP_USER_ID が未設定です。", 500);
  }

  if (actual !== expected) {
    throw new AppError("unauthorized", "アクセスコードが違います。", 401);
  }

  return {
    id: userId,
    email: "local-user",
  };
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
