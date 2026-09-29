import { QuestView } from "@/components/QuestView";
import { idx } from "@/lib/course";

// Static export: every quest and Gate Trial page is generated at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return [...idx.quests.map((q) => ({ id: q.id })), ...idx.course.phases.map((p) => ({ id: p.boss.id }))];
}

export default async function QuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuestView key={id} id={id} />;
}
