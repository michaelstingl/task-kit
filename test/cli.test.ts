// Integration tests for the CLIs. Run with: bun test
// They spawn the real board.ts / new-kit.ts against throwaway fixture dirs.
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const root = dirname(import.meta.dir); // repo root (this file is in test/)
const board = join(root, "board.ts");
const newkit = join(root, "new-kit.ts");

function run(script: string, args: string[], cwd: string) {
  const p = Bun.spawnSync(["bun", script, ...args], { cwd });
  return { out: p.stdout.toString(), err: p.stderr.toString(), code: p.exitCode };
}
function writeKit(kitsDir: string, name: string, frontmatter: string, body = "") {
  const d = join(kitsDir, name);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "SCOPE.md"), `---\n${frontmatter}\n---\n${body}`);
}

let dir: string, kits: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kit-test-")); kits = join(dir, "kits"); mkdirSync(kits); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// ---- new-kit.ts ----
test("new-kit creates a lean kit with stamped frontmatter", () => {
  const r = run(newkit, ["demo", "--title", "a demo", "--kits", kits], dir);
  expect(r.code).toBe(0);
  const scope = readFileSync(join(kits, "demo", "SCOPE.md"), "utf8");
  expect(scope).toContain("kit: demo");
  expect(scope).toMatch(/kit_version: \d+\.\d+/);
  expect(scope).toContain('title: "a demo"');
  expect(existsSync(join(kits, "demo", "issue.md"))).toBe(false); // lean: no PR stubs
});

test("new-kit --contribution adds issue/pr-body and repos:", () => {
  expect(run(newkit, ["contrib", "--contribution", "--kits", kits], dir).code).toBe(0);
  expect(existsSync(join(kits, "contrib", "issue.md"))).toBe(true);
  expect(existsSync(join(kits, "contrib", "pr-body.md"))).toBe(true);
  expect(readFileSync(join(kits, "contrib", "SCOPE.md"), "utf8")).toContain("repos:");
});

test("new-kit rejects a bad slug", () => {
  expect(run(newkit, ["Bad Slug", "--kits", kits], dir).code).not.toBe(0);
});

test("new-kit refuses to overwrite an existing kit", () => {
  run(newkit, ["dup", "--kits", kits], dir);
  expect(run(newkit, ["dup", "--kits", kits], dir).code).not.toBe(0);
});

// ---- board.ts ----
const OK_FM = (extra = "") => `kit: %KIT%\ntitle: "x"\nstatus: active\ncreated: 2026-01-01\nupdated: 2026-01-01${extra}`;

test("board parses inline arrays with trailing comments (no false warning)", () => {
  writeKit(kits, "foo", OK_FM("\narea: [a, b]   # a comment\nlinks: [org/repo#1]").replace("%KIT%", "foo"));
  const r = run(board, [kits], dir);
  expect(r.out).toContain("foo");
  expect(r.out).not.toContain("area not a list");
});

test("board ignores block-YAML continuation (repos:)", () => {
  writeKit(kits, "bar", `${OK_FM().replace("%KIT%", "bar")}\nrepos:\n  - repo: org/repo\n    branch: fix/bar`);
  expect(run(board, [kits], dir).code).toBe(0);
});

test("board warns on slug != folder", () => {
  writeKit(kits, "folderx", OK_FM().replace("%KIT%", "different"));
  expect(run(board, [kits], dir).out).toMatch(/slug.*folder/);
});

test("board warns when kit_version differs from the schema (KMS-T2)", () => {
  writeKit(kits, "old", OK_FM("\nkit_version: 0.1").replace("%KIT%", "old"));
  expect(run(board, [kits], dir).out).toMatch(/kit_version 0\.1/);
});

test("board hides terminal status by default, shows with --all", () => {
  writeKit(kits, "fin", `kit: fin\ntitle: "x"\nstatus: done\ncreated: 2026-01-01\nupdated: 2026-01-01`);
  expect(run(board, [kits], dir).out).not.toContain("fin");
  expect(run(board, [kits, "--all"], dir).out).toContain("fin");
});

test("board surfaces a sibling kit-archive count so agents can find retired kits", () => {
  writeKit(kits, "active1", OK_FM().replace("%KIT%", "active1"));
  const archive = join(dir, "kit-archive"); // sibling of kits/
  writeKit(archive, "old1", `kit: old1\ntitle: "x"\nstatus: merged\ncreated: 2026-01-01\nupdated: 2026-01-01`);
  // a default listing names the archive with a count + the exact command
  expect(run(board, [kits], dir).out).toMatch(/1 archived \(bun board\.ts .*kit-archive --all\)/);
  // viewing the archive itself must NOT self-reference
  expect(run(board, [archive, "--all"], dir).out).not.toMatch(/archived \(bun board\.ts/);
});

test("board aggregates open markers; --todos lists them; done markers excluded", () => {
  writeKit(kits, "mk", OK_FM().replace("%KIT%", "mk"),
    `<!-- TODO(id=T1, priority=high): wire it up -->\n<!-- TODO(status=done, id=T2): already handled -->`);
  const r = run(board, [kits, "--todos"], dir);
  expect(r.out).toContain("1T");            // one open TODO (T2 is done)
  expect(r.out).toContain("wire it up");
  expect(r.out).not.toContain("already handled");
});

test("DEBT marker: '$' flag, and a missing trigger= is flagged", () => {
  writeKit(kits, "dk", OK_FM().replace("%KIT%", "dk"),
    `<!-- DEBT(id=D1, trigger=before v2): scoped too wide -->\n<!-- DEBT(id=D2): no repay condition -->`);
  const r = run(board, [kits, "--todos"], dir);
  expect(r.out).toContain("2$");                 // both open DEBT markers under the $ flag
  expect(r.out).toContain("$=DEBT");             // legend documents the flag
  expect(r.out).toContain("1 DEBT marker(s) missing trigger="); // summary count (only D2)
  expect(r.out).toContain("needs trigger=");     // per-marker nudge on D2
  expect(r.out).toContain("trigger before v2");  // D1's trigger surfaced in meta
});
