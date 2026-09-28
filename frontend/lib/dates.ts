/**
 * O fuso do usuário, fixo. O app é single-user e brasileiro; não há sessão de
 * onde derivar isso, e depender do fuso do processo daria resultados diferentes
 * no servidor (UTC na Vercel) e no navegador.
 */
const APP_TIME_ZONE = "America/Sao_Paulo";

/**
 * `Date` → `"2026-07-22"`, no fuso do usuário.
 *
 * Não usar `toISOString().slice(0, 10)`: ele converte para UTC antes de cortar,
 * então uma captura às 21h30 de Brasília (00h30 UTC) seria gravada com a data
 * do dia seguinte — justamente o "quando eu vi isso" que o campo existe para
 * preservar.
 *
 * `en-CA` é o locale que formata como `YYYY-MM-DD`.
 */
export function toDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
}

/** A data de hoje, no fuso do usuário, como `"2026-07-22"`. */
export function todayString(): string {
  return toDateString(new Date());
}

/**
 * Dias inteiros de `from` até `to`, as duas no formato `"YYYY-MM-DD"`.
 *
 * A conta é em UTC de propósito, e isso **não** reintroduz o bug que este
 * arquivo existe para evitar: as strings já foram cortadas no fuso do app, e
 * aqui só se mede a distância entre duas meias-noites UTC — que não têm
 * horário de verão para desalinhar a divisão.
 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
