/**
 * A trama de continentes e o graticule — PURO, sem I/O.
 *
 * `data/land-mask.json` é gerado por `scripts/generate-land-mask.mjs` e
 * commitado. Aqui ele é decodificado **uma vez**, no carregamento do módulo,
 * em duas geometrias GeoJSON prontas para o MapLibre.
 *
 * ⚠️ Import estático de JSON é o comportamento desejado, como em
 * `lib/countries.ts`: a trama não muda em runtime. E só `MapCanvas` importa
 * este arquivo — ele é carregado com `ssr: false`, então os 10 KB entram no
 * pedaço do mapa e não no bundle inicial.
 */

import mask from "@/data/land-mask.json";

const fromMercatorY = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

/**
 * Um `MultiPoint` só, não um `Feature` por ponto: são ~34 mil posições, e 34
 * mil objetos `Feature` custariam memória e tempo de parse no worker do
 * MapLibre para carregar exatamente a mesma informação.
 */
function decodeLand(): GeoJSON.Feature<GeoJSON.MultiPoint> {
  const step = 360 / mask.columns;
  const coordinates: [number, number][] = [];

  mask.rows.forEach((row, r) => {
    const lat = fromMercatorY(mask.yTop - r * mask.stepY);
    let col = 0;
    let land = false;
    for (const run of row.split(",").map(Number)) {
      if (land) {
        for (let i = 0; i < run; i++) {
          coordinates.push([-180 + (col + i + 0.5) * step, lat]);
        }
      }
      col += run;
      land = !land;
    }
  });

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPoint", coordinates },
  };
}

/** Meridianos a cada 30° e os paralelos -30/0/30/60 — o quadriculado da carta. */
function buildGraticule(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (let lng = -180; lng <= 180; lng += 30) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[lng, -80], [lng, 84]] },
    });
  }
  for (let lat = -30; lat <= 60; lat += 30) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[-180, lat], [180, lat]] },
    });
  }

  return { type: "FeatureCollection", features };
}

export const LAND = decodeLand();
export const GRATICULE = buildGraticule();

/**
 * Espaçamento entre pontos, em pixels, no zoom 0 — um grau no equador do
 * MapLibre vale `512 / 360` px no zoom 0, e dobra a cada nível.
 */
export const LAND_CELL_PX_AT_Z0 = (512 / 360) * (360 / mask.columns);
