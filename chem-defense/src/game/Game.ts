import { COMPOUNDS, ELEMENTS, findCompound } from './data/elements';
import { ENEMIES, scaledEnemyHp, scaledEnemySpeed, WAVES } from './data/enemies';
import { gridToWorld, isPathCell, PATH, positionOnPath, worldToGrid } from './path';
import type {
  DamageTag,
  ElementId,
  EnemyInstance,
  EnemyKind,
  FloatingText,
  GamePhase,
  GameStats,
  ParticleInstance,
  ProjectileInstance,
  StatusEffect,
  TowerInstance,
} from './types';

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

  phase: GamePhase = 'title';
  stats: GameStats = {
    wave: 0,
    energy: 120,
    lives: 12,
    score: 0,
    factsUnlocked: [],
    lastReaction: null,
  };

  selectedElement: ElementId | null = 'H';
  hoveredCell: { gx: number; gy: number } | null = null;
  selectedTowerId: number | null = null;

  towers: TowerInstance[] = [];
  enemies: EnemyInstance[] = [];
  projectiles: ProjectileInstance[] = [];
  particles: ParticleInstance[] = [];
  floaters: FloatingText[] = [];

  private spawnQueue: Array<{ at: number; kind: keyof typeof ENEMIES }> = [];
  private waveTime = 0;
  private betweenWaves = 0;
  private awaitingNextWave = false;
  private reactionFlash = 0;

  start(): void {
    this.phase = 'playing';
    this.stats = {
      wave: 0,
      energy: 120,
      lives: 12,
      score: 0,
      factsUnlocked: [],
      lastReaction: null,
    };
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];
    this.spawnQueue = [];
    this.waveTime = 0;
    this.betweenWaves = 0;
    this.awaitingNextWave = true;
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
      this.pushFloater(x, y, '路径上无法放置', '#fca5a5');
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
      this.pushFloater(x, y, '能量不足', '#fcd34d');
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
    };
    this.towers.push(tower);
    this.selectedTowerId = tower.id;
    this.unlockFact(def.fact);
    this.spawnBurst(gridToWorld(cell.gx, cell.gy).x, gridToWorld(cell.gx, cell.gy).y, def.glow, 10);
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
      this.pushFloater(pos.x, pos.y - 20, `合成 ${compound.formula}！`, compound.glow);
      this.spawnBurst(pos.x, pos.y, compound.glow, 22);
      this.spawnTextParticle(pos.x, pos.y - 36, compound.equation, compound.color);
      break;
    }
  }

  update(dt: number): void {
    if (this.phase !== 'playing') return;

    this.reactionFlash = Math.max(0, this.reactionFlash - dt);
    this.waveTime += dt;

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

    if (
      !this.awaitingNextWave &&
      this.spawnQueue.length === 0 &&
      this.enemies.every((e) => !e.alive)
    ) {
      if (this.stats.wave >= WAVES.length) {
        this.phase = 'won';
        this.unlockFact('你用元素周期表的智慧守住了实验室。化学，既是武器也是诗。');
      } else {
        this.awaitingNextWave = true;
        this.betweenWaves = 0;
        this.stats.energy += 25 + this.stats.wave * 5;
        this.pushFloater(this.width / 2, 80, '波次清理完毕 · 能量补给', '#5eead4');
      }
    }

    if (this.stats.lives <= 0) {
      this.phase = 'lost';
    }
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
    this.pushFloater(this.width / 2, 64, `第 ${this.stats.wave} 波反应开始`, '#fde68a');
    if (adaptNote) {
      this.unlockFact(adaptNote);
      this.pushFloater(this.width / 2, 96, 'AI 导演调整了反应物', '#fbbf24');
    }
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
        this.pushFloater(enemy.x, enemy.y, '突破防线！', '#fb7185');
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.hp > -999);
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
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
    const apply = (e: EnemyInstance, falloff: number) => {
      const mul = damageMultiplier(projectile.tags, e) * falloff;
      const dmg = projectile.damage * mul;
      e.hp -= dmg;
      this.pushFloater(
        e.x,
        e.y - 10,
        mul > 1.2 ? `克制 ${Math.round(dmg)}` : `${Math.round(dmg)}`,
        mul > 1.2 ? '#4ade80' : '#e2e8f0',
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
    this.spawnBurst(enemy.x, enemy.y, projectile.color, 8);
    if (projectile.equation) {
      this.spawnTextParticle(enemy.x, enemy.y - 24, projectile.equation, projectile.color);
    }

    if (projectile.splash > 0) {
      for (const other of this.enemies) {
        if (!other.alive || other.id === enemy.id) continue;
        const d = dist(other.x, other.y, enemy.x, enemy.y);
        if (d <= projectile.splash) {
          apply(other, 1 - d / projectile.splash * 0.55);
        }
      }
    }
  }

  private killEnemy(enemy: EnemyInstance, reward: boolean): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    const def = ENEMIES[enemy.kind];
    if (reward) {
      this.stats.energy += def.reward;
      this.stats.score += def.reward * 2;
      this.unlockFact(def.fact);
    }
    this.spawnBurst(enemy.x, enemy.y, def.color, 16);
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

  private pushFloater(x: number, y: number, text: string, color: string): void {
    this.floaters.push({
      x,
      y,
      text,
      color,
      life: 1.2,
      maxLife: 1.2,
    });
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
    if (this.stats.factsUnlocked.includes(fact)) return;
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
