/**
 * Gera `data/land-mask.json` — a trama de pontos que desenha os continentes.
 *
 *     node scripts/generate-land-mask.mjs
 *
 * ── Por que uma trama, e não tiles ──
 * O mapa-base do Orbital é deliberadamente mudo: continentes em pontos, sem
 * ruas, rótulos nem relevo. Dizer onde a empresa fica é papel do índice e do
 * painel de detalhe; o mapa só dá o contexto. Isso dispensa tiles de terceiros
 * no caminho do mapa — o MapTiler continua servindo apenas ao geocoding.
 *
 * ── A grade é uniforme em Mercator, não em latitude ──
 * O modo plano do MapLibre é Mercator, que estica a latitude perto dos polos.
 * Uma grade de passo fixo em graus apareceria na tela com linhas cada vez mais
 * afastadas no norte do Canadá e da Rússia. Aqui o passo vertical é constante
 * em **y de Mercator** e igual ao horizontal, e os pontos saem equidistantes
 * na tela em qualquer latitude.
 *
 * ── Formato ──
 * Uma linha por faixa de y, codificada em corridas alternadas água/terra,
 * começando por água: `"12,5,30,2"` = 12 células de água, 5 de terra, 30 de
 * água, 2 de terra. A decodificação mora em `lib/land.ts`.
 *
 * ⚠️ **O resultado é commitado, e o script não roda no build** — mesmo esquema
 * de `data/countries.json`. A fonte é baixada uma vez, com versão fixada.
 *
 * Fonte: Natural Earth 110m (domínio público), via `world-atlas`.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json";

/**
 * 424 colunas ≈ 0,85° por ponto. O passo era 1° no protótipo; 15% mais fino
 * foi o equilíbrio escolhido entre definição no zoom máximo e peso.
 */
const COLUMNS = 424;

/** Faixa de latitude desenhada. Abaixo de -57° só há Antártida. */
const LAT_NORTH = 83;
const LAT_SOUTH = -57;

const toMercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const fromMercatorY = (y) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

// ── Decodificação do TopoJSON ────────────────────────────────────────────────

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Falha ao baixar ${SOURCE}: HTTP ${response.status}`);
const topo = await response.json();
const { scale, translate } = topo.transform;

const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

function ring(indices) {
  const points = [];
  for (const i of indices) {
    const arc = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
}

const polygons = [];
for (const geometry of topo.objects.land.geometries) {
  const list = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
  for (const polygon of list) {
    const rings = polygon.map(ring);
    const xs = rings[0].map(([x]) => x);
    const ys = rings[0].map(([, y]) => y);
    polygons.push({
      rings,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    });
  }
}

/**
 * Par-ímpar sobre todos os anéis: buracos (lagos) se resolvem sozinhos.
 *
 * ⚠️ **Arestas que saltam mais de 180° de longitude são ignoradas.** Elas não
 * são costa: são o corte do antimeridiano, onde um polígono (Fiji, Chukotka)
 * passa de +180° para -180°. Para o teste do raio horizontal, uma aresta assim
 * atravessa o planeta inteiro, e toda linha da trama que cai na faixa de
 * latitude dela sai com a paridade trocada — terra no oceano, oceano no
 * continente. Foi assim que uma linha a -16,3° cortou o Brasil ao meio.
 */
function isLand(lng, lat) {
  let inside = false;
  for (const p of polygons) {
    if (lng < p.minX || lng > p.maxX || lat < p.minY || lat > p.maxY) continue;
    for (const r of p.rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i];
        const [xj, yj] = r[j];
        if (Math.abs(xj - xi) > 180) continue;
        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
    }
  }
  return inside;
}

// ── Amostragem ───────────────────────────────────────────────────────────────

const stepDeg = 360 / COLUMNS;
const stepY = (stepDeg * Math.PI) / 180;
const yTop = toMercatorY(LAT_NORTH);
const yBottom = toMercatorY(LAT_SOUTH);

const rows = [];
let landCells = 0;

for (let y = yTop; y >= yBottom; y -= stepY) {
  const lat = fromMercatorY(y);
  const runs = [];
  let current = false;
  let count = 0;
  for (let col = 0; col < COLUMNS; col++) {
    const land = isLand(-180 + (col + 0.5) * stepDeg, lat);
    if (land) landCells++;
    if (land === current) count++;
    else {
      runs.push(count);
      current = land;
      count = 1;
    }
  }
  runs.push(count);
  rows.push(runs.join(","));
}

const out = { columns: COLUMNS, yTop, stepY, rows };
const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "data", "land-mask.json");
const json = JSON.stringify(out);
writeFileSync(target, json + "\n");

console.log(
  `${rows.length} linhas × ${COLUMNS} colunas · ${landCells} pontos de terra · ${json.length} bytes → data/land-mask.json`,
);
