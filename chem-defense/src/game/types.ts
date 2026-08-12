export type ElementId = 'H' | 'O' | 'Na' | 'Cl' | 'Fe' | 'C' | 'N' | 'S';

export type EnemyKind =
  | 'acidMist'
  | 'alkalineSludge'
  | 'radical'
  | 'heavyMetal'
  | 'methane'
  | 'isotope';

export type DamageTag =
  | 'oxidation'
  | 'acid'
  | 'base'
  | 'halogen'
  | 'reduction'
  | 'cryogenic'
  | 'toxic'
  | 'physical'
  | 'precipitate';

export type StatusEffect =
  | 'burn'
  | 'corrode'
  | 'slow'
  | 'freeze'
  | 'poison'
  | 'pull';

export interface Vec2 {
  x: number;
  y: number;
}

export interface ElementDef {
  id: ElementId;
  name: string;
  nameEn: string;
  atomicNumber: number;
  cost: number;
  range: number;
  fireRate: number;
  damage: number;
  projectileSpeed: number;
  color: string;
  glow: string;
  tags: DamageTag[];
  splash?: number;
  status?: { type: StatusEffect; duration: number; strength: number };
  fact: string;
  tip: string;
}

export interface CompoundDef {
  id: string;
  formula: string;
  name: string;
  ingredients: [ElementId, ElementId];
  damage: number;
  range: number;
  fireRate: number;
  color: string;
  glow: string;
  tags: DamageTag[];
  splash?: number;
  status?: { type: StatusEffect; duration: number; strength: number };
  equation: string;
  fact: string;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  formula: string;
  hp: number;
  speed: number;
  reward: number;
  color: string;
  radius: number;
  weaknesses: DamageTag[];
  resistances: DamageTag[];
  fact: string;
}

export interface WaveSpec {
  delay: number;
  entries: Array<{ kind: EnemyKind; count: number; interval: number; offset?: number }>;
}

export interface LevelDef {
  id: string;
  number: number;
  name: string;
  subtitle: string;
  description: string;
  path: Vec2[];
  waves: WaveSpec[];
  startingEnergy: number;
  startingLives: number;
  hpScale: number;
  speedScale: number;
  accent: string;
  recommended: string;
}

export interface TowerInstance {
  id: number;
  gridX: number;
  gridY: number;
  elementId?: ElementId;
  compoundId?: string;
  cooldown: number;
  angle: number;
  /** 0..1 muzzle kick that decays after each shot. */
  recoil: number;
  /** Seconds since placement, used for the pop-in animation. */
  age: number;
  level: number;
  invested: number;
}

export interface EnemyInstance {
  id: number;
  kind: EnemyKind;
  pathIndex: number;
  progress: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speedMul: number;
  statuses: Array<{ type: StatusEffect; remaining: number; strength: number }>;
  alive: boolean;
}

export interface ProjectileInstance {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetId: number;
  damage: number;
  tags: DamageTag[];
  color: string;
  splash: number;
  status?: { type: StatusEffect; duration: number; strength: number };
  life: number;
  equation?: string;
}

export interface ParticleInstance {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  text?: string;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

/** Expanding outline used for hit, kill and synthesis feedback. */
export interface ImpactRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

export interface AchievementDef {
  id: string;
  badge: string;
  name: string;
  desc: string;
  reward: number;
}

export interface AchievementToast {
  id: string;
  badge: string;
  name: string;
  desc: string;
  reward: number;
}

/** Full-width celebratory banner shown on wave clear and milestones. */
export interface Banner {
  title: string;
  subtitle: string;
  color: string;
  life: number;
  maxLife: number;
}

export type GamePhase = 'title' | 'playing' | 'paused' | 'won' | 'lost';

export type GameSpeed = 1 | 2 | 5 | 10;

export const GAME_SPEEDS: GameSpeed[] = [1, 2, 5, 10];

export interface GameStats {
  wave: number;
  energy: number;
  lives: number;
  score: number;
  factsUnlocked: string[];
  lastReaction: string | null;
  combo: number;
  maxCombo: number;
  kills: number;
  leaks: number;
  compoundsBuilt: string[];
  achievements: string[];
  factsSeen: number;
}
