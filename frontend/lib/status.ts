import type { CompanyStatus } from "./companies";

export interface StatusMeta {
  id: CompanyStatus;
  label: string;
  color: string;
}

/** Ordered — drives the status filter chips and any status dot in the UI. */
export const STATUSES: StatusMeta[] = [
  { id: "interesse", label: "Interesse", color: "#94a3b8" },
  { id: "avaliando", label: "Avaliando", color: "#fbbf24" },
  { id: "ativa", label: "Ativa", color: "#34d399" },
  { id: "arquivada", label: "Arquivada", color: "#64748b" },
];

const BY_ID = new Map<CompanyStatus, StatusMeta>(STATUSES.map((s) => [s.id, s]));

export function getStatus(id: CompanyStatus): StatusMeta {
  return BY_ID.get(id)!;
}
