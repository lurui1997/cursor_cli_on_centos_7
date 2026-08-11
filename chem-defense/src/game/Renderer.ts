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

    ctx.clearRect(0, 0, w, h);
    this.drawBackground(w, h);
    this.drawGrid();
    this.drawPath(game);
    this.drawPlacementHint(game);
    this.drawTowers(game);
    this.drawEnemies(game);
    this.drawProjectiles(game);
    this.drawParticles(game);
    this.drawFloaters(game);
    this.drawLabGlow(game);
  }

  private drawBackground(w: number, h: number): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#04191d');
    g.addColorStop(0.45, '#0a2f33');
    g.addColorStop(1, '#071820');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Molecular lattice
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#5eead4';
    ctx.lineWidth = 1;
    const spacing = 48;
    for (let x = 20; x < w; x += spacing) {
      for (let y = 20; y < h; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = '#99f6e4';
        ctx.fill();
        if ((x / spacing + y / spacing) % 2 < 1) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + spacing, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + spacing);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Soft vignette light
    const radial = ctx.createRadialGradient(w * 0.7, h * 0.2, 20, w * 0.5, h * 0.5, w * 0.75);
    radial.addColorStop(0, 'rgba(45, 212, 191, 0.08)');
    radial.addColorStop(0.5, 'rgba(245, 158, 11, 0.04)');
    radial.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, w, h);
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.save();
    for (let gy = 0; gy < GRID.rows; gy++) {
      for (let gx = 0; gx < GRID.cols; gx++) {
        const x = GRID.originX + gx * GRID.cell;
        const y = GRID.originY + gy * GRID.cell;
        const blocked = isPathCell(gx, gy);
        ctx.strokeStyle = blocked ? 'rgba(251,113,133,0.08)' : 'rgba(94,234,212,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, GRID.cell - 1, GRID.cell - 1);
      }
    }
    ctx.restore();
  }

  private drawPath(game: Game): void {
    const ctx = this.ctx;
    const path = game.getPath();
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = 'rgba(15, 118, 110, 0.55)';
    ctx.lineWidth = 46;
    ctx.beginPath();
    path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    ctx.strokeStyle = 'rgba(45, 212, 191, 0.22)';
    ctx.lineWidth = 34;
    ctx.beginPath();
    path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    // Flow dashes
    ctx.setLineDash([10, 16]);
    ctx.lineDashOffset = -this.t * 40;
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
  }

  private drawPlacementHint(game: Game): void {
    if (!game.hoveredCell || game.phase !== 'playing' || !game.selectedElement) return;
    const { gx, gy } = game.hoveredCell;
    const occupied = game.towers.some((t) => t.gridX === gx && t.gridY === gy);
    const blocked = isPathCell(gx, gy) || occupied;
    const pos = gridToWorld(gx, gy);
    const ctx = this.ctx;
    const def = ELEMENTS[game.selectedElement];

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = blocked ? '#fb7185' : def.glow;
    ctx.beginPath();
    ctx.roundRect(
      GRID.originX + gx * GRID.cell + 4,
      GRID.originY + gy * GRID.cell + 4,
      GRID.cell - 8,
      GRID.cell - 8,
      10,
    );
    ctx.fill();

    if (!blocked) {
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, def.range, 0, Math.PI * 2);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTowers(game: Game): void {
    const ctx = this.ctx;
    for (const tower of game.towers) {
      const pos = gridToWorld(tower.gridX, tower.gridY);
      const selected = tower.id === game.selectedTowerId;
      let label = '?';
      let color = '#fff';
      let glow = '#5eead4';
      let range = 100;
      let sub = '';

      if (tower.elementId) {
        const e = ELEMENTS[tower.elementId];
        label = e.id;
        color = e.color;
        glow = e.glow;
        range = e.range;
        sub = String(e.atomicNumber);
      } else if (tower.compoundId) {
        const c = COMPOUNDS[tower.compoundId];
        label = c.formula;
        color = c.color;
        glow = c.glow;
        range = c.range;
        sub = c.name;
      }

      if (selected) {
        ctx.save();
        ctx.globalAlpha = 0.18 + Math.sin(this.t * 4) * 0.05;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, range, 0, Math.PI * 2);
        ctx.strokeStyle = glow;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Orbital rings
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(this.t * 0.8 + tower.angle);
      ctx.strokeStyle = hexAlpha(glow, 0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(1.2);
      ctx.strokeStyle = hexAlpha(color, 0.35);
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Core
      const grd = ctx.createRadialGradient(pos.x - 4, pos.y - 4, 2, pos.x, pos.y, 18);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.25, color);
      grd.addColorStop(1, hexAlpha(glow, 0.2));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, tower.compoundId ? 18 : 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = selected ? '#fde68a' : hexAlpha(glow, 0.8);
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.stroke();

      // Barrel
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(tower.angle);
      ctx.fillStyle = hexAlpha(color, 0.9);
      ctx.fillRect(8, -2.5, 14, 5);
      ctx.restore();

      ctx.fillStyle = '#042f2e';
      ctx.font = tower.compoundId
        ? 'bold 11px "JetBrains Mono", monospace'
        : 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pos.x, pos.y);

      ctx.fillStyle = hexAlpha(color, 0.85);
      ctx.font = '9px Sora, sans-serif';
      ctx.fillText(sub, pos.x, pos.y + 24);
    }
  }

  private drawEnemies(game: Game): void {
    const ctx = this.ctx;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      const def = ENEMIES[enemy.kind];
      const pulse = 1 + Math.sin(this.t * 6 + enemy.id) * 0.04;

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.scale(pulse, pulse);

      ctx.shadowColor = def.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = hexAlpha(def.color, 0.85);
      ctx.beginPath();
      if (enemy.kind === 'isotope') {
        ctx.moveTo(0, -def.radius);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? def.radius : def.radius * 0.55;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
      } else if (enemy.kind === 'radical') {
        ctx.arc(0, 0, def.radius, 0, Math.PI * 2);
      } else {
        ctx.roundRect(-def.radius, -def.radius * 0.85, def.radius * 2, def.radius * 1.7, 8);
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#041116';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.formula, 0, 0);
      ctx.restore();

      // HP bar
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      const bw = def.radius * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(enemy.x - bw / 2, enemy.y - def.radius - 12, bw, 4);
      ctx.fillStyle = ratio > 0.4 ? '#5eead4' : '#fb7185';
      ctx.fillRect(enemy.x - bw / 2, enemy.y - def.radius - 12, bw * ratio, 4);

      if (enemy.statuses.length) {
        ctx.fillStyle = '#fde68a';
        ctx.font = '8px Sora, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(enemy.statuses.map((s) => s.type[0].toUpperCase()).join(''), enemy.x, enemy.y + def.radius + 10);
      }
    }
  }

  private drawProjectiles(game: Game): void {
    const ctx = this.ctx;
    for (const p of game.projectiles) {
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
      ctx.fillStyle = f.color;
      ctx.font = '600 12px Sora, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  private drawLabGlow(game: Game): void {
    const flash = game.getReactionFlash();
    if (flash <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(0.25, flash * 0.12);
    ctx.fillStyle = '#5eead4';
    ctx.fillRect(0, 0, game.width, game.height);
    ctx.restore();
  }
}
