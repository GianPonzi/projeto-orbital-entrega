/**
 * Ordem, grupos e tempo relativo das empresas — PURO, sem I/O.
 *
 * O índice à esquerda e a galeria mostram a mesma lista, na mesma ordem e com
 * os mesmos cabeçalhos. A regra mora aqui, uma vez, para as duas vistas não
 * divergirem.
 *
 * ── Os cabeçalhos dizem algo verdadeiro ──
 * Em "Recentes" os grupos são o tempo desde a captura (esta semana, depois os
 * meses); em "Prioridade", as três faixas; em "A–Z", a inicial. Nenhum grupo é
 * decorativo: todo cabeçalho responde uma pergunta sobre as empresas embaixo.
 *
 * `today` é sempre um parâmetro, vindo de `todayString()`. Ler o relógio aqui
 * tornaria a função impura e impossível de testar.
 */

import { isRecentCapture, type Company } from "@/lib/companies";
import { daysBetween } from "@/lib/dates";
import { normalize } from "@/lib/text";

export type SortMode = "recentes" | "prioridade" | "az";

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "recentes", label: "Recentes" },
  { id: "prioridade", label: "Prioridade" },
  { id: "az", label: "A–Z" },
];

export interface CompanyGroup {
  key: string;
  label: string;
  companies: Company[];
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const PRIORITY_GROUP = ["Prioridade normal", "Prioridade alta", "Prioridade máxima"];

const byName = (a: Company, b: Company) => a.name.localeCompare(b.name, "pt-BR");

/**
 * `addedAt` só tem o dia (`"YYYY-MM-DD"`), então duas capturas no mesmo dia
 * empatam — e o desempate é o nome, para a ordem não pular entre renders.
 */
export function sortCompanies(companies: Company[], mode: SortMode): Company[] {
  const list = [...companies];
  if (mode === "recentes") {
    list.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || byName(a, b));
  } else if (mode === "prioridade") {
    list.sort(
      (a, b) =>
        b.priority - a.priority ||
        Number(b.favorite) - Number(a.favorite) ||
        b.addedAt.localeCompare(a.addedAt) ||
        byName(a, b),
    );
  } else {
    list.sort(byName);
  }
  return list;
}

function groupOf(
  company: Company,
  mode: SortMode,
  today: string,
): { key: string; label: string } {
  if (mode === "recentes") {
    if (isRecentCapture(company, today)) return { key: "semana", label: "Esta semana" };
    const [year, month] = company.addedAt.split("-");
    const label = MONTHS_LONG[Number(month) - 1];
    // O ano só aparece quando não é o corrente — "Agosto" basta este ano.
    return {
      key: `${year}-${month}`,
      label: year === today.slice(0, 4) ? label : `${label} ${year}`,
    };
  }
  if (mode === "prioridade") {
    return { key: `p${company.priority}`, label: PRIORITY_GROUP[company.priority] };
  }
  // Inicial sem acento ("Ó" cai em "O"). Nome que não começa por letra latina
  // (um fornecedor chinês com nome em ideogramas) vai para "#".
  const initial = normalize(company.name).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial)
    ? { key: initial, label: initial }
    : { key: "#", label: "#" };
}

/** A lista ordenada e fatiada nos grupos do modo, na ordem em que aparecem. */
export function groupCompanies(
  companies: Company[],
  mode: SortMode,
  today: string,
): CompanyGroup[] {
  const groups: CompanyGroup[] = [];
  const byKey = new Map<string, CompanyGroup>();

  for (const company of sortCompanies(companies, mode)) {
    const { key, label } = groupOf(company, mode, today);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label, companies: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.companies.push(company);
  }

  return groups;
}

/** "hoje", "ontem", "3 d", "2 sem", "jul" — cabe na coluna estreita do índice. */
export function captureAgeShort(addedAt: string, today: string): string {
  const days = daysBetween(addedAt, today);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `${days} d`;
  if (days < 30) return `${Math.floor(days / 7)} sem`;
  return MONTHS_SHORT[Number(addedAt.slice(5, 7)) - 1];
}

/** "hoje", "há 3 dias", "há 2 semanas", "há 4 meses" — para frase, não coluna. */
export function captureAgeLong(addedAt: string, today: string): string {
  const days = daysBetween(addedAt, today);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `há ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

/** "22 set 2026". */
export function captureDate(addedAt: string): string {
  const [year, month, day] = addedAt.split("-");
  return `${Number(day)} ${MONTHS_SHORT[Number(month) - 1]} ${year}`;
}
