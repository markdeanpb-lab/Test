// Weather as an evolving process. The sky (cloud, rain, fog, temperature) evolves by regime-switching
// dynamics; the track surface (water depth, temperature, rubber) is tracked separately and dries with
// sun, wind, warmth and passing cars. Forecasts are model estimates with noise: they never read the future.
import { Rng } from './rng';
import { clamp, dexp } from './dmath';

// St Albans-like monthly climate (fictional-universe defaults; broadly typical of south-east England).
const MONTH_TEMP = [4.5, 5, 7.5, 10, 13.5, 16.5, 18.5, 18, 15.5, 11.5, 7.5, 5];
const MONTH_RAIN = [0.36, 0.3, 0.3, 0.3, 0.3, 0.27, 0.26, 0.28, 0.28, 0.34, 0.38, 0.36]; // chance a race window is unsettled
const MONTH_FOG = [0.06, 0.05, 0.03, 0.02, 0.01, 0.005, 0.005, 0.01, 0.03, 0.06, 0.08, 0.07];

export type Regime = 0 | 1 | 2 | 3; // 0 settled dry, 1 showery, 2 persistent rain, 3 fog/mist
export interface WeatherState {
  regime: Regime;
  cloud: number; // 0..1
  rain: number; // mm/h
  air: number; // deg C
  wind: number; // m/s
  vis: number; // visibility m (fog/spray)
  snow: boolean;
  water: number; // track wetness 0 (dry) .. ~1.2 (standing water)
  trackTemp: number;
  rubber: number; // 0..1 grip build-up on the racing line
  month: number;
  tSince: number; // seconds since last tick
}

export function weatherLabel(w: WeatherState): string {
  if (w.snow) return 'Snow';
  if (w.vis < 400 && w.regime === 3) return 'Fog';
  if (w.rain > 6) return 'Heavy rain';
  if (w.rain > 1.5) return 'Rain';
  if (w.rain > 0.15) return 'Drizzle';
  if (w.water > 0.25) return 'Drying, damp';
  if (w.cloud > 0.75) return 'Overcast';
  if (w.cloud > 0.4) return 'Cloudy';
  if (w.air > 25) return 'Hot, sunny';
  return 'Sunny';
}

/** Initial conditions for a meeting day, drawn from the meeting's own weather stream. */
export function initialWeather(rng: Rng, month: number, climateShift = 0): WeatherState {
  const m = clamp(month, 0, 11);
  const air = rng.gauss(MONTH_TEMP[m] + 5 + climateShift, 3.2); // afternoon race
  const unsettled = rng.chance(MONTH_RAIN[m]);
  const fog = !unsettled && rng.chance(MONTH_FOG[m]);
  let regime: Regime = 0;
  if (fog) regime = 3;
  else if (unsettled) regime = rng.chance(0.3) ? 2 : 1;
  const raining = regime === 2 ? rng.chance(0.7) : regime === 1 ? rng.chance(0.35) : false;
  const rain = raining ? (regime === 2 ? rng.range(1.5, 7) : rng.range(0.3, 3)) : 0;
  const snow = air < 1.5 && rain > 0;
  const priorRain = unsettled ? rng.range(0, 1) : rng.chance(0.08) ? rng.range(0, 0.4) : 0;
  const cloud = regime === 0 ? rng.range(0.05, 0.7) : regime === 3 ? 0.9 : rng.range(0.6, 1);
  return {
    regime, cloud, rain, air, wind: clamp(rng.gauss(4, 2.2), 0, 16), vis: fog ? rng.range(90, 600) : 10000, snow,
    water: clamp(priorRain * 0.5 + (rain > 0 ? 0.3 * Math.sqrt(rain) : 0), 0, 1.1), trackTemp: air + (1 - cloud) * rng.range(6, 16), rubber: 0, month: m, tSince: 0,
  };
}

/** Advance the sky and surface by dt seconds. carsPerMin = cars passing per minute (drying + rubber). */
export function stepWeather(w: WeatherState, rng: Rng, dt: number, carsPerMin: number) {
  const hours = dt / 3600;
  // regime switching (rates per hour)
  const r = rng.next();
  if (w.regime === 0) { if (r < 0.1 * hours) w.regime = 1; }
  else if (w.regime === 1) { if (r < 0.28 * hours) w.regime = 0; else if (r < 0.36 * hours) w.regime = 2; }
  else if (w.regime === 2) { if (r < 0.35 * hours) w.regime = 1; }
  else if (w.regime === 3) { if (r < 0.9 * hours) w.regime = 0; }
  // rain process: showers come and go; persistent rain is steadier
  let target = 0;
  if (w.regime === 1) target = rng.chance(0.012 * (dt / 10)) ? rng.range(0.5, 6) : w.rain > 0 && rng.chance(0.985) ? w.rain : 0;
  else if (w.regime === 2) target = clamp(w.rain + rng.gauss(0, 0.4) + 0.05, 0.8, 12);
  const tau = w.regime === 1 ? 120 : 400;
  w.rain = clamp(w.rain + (target - w.rain) * clamp(dt / tau, 0, 1), 0, 14);
  if (w.rain < 0.05) w.rain = 0;
  const cloudTarget = w.rain > 0 ? 0.95 : w.regime === 0 ? 0.35 : w.regime === 3 ? 0.9 : 0.75;
  w.cloud = clamp(w.cloud + (cloudTarget - w.cloud) * (dt / 900) + rng.gauss(0, 0.004), 0, 1);
  w.air = w.air + rng.gauss(0, 0.02) - (w.rain > 1 ? 0.002 * dt / 10 : 0);
  w.wind = clamp(w.wind + rng.gauss(0, 0.05), 0, 18);
  if (w.regime === 3) w.vis = clamp(w.vis + rng.gauss(0, 8) + dt * 0.25, 60, 10000);
  else w.vis = clamp(w.vis + dt * 3, 60, 10000);
  w.snow = w.air < 1.5 && w.rain > 0;
  // surface
  const sun = 1 - w.cloud;
  const trackTarget = w.air + sun * 16 - (w.water > 0.2 ? 6 : 0);
  w.trackTemp += (trackTarget - w.trackTemp) * clamp(dt / 600, 0, 1);
  // surface water relaxes towards an equilibrium set by rain intensity (drizzle: damp; heavy: standing water)
  if (w.rain > 0) {
    const eq = 0.35 * Math.sqrt(w.rain) + (w.rain > 6 ? 0.12 : 0);
    if (w.water < eq) w.water += (eq - w.water) * clamp(dt / 240, 0, 1);
    else w.water -= Math.min(w.water - eq, 0.00025 * dt);
  } else {
    const dry = 0.0003 + 0.0004 * sun + 0.00001 * clamp(w.trackTemp, 0, 45) + 0.00003 * w.wind + 0.00002 * carsPerMin; // per second
    w.water -= dry * dt;
  }
  w.water = clamp(w.water, 0, 1.25);
  if (w.water < 0.01) w.water = 0;
  const rubTarget = w.water > 0.3 ? 0 : 1;
  w.rubber = clamp(w.rubber + (rubTarget - w.rubber) * (dt / 3600) * (carsPerMin / 10), 0, 1);
  // spray reduces visibility in the wet
  if (w.water > 0.4 && w.rain > 2) w.vis = Math.min(w.vis, 10000 - (w.rain * 700));
}

/**
 * Team forecast of the chance of rain in the next `minutes`, from the current observable state only,
 * blurred by forecasting skill (0 = guesswork, 1 = modern radar).
 */
export function forecastRain(w: WeatherState, minutes: number, skill: number, rng: Rng): number {
  const h = minutes / 60;
  let p: number;
  if (w.rain > 0.2) p = w.regime === 2 ? 0.95 : 0.7;
  else if (w.regime === 2) p = 0.85;
  else if (w.regime === 1) p = 1 - dexp(-1.4 * h) * 0.6;
  else if (w.regime === 3) p = 0.05;
  else p = 1 - dexp(-0.12 * h);
  p = clamp(p * (0.6 + 0.4 * w.cloud), 0, 1);
  const noise = rng.gauss(0, 0.28 * (1 - skill) + 0.05);
  return clamp(p + noise, 0, 1);
}

/** Grip multiplier for a tyre type on a surface with wetness `water`. */
export function wetGrip(tyre: string, water: number, carWet: number, driverWet: number): number {
  const W = clamp(water, 0, 1.25);
  let g: number;
  switch (tyre) {
    case 'wet': g = 0.78 + 0.04 * clamp(W, 0, 0.7) - 0.05 * clamp(W - 0.9, 0, 0.35); break;
    case 'inter': g = 0.9 - 0.06 * Math.abs(W - 0.35) - 0.3 * clamp(W - 0.7, 0, 0.55); break;
    case 'treaded': g = 1 - 0.46 * clamp(W * 1.25, 0, 1.2); break;
    default: g = 1 - 0.66 * clamp(W * 1.45, 0, 1.15); break; // slick/dry compounds
  }
  // car wet behaviour and driver wet skill matter more the wetter it is
  const wetShare = clamp(W / 0.7, 0, 1);
  g *= 1 + wetShare * ((carWet - 1) * 0.6 + driverWet * 0.07);
  return clamp(g, 0.18, 1.05);
}

export function isUnsafe(w: WeatherState): string | null {
  if (w.snow && w.rain > 0.5) return 'snow';
  if (w.vis < 150) return 'fog';
  if (w.water > 1.1 && w.rain > 7) return 'standing water';
  return null;
}
