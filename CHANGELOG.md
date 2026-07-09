# Changelog

Notable changes to the kit convention (`kit.schema.json`) and tooling (`board.ts`, `new-kit.ts`).
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows SemVer (see the
README "Versioning" section). The canonical version number lives only in `kit.schema.json`
(`version`); this file is the only place release notes live.

## 0.6.4

### Added
- README: **"Sharing a live kit via a synced folder"** — documents the cross-machine/small-team pattern of sharing the whole kit folder through a synced folder (Dropbox, Nextcloud, OpenCloud, iCloud Drive, …). Because many sync clients do not follow symlinks (and some sync only one fixed folder per space), the working pattern inverts the usual layout: real bytes live **inside** the synced folder, a symlink in `kits/<slug>` points **in**. Includes the caveat to share only the text dossier, never a git worktree or build output. Convention/schema unchanged (doc-only).

## 0.6.3

### Changed
- `board.ts` now lists open markers (grouped by kit, priority-sorted) **by default**; pass `--brief` (or `--no-todos`) for the table-only view. The per-kit markers are the actionable detail, so the default view surfaces them — especially useful as a resume/handoff entry point after a context reset. `--todos` still works (now a no-op) for backward compatibility. Convention/schema unchanged: the `kit_version` compatibility check reads MAJOR.MINOR only, so all `0.6` kits stay valid.

## 0.6.2

### Added
- `watch.ts` now surfaces the **review decision** for open PR refs: `✓approved`, `⚠changes-requested`, or `review-required`. A change request also raises a `⚠` line flag, and the summary counts approvals and change requests. A review decision does not flip a PR's open/closed state, so the existing state/moved flags missed approvals and (more importantly) change requests; this closes that gap. Costs one extra `gh pr view` call per open PR ref. Convention/schema unchanged.

## 0.6.1

### Changed
- Renamed the project **`collaboration-kit` → `task-kit`** — clearer ("collaboration" over-claimed; it is a durable, personal-by-default folder per piece of work). Updated the repo, the schema `$id`, the tooling self-references, and the README tagline. Old GitHub URLs redirect. The convention itself is unchanged.

## 0.6.0

### Added
- `watch.ts` — checks the GitHub issues/PRs each kit references (from `links:`, markers, prose) via `gh`, flagging merged/closed (●) and anything that moved since the kit was last updated (▲). Read-only; requires an authenticated `gh`.
- Unit test for `watch.ts` ref extraction.

## 0.5.0

### Added
- Test suite (`bun test`): integration tests for `board.ts` and `new-kit.ts` — frontmatter parsing (trailing comments, block YAML), marker aggregation, slug ≠ folder, terminal-status hiding, lean vs contribution creation.
- `board.ts` warns when a kit's `kit_version` differs from the schema's `MAJOR.MINOR` (flags kits built under an older convention).

## 0.4.0

Close the loop: the full kit lifecycle and consumer onboarding are now covered.

### Added
- README "Adopt in a project" — how a project/teammate consumes the toolkit (clone + symlink `_work/collaboration-kit`, create `_work/kits` + `_work/kit-archive`, run tools from the project root, bun prerequisite).
- README "Releasing" — the release steps (bump schema, CHANGELOG, tag).
- Lifecycle: `board.ts` hides terminal-status kits (`merged`/`done`/`closed`) by default; `--all` shows them. Retiring a kit = move it to a sibling `kit-archive/`.

### Changed
- `template-contribution/SCOPE.md` status comment aligned with the schema enum.

## 0.3.0

### Changed
- The default `template/` is now lean and domain-agnostic (`Scope · Notes · Decision · Outcome · Next steps · Changelog`) — no code-fix sections, so a generic kit (setup, research, ops, design) carries no PR/repro noise.

### Added
- `template-contribution/` — the PR-yielding variant: adds `repos:`, the `Symptom`/`Reproduce`/`Gate`/`Merge order` sections, and the `issue.md` / `pr-body.md` stubs.
- `new-kit.ts --contribution` selects the contribution variant (default is lean).

## 0.2.1

### Added
- `AGENTS.md` — agent entry point that points to `README.md` (the single source), so the convention is self-discoverable when the repo is symlinked into a project.

### Changed
- Template `SCOPE.md` carries a concrete pointer to the conventions (local symlink path + canonical URL + `kit_version`) instead of a vague "see the repo README", so even a handed-off `SCOPE.md` resolves the convention.

## 0.2.0

The kit convention gains a machine-readable contract and tooling.

### Added
- `kit.schema.json` — generic kit frontmatter contract (required: `kit, title, status, created, updated`; optional: `kit_version, area, links`; `additionalProperties` allowed). `status` is an `enum` and the single source for the board's sort order.
- `board.ts` — read-only status board over `kits/*/SCOPE.md`; aggregates structured `TODO`/`DECISION`/`QUESTION`/`FIXME` markers (open unless `status=done`/`wontfix`); warns on drift (status off-enum, `kit` slug ≠ folder, malformed dates); reports the convention version.
- `new-kit.ts` — scaffold a kit from the template with the frontmatter stamped from the schema (including `kit_version`).
- Template (`template/SCOPE.md`): a structured TODO-marker example, `## Next steps`, and `## Changelog` sections.
- README: "The board" and "Versioning" (SemVer policy) sections.

### Notes
- SemVer policy: `kit.schema.json` is the contract; its compatibility sets the bump. The version lives only in the schema (`board.ts` reads it, the README never restates it) and release notes live only here, so a release touches just two files.

## 0.1.0

### Added
- Initial kit convention: a durable per-problem scratch folder with a `SCOPE.md` lead file (frontmatter + dossier sections) and a `template/` (`SCOPE.md`, `issue.md`, `pr-body.md`).
