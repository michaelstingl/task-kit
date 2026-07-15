#!/usr/bin/env bun
// watch.ts — for each kit, check the GitHub issues/PRs it references and report what moved.
// Scans every *.md in a kit for refs (org/repo#n and github issue/pull URLs — frontmatter
// `links:`, markers, prose; plus bare `#n` resolved against repos[0].repo), queries `gh`, and
// flags merged/closed, "moved since the kit was last touched" (the issue's updated_at is newer
// than the kit's `updated:`), and for an open PR its review decision (approved /
// changes-requested / review-required). It also RECONCILES the kit's own PRs (from `repos:`
// with a branch) against the kit-level `status:` and flags `⚠ stale` when every own PR is
// terminal but the status still reads in-progress (e.g. a kit stuck at `submitted` after merge).
// Read-only. Requires bun + an authenticated gh.
//
// Usage: bun watch.ts [kitsDir]   (no arg: tries _work/kits, then kits, then .)
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const REF = /\b([A-Za-z0-9][\w.-]+\/[A-Za-z0-9][\w.-]+)#(\d+)\b/g;
const URL = /github\.com\/([A-Za-z0-9][\w.-]+)\/([A-Za-z0-9][\w.-]+)\/(?:issues|pull)\/(\d+)/g;
// A bare `#123` (single-repo GitHub style, as used in pr-body.md). Only resolved when a
// default repo is known (repos[0].repo). The lookbehind excludes `#` that is part of an
// `owner/repo#n` token (preceded by a word char, `/`, `-` or `#`) so those stay qualified.
const BARE = /(?<![\w/#-])#(\d+)\b/g;

/**
 * Extract unique `owner/repo#n` refs from text (org/repo#n tokens + github issue/pull URLs).
 * With `defaultRepo`, bare `#n` tokens resolve to `${defaultRepo}#n` (WSR-F1).
 */
export function refsFromText(text: string, defaultRepo?: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  REF.lastIndex = 0; while ((m = REF.exec(text))) out.add(`${m[1]}#${m[2]}`);
  URL.lastIndex = 0; while ((m = URL.exec(text))) out.add(`${m[1]}/${m[2]}#${m[3]}`);
  if (defaultRepo) { BARE.lastIndex = 0; while ((m = BARE.exec(text))) out.add(`${defaultRepo}#${m[1]}`); }
  return [...out];
}

type RepoEntry = { repo: string; branch?: string; pr?: string };

/** Parse the `repos:` list from a SCOPE.md frontmatter (repo/branch/pr per entry; empty values omitted). */
export function parseRepos(scope: string): RepoEntry[] {
  const fm = scope.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const out: RepoEntry[] = [];
  let inRepos = false, cur: RepoEntry | null = null;
  const push = () => { if (cur) out.push(cur); cur = null; };
  for (const line of fm[1].split("\n")) {
    if (/^repos:\s*$/.test(line)) { inRepos = true; continue; }
    if (!inRepos) continue;
    if (/^\S/.test(line)) { push(); inRepos = false; continue; } // next top-level key ends the block
    const item = line.match(/^\s*-\s*repo:\s*(\S+)/);
    if (item) { push(); cur = { repo: item[1] }; continue; }
    if (!cur) continue;
    const b = line.match(/^\s+branch:\s*(\S+)/); if (b && !b[1].startsWith("#")) cur.branch = b[1];
    const p = line.match(/^\s+pr:\s*(\d+)/);     if (p) cur.pr = p[1];
  }
  push();
  return out;
}

/** The kit's OWN PRs: `owner/repo#pr` for entries with both a branch AND a pr (a bare `pr:`
 * with no branch is a mere reference to someone else's PR, not ours — WSR-D2). */
export function ownPrRefs(scope: string): string[] {
  return parseRepos(scope).filter((r) => r.branch && r.pr).map((r) => `${r.repo}#${r.pr}`);
}

/** The kit-level `status:` from frontmatter. */
export function parseStatus(scope: string): string {
  return (scope.match(/^status:\s*(\S+)/m) ?? [])[1] ?? "";
}

// Statuses under which a kit's PRs being terminal is expected — no reconcile warning.
const RECONCILE_OK = new Set(["merged", "closed", "parked", "done", "reference"]);

/** Stale = the kit has own PR(s), all of them are terminal (merged/closed), yet `status` still
 * reads as in-progress. The gap that let a kit sit at `submitted` while its PR was merged. */
export function isStale(status: string, ownPrStates: string[]): boolean {
  if (!ownPrStates.length) return false;
  if (RECONCILE_OK.has(status)) return false;
  return ownPrStates.every((s) => s === "merged" || s === "closed");
}

if (import.meta.main) {
  const argDir = process.argv[2];
  const candidates = argDir ? [argDir] : ["_work/kits", "kits", "."];
  const kitsDir = candidates.find((d) => existsSync(d) && statSync(d).isDirectory());
  if (!kitsDir) { console.error(`no kits dir found (tried: ${candidates.join(", ")})`); process.exit(1); }

  const gh = (args: string[]): any => {
    const p = Bun.spawnSync(["gh", ...args]);
    if (p.exitCode !== 0) return null;
    try { return JSON.parse(p.stdout.toString()); } catch { return null; }
  };

  let kitsWithRefs = 0, moved = 0, terminal = 0, approved = 0, changesRequested = 0, stale = 0;
  for (const name of readdirSync(kitsDir).sort()) {
    const dir = join(kitsDir, name);
    const lead = join(dir, "SCOPE.md");
    if (!existsSync(lead)) continue;
    const scope = readFileSync(lead, "utf8");
    const kitUpdated = (scope.match(/^updated:\s*(\S+)/m) ?? [])[1] ?? "";
    const status = parseStatus(scope);
    const repos = parseRepos(scope);
    const defaultRepo = repos[0]?.repo;                                    // resolve bare #n against this
    const own = ownPrRefs(scope);                                          // the kit's own PRs (branch+pr)
    let text = "";
    for (const f of readdirSync(dir)) if (f.endsWith(".md")) text += readFileSync(join(dir, f), "utf8") + "\n";
    // Query text refs + the kit's own PRs (own may live only in `repos:` frontmatter, which
    // refsFromText does not pick up), so the reconcile always has each own PR's real state.
    const refs = [...new Set([...refsFromText(text, defaultRepo), ...own])].sort();
    if (!refs.length) continue;
    kitsWithRefs++;
    console.log(`\n### ${name}${kitUpdated ? `  (updated ${kitUpdated})` : ""}`);
    const stateByRef = new Map<string, string>();
    for (const ref of refs) {
      const [orr, n] = ref.split("#");
      const [o, r] = orr.split("/");
      const d = gh(["api", `repos/${o}/${r}/issues/${n}`, "--jq", "{state:.state,title:.title,updated:.updated_at,pr:(.pull_request!=null)}"]);
      if (!d) { console.log(`  ?  ${ref}  (not found / no access)`); continue; }
      let state = d.state;
      if (d.pr && d.state === "closed") {
        const pr = gh(["api", `repos/${o}/${r}/pulls/${n}`, "--jq", "{merged:.merged}"]);
        if (pr?.merged) state = "merged";
      }
      stateByRef.set(ref, state);
      const isMoved = !!(kitUpdated && d.updated && d.updated.slice(0, 10) > kitUpdated);
      const isTerminal = state === "merged" || state === "closed";
      // For an open PR, surface the maintainer review decision. An approval or a change
      // request does not flip open/closed state, so the state/moved flags miss it — yet a
      // change request is the one signal that needs action.
      let review = "";
      if (d.pr && !isTerminal) {
        const rv = gh(["pr", "view", n, "--repo", `${o}/${r}`, "--json", "reviewDecision"]);
        const rd = rv?.reviewDecision;
        if (rd === "APPROVED") { review = "✓approved "; approved++; }
        else if (rd === "CHANGES_REQUESTED") { review = "⚠changes-requested "; changesRequested++; }
        else if (rd === "REVIEW_REQUIRED") { review = "review-required "; }
      }
      if (isMoved) moved++;
      if (isTerminal) terminal++;
      const flag = isTerminal ? "●" : review.startsWith("⚠") ? "⚠" : isMoved ? "▲" : " ";
      const when = isMoved ? `moved ${d.updated.slice(0, 10)} ` : "";
      console.log(`  ${flag} ${ref}  [${state}]  ${review}${when}${d.title}`);
    }
    // Reconcile: the kit's own PRs are all terminal, but its status still reads in-progress.
    // Only warn when every own PR's state was resolved (no "not found / no access" hole).
    const ownStates = own.map((r) => stateByRef.get(r)).filter(Boolean) as string[];
    if (own.length && ownStates.length === own.length && isStale(status, ownStates)) {
      console.log(`  ⚠ stale: status=${status} but all ${own.length} kit PR(s) terminal (${own.join(", ")}) → set merged/closed/parked`);
      stale++;
    }
  }
  if (!kitsWithRefs) console.log("no kits reference any GitHub issues/PRs.");
  // Retired kits in a sibling kit-archive are not scanned here — surface the count so their
  // refs (e.g. a merged PR) are not silently out of view (count-gated; skipped for an explicit dir).
  let archiveNote = "";
  if (basename(kitsDir) !== "kit-archive") {
    const archiveDir = join(kitsDir, "..", "kit-archive");
    if (existsSync(archiveDir) && statSync(archiveDir).isDirectory()) {
      const n = readdirSync(archiveDir).filter((d) => existsSync(join(archiveDir, d, "SCOPE.md"))).length;
      if (n) archiveNote = ` · ${n} archived not scanned (bun watch.ts ${archiveDir})`;
    }
  }
  console.log(`\n${kitsWithRefs} kit(s) with refs · ${terminal} merged/closed (●) · ${stale} stale status (⚠ stale) · ${changesRequested} changes-requested (⚠) · ${approved} approved (✓) · ${moved} moved (▲)${archiveNote}`);
}
