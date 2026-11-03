export type RGB = [number, number, number];
export type Kind = "walker" | "runner" | "crawler" | "spitter" | "bloater" | "riot";
export type Style = "walkin" | "alley" | "window" | "ground" | "car" | "ambush";

export interface Theme {
  sky: [string, string, string];
  fog: RGB;
  ground: RGB;
  road: RGB;
  walk: RGB;
  walls: RGB[];
  light: RGB;
  win: RGB;
  skyline: RGB;
  rain: boolean;
  lightning: boolean;
  props: Array<"car" | "bus" | "ambulance" | "barrier" | "barrel" | "gurney" | "tank">;
}

export interface Fight {
  t: "fight";
  waves: number;
  per: number;
  alive: number;
  kinds: Partial<Record<Kind, number>>;
  styles: Partial<Record<Style, number>>;
  surv?: number;
  crates?: number;
  note?: string;
}
export interface Move {
  t: "move";
  dist: number;
  ambush?: number;
}
export interface BossEv {
  t: "boss";
}
export type Ev = Fight | Move | BossEv;

export interface WeakPoint {
  ox: number; // meters from boss center
  oy: number; // meters above ground
  r: number; // radius, meters
  hp: number;
}
export interface BossDef {
  name: string;
  title: string;
  shape: "brute" | "queen" | "warden";
  h: number;
  w: number;
  skin: RGB;
  cloth: RGB;
  glow: RGB;
  points: WeakPoint[];
  core: WeakPoint;
  attacks: Array<"charge" | "volley" | "summon">;
  summon: Kind;
}

export interface Stage {
  name: string;
  sub: string;
  seed: number;
  theme: Theme;
  events: Ev[];
  boss: BossDef;
}

export const STAGES: Stage[] = [
  {
    name: "LAST BUS",
    sub: "STAGE 1  -  KESTREL AVENUE",
    seed: 11,
    theme: {
      sky: ["#05060f", "#1b1730", "#3a2a3c"],
      fog: [52, 40, 62], ground: [22, 20, 28], road: [34, 32, 40], walk: [52, 48, 56],
      walls: [[58, 44, 46], [46, 48, 62], [70, 56, 44], [44, 52, 50], [64, 40, 56]],
      light: [255, 196, 110], win: [255, 205, 120], skyline: [10, 10, 18],
      rain: false, lightning: false, props: ["car", "car", "bus", "barrier", "barrel"],
    },
    events: [
      { t: "move", dist: 12 },
      { t: "fight", waves: 2, per: 4, alive: 4, kinds: { walker: 1 }, styles: { walkin: 1, alley: 0.8, car: 0.6 }, note: "AIM FOR THE HEAD" },
      { t: "move", dist: 14, ambush: 2 },
      { t: "fight", waves: 2, per: 6, alive: 5, kinds: { walker: 1, runner: 0.5 }, styles: { walkin: 0.6, alley: 0.8, window: 0.8, car: 0.5 }, surv: 1, crates: 1 },
      { t: "move", dist: 16, ambush: 2 },
      { t: "fight", waves: 3, per: 6, alive: 6, kinds: { walker: 1, runner: 0.6, crawler: 0.7 }, styles: { walkin: 0.5, ground: 0.8, alley: 0.6, window: 0.6, car: 0.5 }, surv: 1, crates: 2 },
      { t: "move", dist: 12 },
      { t: "boss" },
    ],
    boss: {
      name: "BIG ROSIE", title: "THE NIGHT-SHIFT BUTCHER", shape: "brute", h: 3.2, w: 1.7,
      skin: [132, 150, 112], cloth: [196, 196, 186], glow: [255, 170, 60],
      points: [{ ox: -0.55, oy: 2.3, r: 0.24, hp: 7 }, { ox: 0.5, oy: 1.9, r: 0.24, hp: 7 }, { ox: -0.1, oy: 1.45, r: 0.26, hp: 7 }],
      core: { ox: 0, oy: 2.85, r: 0.3, hp: 16 },
      attacks: ["charge", "summon", "charge"], summon: "walker",
    },
  },
  {
    name: "MERCY GENERAL",
    sub: "STAGE 2  -  THE HOSPITAL LOT",
    seed: 23,
    theme: {
      sky: ["#030a0c", "#0e2226", "#1d3b3a"],
      fog: [28, 64, 66], ground: [16, 26, 26], road: [30, 38, 40], walk: [58, 70, 70],
      walls: [[150, 156, 150], [120, 130, 128], [96, 110, 112], [138, 146, 140]],
      light: [170, 255, 230], win: [190, 255, 235], skyline: [6, 14, 16],
      rain: true, lightning: false, props: ["ambulance", "car", "gurney", "barrier", "car"],
    },
    events: [
      { t: "move", dist: 12 },
      { t: "fight", waves: 2, per: 6, alive: 5, kinds: { walker: 1, spitter: 0.5 }, styles: { walkin: 0.7, alley: 0.6, car: 0.6 }, note: "SHOOT THE ACID MID-AIR", crates: 1 },
      { t: "move", dist: 14, ambush: 3 },
      { t: "fight", waves: 3, per: 6, alive: 6, kinds: { walker: 1, bloater: 0.45, runner: 0.5, crawler: 0.4 }, styles: { walkin: 0.6, window: 0.8, ground: 0.6, car: 0.5 }, surv: 2, crates: 2, note: "POP BLOATERS NEAR THE PACK" },
      { t: "move", dist: 16, ambush: 3 },
      { t: "fight", waves: 3, per: 7, alive: 7, kinds: { walker: 1, spitter: 0.5, bloater: 0.4, runner: 0.7, crawler: 0.5 }, styles: { walkin: 0.5, alley: 0.6, window: 0.7, ground: 0.6, car: 0.5 }, surv: 1, crates: 2 },
      { t: "move", dist: 10 },
      { t: "boss" },
    ],
    boss: {
      name: "THE MATRON", title: "SHE NEVER STOPPED HER ROUNDS", shape: "queen", h: 2.4, w: 3.0,
      skin: [150, 168, 120], cloth: [210, 220, 214], glow: [150, 255, 90],
      points: [{ ox: -1.1, oy: 1.4, r: 0.26, hp: 8 }, { ox: 1.1, oy: 1.4, r: 0.26, hp: 8 }, { ox: -0.5, oy: 0.8, r: 0.24, hp: 8 }, { ox: 0.5, oy: 0.8, r: 0.24, hp: 8 }],
      core: { ox: 0, oy: 1.9, r: 0.32, hp: 20 },
      attacks: ["volley", "summon", "volley"], summon: "crawler",
    },
  },
  {
    name: "DEAD SIGNAL",
    sub: "STAGE 3  -  THE BROADCAST TOWER",
    seed: 37,
    theme: {
      sky: ["#0c0303", "#2a0a0c", "#4a1414"],
      fog: [70, 24, 26], ground: [24, 14, 14], road: [36, 26, 26], walk: [56, 44, 42],
      walls: [[70, 66, 64], [56, 50, 48], [84, 70, 60], [60, 58, 66]],
      light: [255, 80, 70], win: [255, 120, 90], skyline: [14, 6, 6],
      rain: true, lightning: true, props: ["tank", "barrier", "barrel", "car", "barrel"],
    },
    events: [
      { t: "move", dist: 12, ambush: 2 },
      { t: "fight", waves: 2, per: 6, alive: 6, kinds: { walker: 1, riot: 0.6, runner: 0.4 }, styles: { walkin: 0.7, alley: 0.6, car: 0.6 }, note: "SHIELDS: GO HIGH OR BREAK THEM", crates: 1 },
      { t: "move", dist: 14, ambush: 3 },
      { t: "fight", waves: 3, per: 7, alive: 7, kinds: { walker: 1, riot: 0.5, spitter: 0.5, bloater: 0.4, runner: 0.6 }, styles: { walkin: 0.5, window: 0.7, ground: 0.6, alley: 0.6, car: 0.5 }, surv: 2, crates: 2 },
      { t: "move", dist: 14, ambush: 4 },
      { t: "fight", waves: 4, per: 7, alive: 8, kinds: { walker: 1, runner: 0.8, crawler: 0.6, spitter: 0.5, bloater: 0.4, riot: 0.5 }, styles: { walkin: 0.5, alley: 0.6, window: 0.7, ground: 0.7, car: 0.5 }, surv: 1, crates: 2 },
      { t: "move", dist: 10 },
      { t: "boss" },
    ],
    boss: {
      name: "THE WARDEN", title: "IT GUARDS THE LAST SIGNAL", shape: "warden", h: 3.6, w: 1.9,
      skin: [110, 120, 100], cloth: [60, 62, 70], glow: [255, 60, 50],
      points: [{ ox: -0.75, oy: 2.6, r: 0.24, hp: 9 }, { ox: 0.75, oy: 2.6, r: 0.24, hp: 9 }, { ox: -0.4, oy: 1.6, r: 0.24, hp: 9 }, { ox: 0.4, oy: 1.6, r: 0.24, hp: 9 }],
      core: { ox: 0, oy: 3.25, r: 0.3, hp: 24 },
      attacks: ["charge", "volley", "summon", "charge", "volley"], summon: "runner",
    },
  },
];
