# Contributing

This repo uses GitHub Flow for Phase 2 and later work.

## Branches

- `main` is always deployable and is the production branch.
- Create short-lived feature branches from `main`.
- Use Linear's generated branch name when working from a ticket, for example `rafipincus/raf-41-bkp-027-github-flow-setup-branch-protection-pr-template`.
- Do not create long-lived `develop`, `release/*`, or environment branches.

## Pull requests

1. Create a branch from `main`.
2. Commit the scoped Linear ticket work.
3. Open a pull request against `main`.
4. Fill in the PR template, including the Linear ticket link, acceptance criteria, test notes, and deploy notes.
5. Wait for CI and Vercel preview to pass.
6. Stop at review.

## Merge rule

Coding agents and automation tools must not merge to `main` without Rafi's explicit instruction.

Branch protection requires one human approval. Squash merge is the only intended merge style, and the squash commit should include the Linear ticket id and title.

## CI expectations

Every PR to `main` runs:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- The Supabase RLS verification script at `supabase/tests/rls.sql`

If a future ticket adds another required check, add it to CI and then update the branch protection required status checks.
