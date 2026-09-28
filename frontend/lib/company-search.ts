/**
 * Busca de empresas para o ⌘K — PURO, sem I/O.
 *
 * Procura em **todas** as empresas, não só nas que passam pelos filtros: o ⌘K
 * responde "isso já está no radar?", e um filtro esquecido ligado faria a
 * resposta ser "não" para uma empresa que está lá — e a pessoa a capturaria de
 * novo.
 *
 * ── A ordem importa mais que o casamento ──
 * Nome que **começa** com o texto vem antes de nome que só o contém, e os dois
 * antes de quem casa só pela cidade, país ou categoria. "nu" acha Nubank antes
 * de uma empresa em Nuremberg.
 */

import type { Company } from "@/lib/companies";
import { normalize } from "@/lib/text";

/** Menor é melhor; `null` = não casa. */
function rank(company: Company, needle: string, categoryLabel: string): number | null {
  const name = normalize(company.name);
  if (name.startsWith(needle)) return 0;
  if (name.includes(needle)) return 1;
  const place = normalize(`${company.city} ${company.country} ${categoryLabel}`);
  if (place.includes(needle)) return 2;
  return null;
}

export function searchCompanies(
  companies: Company[],
  query: string,
  /** Rótulo da categoria de um slug — vem do índice da taxonomy de quem chama. */
  categoryLabel: (slug: string) => string,
  limit = 7,
): Company[] {
  const needle = normalize(query);
  if (!needle) return [];

  return companies
    .map((company) => ({
      company,
      score: rank(company, needle, categoryLabel(company.categorySlug)),
    }))
    .filter((hit): hit is { company: Company; score: number } => hit.score !== null)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.company.name.localeCompare(b.company.name, "pt-BR"),
    )
    .slice(0, limit)
    .map((hit) => hit.company);
}

/**
 * Já existe empresa com exatamente este nome (ignorando caixa e acento)?
 *
 * É o que tira a linha "Capturar …" do ⌘K: o banco recusaria o nome repetido
 * de qualquer jeito (o slug é `@unique`), e oferecer uma captura que sempre
 * falha é pior do que não oferecer.
 */
export function hasCompanyNamed(companies: Company[], query: string): boolean {
  const needle = normalize(query);
  return needle !== "" && companies.some((c) => normalize(c.name) === needle);
}

/**
 * Empresas do radar com nome parecido — para **avisar**, nunca bloquear.
 *
 * Usada no cartão da proposta do agente: ele escreve o nome oficial
 * ("Cerebras Systems") e o radar pode ter o nome curto ("Cerebras"). O banco
 * só barra o nome idêntico depois da normalização, então os dois passariam.
 *
 * Parecido = igual, ou um é o outro seguido de mais palavras. Deliberadamente
 * estreito: "AMD" × "AMD Inc" avisa, "Nu" × "Nubank" não. Detecção de verdade
 * continua no backlog (`roadmap.md`).
 */
export function findSimilarCompanies(
  companies: Company[],
  name: string,
): Company[] {
  const needle = normalize(name);
  if (!needle) return [];
  return companies.filter((company) => {
    const other = normalize(company.name);
    return (
      other === needle ||
      other.startsWith(`${needle} `) ||
      needle.startsWith(`${other} `)
    );
  });
}
