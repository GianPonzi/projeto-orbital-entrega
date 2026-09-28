/**
 * Relations between companies — modeled as independent edges (NOT stored on the
 * company itself), so a connection exists exactly once and can never appear
 * "half linked". Each edge already carries both endpoints, so the map layer can
 * draw an arc by looking up the source/target coordinates.
 *
 * PURO, sem I/O — importado dos dois lados da fronteira cliente/servidor. A
 * leitura do banco vive em `lib/relations.server.ts`.
 *
 * Metade deste arquivo (tipos, cores, `arcPoints`) é constante de código, não
 * linha de banco: o enum `RelationType` existe no Postgres, mas o ciano/âmbar/
 * violeta e a geometria dos arcos são decisão de design.
 *
 * ⚠️ `source` e `target` carregam os **cuids** das empresas (`Company.id`), não
 * slugs. Nos JSONs eram slugs, porque lá o id da empresa era o próprio slug.
 */

/**
 * - `parceria`    → simétrica (linha sem seta): AMD ↔ Corning
 * - `fornecedor`  → direcionada (source fornece para target)
 * - `subsidiaria` → direcionada (source controla target)
 */
export type RelationType = "parceria" | "fornecedor" | "subsidiaria";

export interface Relation {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  label?: string;
  since?: number;
}

// ── Type metadata (color/label/direction) ───────────────────────────────────

export interface RelationTypeMeta {
  id: RelationType;
  label: string;
  color: string;
  /** Directed types get an arrowhead (source → target). */
  directed: boolean;
}

export const RELATION_TYPES: RelationTypeMeta[] = [
  { id: "parceria", label: "Parceria", color: "#22d3ee", directed: false },
  { id: "fornecedor", label: "Fornecedor", color: "#f59e0b", directed: true },
  { id: "subsidiaria", label: "Subsidiária", color: "#a78bfa", directed: true },
];

const RT_BY_ID = new Map<RelationType, RelationTypeMeta>(
  RELATION_TYPES.map((t) => [t.id, t]),
);

export function getRelationType(id: RelationType): RelationTypeMeta {
  return RT_BY_ID.get(id)!;
}

/** Flat [value, color, …] pairs for MapLibre `match` expressions. */
export const RELATION_COLOR_PAIRS: string[] = RELATION_TYPES.flatMap((t) => [
  t.id,
  t.color,
]);

// ── Arc geometry ────────────────────────────────────────────────────────────

/**
 * A curved (quadratic-bezier) arc between two [lng, lat] points, as a list of
 * coordinates for a GeoJSON LineString. The control point is offset
 * perpendicular to the midpoint so the line bows into an arc.
 */
export function arcPoints(
  a: [number, number],
  b: [number, number],
  curvature = 0.2,
  segments = 48,
): [number, number][] {
  const [ax, ay] = a;
  const [bx, by] = b;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector, scaled by distance for a proportional bow.
  // `curvature` sign/magnitude lets parallel edges fan out to either side.
  const cx = mx + (-dy / dist) * dist * curvature;
  const cy = my + (dx / dist) * dist * curvature;

  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    pts.push([
      u * u * ax + 2 * u * t * cx + t * t * bx,
      u * u * ay + 2 * u * t * cy + t * t * by,
    ]);
  }
  return pts;
}
