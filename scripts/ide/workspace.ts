import { lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

// The IDE workspace: a folder of Go modules the learner edits. Every path from the browser is
// checked here so it can never escape the workspace (no "..", no absolute paths, no symlinks,
// no hidden files), and the website's own source is never inside it.

export const MAX_FILE_BYTES = 1024 * 1024;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*$/; // no leading dot: hidden files are off-limits
const TEXT_FILE = /(\.(go|mod|sum|md|txt|json|ya?ml|sql|toml|env\.example)|^Makefile|^Dockerfile|^LICENSE)$/;
const SKIP_DIRS = new Set(["node_modules", "vendor"]);
export const MODULE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function workspaceRoot() {
  return resolve(process.env.GOSTEPS_WORKSPACE ?? join(import.meta.dirname, "..", "..", ".gosteps-workspace"));
}

export class PathError extends Error {}

/** Resolve a browser-supplied relative path inside `root`, or throw. */
export function safePath(root: string, rel: string): string {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 512) throw new PathError("bad path");
  if (rel.includes("\0") || rel.startsWith("/") || rel.includes("\\")) throw new PathError("bad path");
  const parts = rel.split("/");
  for (const p of parts) if (!SEGMENT.test(p)) throw new PathError(`bad path segment "${p}"`);
  const full = resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + sep)) throw new PathError("path escapes the workspace");
  return full;
}

/** Reject symlinks anywhere between the workspace root and the target. */
async function assertNoLinks(root: string, full: string) {
  const realRoot = await realpath(root);
  let cur = full;
  while (cur.startsWith(root) && cur !== root) {
    const st = await lstat(cur).catch(() => null);
    if (st?.isSymbolicLink()) throw new PathError("symlinks aren't allowed in the workspace");
    cur = dirname(cur);
  }
  const parent = await realpath(existsSync(full) ? full : dirname(full)).catch(() => null);
  if (parent && parent !== realRoot && !parent.startsWith(realRoot + sep)) throw new PathError("path escapes the workspace");
}

export interface Entry {
  path: string;
  type: "file" | "dir";
  size: number;
}

export async function listModules(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (d.isDirectory() && MODULE_NAME.test(d.name) && existsSync(join(root, d.name, "go.mod"))) out.push(d.name);
  }
  return out.sort();
}

export async function tree(root: string, module: string): Promise<Entry[]> {
  if (!MODULE_NAME.test(module)) throw new PathError("bad module");
  const base = safePath(root, module);
  const out: Entry[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 8 || out.length > 2000) return;
    const items = await readdir(dir, { withFileTypes: true });
    items.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const it of items) {
      if (!SEGMENT.test(it.name) || it.isSymbolicLink()) continue;
      const full = join(dir, it.name);
      const rel = relative(root, full).split(sep).join("/");
      if (it.isDirectory()) {
        if (SKIP_DIRS.has(it.name)) continue;
        out.push({ path: rel, type: "dir", size: 0 });
        await walk(full, depth + 1);
      } else if (it.isFile()) {
        out.push({ path: rel, type: "file", size: (await stat(full)).size });
      }
    }
  }
  await walk(base, 0);
  return out;
}

export async function readText(root: string, rel: string): Promise<string> {
  const full = safePath(root, rel);
  await assertNoLinks(root, full);
  const st = await stat(full);
  if (!st.isFile()) throw new PathError("not a file");
  if (st.size > MAX_FILE_BYTES) throw new PathError("file too large to edit (1 MB max)");
  return readFile(full, "utf8");
}

export async function writeText(root: string, rel: string, text: string): Promise<void> {
  const full = safePath(root, rel);
  const name = rel.split("/").at(-1)!;
  if (!TEXT_FILE.test(name)) throw new PathError("only source and text files can be written (.go, .mod, .md, .json, .yaml, .sql, …)");
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new PathError("file too large (1 MB max)");
  await mkdir(dirname(full), { recursive: true });
  await assertNoLinks(root, full);
  await writeFile(full, text);
}

export async function removePath(root: string, rel: string): Promise<void> {
  const full = safePath(root, rel);
  if (!rel.includes("/")) throw new PathError("modules can't be deleted from the IDE");
  await assertNoLinks(root, full);
  await rm(full, { recursive: true });
}

const JOBQ_README = `# jobq

Your Go project for the GoSteps course. Quest 1 starts here: create \`cmd/jobq/main.go\`.

This folder lives in \`.gosteps-workspace/\` (git-ignored). Code here runs only inside the
GoSteps Docker sandbox: no network, read-only system, no access to anything outside this module.
`;

/** Create the workspace and its default modules (jobq, dsa-go) if they don't exist yet. */
export async function ensureWorkspace(root: string) {
  await mkdir(root, { recursive: true });
  const defaults: [string, string, string][] = [
    ["jobq", "module jobq\n\ngo 1.25\n", JOBQ_README],
    ["dsa-go", "module dsa\n\ngo 1.25\n", "# dsa-go\n\nOne package per problem: `<topic>/<problem>/solution.go` + `solution_test.go`.\n"],
  ];
  for (const [dir, mod, readme] of defaults) {
    const d = join(root, dir);
    if (existsSync(join(d, "go.mod"))) continue;
    await mkdir(d, { recursive: true });
    await writeFile(join(d, "go.mod"), mod);
    if (!existsSync(join(d, "README.md"))) await writeFile(join(d, "README.md"), readme);
  }
}

export const PKG_NAME = /^[a-z_][a-z0-9_]{0,63}$/;

/** Create solution.go + a table-driven solution_test.go for a DSA problem (never overwrites). */
export async function scaffoldProblem(root: string, module: string, dir: string, pkg: string, title: string, url: string) {
  if (!MODULE_NAME.test(module) || !PKG_NAME.test(pkg)) throw new PathError("bad module or package name");
  const base = `${module}/${dir}`;
  safePath(root, base);
  const cleanTitle = title.replace(/[^\w\s()'.,-]/g, "").slice(0, 120);
  const cleanUrl = /^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/$/.test(url) ? url : "";
  const files: [string, string][] = [
    [`${base}/solution.go`, `package ${pkg}\n\n// ${cleanTitle}\n// ${cleanUrl}\n\nfunc solve() {\n}\n`],
    [
      `${base}/solution_test.go`,
      `package ${pkg}\n\nimport "testing"\n\nfunc TestSolve(t *testing.T) {\n\ttests := []struct {\n\t\tname string\n\t}{\n\t\t{name: "example 1"},\n\t}\n\tfor _, tt := range tests {\n\t\tt.Run(tt.name, func(t *testing.T) {\n\t\t\tsolve()\n\t\t})\n\t}\n}\n`,
    ],
  ];
  for (const [rel, text] of files) {
    if (!existsSync(safePath(root, rel))) await writeText(root, rel, text);
  }
  return `${base}/solution.go`;
}
