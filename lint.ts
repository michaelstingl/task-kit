#!/usr/bin/env bun
// lint.ts — validate the inline markers in kits AT WRITE TIME, so sprawl and
// collisions cannot accumulate for the board to warn about later.
//
//   bun lint.ts                 # lint every kit under _work/kits (or ./kits)
//   bun lint.ts <kitsDir>       # lint every kit under <kitsDir>
//   bun lint.ts --kit <path>    # lint a single kit directory
//
// Exits non-zero if any marker violates the CLOSED SETS in kit.schema.json
// (`marker.kinds`, `marker.status.terminal|open`) or the structural rules
// (unique id per kit, DEBT carries trigger=). Wire it into a pre-commit hook or
// a check; it is the "reject at write" that returns board.ts to a pure reporter.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dir;
const schema = JSON.parse(readFileSync(join(here, "kit.schema.json"), "utf8"));
const M = schema.marker ?? {};
const KINDS: string[] = M.kinds ?? ["TODO", "FIXME", "DECISION", "QUESTION", "DEBT", "NOTE"];
const TERMINAL: string[] = M.status?.terminal ?? ["done", "wontfix"];
const OPEN: string[] = M.status?.open ?? [];
const OK_STATUS = new Set(["", "open", ...TERMINAL, ...OPEN]); // "" and "open" both mean open

// A marker is `<!-- KIND(attrs) ... -->`. Match any ALL-CAPS kind followed by an
// attrs paren — that is the marker shape and it deliberately CATCHES the invented
// kinds (FINDING(, TRIGGER(, DANGER() so they can be rejected. Paren-less prose
// comments are not markers and are left alone.
const MARKER_RE = /<!--\s*([A-Z][A-Z0-9]+)\s*\(([^)]*)\)/g;

function parseAttrs(s: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const part of (s ?? "").split(",")) {
    const i = part.indexOf("=");
    if (i > 0) a[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return a;
}

type Violation = { kit: string; file: string; msg: string };
const violations: Violation[] = [];

function suggest(status: string): string {
  const map: Record<string, string> = {
    resolved: "done", dead: "wontfix", dropped: "wontfix", done_with_concerns: "done",
    fixed: "done", closed: "done", measured: "decided", answered_: "answered",
  };
  return map[status] ? ` (did you mean status=${map[status]}?)` : ` (allowed: ${[...OK_STATUS].filter(Boolean).join(", ")}, or omit for open)`;
}

function lintKit(kitDir: string, kitName: string) {
  const ids = new Map<string, string[]>(); // id -> files it appears in (open markers only)
  for (const f of readdirSync(kitDir)) {
    if (!f.endsWith(".md")) continue;
    const txt = readFileSync(join(kitDir, f), "utf8");
    MARKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARKER_RE.exec(txt))) {
      const kind = m[1];
      const attrs = parseAttrs(m[2]);
      if (!KINDS.includes(kind)) {
        violations.push({ kit: kitName, file: f, msg: `unknown marker kind ${kind} (allowed: ${KINDS.join(", ")}; fold evidence kinds into NOTE)` });
        continue; // don't further validate an unknown kind
      }
      const status = (attrs.status ?? "").toLowerCase();
      if (!OK_STATUS.has(status)) {
        violations.push({ kit: kitName, file: f, msg: `${kind}${attrs.id ? `(${attrs.id})` : ""} unknown status=${status}${suggest(status)}` });
      }
      if (kind === "DEBT" && !attrs.trigger && !TERMINAL.includes(status)) {
        violations.push({ kit: kitName, file: f, msg: `DEBT${attrs.id ? `(${attrs.id})` : ""} is missing trigger= (a debt with no repay condition is silently forgotten)` });
      }
      // duplicate-id: count only ids on non-terminal markers (a done + an open sharing an id is the trap)
      if (attrs.id && !TERMINAL.includes(status)) {
        const arr = ids.get(attrs.id) ?? [];
        arr.push(f);
        ids.set(attrs.id, arr);
      }
    }
  }
  for (const [id, files] of ids) {
    if (files.length > 1) violations.push({ kit: kitName, file: [...new Set(files)].join(", "), msg: `duplicate id ${id} on ${files.length} open markers — the board sums them silently` });
  }
}

// ---- resolve target ----
const argv = process.argv.slice(2);
const kitFlag = argv.indexOf("--kit");
if (kitFlag >= 0) {
  const dir = argv[kitFlag + 1];
  if (!dir || !existsSync(dir)) { console.error(`lint: --kit needs an existing directory`); process.exit(2); }
  lintKit(dir, dir.replace(/\/$/, "").split("/").pop()!);
} else {
  const kitsDir = argv.find((a) => !a.startsWith("--")) ?? ["_work/kits", "kits"].find((d) => existsSync(d) && statSync(d).isDirectory()) ?? "_work/kits";
  if (!existsSync(kitsDir)) { console.error(`lint: no kits dir (${kitsDir})`); process.exit(2); }
  for (const name of readdirSync(kitsDir)) {
    const d = join(kitsDir, name);
    if (existsSync(join(d, "SCOPE.md"))) lintKit(d, name);
  }
}

// ---- report ----
if (!violations.length) {
  console.log("✓ markers clean — kinds, statuses, ids, DEBT triggers all valid");
  process.exit(0);
}
const byKit: Record<string, Violation[]> = {};
for (const v of violations) (byKit[v.kit] ??= []).push(v);
for (const [kit, vs] of Object.entries(byKit)) {
  console.log(`\n✗ ${kit}`);
  for (const v of vs) console.log(`    ${v.msg}  ·  ${v.file}`);
}
console.log(`\n${violations.length} marker violation(s). Fix at the source — this is the write-time gate, not a board warning.`);
process.exit(1);
