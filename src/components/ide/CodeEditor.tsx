"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentUnit, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { go } from "@codemirror/lang-go";
import { markdown } from "@codemirror/lang-markdown";
import { tags as t } from "@lezer/highlight";

// CodeMirror 6 bundled locally (no CDN), themed from the app's CSS tokens so it follows light/dark.

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px", backgroundColor: "var(--code-bg)", color: "var(--fg)" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fg)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent) !important" },
  ".cm-matchingBracket": { outline: "1px solid var(--accent)", backgroundColor: "transparent" },
  ".cm-panels": { backgroundColor: "var(--panel-solid)", color: "var(--fg)" },
  ".cm-tooltip": { backgroundColor: "var(--panel-solid)", border: "1px solid var(--panel-edge)" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--accent)" },
  { tag: [t.string, t.special(t.string)], color: "var(--good)" },
  { tag: [t.number, t.bool, t.null], color: "var(--gold)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--muted)", fontStyle: "italic" },
  { tag: [t.typeName, t.standard(t.typeName)], color: "var(--violet)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--warn)" },
  { tag: t.heading, color: "var(--accent)", fontWeight: "600" },
]);

function languageFor(path: string) {
  if (path.endsWith(".go")) return [go(), indentUnit.of("\t"), EditorState.tabSize.of(4)];
  if (path.endsWith(".md")) return [markdown()];
  return [];
}

interface Props {
  path: string;
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
  onRun: () => void;
}

/** One editor per open file; remount (key by path) to switch files. */
export function CodeEditor({ path, value, onChange, onSave, onRun }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onChange, onSave, onRun });
  useEffect(() => {
    handlers.current = { onChange, onSave, onRun };
  });

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          ...languageFor(path),
          theme,
          syntaxHighlighting(highlight),
          Prec.highest(
            keymap.of([
              { key: "Mod-s", preventDefault: true, run: () => (handlers.current.onSave(), true) },
              { key: "Mod-Enter", preventDefault: true, run: () => (handlers.current.onRun(), true) },
            ]),
          ),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ "aria-label": `Editor: ${path}` }),
        ],
      }),
    });
    return () => view.destroy();
    // Created once per mount; the parent keys this component by path and passes the initial text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="ide-editor" />;
}
