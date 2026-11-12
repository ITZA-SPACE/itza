---
name: review-pr
description: Review a pull request in the ITZA monorepo against its linked issue, finish any part of the issue the PR leaves undone, fix small problems directly on the PR branch, and merge into dev only after the user confirms CI is green. Use when the user runs /review-pr <pr-number> or asks to review a specific PR.
argument-hint: "[pr-number]"
arguments: [pr]
disable-model-invocation: true
model: claude-opus-5-5
effort: low
allowed-tools:
  - "Bash(gh pr view *)"
  - "Bash(gh pr edit *)"
  - "Bash(gh api user *)"
  - "Bash(node scripts/board.mjs *)"
  - "Bash(gh pr diff *)"
  - "Bash(gh issue view *)"
  - "Bash(git *)"
  - "Bash(pnpm *)"
  - "Bash(uv *)"
---

# Review PR #$pr

## 1. Gather context

```bash
gh pr view $pr --json number,title,body,baseRefName,headRefName,files,closingIssuesReferences,mergeable,state,assignees
gh pr diff $pr
```

Open every linked issue (`closingIssuesReferences`, or `#n` in the body) with `gh issue view <n> --comments`. Note the acceptance criteria and the linked spec in `docs/`. If no issue is linked, review against the PR description and tell the user.

The PR must target `dev`. If it targets anything else, stop and tell the user.

Check the PR's `assignees` against the current GitHub user (`gh api user --jq .login`) and always tell the user what you found:

- **Assigned to someone else:** say "PR #$pr is already assigned to <logins>", then stop and ask whether to continue (another teammate is likely reviewing it). Do not assign yourself unless the user says yes.
- **Already assigned to you:** say "PR #$pr is already assigned to you" and continue.
- **Unassigned:** assign it to yourself so the team sees who is reviewing it, and say so:

```bash
gh pr edit $pr --add-assignee @me
```

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

## 4. Finish the issue if the PR is incomplete

Compare the PR against every acceptance criterion and scope item of the linked issue. If the PR implements only part of the issue (for example, someone opened a PR for half of it), finish the rest yourself on the PR branch so that merging the PR fully closes the issue:

- Tell the user which criteria were missing before you start.
- Implement the missing parts following `/implement-issue` steps 2, 4 and 5: same owned paths, conventions, skills and tests (backend changes need unit and integration tests).
- Commit after every completed step, never one big commit at the end. Every commit is a one-line Conventional Commit (`<type>(<scope>): <imperative summary>`), with no body, no `Co-Authored-By` or other trailers, and no mention of AI tools.
- Push each commit straight to the PR branch (`git push`), so the PR always shows the progress.
- Update the PR description so it lists everything the PR now covers and keeps `Closes #<issue>`.

```bash
git add <files of this step>
git commit -m "<type>(<scope>): <imperative summary>"
git push
```

Stop and ask the user only if the missing part is ambiguous in a way the docs do not resolve, or clearly belongs in a separate issue.

## 5. Fix small issues directly

Fix what is small and clearly right (bugs, missing tests, lint, conflicts, typos, small refactors). For anything large or debatable that is not part of the issue scope, list it for the user instead of changing it.

```bash
pnpm check && pnpm build
git add -A
git commit -m "<type>(<scope>): <imperative summary>"   # one line per fix, no trailers
git push
```

## 6. Report and ask

Do not wait for CI or poll it. Summarize: verdict, any issue scope you completed, fixes pushed (commit list), open concerns. End with exactly this question:

**CI is green?**

## 7. Merge only after a positive answer

Never merge without the user's explicit yes. If the answer is no or unclear, stop and help fix CI instead.

On yes:

```bash
gh pr merge $pr --squash --delete-branch          # merges into dev, deletes remote branch
gh issue close <issue> --comment "Done in #$pr"   # PRs into dev never auto-close issues
node scripts/board.mjs sync                        # issue -> Done, newly unblocked issues -> Ready
git switch dev && git pull --ff-only origin dev
git branch -D <headRefName> 2>/dev/null || true
git remote prune origin
gh pr view $pr --json state --jq .state            # expect MERGED
git status --short                                 # expect clean
```

Squash title: the PR title (Conventional Commit, one line, no AI mention). `board.mjs sync` prints every status it changed: the closed issue moves to **Done**, and each issue whose last open blocker was this one moves from **Backlog** to **Ready**, so **Backlog** only holds blocked issues. Report the final state to the user, including the issues that are now Ready.
