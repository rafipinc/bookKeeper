# GitHub Flow Governance

This document implements RAF-41 / BKP-027 and ADR-0010.

## Current local observation

- Local branch at implementation time: `codex/raf-41-github-flow-governance`.
- Remote: `git@github.com:rafipinc/bookKeeper.git`.
- Remote default branch at inspection time: `develop`.
- GitHub CLI availability at inspection time: `gh` was not installed locally.

Because `gh` is unavailable locally and branch protection may require repository admin permissions, apply the commands below from an authenticated machine with admin rights.

## Required repository settings

Set the default branch to `main` and allow squash merges only after `main` exists and contains the current production-ready code:

```bash
gh api \
  --method PATCH \
  repos/rafipinc/bookKeeper \
  --input - <<'JSON'
{
  "default_branch": "main",
  "allow_squash_merge": true,
  "allow_merge_commit": false,
  "allow_rebase_merge": false,
  "delete_branch_on_merge": true,
  "squash_merge_commit_title": "PR_TITLE",
  "squash_merge_commit_message": "PR_BODY"
}
JSON
```

## Branch protection

Apply protection to `main`:

```bash
gh api \
  --method PUT \
  repos/rafipinc/bookKeeper/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint, typecheck, test, build",
      "RLS test",
      "Vercel"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true
}
JSON
```

GitHub may reject `required_linear_history` if the repository or account plan does not expose that field. If rejected, apply the same payload without that field and enforce Linear ticket references through squash commit policy and the PR template.

If the Vercel required check appears under a different context name, replace `"Vercel"` with the exact check name shown on a pull request.

## Verification checklist

- Direct push to `main` is rejected.
- PRs to `main` require `Lint, typecheck, test, build`.
- PRs to `main` require `RLS test`.
- PRs to `main` require the Vercel preview check.
- Merge commit and rebase merge buttons are disabled.
- Squash merge is enabled.
- A pull request without approval cannot merge.
- Agents stop after opening the PR and do not merge unless Rafi explicitly instructs them.
