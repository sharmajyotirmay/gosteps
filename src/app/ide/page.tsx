"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { Panel } from "@/components/ui";
import {
  deleteFile, health, listTree, readFile, runInSandbox, setupSandbox, stopRun, writeFile,
  type Entry, type IdeHealth, type RunAction, type RunResult,
} from "@/ide/client";

// CodeMirror touches the DOM, so load it only in the browser.
const CodeEditor = dynamic(() => import("@/components/ide/CodeEditor").then((m) => m.CodeEditor), { ssr: false });

interface OpenFile {
  path: string;
  text: string;
  saved: string;
}

const ACTIONS: { action: RunAction; label: string; hint: string; race?: boolean }[] = [
  { action: "run", label: "Run", hint: "go run for the active file's package" },
  { action: "test", label: "Test", hint: "go test (⌘/Ctrl+Enter)" },
  { action: "test", label: "Test -race", hint: "go test -race", race: true },
  { action: "vet", label: "Vet", hint: "go vet" },
  { action: "fmt", label: "Format", hint: "gofmt -l -w ." },
  { action: "tidy", label: "Tidy deps", hint: "go mod tidy: the only action with network access, and it never runs your code" },
];

const validOpen = (p: string | null) => (p && /^[a-z0-9][a-z0-9._-]*\//.test(p) ? p : null);

export default function IdePage() {
  // useSearchParams needs a Suspense boundary in a static export.
  return (
    <Suspense fallback={<div className="skeleton">CONNECTING TO THE SANDBOX…</div>}>
      <Ide />
    </Suspense>
  );
}

function Ide() {
  const { toast } = useGame();
  const openParam = validOpen(useSearchParams().get("open"));
  const [h, setH] = useState<IdeHealth | null | "checking">("checking");
  const [module, setModule] = useState(() => openParam?.split("/")[0] ?? "jobq");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<RunResult | null>(null);
  const [pkg, setPkg] = useState("./...");
  const [cover, setCover] = useState(true);
  const [verbose, setVerbose] = useState(false);
  const [newName, setNewName] = useState("");
  const consoleRef = useRef<HTMLPreElement>(null);

  const refreshTree = useCallback(async (m: string) => {
    try {
      setEntries(await listTree(m));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't list files");
    }
  }, [toast]);

  const open = useCallback(async (path: string) => {
    setActive(path);
    if (files.some((f) => f.path === path)) return;
    try {
      const text = await readFile(path);
      setFiles((fs) => (fs.some((f) => f.path === path) ? fs : [...fs, { path, text, saved: text }]));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't open the file");
    }
  }, [files, toast]);

  const connect = useCallback(async () => {
    setH("checking");
    const res = await health();
    setH(res);
    if (res) {
      const m = res.modules.includes(module) ? module : res.modules[0] ?? "jobq";
      setModule(m);
      await refreshTree(m);
      if (openParam) await open(openParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only when the requested file changes
  }, [openParam]);

  useEffect(() => {
    void connect();
  }, [connect]);

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  const current = files.find((f) => f.path === active) ?? null;
  const dirty = files.filter((f) => f.text !== f.saved);

  const save = async (path?: string) => {
    const targets = path ? files.filter((f) => f.path === path) : dirty;
    for (const f of targets) {
      try {
        await writeFile(f.path, f.text);
        setFiles((fs) => fs.map((x) => (x.path === f.path ? { ...x, saved: f.text } : x)));
      } catch (e) {
        toast(e instanceof Error ? e.message : "Save failed");
        return false;
      }
    }
    return true;
  };

  const runPkgFor = () => {
    if (!active || !active.startsWith(`${module}/`)) return ".";
    const dir = active.split("/").slice(1, -1).join("/");
    return dir ? `./${dir}` : ".";
  };

  const run = async (action: RunAction, race = false) => {
    if (busy) return;
    if (!(await save())) return;
    setBusy(true);
    setLast(null);
    const req = { module, action, pkg: action === "run" ? runPkgFor() : action === "fmt" || action === "tidy" ? undefined : pkg, race, cover: action === "test" && cover, verbose: action === "test" && verbose };
    setOutput("");
    try {
      const res = await runInSandbox(req, {
        start: (id, cmd, network) => {
          setRunId(id);
          setOutput(`$ ${cmd}${network ? "   # network on: downloading modules only" : "   # sandbox: no network, read-only system"}\n`);
        },
        output: (d) => setOutput((o) => o + d),
      });
      setLast(res);
      if (action === "fmt" || action === "tidy") {
        // Formatting and tidy rewrite files: reload open buffers that weren't edited since.
        for (const f of files) {
          const text = await readFile(f.path).catch(() => null);
          if (text !== null) setFiles((fs) => fs.map((x) => (x.path === f.path && x.text === x.saved ? { ...x, text, saved: text } : x)));
        }
        await refreshTree(module);
      }
    } catch (e) {
      setOutput((o) => o + `\n${e instanceof Error ? e.message : "Run failed"}\n`);
    } finally {
      setBusy(false);
      setRunId(null);
    }
  };

  const setup = async () => {
    setBusy(true);
    setOutput("Setting up the Go sandbox (first time downloads ~300 MB)…\n");
    try {
      const code = await setupSandbox((d) => setOutput((o) => o + d));
      setOutput((o) => o + (code === 0 ? "\n✓ Sandbox ready.\n" : `\n✗ Setup failed (exit ${code}).\n`));
    } finally {
      setBusy(false);
      await connect();
    }
  };

  const createFile = async () => {
    const name = newName.trim().replace(/^\/+/, "");
    if (!name) return;
    const path = `${module}/${name}`;
    const pkgName = name.includes("/") ? name.split("/").at(-2)!.replace(/-/g, "_") : "main";
    try {
      await writeFile(path, name.endsWith(".go") ? `package ${pkgName}\n` : "");
      setNewName("");
      await refreshTree(module);
      await open(path);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create the file");
    }
  };

  const remove = async (path: string) => {
    try {
      await deleteFile(path);
      setFiles((fs) => fs.filter((f) => f.path !== path));
      if (active === path) setActive(null);
      await refreshTree(module);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  const closeTab = (path: string) => {
    setFiles((fs) => fs.filter((f) => f.path !== path));
    if (active === path) setActive(files.find((f) => f.path !== path)?.path ?? null);
  };

  if (h === "checking") return <div className="skeleton">CONNECTING TO THE SANDBOX…</div>;

  if (h === null) {
    return (
      <>
        <Header />
        <Panel title="IDE runner not running">
          <div className="stack">
            <p style={{ margin: 0 }}>The IDE needs the local runner, a small helper that edits files in your workspace and runs Go inside Docker.</p>
            <pre className="ide-console" style={{ minHeight: 0 }}>{`pnpm dev        # starts the app, file store, and IDE runner\n# or, next to an already running app:\npnpm ide`}</pre>
            <p className="small muted" style={{ margin: 0 }}>You also need Docker Desktop running to execute code. Editing works without it.</p>
            <div><button type="button" className="btn" onClick={() => void connect()}>Retry</button></div>
          </div>
        </Panel>
      </>
    );
  }

  const canRun = h.docker.available && h.docker.imageReady;
  const depth = (p: string) => p.split("/").length - 2;
  const hidden = (p: string) => [...collapsed].some((c) => p.startsWith(c + "/"));

  return (
    <>
      <Header />
      {!h.docker.available && (
        <section className="panel notice penalty"><span className="tag">DOCKER</span><div><p>Docker isn&apos;t running. Start Docker Desktop to run code; you can still edit files.</p><button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => void connect()}>Check again</button></div></section>
      )}
      {h.docker.available && !h.docker.imageReady && (
        <section className="panel notice"><span className="tag">SETUP</span><div><p>One-time setup: download the Go image ({h.image}) and create the build caches.</p><button type="button" className="btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => void setup()}>Set up sandbox</button></div></section>
      )}

      <div className="ide">
        <aside className="panel ide-tree">
          <label className="field">Module
            <select id="ide-module" value={module} onChange={(e) => { setModule(e.target.value); void refreshTree(e.target.value); }}>
              {h.modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <ul className="tree" aria-label="Files">
            {entries.filter((e) => !hidden(e.path)).map((e) => (
              <li key={e.path} style={{ paddingLeft: depth(e.path) * 12 }}>
                {e.type === "dir" ? (
                  <button type="button" className="tree-dir" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(e.path)) n.delete(e.path); else n.add(e.path); return n; })}>
                    {collapsed.has(e.path) ? "▸" : "▾"} {e.path.split("/").at(-1)}
                  </button>
                ) : (
                  <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <button type="button" className={`tree-file ${active === e.path ? "on" : ""}`} onClick={() => void open(e.path)}>{e.path.split("/").at(-1)}</button>
                    <button type="button" className="tree-del" aria-label={`Delete ${e.path}`} title="Delete" onClick={() => void remove(e.path)}>×</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <form className="stack" style={{ gap: 6, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); void createFile(); }}>
            <input type="text" id="ide-new" aria-label="New file path" placeholder="internal/job/job.go" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className="btn sm ghost" disabled={!newName.trim()}>New file</button>
          </form>
          <p className="small muted" style={{ marginBottom: 0, wordBreak: "break-all" }}>Workspace: <code>{h.workspace}</code></p>
        </aside>

        <section className="panel ide-main">
          <div className="ide-tabs" role="tablist">
            {files.map((f) => (
              <span key={f.path} className={`ide-tab ${f.path === active ? "on" : ""}`}>
                <button type="button" role="tab" aria-selected={f.path === active} onClick={() => setActive(f.path)}>
                  {f.path.split("/").at(-1)}{f.text !== f.saved ? " •" : ""}
                </button>
                <button type="button" aria-label={`Close ${f.path}`} onClick={() => closeTab(f.path)}>×</button>
              </span>
            ))}
          </div>
          <div className="ide-editor-wrap">
            {current ? (
              <CodeEditor
                key={current.path}
                path={current.path}
                value={current.text}
                onChange={(text) => setFiles((fs) => fs.map((x) => (x.path === current.path ? { ...x, text } : x)))}
                onSave={() => void save(current.path)}
                onRun={() => void run("test")}
              />
            ) : (
              <div className="ide-empty">Open a file from the tree, or create one. <span className="kbd">⌘/Ctrl S</span> saves, <span className="kbd">⌘/Ctrl Enter</span> runs tests.</div>
            )}
          </div>

          <div className="ide-bar">
            {ACTIONS.map((a) => (
              <button key={a.label} type="button" className={`btn sm ${a.action === "test" && !a.race ? "" : "ghost"}`} title={a.hint} disabled={!canRun || busy} onClick={() => void run(a.action, a.race)}>{a.label}</button>
            ))}
            {busy && runId && <button type="button" className="btn sm danger" onClick={() => void stopRun(runId)}>Stop</button>}
            <label className="field" style={{ width: 150 }}>Packages
              <input type="text" id="ide-pkg" value={pkg} onChange={(e) => setPkg(e.target.value)} />
            </label>
            <label className="check"><input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} /> -cover</label>
            <label className="check"><input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} /> -v</label>
          </div>

          <div className="ide-console-head">
            <span className="eyebrow">Output</span>
            {last && (
              <span className={`chip ${last.code === 0 ? "good" : "bad"}`}>
                {last.timedOut ? "timed out" : last.code === 0 ? "exit 0" : `exit ${last.code}`} · {(last.ms / 1000).toFixed(1)}s
              </span>
            )}
            {busy && <span className="chip">running…</span>}
            {output && <button type="button" className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => navigator.clipboard?.writeText(output).then(() => toast("Output copied"), () => toast("Copy failed"))}>Copy output</button>}
          </div>
          <pre className="ide-console" ref={consoleRef} aria-live="polite">{output || "Output from the sandbox appears here."}</pre>
        </section>
      </div>
    </>
  );
}

function Header() {
  return (
    <div>
      <div className="eyebrow">Docker sandbox · no network · read-only system · your module only</div>
      <h1 className="page-title">IDE</h1>
    </div>
  );
}
