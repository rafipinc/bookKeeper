"use client";

import { Briefcase, Loader2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createBusiness,
  type CreateBusinessState,
} from "@/app/actions/business";

export default function BusinessProfileForm() {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState<CreateBusinessState, FormData>(
    createBusiness,
    { error: null },
  );
  const [didSubmit, setDidSubmit] = useState(false);

  useEffect(() => {
    if (didSubmit && !isPending && !state.error) {
      router.push("/dashboard");
      router.refresh();
    }
  }, [didSubmit, isPending, router, state.error]);

  async function handleSubmit(formData: FormData) {
    setDidSubmit(true);
    await formAction(formData);
  }

  return (
    <section className="flex flex-1 items-center justify-center px-4">
      <div className="bkp-card w-full max-w-sm p-6 md:max-w-md md:p-8">
        <Briefcase className="h-7 w-7 text-[var(--ink)]" />
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Tell us about your business</h1>
        <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
          We&apos;ll use this to organise your ledger. You can change it later.
        </p>

        <form action={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="name">
              Business name
            </label>
            <input
              aria-required="true"
              autoComplete="organization"
              autoFocus
              className="bkp-input mt-1 block w-full px-3 py-2 text-sm"
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
            <label className="text-sm font-medium" htmlFor="businessType">
              Business type (optional)
            </label>
            <input
              autoComplete="off"
              className="bkp-input mt-1 block w-full px-3 py-2 text-sm"
              disabled={isPending}
              id="businessType"
              maxLength={60}
              name="businessType"
              placeholder="e.g. Coffee shop, Freelance design, Consultancy"
              type="text"
            />
          </div>

          {state.error ? <p className="text-sm text-[var(--expense)]">{state.error}</p> : null}

          <button
            className="bkp-button mt-2 w-full px-4 py-2 text-sm transition-colors"
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
