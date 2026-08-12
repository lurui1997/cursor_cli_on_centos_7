import { WAVES } from './enemies';
import type { EnemyKind, LevelDef, WaveSpec } from '../types';

function wave(
  entries: Array<[EnemyKind, number, number, number?]>,
  delay = 0.7,
): WaveSpec {
  return {
    delay,
    entries: entries.map(([kind, count, interval, offset]) => ({
      kind,
      count,
      interval,
      offset,
    })),
  };
}

const CORROSION_WAVES: WaveSpec[] = [
  wave([['acidMist', 6, 1.05]]),
  wave([['acidMist', 5, 0.9], ['radical', 4, 0.7, 2.2]]),
  wave([['alkalineSludge', 7, 0.9], ['acidMist', 5, 0.8, 2.5]]),
  wave([['radical', 10, 0.42], ['methane', 5, 0.85, 2]]),
  wave([['heavyMetal', 6, 1.0], ['alkalineSludge', 6, 0.8, 2]]),
  wave([['methane', 8, 0.65], ['radical', 8, 0.4, 2.5]]),
  wave([['heavyMetal', 7, 0.85], ['acidMist', 10, 0.55, 2]]),
  wave([['methane', 9, 0.55], ['alkalineSludge', 8, 0.65, 2], ['radical', 8, 0.38, 4]]),
  wave([['heavyMetal', 9, 0.7], ['methane', 10, 0.5, 2.5]]),
  wave([['isotope', 1, 0], ['heavyMetal', 8, 0.75, 2], ['radical', 14, 0.3, 4]]),
];

const REACTOR_WAVES: WaveSpec[] = [
  wave([['radical', 8, 0.58], ['acidMist', 5, 0.85, 2]]),
  wave([['methane', 7, 0.72], ['radical', 8, 0.4, 2.5]]),
  wave([['heavyMetal', 6, 0.95], ['alkalineSludge', 7, 0.72, 2]]),
  wave([['acidMist', 9, 0.6], ['methane', 8, 0.6, 2]]),
  wave([['radical', 14, 0.3], ['heavyMetal', 5, 0.85, 2.5]]),
  wave([['alkalineSludge', 10, 0.58], ['methane', 9, 0.52, 2]]),
  wave([['isotope', 1, 0], ['radical', 12, 0.32, 2]]),
  wave([['heavyMetal', 10, 0.68], ['acidMist', 12, 0.46, 2.5]]),
  wave([['methane', 13, 0.42], ['radical', 15, 0.28, 2]]),
  wave([['alkalineSludge', 12, 0.5], ['heavyMetal', 10, 0.62, 2.5]]),
  wave([['isotope', 2, 3], ['methane', 12, 0.42, 1.5]]),
  wave([
    ['isotope', 2, 4],
    ['heavyMetal', 12, 0.58, 1],
    ['radical', 18, 0.24, 3],
    ['methane', 14, 0.38, 5],
  ]),
];

export const LEVELS: LevelDef[] = [
  {
    id: 'foundation',
    number: 1,
    name: '基础实验室',
    subtitle: '酸碱初识',
    description: '路线宽松，适合掌握元素放置、相邻合成与克制关系。',
    path: [
      { x: -40, y: 270 },
      { x: 160, y: 270 },
      { x: 160, y: 120 },
      { x: 420, y: 120 },
      { x: 420, y: 400 },
      { x: 680, y: 400 },
      { x: 680, y: 200 },
      { x: 900, y: 200 },
      { x: 1000, y: 200 },
    ],
    waves: WAVES,
    startingEnergy: 150,
    startingLives: 16,
    hpScale: 1,
    speedScale: 1,
    accent: '#2dd4bf',
    recommended: '推荐：Na + Cl、H + O',
  },
  {
    id: 'corrosion',
    number: 2,
    name: '腐蚀回廊',
    subtitle: '沉淀与中和',
    description: '双折返路线压缩防区，重金属与酸碱混合波要求更完整的配方。',
    path: [
      { x: -40, y: 110 },
      { x: 280, y: 110 },
      { x: 280, y: 390 },
      { x: 520, y: 390 },
      { x: 520, y: 170 },
      { x: 760, y: 170 },
      { x: 760, y: 410 },
      { x: 1000, y: 410 },
    ],
    waves: CORROSION_WAVES,
    startingEnergy: 175,
    startingLives: 14,
    hpScale: 1.16,
    speedScale: 1.04,
    accent: '#a78bfa',
    recommended: '推荐：S + O、Na + Cl',
  },
  {
    id: 'reactor',
    number: 3,
    name: '临界反应堆',
    subtitle: '多重反应',
    description: '短路线、高密度与双首领终局，考验升级时机和全谱化合。',
    path: [
      { x: -40, y: 430 },
      { x: 200, y: 430 },
      { x: 200, y: 170 },
      { x: 390, y: 170 },
      { x: 390, y: 330 },
      { x: 590, y: 330 },
      { x: 590, y: 100 },
      { x: 810, y: 100 },
      { x: 810, y: 280 },
      { x: 1000, y: 280 },
    ],
    waves: REACTOR_WAVES,
    startingEnergy: 200,
    startingLives: 12,
    hpScale: 1.34,
    speedScale: 1.08,
    accent: '#f97316',
    recommended: '推荐：全谱化合 + 塔升级',
  },
];

export const LEVEL_BY_ID = new Map(LEVELS.map((level) => [level.id, level]));
