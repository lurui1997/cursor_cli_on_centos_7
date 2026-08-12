import { COMPOUNDS, ELEMENTS } from './data/elements';
import { ENEMIES } from './data/enemies';
import { GRID, gridToWorld, isPathCell } from './path';
import type { Game } from './Game';

function hexAlpha(hex: string, a: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const INK = '#04171b';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private t = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
  }

  draw(game: Game, dt: number): void {
    this.t += dt;
    const ctx = this.ctx;
    const { width: w, height: h } = game;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.drawBackground(w, h);

    const shake = game.getShake();
    if (shake > 0.1) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    this.drawGrid();
    this.drawPath(game);
    this.drawPlacementHint(game);
    this.drawTowers(game);
    this.drawEnemies(game);
    this.drawProjectiles(game);
    this.drawRings(game);
    this.drawParticles(game);
    this.drawFloaters(game);

    if (shake > 0.1) ctx.restore();

    this.drawReactionFlash(game);
    this.drawDangerVignette(game);
    this.drawCombo(game);
    this.drawBanner(game);
    this.drawSpeedBadge(game);
    this.drawPauseState(game);
  }

  /** Fast-forward needs a persistent marker; players forget they left it on. */
  private drawSpeedBadge(game: Game): void {
    if (game.phase !== 'playing' || game.gameSpeed === 1) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(52, game.height - 30);

    ctx.fillStyle = 'rgba(3, 20, 24, 0.8)';
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-34, -15, 68, 30, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde68a';
    ctx.font = '800 15px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${game.gameSpeed}× 加速`, 0, 1);
    ctx.restore();
  }

  private drawPauseState(game: Game): void {
    if (game.phase !== 'paused') return;
    const ctx = this.ctx;
    const { width: w, height: h } = game;

    ctx.save();
    ctx.fillStyle = 'rgba(3, 16, 20, 0.55)';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = 'rgba(3, 20, 24, 0.9)';
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-150, -46, 300, 92, 14);
    ctx.fill();
    ctx.stroke();

    // Pause glyph
    ctx.fillStyle = '#5eead4';
    ctx.fillRect(-13, -26, 8, 26);
    ctx.fillRect(5, -26, 8, 26);

    ctx.fillStyle = '#e8fffb';
    ctx.font = '800 17px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('已暂停', 0, 14);

    ctx.fillStyle = 'rgba(139, 178, 174, 0.9)';
    ctx.font = '600 11px Sora, sans-serif';
    ctx.fillText('点击画面或按 P 继续', 0, 33);
    ctx.restore();
  }

  /** Flat two-stop wash; detail lives on the play layer, not the backdrop. */
  private drawBackground(w: number, h: number): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#072226');
    g.addColorStop(1, '#04151a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(94,234,212,0.06)';
    ctx.lineWidth = 1;
    for (let gy = 0; gy < GRID.rows; gy++) {
      for (let gx = 0; gx < GRID.cols; gx++) {
        if (isPathCell(gx, gy)) continue;
        const x = GRID.originX + gx * GRID.cell;
        const y = GRID.originY + gy * GRID.cell;
        ctx.strokeRect(x + 0.5, y + 0.5, GRID.cell - 1, GRID.cell - 1);
      }
    }
    ctx.restore();
  }

  private drawPath(game: Game): void {
    const ctx = this.ctx;
    const path = game.getPath();
    const accent = game.selectedLevel.accent;
    const trace = () => {
      ctx.beginPath();
      path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    };

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = hexAlpha(accent, 0.28);
    ctx.lineWidth = 40;
    trace();
    ctx.stroke();

    ctx.setLineDash([12, 18]);
    ctx.lineDashOffset = -this.t * 46;
    ctx.strokeStyle = hexAlpha(accent, 0.65);
    ctx.lineWidth = 2;
    trace();
    ctx.stroke();
    ctx.restore();
  }

  private drawPlacementHint(game: Game): void {
    if (!game.hoveredCell || game.phase !== 'playing' || !game.selectedElement) return;
    const { gx, gy } = game.hoveredCell;
    const occupied = game.towers.some((t) => t.gridX === gx && t.gridY === gy);
    const blocked = isPathCell(gx, gy) || occupied;
    const affordable = game.stats.energy >= ELEMENTS[game.selectedElement].cost;
    const pos = gridToWorld(gx, gy);
    const ctx = this.ctx;
    const def = ELEMENTS[game.selectedElement];
    const ok = !blocked && affordable;
    const tint = ok ? def.glow : '#fb7185';

    ctx.save();
    ctx.strokeStyle = hexAlpha(tint, 0.9);
    ctx.lineWidth = 2;
    ctx.setLineDash(ok ? [] : [5, 4]);
    ctx.beginPath();
    ctx.roundRect(
      GRID.originX + gx * GRID.cell + 5,
      GRID.originY + gy * GRID.cell + 5,
      GRID.cell - 10,
      GRID.cell - 10,
      10,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hexAlpha(tint, 0.12);
    ctx.fill();

    if (ok) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, def.range, 0, Math.PI * 2);
      ctx.strokeStyle = hexAlpha(def.color, 0.28);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = hexAlpha(def.color, 0.55);
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.id, pos.x, pos.y);
    }
    ctx.restore();
  }

  private drawTowers(game: Game): void {
    const ctx = this.ctx;
    for (const tower of game.towers) {
      const pos = gridToWorld(tower.gridX, tower.gridY);
      const selected = tower.id === game.selectedTowerId;
      const compound = tower.compoundId ? COMPOUNDS[tower.compoundId] : null;
      const element = tower.elementId ? ELEMENTS[tower.elementId] : null;

      const label = compound?.formula ?? element?.id ?? '?';
      const color = compound?.color ?? element?.color ?? '#ffffff';
      const glow = compound?.glow ?? element?.glow ?? '#5eead4';
      const baseRange = compound?.range ?? element?.range ?? 100;
      const range = baseRange * (1 + (tower.level - 1) * 0.1);
      const radius = (compound ? 19 : 16) + (tower.level - 1) * 2;
      const pop = Math.min(1, tower.age / 0.28);
      const scale = 0.6 + easeOut(pop) * 0.4;

      if (selected) {
        ctx.save();
        ctx.strokeStyle = hexAlpha(glow, 0.3);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -this.t * 18;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.scale(scale, scale);

      // Muzzle kick: nudge the whole unit backwards from its aim direction.
      const kick = tower.recoil * 3;
      ctx.translate(-Math.cos(tower.angle) * kick, -Math.sin(tower.angle) * kick);

      ctx.fillStyle = hexAlpha(color, 0.95);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = selected ? '#fde68a' : hexAlpha(glow, 0.85);
      ctx.lineWidth = selected ? 3 : 2;
      ctx.stroke();

      if (compound) {
        ctx.strokeStyle = hexAlpha(glow, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (tower.recoil > 0.05) {
        ctx.fillStyle = hexAlpha('#ffffff', tower.recoil * 0.5);
        ctx.beginPath();
        ctx.arc(Math.cos(tower.angle) * (radius + 5), Math.sin(tower.angle) * (radius + 5), 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = INK;
      ctx.font = compound
        ? 'bold 11px "JetBrains Mono", monospace'
        : 'bold 15px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);

      if (tower.level > 1) {
        const dotGap = 6;
        const startX = -((tower.level - 1) * dotGap) / 2;
        ctx.fillStyle = '#fde68a';
        for (let i = 0; i < tower.level; i++) {
          ctx.beginPath();
          ctx.arc(startX + i * dotGap, radius + 7, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  private drawEnemies(game: Game): void {
    const ctx = this.ctx;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      const def = ENEMIES[enemy.kind];
      const flash = game.hitFlashFor(enemy.id);

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      if (flash > 0) ctx.scale(1 + flash, 1 + flash);

      ctx.fillStyle = flash > 0 ? '#ffffff' : def.color;
      ctx.beginPath();
      if (enemy.kind === 'isotope') {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + this.t * 0.6;
          const r = i % 2 === 0 ? def.radius : def.radius * 0.6;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else if (enemy.kind === 'radical') {
        ctx.arc(0, 0, def.radius, 0, Math.PI * 2);
      } else {
        ctx.roundRect(-def.radius, -def.radius * 0.8, def.radius * 2, def.radius * 1.6, 7);
      }
      ctx.fill();

      ctx.fillStyle = INK;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.formula, 0, 0);
      ctx.restore();

      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      if (ratio < 1) {
        const bw = def.radius * 2.2;
        const bx = enemy.x - bw / 2;
        const by = enemy.y - def.radius - 11;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = ratio > 0.4 ? '#5eead4' : '#fb7185';
        ctx.fillRect(bx, by, bw * ratio, 3);
      }

      if (enemy.statuses.length) {
        ctx.fillStyle = 'rgba(253, 230, 138, 0.85)';
        ctx.font = '8px Sora, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          enemy.statuses.map((s) => s.type[0].toUpperCase()).join(''),
          enemy.x,
          enemy.y + def.radius + 10,
        );
      }
    }
  }

  private drawProjectiles(game: Game): void {
    const ctx = this.ctx;
    for (const p of game.projectiles) {
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const tailX = p.x - (p.vx / speed) * 10;
      const tailY = p.y - (p.vy / speed) * 10;

      ctx.strokeStyle = hexAlpha(p.color, 0.4);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRings(game: Game): void {
    const ctx = this.ctx;
    for (const ring of game.rings) {
      const a = Math.max(0, ring.life / ring.maxLife);
      ctx.strokeStyle = hexAlpha(ring.color, a * 0.7);
      ctx.lineWidth = ring.width * a;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawParticles(game: Game): void {
    const ctx = this.ctx;
    for (const p of game.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      if (p.text) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      } else {
        ctx.fillStyle = hexAlpha(p.color, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawFloaters(game: Game): void {
    const ctx = this.ctx;
    for (const f of game.floaters) {
      const a = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(f.x, f.y);
      ctx.scale(f.scale, f.scale);
      ctx.fillStyle = f.color;
      ctx.font = '700 12px Sora, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  private drawReactionFlash(game: Game): void {
    const flash = game.getReactionFlash();
    if (flash <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(0.14, flash * 0.07);
    ctx.fillStyle = '#5eead4';
    ctx.fillRect(0, 0, game.width, game.height);
    ctx.restore();
  }

  /** Pulsing red edge when the lab is close to being overrun. */
  private drawDangerVignette(game: Game): void {
    if (game.phase !== 'playing' || game.stats.lives > 5) return;
    const ctx = this.ctx;
    const intensity =
      (1 - game.stats.lives / 6) * 0.26 + 0.05 + Math.sin(this.t * 4) * 0.04;
    const g = ctx.createRadialGradient(
      game.width / 2,
      game.height / 2,
      game.height * 0.55,
      game.width / 2,
      game.height / 2,
      game.height * 0.95,
    );
    g.addColorStop(0, 'rgba(251,113,133,0)');
    g.addColorStop(1, `rgba(251,113,133,${Math.max(0, intensity).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, game.width, game.height);
  }

  private drawCombo(game: Game): void {
    const combo = game.stats.combo;
    if (combo < 3) return;
    const ctx = this.ctx;
    const x = game.width - 74;
    const y = 62;
    const ratio = game.comboTimeRatio();
    const punch = 1 + Math.max(0, 0.25 - (1 - ratio)) * 1.2;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(punch, punch);

    ctx.fillStyle = '#fde68a';
    ctx.font = '800 34px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${combo}`, 0, 0);

    ctx.fillStyle = 'rgba(253,230,138,0.8)';
    ctx.font = '700 11px Sora, sans-serif';
    ctx.fillText(`连击 ×${game.comboMultiplier().toFixed(1)}`, 0, 24);
    ctx.restore();

    // Draining timer arc
    ctx.strokeStyle = 'rgba(253,230,138,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
  }

  private drawBanner(game: Game): void {
    const banner = game.banner;
    if (!banner) return;
    const ctx = this.ctx;
    const age = 1 - banner.life / banner.maxLife;
    const slide = easeOut(Math.min(1, age * 6));
    const fade = banner.life < 0.5 ? banner.life / 0.5 : 1;
    const y = 96;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(game.width / 2, y - (1 - slide) * 24);

    ctx.fillStyle = 'rgba(3, 20, 24, 0.82)';
    ctx.strokeStyle = hexAlpha(banner.color, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-190, -34, 380, 68, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = banner.color;
    ctx.font = '800 20px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(banner.title, 0, -8);

    ctx.fillStyle = 'rgba(232,255,251,0.75)';
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillText(banner.subtitle, 0, 15);
    ctx.restore();
  }
}
