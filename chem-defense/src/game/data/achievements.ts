import type { AchievementDef } from '../types';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'firstSynthesis',
    badge: 'A+B',
    name: '初次反应',
    desc: '完成第一次化合物合成',
    reward: 30,
  },
  {
    id: 'allCompounds',
    badge: '6/6',
    name: '全谱合成',
    desc: '在一局中合成全部 6 种化合物',
    reward: 200,
  },
  {
    id: 'combo10',
    badge: 'x10',
    name: '链式反应',
    desc: '达成 10 连击',
    reward: 60,
  },
  {
    id: 'combo25',
    badge: 'x25',
    name: '雪崩效应',
    desc: '达成 25 连击',
    reward: 150,
  },
  {
    id: 'flawlessWave',
    badge: '0%',
    name: '零泄漏',
    desc: '无任何漏怪地清空一整波',
    reward: 50,
  },
  {
    id: 'bossDown',
    badge: 'U',
    name: '衰变终结',
    desc: '击溃不稳定核素首领',
    reward: 250,
  },
  {
    id: 'scholar',
    badge: 'Ph.D',
    name: '化学学者',
    desc: '解锁 12 条化学知识',
    reward: 80,
  },
  {
    id: 'stockpile',
    badge: 'ΔH',
    name: '高产率',
    desc: '能量储备一度超过 400',
    reward: 40,
  },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
