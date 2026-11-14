@AGENTS.md

## Claude Code notes

- Project skills are in `.claude/skills/` (symlink to `.agents/skills/`); invoke the workflows as `/implement-issue <n>` and `/review-pr <n>`.
- Commit and PR attribution is disabled in `.claude/settings.json`; do not add trailers by hand.
- Personal overrides go in `CLAUDE.local.md` and `.claude/settings.local.json` (both git-ignored).
