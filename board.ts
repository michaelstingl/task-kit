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
import { join } from "node:path";

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
const KINDS = ["TODO", "FIXME", "DECISION", "QUESTION"] as const;
// KIND ( optional attrs ) optional-colon description -->
const MARKER_RE = /<!--\s*(TODO|FIXME|DECISION|QUESTION)\s*(?:\(([^)]*)\))?\s*:?\s*([\s\S]*?)\s*-->/g;
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
function isOpen(m: Marker): boolean {
  const s = (m.attrs.status ?? "").toLowerCase();
  return s !== "done" && s !== "wontfix";
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
  return KINDS.map((k) => (c[k] ? `${c[k]}${k[0]}` : "")).filter(Boolean).join(" ");
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
  const fm = parseFrontmatter(readFileSync(lead, "utf8"));
  if (!fm) { rows.push({ fm: { kit: name, title: "(no frontmatter)", status: "?" }, errs: ["no frontmatter"], markers: [] }); continue; }
  const errs = validate(fm);
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
console.log(`\n${shown.length} kit(s) in ${kitsDir}, ${openTotal} open marker(s)${bad ? `, ${bad} with warnings` : ""}${hiddenNote}.`);
console.log(`OPEN flags: T=TODO F=FIXME D=DECISION Q=QUESTION` + (showTodos ? "  ·  --brief for table only" : ""));
console.log(`kit convention v${schema.version ?? "?"}  ·  board.ts (task-kit)`);

// ---- optional: list open markers grouped by kit, priority-sorted ----
if (showTodos) {
  for (const { fm, markers } of shown) {
    const open = markers.filter(isOpen).sort((a, b) => (PRIO[a.attrs.priority ?? ""] ?? 3) - (PRIO[b.attrs.priority ?? ""] ?? 3));
    if (!open.length) continue;
    console.log(`\n### ${fm.kit}`);
    for (const m of open) {
      const meta = [m.attrs.id, m.attrs.priority, m.attrs.owner && `@${m.attrs.owner}`, m.attrs.due && `due ${m.attrs.due}`].filter(Boolean).join(", ");
      console.log(`  ${m.kind.padEnd(8)} ${meta ? `(${meta}) ` : ""}${m.text}  ·  ${m.file}`);
    }
  }
}
