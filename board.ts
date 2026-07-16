#!/usr/bin/env bun
// Generic kit board: scan <kitsDir>/*/SCOPE.md, parse YAML frontmatter, validate against
// the generic kit.schema.json (next to this script), print a status board, and aggregate
// structured TODO markers (HTML comments) across each kit's *.md files.
// Read-only; no deps beyond bun. OPTIONAL convenience snapshot — per the W3C-PROV doc
// architecture, the in-file markers/changelogs are the source of truth and an agent can
// aggregate on demand without any tool. Use this for a quick overview / CI, not as SSoT.
//
// Marker syntax (HTML comments, invisible in rendered markdown):
//   <!-- TODO(owner=alice, priority=high, due=2026-04-10, id=T001): description -->
//   <!-- DECISION(owner=alice, id=D001): what to decide -->
//   <!-- QUESTION(owner=open, id=Q001): open question -->
//   <!-- FIXME(priority=low, id=F001): bug or inconsistency -->
// Attrs (owner, priority, due, id, status) are optional. A marker counts as OPEN unless
// status=done or status=wontfix.
//
// Usage:
//   bun board.ts [kitsDir] [--brief]
//   - no kitsDir: tries _work/kits, then kits, then . (relative to cwd)
//   - open markers (grouped by kit, priority-sorted) are listed by default; --brief prints the table only
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
// ONE parser for `repos`, two consumers. This import is the point, not a convenience: board.ts's
// own frontmatter reader deliberately skips nested YAML ("skip block-YAML continuation / list
// items"), so it could never see `repos` at all — any check written against it here would have
// been a check that cannot fire. watch.ts already had the real parser; sharing it means the board
// and the reconcile can no longer disagree about what a kit declares. (watch.ts guards its CLI
// behind `import.meta.main`, so importing it runs nothing.)
import { parseRepos } from "./watch.ts";

const schema = JSON.parse(readFileSync(join(import.meta.dir, "kit.schema.json"), "utf8"));
const props: Record<string, any> = schema.properties ?? {};
const required: string[] = schema.required ?? [];
const SCHEMA_MM = String(schema.version ?? "").split(".").slice(0, 2).join("."); // current MAJOR.MINOR

// ---- args ----
const argv = process.argv.slice(2);
const showTodos = !argv.includes("--brief") && !argv.includes("--no-todos"); // todos shown by default; --brief for table only
const showAll = argv.includes("--all"); // include terminal-status kits (merged/done/closed)
const argDir = argv.find((a) => !a.startsWith("--"));
const candidates = argDir ? [argDir] : ["_work/kits", "kits", "."];
const kitsDir = candidates.find((d) => existsSync(d) && statSync(d).isDirectory());
if (!kitsDir) {
  console.error(`no kits dir found (tried: ${candidates.join(", ")})`);
  process.exit(1);
}

// ---- tiny YAML frontmatter parser (key: value, inline [arrays], quoted strings) ----
type FM = Record<string, any>;
function unquote(s: string): string {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  return s;
}
function parseValue(v: string): any {
  v = v.trim();
  if (v === "" || v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((x) => unquote(x));
  }
  return unquote(v);
}
function parseFrontmatter(text: string): FM | null {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const body = text.slice(text.indexOf("\n") + 1, end);
  const fm: FM = {};
  for (const line of body.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^[ \t]/.test(line) || line.trimStart().startsWith("-")) continue; // skip block-YAML continuation / list items (e.g. repos:)
    const i = line.indexOf(":");
    if (i < 0) continue;
    let raw = line.slice(i + 1);
    const t = raw.trim();
    if (!t.startsWith('"') && !t.startsWith("'")) raw = raw.replace(/\s+#.*$/, ""); // strip trailing YAML comment (space+#), keeps org/repo#n and quoted strings
    fm[line.slice(0, i).trim()] = parseValue(raw);
  }
  return fm;
}

// ---- structured TODO markers (W3C-PROV doc-architecture rule 6) ----
const KINDS = ["TODO", "FIXME", "DECISION", "QUESTION", "DEBT"] as const;
// Flag letters shown in the OPEN column. DEBT can't reuse DECISION's "D", so it
// gets "$" (accepted debt = a bill that comes due). Explicit map, not k[0].
const FLAG: Record<string, string> = { TODO: "T", FIXME: "F", DECISION: "D", QUESTION: "Q", DEBT: "$" };
// KIND ( optional attrs ) optional-colon description -->
const MARKER_RE = /<!--\s*(TODO|FIXME|DECISION|QUESTION|DEBT)\s*(?:\(([^)]*)\))?\s*:?\s*([\s\S]*?)\s*-->/g;
type Marker = { kind: string; attrs: Record<string, string>; text: string; file: string };
function parseAttrs(s: string): Record<string, string> {
  const a: Record<string, string> = {};
  if (!s) return a;
  for (const part of s.split(",")) {
    const i = part.indexOf("=");
    if (i > 0) a[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return a;
}
// terminal marker statuses come from the schema (single source, shared with lint.ts):
// done/wontfix (work) + answered (a QUESTION) + superseded (a DECISION replaced) + decided.
const MARKER_TERMINAL = new Set<string>((schema.marker?.status?.terminal ?? ["done", "wontfix"]).map((s: string) => s.toLowerCase()));
function isOpen(m: Marker): boolean {
  return !MARKER_TERMINAL.has((m.attrs.status ?? "").toLowerCase());
}
function scanMarkers(dir: string): Marker[] {
  const out: Marker[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const txt = readFileSync(join(dir, f), "utf8");
    MARKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARKER_RE.exec(txt)))
      out.push({ kind: m[1], attrs: parseAttrs(m[2] ?? ""), text: (m[3] ?? "").trim().replace(/\s+/g, " "), file: f });
  }
  return out;
}
function flags(markers: Marker[]): string {
  const open = markers.filter(isOpen);
  const c: Record<string, number> = {};
  for (const m of open) c[m.kind] = (c[m.kind] ?? 0) + 1;
  return KINDS.map((k) => (c[k] ? `${c[k]}${FLAG[k]}` : "")).filter(Boolean).join(" ");
}
const PRIO: Record<string, number> = { high: 0, medium: 1, med: 1, low: 2, "": 3 };

// ---- lightweight validation against the generic schema ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validate(fm: FM): string[] {
  const errs: string[] = [];
  for (const r of required) if (fm[r] == null || fm[r] === "") errs.push(`missing ${r}`);
  const kitPat = props.kit?.pattern && new RegExp(props.kit.pattern);
  if (fm.kit && kitPat && !kitPat.test(fm.kit)) errs.push(`kit slug invalid`);
  for (const d of ["created", "updated"]) if (fm[d] && !DATE_RE.test(fm[d])) errs.push(`${d} not a date`);
  if (props.area && fm.area && !Array.isArray(fm.area)) errs.push(`area not a list`);
  if (props.status?.enum && fm.status && !props.status.enum.includes(fm.status)) errs.push(`status "${fm.status}" not in schema enum`);
  if (fm.kit_version && SCHEMA_MM && String(fm.kit_version) !== SCHEMA_MM) errs.push(`kit_version ${fm.kit_version} ≠ schema ${SCHEMA_MM}`);
  return errs;
}

/**
 * `repos` is the contract watch.ts reconciles `status` against — and it went unvalidated until
 * 0.8, so 37 kits wrote a field the schema did not know, and one of its keys (`issue:`) was read
 * by nothing at all. Checked here via the SAME parser watch.ts uses, because an unvalidated
 * contract drifts in silence, and a reconcile is only ever as good as the list it reads.
 *
 * Takes the raw text, not `fm` — board.ts's own frontmatter reader cannot see nested YAML.
 */
const repoProps = props.repos?.items?.properties ?? {};
function validateReposIn(text: string): string[] {
  const errs: string[] = [];
  const repoPat = repoProps.repo?.pattern && new RegExp(repoProps.repo.pattern);
  const refPat = repoProps.refs?.items?.pattern && new RegExp(repoProps.refs.items.pattern);
  parseRepos(text).forEach((e, i) => {
    const at = `repos[${i}]`;
    if (repoPat && !repoPat.test(e.repo)) errs.push(`${at} repo "${e.repo}" is not owner/name`);
    for (const r of e.refs) if (refPat && !refPat.test(r)) errs.push(`${at} ref "${r}" is not owner/repo#n`);
  });
  // Deprecated, and deliberately a WARNING rather than an error: the legacy scalars are still
  // parsed, so nothing is broken. Making it fatal would light up every existing kit in one commit
  // — and a board nobody can read is a board nobody reads, which is the failure a check exists to
  // prevent (a guard that cries wolf gets switched off, taking its useful half with it).
  const fmBlock = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const legacy = [...fmBlock.matchAll(/^\s+(pr|issue):\s*(\d+)/gm)];
  if (legacy.length) errs.push(`${legacy.length}× legacy \`pr:\`/\`issue:\` — deprecated since 0.8, use refs: [#n]`);
  return errs;
}

// ---- collect ----
const STATUS_ORDER: string[] = props.status?.enum ?? []; // single source: the schema's status enum order
function rank(s: string): number {
  const i = STATUS_ORDER.indexOf(s);
  return i < 0 ? STATUS_ORDER.length : i;
}

type Row = { fm: FM; errs: string[]; markers: Marker[] };
const rows: Row[] = [];
for (const name of readdirSync(kitsDir)) {
  const kitDir = join(kitsDir, name);
  if (!existsSync(kitDir) || !statSync(kitDir).isDirectory()) continue;
  const lead = join(kitDir, "SCOPE.md");
  if (!existsSync(lead)) continue;
  const text = readFileSync(lead, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) { rows.push({ fm: { kit: name, title: "(no frontmatter)", status: "?" }, errs: ["no frontmatter"], markers: [] }); continue; }
  const errs = [...validate(fm), ...validateReposIn(text)];
  if (fm.kit && fm.kit !== name) errs.push(`kit slug ≠ folder (${name})`);
  if (!fm.kit) fm.kit = name;
  rows.push({ fm, errs, markers: scanMarkers(kitDir) });
}
rows.sort((a, b) => rank(a.fm.status) - rank(b.fm.status) || String(a.fm.kit).localeCompare(String(b.fm.kit)));

// ---- terminal statuses (merged/done/closed) are hidden by default; --all shows them ----
const TERMINAL = new Set(["merged", "done", "closed"]);
const shown = showAll ? rows : rows.filter((r) => !TERMINAL.has(String(r.fm.status)));
const hiddenCount = rows.length - shown.length;

// ---- print table ----
const w = Math.max(3, ...shown.map((r) => String(r.fm.kit).length), 3);
console.log(`${"STATUS".padEnd(10)} ${"KIT".padEnd(w)} ${"OPEN".padEnd(11)} TITLE`);
console.log(`${"-".repeat(10)} ${"-".repeat(w)} ${"-".repeat(11)} -----`);
for (const { fm, errs, markers } of shown) {
  const warn = errs.length ? `  ⚠ ${errs.join("; ")}` : "";
  console.log(`${String(fm.status ?? "?").padEnd(10)} ${String(fm.kit).padEnd(w)} ${flags(markers).padEnd(11)} ${fm.title ?? ""}${warn}`);
}
const bad = shown.filter((r) => r.errs.length).length;
const openTotal = shown.reduce((n, r) => n + r.markers.filter(isOpen).length, 0);
const hiddenNote = hiddenCount ? `, ${hiddenCount} done/closed hidden (--all)` : "";
// Sibling kit-archive holds retired kits OUTSIDE kitsDir, so they are invisible from a
// default run — surface the count + the exact command (count-gated: silent when empty or
// when the caller already passed an explicit dir).
let archiveNote = "";
if (basename(kitsDir) !== "kit-archive") {
  const archiveDir = join(kitsDir, "..", "kit-archive");
  if (existsSync(archiveDir) && statSync(archiveDir).isDirectory()) {
    const n = readdirSync(archiveDir).filter((d) => existsSync(join(archiveDir, d, "SCOPE.md"))).length;
    if (n) archiveNote = `, ${n} archived (bun board.ts ${archiveDir} --all)`;
  }
}
console.log(`\n${shown.length} kit(s) in ${kitsDir}, ${openTotal} open marker(s)${bad ? `, ${bad} with warnings` : ""}${hiddenNote}${archiveNote}.`);
console.log(`OPEN flags: T=TODO F=FIXME D=DECISION Q=QUESTION $=DEBT` + (showTodos ? "  ·  --brief for table only" : ""));
// DEBT markers MUST carry a repay trigger= — without it, accepted debt rots
// (the whole reason DEBT is its own kind). Surface trigger-less ones loudly.
const debtNoTrigger = shown.flatMap((r) => r.markers).filter((m) => isOpen(m) && m.kind === "DEBT" && !m.attrs.trigger);
if (debtNoTrigger.length) console.log(`⚠ ${debtNoTrigger.length} DEBT marker(s) missing trigger= (a debt with no repay condition is silently forgotten)`);
console.log(`kit convention v${schema.version ?? "?"}  ·  board.ts (task-kit)`);

// ---- optional: list open markers grouped by kit, priority-sorted ----
if (showTodos) {
  for (const { fm, markers } of shown) {
    const open = markers.filter(isOpen).sort((a, b) => (PRIO[a.attrs.priority ?? ""] ?? 3) - (PRIO[b.attrs.priority ?? ""] ?? 3));
    if (!open.length) continue;
    console.log(`\n### ${fm.kit}`);
    for (const m of open) {
      const meta = [m.attrs.id, m.attrs.priority, m.attrs.owner && `@${m.attrs.owner}`, m.attrs.due && `due ${m.attrs.due}`, m.attrs.trigger && `trigger ${m.attrs.trigger}`].filter(Boolean).join(", ");
      const needTrigger = m.kind === "DEBT" && !m.attrs.trigger ? "  ⚠ needs trigger=" : "";
      console.log(`  ${m.kind.padEnd(8)} ${meta ? `(${meta}) ` : ""}${m.text}  ·  ${m.file}${needTrigger}`);
    }
  }
}
