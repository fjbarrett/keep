# AGENTS.md — how to work in this repo

Keep is a Next.js notes app (keeptxt.com, App Router) plus native SwiftUI
clients under `ios/`. The git history and PR descriptions are part of the
product — treat them with the same care as the code.

## Before you start

- Read `HISTORY.md` (agent state, task queue, conventions) and this file.
- For web work, follow the Task Queue order in `HISTORY.md`; slices have
  their own done-criteria and release gates.

## Git — every change ships on a branch

- Never commit to `main`. Cut `feat/…`, `fix/…`, or `chore/…` from `main`
  (or the assigned base) and land through a PR.
- Assume other agents are working in this repo right now. See
  **Concurrent sessions** below — it overrides convenience every time.

## Concurrent sessions — two or more agents, one repo

Sessions step on each other through the checkout, the branch list, and
shared files. Default to isolation; coordinate only through git.

- **Survey before you touch anything.** Open with `git worktree list`,
  `git status`, `git branch --show-current`, and `git log --oneline -5`.
  Know who is where before you act.
- **One task, one worktree, one branch.** Never work in the main checkout
  or another session's worktree. Create your own:
  `git worktree add .claude/worktrees/<task> -b <branch> main`, work only
  there, and remove it (`git worktree remove`) when the PR merges.
- **Never switch branches in a checkout you didn't create.** Another
  session may be mid-run there; a checkout swap or commit can strand or
  sweep up their work.
- **Only touch your own branches.** Never commit, amend, rename, or
  delete a branch another session owns. Ownership signals: it's checked
  out in their worktree, they created it, or their HISTORY row claims it.
  Stale-branch cleanup across owners needs an explicit user go-ahead that
  names the branch.
- **Only touch your own files.** Never commit files you didn't change —
  stage paths explicitly (`git add <paths>`), never `git add -A` / `commit
  -a` in a shared tree.
- **Claim narrowly, release promptly.** Announce your scope in a HISTORY
  row when you start (`<branch>` + one line on the task) and close it when
  the PR merges. Overlap with someone's claim means stop and ask the user
  instead of racing them.
- **Shared files are append-mostly.** `HISTORY.md` rows append; never
  rewrite another session's rows. Re-read a shared file right before
  editing it — assume it changed since you last looked.
- **Sync through main, not each other.** Rebase your branch on `main`
  before opening the PR and rerun the gates after. If a sibling's merge
  broke you, fix your side; never rewrite theirs.
- **Talk when the runtime allows it.** If peer sessions are reachable,
  announce start (branch + scope) and finish (PR link or stop reason).
  If not, the HISTORY rows are the channel — keep yours current.
- One concern per PR. Keep it under 300 LOC (500 hard ceiling); bigger
  work splits into stacked or sequential PRs.
- Commit messages: lowercase type prefix, single-sentence subject, body
  explains the **why**. Record the authoring model with a `Model:` trailer
  plus `Co-Authored-By`.
- Before every commit: scan the staged diff for secrets/credentials, and
  run the gates below. Never commit red — if a gate can't run, say which
  one in the commit body.

## GitHub — push and open a PR

- Push the branch to `origin` (create the remote repo as private if one
  doesn't exist) and open a PR with `## Summary` and `## Test plan`.
- Squash-merge, then delete the branch. Merging to `main` auto-deploys
  production — never push to `main` directly.

## Verification gates (run before you commit)

- Web: `npm test`, `npx tsc --noEmit`; `npm run build` for anything
  affecting rendering or routing.
- `ios/` changes: regenerate after adding files (`cd ios && xcodegen
  generate`), then build the Mac scheme with `xcodebuild`.
- If a gate can't run here, say so in the PR instead of implying green.

## Ask before

- Force-push, history rewrites, deleting someone else's branch, deploys
  outside CI, and any change to hosting, DNS, or access control.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
