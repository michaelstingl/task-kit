# task-kit

> A durable folder per piece of work — an issue, a fix, an investigation. Personal by default, shareable on demand. (Scale-agnostic: a kit is one *problem*, any size — not tied to a scrum "task".)

A working convention: keep one durable scratch folder, a "kit," for each problem. The folder holds the problem's analysis, its build (a git worktree), and its issue and PR bodies. Keeping them together lets the work survive long sessions, keeps parallel tasks separate, and lets the pull request open from its own branch.

Released into the public domain under [CC0](LICENSE). No attribution required.

## Why

Work on a codebase is rarely one clean edit. It involves investigation, a few false starts, notes, a branch, and a draft of the pull request. Over a long session, or an AI-assisted one where the working context is easily lost, that material scatters: the notes sit in one place, the branch in another, and the PR text gets improvised at the end. Once two problems are open at the same time, switching branches in a single checkout adds friction.

A kit keeps everything for one problem in one named folder:

- It lives on disk rather than in memory or a chat window, so it survives an interruption or a context reset.
- Each problem gets its own git worktree, so several problems can be open at once without switching branches in the main checkout.
- The decision, the rejected alternative, the reproduction, and the verification evidence sit next to the diff, and the pull request opens from the kit's branch.

The convention is small. Most of it is a naming rule and a folder layout.

## Status

Experimental; the conventions will change. The canonical version lives once in `kit.schema.json` (`version`) and is reported by `board.ts`; release history is in [`CHANGELOG.md`](./CHANGELOG.md). A kit records the `MAJOR.MINOR` it was built under in `kit_version` (in `SCOPE.md`), so an older kit stays readable after the schema changes.

## The board

`board.ts` renders a read-only status board over `kits/*/SCOPE.md` and aggregates the structured TODO markers. **Requires [bun](https://bun.sh).**

```sh
bun board.ts            # table + open markers (grouped by kit, priority-sorted)
bun board.ts --brief    # table only (suppress the marker listing)
```

It reads the status order and field rules from `kit.schema.json` (one source) and warns on drift: status off-enum, `kit` slug ≠ folder name, `kit_version` skew (a kit built under an older convention), malformed dates. It is an **optional snapshot** — the markers and per-kit `## Changelog` inside each `SCOPE.md` remain the source of truth. Run `bun test` to exercise `board.ts` and `new-kit.ts`.

**Watch upstream:** `bun watch.ts` checks the GitHub issues/PRs your kits reference (from `links:`, markers, prose) and flags merged/closed (`●`) and anything that moved since the kit was last updated (`▲`). Read-only; requires an authenticated `gh`.

**Two changelogs, different scopes:** the repo-level `CHANGELOG.md` is release notes for this convention/tooling; a kit's own `## Changelog` is that kit's worklog. They never overlap.

**Lifecycle:** when a kit is finished, set `status: merged | done | closed` — `board.ts` hides those by default (`--all` shows them), so the board stays "what needs attention". To retire a kit entirely, move it out of `kits/` into a sibling `kit-archive/` (the board only scans `kits/`).

### Markers

Open work lives as HTML-comment markers inside any `*.md` in a kit (invisible when rendered):

```
<!-- TODO(owner=alice, priority=high, due=2026-04-10, id=T001): description -->
```

Kinds: `TODO` `FIXME` `DECISION` `QUESTION` `DEBT`. Attrs are optional; a marker counts as open unless `status=done`/`wontfix`. Edit the marker in place — never an aggregate.

**`DEBT` — a knowingly accepted shortcut** (a lightweight [Technical Debt Record](https://www.workingsoftware.dev/technical-debt-records/)), distinct from `DECISION` (a choice) by one required attr: **`trigger=`**, the condition under which the debt is repaid. The trigger is what stops accepted debt from rotting — the documented failure mode of a plain `TODO` nobody revisits. `board.ts` flags a `DEBT` marker that is missing `trigger=`.

```
<!-- DEBT(owner=alice, id=D1, trigger=before v2 ships): auth uses a shared secret · accepted-because: deadline · blast-radius: all tenants if leaked -->
```

**Lifecycle — kit until graduation, then the project's own structure.** A `DEBT` marker is the *working* form while the problem lives in a kit. When the work graduates, the debt graduates with it: promote the marker into the project repo's own convention — e.g. a `docs/debt/` Technical Debt Record — so it becomes durable, reviewable team knowledge rather than a note in personal scratch. Carry the same fields across (what · accepted-because · blast-radius · **trigger** · owner). The kit marker is transient; the repo record is where a graduated debt lives.

## Versioning

Semantic versioning. `kit.schema.json` is the contract, so its compatibility sets the bump:

- **MAJOR** — breaking: a new required field, a removed or renamed field, a tightened type/enum that invalidates existing kits, or an incompatible marker-syntax change. Old kits, or an older `board.ts`, may stop working.
- **MINOR** — additive, backward-compatible: a new optional field, a new allowed value or marker kind, a new `board.ts` feature. Old kits stay valid; an older board still works.
- **PATCH** — no contract change: a `board.ts` fix or a doc/wording change.

`kit.schema.json` (`version`) and `board.ts` (which reads it) carry the full `MAJOR.MINOR.PATCH`. Each kit's `kit_version` records only the `MAJOR.MINOR` it was built under — enough to know which contract it follows; PATCH does not affect reading.

While `0.x` (experimental), a MINOR may still break. The first plugin/skill release cuts `1.0.0`; after that strict SemVer applies and the plugin's `plugin.json` version tracks the convention version.

**Single source of truth (so a release touches as few files as possible):** the version number lives only in `kit.schema.json` (`version`) — `board.ts` reads it, the README never restates it. Release notes live only in `CHANGELOG.md`. A PATCH/MINOR release therefore touches exactly two files: `kit.schema.json` and `CHANGELOG.md`. (`kit_version` in a kit is a per-kit stamp set by `new-kit.ts`, not a copy of the release version.)

### Releasing

1. Bump `version` in `kit.schema.json`.
2. Add the matching entry to `CHANGELOG.md`.
3. Tag and push: `git tag vX.Y.Z && git push --tags` (optionally `gh release create vX.Y.Z` with the CHANGELOG section as notes).

Nothing else carries the number, so there is nothing else to update.

## Personal by default, shareable on demand

A kit usually lives in one person's own gitignored scratch, private to that person. That fits most cases, because a kit is working notes and the pull request is what others read. When a handoff or a review calls for it, the kit can be shared. The unit to share is `SCOPE.md`, the dossier that records the decision, the rejected alternative, the reproduction, and the verification evidence. Post it into the issue or PR thread, or hand over the folder. The `kit_version` field tells the reader which conventions it follows.

### Sharing a live kit via a synced folder

For ongoing cross-machine or small-team work you can share the whole kit folder — not just `SCOPE.md` — through a synced folder (Dropbox, Nextcloud, OpenCloud, iCloud Drive, …), so the dossier stays live as the work advances.

The obstacle is that many sync clients do not follow symlinks, and some (e.g. the OpenCloud desktop client) only sync one fixed folder per synced space, not an arbitrary local path. So symlinking `kits/<slug>` straight at a synced location does not sync. The pattern that works inverts it: keep the real bytes **inside** the synced folder and put the symlink **outside**, pointing in.

```sh
# once: mv the kit into the synced folder, then symlink it back into kits/
mv _work/kits/<slug> "<synced-folder>/<slug>"
ln -s "<synced-folder>/<slug>" _work/kits/<slug>
```

Your tooling keeps using `_work/kits/<slug>` (`board.ts` resolves through the symlink); the client syncs the bytes. Add `.git` and OS cruft (`.DS_Store`) to the client's ignored-files list.

**Share only the dossier, never a build.** A kit that carries a git worktree or build output (`.git`, `node_modules`, a Rust `target/`) is the wrong thing to push into a synced folder — it is large, reproducible, and the worktree pointer breaks when relocated. Keep those local; share the text. When a kit is finished, remove its worktree with `git worktree remove` (not `rm -rf`, which leaves a stale registration) and move the kit to `kit-archive/`.

## Adopt in a project

The kit system is consumed by symlinking this repo into a project's gitignored scratch.
**Requires [bun](https://bun.sh).** Once, from the project root:

```sh
git clone https://github.com/michaelstingl/task-kit   # anywhere stable
ln -s <relative-path-to-the-clone> _work/task-kit      # gitignored; relative so it travels within a consistent layout
mkdir -p _work/kits _work/kit-archive
```

Then create and view kits **from the project root** (not from inside the clone):

```sh
bun _work/task-kit/new-kit.ts <slug> --title "..."   # add --contribution for a PR kit
bun _work/task-kit/board.ts                          # overview (--todos, --all)
bun _work/task-kit/watch.ts                          # what moved in referenced issues/PRs (needs gh)
```

`_work/` is personal and gitignored, so each teammate repeats the symlink on their own machine (it is not committed). For a fresh agent session, point it at `_work/task-kit/AGENTS.md`.

## Naming

```
kits/<slug>/
```

A kit is named after the problem, not the issue number. Issue and PR numbers live only in the `SCOPE.md` frontmatter, so there is no rename from a placeholder to a number when the issue is filed.

- The folder name is the problem slug. Do not put the issue number in it.
- For a single-repo problem, the slug may carry the repo name as a scanning hint, such as `webapp-dark-mode/`. For a cross-repo problem, the slug is just the problem, such as `session-expiry/`.
- Numbers are assigned at post time and change; the slug is known up front and stays fixed. Naming on the fixed value removes the rename.

## Starting a kit

Use the helper (stamps `kit`, `kit_version`, dates, status from the schema — requires bun):

```sh
bun new-kit.ts <slug> --title "what it is"           # lean kit (default)
bun new-kit.ts <slug> --title "..." --contribution   # kit that yields an issue/PR
```

There are two shapes:

- **Lean kit** (default, `template/`): a domain-agnostic `SCOPE.md` — Scope · Notes · Decision · Outcome · Next steps · Changelog. For setup, research, ops, design, or any non-code problem.
- **Contribution kit** (`--contribution`, `template-contribution/`): adds `repos:`, the Symptom / Reproduce / Gate / Merge-order sections, and `issue.md` / `pr-body.md` stubs (with `<!-- guidance -->` comments to delete before posting).

To copy by hand instead: `cp -r template _work/kits/<slug>` (or `template-contribution`). The template is a copy source, not a kit.

## What's in a kit

A **lean kit** is just its dossier:

```
kits/<slug>/
  SCOPE.md        the dossier (Scope, Notes, Decision, Outcome, Next steps, Changelog)
  PLAN.md           optional: for real investigations (theses, alternatives, dated worklog)
```

A **contribution kit** adds the PR machinery:

```
kits/<slug>/
  SCOPE.md        + Symptom / Reproduce / Gate / Merge-order, and repos: in the frontmatter
  <repo>-fix/       git worktree where the branch is built and verified
  issue.md          the issue body (one physical line per paragraph or bullet)
  pr-body.md        the PR body (same line grammar)
  FIX-PLAN.md       optional: when the approach needs a written design brief
```

A cross-repo problem uses one kit with one worktree per repo and one body pair per repo. A single `SCOPE.md` covers the whole problem:

```
kits/session-expiry/
  SCOPE.md             one dossier for the whole problem
  server-fix/          worktree, branch fix/session-expiry
  client-fix/          worktree, branch fix/session-expiry
  issue-server.md  pr-server.md
  issue-client.md  pr-client.md
```

`SCOPE.md` carries light YAML frontmatter so kits stay scannable. The authoritative field list and validation rules live in [`kit.schema.json`](./kit.schema.json) — this prose does not re-enumerate them, to avoid drift. `repos:` is an optional list of one or more entries (for kits that yield a PR), so a single-repo kit is a one-element list and nothing changes when a second repo joins:

```yaml
---
kit: session-expiry
title: "session expiry: server cutoff + client re-auth prompt"
status: building        # scoping, building, submitted, merged, closed, parked. Kit-level; merged only once every repo's PR is in.
created: 2026-06-02
updated: 2026-06-02
repos:
  - repo: example/server
    branch: fix/session-expiry
    issue: 12
    pr: 14
  - repo: example/client
    branch: fix/session-expiry
    issue: 5
    pr: 7
---
```

## Worktree per repo

Each repo a problem touches gets its own git worktree, created inside the kit. A single-repo problem has one. If the repos are sibling checkouts in a multi-repo workspace, a cross-repo problem has several side by side. The worktree isolates the work so several problems can be open at once without switching branches in the main checkout, it survives a long session, and the pull request opens from that branch.

Create one worktree per repo into the kit, all on the same branch name `fix/<slug>`:

```sh
git -C client worktree add \
  _work/kits/<slug>/client-fix \
  -b fix/<slug> origin/main
# cross-repo: repeat per repo into the same kit
git -C server worktree add \
  _work/kits/<slug>/server-fix \
  -b fix/<slug> origin/main
```

Build and verify inside each worktree: change into `<repo>-fix`, install, and run that repo's checks. A worktree shares its repo's object store but keeps its own HEAD, so the main checkout is untouched. Worktrees are cheap to recreate, so they are not precious, but keeping them in the kit means the build survives a long session.

Record each repo's branch and PR in the `repos:` frontmatter. Remove a worktree once its PR merges. Use `git worktree remove` rather than `rm -rf`: a manual delete leaves a stale registration in the repo's `.git/worktrees/` that then needs `git worktree prune`.

```sh
git -C client worktree remove _work/kits/<slug>/client-fix
```

Keep each branch until its PR is merged or closed.

### Coordinating cross-repo PRs

When one problem spans repos, the PRs are separate but related:

- Each PR body references the others, such as "part of session-expiry; depends on server#14", so a reviewer sees the whole shape.
- `SCOPE.md` records a merge order when one repo depends on another, such as a server endpoint before the client that calls it. The kit's `status` reaches `merged` only once every repo's PR is in.

## File grammar

- GitHub bodies use one physical line per paragraph or bullet, because GitHub renders single newlines as hard breaks. These documentation files wrap normally.
- Start an outward artifact's filename with its object type (`issue-`, `pr-`) so it is easy to place at a glance.
- Name a body by its repo, not by issue or PR number: `issue.md` and `pr-body.md` for a single-repo kit, `issue-<repo>.md` and `pr-<repo>.md` when the kit spans repos. The repo is known up front; the number is not. This is the same reason the folder drops the number.
- Prefix a throwaway draft with `_`, such as `_pr-body-v2.md`. The file without the prefix is the one to post.
- Keep one canonical document per role. Iterate inside it rather than spawning `SCOPE-v2.md`.

## Rules of thumb

- The verification gate, meaning the compiler, the tests, the linter, and CI, is the one check that does not depend on the author's reasoning. Show that the problem fails the gate, show that the fix passes it, and state any untested gap. Put evidence before assertions.
- Ground the change against the project's dominant constraint, whether a specification, an RFC, a license boundary, or a style guide. Name the constraint. If a change risks it, stop and flag it.
- Helper scripts such as repro drivers and probes live in the kit, not in `/tmp`. If it is worth re-running after a context reset, it belongs in the kit.
- Do not clean up unrelated code while fixing a problem. One PR, one change.
- A problem that is only observed, not investigated, stays at `SCOPE.md` alone.

## Lineage

The convention was distilled from a contribution-method playbook used in practice and refined across real pull requests. The idea that carries over is that the verification gate is the only check independent of the author's reasoning, and that one durable folder per problem works better than scattered notes.
