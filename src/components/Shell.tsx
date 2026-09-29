"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { dueCards } from "@/engine/game";
import { useGame } from "./GameProvider";
import { Onboarding } from "./Onboarding";
import { SystemButton } from "./system/SystemButton";
import { SystemWindow } from "./system/SystemWindow";

const LINKS = [
  { href: "/", label: "Status" },
  { href: "/quests", label: "Quests" },
  { href: "/review", label: "Review" },
  { href: "/journal", label: "Journal" },
  { href: "/profile", label: "Profile" },
  { href: "/ledger", label: "Ledger" },
  { href: "/settings", label: "Settings" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { state, now } = useGame();
  const path = usePathname();
  const due = dueCards(state, now).length;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link href="/" className="brand">Go<span>Steps</span></Link>
          {state.player.onboarded && (
            <nav className="nav-links" aria-label="Main">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
                  {l.label}
                  {l.href === "/review" && due > 0 && <span className="nav-badge">{due}</span>}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main className="main">{state.player.onboarded ? children : <Onboarding />}</main>
      <SystemButton />
      <SystemWindow />
    </>
  );
}
