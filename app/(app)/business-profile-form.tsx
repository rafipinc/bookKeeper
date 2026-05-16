"use client";

import { Briefcase, Loader2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createBusiness,
  createBusinessInitialState,
  type CreateBusinessState,
} from "@/app/actions/business";

export default function BusinessProfileForm() {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState<CreateBusinessState, FormData>(
    createBusiness,
    createBusinessInitialState,
  );

  useEffect(() => {
    if (!isPending && !state.error) {
      router.push("/dashboard");
      router.refresh();
    }
  }, [isPending, router, state.error]);

  return (
    <section className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white/95 p-6 shadow-xl shadow-slate-900/5 md:max-w-md md:p-8 dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-black/30">
        <Briefcase className="h-7 w-7 text-blue-700 dark:text-blue-400" />
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Tell us about your business
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          We&apos;ll use this to organise your ledger. You can change it later.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="name">
              Business name
            </label>
            <input
              aria-required="true"
              autoComplete="organization"
              autoFocus
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              disabled={isPending}
              id="name"
              maxLength={80}
              name="name"
              placeholder="Acme Coffee Co."
              required
              type="text"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="businessType">
              Business type (optional)
            </label>
            <input
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              disabled={isPending}
              id="businessType"
              maxLength={60}
              name="businessType"
              placeholder="e.g. Coffee shop, Freelance design, Consultancy"
              type="text"
            />
          </div>

          {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}

          <button
            className="mt-2 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </span>
            ) : (
              "Continue"
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
