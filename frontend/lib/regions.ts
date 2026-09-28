/**
 * Camera presets for the region switcher in the map corner. Selecting one only frames
 * the camera on the world map (it does not filter the data) — see the store's
 * `setRegion`.
 */

export type RegionId = "mundo" | "brasil" | "usa" | "europa" | "china";

export interface Region {
  id: RegionId;
  label: string;
  lng: number;
  lat: number;
  zoom: number;
}

export const REGIONS: Region[] = [
  { id: "mundo", label: "Mundo", lng: 0, lat: 25, zoom: 1.4 },
  { id: "brasil", label: "Brasil", lng: -51, lat: -14, zoom: 3.0 },
  { id: "usa", label: "EUA", lng: -98, lat: 39, zoom: 3.2 },
  { id: "europa", label: "Europa", lng: 10, lat: 50, zoom: 3.4 },
  { id: "china", label: "China", lng: 104, lat: 35.5, zoom: 3.2 },
];

export const DEFAULT_REGION: RegionId = "mundo";
