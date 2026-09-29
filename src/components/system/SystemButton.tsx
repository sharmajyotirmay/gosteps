"use client";

import { useEffect } from "react";
import { useGame } from "../GameProvider";

// The hovering System icon, present on every screen. Ctrl/⌘+K or ` toggles the window.
export function SystemButton() {
  const { state, system } = useGame();
  const unread = Object.values(state.notices).filter((n) => !n.read).length;
  const { open, show, hide } = system;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "`" && !typing)) {
        e.preventDefault();
        if (open) hide();
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, show, hide]);

  if (!state.player.onboarded) return null;
  return (
    <>
      <button
        type="button"
        className={`sys-btn ${unread ? "alert" : ""}`}
        onClick={() => (open ? hide() : show())}
        aria-label={`Open the System${unread ? `, ${unread} unread notices` : ""} (Ctrl+K)`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="float">
          <span className="ring" />
          <span className="hex">
            <span className="glyph">{unread ? "!" : "◆"}</span>
          </span>
          {unread > 0 && <span className="count">{unread > 9 ? "9+" : unread}</span>}
        </span>
      </button>
      <span className="sys-hint">SYSTEM · ⌘K</span>
    </>
  );
}
