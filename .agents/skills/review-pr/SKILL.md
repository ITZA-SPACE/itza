---
name: review-pr
description: Review a pull request in the ITZA monorepo against its linked issue, fix small problems directly on the PR branch, and merge into dev only after the user confirms CI is green. Use when the user runs /review-pr <pr-number> or asks to review a specific PR.
argument-hint: "[pr-number]"
arguments: [pr]
disable-model-invocation: true
model: claude-opus-5-5
effort: low
allowed-tools:
  - "Bash(gh pr view *)"
  - "Bash(gh pr diff *)"
  - "Bash(gh issue view *)"
  - "Bash(git *)"
  - "Bash(pnpm *)"
  - "Bash(uv *)"
---

# Review PR #$pr

## 1. Gather context

```bash
gh pr view $pr --json number,title,body,baseRefName,headRefName,files,closingIssuesReferences,mergeable,state
gh pr diff $pr
```

Open every linked issue (`closingIssuesReferences`, or `#n` in the body) with `gh issue view <n> --comments`. Note the acceptance criteria and the linked spec in `docs/`. If no issue is linked, review against the PR description and tell the user.

The PR must target `dev`. If it targets anything else, stop and tell the user.

## 2. Check out the branch

```bash
git fetch origin
git switch <headRefName> && git pull --ff-only
git merge origin/dev    # resolve conflicts here if any
```

## 3. Review

Read the full diff and the surrounding code. Use `differential-review` for security-relevant changes, plus the area skills listed in `/implement-issue` step 4. Check:

- **Correctness**: every acceptance criterion is met; edge cases; error handling.
- **Architecture**: workstream path boundaries (MVP_SCOPE §3); contracts in `schemas/`; reuse over duplication.
- **Security**: input validation at boundaries, secrets never in client or repo, CORS and origin rules.
- **Maintainability**: naming, size, no dead code or placeholders, no unneeded dependencies.
- **Regressions**: callers of changed code; docs still accurate.
- **Tests**: backend changes have unit and integration tests that would fail without the change.

## 4. Fix small issues directly

Fix what is small and clearly right (bugs, missing tests, lint, conflicts, typos, small refactors). For anything large or debatable, list it for the user instead of changing it.

```bash
pnpm check && pnpm build
git add -A
git commit -m "<type>(<scope>): <imperative summary>"   # one line per fix, no trailers
git push
```

## 5. Report and ask

Do not wait for CI or poll it. Summarize: verdict, fixes pushed (commit list), open concerns. End with exactly this question:

**CI is green?**

## 6. Merge only after a positive answer

Never merge without the user's explicit yes. If the answer is no or unclear, stop and help fix CI instead.

On yes:

```bash
gh pr merge $pr --squash --delete-branch          # merges into dev, deletes remote branch
gh issue close <issue> --comment "Done in #$pr" 2>/dev/null || true   # if not auto-closed
git switch dev && git pull --ff-only origin dev
git branch -D <headRefName> 2>/dev/null || true
git remote prune origin
gh pr view $pr --json state --jq .state            # expect MERGED
git status --short                                 # expect clean
```

Squash title: the PR title (Conventional Commit, one line, no AI mention). Report the final state to the user.
