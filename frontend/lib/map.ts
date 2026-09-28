/**
 * Geocoding e autocomplete de cidade, pelo MapTiler.
 *
 * ⚠️ O MapTiler **não** serve mais o mapa-base: o mapa é uma trama de pontos
 * local (`lib/land.ts`), sem tiles. A chave continua existindo só para as
 * duas buscas abaixo. Sem ela, as duas se desligam e o formulário cai no
 * texto livre — o mapa não é afetado.
 *
 * Chave no `.env`:  NEXT_PUBLIC_MAPTILER_KEY=xxxxx
 */

export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Resultado do geocoding.
 *
 * ⚠️ Os quatro casos existem porque **"não achei" e "não consegui perguntar"
 * exigem mensagens diferentes**. Antes tudo colapsava em `null`, e uma queda
 * da API do MapTiler aparecia para o usuário como "revise cidade e país" — ele
 * corrigiria um texto que já estava certo, indefinidamente.
 */
export type GeocodeOutcome =
  | { status: "ok"; point: GeoPoint }
  /** A API respondeu e não encontrou nada. O texto é que está errado. */
  | { status: "not-found" }
  /** Rede, erro HTTP ou estouro de prazo. O texto pode estar certo. */
  | { status: "unavailable" }
  /** Sem `NEXT_PUBLIC_MAPTILER_KEY` — geocoding desligado por configuração. */
  | { status: "disabled" };

/**
 * ⚠️ `fetch` sem prazo espera indefinidamente, e isto roda **no meio do fluxo
 * de captura**: uma requisição pendurada trava a captura sem erro e sem saída,
 * com o botão desabilitado. Oito segundos é folga larga para um geocoding.
 */
const GEOCODE_TIMEOUT_MS = 8_000;

// ── Autocomplete de cidade ──────────────────────────────────────────────────

/**
 * Uma cidade sugerida enquanto o usuário digita, já traduzida para os campos do
 * formulário. Carrega as **coordenadas**, e é isso que faz o autocomplete valer
 * mais do que evitar typo: escolher uma sugestão resolve o pin ali mesmo, e o
 * envio deixa de precisar de uma segunda chamada ao geocoding.
 */
export interface PlaceSuggestion {
  /** `id` do feature no MapTiler — chave de lista estável, nada mais. */
  id: string;
  /** Nome da cidade, como vai para `Company.city`. */
  city: string;
  /** ISO 3166-1 alpha-2 em minúsculas, como o MapTiler devolve. */
  countryCode: string;
  /** Hierarquia completa ("Paris, Texas, Estados Unidos da América"). Só para exibir. */
  context: string;
  lat: number;
  lng: number;
}

/**
 * ⚠️ **A filtragem por tipo acontece aqui, e não no parâmetro `types` da API.**
 *
 * Passar `types` ao MapTiler não filtra o ranking: ele **refaz** a busca dentro
 * dos tipos pedidos, e o resultado piora muito. Medido contra a API real:
 * `types=municipality,place,locality` fazia "shenzhen" devolver cinco vilarejos
 * e nenhuma Shenzhen (ela é `subregion`), e "new york" devolver povoados
 * ingleses antes de Nova Iorque. Sem `types`, as duas vêm em primeiro lugar.
 *
 * Então pedimos o ranking bom e descartamos o que não é lugar habitado — ruas,
 * baías e pontos de interesse, que o campo "cidade" não deve oferecer.
 */
const CITY_LIKE_TYPES = new Set([
  "municipality",
  "municipal_district",
  "joint_municipality",
  "joint_submunicipality",
  "locality",
  "place",
  // Cidades-prefeitura chinesas e os cinco distritos de Nova Iorque caem aqui.
  // Sem este, os dois casos somem — e a China é escopo declarado do produto.
  "subregion",
]);

/** Teto da API (`limit` aceita 1–10). Pedimos o máximo porque filtramos depois. */
const SEARCH_LIMIT = 10;

/**
 * Busca cidades para o autocomplete.
 *
 * `signal` vem de quem chama: cada tecla cancela a busca anterior, senão uma
 * resposta lenta de "par" chega depois de "paris" e sobrescreve a lista certa.
 */
export async function searchCities(
  query: string,
  options: { countryCode?: string; signal?: AbortSignal } = {},
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!MAPTILER_KEY || !q) return [];

  const params = new URLSearchParams({
    key: MAPTILER_KEY,
    autocomplete: "true",
    // `pt` primeiro, `en` como reserva. Sem o `en`, cidades sem tradução para
    // português voltam só no alfabeto local (深圳), que é o que se quer para o
    // nome oficial mas é impossível de reconhecer numa lista.
    language: "pt,en",
    limit: String(SEARCH_LIMIT),
  });
  // Restringe ao país já escolhido — é o que separa Paris (França) de Paris
  // (Texas) sem o usuário precisar ler a hierarquia de cada linha.
  if (options.countryCode) params.set("country", options.countryCode);

  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?${params}`;

  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) throw new Error(`MapTiler respondeu ${res.status}`);

  const data = (await res.json()) as {
    features?: Array<{
      id?: string;
      text?: string;
      place_name?: string;
      place_type?: string[];
      center?: [number, number];
      context?: Array<{ id?: string; text?: string; country_code?: string }>;
    }>;
  };

  const suggestions: PlaceSuggestion[] = [];

  for (const feature of data.features ?? []) {
    const type = feature.place_type?.[0];
    if (!type || !CITY_LIKE_TYPES.has(type)) continue;

    const center = feature.center;
    const city = feature.text;
    if (!center || !city) continue;

    // O país sai do `context`, e pelo **código**, não pelo nome: o nome vem
    // traduzido pelo MapTiler ("Estados Unidos da América") e divergiria do que
    // `data/countries.json` grava. Ver `lib/countries.ts`.
    const country = feature.context?.find((entry) =>
      entry.id?.startsWith("country"),
    );
    if (!country?.country_code) continue;

    const [lng, lat] = center;
    suggestions.push({
      id: feature.id ?? `${city}-${lat}-${lng}`,
      city,
      countryCode: country.country_code,
      context: feature.place_name ?? city,
      lat,
      lng,
    });
  }

  return suggestions;
}

/** "São Paulo, Brasil" → coordenadas, via API de geocoding do MapTiler. */
export async function geocode(query: string): Promise<GeocodeOutcome> {
  const q = query.trim();
  if (!MAPTILER_KEY) return { status: "disabled" };
  if (!q) return { status: "not-found" };

  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json` +
    `?key=${MAPTILER_KEY}&limit=1`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!res.ok) return { status: "unavailable" };

    const data = (await res.json()) as {
      features?: Array<{ center?: [number, number] }>;
    };
    const center = data.features?.[0]?.center;
    if (!center) return { status: "not-found" };

    const [lng, lat] = center;
    return { status: "ok", point: { lat, lng } };
  } catch {
    // Inclui o AbortError do prazo estourado.
    return { status: "unavailable" };
  }
}

/**
 * "23,55° S · 46,63° O" — vírgula decimal e hemisférios em português (L/O,
 * não E/W). Duas casas: ~1 km, a precisão real de um pin posto pela cidade.
 */
export function formatCoordinates(lat: number, lng: number): string {
  const fmt = (value: number) => Math.abs(value).toFixed(2).replace(".", ",");
  return `${fmt(lat)}° ${lat >= 0 ? "N" : "S"} · ${fmt(lng)}° ${lng >= 0 ? "L" : "O"}`;
}
