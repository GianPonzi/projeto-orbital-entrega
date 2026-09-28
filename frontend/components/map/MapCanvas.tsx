"use client";

/**
 * O mapa — palco mudo, com as empresas por cima.
 *
 * ── Sem tiles ──
 * O mapa-base são três camadas locais: o fundo, o graticule e a trama de
 * pontos dos continentes (`lib/land.ts`). Nada de ruas, rótulos ou relevo —
 * dizer onde a empresa fica é papel do índice e do detalhe; o mapa dá o
 * contexto. O MapTiler continua no projeto, mas só para o geocoding.
 *
 * ── Plano, e só plano ──
 * O globo saiu com o layout novo. Rotação e inclinação também estão
 * desligadas: num mapa de pontos elas só desalinham a trama.
 *
 * ── Pins em HTML, não em camada WebGL ──
 * Cada pin é um `<Marker>` com um botão dentro. É o único jeito de ter o
 * pulso, o anel e o rótulo como CSS — e com dezenas ou centenas de empresas o
 * custo é irrelevante. Em troca, não há clusters: cada empresa é um pin.
 *
 * ── As cores vêm da paleta ──
 * O MapLibre recebe cor como valor, não como `var(--token)`. `usePaletteColors`
 * lê os tokens do `<html>` e reage à troca de paleta.
 */

import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type LayerProps,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";

import { cn } from "@/lib/utils";
import { isRecentCapture } from "@/lib/companies";
import { todayString } from "@/lib/dates";
import { GRATICULE, LAND, LAND_CELL_PX_AT_Z0 } from "@/lib/land";
import { arcPoints, RELATION_COLOR_PAIRS } from "@/lib/relations";
import { useServerRelations, useTaxonomy } from "@/lib/data-context";
import { useIsMobile } from "@/lib/use-mobile";
import { usePaletteColors } from "@/lib/use-palette";
import {
  useAllCompanies,
  useAppStore,
  useFilteredCompanies,
} from "@/lib/store";

const LAND_SOURCE_ID = "land";
const GRATICULE_SOURCE_ID = "graticule";
const REL_SOURCE_ID = "relations";
const ARROW_IMAGE_ID = "rel-arrow";

/**
 * Estilo vazio: sem fontes remotas, sem sprite, sem glyphs. As camadas entram
 * como componentes `<Layer>` abaixo, que é o que permite repintá-las pela
 * paleta sem trocar o estilo inteiro.
 */
const BASE_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

/**
 * A trama perde sentido de perto — um ponto por ~0,85° vira bolinhas soltas.
 * O teto foi combinado assim; ver `scripts/generate-land-mask.mjs`.
 */
const MAX_ZOOM = 6;

/** A partir daqui todos os pins mostram o nome, em vez de só no hover. */
const LABELS_ZOOM = 3;

/** Zoom de chegada ao focar uma empresa pela lista. */
const FOCUS_ZOOM = 3.5;

/**
 * Largura que o painel de detalhe cobre à direita do mapa, no desktop. O voo
 * até uma empresa desconta isto (`padding` do `flyTo`), para o pin parar no
 * centro da área visível e não debaixo do painel.
 */
const DETAIL_PANEL_PX = 380;

/** Diâmetro do pin por prioridade (0 normal · 1 alta · 2 máxima). */
const PIN_DIAMETER = [9, 12, 16] as const;

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

// Cor da aresta por `type`, igual ao painel de detalhe.
const relationColor = [
  "match",
  ["get", "type"],
  ...RELATION_COLOR_PAIRS,
  "#8b98a9",
];

/**
 * Triângulo branco que vira ícone de seta. Registrado como SDF, e é isso que
 * permite recolori-lo pela paleta (`icon-color`) sem desenhar de novo.
 */
function makeArrowImage(size = 16): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(size * 0.15, size * 0.2);
  ctx.lineTo(size * 0.85, size * 0.5);
  ctx.lineTo(size * 0.15, size * 0.8);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Raio do ponto da trama: 30% do espaçamento, que dobra a cada nível de zoom.
 * O piso de 0,55px no zoom 0 mantém a trama visível no mapa inteiro, onde a
 * conta pura daria pontos de um terço de pixel.
 */
const landRadius = [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  0, Math.max(0.55, LAND_CELL_PX_AT_Z0 * 0.3),
  2, LAND_CELL_PX_AT_Z0 * 0.3 * 4,
  MAX_ZOOM, LAND_CELL_PX_AT_Z0 * 0.3 * 2 ** MAX_ZOOM,
];

const relationGlowLayer: LayerProps = {
  id: "relation-glow",
  type: "line",
  source: REL_SOURCE_ID,
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": relationColor as never,
    "line-width": 6,
    "line-opacity": 0.18,
    "line-blur": 4,
  },
};

const relationLineLayer: LayerProps = {
  id: "relation-line",
  type: "line",
  source: REL_SOURCE_ID,
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": relationColor as never,
    "line-width": 1.8,
    "line-opacity": 0.9,
  },
};

export default function MapCanvas() {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);

  const companies = useFilteredCompanies();
  const allCompanies = useAllCompanies();
  const allRelations = useServerRelations();
  // Uma chamada, no topo. O objeto é usado dentro dos `.map()` mais abaixo.
  const tax = useTaxonomy();
  const colors = usePaletteColors();
  const focus = useAppStore((s) => s.focus);
  const selectedId = useAppStore((s) => s.selectedId);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const select = useAppStore((s) => s.select);
  const isMobile = useIsMobile();
  const setMapView = useAppStore((s) => s.setMapView);
  // Booleano, e não o zoom: o seletor só dispara render quando cruza o
  // limiar, em vez de a cada quadro de movimento.
  const showLabels = useAppStore((s) => s.mapView.zoom >= LABELS_ZOOM);

  // ── Mini-cards (desligados, guardados para uso futuro) ──
  // O chip com o nome ao lado de cada pin virou o rótulo `.map-pin__tag`,
  // que aparece sozinho a partir de `LABELS_ZOOM`. O toggle e o estado
  // continuam existindo (`MiniCardToggle.tsx`, `miniCardMode` na store); para
  // religar, descomente esta linha e o bloco no fim do JSX, e volte o
  // `<MiniCardToggle />` para o `AppShell`.
  // const miniCardMode = useAppStore((s) => s.miniCardMode);

  // Read the initial camera once; the map stays uncontrolled afterwards.
  // Lazy initializer, not a ref: this value is read during render.
  const [initialView] = useState(() => useAppStore.getState().mapView);

  // Calculado a cada render: é uma string, e o pulso tem que virar à meia-noite
  // mesmo com o app aberto de um dia para o outro.
  const today = todayString();

  // Arestas da empresa selecionada, e quem está na outra ponta delas.
  const { arcs, linked } = useMemo<{
    arcs: GeoJSON.FeatureCollection;
    linked: Set<string>;
  }>(() => {
    if (!selectedId) return { arcs: EMPTY_FC, linked: new Set() };

    const byId = new Map(allCompanies.map((c) => [c.id, c]));
    const rels = allRelations.filter(
      (r) => r.source === selectedId || r.target === selectedId,
    );
    const features: GeoJSON.Feature[] = [];
    const others = new Set<string>();

    // Group edges by the (unordered) pair so parallel relations fan out
    // instead of stacking on the same curve.
    const pairKey = (a: string, b: string) => [a, b].sort().join("|");
    const groupTotals = new Map<string, number>();
    for (const r of rels) {
      const k = pairKey(r.source, r.target);
      groupTotals.set(k, (groupTotals.get(k) ?? 0) + 1);
    }
    const groupSeen = new Map<string, number>();

    for (const r of rels) {
      const from = byId.get(r.source);
      const to = byId.get(r.target);
      if (!from || !to) continue;

      const k = pairKey(r.source, r.target);
      const total = groupTotals.get(k) ?? 1;
      const idx = groupSeen.get(k) ?? 0;
      groupSeen.set(k, idx + 1);
      const curvature = total === 1 ? 0.22 : 0.3 * (idx - (total - 1) / 2);

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: arcPoints(
            [from.lng, from.lat],
            [to.lng, to.lat],
            curvature,
          ),
        },
        properties: { type: r.type, id: r.id },
      });
      others.add(r.source === selectedId ? r.target : r.source);
    }

    return {
      arcs: { type: "FeatureCollection", features },
      linked: others,
    };
  }, [selectedId, allCompanies, allRelations]);

  // Camadas que dependem da paleta. Memoizadas: `<Layer>` repinta quando as
  // props trocam de identidade, e sem o memo isso aconteceria a cada render.
  const baseLayers = useMemo(
    () => ({
      sea: {
        id: "sea",
        type: "background",
        paint: { "background-color": colors.sea },
      } satisfies LayerProps,
      graticule: {
        id: "graticule",
        type: "line",
        source: GRATICULE_SOURCE_ID,
        paint: { "line-color": colors.grid, "line-width": 1 },
      } satisfies LayerProps,
      land: {
        id: "land",
        type: "circle",
        source: LAND_SOURCE_ID,
        paint: {
          "circle-color": colors.land,
          "circle-radius": landRadius as never,
        },
      } satisfies LayerProps,
      arrow: {
        id: "relation-arrow",
        type: "symbol",
        source: REL_SOURCE_ID,
        // Só os tipos direcionados ganham seta (parceria é simétrica).
        filter: ["!=", ["get", "type"], "parceria"],
        layout: {
          "symbol-placement": "line-center",
          "icon-image": ARROW_IMAGE_ID,
          "icon-size": 0.9,
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: { "icon-color": colors.ink },
      } satisfies LayerProps,
    }),
    [colors],
  );

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Plano de verdade: sem girar e sem inclinar pelo toque.
    map.touchZoomRotate.disableRotation();

    if (!map.hasImage(ARROW_IMAGE_ID)) {
      const arrow = makeArrowImage();
      if (arrow) map.addImage(ARROW_IMAGE_ID, arrow, { pixelRatio: 2, sdf: true });
    }
    setLoaded(true);
  }, []);

  // Fly to a company when the list requests focus (token changes each time).
  // Region focus carries its own zoom.
  useEffect(() => {
    if (!loaded || !focus) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Só o foco numa empresa abre o painel; enquadrar uma região não.
    const panelOpen = !isMobile && focus.zoom === undefined;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? Math.max(map.getZoom(), FOCUS_ZOOM),
      padding: { top: 0, bottom: 0, left: 0, right: panelOpen ? DETAIL_PANEL_PX : 0 },
      duration: 1200,
    });
    // `isMobile` fica de fora de propósito: girar o celular não deve refazer o
    // último voo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, loaded]);

  const handleMove = useCallback(
    (event: ViewStateChangeEvent) => {
      const { longitude, latitude, zoom } = event.viewState;
      setMapView({ lng: longitude, lat: latitude, zoom });
    },
    [setMapView],
  );

  return (
    <div className={cn("absolute inset-0 bg-sea", showLabels && "map-labels")}>
      <MapGL
        ref={mapRef}
        initialViewState={{
          longitude: initialView.lng,
          latitude: initialView.lat,
          zoom: initialView.zoom,
        }}
        minZoom={0.8}
        maxZoom={MAX_ZOOM}
        mapStyle={BASE_STYLE}
        dragRotate={false}
        pitchWithRotate={false}
        onLoad={handleLoad}
        onMove={handleMove}
        attributionControl={false}
        reuseMaps
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl
          position="bottom-right"
          showCompass={false}
          visualizePitch={false}
        />

        <Layer {...baseLayers.sea} />

        <Source id={GRATICULE_SOURCE_ID} type="geojson" data={GRATICULE}>
          <Layer {...baseLayers.graticule} />
        </Source>

        <Source id={LAND_SOURCE_ID} type="geojson" data={LAND}>
          <Layer {...baseLayers.land} />
        </Source>

        {/* Arcos da empresa selecionada — sob os pins, que são DOM */}
        <Source id={REL_SOURCE_ID} type="geojson" data={arcs}>
          <Layer {...relationGlowLayer} />
          <Layer {...relationLineLayer} />
          {loaded && <Layer {...baseLayers.arrow} />}
        </Source>

        {companies.map((c) => {
          const selected = c.id === selectedId;
          return (
            <Marker
              key={c.id}
              longitude={c.lng}
              latitude={c.lat}
              anchor="center"
              // Selecionada por cima de tudo; entre as demais, a prioridade
              // decide quem cobre quem quando dois pins se sobrepõem.
              style={{ zIndex: selected ? 10 : c.priority + 1 }}
            >
              <button
                type="button"
                aria-label={c.name}
                aria-pressed={selected}
                onClick={() => select(c.id)}
                className={cn(
                  "map-pin",
                  c.favorite && "is-fav",
                  c.status === "arquivada" && "is-arch",
                  isRecentCapture(c, today) && "is-recent",
                  selected && "is-sel",
                  c.id === hoveredId && "is-hot",
                  linked.has(c.id) && "is-linked",
                )}
                style={
                  {
                    "--c": tax.getCategory(c.categorySlug).color,
                    "--d": `${PIN_DIAMETER[c.priority]}px`,
                  } as React.CSSProperties
                }
              >
                <span className="map-pin__dot" />
                <span className="map-pin__tag">{c.name}</span>
              </button>
            </Marker>
          );
        })}

        {/* Mini-cards — desligados; ver o comentário no topo do componente.
        {miniCardMode &&
          companies.map((c) => (
            <Marker
              key={`card-${c.id}`}
              longitude={c.lng}
              latitude={c.lat}
              anchor="bottom"
              offset={[0, -9]}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  select(c.id);
                }}
                className={cn(
                  "flex max-w-[160px] items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium shadow-md backdrop-blur-sm transition-colors",
                  selectedId === c.id
                    ? "border-accent/60 bg-accent/20 text-primary"
                    : "border-border bg-canvas/85 text-primary hover:border-border-strong",
                )}
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: tax.getCategory(c.categorySlug).color,
                  }}
                />
                <span className="truncate">{c.name}</span>
              </button>
            </Marker>
          ))}
        */}
      </MapGL>
    </div>
  );
}
