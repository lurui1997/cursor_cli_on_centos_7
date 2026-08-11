import type { EnemyDef, EnemyKind, WaveSpec } from '../types';

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  acidMist: {
    kind: 'acidMist',
    name: '酸雾',
    formula: 'H₂SO₄(aq)',
    hp: 70,
    speed: 52,
    reward: 12,
    color: '#4ade80',
    radius: 14,
    weaknesses: ['base', 'precipitate'],
    resistances: ['acid'],
    fact: '硫酸是二元强酸，稀溶液仍有强腐蚀性——应对思路是中和。',
  },
  alkalineSludge: {
    kind: 'alkalineSludge',
    name: '碱液',
    formula: 'NaOH(aq)',
    hp: 90,
    speed: 42,
    reward: 14,
    color: '#fbbf24',
    radius: 16,
    weaknesses: ['acid', 'halogen'],
    resistances: ['base'],
    fact: '氢氧化钠是典型强碱，与酸发生中和反应生成盐和水。',
  },
  radical: {
    kind: 'radical',
    name: '自由基',
    formula: '·OH',
    hp: 45,
    speed: 88,
    reward: 10,
    color: '#f472b6',
    radius: 11,
    weaknesses: ['reduction', 'cryogenic'],
    resistances: ['toxic'],
    fact: '自由基含未成对电子，反应极快；抗氧化剂可提供电子使其稳定。',
  },
  heavyMetal: {
    kind: 'heavyMetal',
    name: '重金属离子',
    formula: 'Pb²⁺',
    hp: 130,
    speed: 36,
    reward: 18,
    color: '#a78bfa',
    radius: 17,
    weaknesses: ['precipitate', 'halogen', 'toxic'],
    resistances: ['physical'],
    fact: '重金属离子可用硫化物/氢氧化物沉淀从溶液中移除。',
  },
  methane: {
    kind: 'methane',
    name: '甲烷火团',
    formula: 'CH₄',
    hp: 80,
    speed: 60,
    reward: 15,
    color: '#fb7185',
    radius: 15,
    weaknesses: ['oxidation'],
    resistances: ['cryogenic', 'reduction'],
    fact: '甲烷完全燃烧：CH₄ + 2O₂ → CO₂ + 2H₂O，释放大量热能。',
  },
  isotope: {
    kind: 'isotope',
    name: '不稳定核素',
    formula: '²³⁸U*',
    hp: 420,
    speed: 28,
    reward: 80,
    color: '#f97316',
    radius: 22,
    weaknesses: ['oxidation', 'acid', 'precipitate', 'cryogenic'],
    resistances: [],
    fact: '不稳定同位素会衰变释放能量；在游戏里它是需要多重反应压制的首领。',
  },
};

export const WAVES: WaveSpec[] = [
  {
    delay: 1.2,
    entries: [{ kind: 'acidMist', count: 5, interval: 1.25 }],
  },
  {
    delay: 1.0,
    entries: [
      { kind: 'acidMist', count: 4, interval: 1.05 },
      { kind: 'radical', count: 3, interval: 0.8, offset: 2.5 },
    ],
  },
  {
    delay: 0.8,
    entries: [
      { kind: 'alkalineSludge', count: 6, interval: 1.0 },
      { kind: 'acidMist', count: 4, interval: 1.1, offset: 3 },
    ],
  },
  {
    delay: 0.8,
    entries: [
      { kind: 'methane', count: 5, interval: 0.9 },
      { kind: 'radical', count: 6, interval: 0.55, offset: 2 },
    ],
  },
  {
    delay: 0.7,
    entries: [
      { kind: 'heavyMetal', count: 5, interval: 1.15 },
      { kind: 'alkalineSludge', count: 4, interval: 1.0, offset: 2.5 },
    ],
  },
  {
    delay: 0.6,
    entries: [
      { kind: 'methane', count: 6, interval: 0.75 },
      { kind: 'heavyMetal', count: 4, interval: 1.0, offset: 2 },
      { kind: 'radical', count: 8, interval: 0.45, offset: 4 },
    ],
  },
  {
    delay: 0.5,
    entries: [
      { kind: 'acidMist', count: 8, interval: 0.7 },
      { kind: 'alkalineSludge', count: 6, interval: 0.85, offset: 1.5 },
      { kind: 'heavyMetal', count: 4, interval: 1.0, offset: 4 },
    ],
  },
  {
    delay: 0.4,
    entries: [
      { kind: 'isotope', count: 1, interval: 0 },
      { kind: 'radical', count: 10, interval: 0.4, offset: 2 },
      { kind: 'methane', count: 6, interval: 0.8, offset: 5 },
      { kind: 'heavyMetal', count: 4, interval: 1.1, offset: 7 },
    ],
  },
];

export function scaledEnemyHp(base: number, wave: number): number {
  return Math.round(base * (1 + (wave - 1) * 0.18));
}

export function scaledEnemySpeed(base: number, wave: number): number {
  return base * (1 + (wave - 1) * 0.04);
}
