---
name: implement-issue
description: Implement a GitHub issue end to end in the ITZA monorepo, from reading the issue to opening a PR against dev. Use when the user runs /implement-issue <issue-number> or asks to implement a specific issue.
argument-hint: "[issue-number]"
arguments: [issue]
disable-model-invocation: true
model: claude-sonnet-5-5
effort: low
allowed-tools:
  - "Bash(gh issue view *)"
  - "Bash(gh issue edit *)"
  - "Bash(gh api user *)"
  - "Bash(node scripts/board.mjs *)"
  - "Bash(gh pr create *)"
  - "Bash(git *)"
  - "Bash(pnpm *)"
  - "Bash(uv *)"
---

# Implement issue #$issue

Follow every step in order. Stop and ask the user only when the issue is ambiguous in a way the docs do not resolve.

**Commit rule (whole workflow):** commit after every completed step of work (each module, endpoint, test set or fix), not once per PR. Every commit is a one-line Conventional Commit (`<type>(<scope>): <imperative summary>`), with no body, no `Co-Authored-By` or other trailers, and no mention of AI tools.

## 0. Pull main and dev first

Start from the latest remote state before reading any code:

```bash
git fetch origin --prune
git switch main && git pull --ff-only origin main
git switch dev && git pull --ff-only origin dev
```

If either pull fails (local changes or diverged branch), stop and ask the user.

## 1. Understand the issue

```bash
gh issue view $issue --comments --json number,title,body,labels,comments,milestone,assignees
```

Check the assignees against the current GitHub user (`gh api user --jq .login`) and always tell the user what you found:

- **Assigned to someone else:** say "Issue #$issue is already assigned to <logins>", then stop and ask whether to continue (another teammate is likely implementing it). Do not assign yourself unless the user says yes.
- **Already assigned to you:** say "Issue #$issue is already assigned to you" and continue (you are resuming your own work).
- **Unassigned:** assign it to yourself so the team sees it is in progress, and say so:

```bash
gh issue edit $issue --add-assignee @me
```

Then move the issue to **In progress** on the project board (https://github.com/orgs/ITZA-SPACE/projects/1):

```bash
node scripts/board.mjs set $issue "In progress"
```

If the issue is still blocked by an open issue (`gh api repos/ITZA-SPACE/itza/issues/$issue/dependencies/blocked_by`), tell the user and ask before starting.

Extract: goal, acceptance criteria, linked requirement or feature IDs (FR-xx, F-xx), workstream and paths. If the issue has no acceptance criteria, derive them from the linked spec in `docs/FEATURES.md` and state them before coding.

## 2. Build context

- Read `AGENTS.md` (already loaded), then only the doc sections the issue touches: `PRD.md`, `docs/FEATURES.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/MVP_SCOPE.md` §3 (owned paths).
- Inspect the code you will change and its neighbors. Reuse existing patterns, helpers and types.
- Write a 3 to 6 line plan (files, approach, tests) into the PR description draft so a new session can pick up the work.

## 3. Branch from an up-to-date dev

```bash
git switch dev                          # already pulled in step 0
git merge --no-edit main         # dev always contains main; stop and ask if this conflicts
git push origin dev                     # only if the merge added commits
git switch -c <type>/$issue-<short-slug>
```

`<type>` is the Conventional Commit type that fits (feat, fix, refactor, docs, test, chore, ci, build, perf).

## 4. Apply the right skills

Load the installed skills that match the files you touch:

| Area | Skills |
|---|---|
| `services/science-api` | `fastapi`, `modern-python` (project tooling wins: mypy, not ty) |
| Engine math, parsers, validators | `property-based-testing` |
| `apps/web`, `packages/ui-kit` | `vercel-react-best-practices`, `web-design-guidelines` |
| `services/si-gateway` | `workers-best-practices`, `wrangler` |
| `pipelines/`, `infra/brev` | `brev-cli` |

## 5. Implement

- Stay inside the paths the issue names. No placeholders, no speculative abstractions, no unrequested dependencies.
- Backend changes (`services/*`) must include unit and integration tests. Frontend needs no written tests.
- User-facing text goes in `apps/web/src/copy/en.json`.
- Update the matching `docs/` file if behavior or a contract changed.
- Work in small steps and commit each one as soon as it is complete and its focused checks pass:

```bash
git add <files of this step>
git commit -m "<type>(<scope>): <imperative summary>"   # one line, no trailers
```

## 6. Verify and fix

Run the checks for what changed, then the full gate:

```bash
pnpm --filter <package> test        # each touched backend package
pnpm check                          # lint, format check, typecheck, tests
pnpm build
```

If `format:check` fails, run `pnpm format`. Fix every failure your change introduced and re-run until green. Do not weaken tests or thresholds to pass. Commit each fix separately with its own one-line message (e.g., `fix(engine): clamp depletion at taw`, `style: apply formatter`).

## 7. Push and open the PR

All work is already committed step by step; `git status` must be clean (commit any leftover with a one-line message).

```bash
git push -u origin HEAD
gh pr create --base dev --title "<type>(<scope>): <summary of the whole issue>" --body "<body>"
node scripts/board.mjs set $issue "In review"
```

Open the PR ready for review (not as a draft), then move the issue to **In review** as shown.

PR body: what and why (2 to 4 lines), the plan from step 2, checks run, and `Closes #$issue`. Never mention AI tools or add co-author lines.

## 8. Report

Give the user the PR URL, the branch name, and anything left unverified.
