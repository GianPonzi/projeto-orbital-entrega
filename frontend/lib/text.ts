/**
 * Helpers de texto compartilhados entre a busca (client) e a captura.
 *
 * U+0300-U+036F e o bloco Combining Diacritical Marks: as marcas que o `NFD`
 * separa da letra base. Escrito como escape, e nao com os caracteres
 * combinantes literais, porque literais sao invisiveis no editor e qualquer
 * ferramenta que re-normalize o arquivo os destruiria silenciosamente.
 *
 * Nao usar `\p{Diacritic}`: e mais amplo e tambem casaria acentos soltos
 * (U+00B4), que nao sao marcas combinantes.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Lowercase + sem acento, para "sao paulo" casar com "Sao Paulo". */
export function normalize(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

/** "Aguas Claras" -> "aguas-claras". */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * As letras do logo provisório de uma empresa.
 *
 * - sigla curta em maiúsculas vale como está: "AMD", "TSMC", "BYD";
 * - duas ou mais palavras dão as iniciais das duas primeiras: "Figure AI" → "FA";
 * - uma palavra só dá a inicial: "Corning" → "C".
 *
 * Nome sem letra latina ("比亚迪") devolve o primeiro caractere: o logo mostra o
 * ideograma, que é mais reconhecível do que um "?" genérico.
 */
export function monogram(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  if (/^[A-Z0-9]{2,4}$/.test(clean)) return clean;
  const words = clean.split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return [...clean][0].toUpperCase();
}
