import type { Priority } from "./companies";

export interface PriorityMeta {
  id: Priority;
  label: string;
  color: string;
}

/**
 * Ordenado do menor para o maior. É `Int` no banco, e não enum, justamente para
 * `ORDER BY priority DESC` funcionar sozinho (`schema.prisma:108`) — a lista já
 * ordena por ele em `companies.server.ts:46`.
 */
export const PRIORITIES: PriorityMeta[] = [
  { id: 0, label: "Normal", color: "#94a3b8" },
  { id: 1, label: "Alta", color: "#fbbf24" },
  { id: 2, label: "Máxima", color: "#f87171" },
];

const BY_ID = new Map<Priority, PriorityMeta>(PRIORITIES.map((p) => [p.id, p]));

export function getPriority(id: Priority): PriorityMeta {
  return BY_ID.get(id) ?? PRIORITIES[0];
}
