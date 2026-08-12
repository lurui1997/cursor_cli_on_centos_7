import { AudioEngine } from './audio';
import { ACHIEVEMENTS } from './data/achievements';
import { COMPOUNDS, ELEMENTS, findCompound } from './data/elements';
import { ENEMIES, scaledEnemyHp, scaledEnemySpeed, WAVES } from './data/enemies';
import { gridToWorld, isPathCell, PATH, positionOnPath, worldToGrid } from './path';
import type {
  AchievementToast,
  Banner,
  DamageTag,
  ElementId,
  EnemyInstance,
  EnemyKind,
  FloatingText,
  GamePhase,
  GameStats,
  ImpactRing,
  ParticleInstance,
  ProjectileInstance,
  StatusEffect,
  TowerInstance,
} from './types';

/** Kills within this window keep a combo chain alive. */
const COMBO_WINDOW = 2.4;

let nextId = 1;
function uid(): number {
  return nextId++;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function damageMultiplier(tags: DamageTag[], enemy: EnemyInstance): number {
  const def = ENEMIES[enemy.kind];
  let mul = 1;
  for (const tag of tags) {
    if (def.weaknesses.includes(tag)) mul += 0.55;
    if (def.resistances.includes(tag)) mul -= 0.35;
  }
  return Math.max(0.35, mul);
}

export class Game {
  readonly width = 960;
  readonly height = 540;

  readonly audio = new AudioEngine();

  phase: GamePhase = 'title';
  stats: GameStats = Game.freshStats();

  selectedElement: ElementId | null = 'H';
  hoveredCell: { gx: number; gy: number } | null = null;
  selectedTowerId: number | null = null;

  towers: TowerInstance[] = [];
  enemies: EnemyInstance[] = [];
  projectiles: ProjectileInstance[] = [];
  particles: ParticleInstance[] = [];
  floaters: FloatingText[] = [];
  rings: ImpactRing[] = [];
  banner: Banner | null = null;
  /** Drained by the UI layer so achievements can be shown as DOM toasts. */
  pendingToasts: AchievementToast[] = [];

  private spawnQueue: Array<{ at: number; kind: keyof typeof ENEMIES }> = [];
  private waveTime = 0;
  private betweenWaves = 0;
  private awaitingNextWave = false;
  private reactionFlash = 0;
  private comboTimer = 0;
  private shake = 0;
  private leaksThisWave = 0;
  private hitFlashById = new Map<number, number>();
  private seenFacts = new Set<string>();

  private static freshStats(): GameStats {
    return {
      wave: 0,
      energy: 150,
      lives: 16,
      score: 0,
      factsUnlocked: [],
      lastReaction: null,
      combo: 0,
      maxCombo: 0,
      kills: 0,
      leaks: 0,
      compoundsBuilt: [],
      achievements: [],
      factsSeen: 0,
    };
  }

  start(): void {
    this.phase = 'playing';
    this.stats = Game.freshStats();
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];
    this.rings = [];
    this.banner = null;
    this.pendingToasts = [];
    this.spawnQueue = [];
    this.waveTime = 0;
    this.betweenWaves = 0;
    this.awaitingNextWave = true;
    this.comboTimer = 0;
    this.shake = 0;
    this.leaksThisWave = 0;
    this.hitFlashById.clear();
    this.seenFacts.clear();
    this.selectedElement = 'H';
    this.unlockFact('欢迎来到元素防线：用真实化学反应守护实验室。');
  }

  togglePause(): void {
    if (this.phase === 'playing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'playing';
  }

  selectElement(id: ElementId): void {
    this.selectedElement = id;
    this.selectedTowerId = null;
  }

  pointerMove(x: number, y: number): void {
    this.hoveredCell = worldToGrid(x, y);
  }

  pointerLeave(): void {
    this.hoveredCell = null;
  }

  tryPlace(x: number, y: number): void {
    if (this.phase !== 'playing') return;
    const cell = worldToGrid(x, y);
    if (!cell) return;
    if (isPathCell(cell.gx, cell.gy)) {
      this.pushFloater(x, y, '管道上无法放置', '#fca5a5');
      this.audio.play('deny');
      return;
    }

    const existing = this.towers.find((t) => t.gridX === cell.gx && t.gridY === cell.gy);
    if (existing) {
      this.selectedTowerId = existing.id;
      if (existing.elementId) {
        this.unlockFact(ELEMENTS[existing.elementId].fact);
      } else if (existing.compoundId) {
        this.unlockFact(COMPOUNDS[existing.compoundId].fact);
      }
      return;
    }

    if (!this.selectedElement) return;
    const def = ELEMENTS[this.selectedElement];
    if (this.stats.energy < def.cost) {
      this.pushFloater(x, y, `还差 ${def.cost - this.stats.energy} 能量`, '#fcd34d');
      this.audio.play('deny');
      return;
    }

    this.stats.energy -= def.cost;
    const tower: TowerInstance = {
      id: uid(),
      gridX: cell.gx,
      gridY: cell.gy,
      elementId: this.selectedElement,
      cooldown: 0.2,
      angle: 0,
      recoil: 0,
      age: 0,
    };
    this.towers.push(tower);
    this.selectedTowerId = tower.id;
    this.unlockFact(def.fact);

    const pos = gridToWorld(cell.gx, cell.gy);
    this.spawnBurst(pos.x, pos.y, def.glow, 8);
    this.pushRing(pos.x, pos.y, 34, def.glow, 0.35, 2);
    this.audio.play('place');
    this.trySynthesize(tower);
  }

  sellSelected(): void {
    if (this.phase !== 'playing' || this.selectedTowerId == null) return;
    const idx = this.towers.findIndex((t) => t.id === this.selectedTowerId);
    if (idx < 0) return;
    const tower = this.towers[idx];
    let refund = 20;
    if (tower.elementId) refund = Math.floor(ELEMENTS[tower.elementId].cost * 0.6);
    if (tower.compoundId) {
      const c = COMPOUNDS[tower.compoundId];
      refund = Math.floor(
        (ELEMENTS[c.ingredients[0]].cost + ELEMENTS[c.ingredients[1]].cost) * 0.55,
      );
    }
    this.stats.energy += refund;
    const pos = gridToWorld(tower.gridX, tower.gridY);
    this.pushFloater(pos.x, pos.y, `+${refund} 能量`, '#5eead4');
    this.pushRing(pos.x, pos.y, 30, '#5eead4', 0.3, 2);
    this.audio.play('sell');
    this.towers.splice(idx, 1);
    this.selectedTowerId = null;
  }

  private trySynthesize(placed: TowerInstance): void {
    if (!placed.elementId) return;
    const neighbors = this.towers.filter((t) => {
      if (t.id === placed.id || !t.elementId) return false;
      const dx = Math.abs(t.gridX - placed.gridX);
      const dy = Math.abs(t.gridY - placed.gridY);
      return dx + dy === 1;
    });

    for (const other of neighbors) {
      if (!other.elementId || !placed.elementId) continue;
      const compound = findCompound(placed.elementId, other.elementId);
      if (!compound) continue;

      const pos = gridToWorld(placed.gridX, placed.gridY);
      placed.compoundId = compound.id;
      placed.elementId = undefined;
      this.towers = this.towers.filter((t) => t.id !== other.id);
      this.stats.score += 50;
      this.stats.lastReaction = compound.equation;
      this.reactionFlash = 2.4;
      this.unlockFact(compound.fact);

      if (!this.stats.compoundsBuilt.includes(compound.id)) {
        this.stats.compoundsBuilt.push(compound.id);
      }

      this.pushFloater(pos.x, pos.y - 22, `合成 ${compound.formula}`, compound.glow, 1.5);
      this.spawnBurst(pos.x, pos.y, compound.glow, 18);
      this.spawnTextParticle(pos.x, pos.y - 40, compound.equation, compound.color);
      this.pushRing(pos.x, pos.y, 70, compound.glow, 0.55, 3);
      this.pushRing(pos.x, pos.y, 46, '#ffffff', 0.35, 2);
      this.addShake(5);
      this.audio.play('synth');
      this.showBanner(`${compound.formula} · ${compound.name}`, compound.equation, compound.glow);

      this.checkAchievements();
      break;
    }
  }

  update(dt: number): void {
    if (this.phase !== 'playing') return;

    this.reactionFlash = Math.max(0, this.reactionFlash - dt);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.waveTime += dt;

    if (this.stats.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.stats.combo = 0;
    }

    if (this.awaitingNextWave) {
      this.betweenWaves += dt;
      if (this.betweenWaves >= (this.stats.wave === 0 ? 0.6 : 3.2)) {
        this.beginNextWave();
      }
    }

    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTime) {
      const spawn = this.spawnQueue.shift()!;
      this.spawnEnemy(spawn.kind);
    }

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateFloaters(dt);
    this.updateRings(dt);
    this.updateBanner(dt);
    this.decayHitFlashes(dt);

    if (
      !this.awaitingNextWave &&
      this.spawnQueue.length === 0 &&
      this.enemies.every((e) => !e.alive)
    ) {
      if (this.stats.wave >= WAVES.length) {
        this.phase = 'won';
        this.unlockFact('你用元素周期表的智慧守住了实验室。化学，既是武器也是诗。');
        this.audio.play('victory');
      } else {
        this.completeWave();
      }
    }

    if (this.stats.lives <= 0) {
      this.phase = 'lost';
      this.audio.play('defeat');
    }

    this.checkAchievements();
  }

  private completeWave(): void {
    this.awaitingNextWave = true;
    this.betweenWaves = 0;

    const bonus = 25 + this.stats.wave * 5;
    const flawless = this.leaksThisWave === 0;
    const total = flawless ? bonus + 40 : bonus;
    this.stats.energy += total;
    this.stats.score += flawless ? 120 : 60;

    this.showBanner(
      flawless ? `第 ${this.stats.wave} 波 · 零泄漏` : `第 ${this.stats.wave} 波清空`,
      `+${total} 能量${flawless ? ' · 完美防守奖励' : ''}`,
      flawless ? '#fde68a' : '#5eead4',
    );
    this.pushFloater(this.width / 2, 100, `+${total} 能量`, '#5eead4', 1.3);
    this.audio.play('wave');

    if (flawless) this.grantAchievement('flawlessWave');
    this.leaksThisWave = 0;
  }

  private beginNextWave(): void {
    this.awaitingNextWave = false;
    this.betweenWaves = 0;
    this.stats.wave += 1;
    const wave = WAVES[this.stats.wave - 1];
    if (!wave) return;
    this.waveTime = 0;
    this.spawnQueue = [];
    const adapted = this.aiAdaptWave(wave.entries.map((e) => e.kind));
    let adaptNote: string | null = null;
    for (let ei = 0; ei < wave.entries.length; ei++) {
      const entry = wave.entries[ei];
      const kind = adapted.kinds[ei] ?? entry.kind;
      if (kind !== entry.kind) adaptNote = adapted.reason;
      for (let i = 0; i < entry.count; i++) {
        this.spawnQueue.push({
          at: wave.delay + (entry.offset ?? 0) + i * entry.interval,
          kind,
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.leaksThisWave = 0;
    this.showBanner(
      `第 ${this.stats.wave} 波 / ${WAVES.length}`,
      adaptNote ? 'AI 导演调整了反应物配比' : '反应开始',
      adaptNote ? '#fbbf24' : '#fde68a',
    );
    this.audio.play('wave', 1.12);
    if (adaptNote) this.unlockFact(adaptNote);
  }

  /** Lightweight director: bias spawns toward chemistries that challenge the player's current kit. */
  private aiAdaptWave(kinds: EnemyKind[]): { kinds: EnemyKind[]; reason: string } {
    if (this.stats.wave < 3 || this.towers.length === 0) {
      return { kinds, reason: '' };
    }
    const tagCount = new Map<DamageTag, number>();
    for (const tower of this.towers) {
      const tags = tower.compoundId
        ? COMPOUNDS[tower.compoundId].tags
        : tower.elementId
          ? ELEMENTS[tower.elementId].tags
          : [];
      for (const tag of tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }

    const counters: Array<{ tag: DamageTag; enemy: EnemyKind; reason: string }> = [
      { tag: 'base', enemy: 'alkalineSludge', reason: 'AI 观察到你偏爱碱性塔，改派碱液检验你的酸中和能力。' },
      { tag: 'acid', enemy: 'acidMist', reason: 'AI 发现酸性火力充足，于是增加酸雾——请用碱去中和。' },
      { tag: 'oxidation', enemy: 'heavyMetal', reason: '氧化路线很强，AI 改派重金属，提醒你沉淀与络合。' },
      { tag: 'cryogenic', enemy: 'methane', reason: '低温塔偏多，AI 派出甲烷火团：燃烧需要氧气。' },
      { tag: 'reduction', enemy: 'methane', reason: '还原氛围浓厚，AI 引入可燃物考验氧化能力。' },
    ];

    let best = counters[0];
    let bestScore = -1;
    for (const c of counters) {
      const score = tagCount.get(c.tag) ?? 0;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (bestScore <= 0) return { kinds, reason: '' };

    const next = kinds.map((k, i) => (i % 2 === 0 && k !== 'isotope' ? best.enemy : k));
    return { kinds: next, reason: best.reason };
  }

  private spawnEnemy(kind: keyof typeof ENEMIES): void {
    const def = ENEMIES[kind];
    const hp = scaledEnemyHp(def.hp, this.stats.wave);
    const start = positionOnPath(0).pos;
    this.enemies.push({
      id: uid(),
      kind,
      pathIndex: 0,
      progress: 0,
      x: start.x,
      y: start.y,
      hp,
      maxHp: hp,
      speedMul: 1,
      statuses: [],
      alive: true,
    });
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      let speedFactor = 1;
      const nextStatuses: typeof enemy.statuses = [];
      for (const st of enemy.statuses) {
        const remaining = st.remaining - dt;
        if (remaining <= 0) continue;
        nextStatuses.push({ ...st, remaining });
        if (st.type === 'burn' || st.type === 'corrode' || st.type === 'poison') {
          enemy.hp -= st.strength * dt;
        }
        if (st.type === 'slow' || st.type === 'freeze') {
          speedFactor *= 1 - st.strength;
        }
        if (st.type === 'pull') {
          enemy.progress = Math.max(0, enemy.progress - st.strength * 40 * dt);
        }
      }
      enemy.statuses = nextStatuses;
      enemy.speedMul = Math.max(0.15, speedFactor);

      if (enemy.hp <= 0) {
        this.killEnemy(enemy, true);
        continue;
      }

      const def = ENEMIES[enemy.kind];
      const speed = scaledEnemySpeed(def.speed, this.stats.wave) * enemy.speedMul;
      enemy.progress += speed * dt;
      const along = positionOnPath(enemy.progress);
      enemy.x = along.pos.x;
      enemy.y = along.pos.y;
      enemy.pathIndex = along.index;
      if (along.done) {
        enemy.alive = false;
        this.stats.lives -= enemy.kind === 'isotope' ? 3 : 1;
        this.stats.leaks += 1;
        this.leaksThisWave += 1;
        this.stats.combo = 0;
        this.pushFloater(enemy.x - 40, enemy.y - 30, '突破防线', '#fb7185', 1.3);
        this.pushRing(enemy.x, enemy.y, 60, '#fb7185', 0.45, 3);
        this.addShake(8);
        this.audio.play('leak');
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.hp > -999);
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      tower.recoil = Math.max(0, tower.recoil - dt * 5);
      tower.age += dt;
      const combat = this.towerCombatStats(tower);
      if (!combat) continue;

      let best: EnemyInstance | null = null;
      let bestDist = Infinity;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const d = dist(combat.x, combat.y, enemy.x, enemy.y);
        if (d <= combat.range && d < bestDist) {
          best = enemy;
          bestDist = d;
        }
      }
      if (!best) continue;
      tower.angle = Math.atan2(best.y - combat.y, best.x - combat.x);
      if (tower.cooldown > 0) continue;

      tower.cooldown = 1 / combat.fireRate;
      tower.recoil = 1;
      this.fireProjectile(best, combat);
    }
  }

  private towerCombatStats(tower: TowerInstance): {
    x: number;
    y: number;
    range: number;
    fireRate: number;
    damage: number;
    speed: number;
    color: string;
    tags: DamageTag[];
    splash: number;
    status?: { type: StatusEffect; duration: number; strength: number };
    equation?: string;
  } | null {
    const pos = gridToWorld(tower.gridX, tower.gridY);
    if (tower.compoundId) {
      const c = COMPOUNDS[tower.compoundId];
      return {
        x: pos.x,
        y: pos.y,
        range: c.range,
        fireRate: c.fireRate,
        damage: c.damage,
        speed: 360,
        color: c.color,
        tags: c.tags,
        splash: c.splash ?? 0,
        status: c.status,
        equation: c.equation,
      };
    }
    if (tower.elementId) {
      const e = ELEMENTS[tower.elementId];
      return {
        x: pos.x,
        y: pos.y,
        range: e.range,
        fireRate: e.fireRate,
        damage: e.damage,
        speed: e.projectileSpeed,
        color: e.color,
        tags: e.tags,
        splash: e.splash ?? 0,
        status: e.status,
      };
    }
    return null;
  }

  private fireProjectile(
    target: EnemyInstance,
    combat: NonNullable<ReturnType<Game['towerCombatStats']>>,
  ): void {
    const dx = target.x - combat.x;
    const dy = target.y - combat.y;
    const len = Math.hypot(dx, dy) || 1;
    this.projectiles.push({
      id: uid(),
      x: combat.x,
      y: combat.y,
      vx: (dx / len) * combat.speed,
      vy: (dy / len) * combat.speed,
      targetId: target.id,
      damage: combat.damage,
      tags: combat.tags,
      color: combat.color,
      splash: combat.splash,
      status: combat.status,
      life: 2.5,
      equation: combat.equation,
    });
    if (combat.equation) {
      this.stats.lastReaction = combat.equation;
      this.reactionFlash = Math.max(this.reactionFlash, 1.2);
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      p.life -= dt;
      const target = this.enemies.find((e) => e.id === p.targetId && e.alive);
      if (target) {
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = Math.hypot(p.vx, p.vy);
        p.vx = (dx / len) * speed;
        p.vy = (dy / len) * speed;
        if (len < 14) {
          this.hitEnemy(target, p);
          p.life = 0;
          continue;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private hitEnemy(enemy: EnemyInstance, projectile: ProjectileInstance): void {
    let anyCrit = false;

    const apply = (e: EnemyInstance, falloff: number) => {
      const mul = damageMultiplier(projectile.tags, e) * falloff;
      const dmg = projectile.damage * mul;
      const crit = mul > 1.2;
      anyCrit ||= crit;
      e.hp -= dmg;
      this.hitFlashById.set(e.id, 0.16);
      // Scatter numbers so simultaneous hits on one enemy stay readable.
      this.pushFloater(
        e.x + (Math.random() - 0.5) * 26,
        e.y - 10 - Math.random() * 10,
        crit ? `克制 ${Math.round(dmg)}` : `${Math.round(dmg)}`,
        crit ? '#4ade80' : '#e2e8f0',
        crit ? 1.25 : 1,
      );
      if (projectile.status) {
        e.statuses.push({
          type: projectile.status.type,
          remaining: projectile.status.duration,
          strength: projectile.status.strength,
        });
      }
      if (e.hp <= 0) this.killEnemy(e, true);
    };

    apply(enemy, 1);
    this.spawnBurst(enemy.x, enemy.y, projectile.color, 5);
    this.pushRing(enemy.x, enemy.y, anyCrit ? 30 : 20, projectile.color, 0.24, anyCrit ? 2.5 : 1.5);
    // Equations are flavour, not feedback: showing one per hit buries the damage numbers.
    if (projectile.equation && Math.random() < 0.12) {
      this.spawnTextParticle(enemy.x, enemy.y - 30, projectile.equation, projectile.color);
    }
    this.audio.play(anyCrit ? 'crit' : 'hit');

    if (projectile.splash > 0) {
      this.pushRing(enemy.x, enemy.y, projectile.splash, projectile.color, 0.3, 1.5);
      for (const other of this.enemies) {
        if (!other.alive || other.id === enemy.id) continue;
        const d = dist(other.x, other.y, enemy.x, enemy.y);
        if (d <= projectile.splash) {
          apply(other, 1 - (d / projectile.splash) * 0.55);
        }
      }
    }
  }

  private killEnemy(enemy: EnemyInstance, reward: boolean): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    const def = ENEMIES[enemy.kind];
    const isBoss = enemy.kind === 'isotope';

    if (reward) {
      this.stats.kills += 1;
      this.stats.combo += 1;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
      this.comboTimer = COMBO_WINDOW;

      const multiplier = this.comboMultiplier();
      const energy = Math.round(def.reward * multiplier);
      this.stats.energy += energy;
      this.stats.score += Math.round(def.reward * 2 * multiplier);
      this.unlockFact(def.fact);

      this.pushFloater(enemy.x, enemy.y - 26, `+${energy}`, '#5eead4');
      // Only celebrate round-number milestones; the HUD counter covers the rest.
      if (this.stats.combo >= 5 && this.stats.combo % 5 === 0) {
        this.pushFloater(
          enemy.x,
          enemy.y - 44,
          `${this.stats.combo} 连击 ×${multiplier.toFixed(1)}`,
          '#fde68a',
          1.2,
        );
      }
    }

    this.spawnBurst(enemy.x, enemy.y, def.color, isBoss ? 34 : 12);
    this.pushRing(enemy.x, enemy.y, isBoss ? 140 : 44, def.color, isBoss ? 0.7 : 0.32, isBoss ? 4 : 2);

    if (isBoss) {
      this.addShake(14);
      this.audio.play('boss');
      this.showBanner('首领衰变完成', '不稳定核素已被压制', '#f97316');
      this.grantAchievement('bossDown');
    } else {
      this.audio.play('kill', 1 + Math.min(this.stats.combo, 12) * 0.04);
    }
  }

  /** Combo pays out up to +100% energy and score, ramping every kill. */
  comboMultiplier(): number {
    return Math.min(2, 1 + Math.max(0, this.stats.combo - 1) * 0.05);
  }

  comboTimeRatio(): number {
    return this.stats.combo > 0 ? Math.max(0, this.comboTimer / COMBO_WINDOW) : 0;
  }

  private checkAchievements(): void {
    if (this.stats.compoundsBuilt.length >= 1) this.grantAchievement('firstSynthesis');
    if (this.stats.compoundsBuilt.length >= 6) this.grantAchievement('allCompounds');
    if (this.stats.maxCombo >= 10) this.grantAchievement('combo10');
    if (this.stats.maxCombo >= 25) this.grantAchievement('combo25');
    if (this.stats.factsSeen >= 12) this.grantAchievement('scholar');
    if (this.stats.energy >= 400) this.grantAchievement('stockpile');
  }

  private grantAchievement(id: string): void {
    if (this.stats.achievements.includes(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;

    this.stats.achievements.push(id);
    this.stats.energy += def.reward;
    this.stats.score += def.reward * 3;
    this.pendingToasts.push({
      id: def.id,
      badge: def.badge,
      name: def.name,
      desc: def.desc,
      reward: def.reward,
    });
    this.audio.play('achievement');
    this.addShake(4);
  }

  totalAchievements(): number {
    return ACHIEVEMENTS.length;
  }

  drainToasts(): AchievementToast[] {
    const out = this.pendingToasts;
    this.pendingToasts = [];
    return out;
  }

  private spawnBurst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private spawnTextParticle(x: number, y: number, text: string, color: string): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -28,
      life: 1.4,
      maxLife: 1.4,
      color,
      size: 1,
      text,
    });
  }

  private pushFloater(x: number, y: number, text: string, color: string, scale = 1): void {
    this.floaters.push({
      x,
      y,
      text,
      color,
      life: 1.2,
      maxLife: 1.2,
      scale,
    });
  }

  private pushRing(
    x: number,
    y: number,
    maxRadius: number,
    color: string,
    life: number,
    width: number,
  ): void {
    this.rings.push({ x, y, radius: 0, maxRadius, life, maxLife: life, color, width });
  }

  private addShake(amount: number): void {
    this.shake = Math.min(16, this.shake + amount);
  }

  private showBanner(title: string, subtitle: string, color: string): void {
    this.banner = { title, subtitle, color, life: 2.2, maxLife: 2.2 };
  }

  private updateRings(dt: number): void {
    for (const ring of this.rings) {
      ring.life -= dt;
      const progress = 1 - Math.max(0, ring.life) / ring.maxLife;
      ring.radius = ring.maxRadius * (1 - Math.pow(1 - progress, 3));
    }
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  private updateBanner(dt: number): void {
    if (!this.banner) return;
    this.banner.life -= dt;
    if (this.banner.life <= 0) this.banner = null;
  }

  private decayHitFlashes(dt: number): void {
    for (const [id, remaining] of this.hitFlashById) {
      const next = remaining - dt;
      if (next <= 0) this.hitFlashById.delete(id);
      else this.hitFlashById.set(id, next);
    }
  }

  hitFlashFor(enemyId: number): number {
    return this.hitFlashById.get(enemyId) ?? 0;
  }

  getShake(): number {
    return this.shake;
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateFloaters(dt: number): void {
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 22 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  unlockFact(fact: string): void {
    if (this.seenFacts.has(fact)) return;
    this.seenFacts.add(fact);
    this.stats.factsSeen = this.seenFacts.size;
    this.stats.factsUnlocked.unshift(fact);
    if (this.stats.factsUnlocked.length > 8) this.stats.factsUnlocked.pop();
  }

  getSelectedTower() {
    return this.towers.find((t) => t.id === this.selectedTowerId) ?? null;
  }

  getPath() {
    return PATH;
  }

  waveProgressLabel(): string {
    if (this.phase === 'title') return '';
    if (this.awaitingNextWave && this.stats.wave > 0 && this.stats.wave < WAVES.length) {
      const left = Math.max(0, 3.2 - this.betweenWaves);
      return `下一波 ${left.toFixed(1)}s`;
    }
    if (this.stats.wave === 0) return '准备开始';
    return `波次 ${this.stats.wave} / ${WAVES.length}`;
  }

  getReactionFlash(): number {
    return this.reactionFlash;
  }
}
