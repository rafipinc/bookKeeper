"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const RESEND_SECONDS = 30;

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendMagicLink(targetEmail: string) {
    setIsPending(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    setIsPending(false);

    if (authError) {
      setError("Hmm, that didn't work. Check your email and try again.");
      return;
    }

    setSentEmail(targetEmail);
    setCooldown(RESEND_SECONDS);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMagicLink(email.trim());
  }

  async function handleResend() {
    if (!sentEmail || cooldown > 0) {
      return;
    }

    await sendMagicLink(sentEmail);
  }

  const canSubmit = email.includes("@") && !isPending;

  return (
    <main className="flex min-h-svh items-center justify-center bg-gradient-to-b from-zinc-100 to-zinc-200/50 px-4 dark:from-slate-950 dark:to-slate-900">
      <section className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white/95 p-6 shadow-xl shadow-slate-900/5 md:max-w-md md:p-8 dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-black/30">
        <h1 className="text-2xl font-semibold tracking-tight text-blue-700 dark:text-blue-400">bookkeeping-app</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Bookkeeping that respects your time.</p>

        {sentEmail ? (
          <div className="mt-6 text-center">
            <MailCheck aria-hidden className="mx-auto h-10 w-10 text-blue-700" />
            <h2 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Check your email</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              We sent a sign-in link to <strong>{sentEmail}</strong>. Tap it to come back here.
            </p>
            <button
              className="mt-4 text-sm font-medium text-blue-700 disabled:text-zinc-400 dark:text-blue-300 dark:disabled:text-zinc-500"
              disabled={cooldown > 0 || isPending}
              onClick={handleResend}
              type="button"
            >
              {cooldown > 0 ? `Send again in ${cooldown}s` : "Send again"}
            </button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="email">
                Email address
              </label>
              <input
                aria-describedby={error ? "email-error" : undefined}
                autoComplete="email"
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                disabled={isPending}
                id="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@yourbusiness.com"
                ref={inputRef}
                type="email"
                value={email}
              />
              {error ? (
                <p className="mt-2 text-sm text-red-600" id="email-error">
                  {error}
                </p>
              ) : null}
            </div>
            <button
              aria-busy={isPending}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              disabled={!canSubmit}
              type="submit"
            >
              {isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </span>
              ) : (
                "Send magic link"
              )}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
