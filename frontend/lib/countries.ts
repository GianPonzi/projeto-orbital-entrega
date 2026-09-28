/**
 * A lista de países — PURA, sem I/O, importável dos dois lados da fronteira.
 *
 * ⚠️ **Import estático de JSON aqui é o comportamento desejado**, ao contrário
 * do que era em `lib/categories.ts`. Lá o import colava a taxonomy no bundle e
 * impedia que ela fosse editável em runtime — o motivo de ela ter ido para o
 * banco. Aqui é o oposto: a lista não muda, ninguém a edita, e estar no bundle
 * é justamente o que faz o autocomplete de país responder sem rede.
 *
 * O arquivo é **gerado**, não digitado — `scripts/generate-countries.mjs`.
 *
 * ── Por que existe, já que o MapTiler devolve o país junto com a cidade ──
 * Porque ele devolve *um* nome, e não *o mesmo* nome: com `language=pt`, o
 * geocoding responde "Estados Unidos da América" enquanto o ICU diz "Estados
 * Unidos". Duas grafias do mesmo país no banco quebram o filtro e a leitura.
 * Resolvemos o `country_code` (`us`) contra esta lista, e o nome gravado passa
 * a ter uma fonte só.
 */

import countriesData from "@/data/countries.json";
import { normalize } from "@/lib/text";

export interface Country {
  /** ISO 3166-1 alpha-2, em MAIÚSCULAS. */
  code: string;
  /** Nome em pt-BR — é isto que vai para `Company.country`. */
  name: string;
  /** Nome em inglês. Existe só para a busca achar "united" em "Estados Unidos". */
  en: string;
}

export const COUNTRIES: readonly Country[] = countriesData;

const BY_NORMALIZED_NAME = new Map(
  COUNTRIES.map((country) => [normalize(country.name), country]),
);

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

/**
 * Casa pelo nome, ignorando acento e caixa.
 *
 * Devolve `undefined` para o que não estiver na lista — e isso é estado
 * legítimo, não erro: empresas cadastradas antes desta lista existir têm o país
 * como texto livre, e o formulário precisa continuar mostrando o que está lá.
 */
export function findCountryByName(name: string): Country | undefined {
  return BY_NORMALIZED_NAME.get(normalize(name.trim()));
}

/** Aceita o código como o MapTiler devolve (`"br"`), em qualquer caixa. */
export function findCountryByCode(code: string): Country | undefined {
  return BY_CODE.get(code.trim().toUpperCase());
}
