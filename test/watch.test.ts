// Unit test for watch.ts ref extraction + status reconcile (the network part is exercised live, not here).
import { test, expect } from "bun:test";
import { refsFromText, parseRepos, ownRefs, parseStatus, isStale } from "../watch.ts";

test("refsFromText extracts org/repo#n and github issue/pull URLs, deduped", () => {
  const refs = refsFromText(`
    see foo/bar#12 and again foo/bar#12
    pr https://github.com/octo/repo/pull/34
    issue https://github.com/octo/repo/issues/56
    a plain a/b without a number is not a ref
  `);
  expect(refs).toContain("foo/bar#12");
  expect(refs).toContain("octo/repo#34");
  expect(refs).toContain("octo/repo#56");
  expect(refs.filter((r) => r === "foo/bar#12").length).toBe(1); // deduped
  expect(refs.some((r) => r.startsWith("a/b#"))).toBe(false);    // no number → ignored
});

test("refsFromText resolves bare #N against a default repo, leaves qualified refs intact", () => {
  const refs = refsFromText("part of #235; see also foo/bar#12", "perf/cockpit");
  expect(refs).toContain("perf/cockpit#235");   // bare → default repo
  expect(refs).toContain("foo/bar#12");          // qualified stays qualified
  expect(refs).not.toContain("perf/cockpit#12"); // #12 belongs to foo/bar, not defaulted
});

test("refsFromText without a default repo ignores bare #N (no false refs)", () => {
  const refs = refsFromText("this fixes #235 somehow");
  expect(refs.some((r) => r.endsWith("#235"))).toBe(false);
});

// The 0.8 shape: issues and PRs live together in `refs`, unlimited, one notation.
const SCOPE = `---
kit: sample
status: submitted
repos:
  - repo: perf/cockpit
    branch: feat/foo
    refs: [#235, perf/cockpit#364, other/repo#9]
  - repo: perf/other
    branch:
    refs: [#92]
  - repo: perf/nobr
    branch: feat/bar
    refs: []
---
body text`;

// The pre-0.8 shape, which must keep working: nobody's data disappears on upgrade.
const LEGACY = `---
kit: sample
status: submitted
repos:
  - repo: perf/cockpit
    branch: feat/foo
    issue: 235
    pr: 364
  - repo: perf/other
    branch:
    issue: 91
    pr: 92
  - repo: perf/nobr
    branch: feat/bar
    issue:
    pr:
---
body text`;

test("parseRepos reads refs, resolving bare #n against the entry's own repo", () => {
  const r = parseRepos(SCOPE);
  expect(r.length).toBe(3);
  expect(r[0]).toEqual({
    repo: "perf/cockpit",
    branch: "feat/foo",
    // #235 -> this entry's repo; an already-qualified ref is left alone, even a foreign one
    refs: ["perf/cockpit#235", "perf/cockpit#364", "other/repo#9"],
  });
  expect(r[1].branch).toBeUndefined();  // empty `branch:` value
  expect(r[2].refs).toEqual([]);        // empty list is not an error
});

test("parseRepos accepts refs as a block list too", () => {
  const r = parseRepos(`---
kit: sample
status: building
repos:
  - repo: perf/cockpit
    branch: feat/foo
    refs:
      - #1
      - perf/other#2
  - repo: perf/second
    branch: feat/bar
    refs: [#3]
---`);
  expect(r[0].refs).toEqual(["perf/cockpit#1", "perf/other#2"]);
  expect(r[1].refs).toEqual(["perf/second#3"]);   // the block list must not swallow the next entry
});

test("parseRepos still reads the legacy pr:/issue: scalars, folding both into refs", () => {
  const r = parseRepos(LEGACY);
  // issue: 235 was written by 30 kits and read by NOTHING before 0.8 — picking it up is the point.
  // Order follows the FILE (issue: sits above pr:), not the parser's branch order — refs are a
  // set in spirit, so this asserts the real reading order rather than an imagined one.
  expect(r[0].refs).toEqual(["perf/cockpit#235", "perf/cockpit#364"]);
  expect(r[1].refs).toEqual(["perf/other#91", "perf/other#92"]);
  expect(r[2].refs).toEqual([]);        // empty values stay empty, not "#undefined"
});

test("ownRefs: the BRANCH is the ownership marker — every ref of an entry that has one", () => {
  const own = ownRefs(SCOPE);
  // issues count as ours too: an open issue is open work, so isStale stays conservative
  expect(own).toEqual(["perf/cockpit#235", "perf/cockpit#364", "other/repo#9"]);
  expect(own).not.toContain("perf/other#92");   // no branch → referenced, not ours (WSR-D2)
});

test("ownRefs on the legacy shape yields what the old ownPrRefs did, plus the issue", () => {
  const own = ownRefs(LEGACY);
  expect(own).toContain("perf/cockpit#364");    // what the old parser found
  expect(own).toContain("perf/cockpit#235");    // what it silently dropped
  expect(own).not.toContain("perf/other#92");   // empty branch → still not ours
});

test("parseStatus reads the frontmatter status", () => {
  expect(parseStatus(SCOPE)).toBe("submitted");
});

test("isStale: all own PRs terminal but status still open → stale", () => {
  expect(isStale("submitted", ["merged"])).toBe(true);
  expect(isStale("building", ["merged", "closed"])).toBe(true);
});

test("isStale: not stale when status already terminal, a PR is still open, or no own PRs", () => {
  expect(isStale("merged", ["merged"])).toBe(false);            // status already terminal
  expect(isStale("parked", ["closed"])).toBe(false);            // parked is fine
  expect(isStale("submitted", ["merged", "open"])).toBe(false); // one still open
  expect(isStale("submitted", [])).toBe(false);                 // no own PRs
});
