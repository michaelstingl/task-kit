---
kit: <slug>
title: "<one-line problem or topic>"
status: active          # active | blocked | scoping | building | reviewing | submitted | parked | reference | merged | done | closed
area: [<tag>]           # optional: topic tags for filtering (board.ts)
links: [<org/repo#n>, <url>]   # optional: related issues / PRs / sources
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
repos:
  # code-contribution kits: one entry per repo+branch (delete the block for a non-code kit).
  # branch = the ownership marker: with one = you opened it, without = a repo you merely touch.
  - repo: owner/name    # replace with the real owner/name
    branch: fix/<slug>
    refs: []            # issues AND PRs as they are posted, e.g. [#12, #14] or [org/repo#34]; bare #n = this entry's repo. IN-FLIGHT ONLY — drop an entry once its work lands (watch.ts reconciles status: against these).
---

# Scope: <problem or topic>

> **Contribution kit** (yields an issue/PR): adds `repos:`, the Symptom / Reproduce / Gate / Merge-order sections, and `issue.md` / `pr-body.md`. For a non-code kit, use the lean `template/` instead.

One-paragraph dossier of the problem. **Kit conventions** (SCOPE.md format, markers, board): locally `_work/task-kit/README.md`, canonical <https://github.com/michaelstingl/task-kit> — this kit follows the `kit_version` (stamped by `new-kit.ts`).

<!--
Open work lives as structured TODO markers (HTML comments, invisible when rendered).
board.ts aggregates them; a marker counts as open unless status=done or status=wontfix.
Write one per item, each as its own comment, e.g.:
  <!- - TODO(owner=me, priority=high, due=2026-04-10, id=T001): what to do - ->
  <!- - DECISION(owner=me, id=D001): what to decide - ->
  <!- - QUESTION(owner=open, id=Q001): open question - ->
  <!- - FIXME(priority=low, id=F001): bug or inconsistency - ->
(Remove the spaces in the comment markers above — they are only here so this
example does not get picked up by the aggregator.)
-->

## Symptom

What is observably wrong. For a build/dependency bug, the symptom is the gate failing on a clean checkout. (Code/bugfix kits; delete for non-code kits.)

## Reproduce (the gate, before the fix)

```
<command that fails — typecheck / test / build>
# <the error, verbatim>
```

Static corroboration, if any (a grep, a missing entry). (Code/bugfix kits; delete otherwise.)

## Decision

The change, and why, plus the alternative you rejected. One or two lines for a small kit.

Constraint check: confirm the change respects the project's dominant constraint. Name it: a specification, an RFC, a license boundary, or a style guide. State whether it was a touchpoint; if not, say so.

## Gate (after the fix)

- `<typecheck>` → result
- `<test>` → result
- `<build>` → result

Diff scope: which files. Name any untested gap; the gate is the one check independent of reasoning. (Code/bugfix kits; delete otherwise.)

## Merge order

Only for cross-repo kits where one PR depends on another, such as a server endpoint before the client that calls it. Delete this section for a single-repo kit.

## Outcome

- Issue #<n> — <url> (state)
- PR #<n> — <url> (state)
- Branch `fix/<slug>` — (open / merged / deleted)

## Bodies in this kit

- `issue.md` — the issue body. (multi-repo: `issue-<repo>.md` per repo)
- `pr-body.md` — the PR body. (multi-repo: `pr-<repo>.md` per repo)

## Next steps

**Possibilities:**

- <what this kit could feed into next>

**Open items:**

- <decisions / actions still pending — or track them as TODO/DECISION markers above>

## Changelog

- **<YYYY-MM-DD>.** Kit created.
