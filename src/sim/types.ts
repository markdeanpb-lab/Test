// Canonical data model. Live state (people, teams, venues...) is separate from historical records
// (RaceRecord, season archives), which are immutable snapshots referencing stable IDs.
import type { RngState } from './rng';

export const ENGINE_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;

/** Integer day number, day 0 = 1900-01-01 (proleptic Gregorian). */
export type Day = number;
export type PersonId = string;
export type TeamId = string;
export type LineageId = string;
export type CarId = string;
export type VenueId = string;
export type GeometryId = string; // validated layout geometry from src/data/circuits.json, e.g. 'abbey-v2'
export type LayoutVersionId = string;
export type MeetingId = string;
export type RegSetId = string;
export type EventId = string;
export type TechId = string;
export type RelId = string;
export type StoryId = string;
export type SponsorId = string;

// ------------------------------------------------------------------ people
export interface Attrs {
  pace: number; // raw speed
  quali: number; // one-lap extraction
  racecraft: number; // overtaking
  defence: number;
  consistency: number;
  aggression: number; // risk appetite (personality-driven, not "better")
  wet: number;
  mechSympathy: number;
  adaptability: number;
  pressure: number; // pressure resistance
  fitness: number;
}
export type AttrKey = keyof Attrs;
export const ATTR_KEYS: AttrKey[] = ['pace', 'quali', 'racecraft', 'defence', 'consistency', 'aggression', 'wet', 'mechSympathy', 'adaptability', 'pressure', 'fitness'];

export interface DevProfile {
  ceiling: Attrs; // personal potential per attribute
  growth: number; // learning speed (0.4..1.6)
  peakPhysical: number; // age at which reflex/speed attributes peak
  peakMental: number; // age at which craft/composure attributes peak
  decline: number; // decline speed after peak (0.5..1.8)
  volatility: number; // year-to-year noise
  lateBloom: number; // 0..1: fraction of growth delayed into late twenties/thirties
}

export interface Personality {
  temperament: number; // 0 calm .. 1 fiery
  discipline: number;
  loyalty: number;
  ambition: number;
  sociability: number;
  resilience: number; // bounce-back after setbacks
}

export type DriverStyle = 'smooth' | 'aggressive' | 'technical' | 'instinctive';
export type PersonKind = 'driver' | 'engineer' | 'manager';
export type PersonStatus = 'prospect' | 'active' | 'reserve' | 'free' | 'retired' | 'deceased';

export interface Injury { day: Day; eventId: EventId; severity: number; returnDay: Day; cause: string; meetingId?: MeetingId }
export interface Contract { teamId: TeamId; fromYear: number; untilYear: number; role: 'lead' | 'second' | 'reserve'; salary: number }
export interface RoleSpell { role: 'driver' | 'mentor' | 'principal' | 'technical-director' | 'engineer' | 'pundit' | 'retired'; teamId?: TeamId; fromDay: Day; toDay?: Day }

export interface EloState {
  rating: number;
  rd: number; // uncertainty (points)
  peak: number;
  peakDay: Day;
  peakAge: number;
  peakMeetingId?: MeetingId;
  races: number; // races contributing evidence
  lastDay: Day;
  history: number[]; // packed pairs [day, rating*10] after each race
  seasonEnd: Record<number, number>;
}

export interface Person {
  id: PersonId;
  kind: PersonKind;
  first: string;
  last: string;
  gender: 'm' | 'f';
  nationality: string; // ISO-like code, e.g. 'GBR'
  hometown: string;
  dob: Day;
  dod?: Day;
  status: PersonStatus;
  // hidden generative model (never shown directly as "truth")
  attrs: Attrs;
  dev: DevProfile;
  personality: Personality;
  style: DriverStyle;
  balancePref: number; // -1 understeer .. +1 oversteer preference
  background: string;
  readiness: number; // rookie readiness 0..1 at debut
  // dynamic state
  form: number; // short-term (-1..1)
  confidence: number; // 0..1
  health: number; // 0..1
  injuries: Injury[];
  experience: number; // race starts
  circuitExp: Record<string, number>; // venueId -> races
  contract?: Contract;
  teamId?: TeamId;
  roles: RoleSpell[];
  reputation: number; // public standing 0..100
  elo: EloState;
  family: { parents: PersonId[]; children: PersonId[] };
  mentorId?: PersonId;
  // engineers/managers
  skill?: number; // technical or managerial quality 0..1
  specialty?: 'aero' | 'engine' | 'chassis' | 'operations';
  debutDay?: Day;
  debutMeetingId?: MeetingId;
  retiredDay?: Day;
  retireReason?: string;
  favourite?: boolean;
  notes: string[];
}

// ------------------------------------------------------------------ teams
export interface SponsorDeal { id: SponsorId; name: string; sector: string; value: number; fromYear: number; untilYear: number; title: boolean }
export interface TeamYearFinance { year: number; prize: number; sponsor: number; owner: number; other: number; wages: number; development: number; operations: number; cashEnd: number; debtEnd: number }
export interface TechProgress { status: 'research' | 'developed' | 'failed' | 'abandoned'; progress: number; invested: number; startedYear: number; doneYear?: number; quality?: number }

export interface Team {
  id: TeamId;
  lineageId: LineageId;
  name: string;
  short: string;
  code: string; // 3-letter timing code
  colours: { primary: string; secondary: string; accent: string };
  pattern: 'plain' | 'stripe' | 'band' | 'chevron' | 'quarters' | 'hoops';
  founded: number;
  base: string;
  ownerType: 'privateer' | 'works' | 'patron' | 'consortium';
  status: 'active' | 'withdrawn' | 'merged' | 'bankrupt' | 'renamed';
  cash: number; // £k, real terms
  debt: number;
  finance: TeamYearFinance[];
  sponsors: SponsorDeal[];
  ownerBacking: number; // £k per year owner is willing to fund
  principalId?: PersonId;
  techDirectorId?: PersonId;
  crew: number; // pit crew quality 0..1
  engineering: number; // engineering department depth 0..1
  facilities: number; // factory / wind tunnel / simulation capacity 0..1
  prestige: number; // 0..100
  philosophy: { focus: 'power' | 'aero' | 'mechanical' | 'reliability' | 'balanced'; risk: number; youth: number; stability: number };
  knowledge: { engine: number; chassis: number; aero: number; reliability: number; efficiency: number };
  tech: Record<TechId, TechProgress>;
  drivers: PersonId[];
  reserveId?: PersonId;
  carId?: CarId;
  joinedYear: number;
  leftYear?: number;
  successorId?: TeamId;
  predecessorIds: TeamId[];
  notes: string[];
}

export interface Lineage {
  id: LineageId;
  founded: number;
  entrants: { teamId: TeamId; name: string; fromYear: number; toYear?: number; how: 'founded' | 'rename' | 'takeover' | 'merger' }[];
  absorbed: { lineageId: LineageId; year: number; eventId: EventId }[];
  endedYear?: number;
  endReason?: string;
}

// ------------------------------------------------------------------ cars & technology
export interface CarSpec {
  powerKW: number;
  massKg: number;
  cdA: number;
  clA: number;
  mechGrip: number; // tyre/mechanical friction coefficient
  brakeG: number; // brake capability without aero (g)
  tyreWear: number; // multiplier
  fuelPerKm: number; // kg/km at racing pace
  reliability: number; // hazard multiplier (lower is better)
  cooling: number; // 0..1
  durability: number; // 0..1 damage tolerance
  wetHandling: number; // multiplier on wet grip
  aeroWindow: number; // 0..1 sensitivity to dirty air / conditions
  balance: number; // -1 understeer .. +1 oversteer
  drivability: number; // traction / ease (0..1)
  energyMJ: number; // deployable stored energy per lap (hybrid/electric), 0 if none
}
export type CarEra = 'vintage' | 'streamliner' | 'frontengine' | 'cigar' | 'wedge' | 'groundeffect' | 'turbo' | 'raisednose' | 'aero' | 'hybrid' | 'future';
export interface CarVisual { era: CarEra; wheelScale: number; wing: number; cockpit: 'open' | 'halo' | 'canopy'; noseHeight: number; sidepods: number; length: number; width: number; enclosedWheels: boolean }

export interface CarModel {
  id: CarId;
  teamId: TeamId;
  lineageId: LineageId;
  year: number;
  name: string;
  spec: CarSpec; // as launched
  current: CarSpec; // after in-season upgrades
  visual: CarVisual;
  techs: TechId[];
  concept: string; // short description of design emphasis
  upgrades: { day: Day; meetingId?: MeetingId; area: string; delta: number; success: boolean; eventId?: EventId }[];
  engineerId?: PersonId;
  launchedDay: Day;
  testPaceEstimate?: number; // public, noisy
}

export interface TechDef {
  id: TechId;
  name: string;
  area: 'engine' | 'chassis' | 'aero' | 'tyres' | 'safety' | 'electronics' | 'energy' | 'materials';
  from: number; // earliest year industrial capability makes it feasible (universe adds jitter)
  prereqs: TechId[];
  cost: number; // £k research cost
  years: number; // typical development time
  uncertainty: number; // 0..1 chance-weighted variance of outcome
  effects: Partial<Record<keyof CarSpec, number>>; // additive on normalised performance units (see tech.ts)
  window?: string; // operating envelope description
  risk: number; // reliability risk while immature 0..1
  banRisk: number; // likelihood regulators restrict it once dominant
  obsoletes?: TechId[];
  description: string;
}
export interface TechWorld {
  id: TechId;
  feasibleFrom: number; // universe-specific
  status: 'dormant' | 'feasible' | 'emerging' | 'common' | 'banned' | 'obsolete';
  firstTeam?: TeamId;
  firstDay?: Day;
  bannedDay?: Day;
  bannedBy?: RegSetId;
  returnedDay?: Day;
  adopters: TeamId[];
  eventIds: EventId[];
}

// ------------------------------------------------------------------ regulations
export type QualiFormat = 'ballot' | 'practice' | 'single-lap' | 'knockout';
export interface PointsRule { table: number[]; fastestLap: number; fastestLapMaxPos: number; pole: number; classifiedPct: number; halfPointsBelowPct: number; dropScores: number }
export interface RegSet {
  id: RegSetId;
  year: number; // first season in force
  label: string;
  reasons: string[];
  causeEventIds: EventId[];
  announcedDay: Day;
  emergency: boolean;
  powerCapKW: number;
  fuel: 'petrol' | 'alcohol' | 'leaded' | 'unleaded' | 'synthetic' | 'electric';
  fuelLimitKg: number | null;
  minMassKg: number;
  aeroCap: number; // max clA allowed (0 = wings banned)
  groundEffect: boolean;
  hybrid: boolean;
  electric: boolean;
  compounds: string[]; // dry compounds available
  wetTyres: string[];
  mandatoryTwoCompounds: boolean;
  refuelling: boolean;
  safetyCar: boolean;
  redFlagRestart: boolean;
  crashStructures: number; // 0..1
  cockpitProtection: number; // 0..1
  medical: number; // 0..1
  pitSpeedKph: number | null;
  qualifying: QualiFormat;
  points: PointsRule;
  raceKm: number;
  maxMinutes: number;
  penalties: 'fines' | 'time' | 'full';
  blueFlags: boolean;
  costCap: number | null; // £k per team
  bannedTech: TechId[];
  testingDays: number;
  maxEntries: number;
  teamOrdersAllowed: boolean;
}

// ------------------------------------------------------------------ venues & calendar
export interface LayoutVersion {
  id: LayoutVersionId;
  venueId: VenueId;
  geometryId: GeometryId;
  from: Day;
  to?: Day;
  reason: string;
  eventId?: EventId;
  surface: 'setts' | 'macadam' | 'tarmac' | 'modern';
  barrier: 'bales' | 'kerbs' | 'armco' | 'concrete' | 'energy';
  safety: number; // 0..1 run-off, fencing, marshalling
  pitQuality: number; // 0..1 pit lane / garages
  grip: number; // surface grip multiplier
}
export interface Venue {
  id: VenueId;
  name: string;
  status: 'active' | 'unavailable' | 'closed';
  statusReason?: string;
  unavailableUntil?: number;
  popularity: number; // 0..100
  versionIds: LayoutVersionId[];
  currentVersionId: LayoutVersionId;
  reverseAllowed: boolean;
  eventIds: EventId[];
}

export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled' | 'abandoned';
export interface Meeting {
  id: MeetingId;
  year: number;
  round: number;
  name: string;
  venueId: VenueId;
  geometryId: GeometryId;
  layoutVersionId: LayoutVersionId;
  day: Day;
  status: MeetingStatus;
  regSetId: RegSetId;
  laps: number;
  distanceKm: number;
  qualiFormat: QualiFormat;
  significance: number; // 1 normal, 2 prestigious (St Albans Grand Prix)
  calendarReason?: string; // why this meeting / layout was scheduled (e.g. consecutive exception)
  cancelReason?: string;
  causeEventIds: EventId[];
  postponedFrom?: Day;
}

// ------------------------------------------------------------------ race records (immutable history)
export type RetireCategory = 'mechanical' | 'driver' | 'contact' | 'other';
export interface ResultRow {
  pos: number | null; // classified position
  driverId: PersonId;
  teamId: TeamId;
  carId: CarId;
  no: number;
  grid: number | null;
  laps: number;
  time: number | null;
  status: 'finished' | 'dnf' | 'dsq' | 'nc' | 'dns';
  reason?: string;
  category?: RetireCategory;
  where?: string;
  points: number;
  bestLap: number | null;
  fastestLap: boolean;
  pits: number;
  penalties: { kind: string; seconds: number; reason: string }[];
  ledLaps: number;
  paceIndex: number | null; // measured median clean-lap pace relative to field median (s/lap, negative faster)
  cleanLaps: number;
}
export interface QualiRow { driverId: PersonId; teamId: TeamId; pos: number; time: number | null; note?: string }
export interface RaceEventRec {
  t: number; // sporting seconds since race start
  lap: number;
  kind: string;
  a?: PersonId;
  b?: PersonId;
  pos?: number;
  where?: string;
  s?: number; // track distance
  detail?: string;
  value?: number;
  sig: number; // significance 0..1
}
export interface RaceRecord {
  meetingId: MeetingId;
  year: number;
  round: number;
  name: string;
  day: Day;
  venueId: VenueId;
  geometryId: GeometryId;
  layoutVersionId: LayoutVersionId;
  regSetId: RegSetId;
  status: 'finished' | 'shortened' | 'abandoned';
  lapsScheduled: number;
  lapsCompleted: number;
  distanceKm: number;
  durationS: number;
  weather: { start: string; wetLaps: number; maxRain: number; trackTemp: number; airTemp: number; changeable: boolean };
  quali: QualiRow[];
  results: ResultRow[];
  events: RaceEventRec[];
  pole?: { driverId: PersonId; time: number | null };
  fastest?: { driverId: PersonId; time: number; lap: number };
  safetyCars: number;
  redFlags: number;
  overtakes: number;
  leadChanges: number;
  halfPoints: boolean;
  hash: string;
  engineVersion: string;
}

// ------------------------------------------------------------------ world events & relationships
export interface WorldEvent {
  id: EventId;
  day: Day;
  type: string;
  scope: 'driver' | 'team' | 'world' | 'venue' | 'tech' | 'regs' | 'meeting';
  title: string;
  people: PersonId[];
  teams: TeamId[];
  venues: VenueId[];
  meetingId?: MeetingId;
  techId?: TechId;
  severity: number; // 0..1
  facts: Record<string, any>;
  causes: EventId[];
  effects: string[];
  untilDay?: Day;
}

export interface Relationship {
  id: RelId;
  a: PersonId;
  b: PersonId;
  kind: 'rivalry' | 'friendship' | 'mentorship' | 'dispute';
  intensity: number; // 0..1
  since: Day;
  lastChange: Day;
  status: 'active' | 'faded' | 'reconciled' | 'ended';
  episodes: { day: Day; delta: number; cause: string; meetingId?: MeetingId; eventId?: EventId }[];
}

// ------------------------------------------------------------------ seasons
export interface StandingRow { id: string; points: number; wins: number; podiums: number; results: (number | null)[]; best: number; dropped?: number }
export interface Season {
  year: number;
  status: 'planned' | 'running' | 'complete' | 'interrupted' | 'cancelled';
  statusReason?: string;
  regSetId: RegSetId;
  meetings: Meeting[];
  entries: { teamId: TeamId; name: string; code: string; carId: CarId; drivers: PersonId[]; nos: number[]; colours: Team['colours']; pattern: Team['pattern'] }[];
  driverStandings: StandingRow[];
  teamStandings: StandingRow[];
  championId?: PersonId;
  teamChampionId?: TeamId;
  decidedRound?: number;
  review?: SeasonReview;
  testing?: { teamId: TeamId; estimate: number; laps: number }[];
  rookies: PersonId[];
  retirements: PersonId[];
  eventIds: EventId[];
}
export interface SeasonReview {
  year: number;
  headline: string;
  paragraphs: { text: string; refs: string[] }[];
  facts: Record<string, any>;
}

// ------------------------------------------------------------------ records, stories, news
export interface RecordEntry { holderIds: string[]; value: number; day: Day; meetingId?: MeetingId; year?: number; note?: string }
export interface RecordBreak { day: Day; meetingId?: MeetingId; year: number; newHolders: string[]; newValue: number; prevHolders: string[]; prevValue: number | null; kind: 'broken' | 'equalled' | 'set' }
export interface RecordDef { id: string; label: string; scope: 'driver' | 'team' | 'layout'; higherIsBetter: boolean; unit: string; group: string; layoutId?: string }
export interface RecordState { def: RecordDef; current: RecordEntry | null; history: RecordBreak[]; awardKeys: string[] }

export type StoryState = 'developing' | 'intensifying' | 'unresolved' | 'resolved' | 'dormant';
export interface StoryBeat { day: Day; year: number; meetingId?: MeetingId; eventIds: EventId[]; kind: string; summary: string; facts: Record<string, any> }
export interface StoryArc {
  id: StoryId;
  type: string;
  title: string;
  spoilerTitle: string;
  people: PersonId[];
  teams: TeamId[];
  startDay: Day;
  lastDay: Day;
  state: StoryState;
  significance: number;
  beats: StoryBeat[];
  premise: string;
  uncertainty?: string;
  coverage: number;
  lastCoveredDay?: Day;
  key: string; // dedupe key
}
export interface NewsItem { id: string; day: Day; kind: string; headline: string; body: string; refs: string[]; meetingId?: MeetingId; people: PersonId[]; teams: TeamId[]; importance: number; meaning: string }

// ------------------------------------------------------------------ world
export interface WorldState {
  economy: number; // -1 depression .. +1 boom
  fuelSupply: number; // 0..1
  popularity: number; // 0..100 public interest in the championship
  safetyAttitude: number; // 0..1
  environment: number; // 0..1 environmental pressure
  industry: number; // industrial/technical capability index (grows, plateaus)
  media: 'press' | 'radio' | 'tv' | 'colour-tv' | 'digital' | 'immersive';
  emergency: { kind: string; since: Day; eventId: EventId } | null;
  inflation: number; // nominal price index relative to 1926 (display only)
}

export type Phase = 'preseason' | 'testing' | 'season' | 'postseason';
export interface Clock { day: Day; year: number; phase: Phase; nextMeeting: number }

export interface UniverseSettings { raceFormat: 'gp' | 'sprint'; teams: number; meetings: number; startYear: number; endYear: number }

export interface Universe {
  meta: { id: string; name: string; seed: string; engineVersion: string; schemaVersion: number; created: string; settings: UniverseSettings; savedAt?: string };
  rng: Record<string, RngState>;
  clock: Clock;
  world: WorldState;
  people: Record<PersonId, Person>;
  teams: Record<TeamId, Team>;
  lineages: Record<LineageId, Lineage>;
  cars: Record<CarId, CarModel>;
  tech: Record<TechId, TechWorld>;
  regs: { sets: Record<RegSetId, RegSet>; current: RegSetId; announced: { regSetId: RegSetId; year: number; day: Day }[] };
  venues: Record<VenueId, Venue>;
  layouts: Record<LayoutVersionId, LayoutVersion>;
  seasons: Record<number, Season>;
  races: Record<MeetingId, RaceRecord>;
  setups: Record<MeetingId, string>; // serialised WeekendSetup (for deterministic reconstruction)
  events: WorldEvent[];
  rels: Record<RelId, Relationship>;
  records: Record<string, RecordState>;
  stories: Record<StoryId, StoryArc>;
  news: NewsItem[];
  cooldowns: Record<string, Day>;
  counters: Record<string, number>;
  favourites: { people: PersonId[]; teams: TeamId[] };
  carElo: Record<CarId, number>;
  // derived caches (always rebuildable from races/seasons; see world/stats.ts)
  careers: Record<PersonId, any>;
  teamCareers: Record<TeamId, any>;
}
