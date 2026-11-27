"use client";

import { Bot, Check, Loader2, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PendingConfirmation = {
  type: "accept_reconciliation_suggestion";
  matchId: string;
  summary: string;
};

type AssistantResponse = {
  message?: string;
  pendingConfirmation?: PendingConfirmation | null;
};

const starterPrompts = [
  "What needs attention?",
  "Summarise the queue",
  "Which suggestions can I approve?",
];

export function ReconcileAssistant() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Ask about unreconciled transactions, Xero sync status, accounts, contacts, or a suggestion.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [isSending, setIsSending] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const conversation = useMemo(
    () => messages.filter((message) => message.role === "user" || message.role === "assistant"),
    [messages],
  );

  async function submitMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setDraft("");
    setPendingConfirmation(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/assistant/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(-8) }),
      });
      const data = (await response.json()) as AssistantResponse;
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.message ?? "I could not answer that yet.",
        },
      ]);
      setPendingConfirmation(data.pendingConfirmation ?? null);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "The assistant is temporarily unavailable." },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingConfirmation || isSending) return;
    setIsSending(true);

    try {
      const response = await fetch("/api/assistant/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation.slice(-8),
          confirmedAction: {
            type: pendingConfirmation.type,
            matchId: pendingConfirmation.matchId,
          },
        }),
      });
      const data = (await response.json()) as AssistantResponse;
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.message ?? "Confirmed." },
      ]);
      setPendingConfirmation(null);
      router.refresh();
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "I could not apply that confirmation." },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage(draft);
  }

  const panel = (
    <section className="flex h-full min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ink)] text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Reconciliation AI</h2>
            <p className="text-xs text-[var(--text-muted)]">Queries synced Xero data</p>
          </div>
        </div>
        <button
          aria-label="Close assistant"
          className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--paper)] md:hidden"
          onClick={() => setIsOpen(false)}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${
                message.role === "user"
                  ? "ml-auto bg-[var(--ink)] text-white"
                  : "bg-[var(--paper)] text-[var(--text-primary)]"
              }`}
              key={`${message.role}-${index}`}
            >
              {message.content}
            </div>
          ))}
          {isSending && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-[var(--paper)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking
            </div>
          )}
        </div>

        {pendingConfirmation && (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Confirm action</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {pendingConfirmation.summary}
            </p>
            <button
              className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--ink-hover)] disabled:opacity-50"
              disabled={isSending}
              onClick={confirmPendingAction}
              type="button"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3">
        <div className="mb-2 flex gap-1 overflow-x-auto">
          {starterPrompts.map((prompt) => (
            <button
              className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--paper)]"
              disabled={isSending}
              key={prompt}
              onClick={() => void submitMessage(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
        <form className="flex items-center gap-2" onSubmit={onSubmit} ref={formRef}>
          <input
            className="min-w-0 flex-1 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--ink)]"
            disabled={isSending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about the queue"
            value={draft}
          />
          <button
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--ink)] text-white hover:bg-[var(--ink-hover)] disabled:opacity-50"
            disabled={isSending || !draft.trim()}
            type="submit"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </section>
  );

  return (
    <>
      <div className="hidden h-full min-w-0 flex-1 md:block">{panel}</div>
      <button
        className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ink)] text-white shadow-lg md:hidden"
        onClick={() => setIsOpen(true)}
        type="button"
        aria-label="Open reconciliation assistant"
      >
        <Bot className="h-5 w-5" />
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 md:hidden">
          <div className="absolute inset-x-0 bottom-0 h-[78vh] overflow-hidden rounded-t-xl bg-[var(--surface)] shadow-xl">
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
