#!/usr/bin/env node
// Keeps the ITZA GitHub Project board (orgs/ITZA-SPACE/projects/1) in step with the issues.
//
//   node scripts/board.mjs set <issue> "<status>"   move one issue (adds it to the board if missing)
//   node scripts/board.mjs sync [--dry-run]          recompute every issue's status from GitHub state
//
// Sync rules, first match wins:
//   closed issue                          -> Done
//   open non-draft PR for the issue       -> In review
//   draft PR for the issue                -> In progress
//   an open issue blocks it               -> Backlog
//   assigned                              -> In progress
//   otherwise                             -> Ready
//
// A PR belongs to an issue through its branch name (<type>/<issue>-<slug>) or a
// "Closes #<issue>" line in its body. Needs the GitHub CLI with the `project` scope.

import { execFileSync } from "node:child_process";

const REPO = "ITZA-SPACE/itza";
const OWNER = "ITZA-SPACE";
const PROJECT = "1";
const STATUSES = ["Backlog", "Ready", "In progress", "In review", "Done"];

const gh = (...args) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const ghJson = (...args) => JSON.parse(gh(...args));

function board() {
  const projectId = ghJson("project", "view", PROJECT, "--owner", OWNER, "--format", "json").id;
  const status = ghJson(
    "project",
    "field-list",
    PROJECT,
    "--owner",
    OWNER,
    "--format",
    "json",
  ).fields.find((field) => field.name === "Status");
  const options = new Map(status.options.map((option) => [option.name, option.id]));
  for (const name of STATUSES) {
    if (!options.has(name))
      throw new Error(`Status option "${name}" is missing on the project board`);
  }
  return { projectId, fieldId: status.id, options };
}

function boardItems() {
  const { items } = ghJson(
    "project",
    "item-list",
    PROJECT,
    "--owner",
    OWNER,
    "--limit",
    "1000",
    "--format",
    "json",
  );
  const byIssue = new Map();
  for (const item of items) {
    if (item.content?.type === "Issue" && item.content.repository === REPO) {
      byIssue.set(item.content.number, { id: item.id, status: item.status ?? "" });
    }
  }
  return byIssue;
}

function addItem(issue) {
  const url = `https://github.com/${REPO}/issues/${issue}`;
  return ghJson("project", "item-add", PROJECT, "--owner", OWNER, "--url", url, "--format", "json")
    .id;
}

function setStatus(ctx, itemId, status) {
  gh(
    "project",
    "item-edit",
    "--project-id",
    ctx.projectId,
    "--id",
    itemId,
    "--field-id",
    ctx.fieldId,
    "--single-select-option-id",
    ctx.options.get(status),
  );
}

function linkedPrs() {
  const prs = ghJson(
    "pr",
    "list",
    "-R",
    REPO,
    "--state",
    "open",
    "--limit",
    "500",
    "--json",
    "number,headRefName,isDraft,body",
  );
  const byIssue = new Map();
  for (const pr of prs) {
    const issues = new Set();
    const branch = /^[^/]+\/(\d+)-/.exec(pr.headRefName);
    if (branch) issues.add(Number(branch[1]));
    for (const match of (pr.body ?? "").matchAll(
      /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi,
    )) {
      issues.add(Number(match[1]));
    }
    for (const issue of issues) {
      const ready = byIssue.get(issue) === "ready" || !pr.isDraft;
      byIssue.set(issue, ready ? "ready" : "draft");
    }
  }
  return byIssue;
}

function isBlocked(issue) {
  const blockers = ghJson("api", `repos/${REPO}/issues/${issue}/dependencies/blocked_by`);
  return blockers.some((blocker) => blocker.state === "open");
}

function targetStatus(issue, prs) {
  if (issue.state === "CLOSED") return "Done";
  const pr = prs.get(issue.number);
  if (pr === "ready") return "In review";
  if (pr === "draft") return "In progress";
  if (isBlocked(issue.number)) return "Backlog";
  return issue.assignees.length > 0 ? "In progress" : "Ready";
}

function set(issueArg, status) {
  const issue = Number(issueArg);
  if (!Number.isInteger(issue) || !STATUSES.includes(status)) usage();
  const ctx = board();
  const itemId = boardItems().get(issue)?.id ?? addItem(issue);
  setStatus(ctx, itemId, status);
  console.log(`#${issue} -> ${status}`);
}

function sync(dryRun) {
  const ctx = board();
  const items = boardItems();
  const prs = linkedPrs();
  const issues = ghJson(
    "issue",
    "list",
    "-R",
    REPO,
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,state,assignees",
  );
  issues.sort((a, b) => a.number - b.number);
  for (const issue of issues) {
    const target = targetStatus(issue, prs);
    const current = items.get(issue.number);
    if (current?.status === target) continue;
    console.log(
      `#${issue.number}: ${current ? current.status || "(none)" : "(not on board)"} -> ${target}`,
    );
    if (dryRun) continue;
    setStatus(ctx, current?.id ?? addItem(issue.number), target);
  }
}

function usage() {
  console.error('Usage: node scripts/board.mjs set <issue> "<status>" | sync [--dry-run]');
  console.error(`Statuses: ${STATUSES.join(", ")}`);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (command === "set" && args.length === 2) set(args[0], args[1]);
else if (command === "sync") sync(args.includes("--dry-run"));
else usage();
