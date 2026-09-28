/**
 * As três paletas — PURO, importável dos dois lados da fronteira.
 *
 * As cores de verdade moram em `app/globals.css`, como tokens trocados por
 * `data-palette` no `<html>`. Aqui fica só o que o JavaScript precisa saber:
 * quais existem, como se chamam, e as duas cores da amostra do seletor.
 *
 * ── Onde a escolha é guardada ──
 * Num cookie, e não no `localStorage`: o layout raiz lê o cookie **no
 * servidor** e o HTML já sai com a paleta certa. Com `localStorage` a página
 * pintaria a Grafite primeiro e trocaria depois de hidratar — um flash a cada
 * carregamento para quem usa a Atlas.
 */

export const PALETTE_IDS = ["grafite", "atlas", "carta"] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export const DEFAULT_PALETTE: PaletteId = "grafite";

export const PALETTE_COOKIE = "orbital_palette";

/** Um ano. É preferência, não sessão. */
export const PALETTE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface PaletteMeta {
  id: PaletteId;
  label: string;
  /** Uma linha, para o `title` do botão. */
  hint: string;
  /** Fundo e destaque — as duas metades da amostra no seletor. */
  bg: string;
  accent: string;
}

export const PALETTES: PaletteMeta[] = [
  { id: "grafite", label: "Grafite", hint: "escuro neutro, âmbar", bg: "#181c19", accent: "#eaa73b" },
  { id: "atlas", label: "Atlas", hint: "claro, ultramarino", bg: "#eceee9", accent: "#2a3fcb" },
  { id: "carta", label: "Carta", hint: "azul-marinho, areia", bg: "#122030", accent: "#d8bd84" },
];

/**
 * O cookie é entrada do cliente: qualquer valor chega. Só um id conhecido vira
 * atributo no `<html>` — o resto cai na paleta padrão.
 */
export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value);
}

/** A cor do fundo do app em cada paleta — vai para o `theme-color` do navegador. */
export const PALETTE_THEME_COLOR: Record<PaletteId, string> = {
  grafite: "#111412",
  atlas: "#eceee9",
  carta: "#0c1622",
};
