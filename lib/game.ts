import { drawText, textWidth } from "./font";
import { Audio, type Sfx } from "./audio";
import { STAGES, type BossDef, type Ev, type Fight, type Kind, type RGB, type Stage, type Style, type WeakPoint } from "./stages";

export const W = 320;
export const H = 180;
const HZ = 80; // horizon row
const F = 168; // focal length in pixels
const EYE = 1.6; // camera height, meters

// ---------- small helpers ----------
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const pick = <T,>(a: readonly T[]): T => a[(Math.random() * a.length) | 0] as T;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1): string => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
const mul = (c: RGB, m: number): RGB => [Math.min(255, c[0] * m), Math.min(255, c[1] * m), Math.min(255, c[2] * m)];
function weighted<K extends string>(w: Partial<Record<K, number>>): K {
  const e = Object.entries(w) as Array<[K, number]>;
  let r = Math.random() * e.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of e) if ((r -= v) <= 0) return k;
  return e[0]![0];
}
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- types ----------
type WeaponId = "pistol" | "shotgun" | "smg";
interface WeaponDef { name: string; mag: number; rate: number; reload: number; pellets: number; spread: number; auto: boolean; kick: number; sfx: Sfx }
const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { name: "PISTOL", mag: 8, rate: 0.13, reload: 1.0, pellets: 1, spread: 0, auto: false, kick: 0.12, sfx: "pistol" },
  shotgun: { name: "SHOTGUN", mag: 6, rate: 0.6, reload: 1.5, pellets: 8, spread: 13, auto: false, kick: 0.55, sfx: "shotgun" },
  smg: { name: "SMG", mag: 30, rate: 0.075, reload: 1.3, pellets: 1, spread: 4, auto: true, kick: 0.07, sfx: "smg" },
};

interface Pal { skin: RGB; shirt: RGB; pants: RGB; hair: RGB; blood: Array<[number, number]> }
interface Zed {
  id: number; kind: Kind; x: number; y: number; z: number; tx: number; vy: number;
  hp: number; arms: [number, number]; legs: number; shield: number; crawl: boolean; headless: boolean;
  st: "enter" | "walk" | "idle" | "spitwind" | "windup" | "recover" | "stagger" | "dead";
  t: number; anim: number; spd: number; h: number; pal: Pal; flash: number; knock: number;
  entry: Style; entryT: number; fall: number; deadT: number; spitT: number; dodgeT: number; stop: number; groanT: number;
  chase: Surv | null; bounty: boolean;
}
interface Surv { x: number; z: number; hp: number; st: "run" | "safe" | "dead"; t: number; anim: number; side: number; flash: number }
interface Glob { x: number; y: number; z: number; vx: number; vy: number; vz: number; dead: boolean; big: boolean }
interface Pickup { kind: "med" | "shotgun" | "smg"; x: number; y: number; z: number; t: number; got: boolean }
interface Prop { type: string; x: number; z: number; w: number; d: number; h: number; col: RGB; hp: number; item: Pickup["kind"] | null; flick: number }
interface Seg { z0: number; z1: number; x: number; h: number; col: RGB; lit: number; seed: number; sign: number }
interface Part3 { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; col: RGB; size: number; kind: "blood" | "chunk" | "spark" | "dust" | "goo" | "glass" | "fire" }
interface Decal { x: number; z: number; r: number; col: RGB }
interface Float { x: number; y: number; txt: string; col: string; t: number; scale: number }
interface Splat { x: number; y: number; r: number; col: RGB; t: number }
interface Shell { x: number; y: number; vx: number; vy: number; t: number; red: boolean }
interface Warn { side: number; t: number }
interface Boss {
  def: BossDef; x: number; z: number; points: Array<WeakPoint & { max: number }>; core: WeakPoint & { max: number };
  st: "intro" | "walk" | "charge" | "windup" | "slam" | "retreat" | "volley" | "summon" | "stagger" | "dead";
  t: number; anim: number; atk: number; flash: number; fist: number; deadT: number; phase: number; volleyLeft: number;
}

export interface Hud {
  mode: Game["mode"]; stage: string; score: number; best: number; chain: number; mult: number; chainT: number;
  hp: number; maxHp: number; weapon: string; ammo: number; mag: number; reserve: number | null;
  reload: number | null; sweet: [number, number]; golden: number; boss: { name: string; frac: number } | null; muted: boolean; paused: boolean;
}

interface Stats { shots: number; hits: number; heads: number; kills: number; rescued: number; lost: number; dmg: number; bestChain: number; intercepts: number }

// ---------- the game ----------
export class Game {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  readonly source: { width: number; height: number; data: Uint32Array };
  readonly audio = new Audio();

  mode: "title" | "play" | "dead" | "results" | "win" = "title";
  paused = false;
  private t = 0;
  private si = 0; // stage index
  private stage: Stage = STAGES[0]!;
  private ei = 0; // event index
  private ev: Ev | null = null;
  private evT = 0;
  private fight = { wave: 0, toSpawn: 0, spawnT: 0, lull: 0, survLeft: 0, survT: 0, clearT: -1, dmgAtStart: 0 };
  private moveTarget = 0;
  private ambushLeft = 0;
  private ambushT = 0;

  private cam = { z: 0, x: 0, y: EYE, spd: 0, bob: 0, shake: 0, pan: 0 };
  private ox = 0;
  private oy = 0;

  // player
  private hp = 5;
  private maxHp = 6;
  private weapon: WeaponId = "pistol";
  private ammo: Record<WeaponId, number> = { pistol: 8, shotgun: 0, smg: 0 };
  private reserve: Record<WeaponId, number> = { pistol: Infinity, shotgun: 0, smg: 0 };
  private reloadT = -1; // progress 0..1 while reloading
  private reloadTried = false;
  private sweet: [number, number] = [0.45, 0.62];
  private golden = 0; // rounds of gold ammo left
  private fireCD = 0;
  private trigger = false;
  private recoil = 0;
  private flashT = 0;
  private hurtT = 0;
  private continues = 0;
  private continueT = 0;
  private aim = { x: W / 2, y: H / 2 };
  private keys = new Set<string>();
  private kbAim = { vx: 0, vy: 0, lastMouse: 0 };
  private hitMark = 0;
  private hitKill = false;
  private tracer: { x0: number; y0: number; x1: number; y1: number; t: number } | null = null;

  private score = 0;
  private best = 0;
  private chain = 0;
  private chainT = 0;
  private stats: Stats = this.freshStats();
  private stageStartScore = 0;
  private hitstop = 0;
  private slowmo = 0;
  private lightning = 0;
  private heartT = 0;

  private zeds: Zed[] = [];
  private survs: Surv[] = [];
  private globs: Glob[] = [];
  private pickups: Pickup[] = [];
  private props: Prop[] = [];
  private segs: Seg[] = [];
  private skyline: Array<{ x: number; w: number; h: number }> = [];
  private stars: Array<[number, number, number]> = [];
  private parts: Part3[] = [];
  private decals: Decal[] = [];
  private floats: Float[] = [];
  private splats: Splat[] = [];
  private shells: Shell[] = [];
  private warns: Warn[] = [];
  private rain: Array<[number, number, number]> = [];
  private banner: { a: string; b: string; t: number; d: number; col: string } | null = null;
  private boss: Boss | null = null;
  private results: { grade: string; lines: Array<[string, string]>; t: number } | null = null;
  private nextId = 1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.source = { width: W, height: H, data: new Uint32Array(W * H) };
    try { this.best = Number(localStorage.getItem("deadSignalBest") || 0); } catch { /* private mode */ }
    for (let i = 0; i < 70; i++) this.stars.push([Math.random() * W * 1.4, Math.random() * (HZ - 20), Math.random()]);
    for (let i = 0; i < 90; i++) this.rain.push([Math.random() * W, Math.random() * H, rnd(0.6, 1)]);
    this.loadStage(0, true);
  }

  private freshStats(): Stats {
    return { shots: 0, hits: 0, heads: 0, kills: 0, rescued: 0, lost: 0, dmg: 0, bestChain: 0, intercepts: 0 };
  }

  // ================= input =================
  aimAt(nx: number, ny: number): void {
    this.aim.x = clamp(nx * W, 0, W - 1);
    this.aim.y = clamp(ny * H, 0, H - 1);
    this.kbAim.lastMouse = this.t;
  }
  press(): void {
    this.audio.unlock();
    if (this.paused) { this.paused = false; return; }
    if (this.mode === "title") { this.newGame(); return; }
    if (this.mode === "results" && this.results && this.results.t > 1.2) { this.nextStage(); return; }
    if (this.mode === "win" && this.results && this.results.t > 2) { this.mode = "title"; this.loadStage(0, true); return; }
    if (this.mode === "dead") { if (this.continueT < 9.3) this.continueGame(); return; }
    this.trigger = true;
    if (this.mode === "play" && this.fireCD <= 0) this.fire();
  }
  release(): void { this.trigger = false; }
  key(code: string, down: boolean): boolean {
    if (down) this.keys.add(code); else this.keys.delete(code);
    if (!down) {
      if (code === "Space" || code === "KeyJ" || code === "Enter") this.release();
      return ["Space", "KeyJ", "Enter", "KeyR", "KeyQ", "KeyE", "KeyP", "KeyM", "Escape", "Digit1", "Digit2", "Digit3", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(code);
    }
    this.audio.unlock();
    switch (code) {
      case "Space": case "KeyJ": case "Enter": this.press(); return true;
      case "KeyR": this.reloadKey(); return true;
      case "KeyQ": case "KeyE": this.cycleWeapon(code === "KeyQ" ? -1 : 1); return true;
      case "Digit1": this.switchTo("pistol"); return true;
      case "Digit2": this.switchTo("shotgun"); return true;
      case "Digit3": this.switchTo("smg"); return true;
      case "KeyP": case "Escape": if (this.mode === "play") this.paused = !this.paused; return true;
      case "KeyM": this.audio.muted = !this.audio.muted; return true;
    }
    return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(code);
  }
  wheel(dy: number): void { if (this.mode === "play") this.cycleWeapon(dy > 0 ? 1 : -1); }
  reloadKey(): void {
    if (this.mode !== "play" || this.paused) return;
    if (this.reloadT >= 0) {
      // active reload: second press inside the sweet spot finishes instantly with gold rounds
      if (this.reloadTried) return;
      this.reloadTried = true;
      if (this.reloadT >= this.sweet[0] && this.reloadT <= this.sweet[1]) {
        this.finishReload();
        this.golden = WEAPONS[this.weapon].mag;
        this.addScore(100, false);
        this.float(this.aim.x, this.aim.y - 16, "PERFECT RELOAD", "#ffd84a", 1);
        this.sfx("perfect");
      } else {
        this.reloadT = Math.max(0, this.reloadT - 0.35);
        this.float(this.aim.x, this.aim.y - 16, "FUMBLED", "#ff6a5a", 1);
        this.sfx("fumble");
      }
      return;
    }
    this.startReload();
  }
  private startReload(): void {
    const w = WEAPONS[this.weapon];
    if (this.ammo[this.weapon] >= w.mag || this.reserve[this.weapon] <= 0) return;
    this.reloadT = 0;
    this.reloadTried = false;
    const a = rnd(0.38, 0.58);
    this.sweet = [a, a + (this.weapon === "pistol" ? 0.17 : 0.14)];
    this.golden = 0;
    this.sfx(this.weapon === "shotgun" ? "pump" : "reload");
  }
  private finishReload(): void {
    const w = WEAPONS[this.weapon];
    const need = w.mag - this.ammo[this.weapon];
    const got = Math.min(need, this.reserve[this.weapon]);
    this.ammo[this.weapon] += got;
    if (this.reserve[this.weapon] !== Infinity) this.reserve[this.weapon] -= got;
    this.reloadT = -1;
    this.sfx(this.weapon === "shotgun" ? "pump" : "reload");
  }
  private switchTo(w: WeaponId): void {
    if (this.mode !== "play" || w === this.weapon) return;
    if (w !== "pistol" && this.ammo[w] + this.reserve[w] <= 0) { this.float(W / 2, H - 46, `NO ${WEAPONS[w].name} AMMO`, "#ff6a5a", 1); return; }
    this.weapon = w;
    this.reloadT = -1;
    this.golden = 0;
    this.fireCD = 0.25;
    this.recoil = 1;
    this.sfx("pump");
  }
  private cycleWeapon(dir: number): void {
    const order: WeaponId[] = ["pistol", "shotgun", "smg"];
    let i = order.indexOf(this.weapon);
    for (let k = 0; k < 3; k++) {
      i = (i + dir + 3) % 3;
      const w = order[i]!;
      if (w === "pistol" || this.ammo[w] + this.reserve[w] > 0) { this.switchTo(w); return; }
    }
  }

  // ================= flow =================
  private loadStage(i: number, attract = false): void {
    this.si = i;
    this.stage = STAGES[i]!;
    this.zeds = []; this.survs = []; this.globs = []; this.pickups = []; this.parts = []; this.decals = [];
    this.floats = []; this.splats = []; this.warns = []; this.boss = null; this.banner = null;
    this.cam.z = 0; this.cam.spd = 0;
    this.ei = -1; this.ev = null;
    this.buildWorld();
    if (attract) {
      for (let k = 0; k < 7; k++) {
        const z = this.spawnZed(pick<Kind>(["walker", "walker", "crawler", "runner"]), "walkin");
        z.z = rnd(10, 34);
        z.spd *= 0.5;
      }
    }
  }
  private newGame(): void {
    this.score = 0; this.hp = 5; this.continues = 0; this.chain = 0;
    this.ammo = { pistol: 8, shotgun: 0, smg: 0 };
    this.reserve = { pistol: Infinity, shotgun: 0, smg: 0 };
    this.weapon = "pistol"; this.reloadT = -1; this.golden = 0;
    this.startStage(0);
  }
  private startStage(i: number): void {
    this.loadStage(i);
    this.mode = "play";
    this.stats = this.freshStats();
    this.stageStartScore = this.score;
    this.banner = { a: this.stage.name, b: this.stage.sub, t: 3.2, d: 3.2, col: "#c8ff5a" };
    this.nextEvent();
  }
  private nextStage(): void {
    if (this.si + 1 >= STAGES.length) {
      this.mode = "win";
      this.results = { grade: "", lines: [], t: 0 };
      this.saveBest();
      return;
    }
    this.hp = Math.min(this.maxHp, this.hp + 2);
    this.startStage(this.si + 1);
  }
  private continueGame(): void {
    this.continues++;
    this.hp = 5;
    this.mode = "play";
    this.score = Math.floor(this.score / 2 / 10) * 10;
    this.chain = 0;
    this.hurtT = 0;
    // push the closest attackers back so the player gets a breather
    for (const z of this.zeds) if (z.st !== "dead" && z.z - this.cam.z < 5) { z.z = this.cam.z + 7; z.st = "stagger"; z.t = 0.8; z.knock = 0; }
    this.globs = [];
    this.banner = { a: "CONTINUE", b: "SCORE HALVED. KEEP GOING.", t: 1.6, d: 1.6, col: "#ffd84a" };
  }
  private nextEvent(): void {
    this.ei++;
    this.ev = this.stage.events[this.ei] ?? null;
    this.evT = 0;
    const ev = this.ev;
    if (!ev) return;
    if (ev.t === "move") {
      this.moveTarget = this.cam.z + ev.dist;
      this.ambushLeft = ev.ambush ?? 0;
      this.ambushT = rnd(1.0, 2.0);
    } else if (ev.t === "fight") {
      this.fight = { wave: 0, toSpawn: ev.per, spawnT: 0.8, lull: 0, survLeft: ev.surv ?? 0, survT: rnd(5, 9), clearT: -1, dmgAtStart: this.stats.dmg };
      for (let i = 0; i < (ev.crates ?? 0); i++) this.addCrate();
      if (ev.note) this.banner = { a: "", b: ev.note, t: 2.4, d: 2.4, col: "#ffd84a" };
    } else if (ev.t === "boss") {
      this.spawnBoss();
    }
  }
  private stageClear(): void {
    this.mode = "results";
    const s = this.stats;
    const acc = s.shots ? s.hits / s.shots : 0;
    const head = s.kills ? s.heads / s.kills : 0;
    const resc = s.rescued + s.lost ? s.rescued / (s.rescued + s.lost) : 1;
    const pts = acc * 40 + head * 30 + resc * 15 + Math.max(0, 15 - s.dmg * 3) - this.continues * 15;
    const grade = pts >= 82 ? "S" : pts >= 68 ? "A" : pts >= 54 ? "B" : pts >= 40 ? "C" : "D";
    const bonus = { S: 20000, A: 12000, B: 7000, C: 4000, D: 2000 }[grade];
    this.score += bonus;
    this.results = {
      grade,
      t: 0,
      lines: [
        ["ACCURACY", `${Math.round(acc * 100)}%`],
        ["HEADSHOT KILLS", `${s.heads}/${s.kills}`],
        ["SURVIVORS SAVED", `${s.rescued}/${s.rescued + s.lost}`],
        ["ACID INTERCEPTED", `${s.intercepts}`],
        ["BEST CHAIN", `${s.bestChain}`],
        ["DAMAGE TAKEN", `${s.dmg}`],
        ["GRADE BONUS", `+${bonus}`],
      ],
    };
    this.saveBest();
    this.sfx("clear");
  }
  private saveBest(): void {
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem("deadSignalBest", String(this.best)); } catch { /* ignore */ }
    }
  }

  // ================= world =================
  private buildWorld(): void {
    const r = seeded(this.stage.seed);
    const th = this.stage.theme;
    const len = this.stage.events.reduce((s, e) => s + (e.t === "move" ? e.dist : 0), 0) + 120;
    this.segs = [];
    for (const sign of [-1, 1]) {
      let z = -10;
      while (z < len) {
        const l = 6 + r() * 12;
        this.segs.push({ z0: z, z1: z + l, x: 6.6 + r() * 1.6, h: 5 + r() * 11, col: th.walls[(r() * th.walls.length) | 0]!, lit: r(), seed: (r() * 1e9) | 0, sign });
        z += l + (r() < 0.35 ? 3 + r() * 2 : 0); // gaps are alleys
      }
    }
    this.props = [];
    for (let z = 6; z < len; z += 13) for (const s of [-1, 1]) if (r() < 0.8) this.props.push(this.mkProp("lamp", s * 5.4, z + s * 3, r));
    for (let z = 10; z < len; z += 7 + r() * 9) {
      const type = th.props[(r() * th.props.length) | 0]!;
      const s = r() < 0.5 ? -1 : 1;
      const x = type === "barrel" ? s * (3 + r() * 1.5) : type === "barrier" ? (r() - 0.5) * 6 : s * (2.6 + r() * 1.6);
      this.props.push(this.mkProp(type, x, z, r));
    }
    this.skyline = [];
    let x = -40;
    while (x < W + 120) { const w = 10 + r() * 26; this.skyline.push({ x, w, h: 8 + r() * 34 }); x += w + r() * 3; }
  }
  private mkProp(type: string, x: number, z: number, r: () => number): Prop {
    const cars: RGB[] = [[120, 40, 36], [40, 70, 110], [150, 150, 140], [60, 90, 60], [140, 110, 40], [70, 70, 78]];
    const base: Prop = { type, x, z, w: 1.8, d: 4.2, h: 1.5, col: cars[(r() * cars.length) | 0]!, hp: 0, item: null, flick: r() * 10 };
    if (type === "bus") Object.assign(base, { w: 2.5, d: 10, h: 3.1, col: [200, 160, 60] as RGB });
    if (type === "ambulance") Object.assign(base, { w: 2.1, d: 5.4, h: 2.5, col: [225, 225, 220] as RGB });
    if (type === "tank") Object.assign(base, { w: 2.4, d: 2.4, h: 2.6, col: [90, 86, 80] as RGB });
    if (type === "barrier") Object.assign(base, { w: 2.2, d: 0.6, h: 0.9, col: [150, 150, 145] as RGB });
    if (type === "barrel") Object.assign(base, { w: 0.6, d: 0.6, h: 0.95, col: [110, 60, 40] as RGB });
    if (type === "gurney") Object.assign(base, { w: 0.8, d: 2.0, h: 0.9, col: [200, 205, 210] as RGB });
    if (type === "lamp") Object.assign(base, { w: 0.15, d: 0.15, h: 5.5 });
    if (type === "crate") Object.assign(base, { w: 0.9, d: 0.9, h: 0.9, col: [140, 100, 56] as RGB, hp: 2 });
    return base;
  }
  private addCrate(): void {
    const s = Math.random() < 0.5 ? -1 : 1;
    const p = this.mkProp("crate", s * rnd(1.4, 3.6), this.cam.z + rnd(6, 12), Math.random);
    const lowHp = this.hp <= 2;
    p.item = lowHp || Math.random() < 0.34 ? "med" : Math.random() < 0.5 ? "shotgun" : "smg";
    this.props.push(p);
  }
  private facadeX(sign: number, z: number): number | null {
    for (const s of this.segs) if (s.sign === sign && z >= s.z0 && z <= s.z1) return s.x;
    return null;
  }

  // ================= spawning =================
  private spawnZed(kind: Kind, style: Style): Zed {
    const cz = this.cam.z;
    const skins: RGB[] = [[128, 150, 112], [150, 160, 120], [112, 132, 108], [160, 150, 128], [118, 140, 126]];
    const shirts: RGB[] = this.si === 1
      ? [[170, 190, 186], [190, 196, 200], [120, 150, 160], [96, 120, 110], [150, 80, 80]]
      : [[90, 70, 56], [56, 76, 106], [110, 46, 46], [74, 90, 60], [110, 92, 50], [64, 64, 72], [130, 120, 100]];
    const pants: RGB[] = [[48, 52, 64], [60, 50, 42], [40, 40, 46], [70, 66, 58]];
    const blood: Array<[number, number]> = [];
    for (let i = 0; i < 4; i++) blood.push([rnd(-0.18, 0.18), rnd(0.9, 1.4)]);
    const z: Zed = {
      id: this.nextId++, kind, x: rnd(-3.5, 3.5), y: 0, z: cz + rnd(14, 26), tx: rnd(-2.5, 2.5), vy: 0,
      hp: 3, arms: [2, 2], legs: 3, shield: 0, crawl: false, headless: false,
      st: "walk", t: 0, anim: rnd(0, 6), spd: rnd(0.9, 1.4), h: rnd(1.65, 1.9),
      pal: { skin: pick(skins), shirt: pick(shirts), pants: pick(pants), hair: pick<RGB>([[30, 26, 22], [60, 50, 40], [90, 80, 70], [20, 20, 20]]), blood },
      flash: 0, knock: 0, entry: style, entryT: 0, fall: Math.random() < 0.5 ? -1 : 1, deadT: 0, spitT: rnd(1.2, 2.4), dodgeT: 0, stop: 0, groanT: rnd(2, 8),
      chase: null, bounty: false,
    };
    const diff = 1 + this.si * 0.12;
    if (kind === "runner") { z.hp = 2; z.spd = rnd(3.4, 4.1) * diff; z.arms = [1, 1]; }
    if (kind === "crawler") { z.hp = 2; z.crawl = true; z.spd = rnd(1.5, 2.0) * diff; z.legs = 0; }
    if (kind === "spitter") { z.hp = 3; z.spd = rnd(1.0, 1.3); z.stop = rnd(8, 12); z.pal.skin = [170, 180, 96]; }
    if (kind === "bloater") { z.hp = 6; z.spd = rnd(0.7, 0.85); z.h = rnd(1.75, 1.95); z.pal.skin = [176, 186, 110]; z.pal.shirt = [130, 140, 70]; }
    if (kind === "riot") { z.hp = 3; z.shield = 7; z.spd = rnd(1.0, 1.25) * diff; z.pal.shirt = [40, 44, 56]; z.pal.pants = [34, 36, 44]; }
    if (kind === "walker") z.spd *= diff;

    switch (style) {
      case "alley": {
        const s = Math.random() < 0.5 ? -1 : 1;
        const zz = cz + rnd(7, 15);
        z.x = s * 7.6; z.z = zz; z.tx = s * rnd(0.5, 2.5); z.st = "enter";
        break;
      }
      case "window": {
        const s = Math.random() < 0.5 ? -1 : 1;
        const zz = cz + rnd(7, 13);
        const fx = this.facadeX(s, zz) ?? 7;
        z.x = s * (fx - 0.45); z.z = zz; z.y = rnd(3.2, 5.6); z.vy = 0; z.st = "enter"; z.tx = s * rnd(1, 2.5);
        this.burst3(z.x, z.y + 1, z.z, [200, 220, 240], 14, 2.5, "glass");
        this.sfx("break");
        break;
      }
      case "ground": {
        z.x = rnd(-3.2, 3.2); z.z = cz + rnd(5.5, 11); z.y = -1.9; z.st = "enter";
        break;
      }
      case "car": {
        const cars = this.props.filter((p) => ["car", "bus", "ambulance", "tank", "barrier"].includes(p.type) && p.z - cz > 6 && p.z - cz < 18);
        const c = cars.length ? pick(cars) : null;
        if (c) { z.x = c.x + rnd(-0.4, 0.4); z.z = c.z + c.d / 2 + 0.5; z.tx = c.x + (c.x > 0 ? -2 : 2); z.st = "enter"; z.y = -0.9; }
        break;
      }
      case "ambush": {
        const s = Math.random() < 0.5 ? -1 : 1;
        z.x = s * 6.5; z.z = cz + rnd(3.4, 4.2); z.tx = s * rnd(1.4, 2.0); z.st = "enter";
        this.warns.push({ side: s, t: 0.6 });
        z.entryT = -0.55; // waits behind the warning
        this.sfx("sting");
        break;
      }
      default: break;
    }
    this.zeds.push(z);
    return z;
  }
  private spawnSurvivor(): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const s: Surv = { x: side * rnd(0.5, 2.5), z: this.cam.z + rnd(16, 20), hp: 2, st: "run", t: 0, anim: 0, side, flash: 0 };
    this.survs.push(s);
    const n = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const z = this.spawnZed(i === 0 ? "runner" : "walker", "walkin");
      z.x = s.x + rnd(-0.8, 0.8); z.z = s.z + 2.2 + i * 1.6; z.chase = s; z.spd = 3.3; z.bounty = true;
    }
    this.float(W / 2, 40, "SURVIVOR! COVER THEM", "#7fd4ff", 1);
  }
  private spawnBoss(): void {
    const d = this.stage.boss;
    this.boss = {
      def: d, x: 0, z: this.cam.z + 16, points: d.points.map((p) => ({ ...p, max: p.hp })), core: { ...d.core, max: d.core.hp },
      st: "intro", t: 2.6, anim: 0, atk: 0, flash: 0, fist: 0, deadT: 0, phase: 1, volleyLeft: 0,
    };
    this.banner = { a: d.name, b: d.title, t: 2.8, d: 2.8, col: "#ff4a4a" };
    this.sfx("roar");
    this.cam.shake = 0.6;
  }

  // ================= combat =================
  private fire(): void {
    const w = WEAPONS[this.weapon];
    if (this.reloadT >= 0) return;
    if (this.ammo[this.weapon] <= 0) {
      if (this.reserve[this.weapon] > 0) this.startReload();
      else if (this.weapon !== "pistol") { this.float(W / 2, H - 46, `${w.name} EMPTY`, "#ff6a5a", 1); this.switchTo("pistol"); }
      else this.sfx("empty");
      this.fireCD = 0.2;
      return;
    }
    this.ammo[this.weapon]--;
    this.fireCD = w.rate;
    this.recoil = 1;
    this.flashT = 0.06;
    this.cam.shake = Math.max(this.cam.shake, w.kick);
    this.sfx(w.sfx);
    this.shells.push({ x: 236 + (this.aim.x - W / 2) * 0.18, y: 140, vx: rnd(40, 80), vy: rnd(-90, -60), t: 1.2, red: this.weapon === "shotgun" });
    const gold = this.golden > 0;
    if (gold) this.golden--;
    const dmg = gold ? 2 : 1;
    let killsThisShot = 0;
    let anyHit = false;
    let bounce = false;
    for (let i = 0; i < w.pellets; i++) {
      const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * w.spread * (this.weapon === "smg" ? 0.4 + this.recoil : 1);
      const px = this.aim.x + Math.cos(ang) * rr, py = this.aim.y + Math.sin(ang) * rr * 0.8;
      const res = this.shootAt(px, py, dmg, i === 0);
      if (res === "kill") killsThisShot++;
      if (res === "kill" || res === "hit") anyHit = true;
      if (res === "ping") bounce = true;
      if (i === 0) this.tracer = { x0: 236 + (this.aim.x - W / 2) * 0.18, y0: 132 + (this.aim.y - H / 2) * 0.06, x1: px, y1: py, t: 0.05 };
    }
    this.stats.shots++;
    if (anyHit) this.stats.hits++;
    else if (!bounce) { if (this.weapon !== "smg") this.chainT = Math.min(this.chainT, 1.2); }
    if (killsThisShot >= 2) {
      const word = killsThisShot === 2 ? "DOUBLE" : killsThisShot === 3 ? "TRIPLE" : "MASSACRE";
      this.addScore(200 * killsThisShot, false);
      this.float(this.aim.x, this.aim.y - 22, `${word} KILL`, "#ff9a3a", 2);
    }
    if (this.ammo[this.weapon] === 0 && this.reserve[this.weapon] > 0) this.float(this.aim.x, this.aim.y + 14, "RELOAD [R]", "#ffd84a", 1);
  }

  /** Resolves one bullet at a screen point, nearest target first. */
  private shootAt(px: number, py: number, dmg: number, fx: boolean): "kill" | "hit" | "ping" | "miss" {
    type C = { dz: number; fn: () => "kill" | "hit" | "ping" | "miss" };
    const cands: C[] = [];
    for (const gl of this.globs) {
      if (gl.dead) continue;
      const p = this.P(gl.x, gl.y, gl.z); if (!p) continue;
      const r = Math.max(4, (gl.big ? 0.42 : 0.3) * p.s);
      if (Math.hypot(px - p.x, py - p.y) <= r) cands.push({ dz: p.dz, fn: () => { gl.dead = true; this.stats.intercepts++; this.burst3(gl.x, gl.y, gl.z, [150, 230, 70], 16, 2.2, "goo"); this.addScore(150, false); this.float(p.x, p.y - 8, "INTERCEPT +150", "#b8ff6a", 1); this.sfx("splat"); this.hitMark = 0.15; return "hit"; } });
    }
    for (const pk of this.pickups) {
      if (pk.got) continue;
      const p = this.P(pk.x, pk.y, pk.z); if (!p) continue;
      const r = Math.max(5, 0.45 * p.s);
      if (Math.abs(px - p.x) <= r && Math.abs(py - p.y) <= r) cands.push({ dz: p.dz, fn: () => { this.collect(pk, p.x, p.y); return "hit"; } });
    }
    for (const s of this.survs) {
      if (s.st !== "run") continue;
      const p = this.P(s.x, 0, s.z); if (!p) continue;
      const hh = 1.72 * p.s, ww = 0.26 * p.s;
      if (px >= p.x - ww && px <= p.x + ww && py >= p.y - hh && py <= p.y) cands.push({ dz: p.dz, fn: () => { this.hurtSurvivor(s, p.x, p.y - hh); return "miss"; } });
    }
    for (const z of this.zeds) {
      if (z.st === "dead" || (z.st === "enter" && z.y < -1)) continue;
      const part = this.zedHit(z, px, py);
      if (part) cands.push({ dz: z.z - this.cam.z, fn: () => this.hitZed(z, part, dmg, px, py, fx) });
    }
    if (this.boss && this.boss.st !== "dead" && this.boss.st !== "intro") {
      const b = this.boss;
      const r = this.bossHit(b, px, py);
      if (r) cands.push({ dz: b.z - this.cam.z - 0.5, fn: () => this.hitBoss(b, r, dmg, px, py) });
    }
    for (const pr of this.props) {
      if (pr.type !== "crate" || pr.hp <= 0) continue;
      const p = this.P(pr.x, 0, pr.z - pr.d / 2); if (!p) continue;
      const hw = (pr.w / 2) * p.s, hh = pr.h * p.s;
      if (px >= p.x - hw && px <= p.x + hw && py >= p.y - hh && py <= p.y) cands.push({ dz: p.dz, fn: () => { this.hitCrate(pr); return "hit"; } });
    }
    if (!cands.length) {
      // dust puff where the bullet hit the street or a wall
      if (fx && this.mode === "play") this.screenDust(px, py);
      return "miss";
    }
    cands.sort((a, b) => a.dz - b.dz);
    return cands[0]!.fn();
  }

  private screenDust(px: number, py: number): void {
    if (py > HZ + 2) {
      const dz = (F * this.cam.y) / Math.max(1, py - HZ);
      if (dz < 60) {
        const z = this.cam.z + dz, x = this.cam.x + ((px - W / 2) * dz) / F;
        this.burst3(x, 0.05, z, [150, 140, 120], 6, 1.2, "dust");
        this.burst3(x, 0.05, z, [255, 220, 150], 3, 1.6, "spark");
      }
    }
  }

  private zedParts(z: Zed): Array<{ part: string; x0: number; y0: number; x1: number; y1: number }> {
    const p = this.P(z.x, z.y, z.z);
    if (!p) return [];
    const s = p.s * (z.h / 1.75), cx = p.x + z.knock * 0, fy = p.y;
    const R = (part: string, mx0: number, my0: number, mx1: number, my1: number) => ({ part, x0: cx + mx0 * s, y0: fy - my1 * s, x1: cx + mx1 * s, y1: fy - my0 * s });
    const out: Array<{ part: string; x0: number; y0: number; x1: number; y1: number }> = [];
    if (z.crawl) {
      if (!z.headless) out.push(R("head", -0.13, 0.28, 0.13, 0.58));
      out.push(R("arms", -0.42, 0, 0.42, 0.3));
      out.push(R("torso", -0.27, 0.04, 0.27, 0.44));
      return out;
    }
    const bob = Math.abs(Math.sin(z.anim)) * 0.03;
    if (z.shield > 0) out.push(R("shield", -0.4, 0.12, 0.4, 1.36));
    if (!z.headless) out.push(R("head", -0.13, 1.42 + bob, 0.13, 1.74 + bob));
    const up = z.st === "windup" ? 0.42 : 0;
    if (z.arms[0] > 0) out.push(R("armL", -0.4, 1.1 + up, -0.22, 1.5 + up));
    if (z.arms[1] > 0) out.push(R("armR", 0.22, 1.1 + up, 0.4, 1.5 + up));
    if (z.kind === "bloater") out.push(R("belly", -0.46, 0.75, 0.46, 1.32));
    out.push(R("torso", -0.24, 0.82, 0.24, 1.46));
    out.push(R("legs", -0.2, 0, 0.2, 0.84));
    return out;
  }
  private zedHit(z: Zed, px: number, py: number): string | null {
    for (const r of this.zedParts(z)) if (px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1) return r.part;
    return null;
  }
  private hitZed(z: Zed, part: string, dmg: number, px: number, py: number, fx: boolean): "kill" | "hit" | "ping" {
    const dz = z.z - this.cam.z;
    const wp = this.P(z.x, z.y, z.z)!;
    const wy = (wp.y - py) / wp.s + z.y; // world height of the hit
    const wx = z.x + (px - wp.x) / wp.s;
    if (part === "shield") {
      z.shield -= dmg;
      this.burst3(wx, wy, z.z - 0.3, [255, 230, 160], 6, 2.5, "spark");
      this.sfx("ping");
      if (z.shield <= 0) { this.burst3(z.x, 0.8, z.z - 0.3, [160, 170, 180], 16, 2.5, "chunk"); this.float(wp.x, py - 8, "SHIELD BROKEN", "#ffffff", 1); this.sfx("break"); z.st = "stagger"; z.t = 0.6; }
      return "ping";
    }
    z.flash = 0.08;
    this.hitMark = 0.12;
    this.burst3(wx, wy, z.z - 0.1, [130, 14, 14], part === "head" ? 14 : 8, 2.2, "blood");
    if (this.si === 1 && Math.random() < 0.4) this.burst3(wx, wy, z.z - 0.1, [120, 160, 60], 4, 2, "goo");
    // shooting an attacker mid-swing staggers it
    let staggered = false;
    if (z.st === "windup") { staggered = true; z.st = "stagger"; z.t = 0.7; z.knock = 2.4; this.addScore(50, false); this.float(wp.x, py - 12, "STAGGER", "#9fe0ff", 1); }
    else if (z.st === "walk" || z.st === "recover" || z.st === "idle") { z.knock = Math.max(z.knock, part === "head" ? 1.4 : 0.7); }
    let headKill = false;
    if (part === "head") { z.hp -= dmg * 3; headKill = true; this.sfx("head"); }
    else if (part === "armL" || part === "armR") {
      const i = part === "armL" ? 0 : 1;
      z.arms[i] -= dmg;
      if (z.arms[i]! <= 0) { this.sever(z, i === 0 ? -0.32 : 0.32, 1.3, z.pal.shirt); this.addScore(60, false); this.float(wp.x, py - 10, "DISARMED", "#ffb070", 1); }
      z.hp -= 0.5 * dmg;
      this.sfx("hit");
    } else if (part === "legs") {
      z.legs -= dmg;
      if (z.legs <= 0 && !z.crawl) {
        z.crawl = true; z.spd *= 0.55; this.sever(z, 0.1, 0.4, z.pal.pants);
        this.float(wp.x, py - 10, "KNEECAPPED", "#ffb070", 1); this.addScore(60, false);
        if ((z.st as string) === "windup" || z.st === "recover") { z.st = "stagger"; z.t = 0.8; }
      }
      z.hp -= 0.5 * dmg;
      this.sfx("hit");
    } else if (part === "belly") {
      z.hp -= dmg * 2; this.sfx("splat");
      this.burst3(wx, wy, z.z - 0.2, [170, 200, 80], 6, 2, "goo");
    } else { z.hp -= dmg; this.sfx("hit"); }
    void staggered; void dz; void fx;
    if (z.hp <= 0) { this.killZed(z, headKill, wp.x, py); return "kill"; }
    return "hit";
  }
  private sever(z: Zed, mx: number, my: number, col: RGB): void {
    this.parts.push({ x: z.x + mx, y: my, z: z.z - 0.1, vx: rnd(-1.5, 1.5) + mx * 4, vy: rnd(2.5, 4), vz: rnd(-0.5, 1.5), life: 2.5, col, size: 0.16, kind: "chunk" });
    this.burst3(z.x + mx, my, z.z - 0.1, [130, 14, 14], 14, 2.6, "blood");
    this.sfx("sever");
  }
  private killZed(z: Zed, head: boolean, sx: number, sy: number): void {
    z.st = "dead"; z.deadT = 0;
    this.stats.kills++;
    if (head) {
      this.stats.heads++;
      z.headless = true;
      this.parts.push({ x: z.x, y: z.y + (z.crawl ? 0.45 : 1.6), z: z.z - 0.1, vx: rnd(-1.5, 1.5), vy: rnd(3, 5), vz: rnd(0.5, 2), life: 2.5, col: z.pal.skin, size: 0.2, kind: "chunk" });
      this.burst3(z.x, z.y + (z.crawl ? 0.45 : 1.6), z.z - 0.1, [150, 16, 16], 26, 3.4, "blood");
      this.hitstop = 0.05;
    }
    const base = { walker: 100, runner: 150, crawler: 120, spitter: 220, bloater: 250, riot: 300 }[z.kind];
    this.chain++;
    this.chainT = 3.2;
    this.stats.bestChain = Math.max(this.stats.bestChain, this.chain);
    const pts = this.addScore(head ? base * 2 : base, true);
    this.float(sx, sy - 10, head ? `HEADSHOT ${pts}` : `${pts}`, head ? "#ffd84a" : "#ffffff", head ? 1 : 1);
    if (this.chain > 0 && this.chain % 5 === 0) this.float(W / 2, 34, `CHAIN x${this.chain}`, "#ff9a3a", 2);
    this.hitKill = true;
    this.hitMark = 0.2;
    this.sfx("kill");
    this.decals.push({ x: z.x + rnd(-0.3, 0.3), z: z.z + 0.4, r: rnd(0.5, 0.9), col: [70 + Math.random() * 30, 8, 8] });
    if (this.decals.length > 90) this.decals.shift();
    if (z.kind === "bloater") this.explode(z.x, 1, z.z, true);
    if (z.bounty) this.addScore(100, false);
  }
  private explode(x: number, y: number, zz: number, byPlayer: boolean): void {
    this.sfx("boom");
    this.cam.shake = Math.max(this.cam.shake, 0.7);
    this.burst3(x, y, zz, [190, 210, 90], 40, 5, "goo");
    this.burst3(x, y, zz, [255, 170, 60], 26, 4, "fire");
    this.decals.push({ x, z: zz, r: 1.6, col: [80, 100, 30] });
    let n = 0;
    for (const o of this.zeds) {
      if (o.st === "dead") continue;
      const d = Math.hypot(o.x - x, o.z - zz);
      if (d < 3.2) {
        o.hp -= 6; o.flash = 0.15; o.knock = 3;
        if (o.hp <= 0) { const p = this.P(o.x, 1, o.z); this.killZed(o, false, p?.x ?? W / 2, p?.y ?? H / 2); n++; }
      }
    }
    for (const s of this.survs) if (s.st === "run" && Math.hypot(s.x - x, s.z - zz) < 3) this.hurtSurvivor(s, W / 2, H / 2);
    if (byPlayer && n >= 1) { const p = this.P(x, 2, zz); this.addScore(150 * n, false); this.float(p?.x ?? W / 2, (p?.y ?? 60) - 10, `BLAST x${n}`, "#c8ff5a", 2); }
    const dz = zz - this.cam.z;
    if (dz < 3.4) this.hurt(2, [140, 180, 60]);
  }
  private hitCrate(pr: Prop): void {
    pr.hp--;
    this.sfx("hit");
    this.burst3(pr.x, 0.6, pr.z - pr.d / 2, [170, 130, 80], 8, 2, "chunk");
    if (pr.hp <= 0) {
      this.sfx("break");
      this.burst3(pr.x, 0.5, pr.z - pr.d / 2, [170, 130, 80], 18, 3, "chunk");
      if (pr.item) this.pickups.push({ kind: pr.item, x: pr.x, y: 1.0, z: pr.z - pr.d / 2, t: 0, got: false });
    }
  }
  private collect(pk: Pickup, sx: number, sy: number): void {
    pk.got = true;
    this.sfx("pickup");
    if (pk.kind === "med") { this.hp = Math.min(this.maxHp, this.hp + 1); this.float(sx, sy - 8, "+1 HEALTH", "#6dff8a", 1); }
    if (pk.kind === "shotgun") { this.reserve.shotgun += 12; if (this.ammo.shotgun === 0) { this.ammo.shotgun = 6; this.reserve.shotgun -= 6; } this.float(sx, sy - 8, "SHOTGUN", "#ffd84a", 1); this.switchTo("shotgun"); }
    if (pk.kind === "smg") { this.reserve.smg += 60; if (this.ammo.smg === 0) { this.ammo.smg = 30; this.reserve.smg -= 30; } this.float(sx, sy - 8, "SMG", "#ffd84a", 1); this.switchTo("smg"); }
    this.addScore(250, false);
  }
  private hurtSurvivor(s: Surv, sx: number, sy: number): void {
    s.hp--; s.flash = 0.15;
    this.burst3(s.x, 1.2, s.z, [140, 16, 16], 10, 2, "blood");
    this.score = Math.max(0, this.score - 500);
    this.float(sx, sy - 6, "DON'T SHOOT THEM! -500", "#ff5050", 1);
    this.chain = 0;
    if (s.hp <= 0) { s.st = "dead"; s.t = 0; this.stats.lost++; this.sfx("lost"); }
    else this.sfx("hurt");
  }
  private bossParts(b: Boss): { cx: number; fy: number; s: number } | null {
    const p = this.P(b.x, 0, b.z);
    return p ? { cx: p.x, fy: p.y, s: p.s } : null;
  }
  private fistPos(b: Boss, q: { cx: number; fy: number; s: number }): { x: number; y: number } {
    const d = b.def;
    return d.shape === "queen" ? { x: q.cx, y: q.fy - (d.h + 0.2) * q.s } : { x: q.cx + (d.w / 2 + 0.2) * q.s, y: q.fy - d.h * 0.72 * q.s };
  }
  private bossHit(b: Boss, px: number, py: number): string | null {
    const q = this.bossParts(b); if (!q) return null;
    const lunge = b.st === "windup" || b.st === "slam" ? 1 : 0;
    if (b.st === "windup" && b.fist > 0) {
      const f = this.fistPos(b, q);
      if (Math.hypot(px - f.x, py - f.y) < Math.max(6, 0.45 * q.s)) return "fist";
    }
    const pts = b.phase === 1 ? b.points : [b.core];
    for (let i = 0; i < pts.length; i++) {
      const w = pts[i]!; if (w.hp <= 0) continue;
      const x = q.cx + w.ox * q.s, y = q.fy - w.oy * q.s;
      if (Math.hypot(px - x, py - y) <= Math.max(4, w.r * q.s * 1.15)) return `p${i}`;
    }
    const hw = (b.def.w / 2) * q.s, hh = b.def.h * q.s;
    if (px >= q.cx - hw && px <= q.cx + hw && py >= q.fy - hh - lunge * 0 && py <= q.fy) return "body";
    return null;
  }
  private hitBoss(b: Boss, part: string, dmg: number, px: number, py: number): "kill" | "hit" | "ping" {
    const q = this.bossParts(b)!;
    const wx = b.x + (px - q.cx) / q.s, wy = (q.fy - py) / q.s;
    if (part === "body") {
      this.burst3(wx, wy, b.z - 0.8, [255, 220, 140], 4, 2, "spark");
      this.sfx("ping");
      if (Math.random() < 0.15) this.float(px, py - 8, "HIT THE GLOWING SPOTS", "#ffd84a", 1);
      return "ping";
    }
    b.flash = 0.08;
    this.hitMark = 0.14;
    this.burst3(wx, wy, b.z - 0.8, mul(b.def.glow, 0.7), 10, 2.6, "goo");
    this.sfx("hit");
    if (part === "fist") {
      b.fist -= dmg;
      if (b.fist <= 0) {
        b.st = "stagger"; b.t = 1.4; this.cam.shake = 0.5;
        this.addScore(800, false); this.float(q.cx, q.fy - b.def.h * q.s - 6, "COUNTER! +800", "#9fe0ff", 2);
        this.sfx("roar"); this.hitstop = 0.08;
      }
      return "hit";
    }
    const i = Number(part.slice(1));
    const w = b.phase === 1 ? b.points[i]! : b.core;
    w.hp -= dmg;
    this.addScore(20, false);
    if (w.hp <= 0) {
      this.sfx("boom");
      this.burst3(b.x + w.ox, w.oy, b.z - 0.8, mul(b.def.glow, 0.8), 30, 4, "goo");
      this.cam.shake = 0.5; this.hitstop = 0.06;
      this.addScore(1000, false);
      this.float(px, py - 10, "WEAK POINT DESTROYED", "#ffd84a", 1);
      if (b.phase === 1 && b.points.every((p) => p.hp <= 0)) {
        b.phase = 2; b.st = "stagger"; b.t = 1.8; this.sfx("roar");
        this.banner = { a: "", b: "ITS CORE IS EXPOSED - FINISH IT", t: 2.2, d: 2.2, col: "#ff4a4a" };
      } else if (b.phase === 2) {
        b.st = "dead"; b.deadT = 0; this.slowmo = 1.6;
        this.addScore(15000, false);
        this.float(W / 2, 50, "BOSS DOWN +15000", "#ffd84a", 2);
        for (const z of this.zeds) if (z.st !== "dead") { z.hp = 0; this.killZed(z, false, W / 2, H / 2); }
        return "kill";
      }
    }
    return "hit";
  }

  private hurt(n: number, splat: RGB | null = null): void {
    if (this.mode !== "play") return;
    this.hp -= n;
    this.stats.dmg += n;
    this.hurtT = 0.7;
    this.cam.shake = Math.max(this.cam.shake, 0.6);
    this.chain = 0;
    this.sfx("hurt");
    if (splat) for (let i = 0; i < 5; i++) this.splats.push({ x: rnd(40, W - 40), y: rnd(20, H - 30), r: rnd(10, 26), col: splat, t: 2.4 });
    else for (let i = 0; i < 3; i++) this.splats.push({ x: rnd(60, W - 60), y: rnd(30, H - 40), r: rnd(6, 14), col: [120, 0, 0], t: 1.6 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.mode = "dead";
      this.continueT = 0;
      this.saveBest();
    }
  }
  private addScore(base: number, useChain: boolean): number {
    const mult = useChain ? this.mult() : 1;
    const v = Math.round((base * mult) / 10) * 10;
    this.score += v;
    return v;
  }
  private mult(): number { return Math.min(4, 1 + Math.floor(this.chain / 5) * 0.5); }

  // ================= update =================
  update(dtReal: number): void {
    dtReal = Math.min(dtReal, 0.05);
    if (this.paused) return;
    this.t += dtReal;
    if (this.mode === "dead") { this.continueT += dtReal; if (this.continueT > 10) { this.mode = "title"; this.loadStage(0, true); } }
    if (this.results) this.results.t += dtReal;
    if (this.banner) { this.banner.t -= dtReal; if (this.banner.t <= 0) this.banner = null; }
    this.updateScreenFx(dtReal);
    if (this.hitstop > 0) { this.hitstop -= dtReal; return; }
    let dt = dtReal;
    if (this.slowmo > 0) { this.slowmo -= dtReal; dt *= 0.3; }

    // aim with keys (arrows / WASD) with a little magnetism toward heads
    let kx = 0, ky = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) kx--;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) kx++;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) ky--;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) ky++;
    const acc = 900;
    this.kbAim.vx = kx ? clamp(this.kbAim.vx + kx * acc * dtReal, -230, 230) : this.kbAim.vx * 0.6;
    this.kbAim.vy = ky ? clamp(this.kbAim.vy + ky * acc * dtReal, -170, 170) : this.kbAim.vy * 0.6;
    if (kx || ky || Math.abs(this.kbAim.vx) > 2 || Math.abs(this.kbAim.vy) > 2) {
      this.aim.x = clamp(this.aim.x + this.kbAim.vx * dtReal, 0, W - 1);
      this.aim.y = clamp(this.aim.y + this.kbAim.vy * dtReal, 0, H - 1);
      if (this.t - this.kbAim.lastMouse > 0.5) this.magnet(dtReal);
    }

    // weapon timing
    this.fireCD -= dtReal;
    this.recoil = Math.max(0, this.recoil - dtReal * 7);
    this.flashT = Math.max(0, this.flashT - dtReal);
    if (this.reloadT >= 0) {
      this.reloadT += dtReal / WEAPONS[this.weapon].reload;
      if (this.reloadT >= 1) this.finishReload();
    }
    if (this.mode === "play" && this.trigger && WEAPONS[this.weapon].auto && this.fireCD <= 0) this.fire();
    if (this.mode === "play" && this.ammo[this.weapon] === 0 && this.reloadT < 0 && this.reserve[this.weapon] > 0 && this.fireCD < -0.35) this.startReload();

    if (this.chainT > 0) { this.chainT -= dt; if (this.chainT <= 0) this.chain = 0; }
    if (this.hp <= 1 && this.mode === "play") { this.heartT -= dtReal; if (this.heartT <= 0) { this.heartT = 0.9; this.sfx("heart"); } }

    this.updateCamera(dt);
    if (this.mode === "play") this.director(dt);
    this.updateZeds(dt);
    this.updateSurvivors(dt);
    this.updateGlobs(dt);
    this.updateBoss(dt);
    this.updateParts(dt);
    for (const pk of this.pickups) { pk.t += dt; pk.y = 1.0 + Math.sin(pk.t * 3) * 0.12; if (pk.z - this.cam.z < 1.5) pk.got = true; }
    this.pickups = this.pickups.filter((p) => !p.got && p.t < 12);
    this.props = this.props.filter((p) => p.z > this.cam.z - 8);
    if (this.stage.theme.lightning && Math.random() < dt * 0.08) { this.lightning = 0.35; }
    this.lightning = Math.max(0, this.lightning - dt);
  }

  private magnet(dt: number): void {
    let best: { x: number; y: number; d: number } | null = null;
    for (const z of this.zeds) {
      if (z.st === "dead" || z.headless) continue;
      const h = this.zedParts(z).find((p) => p.part === "head");
      if (!h) continue;
      const x = (h.x0 + h.x1) / 2, y = (h.y0 + h.y1) / 2, d = Math.hypot(x - this.aim.x, y - this.aim.y);
      if (d < 16 && (!best || d < best.d)) best = { x, y, d };
    }
    if (best) { this.aim.x += (best.x - this.aim.x) * Math.min(1, dt * 6); this.aim.y += (best.y - this.aim.y) * Math.min(1, dt * 6); }
  }

  private updateCamera(dt: number): void {
    const c = this.cam;
    let want = 0;
    if (this.mode === "title") want = 0.6;
    else if (this.mode === "play" && this.ev?.t === "move") {
      const threatened = this.zeds.some((z) => z.st !== "dead" && z.z - c.z < 9);
      want = threatened ? 0 : this.moveTarget - c.z > 0.05 ? clamp((this.moveTarget - c.z) * 1.2, 0.6, 3.4) : 0;
    }
    c.spd += (want - c.spd) * Math.min(1, dt * 2.2);
    c.z += c.spd * dt;
    c.bob += c.spd * dt * 2.2;
    const targetX = Math.sin(c.z / 21) * 1.1;
    c.x += (targetX - c.x) * Math.min(1, dt * 1.5);
    c.pan = Math.cos(c.z / 21) * 1.1 / 21;
    c.y = EYE + Math.abs(Math.sin(c.bob)) * 0.05 * Math.min(1, c.spd / 2) + Math.sin(this.t * 0.9) * 0.01;
    c.shake = Math.max(0, c.shake - dt * 1.6);
    const sh = c.shake * c.shake * 9;
    this.ox = rnd(-1, 1) * sh;
    this.oy = rnd(-1, 1) * sh;
  }

  private director(dt: number): void {
    const ev = this.ev;
    if (!ev) return;
    this.evT += dt;
    const alive = this.zeds.filter((z) => z.st !== "dead").length;
    if (ev.t === "move") {
      if (this.ambushLeft > 0) {
        this.ambushT -= dt;
        if (this.ambushT <= 0) {
          this.ambushLeft--;
          this.ambushT = rnd(1.2, 2.6);
          this.spawnZed(Math.random() < 0.5 ? "walker" : "runner", Math.random() < 0.55 ? "ambush" : pick<Style>(["window", "alley", "ground"]));
        }
      }
      if (this.cam.z >= this.moveTarget - 0.1 && alive === 0) this.nextEvent();
    } else if (ev.t === "fight") {
      const f = this.fight, fd = ev as Fight;
      if (f.clearT >= 0) {
        f.clearT += dt;
        if (f.clearT > 1.6) this.nextEvent();
        return;
      }
      if (f.lull > 0) { f.lull -= dt; if (f.lull <= 0) { f.toSpawn = fd.per + this.si; } return; }
      f.spawnT -= dt;
      if (f.toSpawn > 0 && f.spawnT <= 0 && alive < fd.alive) {
        this.spawnZed(weighted(fd.kinds), weighted(fd.styles));
        f.toSpawn--;
        f.spawnT = rnd(0.5, 1.4) * (1 - this.si * 0.1);
      }
      if (f.survLeft > 0) { f.survT -= dt; if (f.survT <= 0) { f.survLeft--; f.survT = rnd(8, 14); this.spawnSurvivor(); } }
      if (f.toSpawn === 0 && alive === 0 && !this.survs.some((s) => s.st === "run")) {
        f.wave++;
        if (f.wave < fd.waves) { f.lull = 1.4; this.float(W / 2, 40, `WAVE ${f.wave + 1}/${fd.waves}`, "#c8ff5a", 1); }
        else {
          f.clearT = 0;
          this.slowmo = 0.6;
          const flawless = this.stats.dmg === f.dmgAtStart;
          this.addScore(500 + (flawless ? 1000 : 0), false);
          this.banner = { a: "CLEAR", b: flawless ? "FLAWLESS +1500" : "+500", t: 1.6, d: 1.6, col: "#c8ff5a" };
          this.sfx("clear");
        }
      }
    }
  }

  private updateZeds(dt: number): void {
    const c = this.cam;
    for (const z of this.zeds) {
      z.flash = Math.max(0, z.flash - dt);
      if (z.st === "dead") { z.deadT += dt; continue; }
      const dz = z.z - c.z;
      if (z.knock > 0) { z.z += z.knock * dt; z.knock = Math.max(0, z.knock - dt * 6); }
      z.groanT -= dt;
      if (z.groanT <= 0) { z.groanT = rnd(4, 10); if (dz < 14 && this.mode === "play") this.sfx("groan"); }
      if (this.mode !== "play" && this.mode !== "title") { z.anim += dt * 2; continue; }
      const limit = Math.min(3.0, Math.max(1, dz * 0.5));
      switch (z.st) {
        case "enter": {
          z.entryT += dt;
          if (z.entryT < 0) break;
          if (z.entry === "window") {
            z.vy -= 18 * dt; z.y += z.vy * dt; z.x += (z.tx - z.x) * dt * 0.6;
            if (z.y <= 0) { z.y = 0; z.st = "stagger"; z.t = 0.6; this.sfx("thud"); this.burst3(z.x, 0.1, z.z, [120, 110, 100], 12, 1.8, "dust"); this.cam.shake = Math.max(this.cam.shake, 0.2); }
          } else if (z.entry === "ground" || z.entry === "car") {
            z.y = Math.min(0, z.y + dt * (z.entry === "car" ? 2.2 : 1.6));
            if (Math.random() < 0.5) this.burst3(z.x, 0, z.z, [90, 80, 70], 1, 1.2, "dust");
            if (z.y >= 0) { z.st = "walk"; if (z.entry === "car") z.x += (z.tx - z.x) * 0.2; }
          } else if (z.entry === "ambush") {
            z.x += (z.tx - z.x) * Math.min(1, dt * 7);
            z.anim += dt * 12;
            if (Math.abs(z.x - z.tx) < 0.2) { z.st = "windup"; z.t = 0.7; }
          } else {
            // alley: walk sideways out of the gap
            z.x += Math.sign(z.tx - z.x) * z.spd * 1.3 * dt;
            z.anim += dt * (3 + z.spd * 2);
            if (Math.abs(z.x) < 4.6) z.st = "walk";
          }
          break;
        }
        case "walk": {
          if (z.kind === "runner" || z.chase) {
            z.dodgeT -= dt;
            if (z.dodgeT <= 0) { z.dodgeT = rnd(0.5, 1.0); z.tx = rnd(-limit, limit); }
          }
          const target = z.chase && z.chase.st === "run" ? z.chase.x : clamp(z.tx, -limit, limit);
          z.x += (target - z.x) * Math.min(1, dt * (z.kind === "runner" ? 2.4 : 0.8));
          z.z -= z.spd * dt * (z.crawl && z.kind !== "crawler" ? 0.8 : 1);
          z.anim += dt * (2 + z.spd * 2.4);
          if (z.chase && z.chase.st === "run" && Math.abs(z.chase.z - z.z) < 0.8 && Math.abs(z.chase.x - z.x) < 0.9) {
            z.chase.st = "dead"; z.chase.t = 0; this.stats.lost++;
            this.burst3(z.chase.x, 1, z.chase.z, [150, 16, 16], 24, 3, "blood");
            this.float(W / 2, 46, "SURVIVOR LOST", "#ff5050", 1); this.sfx("lost");
          }
          if (z.chase && z.chase.st !== "run") z.chase = null;
          if (z.kind === "spitter" && dz < z.stop) { z.st = "idle"; z.t = 0; }
          if (z.kind === "bloater" && dz < 2.7) { z.hp = 0; z.st = "dead"; z.deadT = 0; this.explode(z.x, 1, z.z, false); break; }
          if (dz < (z.crawl ? 2.1 : 2.4) && !z.chase) { z.st = "windup"; z.t = (z.arms[0] + z.arms[1] > 0 ? 0.8 : 1.3) - this.si * 0.08; }
          break;
        }
        case "idle": {
          z.anim += dt * 1.2;
          z.spitT -= dt;
          if (z.spitT <= 0) { z.st = "spitwind"; z.t = 0.7; }
          if (dz < 4) { z.st = "walk"; z.kind = "walker"; }
          break;
        }
        case "spitwind": {
          z.t -= dt; z.anim += dt * 5;
          if (z.t <= 0) { this.spit(z.x, 1.55 * (z.h / 1.75), z.z, false); z.st = "idle"; z.spitT = rnd(2.4, 3.6) - this.si * 0.3; }
          break;
        }
        case "windup": {
          z.t -= dt; z.anim += dt * 3;
          if (z.t <= 0) {
            const armed = z.arms[0] + z.arms[1];
            this.hurt(1);
            this.clawFx(armed > 0);
            z.st = "recover"; z.t = 1.0;
          }
          break;
        }
        case "recover": {
          z.t -= dt; z.anim += dt * 2;
          if (z.t <= 0) z.st = dz < 2.8 ? "windup" : "walk", z.t = 0.8;
          break;
        }
        case "stagger": {
          z.t -= dt;
          if (z.t <= 0) z.st = "walk";
          break;
        }
      }
    }
    // keep them from stacking into one blob
    const live = this.zeds.filter((z) => z.st !== "dead" && z.st !== "enter");
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!, b = live[j]!;
      const dx = b.x - a.x, dzz = b.z - a.z;
      if (Math.abs(dzz) < 0.7 && Math.abs(dx) < 0.75) { const push = (0.75 - Math.abs(dx)) * 0.5 * (dx >= 0 ? 1 : -1); a.x -= push; b.x += push; }
    }
    this.zeds = this.zeds.filter((z) => !(z.st === "dead" && z.deadT > 1.4) && z.z > c.z - 1);
  }
  private clawFx(claw: boolean): void {
    const x = rnd(80, W - 80), y = rnd(40, H - 60);
    for (let i = 0; i < (claw ? 3 : 1); i++) this.splats.push({ x: x + i * 9, y: y + i * 3, r: claw ? -18 : 10, col: [150, 0, 0], t: 1.4 });
  }
  private spit(x: number, y: number, zz: number, big: boolean): void {
    const T = big ? 1.7 : 1.5;
    const tz = this.cam.z + 0.6, ty = this.cam.y - 0.1, tx = this.cam.x + rnd(-0.4, 0.4);
    this.globs.push({ x, y, z: zz - 0.3, vx: (tx - x) / T, vz: (tz - zz) / T, vy: (ty - y) / T + 4.9 * T, dead: false, big });
    this.sfx("spit");
  }
  private updateGlobs(dt: number): void {
    for (const gl of this.globs) {
      if (gl.dead) continue;
      gl.vy -= 9.8 * dt;
      gl.x += gl.vx * dt; gl.y += gl.vy * dt; gl.z += gl.vz * dt;
      if (Math.random() < 0.5) this.parts.push({ x: gl.x, y: gl.y, z: gl.z, vx: 0, vy: 0, vz: 0, life: 0.3, col: [150, 230, 70], size: 0.06, kind: "goo" });
      if (gl.z - this.cam.z < 0.7) { gl.dead = true; this.hurt(1, [120, 200, 50]); this.sfx("splat"); }
      if (gl.y < -0.5) gl.dead = true;
    }
    this.globs = this.globs.filter((g) => !g.dead);
  }
  private updateSurvivors(dt: number): void {
    for (const s of this.survs) {
      s.flash = Math.max(0, s.flash - dt);
      s.t += dt;
      if (s.st === "run") {
        s.z -= 3.0 * dt; s.anim += dt * 12;
        s.x += Math.sin(s.t * 2 + s.side) * dt * 0.6;
        if (s.z - this.cam.z < 3.6) {
          s.st = "safe"; s.t = 0; this.stats.rescued++;
          this.addScore(1000, false);
          const p = this.P(s.x, 1.8, s.z);
          this.float(p?.x ?? W / 2, (p?.y ?? 50) - 6, "RESCUED +1000", "#7fd4ff", 1);
          this.sfx("rescue");
          this.pickups.push({ kind: this.hp < this.maxHp && Math.random() < 0.6 ? "med" : Math.random() < 0.5 ? "shotgun" : "smg", x: s.x, y: 1, z: s.z + 1.5, t: 0, got: false });
        }
      } else if (s.st === "safe") {
        s.x += s.side * 3.5 * dt; s.anim += dt * 12;
      }
    }
    this.survs = this.survs.filter((s) => s.t < 3 || s.st === "run");
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (!b) return;
    b.flash = Math.max(0, b.flash - dt);
    b.anim += dt;
    const dz = b.z - this.cam.z;
    const d = b.def;
    const fast = b.phase === 2 ? 1.35 : 1;
    switch (b.st) {
      case "intro": b.t -= dt; b.z -= 0.6 * dt; if (b.t <= 0) { b.st = "walk"; b.t = 1.5; } break;
      case "walk": {
        b.t -= dt;
        const home = d.shape === "queen" ? 8.5 : 10;
        b.z += (this.cam.z + home - b.z) * dt * 0.8;
        b.x = Math.sin(b.anim * (d.shape === "queen" ? 0.9 : 0.5)) * (d.shape === "queen" ? 2.2 : 1.2);
        if (b.t <= 0) {
          const a = d.attacks[b.atk++ % d.attacks.length]!;
          if (a === "charge") { b.st = "charge"; }
          else if (a === "volley") { b.st = "volley"; b.t = 0.5; b.volleyLeft = b.phase === 2 ? 5 : 3; }
          else { b.st = "summon"; b.t = 1.2; this.sfx("roar"); this.cam.shake = 0.4; }
        }
        break;
      }
      case "charge": {
        b.z -= 5.5 * fast * dt;
        b.x += (0 - b.x) * dt * 2;
        if (dz < Math.max(4.2, d.h * 1.8)) { b.st = "windup"; b.t = 1.25 / fast; b.fist = b.phase === 2 ? 5 : 4; this.float(W / 2, 30, "SHOOT THE FIST!", "#ffd84a", 1); }
        break;
      }
      case "windup": {
        b.t -= dt;
        if (b.t <= 0) { b.st = "slam"; b.t = 0.35; this.hurt(2); this.cam.shake = 1; this.sfx("boom"); }
        break;
      }
      case "slam": b.t -= dt; if (b.t <= 0) { b.st = "retreat"; } break;
      case "stagger": b.t -= dt; b.z += 2.5 * dt; if (b.t <= 0) { b.st = "retreat"; } break;
      case "retreat": b.z += 4 * dt; if (dz > 9) { b.st = "walk"; b.t = rnd(1.6, 2.6) / fast; } break;
      case "volley": {
        b.t -= dt;
        if (b.t <= 0 && b.volleyLeft > 0) {
          b.volleyLeft--; b.t = 0.45 / fast;
          this.spit(b.x + rnd(-0.6, 0.6), d.h * 0.8, b.z, true);
        }
        if (b.volleyLeft <= 0 && b.t <= 0) { b.st = "walk"; b.t = rnd(1.8, 2.8) / fast; }
        break;
      }
      case "summon": {
        b.t -= dt;
        if (b.t <= 0) {
          const n = b.phase === 2 ? 4 : 3;
          for (let i = 0; i < n; i++) { const z = this.spawnZed(d.summon, "ground"); z.x = rnd(-3, 3); z.z = this.cam.z + rnd(5, 9); }
          b.st = "walk"; b.t = rnd(3, 4.5);
        }
        break;
      }
      case "dead": {
        b.deadT += dt;
        if (Math.random() < dt * 8 && b.deadT < 1.6) { this.burst3(b.x + rnd(-1, 1), rnd(0.5, d.h), b.z - 0.5, mul(d.glow, 0.8), 18, 4, "goo"); this.burst3(b.x, rnd(0.5, d.h), b.z, [255, 170, 60], 10, 4, "fire"); this.sfx("boom"); this.cam.shake = 0.6; }
        if (b.deadT > 3.2) { this.boss = null; this.stageClear(); }
        break;
      }
    }
  }

  private burst3(x: number, y: number, z: number, col: RGB, n: number, pow: number, kind: Part3["kind"]): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * pow;
      this.parts.push({
        x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 + (kind === "fire" ? 2 : kind === "dust" ? 0.5 : 1.2), vz: (Math.random() - 0.6) * pow,
        life: kind === "spark" ? rnd(0.1, 0.25) : kind === "dust" ? rnd(0.4, 0.9) : rnd(0.5, 1.1), col: mix(col, [0, 0, 0], Math.random() * 0.3),
        size: kind === "chunk" ? rnd(0.06, 0.12) : kind === "dust" ? rnd(0.08, 0.18) : rnd(0.03, 0.07), kind,
      });
    }
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
  }
  private updateParts(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      const grav = p.kind === "fire" ? -1 : p.kind === "dust" ? 0.3 : 9.8;
      p.vy -= grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0 && p.kind !== "fire") {
        p.y = 0;
        if (p.kind === "blood" || p.kind === "goo") {
          if (Math.random() < 0.15 && this.decals.length < 140) this.decals.push({ x: p.x, z: p.z, r: rnd(0.08, 0.25), col: mix(p.col, [0, 0, 0], 0.4) });
          p.life = 0;
        } else { p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.decals.length > 140) this.decals.splice(0, this.decals.length - 140);
  }
  private updateScreenFx(dt: number): void {
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.hitMark = Math.max(0, this.hitMark - dt);
    if (this.hitMark <= 0) this.hitKill = false;
    if (this.tracer) { this.tracer.t -= dt; if (this.tracer.t <= 0) this.tracer = null; }
    for (const f of this.floats) { f.t -= dt; f.y -= 12 * dt; }
    this.floats = this.floats.filter((f) => f.t > 0);
    for (const s of this.splats) s.t -= dt;
    this.splats = this.splats.filter((s) => s.t > 0);
    for (const s of this.shells) { s.t -= dt; s.vy += 400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.y > H - 4) { s.y = H - 4; s.vy *= -0.4; s.vx *= 0.6; } }
    this.shells = this.shells.filter((s) => s.t > 0);
    for (const w of this.warns) w.t -= dt;
    this.warns = this.warns.filter((w) => w.t > -0.4);
    for (const r of this.rain) { r[1] += 260 * r[2] * dt; r[0] -= 40 * dt; if (r[1] > H) { r[1] = -5; r[0] = Math.random() * (W + 40); } }
  }
  private float(x: number, y: number, txt: string, col: string, scale: number): void {
    this.floats.push({ x, y, txt, col, t: 1.2, scale });
    if (this.floats.length > 14) this.floats.shift();
  }
  private sfx(n: Sfx): void { this.audio.play(n); }

  // ================= rendering =================
  private P(x: number, y: number, z: number): { x: number; y: number; s: number; dz: number } | null {
    const dz = z - this.cam.z;
    if (dz < 0.3) return null;
    const s = F / dz;
    return { x: W / 2 + (x - this.cam.x) * s + this.ox, y: HZ + (this.cam.y - y) * s + this.oy, s, dz };
  }
  private shade(c: RGB, dz: number, lit = 1): string {
    const flash = this.flashT > 0 ? 1 + 0.6 * Math.max(0, 1 - dz / 16) : 1;
    const l = this.lightning > 0 ? 1 + this.lightning * 1.4 : 1;
    const f = clamp((dz - 3) / 42, 0, 0.88);
    return css(mix(mul(c, lit * flash * l), this.stage.theme.fog, f));
  }
  private poly(pts: Array<{ x: number; y: number } | null>, fill: string): void {
    const g = this.g;
    if (pts.some((p) => !p)) return;
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
    g.closePath();
    g.fill();
  }
  private rect(x0: number, y0: number, x1: number, y1: number, fill: string): void {
    this.g.fillStyle = fill;
    const a = Math.round(x0), b = Math.round(y0);
    this.g.fillRect(a, b, Math.max(1, Math.round(x1) - a), Math.max(1, Math.round(y1) - b));
  }

  render(): void {
    const g = this.g;
    g.save();
    this.drawSky();
    this.drawGround();
    this.drawFacades();
    this.drawDecals();
    this.drawObjects();
    if (this.stage.theme.rain) this.drawRain();
    g.restore();
    this.drawScreenFx();
    this.drawGun();
    this.drawOverlay();
    this.pack();
  }

  private pack(): void {
    const d = this.g.getImageData(0, 0, W, H).data;
    const out = this.source.data;
    for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = ((d[j]! << 24) | (d[j + 1]! << 16) | (d[j + 2]! << 8) | 255) >>> 0;
  }

  private drawSky(): void {
    const g = this.g, th = this.stage.theme;
    const gr = g.createLinearGradient(0, 0, 0, HZ + this.oy);
    gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.6, th.sky[1]); gr.addColorStop(1, th.sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, W, HZ + 2 + this.oy);
    const pan = this.cam.x * 6 + this.cam.pan * 300;
    for (const [sx, sy, b] of this.stars) {
      const x = (((sx - pan * 0.2) % (W * 1.4)) + W * 1.4) % (W * 1.4);
      g.fillStyle = `rgba(255,255,255,${0.2 + 0.5 * b * Math.abs(Math.sin(this.t * 0.7 + b * 20))})`;
      g.fillRect(x | 0, sy | 0, 1, 1);
    }
    if (!th.rain) {
      const mx = 250 - pan * 0.3, my = 22;
      g.fillStyle = "rgba(240,230,200,0.10)"; g.beginPath(); g.arc(mx, my, 20, 0, 7); g.fill();
      g.fillStyle = "#e9e2c6"; g.beginPath(); g.arc(mx, my, 11, 0, 7); g.fill();
      g.fillStyle = "#cfc6a6"; g.fillRect(mx - 5 | 0, my - 3 | 0, 3, 3); g.fillRect(mx + 3 | 0, my + 2 | 0, 4, 3);
    }
    // distant skyline
    g.fillStyle = this.lightning > 0 ? css(mul(th.skyline, 4)) : css(th.skyline);
    for (const b of this.skyline) g.fillRect(Math.round(b.x - pan * 0.5 + this.ox), Math.round(HZ - b.h + this.oy), Math.ceil(b.w), Math.ceil(b.h) + 2);
    if (this.si === 2) {
      // the broadcast tower and its beacon
      const tx = 170 - pan * 0.5 + this.ox, base = HZ + this.oy;
      g.strokeStyle = css(mul(th.skyline, 1.6)); g.lineWidth = 1; g.beginPath();
      g.moveTo(tx - 9, base); g.lineTo(tx, base - 70); g.lineTo(tx + 9, base);
      for (let y = 8; y < 70; y += 7) { const w = (y / 70) * 9; g.moveTo(tx - w, base - 70 + y); g.lineTo(tx + w, base - 70 + y + 7); }
      g.stroke();
      if (Math.sin(this.t * 4) > 0) { g.fillStyle = "#ff3030"; g.fillRect(tx - 1 | 0, base - 73 | 0, 3, 3); g.fillStyle = "rgba(255,40,40,0.25)"; g.beginPath(); g.arc(tx, base - 72, 7, 0, 7); g.fill(); }
    }
    if (this.lightning > 0.25) { g.fillStyle = `rgba(220,220,255,${(this.lightning - 0.25) * 4})`; g.fillRect(0, 0, W, H); }
  }

  private drawGround(): void {
    const th = this.stage.theme, cz = this.cam.z;
    this.rect(0, HZ + this.oy, W, H, css(mix(th.ground, th.fog, 0.3)));
    const near = cz + 0.4, far = cz + 90;
    this.poly([this.P(-5, 0, near), this.P(5, 0, near), this.P(5, 0, far), this.P(-5, 0, far)], css(th.road));
    for (const s of [-1, 1]) this.poly([this.P(s * 5, 0, near), this.P(s * 6.9, 0, near), this.P(s * 6.9, 0, far), this.P(s * 5, 0, far)], css(th.walk));
    // curbs
    for (const s of [-1, 1]) this.poly([this.P(s * 5, 0, near), this.P(s * 5.12, 0, near), this.P(s * 5.12, 0, far), this.P(s * 5, 0, far)], css(mul(th.walk, 1.4)));
    // lane dashes
    const start = Math.floor(cz / 5) * 5;
    for (let z = start; z < cz + 70; z += 5) {
      if (z + 2.4 < near) continue;
      const z0 = Math.max(near, z), z1 = z + 2.4;
      this.poly([this.P(-0.07, 0, z0), this.P(0.07, 0, z0), this.P(0.07, 0, z1), this.P(-0.07, 0, z1)], this.shade([210, 190, 120], z - cz, 0.7));
    }
    // street-light pools
    for (const p of this.props) {
      if (p.type !== "lamp") continue;
      const q = this.P(p.x * 0.75, 0, p.z); if (!q || q.dz > 50) continue;
      const r = 3.2 * q.s;
      const gr = this.g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      const on = Math.sin(this.t * 17 + p.flick) > -0.9 ? 1 : 0.2;
      gr.addColorStop(0, css(th.light, 0.22 * on)); gr.addColorStop(1, css(th.light, 0));
      this.g.save(); this.g.translate(q.x, q.y); this.g.scale(1, 0.28); this.g.translate(-q.x, -q.y);
      this.g.fillStyle = gr; this.g.fillRect(q.x - r, q.y - r, r * 2, r * 2); this.g.restore();
    }
    // horizon fog
    const g = this.g, gr = g.createLinearGradient(0, HZ - 22 + this.oy, 0, HZ + 30 + this.oy);
    gr.addColorStop(0, css(th.fog, 0)); gr.addColorStop(0.45, css(th.fog, 0.75)); gr.addColorStop(1, css(th.fog, 0));
    g.fillStyle = gr; g.fillRect(0, HZ - 22 + this.oy, W, 52);
  }

  private drawFacades(): void {
    const cz = this.cam.z, th = this.stage.theme;
    const segs = this.segs.filter((s) => s.z1 > cz + 0.4 && s.z0 < cz + 75).sort((a, b) => b.z0 - a.z0);
    for (const s of segs) {
      const X = s.sign * s.x;
      const z0 = Math.max(s.z0, cz + 0.4), z1 = Math.min(s.z1, cz + 75);
      const mid = (z0 + z1) / 2 - cz;
      this.poly([this.P(X, 0, z0), this.P(X, s.h, z0), this.P(X, s.h, z1), this.P(X, 0, z1)], this.shade(s.col, mid, 0.85));
      // roof edge
      this.poly([this.P(X, s.h - 0.25, z0), this.P(X, s.h, z0), this.P(X, s.h, z1), this.P(X, s.h - 0.25, z1)], this.shade(s.col, mid, 0.55));
      // windows
      const r = seeded(s.seed);
      for (let wz = s.z0 + 1.4; wz < s.z1 - 0.8; wz += 2.6) {
        for (let wy = 2.8; wy < s.h - 1.2; wy += 3) {
          const v = r();
          if (wz - 0.55 < z0) continue;
          const dz = wz - cz;
          const lit = v < 0.22 + s.lit * 0.15;
          const flick = lit && v < 0.05 && Math.sin(this.t * 23 + wz) > 0.6;
          const col = lit && !flick ? this.shade(th.win, dz, 0.9) : this.shade(mul(s.col, 0.35), dz);
          this.poly([this.P(X, wy, wz - 0.55), this.P(X, wy + 1.4, wz - 0.55), this.P(X, wy + 1.4, wz + 0.55), this.P(X, wy, wz + 0.55)], col);
        }
        // ground floor door / shopfront
        if (r() < 0.35 && wz - 0.7 > z0) {
          const dz = wz - cz;
          const neon = r() < 0.3;
          this.poly([this.P(X, 0, wz - 0.7), this.P(X, 2.2, wz - 0.7), this.P(X, 2.2, wz + 0.7), this.P(X, 0, wz + 0.7)], neon ? this.shade(th.light, dz, 0.45) : this.shade([12, 12, 16], dz));
        }
      }
      // the end wall that faces the camera
      if (s.z0 > cz + 0.4) this.poly([this.P(X, 0, s.z0), this.P(X + s.sign * 9, 0, s.z0), this.P(X + s.sign * 9, s.h, s.z0), this.P(X, s.h, s.z0)], this.shade(s.col, s.z0 - cz, 0.6));
    }
  }

  private drawDecals(): void {
    const g = this.g;
    for (const d of this.decals) {
      const p = this.P(d.x, 0, d.z); if (!p || p.dz > 40) continue;
      g.fillStyle = this.shade(d.col, p.dz);
      g.beginPath(); g.ellipse(p.x, p.y, Math.max(1, d.r * p.s), Math.max(1, d.r * p.s * 0.25), 0, 0, 7); g.fill();
    }
  }

  private drawObjects(): void {
    type D = { z: number; fn: () => void };
    const list: D[] = [];
    const cz = this.cam.z;
    for (const p of this.props) if (p.z + p.d / 2 > cz + 0.5 && p.z - cz < 70 && !(p.type === "crate" && p.hp <= 0)) list.push({ z: p.z, fn: () => this.drawProp(p) });
    for (const z of this.zeds) if (z.z - cz > 0.5 && z.z - cz < 60) list.push({ z: z.z, fn: () => this.drawZed(z) });
    for (const s of this.survs) if (s.z - cz > 0.5) list.push({ z: s.z, fn: () => this.drawSurv(s) });
    for (const pk of this.pickups) list.push({ z: pk.z, fn: () => this.drawPickup(pk) });
    for (const gl of this.globs) list.push({ z: gl.z, fn: () => this.drawGlob(gl) });
    if (this.boss) { const b = this.boss; list.push({ z: b.z, fn: () => this.drawBoss(b) }); }
    list.push({ z: -1e9, fn: () => {} });
    list.sort((a, b) => b.z - a.z);
    // particles are drawn in depth order with everything else
    const parts = [...this.parts].sort((a, b) => b.z - a.z);
    let pi = 0;
    for (const d of list) {
      while (pi < parts.length && parts[pi]!.z > d.z) this.drawPart(parts[pi++]!);
      d.fn();
    }
    while (pi < parts.length) this.drawPart(parts[pi++]!);
  }

  private drawPart(p: Part3): void {
    const q = this.P(p.x, p.y, p.z); if (!q) return;
    const sz = Math.max(1, p.size * q.s);
    const col = p.kind === "fire" ? css(mix([255, 230, 120], [255, 60, 20], 1 - p.life), Math.min(1, p.life * 2)) : p.kind === "spark" ? css(p.col) : this.shade(p.col, q.dz, p.kind === "goo" ? 1.2 : 1);
    this.g.fillStyle = col;
    this.g.fillRect(Math.round(q.x - sz / 2), Math.round(q.y - sz / 2), Math.ceil(sz), Math.ceil(sz));
  }

  private box(x: number, z: number, w: number, d: number, y0: number, y1: number, col: RGB, lit = 1): void {
    const cz = this.cam.z;
    const zf = Math.max(z - d / 2, cz + 0.35), zb = z + d / 2;
    if (zb <= cz + 0.35) return;
    const x0 = x - w / 2, x1 = x + w / 2, dz = zf - cz;
    // top
    if (y1 < this.cam.y) this.poly([this.P(x0, y1, zf), this.P(x1, y1, zf), this.P(x1, y1, zb), this.P(x0, y1, zb)], this.shade(col, dz, lit * 1.1));
    // visible side
    if (x0 > this.cam.x) this.poly([this.P(x0, y0, zf), this.P(x0, y1, zf), this.P(x0, y1, zb), this.P(x0, y0, zb)], this.shade(col, dz, lit * 0.6));
    if (x1 < this.cam.x) this.poly([this.P(x1, y0, zf), this.P(x1, y1, zf), this.P(x1, y1, zb), this.P(x1, y0, zb)], this.shade(col, dz, lit * 0.6));
    // front
    this.poly([this.P(x0, y0, zf), this.P(x1, y0, zf), this.P(x1, y1, zf), this.P(x0, y1, zf)], this.shade(col, dz, lit * 0.8));
  }

  private drawProp(p: Prop): void {
    const th = this.stage.theme;
    const front = p.z - p.d / 2;
    const q = this.P(p.x, 0, Math.max(front, this.cam.z + 0.4));
    if (!q) return;
    const g = this.g;
    // contact shadow
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath(); g.ellipse(q.x, q.y, Math.max(1, p.w * 0.7 * q.s), Math.max(1, 0.12 * q.s), 0, 0, 7); g.fill();
    switch (p.type) {
      case "lamp": {
        const top = this.P(p.x, p.h, p.z), base = this.P(p.x, 0, p.z); if (!top || !base) return;
        const w = Math.max(1, 0.14 * base.s);
        this.rect(base.x - w / 2, top.y, base.x + w / 2, base.y, this.shade([20, 20, 26], base.dz));
        const arm = this.P(p.x - Math.sign(p.x) * 1.1, p.h, p.z);
        if (arm) {
          this.rect(Math.min(arm.x, top.x), top.y, Math.max(arm.x, top.x), top.y + Math.max(1, 0.1 * top.s), this.shade([20, 20, 26], base.dz));
          const on = Math.sin(this.t * 17 + p.flick) > -0.9;
          if (on) {
            const r = 1.6 * arm.s;
            const gr = g.createRadialGradient(arm.x, arm.y, 0, arm.x, arm.y, r);
            gr.addColorStop(0, css(th.light, 0.5)); gr.addColorStop(1, css(th.light, 0));
            g.fillStyle = gr; g.fillRect(arm.x - r, arm.y - r, r * 2, r * 2);
            this.rect(arm.x - 0.25 * arm.s, arm.y, arm.x + 0.25 * arm.s, arm.y + Math.max(1, 0.12 * arm.s), css(th.light));
          }
        }
        return;
      }
      case "car": case "ambulance": {
        this.box(p.x, p.z, p.w, p.d, 0.25, p.type === "car" ? 0.95 : 2.2, p.col);
        if (p.type === "car") this.box(p.x, p.z + 0.2, p.w * 0.86, p.d * 0.5, 0.95, 1.45, mix(p.col, [20, 30, 40], 0.5));
        else { const f = this.P(p.x, 1.3, front); if (f) this.rect(f.x - p.w * 0.5 * f.s, f.y - 0.12 * f.s, f.x + p.w * 0.5 * f.s, f.y + 0.12 * f.s, this.shade([200, 30, 30], f.dz)); }
        // wheels and lights
        const f = this.P(p.x, 0.25, front); if (!f) return;
        for (const s of [-1, 1]) {
          this.rect(f.x + s * p.w * 0.5 * f.s - 0.18 * f.s, f.y - 0.1 * f.s, f.x + s * p.w * 0.5 * f.s + 0.18 * f.s, f.y + 0.25 * f.s, this.shade([10, 10, 12], f.dz));
          const lightOn = p.type === "ambulance" ? Math.sin(this.t * 10 + s) > 0 : Math.sin(p.flick * 3) > 0.3;
          this.rect(f.x + s * p.w * 0.38 * f.s - 0.12 * f.s, f.y - 0.45 * f.s, f.x + s * p.w * 0.38 * f.s + 0.12 * f.s, f.y - 0.33 * f.s, lightOn ? (p.type === "ambulance" ? (s > 0 ? "#ff3030" : "#3060ff") : "#ffe6a0") : this.shade([60, 60, 60], f.dz));
        }
        return;
      }
      case "bus": {
        this.box(p.x, p.z, p.w, p.d, 0.3, p.h, p.col);
        const side = p.x > this.cam.x ? p.x - p.w / 2 : p.x + p.w / 2;
        for (let wz = front + 1; wz < p.z + p.d / 2 - 0.8; wz += 1.6) this.poly([this.P(side, 1.6, wz), this.P(side, 2.6, wz), this.P(side, 2.6, wz + 1.2), this.P(side, 1.6, wz + 1.2)], this.shade([40, 50, 60], wz - this.cam.z));
        return;
      }
      case "tank": {
        this.box(p.x, p.z, p.w, p.d, 0, p.h, p.col);
        const f = this.P(p.x, 1.6, front); if (f) this.rect(f.x - p.w * 0.5 * f.s, f.y, f.x + p.w * 0.5 * f.s, f.y + 0.3 * f.s, this.shade([200, 150, 40], f.dz));
        return;
      }
      case "barrier": {
        this.box(p.x, p.z, p.w, p.d, 0, p.h, p.col);
        const f = this.P(p.x, 0.55, front); if (f) for (let i = -2; i <= 2; i += 2) this.rect(f.x + (i * 0.22 - 0.12) * f.s, f.y - 0.12 * f.s, f.x + (i * 0.22 + 0.12) * f.s, f.y + 0.12 * f.s, this.shade([200, 60, 40], f.dz));
        return;
      }
      case "gurney": {
        this.box(p.x, p.z, p.w, p.d, 0.75, 0.9, p.col);
        this.box(p.x, p.z, 0.06, p.d * 0.9, 0, 0.75, [90, 90, 96]);
        this.box(p.x, p.z + 0.2, p.w * 0.8, p.d * 0.6, 0.9, 1.1, [210, 200, 200]);
        return;
      }
      case "barrel": {
        this.box(p.x, p.z, p.w, p.d, 0, p.h, p.col);
        const top = this.P(p.x, p.h, p.z); if (!top) return;
        const r = 1.6 * top.s;
        const fl = 0.8 + Math.sin(this.t * 13 + p.flick) * 0.2;
        const gr = g.createRadialGradient(top.x, top.y, 0, top.x, top.y, r);
        gr.addColorStop(0, `rgba(255,160,60,${0.45 * fl})`); gr.addColorStop(1, "rgba(255,120,40,0)");
        g.fillStyle = gr; g.fillRect(top.x - r, top.y - r, r * 2, r * 2);
        if (Math.random() < 0.6) this.parts.push({ x: p.x + rnd(-0.2, 0.2), y: p.h, z: p.z, vx: rnd(-0.2, 0.2), vy: rnd(0.8, 1.6), vz: 0, life: rnd(0.3, 0.6), col: [255, 160, 60], size: 0.09, kind: "fire" });
        return;
      }
      case "crate": {
        this.box(p.x, p.z, p.w, p.d, 0, p.h, p.col, 1.1);
        const f = this.P(p.x, p.h / 2, front); if (!f) return;
        const s = (p.w / 2) * f.s;
        g.strokeStyle = this.shade([90, 60, 30], f.dz); g.lineWidth = Math.max(1, 0.06 * f.s);
        g.beginPath(); g.moveTo(f.x - s, f.y - s); g.lineTo(f.x + s, f.y + s); g.moveTo(f.x + s, f.y - s); g.lineTo(f.x - s, f.y + s); g.stroke();
        if (Math.sin(this.t * 5) > 0) drawText(g, "!", f.x, f.y - s - 10, "#ffd84a", 1, "center");
        return;
      }
    }
  }

  private drawZed(z: Zed): void {
    const p = this.P(z.x, z.y, z.z); if (!p) return;
    const g = this.g;
    const k = z.h / 1.75, s = p.s * k, cx = p.x, fy = p.y, dz = p.dz;
    const lit = z.flash > 0 ? 3 : 1;
    const C = (c: RGB, m = 1): string => (z.flash > 0 ? "#ffffff" : this.shade(c, dz, m * lit));
    const R = (mx0: number, my0: number, mx1: number, my1: number, col: string): void => this.rect(cx + mx0 * s, fy - my1 * s, cx + mx1 * s, fy - my0 * s, col);
    g.save();
    if (z.st === "dead") {
      const pr = Math.min(1, z.deadT / 0.45);
      g.globalAlpha = clamp(1.6 - z.deadT, 0, 1);
      g.translate(cx, fy); g.rotate(z.fall * pr * 1.45); g.translate(-cx, -fy);
    }
    // shadow
    if (z.y > -0.1) { g.fillStyle = "rgba(0,0,0,0.4)"; g.beginPath(); g.ellipse(cx, p.y + z.y * p.s, Math.max(1, 0.32 * s), Math.max(1, 0.06 * s), 0, 0, 7); g.fill(); }
    if (z.y < 0) { // emerging from the ground: clip at street level
      const gy = HZ + (this.cam.y) * p.s + this.oy;
      g.beginPath(); g.rect(0, 0, W, gy); g.clip();
    }
    const sw = Math.sin(z.anim);
    if (z.crawl) {
      const reach = Math.sin(z.anim * 1.4);
      R(-0.27, 0.04, 0.27, 0.42, C(z.pal.shirt));
      R(-0.2, 0.0, 0.2, 0.12, C(mul(z.pal.pants, 0.8)));
      if (z.arms[0] > 0) R(-0.44, 0, -0.26, 0.26 + reach * 0.06, C(z.pal.skin));
      if (z.arms[1] > 0) R(0.26, 0, 0.44, 0.26 - reach * 0.06, C(z.pal.skin));
      if (!z.headless) {
        R(-0.13, 0.28, 0.13, 0.58, C(z.pal.skin));
        R(-0.13, 0.52, 0.13, 0.6, C(z.pal.hair));
        if (dz < 25) { R(-0.09, 0.42, -0.04, 0.46, z.kind === "crawler" ? "#ff5040" : "#ffe14a"); R(0.04, 0.42, 0.09, 0.46, z.kind === "crawler" ? "#ff5040" : "#ffe14a"); }
      } else R(-0.08, 0.38, 0.08, 0.46, C([120, 10, 10]));
      g.restore();
      return;
    }
    const walk = z.st === "walk" || z.st === "enter";
    const lift = walk ? 0.1 : 0;
    // legs
    if (z.legs > 0 || true) {
      R(-0.18 + sw * 0.03, Math.max(0, sw) * lift, -0.03 + sw * 0.03, 0.86, C(z.pal.pants));
      R(0.03 - sw * 0.03, Math.max(0, -sw) * lift, 0.18 - sw * 0.03, 0.86, C(mul(z.pal.pants, 0.85)));
    }
    // torso
    const bob = Math.abs(sw) * 0.03;
    if (z.kind === "bloater") {
      R(-0.3, 0.8, 0.3, 1.48 + bob, C(z.pal.shirt));
      g.fillStyle = C(z.pal.skin, 1.1);
      g.beginPath(); g.ellipse(cx, fy - 1.02 * s, 0.47 * s, 0.33 * s, 0, 0, 7); g.fill();
      g.fillStyle = C([120, 150, 50]);
      for (const [bx, by] of [[-0.2, 1.1], [0.15, 0.92], [0.25, 1.15]] as const) { g.beginPath(); g.arc(cx + bx * s, fy - by * s, Math.max(1, 0.06 * s), 0, 7); g.fill(); }
    } else {
      R(-0.24, 0.82, 0.24, 1.46 + bob, C(z.pal.shirt));
      R(-0.24, 0.82, 0.24, 0.92, C(mul(z.pal.shirt, 0.6)));
      if (dz < 20) for (const [bx, by] of z.pal.blood) R(bx - 0.04, by, bx + 0.04, by + 0.06, C([110, 16, 16]));
      R(-0.05, 1.2, 0.09, 1.3, C(z.pal.skin)); // torn shirt
    }
    if (z.kind === "riot") { R(-0.25, 1.0, 0.25, 1.46 + bob, C([30, 34, 44])); }
    // arms
    const up = z.st === "windup" ? 0.42 + Math.sin(this.t * 30) * 0.02 : z.st === "recover" ? -0.25 : 0;
    const armY0 = 1.12 + up + bob, armY1 = 1.5 + up + bob;
    const sway = Math.sin(z.anim * 0.5) * 0.04;
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? -1 : 1;
      if (z.arms[side] > 0) {
        R(sx < 0 ? -0.4 : 0.24, armY0 + sway * sx, sx < 0 ? -0.24 : 0.4, armY1 + sway * sx, C(z.pal.shirt, 0.9));
        R(sx < 0 ? -0.42 : 0.23, armY1 + sway * sx - 0.02, sx < 0 ? -0.23 : 0.42, armY1 + sway * sx + 0.12, C(z.pal.skin));
      } else {
        R(sx < 0 ? -0.36 : 0.24, 1.32, sx < 0 ? -0.24 : 0.36, 1.46, C(z.pal.shirt, 0.9));
        R(sx < 0 ? -0.36 : 0.24, 1.3, sx < 0 ? -0.24 : 0.36, 1.34, C([120, 10, 10]));
      }
    }
    // head
    if (!z.headless) {
      const hx = Math.sin(z.anim * 0.7) * 0.02;
      R(hx - 0.13, 1.44 + bob, hx + 0.13, 1.74 + bob, C(z.pal.skin));
      R(hx - 0.13, 1.68 + bob, hx + 0.13, 1.76 + bob, C(z.pal.hair));
      const mouth = z.st === "windup" || z.st === "spitwind" ? 0.06 : 0.03;
      R(hx - 0.06, 1.5 + bob, hx + 0.06, 1.5 + bob + mouth, C([40, 8, 8]));
      if (dz < 30) {
        const eye = z.st === "windup" ? "#ff2020" : z.kind === "runner" ? "#ff6a3a" : z.kind === "spitter" ? "#b8ff3a" : "#ffe14a";
        R(hx - 0.09, 1.6 + bob, hx - 0.04, 1.64 + bob, eye);
        R(hx + 0.04, 1.6 + bob, hx + 0.09, 1.64 + bob, eye);
      }
      if (z.kind === "riot") R(hx - 0.15, 1.66 + bob, hx + 0.15, 1.8 + bob, C([40, 44, 56]));
      if (z.st === "spitwind") { g.fillStyle = css([170, 255, 80], 0.8); g.beginPath(); g.arc(cx + hx * s, fy - 1.52 * s, Math.max(1, 0.1 * s), 0, 7); g.fill(); }
    } else {
      R(-0.07, 1.42, 0.07, 1.5, C([130, 10, 10]));
    }
    // riot shield
    if (z.shield > 0) {
      const dmg = 1 - z.shield / 7;
      R(-0.4, 0.12, 0.4, 1.36, C([110, 120, 132]));
      R(-0.36, 0.9, 0.36, 1.2, C([60, 70, 90]));
      if (dmg > 0.3) { g.strokeStyle = C([40, 40, 46]); g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 0.2 * s, fy - 1.1 * s); g.lineTo(cx + 0.05 * s, fy - 0.6 * s); g.lineTo(cx + 0.25 * s, fy - 0.4 * s); g.stroke(); }
    }
    // telegraph ring for the swing
    if (z.st === "windup" && !z.crawl) {
      g.strokeStyle = `rgba(255,40,40,${0.5 + 0.5 * Math.sin(this.t * 30)})`; g.lineWidth = 1;
      g.strokeRect(Math.round(cx - 0.46 * s), Math.round(fy - 2.0 * s), Math.round(0.92 * s), Math.round(2.0 * s));
    }
    g.restore();
  }

  private drawSurv(sv: Surv): void {
    const p = this.P(sv.x, 0, sv.z); if (!p) return;
    const g = this.g, s = p.s, cx = p.x, fy = p.y, dz = p.dz;
    const C = (c: RGB): string => (sv.flash > 0 ? "#ffffff" : this.shade(c, dz, 1.15));
    const R = (a: number, b: number, c: number, d: number, col: string): void => this.rect(cx + a * s, fy - d * s, cx + c * s, fy - b * s, col);
    g.save();
    if (sv.st === "dead") { g.globalAlpha = clamp(1.5 - sv.t, 0, 1); g.translate(cx, fy); g.rotate(1.4 * Math.min(1, sv.t * 2)); g.translate(-cx, -fy); }
    if (sv.st === "safe") g.globalAlpha = clamp(1.2 - sv.t * 0.6, 0, 1);
    const sw = Math.sin(sv.anim) * 0.06;
    R(-0.16 + sw, 0, -0.03 + sw, 0.85, C([40, 46, 70]));
    R(0.03 - sw, 0, 0.16 - sw, 0.85, C([40, 46, 70]));
    R(-0.2, 0.84, 0.2, 1.45, C([240, 130, 30]));
    R(-0.2, 1.1, 0.2, 1.16, C([230, 230, 230])); // reflective stripe
    R(-0.11, 1.44, 0.11, 1.7, C([226, 182, 140]));
    R(-0.12, 1.64, 0.12, 1.74, C([60, 36, 20]));
    const wave = Math.abs(Math.sin(sv.t * 8)) * 0.15;
    R(0.2, 1.3 + wave, 0.29, 1.85 + wave, C([240, 130, 30]));
    g.restore();
    if (sv.st === "run" && dz < 30) drawText(g, "HELP!", cx, fy - 1.95 * s - 9, "#7fd4ff", 1, "center");
  }

  private drawPickup(pk: Pickup): void {
    const p = this.P(pk.x, pk.y, pk.z); if (!p) return;
    const g = this.g, s = Math.max(4, 0.42 * p.s);
    const pulse = 0.6 + 0.4 * Math.sin(pk.t * 8);
    const col: RGB = pk.kind === "med" ? [90, 255, 130] : [255, 216, 74];
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 2);
    gr.addColorStop(0, css(col, 0.5 * pulse)); gr.addColorStop(1, css(col, 0));
    g.fillStyle = gr; g.fillRect(p.x - s * 2, p.y - s * 2, s * 4, s * 4);
    this.rect(p.x - s, p.y - s, p.x + s, p.y + s, pk.kind === "med" ? "#f0f0f0" : "#2a2a30");
    if (pk.kind === "med") { this.rect(p.x - s * 0.2, p.y - s * 0.7, p.x + s * 0.2, p.y + s * 0.7, "#e02020"); this.rect(p.x - s * 0.7, p.y - s * 0.2, p.x + s * 0.7, p.y + s * 0.2, "#e02020"); }
    else drawText(g, pk.kind === "shotgun" ? "SG" : "SMG", p.x, p.y - 3, "#ffd84a", 1, "center", null);
  }

  private drawGlob(gl: Glob): void {
    const p = this.P(gl.x, gl.y, gl.z); if (!p) return;
    const g = this.g, r = Math.max(2, (gl.big ? 0.32 : 0.22) * p.s);
    g.fillStyle = "rgba(160,255,80,0.25)"; g.beginPath(); g.arc(p.x, p.y, r * 1.8, 0, 7); g.fill();
    g.fillStyle = "#9be04a"; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
    g.fillStyle = "#e2ffb0"; g.fillRect(Math.round(p.x - r * 0.4), Math.round(p.y - r * 0.5), Math.max(1, r * 0.4 | 0), Math.max(1, r * 0.4 | 0));
    if (p.dz < 7) { g.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(this.t * 25)})`; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, r + 3, 0, 7); g.stroke(); }
  }

  private drawBoss(b: Boss): void {
    const q = this.bossParts(b); if (!q) return;
    const g = this.g, d = b.def, s = q.s, cx = q.cx, fy = q.fy, dz = b.z - this.cam.z;
    const C = (c: RGB, m = 1): string => (b.flash > 0 ? "#ffffff" : this.shade(c, dz, m));
    const R = (a: number, bb: number, c: number, dd: number, col: string): void => this.rect(cx + a * s, fy - dd * s, cx + c * s, fy - bb * s, col);
    g.save();
    if (b.st === "dead") { g.globalAlpha = clamp(3 - b.deadT, 0, 1); g.translate(cx, fy); g.rotate(Math.min(1, b.deadT / 2) * 0.5); g.translate(-cx, -fy); }
    g.fillStyle = "rgba(0,0,0,0.45)"; g.beginPath(); g.ellipse(cx, fy, d.w * 0.7 * s, 0.15 * s, 0, 0, 7); g.fill();
    const sw = Math.sin(b.anim * (b.st === "charge" ? 9 : 3)) * 0.06;
    const hw = d.w / 2, h = d.h;
    if (d.shape === "queen") {
      // a spread, many-limbed mass with a nurse's cap of rags
      for (let i = -2; i <= 2; i++) if (i) R(i * 0.55 - 0.1, 0, i * 0.55 + 0.1, 0.9 + Math.sin(b.anim * 4 + i) * 0.1, C(d.skin, 0.7));
      g.fillStyle = C(d.cloth, 0.9); g.beginPath(); g.ellipse(cx, fy - 1.15 * s, hw * s, 0.8 * s, 0, 0, 7); g.fill();
      g.fillStyle = C(d.skin); g.beginPath(); g.ellipse(cx, fy - 1.85 * s, 0.42 * s, 0.4 * s, 0, 0, 7); g.fill();
      R(-0.3, 2.15, 0.3, 2.3, C([230, 230, 230]));
      R(-0.06, 2.18, 0.06, 2.28, C([200, 30, 30]));
    } else {
      R(-hw * 0.55 + sw, 0, -hw * 0.12 + sw, h * 0.42, C(mul(d.cloth, 0.5)));
      R(hw * 0.12 - sw, 0, hw * 0.55 - sw, h * 0.42, C(mul(d.cloth, 0.5)));
      g.fillStyle = C(d.cloth); g.beginPath(); g.ellipse(cx, fy - h * 0.62 * s, hw * s, h * 0.27 * s, 0, 0, 7); g.fill();
      if (d.shape === "brute") { R(-hw * 0.7, h * 0.45, hw * 0.7, h * 0.58, C([150, 30, 30], 0.8)); } // apron stains
      if (d.shape === "warden") { R(-hw * 0.85, h * 0.7, -hw * 0.35, h * 0.85, C([90, 92, 100])); R(hw * 0.35, h * 0.7, hw * 0.85, h * 0.85, C([90, 92, 100])); }
      // arms
      const raise = b.st === "windup" ? 0.25 : 0;
      R(-hw - 0.35, h * 0.45, -hw + 0.05, h * 0.82, C(d.skin, 0.9));
      R(hw - 0.05, h * 0.45 + raise, hw + 0.35, h * 0.82 + raise, C(d.skin, 0.9));
      // head
      R(-0.32, h * 0.82, 0.32, h * 0.98, C(d.skin));
      if (d.shape === "warden" && b.phase === 1) R(-0.36, h * 0.86, 0.36, h * 1.0, C([70, 72, 80]));
      R(-0.18, h * 0.9, -0.08, h * 0.92, "#ff3020"); R(0.08, h * 0.9, 0.18, h * 0.92, "#ff3020");
      R(-0.15, h * 0.84, 0.15, h * 0.865, C([40, 8, 8]));
    }
    // weak points
    const pts = b.phase === 1 ? b.points : [b.core];
    for (const w of pts) {
      if (w.hp <= 0) { g.fillStyle = C([60, 10, 10]); g.beginPath(); g.arc(cx + w.ox * s, fy - w.oy * s, w.r * s * 0.7, 0, 7); g.fill(); continue; }
      const pulse = 0.75 + 0.25 * Math.sin(this.t * 6 + w.ox * 3);
      const gr = g.createRadialGradient(cx + w.ox * s, fy - w.oy * s, 0, cx + w.ox * s, fy - w.oy * s, w.r * s * 2.2);
      gr.addColorStop(0, css(d.glow, 0.7 * pulse)); gr.addColorStop(1, css(d.glow, 0));
      g.fillStyle = gr; g.fillRect(cx + w.ox * s - w.r * s * 2.2, fy - w.oy * s - w.r * s * 2.2, w.r * s * 4.4, w.r * s * 4.4);
      g.fillStyle = b.flash > 0 ? "#ffffff" : css(mul(d.glow, 0.6 + 0.4 * (w.hp / w.max)));
      g.beginPath(); g.arc(cx + w.ox * s, fy - w.oy * s, Math.max(2, w.r * s), 0, 7); g.fill();
      g.fillStyle = "#fff8d0"; g.fillRect(Math.round(cx + w.ox * s - 1), Math.round(fy - w.oy * s - 1), 2, 2);
    }
    // the fist to counter during a windup
    if (b.st === "windup" && b.fist > 0) {
      const { x: fx, y: fyy } = this.fistPos(b, q);
      g.fillStyle = `rgba(255,220,80,${0.4 + 0.4 * Math.sin(this.t * 30)})`; g.beginPath(); g.arc(fx, fyy, Math.max(6, 0.5 * s), 0, 7); g.fill();
      g.fillStyle = C(d.skin, 1.3); g.beginPath(); g.arc(fx, fyy, Math.max(4, 0.32 * s), 0, 7); g.fill();
    }
    g.restore();
  }

  private drawRain(): void {
    const g = this.g;
    g.strokeStyle = "rgba(180,200,220,0.35)"; g.lineWidth = 1; g.beginPath();
    for (const [x, y, sp] of this.rain) { g.moveTo(x, y); g.lineTo(x - 2, y + 6 * sp); }
    g.stroke();
  }

  private drawScreenFx(): void {
    const g = this.g;
    // muzzle light
    if (this.flashT > 0) { g.fillStyle = `rgba(255,220,150,${this.flashT * 1.4})`; g.fillRect(0, 0, W, H); }
    // vignette (redder when hurt or near death)
    const low = this.hp <= 1 && this.mode === "play" ? 0.25 + 0.2 * Math.sin(this.t * 7) : 0;
    const vg = g.createRadialGradient(W / 2, H / 2, 70, W / 2, H / 2, 200);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, this.hurtT > 0 || low > 0 ? `rgba(170,0,0,${0.35 + this.hurtT * 0.6 + low})` : "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    for (const s of this.splats) {
      const a = Math.min(1, s.t);
      if (s.r < 0) { // claw marks
        g.strokeStyle = css(s.col, a * 0.9); g.lineWidth = 2;
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x + 22, s.y + 46); g.stroke();
      } else {
        g.fillStyle = css(s.col, a * 0.7);
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
        g.beginPath(); g.arc(s.x + s.r * 0.6, s.y + s.r * 0.9, s.r * 0.4, 0, 7); g.fill();
        g.fillRect(s.x - 2, s.y, 3, s.r * 1.8 * (1.6 - a));
      }
    }
    // ambush warnings at the screen edge
    for (const w of this.warns) {
      if (w.t < 0) continue;
      if (Math.sin(this.t * 30) > -0.2) {
        const x = w.side < 0 ? 8 : W - 20;
        this.rect(x - 2, 70, x + 14, 104, "rgba(200,0,0,0.75)");
        drawText(g, "!", x + 6, 76, "#ffffff", 3, "center");
      }
    }
  }

  private drawGun(): void {
    if (this.mode === "title") return;
    const g = this.g;
    const reload = this.reloadT >= 0 ? Math.sin(Math.min(1, this.reloadT) * Math.PI) : 0;
    const gx = 236 + (this.aim.x - W / 2) * 0.18 + Math.sin(this.cam.bob) * 2;
    const gy = 126 + (this.aim.y - H / 2) * 0.06 + this.recoil * 8 + reload * 34 + Math.abs(Math.cos(this.cam.bob)) * 2;
    if (this.tracer) {
      g.strokeStyle = "rgba(255,240,180,0.9)"; g.lineWidth = 1; g.beginPath();
      g.moveTo(this.tracer.x0, this.tracer.y0); g.lineTo(this.tracer.x1, this.tracer.y1); g.stroke();
    }
    if (this.flashT > 0) {
      g.fillStyle = "rgba(255,210,110,0.95)"; g.beginPath();
      const n = 10, r1 = this.weapon === "shotgun" ? 20 : 13;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + this.t * 40, r = i % 2 ? 4 : r1; g.lineTo(gx + Math.cos(a) * r, gy - 6 + Math.sin(a) * r * 0.7); }
      g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(gx, gy - 6, 4, 0, 7); g.fill();
    }
    const gold = this.golden > 0;
    const metal = gold ? "#c9a640" : "#24262c", hi = gold ? "#f4dc80" : "#3c3f48";
    g.save(); g.translate(gx, gy); g.rotate(reload * 0.6 - this.recoil * 0.08); g.scale(1.6, 1.6);
    if (this.weapon === "pistol") {
      this.rect(-6, -2, 6, 30, metal); this.rect(-5, -1, 5, 3, hi); this.rect(-1, -5, 1, -2, hi);
      this.rect(-8, 24, 8, 48, "#1a1b20");
    } else if (this.weapon === "shotgun") {
      this.rect(-7, -4, 7, 50, "#1e1f24"); this.rect(-6, -4, -1, 50, hi); this.rect(1, -4, 6, 50, hi);
      this.rect(-9, 16, 9, 28, "#6b4428"); this.rect(-10, 36, 10, 60, "#5a3920");
    } else {
      this.rect(-8, -2, 8, 36, metal); this.rect(-4, -8, 4, -1, hi); this.rect(-3, 20, 3, 44, "#1a1b20"); this.rect(-8, 8, 8, 11, hi);
    }
    // hands
    this.rect(-12, 26, 12, 42, "#b98058"); this.rect(-12, 36, 12, 38, "#9c6646");
    g.restore();
    for (const s of this.shells) this.rect(s.x, s.y, s.x + 3, s.y + 1.5, s.red ? "#c03020" : "#d8b048");
  }

  private drawOverlay(): void {
    const g = this.g;
    for (const f of this.floats) drawText(g, f.txt, clamp(f.x, textWidth(f.txt, f.scale) / 2 + 2, W - textWidth(f.txt, f.scale) / 2 - 2), f.y, f.t < 0.3 ? `rgba(255,255,255,${f.t * 3})` : f.col, f.scale, "center");
    // boss bar
    if (this.boss && this.boss.st !== "intro" && this.mode === "play") {
      const b = this.boss;
      const pts = b.phase === 1 ? b.points : [b.core];
      const frac = pts.reduce((s, p) => s + Math.max(0, p.hp), 0) / pts.reduce((s, p) => s + p.max, 0);
      drawText(g, b.def.name + (b.phase === 2 ? " - CORE" : ""), W / 2, 6, "#ff6a5a", 1, "center");
      this.rect(80, 15, 240, 19, "rgba(0,0,0,0.7)");
      this.rect(81, 16, 81 + 158 * frac, 18, b.phase === 2 ? "#ff3030" : "#ff9a3a");
    }
    if (this.banner) {
      const b = this.banner, a = Math.min(1, b.t * 2, (b.d - b.t) * 4);
      g.globalAlpha = a;
      if (b.a) { this.rect(0, 62, W, 108, "rgba(0,0,0,0.55)"); drawText(g, b.a, W / 2, 68, b.col, 3, "center"); drawText(g, b.b, W / 2, 95, "#e8e8f0", 1, "center"); }
      else drawText(g, b.b, W / 2, 52, b.col, 1, "center");
      g.globalAlpha = 1;
    }
    if (this.mode === "play" && !this.paused) this.drawCrosshair();
    if (this.mode === "title") {
      this.rect(0, 0, W, H, "rgba(0,0,0,0.35)");
      const y = 34 + Math.sin(this.t * 2) * 2;
      drawText(g, "DEAD", W / 2, y, "#c8ff5a", 5, "center", "#5a0d0d");
      drawText(g, "SIGNAL", W / 2, y + 40, "#c8ff5a", 5, "center", "#5a0d0d");
      drawText(g, "A ZOMBIE RAIL SHOOTER FOR THE CONSOLE", W / 2, y + 84, "#d8d8e0", 1, "center");
      if (Math.sin(this.t * 5) > -0.3) drawText(g, "CLICK THE PAGE OR PRESS SPACE", W / 2, 140, "#ffd84a", 1, "center");
      if (this.best) drawText(g, `BEST ${this.best}`, W / 2, 156, "#9a9aa8", 1, "center");
    }
    if (this.mode === "dead") {
      this.rect(0, 0, W, H, `rgba(40,0,0,${Math.min(0.7, this.continueT)})`);
      drawText(g, "YOU DIED", W / 2, 46, "#ff4a4a", 4, "center");
      const n = Math.max(0, Math.ceil(9.3 - this.continueT));
      drawText(g, `CONTINUE? ${n}`, W / 2, 92, "#ffffff", 2, "center");
      if (Math.sin(this.t * 6) > -0.3) drawText(g, "CLICK OR PRESS SPACE", W / 2, 120, "#ffd84a", 1, "center");
      drawText(g, "CONTINUING HALVES YOUR SCORE", W / 2, 136, "#bbbbbb", 1, "center");
    }
    if (this.mode === "results" && this.results) {
      const r = this.results;
      this.rect(40, 18, 280, 168, "rgba(6,6,12,0.86)");
      drawText(g, "STAGE CLEAR", W / 2, 26, "#c8ff5a", 2, "center");
      r.lines.forEach(([k, v], i) => {
        if (r.t < 0.3 + i * 0.15) return;
        drawText(g, k, 56, 52 + i * 12, "#c8c8d0", 1, "left");
        drawText(g, v, 210, 52 + i * 12, "#ffffff", 1, "right");
      });
      if (r.t > 1.3) {
        const col = { S: "#ffd84a", A: "#c8ff5a", B: "#7fd4ff", C: "#ffffff", D: "#ff6a5a" }[r.grade] ?? "#fff";
        drawText(g, "RANK", 252, 52, "#c8c8d0", 1, "center");
        drawText(g, r.grade, 252, 66, col, 6, "center");
      }
      if (r.t > 1.6 && Math.sin(this.t * 5) > -0.3) drawText(g, "CLICK OR PRESS SPACE", W / 2, 150, "#ffd84a", 1, "center");
    }
    if (this.mode === "win" && this.results) {
      this.rect(0, 0, W, H, "rgba(0,0,0,0.6)");
      drawText(g, "SIGNAL RESTORED", W / 2, 44, "#c8ff5a", 2, "center");
      drawText(g, "THE BROADCAST GOES OUT. SOMEONE ANSWERS.", W / 2, 70, "#e0e0e8", 1, "center");
      drawText(g, `FINAL SCORE ${this.score}`, W / 2, 92, "#ffd84a", 2, "center");
      drawText(g, `CONTINUES USED ${this.continues}`, W / 2, 116, "#bbbbbb", 1, "center");
      if (this.results.t > 2 && Math.sin(this.t * 5) > -0.3) drawText(g, "CLICK TO PLAY AGAIN", W / 2, 140, "#ffffff", 1, "center");
    }
    if (this.paused) {
      this.rect(0, 0, W, H, "rgba(0,0,0,0.6)");
      drawText(g, "PAUSED", W / 2, 70, "#ffffff", 3, "center");
      drawText(g, "CLICK THE PAGE OR PRESS P", W / 2, 100, "#c8c8d0", 1, "center");
    }
  }

  private drawCrosshair(): void {
    const g = this.g, x = Math.round(this.aim.x), y = Math.round(this.aim.y);
    let col = "#ffffff";
    const t = this.targetAt(x, y);
    if (t === "zed") col = "#ff3a3a"; else if (t === "surv") col = "#7fd4ff"; else if (t === "glob") col = "#b8ff6a"; else if (t === "item") col = "#ffd84a";
    const gap = 3 + this.recoil * 4 + (this.weapon === "shotgun" ? 5 : 0);
    for (const [c, o] of [["rgba(0,0,0,0.8)", 1], [col, 0]] as const) {
      g.fillStyle = c;
      g.fillRect(x - gap - 5 + o, y + o, 5, 1); g.fillRect(x + gap + 1 + o, y + o, 5, 1);
      g.fillRect(x + o, y - gap - 5 + o, 1, 5); g.fillRect(x + o, y + gap + 1 + o, 1, 5);
      g.fillRect(x + o, y + o, 1, 1);
    }
    if (this.hitMark > 0) {
      g.strokeStyle = this.hitKill ? "#ff3030" : "#ffffff"; g.lineWidth = 1; g.beginPath();
      const r = this.hitKill ? 7 : 5;
      g.moveTo(x - r, y - r); g.lineTo(x - 2, y - 2); g.moveTo(x + r, y - r); g.lineTo(x + 2, y - 2);
      g.moveTo(x - r, y + r); g.lineTo(x - 2, y + 2); g.moveTo(x + r, y + r); g.lineTo(x + 2, y + 2); g.stroke();
    }
    // reload ring around the crosshair, with the perfect-reload window
    if (this.reloadT >= 0) {
      const r = 11;
      g.lineWidth = 2;
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = this.reloadTried ? "rgba(255,90,80,0.9)" : "rgba(255,216,74,0.95)";
      g.beginPath(); g.arc(x, y, r, -Math.PI / 2 + this.sweet[0] * Math.PI * 2, -Math.PI / 2 + this.sweet[1] * Math.PI * 2); g.stroke();
      g.strokeStyle = "#ffffff"; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + this.reloadT * Math.PI * 2); g.stroke();
      g.lineWidth = 1;
    }
    if (this.ammo[this.weapon] === 0 && this.reloadT < 0 && Math.sin(this.t * 10) > 0) drawText(g, "R", x + 8, y + 6, "#ff5050", 1);
  }
  private targetAt(x: number, y: number): "zed" | "surv" | "glob" | "item" | null {
    for (const gl of this.globs) { const p = this.P(gl.x, gl.y, gl.z); if (p && Math.hypot(x - p.x, y - p.y) < Math.max(4, 0.4 * p.s)) return "glob"; }
    for (const s of this.survs) { if (s.st !== "run") continue; const p = this.P(s.x, 0, s.z); if (p && Math.abs(x - p.x) < 0.26 * p.s && y < p.y && y > p.y - 1.72 * p.s) return "surv"; }
    for (const z of this.zeds) if (z.st !== "dead" && this.zedHit(z, x, y)) return "zed";
    if (this.boss && this.bossHit(this.boss, x, y)) return "zed";
    for (const pk of this.pickups) { const p = this.P(pk.x, pk.y, pk.z); if (p && Math.abs(x - p.x) < Math.max(5, 0.45 * p.s) && Math.abs(y - p.y) < Math.max(5, 0.45 * p.s)) return "item"; }
    return null;
  }

  // ================= HUD snapshot for the Text.js cells =================
  hud(): Hud {
    const w = WEAPONS[this.weapon];
    const b = this.boss;
    let boss: Hud["boss"] = null;
    if (b && b.st !== "dead") {
      const pts = b.phase === 1 ? b.points : [b.core];
      boss = { name: b.def.name, frac: pts.reduce((s, p) => s + Math.max(0, p.hp), 0) / pts.reduce((s, p) => s + p.max, 0) };
    }
    return {
      mode: this.mode, stage: this.stage.name, score: this.score, best: Math.max(this.best, this.score), chain: this.chain, mult: this.mult(), chainT: this.chainT,
      hp: this.hp, maxHp: this.maxHp, weapon: w.name, ammo: this.ammo[this.weapon], mag: w.mag,
      reserve: this.reserve[this.weapon] === Infinity ? null : this.reserve[this.weapon],
      reload: this.reloadT >= 0 ? this.reloadT : null, sweet: this.sweet, golden: this.golden, boss, muted: this.audio.muted, paused: this.paused,
    };
  }

  /** For tests and the curious: `__deadSignal.debug()` in the console. */
  debug(): Record<string, unknown> {
    return { mode: this.mode, stage: this.si, event: this.ei, ev: this.ev?.t, camZ: this.cam.z, zeds: this.zeds.length, hp: this.hp, score: this.score, stats: this.stats };
  }
  /** Test helper: aim at the nearest live target's head and fire. */
  autoShoot(): boolean {
    if (this.mode !== "play") return false;
    if (this.globs.length) { const gl = this.globs[0]!; const p = this.P(gl.x, gl.y, gl.z); if (p) { this.aim = { x: p.x, y: p.y }; this.press(); this.release(); return true; } }
    const live = this.zeds.filter((z) => z.st !== "dead" && z.st !== "enter").sort((a, b) => a.z - b.z);
    if (live.length) {
      const z = live[0]!, h = this.zedParts(z).find((p) => p.part === "head") ?? this.zedParts(z)[0];
      if (h) { this.aim = { x: (h.x0 + h.x1) / 2, y: (h.y0 + h.y1) / 2 }; this.press(); this.release(); return true; }
    }
    if (this.boss && this.boss.st !== "dead" && this.boss.st !== "intro") {
      const b = this.boss, q = this.bossParts(b)!;
      if (b.st === "windup" && b.fist > 0) { this.aim = this.fistPos(b, q); }
      else { const w = (b.phase === 1 ? b.points.find((p) => p.hp > 0) : b.core)!; this.aim = { x: q.cx + w.ox * q.s, y: q.fy - w.oy * q.s }; }
      this.press(); this.release(); return true;
    }
    return false;
  }
}
