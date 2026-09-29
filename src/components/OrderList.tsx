"use client";

import Link from "next/link";
import type { DailyOrders, OrderItem } from "@/engine/state";
import { idx } from "@/lib/course";

function href(i: OrderItem) {
  if (i.kind === "review") return "/review";
  if (i.kind === "reflect") return "/journal";
  const t = i.taskId ? idx.taskById.get(i.taskId) : undefined;
  if (!t) return "/quests";
  return `/quests/${t.type === "boss" ? t.id : t.questId}#${t.id}`;
}

const LABEL: Record<OrderItem["kind"], string> = { review: "review", concept: "read", build: "build", reflect: "reflect" };

export function OrderList({ orders, onNavigate }: { orders: DailyOrders; onNavigate?: () => void }) {
  if (orders.items.length === 0) return <p className="muted">Nothing due today.</p>;
  return (
    <ul className="orders">
      {orders.items.map((i) => {
        const t = i.taskId ? idx.taskById.get(i.taskId) : undefined;
        return (
          <li key={i.id}>
            <Link className={`order ${i.done ? "done" : ""}`} href={href(i)} onClick={onNavigate}>
              <span className="box" aria-hidden="true" />
              <div>
                <div className="otitle">{i.title}</div>
                <div className="osub">
                  <span className={`type t-${i.kind}`}>{LABEL[i.kind]}</span>
                  {i.kind === "review" && <span>{i.progress}/{i.target}</span>}
                  {i.drill > 0 && <span>interleaved</span>}
                  {t && <span>~{t.minutes} min</span>}
                  {i.optional && <span>optional</span>}
                </div>
              </div>
              <span className="oxp">{i.done ? `+${i.xp}` : "→"}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
