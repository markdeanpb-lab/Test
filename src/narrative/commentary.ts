// Live commentary. Facts first (who, where, why, what it changes), then an angle, then wording.
// Semantic cooldowns suppress repeated meanings, not just repeated phrases. Quiet running stays quiet.
import type { Universe } from '../sim/types';
import type { RaceState, FeedItem } from '../sim/race/engine';
import { TYRES } from '../sim/race/engine';
import type { WeekendSetup } from '../sim/race/setup';
import { Rng } from '../sim/rng';
import { relBetween } from '../sim/world/relationships';
import { weatherLabel } from '../sim/weather';

export interface Line { t: number; lap: number; text: string; sig: number; kind: string; drivers: string[] }
export type Density = 'low' | 'normal' | 'high';

const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
const fmtGap = (s: number) => (s < 10 ? s.toFixed(1) : Math.round(s).toString()) + 's';

export class Commentator {
  u: Universe; setup: WeekendSetup;
  density: Density = 'normal';
  lines: Line[] = [];
  private cool = new Map<string, number>();
  private rng: Rng;
  private lastObs = 0;
  private battles = new Map<string, { since: number; laps: number }>();
  private said = new Set<string>();

  constructor(u: Universe, setup: WeekendSetup) { this.u = u; this.setup = setup; this.rng = new Rng(`cosmetic:commentary:${setup.meetingId}`); }

  private threshold() { return this.density === 'low' ? 0.68 : this.density === 'high' ? 0.3 : 0.45; }
  private ok(key: string, t: number, cd: number) { const last = this.cool.get(key); if (last !== undefined && t - last < cd) return false; this.cool.set(key, t); return true; }
  private say(st: RaceState, text: string, sig: number, kind: string, drivers: string[]) { this.lines.push({ t: st.t, lap: st.lapNow ?? 0, text, sig, kind, drivers }); if (this.lines.length > 400) this.lines.shift(); }
  private e(st: RaceState, k?: number) { return k === undefined ? undefined : this.setup.entrants[st.cars[k].i]; }
  private nm(st: RaceState, k?: number) { const e = this.e(st, k); return e ? e.name : 'a car'; }
  private pick<T>(arr: T[]): T { return arr[this.rng.int(arr.length)]; }

  /** Title implication if the race ended now (provisional standings). */
  private provisional(st: RaceState): { leader: string; prevLeader: string } | null {
    const s = this.u.seasons[this.setup.year]; if (!s || st.kind !== 'race') return null;
    const regs = this.u.regs.sets[this.u.regs.current];
    const pts = new Map<string, number>();
    for (const r of s.driverStandings) pts.set(r.id, r.points);
    const prevLeader = s.driverStandings[0]?.id;
    st.order.forEach((k, i) => { const e = this.e(st, k)!; if (st.cars[k].ret) return; pts.set(e.driverId, (pts.get(e.driverId) ?? 0) + (regs.points.table[i] ?? 0)); });
    let best = '', bp = -1; for (const [id, p] of pts) if (p > bp) { bp = p; best = id; }
    return prevLeader ? { leader: best, prevLeader } : null;
  }

  onFeed(items: FeedItem[], st: RaceState) {
    const th = this.threshold();
    for (const f of items) {
      const a = this.nm(st, f.a), b = this.nm(st, f.b);
      const ea = this.e(st, f.a), eb = this.e(st, f.b);
      const ids = [ea?.driverId, eb?.driverId].filter(Boolean) as string[];
      switch (f.kind) {
        case 'start': this.say(st, f.detail === 'wet start' ? this.pick(['Lights out on a wet track — visibility will be a problem in the spray.', 'Away they go, and it is treacherous out there.']) : this.pick([`And they're away in the ${this.setup.name}.`, `Lights out at the ${this.setup.name}!`, `The ${this.setup.name} is under way.`]), 1, 'start', []); break;
        case 'qstart': this.say(st, st.q?.format === 'single-lap' ? 'Qualifying: one flying lap each, cars released one by one.' : st.q?.format === 'knockout' ? 'Qualifying begins — the slowest will be knocked out after each segment.' : 'Timed practice is under way: the fastest lap sets the grid.', 0.6, 'quali', []); break;
        case 'ballot': this.say(st, 'The grid has been drawn by ballot, as the rules of the day require — the fast cars may have work to do.', 0.7, 'quali', []); break;
        case 'qcancelled': this.say(st, `Qualifying cannot run safely: ${f.detail}.`, 0.8, 'quali', []); break;
        case 'qfastest': if (f.sig >= th && this.ok('qfast', st.t, 20)) this.say(st, this.pick([`${a} goes top with ${fmtLap(f.value!)}.`, `Provisional pole now belongs to ${a}: ${fmtLap(f.value!)}.`, `${fmtLap(f.value!)} from ${a} — the new benchmark.`]), 0.55, 'quali', ids); break;
        case 'qseg': this.say(st, `Q${f.value} is over; the slowest drop out.`, 0.5, 'quali', []); break;
        case 'qend': this.say(st, `Pole position: ${a}${f.value ? `, ${fmtLap(f.value)}` : ''}.`, 0.8, 'quali', ids); break;
        case 'lead': {
          if (!this.ok(`lead:${ea?.driverId}`, st.t, 25)) break;
          const why = f.detail;
          const riv = ea && eb ? relBetween(this.u, ea.driverId, eb.driverId, 'rivalry') : undefined;
          if (why === 'pit stop') this.say(st, this.pick([`${a} inherits the lead while ${b} is in the pits.`, `The stop for ${b} hands the lead to ${a} — for now.`]), 0.8, 'lead', ids);
          else if (why === 'retirement') this.say(st, `${a} now leads after ${b}'s retirement.`, 0.9, 'lead', ids);
          else if (why === 'mistake') this.say(st, `${b}'s error at ${f.where} hands the lead to ${a}.`, 0.9, 'lead', ids);
          else this.say(st, riv && riv.intensity > 0.4 ? `${a} takes the lead from ${b} at ${f.where} — no quarter given between these two.` : this.pick([`${a} takes the lead at ${f.where}!`, `New leader: ${a}, past ${b} at ${f.where}.`, `${a} is through into the lead.`]), 0.95, 'lead', ids);
          break;
        }
        case 'overtake': {
          if (f.sig < th || (f.pos ?? 99) === 1) break;
          if (!this.ok(`ov:${ea?.driverId}:${eb?.driverId}`, st.t, 60)) break;
          if (!this.ok('ov-any', st.t, this.density === 'high' ? 4 : 10)) break;
          const reason = f.detail ?? '';
          const why = reason === 'slipstream' ? 'using the tow' : reason === 'braking' ? 'out-braking him on the way in' : reason === 'fresher tyres' ? 'the fresher tyres telling' : reason === 'tyre choice in the wet' ? 'the tyre choice paying off' : reason === 'mistake' || reason === 'spin' ? 'after that mistake' : reason === 'problem' ? `${b} has a problem` : '';
          const where = f.where ? ` at ${f.where}` : '';
          const text = this.pick([
            `${a} passes ${b}${where} for ${ord(f.pos ?? 0)}${why ? ', ' + why : ''}.`,
            `${ord(f.pos ?? 0)} place changes hands${where}: ${a} ahead of ${b}.`,
            `${a} gets by ${b}${where}${why ? ' — ' + why : ''}.`,
          ]);
          this.say(st, text.replace('out-braking him', 'out-braking'), f.sig, 'overtake', ids);
          break;
        }
        case 'pit': {
          const [reason, tyre] = (f.detail ?? '').split('|');
          if ((f.pos ?? 99) > 6 && f.sig < th) break;
          if (!this.ok(`pit:${ea?.driverId}`, st.t, 30)) break;
          const t = TYRES[tyre]?.label.toLowerCase();
          const dur = f.value ? ` (${f.value.toFixed(1)}s in the pit lane)` : '';
          const why = reason === 'weather' ? 'for weather tyres' : reason === 'undercut' ? 'trying the undercut' : reason === 'safety car stop' ? 'taking advantage of the safety car' : reason === 'repair' ? 'for repairs' : reason === 'fuel' ? 'for fuel' : reason === 'drive-through' ? 'to serve the penalty' : reason === 'puncture' ? 'with a puncture' : '';
          this.say(st, `${a} pits from ${ord(f.pos ?? 0)}${why ? ' ' + why : ''}${t && reason !== 'drive-through' ? ` — ${t} tyres` : ''}${dur}.`, Math.max(f.sig, 0.4), 'pit', ids);
          break;
        }
        case 'retire': {
          const [cat, reason] = (f.detail ?? '').split('|');
          if ((f.pos ?? 99) > 10 && f.sig < th) break;
          this.say(st, cat === 'mechanical' ? this.pick([`${a} is out: ${reason} at ${f.where}.`, `Retirement for ${a} — ${reason}.`, `${reason[0].toUpperCase() + reason.slice(1)} ends ${a}'s race from ${ord(f.pos ?? 0)}.`]) : cat === 'contact' ? `${a} is out after the collision at ${f.where}.` : `${a} ${reason} at ${f.where} and is out.`, f.sig, 'retire', ids);
          break;
        }
        case 'contact': { if (this.ok(`contact:${ids.join()}`, st.t, 30)) { const [how] = (f.detail ?? '').split('|'); this.say(st, how === 'a-dive' ? `Contact! ${a} dives down the inside of ${b} at ${f.where} and they touch.` : `${a} and ${b} collide at ${f.where}.`, 0.75, 'contact', ids); } break; }
        case 'spin': if (f.sig >= th) this.say(st, this.pick([`${a} spins at ${f.where}!`, `A spin for ${a} at ${f.where}.`]), f.sig, 'incident', ids); break;
        case 'mistake': if (f.sig >= th + 0.05 && this.ok(`mis:${ea?.driverId}`, st.t, 60)) this.say(st, f.detail === 'locked up' ? `${a} locks up into ${f.where}${f.value ? ` and loses ${f.value.toFixed(1)}s` : ''}.` : f.detail === 'ran wide' ? `${a} runs wide at ${f.where}.` : `${a} ${f.detail} at ${f.where}.`, f.sig, 'incident', ids); break;
        case 'puncture': this.say(st, `${a} has a puncture${f.where ? ` near ${f.where}` : ''}.`, 0.6, 'incident', ids); break;
        case 'problem': if (f.sig >= th) this.say(st, `${a} appears to have a ${f.detail}.`, f.sig, 'incident', ids); break;
        case 'penalty': this.say(st, `The stewards give ${a} a ${f.detail ?? 'penalty'}.`, 0.6, 'penalty', ids); break;
        case 'reprimand': this.say(st, `${a} is ${f.detail ?? 'fined by the stewards'} — a fine, but no sporting penalty under these rules.`, 0.4, 'penalty', ids); break;
        case 'sc': this.say(st, `Safety car: ${f.detail}. The field will close up.`, 0.85, 'flag', []); break;
        case 'scin': this.say(st, 'The safety car will come in at the end of this lap.', 0.6, 'flag', []); break;
        case 'restart': this.say(st, f.detail === 'standing restart after the red flag' ? 'We are going racing again: a standing restart.' : 'Green flag — racing resumes.', 0.7, 'flag', []); break;
        case 'red': this.say(st, `Red flag. The race is stopped: ${f.detail}.`, 0.95, 'flag', []); break;
        case 'delay': this.say(st, `The start is delayed: ${f.detail}.`, 0.8, 'flag', []); break;
        case 'resume': this.say(st, 'Conditions have improved; the start procedure resumes.', 0.6, 'flag', []); break;
        case 'postponed': this.say(st, `The race cannot start today — ${f.detail}.`, 1, 'flag', []); break;
        case 'rain': if (this.ok('rain', st.t, 300)) this.say(st, `${f.detail}. Watch the tyre calls now.`, 0.7, 'weather', []); break;
        case 'rainstop': if (this.ok('rainstop', st.t, 300)) this.say(st, 'The rain has stopped; a dry line may not be far away.', 0.5, 'weather', []); break;
        case 'drying': if (this.ok('drying', st.t, 300)) this.say(st, 'A dry line is appearing — slick tyres are coming into play.', 0.55, 'weather', []); break;
        case 'fastest': if (f.sig >= th && this.ok('fastest', st.t, 120)) this.say(st, `Fastest lap for ${a}: ${fmtLap(f.value!)}.`, 0.35, 'timing', ids); break;
        case 'injury': this.say(st, `Medical staff are attending to ${a}.`, 0.8, 'incident', ids); break;
        case 'fatal': this.say(st, `There is grave news concerning ${a}. We will not speculate.`, 1, 'incident', ids); break;
        case 'finish': { const hist = ea ? this.u.careers[ea.driverId] : undefined; const first = hist && hist.wins === 0; this.say(st, first ? `${a} wins the ${this.setup.name} — a first championship victory!` : this.pick([`${a} takes the chequered flag to win the ${this.setup.name}.`, `Victory for ${a} in the ${this.setup.name}.`]), 1, 'finish', ids); break; }
        case 'end': if (f.detail?.startsWith('abandoned')) this.say(st, 'The race has been abandoned.', 1, 'finish', []); break;
      }
    }
  }

  /** Situational observations in quiet phases: battles, gap trends, strategy, weather, title picture. */
  observe(st: RaceState) {
    if (st.kind !== 'race' || st.phase !== 'run') return;
    const gap = this.density === 'low' ? 150 : this.density === 'high' ? 45 : 80;
    if (st.t - this.lastObs < gap) return;
    const L = this.u;
    const ord2 = st.order.filter((k) => !st.cars[k].ret && st.cars[k].mode !== 'out');
    const candidates: { sig: number; text: string; key: string; ids: string[] }[] = [];
    // battles: two cars within a second for several laps
    for (let i = 1; i < Math.min(ord2.length, 10); i++) {
      const A = st.cars[ord2[i]], B = st.cars[ord2[i - 1]];
      const key = `${A.i}-${B.i}`;
      const bt = this.battles.get(key);
      if (A.gapAhead < 1.0) { if (!bt) this.battles.set(key, { since: st.t, laps: A.lap }); else if (A.lap - bt.laps >= 3) { const ea = this.setup.entrants[A.i], eb = this.setup.entrants[B.i]; const riv = relBetween(L, ea.driverId, eb.driverId, 'rivalry'); const tm = ea.teamId === eb.teamId; candidates.push({ sig: 0.55 + (i <= 2 ? 0.2 : 0) + (riv ? 0.1 : 0), key: `battle:${key}`, ids: [ea.driverId, eb.driverId], text: tm ? `Team-mates ${eb.name} and ${ea.name} have been inseparable for ${A.lap - bt.laps} laps, fighting over ${ord(i)}.` : riv && riv.intensity > 0.3 ? `${ea.name} is all over ${eb.name} — and these two have history.` : `${ea.name} has been within a second of ${eb.name} for ${A.lap - bt.laps} laps now, fighting for ${ord(i)}.` }); } }
      else if (bt) this.battles.delete(key);
    }
    // leader's margin trend
    if (ord2.length > 1) {
      const second = st.cars[ord2[1]];
      const lead = this.setup.entrants[st.cars[ord2[0]].i];
      if (second.gapAhead > 8) candidates.push({ sig: 0.4, key: `margin:${lead.driverId}:${Math.floor(second.gapAhead / 5)}`, ids: [lead.driverId], text: `${lead.name} leads by ${fmtGap(second.gapAhead)} with ${st.laps - (st.cars[ord2[0]].lap + 1)} laps to go.` });
      else if (second.gapAhead < 1.5) candidates.push({ sig: 0.55, key: `closefront:${Math.floor(st.t / 300)}`, ids: [lead.driverId], text: `Just ${fmtGap(second.gapAhead)} covers the top two.` });
    }
    // strategy divergence: someone on a different tyre near the front
    const tyres = ord2.slice(0, 6).map((k) => st.cars[k].tyre);
    const odd = ord2.slice(0, 6).find((k, i) => tyres.filter((t) => t === tyres[i]).length === 1 && tyres.length > 3);
    if (odd !== undefined) { const e2 = this.setup.entrants[st.cars[odd].i]; candidates.push({ sig: 0.45, key: `tyre:${e2.driverId}:${st.cars[odd].tyre}`, ids: [e2.driverId], text: `${e2.name} is the only one near the front on ${TYRES[st.cars[odd].tyre]?.label.toLowerCase()} tyres.` }); }
    // conditions
    if (st.w.water > 0.25 && st.w.rain < 0.2) candidates.push({ sig: 0.45, key: `drying:${Math.floor(st.t / 400)}`, ids: [], text: `The track is drying (${weatherLabel(st.w).toLowerCase()}); whoever judges the switch to slicks best may win this.` });
    // title picture
    const prov = this.provisional(st);
    if (prov && prov.leader !== prov.prevLeader) { const p = L.people[prov.leader]; candidates.push({ sig: 0.7, key: `title:${prov.leader}`, ids: [prov.leader], text: `As things stand, ${p.first} ${p.last} would take over the championship lead.` }); }
    candidates.sort((a, b) => b.sig - a.sig);
    for (const c of candidates) {
      if (c.sig < this.threshold() || this.said.has(c.key)) continue;
      this.said.add(c.key);
      this.lastObs = st.t;
      this.say(st, c.text, c.sig, 'observation', c.ids);
      break;
    }
  }
}

export function fmtLap(t: number): string { const m = Math.floor(t / 60); const s = t - m * 60; return m ? `${m}:${s.toFixed(3).padStart(6, '0')}` : `${s.toFixed(3)}`; }
