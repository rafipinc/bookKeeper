# ADR-0010 — Branching strategy: GitHub Flow with hard `main` lockdown

**Status:** Proposed
**Date:** 2026-05-18
**Related:** Rafi's hard rule: nothing merges to `main` without explicit instruction.

## Context

The repo (`bookkeeping-app`) doesn't exist yet, but as soon as BKP-001 lands and Vercel is wired up (BKP-007), every push to `main` becomes a production deployment. That makes the branching strategy load-bearing: a wrong merge is a wrong production deploy.

Rafi is the sole human developer; Codex CLI or Claude Code is doing most of the implementation. Both produce branches and PRs but should never close their own merges to `main`.

Three branching models considered:

(a) **GitHub Flow** — `main` is always deployable; every change is a short-lived branch off `main` with a PR; PR triggers a Vercel preview; squash-merge into `main` only on Rafi's explicit instruction. Simple, matches the existing Vercel preview-deploy contract from BKP-007.

(b) **Git Flow** (develop / release / hotfix branches) — overkill for a solo-shop indie project. Adds branches that exist purely for ceremony.

(c) **Trunk-based with feature flags** — works for a team that ships many changes per day. We're not at that volume.

GitHub Flow wins.

## Decision

### Branch model

- `main` — always deployable; production deploys on push.
- Feature branches — named per Linear's auto-generated convention, e.g. `rafipincus/raf-17-bkp-007-vercel-deployment-environment-config`.
- No `develop`, no `release/*`, no long-lived branches.

### Branch protection on `main`

Configured via `gh api -X PUT repos/:owner/:repo/branches/main/protection`:

- `required_status_checks`: include the CI workflow + Vercel preview build success.
- `enforce_admins: true` — admins are not exempt.
- `required_pull_request_reviews.required_approving_review_count: 1` — Rafi is the human reviewer.
- `restrictions: null` — no special user pushes; everyone uses PRs.
- `allow_force_pushes: false`, `allow_deletions: false`.
- `required_linear_history: true` — squash-merge enforces this; rebase-merge would also work, but we standardise on squash.

### Merge style

**Squash-merge only.** Every PR collapses to one commit on `main` with the Linear ticket id and title in the message. Keeps `main` history grep-able by ticket without losing detail (the merged PR's commits remain on the feature branch and in the PR record).

### PR lifecycle

1. Coding agent creates a branch off `main` using Linear's `gitBranchName`.
2. Agent commits, pushes, opens PR against `main` with template-filled body (linking the Linear ticket, summarising changes, listing acceptance criteria covered).
3. Vercel auto-deploys a preview URL on the PR.
4. CI runs (lint, typecheck, unit tests, RLS test, build).
5. **Agent stops here.** Posts a comment "Ready for review" and returns. Never merges its own PR.
6. Rafi reviews. If approved, *Rafi* clicks Merge (or instructs an agent in conversation: "merge BKP-008 now").
7. Squash-merge into `main`. Vercel deploys to production.

### Hotfix path

A hotfix is a normal PR with the label `hotfix`. CI still runs; review can be expedited but cannot be skipped. There is no separate hotfix branch model.

### Tags & releases

`main` is auto-tagged `v0.<sprint>.<minor>` on every merge by a GitHub Action. No manual release branches.

## The hard rule (encoded)

**Coding agents and automation tools never merge to `main`.** Branch protection enforces this via "required reviewer", but the rule is also explicit in:

- The repo's `CONTRIBUTING.md` (TBD).
- The PR template that every agent fills in.
- Per-agent system prompts where applicable.

Branch protection is the technical guarantee. The cultural rule reinforces it for any path that could bypass branch protection (e.g. an admin token with override).

## Consequences

**Positive**

- Minimal ceremony for a solo developer with agentic helpers.
- Production is always the head of `main`; rollback is `git revert` + push.
- Rafi's "never merge to main without instruction" rule is enforced at the platform level, not just by convention.

**Negative**

- Single-reviewer requirement means Rafi is in the critical path for every merge — a feature, not a bug for v1, but worth revisiting if more humans join.

**Neutral**

- If we later add per-team merge permissions or a release cadence, GitHub Flow extends cleanly into a release-branch model without rewriting history.
