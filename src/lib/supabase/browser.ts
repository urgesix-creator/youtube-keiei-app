"use client";

import { createClient } from "@supabase/supabase-js";

export function createBrowserSupabaseClient() {
  const url = cleanPublicEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanPublicEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    throw new Error("Supabase公開設定が未設定です。");
  }

  return createClient(url, anonKey);
}

function cleanPublicEnvValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/(?:\\n)+$/g, "").trim();
  return cleaned === "" ? null : cleaned;
}
