"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => router.replace("/"), 800);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm border border-stone-300 bg-white p-6 text-center shadow-sm dark:border-stone-700 dark:bg-stone-950">
        <h1 className="text-lg font-semibold">ログインを確認しています</h1>
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">
          数秒後にアプリへ戻ります。
        </p>
      </div>
    </main>
  );
}
