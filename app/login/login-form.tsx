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
      setError("Couldn't send the link. Check the email address and try again.");
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
    <main className="min-h-svh bg-[var(--paper)] px-4 flex items-center justify-center">
      <section className="bkp-card w-full max-w-sm p-6 md:max-w-md md:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">bookkeeping-app</h1>
        <p className="mt-1 text-[15px] text-[var(--text-secondary)]">Lean accounting for solo operators.</p>

        {sentEmail ? (
          <div className="mt-6 text-center">
            <MailCheck aria-hidden className="mx-auto h-10 w-10 text-[var(--ink)]" />
            <h2 className="mt-3 text-lg font-semibold">Check your email</h2>
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              We sent a sign-in link to <strong>{sentEmail}</strong>. Tap it to come back here.
            </p>
            <button
              className="mt-4 text-sm font-medium text-[var(--ink)] disabled:text-[var(--text-muted)]"
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
              <label className="text-sm font-medium" htmlFor="email">
                Email address
              </label>
              <input
                aria-describedby={error ? "email-error" : undefined}
                autoComplete="email"
                className="bkp-input mt-1 block w-full px-3 py-2 text-sm"
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
                <p className="mt-2 text-sm text-[var(--expense)]" id="email-error">
                  {error}
                </p>
              ) : null}
            </div>
            <button
              aria-busy={isPending}
              className="bkp-button w-full px-4 py-2 text-sm transition-colors"
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
