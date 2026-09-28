import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

import {
  DEFAULT_PALETTE,
  isPaletteId,
  PALETTE_COOKIE,
  PALETTE_THEME_COLOR,
  type PaletteId,
} from "@/lib/palette";

/**
 * Duas famílias variáveis, e as duas com o eixo de **largura** (`wdth`).
 *
 * `axes` existe para isto (`font.md:160`): por padrão o `next/font` só baixa o
 * eixo de peso, e sem `wdth` todo `font-stretch` do app cairia em silêncio na
 * largura normal — os rótulos expandidos, que são metade da identidade visual,
 * sumiriam sem erro nenhum.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Orbital — inteligência de empresas",
  description:
    "Radar pessoal de empresas e fornecedores pelo mundo, num mapa-múndi e numa galeria de fichas.",
};

/**
 * A paleta escolhida, lida do cookie. Qualquer valor fora da lista das três cai
 * na padrão — o cookie é entrada do cliente e vira atributo no `<html>`.
 *
 * `cookies()` torna o layout dinâmico (`cookies.md:69`); todas as rotas do app
 * já eram, porque a página e o login leem a sessão.
 */
async function readPalette(): Promise<PaletteId> {
  const value = (await cookies()).get(PALETTE_COOKIE)?.value;
  return isPaletteId(value) ? value : DEFAULT_PALETTE;
}

/**
 * `generateViewport`, e não o objeto estático, só por causa do `themeColor`: a
 * barra do navegador no celular acompanha o fundo da paleta
 * (`generate-viewport.md:43`).
 */
export async function generateViewport(): Promise<Viewport> {
  const palette = await readPalette();
  return {
    themeColor: PALETTE_THEME_COLOR[palette],
    width: "device-width",
    initialScale: 1,
    // Keep the map usable on touch; prevent iOS double-tap zoom fighting the map
    maximumScale: 1,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const palette = await readPalette();

  return (
    <html
      lang="pt-BR"
      // No HTML do servidor, não depois de hidratar: sem isso a Grafite
      // piscaria antes de toda página aberta em outra paleta.
      data-palette={palette}
      className={`${archivo.variable} ${martianMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-canvas text-primary md:overflow-hidden">
        {children}
      </body>
    </html>
  );
}
