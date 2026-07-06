#!/usr/bin/env bun
// watch.ts — for each kit, check the GitHub issues/PRs it references and report what moved.
// Scans every *.md in a kit for refs (org/repo#n and github issue/pull URLs — frontmatter
// `links:`, markers, prose), queries `gh`, and flags merged/closed, "moved since the kit
// was last touched" (the issue's updated_at is newer than the kit's `updated:`), and for an
// open PR its review decision (approved / changes-requested / review-required).
// Read-only. Requires bun + an authenticated gh.
//
// Usage: bun watch.ts [kitsDir]   (no arg: tries _work/kits, then kits, then .)
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const REF = /\b([A-Za-z0-9][\w.-]+\/[A-Za-z0-9][\w.-]+)#(\d+)\b/g;
const URL = /github\.com\/([A-Za-z0-9][\w.-]+)\/([A-Za-z0-9][\w.-]+)\/(?:issues|pull)\/(\d+)/g;

/** Extract unique `owner/repo#n` refs from text (org/repo#n tokens + github issue/pull URLs). */
export function refsFromText(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  REF.lastIndex = 0; while ((m = REF.exec(text))) out.add(`${m[1]}#${m[2]}`);
  URL.lastIndex = 0; while ((m = URL.exec(text))) out.add(`${m[1]}/${m[2]}#${m[3]}`);
  return [...out];
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

  let kitsWithRefs = 0, moved = 0, terminal = 0, approved = 0, changesRequested = 0;
  for (const name of readdirSync(kitsDir).sort()) {
    const dir = join(kitsDir, name);
    const lead = join(dir, "SCOPE.md");
    if (!existsSync(lead)) continue;
    const scope = readFileSync(lead, "utf8");
    const kitUpdated = (scope.match(/^updated:\s*(\S+)/m) ?? [])[1] ?? "";
    let text = "";
    for (const f of readdirSync(dir)) if (f.endsWith(".md")) text += readFileSync(join(dir, f), "utf8") + "\n";
    const refs = refsFromText(text).sort();
    if (!refs.length) continue;
    kitsWithRefs++;
    console.log(`\n### ${name}${kitUpdated ? `  (updated ${kitUpdated})` : ""}`);
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
  console.log(`\n${kitsWithRefs} kit(s) with refs · ${terminal} merged/closed (●) · ${changesRequested} changes-requested (⚠) · ${approved} approved (✓) · ${moved} moved (▲)${archiveNote}`);
}
