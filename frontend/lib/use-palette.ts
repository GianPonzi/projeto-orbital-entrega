"use client";

/**
 * As cores da paleta ativa, como **valores** — para quem não lê CSS.
 *
 * O resto da interface pinta com `var(--token)` e troca de paleta sozinho. O
 * MapLibre não: as `paint` das camadas WebGL recebem strings de cor prontas, e
 * uma `var(--sea)` ali seria ignorada. Este hook lê os tokens do `<html>` e
 * volta a ler sempre que `data-palette` muda.
 *
 * ⚠️ `usePaletteColors` só pode rodar no navegador (lê `getComputedStyle`) — o
 * único consumidor é o `MapCanvas`, carregado com `ssr: false`. `usePalette`
 * pode rodar no servidor: lá ele devolve a padrão, e a hidratação corrige.
 */

import { useMemo, useSyncExternalStore } from "react";

import {
  DEFAULT_PALETTE,
  PALETTE_COOKIE,
  PALETTE_COOKIE_MAX_AGE,
  type PaletteId,
} from "@/lib/palette";

export interface PaletteColors {
  sea: string;
  land: string;
  grid: string;
  ink: string;
  accent: string;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-palette"],
  });
  return () => observer.disconnect();
}

const getPalette = () =>
  (document.documentElement.dataset.palette as PaletteId | undefined) ?? DEFAULT_PALETTE;
const getServerPalette = () => DEFAULT_PALETTE;

/**
 * A paleta ativa, lida do `<html>`. No servidor devolve a padrão; na
 * hidratação o React relê do DOM e corrige sem erro de divergência — o
 * `useSyncExternalStore` existe para isso.
 */
export function usePalette(): PaletteId {
  return useSyncExternalStore(subscribe, getPalette, getServerPalette);
}

/**
 * Troca a paleta agora e lembra dela no cookie, para o próximo carregamento já
 * vir do servidor com ela. Direto no navegador, sem Server Action: não há dado
 * do banco envolvido, e o valor é revalidado pelo layout ao ser lido.
 */
export function applyPalette(palette: PaletteId): void {
  document.documentElement.dataset.palette = palette;
  document.cookie = `${PALETTE_COOKIE}=${palette}; path=/; max-age=${PALETTE_COOKIE_MAX_AGE}; samesite=lax`;
}

export function usePaletteColors(): PaletteColors {
  // O nome da paleta é o que muda; as cores derivam dele. Assinar o nome (uma
  // string) e não o objeto evita um snapshot novo a cada leitura.
  const palette = usePalette();

  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const read = (token: string) => css.getPropertyValue(token).trim();
    return {
      sea: read("--sea"),
      land: read("--land"),
      grid: read("--grid"),
      ink: read("--ink"),
      accent: read("--accent"),
    };
    // `palette` é a dependência que importa: as cores são lidas do DOM, e é
    // a troca de paleta que as invalida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);
}
