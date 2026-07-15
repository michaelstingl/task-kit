// Unit test for watch.ts ref extraction + status reconcile (the network part is exercised live, not here).
import { test, expect } from "bun:test";
import { refsFromText, parseRepos, ownPrRefs, parseStatus, isStale } from "../watch.ts";

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

const SCOPE = `---
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

test("parseRepos reads each repos entry with repo/branch/pr", () => {
  const r = parseRepos(SCOPE);
  expect(r.length).toBe(3);
  expect(r[0]).toEqual({ repo: "perf/cockpit", branch: "feat/foo", pr: "364" });
  expect(r[1].repo).toBe("perf/other");
  expect(r[1].branch).toBeUndefined();  // empty `branch:` value
  expect(r[2].pr).toBeUndefined();      // empty `pr:` value
});

test("ownPrRefs returns owner/repo#pr only for entries with BOTH branch and pr set", () => {
  const own = ownPrRefs(SCOPE);
  expect(own).toEqual(["perf/cockpit#364"]);     // only the branch+pr entry
  expect(own).not.toContain("perf/other#92");    // empty branch → a reference, not our PR
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
