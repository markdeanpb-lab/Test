// Local projection: metres east (x) / south (z) of the origin (the Clock Tower, St Albans).
export const ORIGIN = { lat: 51.7513145, lon: -0.3404942 };
const R = 6378137;
const k = Math.cos((ORIGIN.lat * Math.PI) / 180);
export function project(lat: number, lon: number): [number, number] {
  const x = ((lon - ORIGIN.lon) * Math.PI / 180) * R * k;
  const z = -((lat - ORIGIN.lat) * Math.PI / 180) * R;
  return [x, z];
}
export function unproject(x: number, z: number): [number, number] {
  const lon = ORIGIN.lon + (x / (R * k)) * 180 / Math.PI;
  const lat = ORIGIN.lat - (z / R) * 180 / Math.PI;
  return [lat, lon];
}
