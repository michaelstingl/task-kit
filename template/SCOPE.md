---
kit: <slug>
title: "<one-line problem or topic>"
status: active          # active | blocked | scoping | building | reviewing | submitted | parked | reference | merged | done | closed
area: [<tag>]           # optional: topic tags for filtering (board.ts)
links: [<org/repo#n>, <url>]   # optional: things you REFERENCE but do not own
# repos:                      # optional: your OWN work — one entry per repo+branch
#   - repo: <owner/name>      #   branch = the ownership marker: with one = you opened it,
#     branch: <fix/slug>      #   without = a repo you merely touch
#     refs: [#12, #14]        #   issues AND PRs, unlimited; bare #n = this entry's repo
#                             #   IN-FLIGHT ONLY — drop an entry once its work lands. watch.ts
#                             #   reconciles status: against these, so stale entries make it lie.
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

# Scope: <problem or topic>

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
example is not picked up by the aggregator.)
-->

## Notes

Working detail: investigation, findings, what was tried. Grows as the kit advances.

## Decision

The approach, and why, plus the alternative you rejected. One or two lines for a small kit.

## Outcome

What resulted — links to PRs, issues, docs, or artifacts, with their state.

## Next steps

**Possibilities:**

- <what this kit could feed into next>

**Open items:**

- <decisions / actions still pending — or track them as TODO/DECISION markers above>

## Changelog

- **<YYYY-MM-DD>.** Kit created.
