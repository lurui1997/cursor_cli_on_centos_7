import './style.css';
import { ELEMENT_ORDER, ELEMENTS, COMPOUNDS } from './game/data/elements';
import { Game } from './game/Game';
import { Renderer } from './game/Renderer';
import type { ElementId } from './game/types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <div class="shell">
    <header class="brand-bar">
      <div class="brand">
        <div class="brand-mark">
          <span class="brand-orb" aria-hidden="true"></span>
          <h1>元素防线</h1>
        </div>
        <p>Elemental Bastion —— 用元素与化合反应守护实验室，在对战中感受化学之美。</p>
      </div>
      <div class="stats" id="stats">
        <div class="stat"><span>能量</span><strong id="stat-energy">150</strong></div>
        <div class="stat"><span>生命</span><strong id="stat-lives">16</strong></div>
        <div class="stat"><span>分数</span><strong id="stat-score">0</strong></div>
        <div class="stat"><span>波次</span><strong id="stat-wave">—</strong></div>
      </div>
    </header>

    <div class="stage-wrap">
      <canvas id="game" width="960" height="540" aria-label="元素防线游戏画布"></canvas>
      <div class="overlay visible" id="overlay">
        <div class="overlay-card" id="overlay-card">
          <h2 id="overlay-title">元素防线</h2>
          <div class="formula" id="overlay-formula">ΔG &lt; 0 · 反应反应自发进行</div>
          <p id="overlay-body">
            放置元素塔攻击沿管道入侵的化学威胁。相邻可反应的元素会自动合成化合物，
            克制关系遵循真实化学直觉：碱克酸、氧化燃烧甲烷、硫沉淀重金属……
          </p>
          <div class="btn-row">
            <button class="btn-primary" id="btn-start" type="button">开始实验</button>
            <button class="btn-ghost" id="btn-how" type="button">玩法速览</button>
          </div>
        </div>
      </div>
    </div>

    <div class="bottom">
      <section class="panel">
        <h3>元素货架</h3>
        <div class="shop" id="shop"></div>
        <div class="controls">
          <button class="btn-ghost" id="btn-pause" type="button">暂停</button>
          <button class="btn-warn" id="btn-sell" type="button">出售选中塔</button>
        </div>
        <p class="hint">提示：将可反应的元素放在相邻格，即可合成更强的化合物塔。</p>
      </section>

      <section class="panel">
        <h3>反应日志 · 化学笔记</h3>
        <div class="reaction-line" id="reaction-line">等待第一次反应……</div>
        <div class="facts" id="facts"></div>
        <div class="detail" id="detail">选择元素查看性质；点击已放置的塔可复习知识点。</div>
      </section>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const overlayTitle = document.querySelector<HTMLHeadingElement>('#overlay-title')!;
const overlayBody = document.querySelector<HTMLParagraphElement>('#overlay-body')!;
const overlayFormula = document.querySelector<HTMLDivElement>('#overlay-formula')!;
const shop = document.querySelector<HTMLDivElement>('#shop')!;
const factsEl = document.querySelector<HTMLDivElement>('#facts')!;
const detailEl = document.querySelector<HTMLDivElement>('#detail')!;
const reactionLine = document.querySelector<HTMLDivElement>('#reaction-line')!;
const btnStart = document.querySelector<HTMLButtonElement>('#btn-start')!;
const btnHow = document.querySelector<HTMLButtonElement>('#btn-how')!;
const btnPause = document.querySelector<HTMLButtonElement>('#btn-pause')!;
const btnSell = document.querySelector<HTMLButtonElement>('#btn-sell')!;

const game = new Game();
const renderer = new Renderer(canvas);

function renderShop(): void {
  shop.innerHTML = ELEMENT_ORDER.map((id) => {
    const el = ELEMENTS[id];
    const selected = game.selectedElement === id ? 'selected' : '';
    const disabled = game.phase === 'playing' && game.stats.energy < el.cost ? 'disabled' : '';
    return `
      <button class="el-btn ${selected}" data-el="${id}" type="button" ${disabled}
        style="--c:${el.glow}">
        <span class="sym" style="color:${el.color}">${el.id}</span>
        <span class="meta">${el.name} · ${el.cost}能</span>
        <span class="meta">${el.tip}</span>
      </button>
    `;
  }).join('');
}

function updateDetail(): void {
  const tower = game.getSelectedTower();
  if (tower?.compoundId) {
    const c = COMPOUNDS[tower.compoundId];
    detailEl.innerHTML = `<strong>${c.formula} · ${c.name}</strong><br>${c.equation}<br>${c.fact}`;
    return;
  }
  if (tower?.elementId) {
    const e = ELEMENTS[tower.elementId];
    detailEl.innerHTML = `<strong>${e.id} ${e.name} (${e.nameEn}) · Z=${e.atomicNumber}</strong><br>${e.tip}<br>${e.fact}`;
    return;
  }
  if (game.selectedElement) {
    const e = ELEMENTS[game.selectedElement];
    detailEl.innerHTML = `<strong>${e.id} ${e.name}</strong><br>${e.tip}<br>${e.fact}`;
    return;
  }
  detailEl.textContent = '选择元素查看性质；点击已放置的塔可复习知识点。';
}

function updateFacts(): void {
  factsEl.innerHTML = game.stats.factsUnlocked
    .slice(0, 5)
    .map((f) => `<div class="fact">${f}</div>`)
    .join('');
}

function updateStats(): void {
  document.querySelector('#stat-energy')!.textContent = String(game.stats.energy);
  document.querySelector('#stat-lives')!.textContent = String(Math.max(0, game.stats.lives));
  document.querySelector('#stat-score')!.textContent = String(game.stats.score);
  document.querySelector('#stat-wave')!.textContent = game.waveProgressLabel() || '—';
  reactionLine.textContent = game.stats.lastReaction ?? '等待第一次反应……';
}

function showOverlay(title: string, body: string, formula: string, primaryLabel: string): void {
  overlayTitle.textContent = title;
  overlayBody.textContent = body;
  overlayFormula.textContent = formula;
  btnStart.textContent = primaryLabel;
  overlay.classList.add('visible');
}

function hideOverlay(): void {
  overlay.classList.remove('visible');
}

function syncOverlay(): void {
  if (game.phase === 'title') {
    showOverlay(
      '元素防线',
      '放置元素塔攻击沿管道入侵的化学威胁。相邻可反应的元素会自动合成化合物，克制关系遵循真实化学直觉。',
      'ΔG < 0 · 正向反应自发进行',
      '开始实验',
    );
  } else if (game.phase === 'paused') {
    showOverlay('实验暂停', '反应仍在容器中蓄势。准备好后继续。', '系统处于准稳态', '继续');
  } else if (game.phase === 'won') {
    showOverlay(
      '防线稳固',
      `最终得分 ${game.stats.score}。你用周期表的逻辑完成了这场实验。`,
      '产率 100% · 反应完成',
      '再来一局',
    );
  } else if (game.phase === 'lost') {
    showOverlay(
      '反应失控',
      '有害物种突破了实验室。调整元素搭配与合成路线，再试一次。',
      '产率 0% · 需要重新设计',
      '重新开始',
    );
  } else {
    hideOverlay();
  }
}

shop.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-el]');
  if (!btn) return;
  game.selectElement(btn.dataset.el as ElementId);
  renderShop();
  updateDetail();
});

btnStart.addEventListener('click', () => {
  if (game.phase === 'paused') {
    game.togglePause();
  } else {
    game.start();
  }
  syncOverlay();
  renderShop();
  updateFacts();
  updateDetail();
});

btnHow.addEventListener('click', () => {
  overlayBody.textContent =
    '① 从货架选择元素并在网格放置（避开绿色管道）。② H+O、Na+Cl、H+Cl、C+O、Fe+O、S+O 相邻可合成。③ 观察克制：碱打酸雾、酸打碱液、氧烧甲烷、硫沉重金属。④ 出售回收能量，读右侧笔记巩固知识。';
  overlayFormula.textContent = '玩法 = 策略 × 化学亲和性';
});

btnPause.addEventListener('click', () => {
  if (game.phase === 'playing' || game.phase === 'paused') {
    game.togglePause();
    syncOverlay();
  }
});

btnSell.addEventListener('click', () => {
  game.sellSelected();
  updateStats();
  updateDetail();
  renderShop();
});

function canvasPos(ev: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * game.width;
  const y = ((ev.clientY - rect.top) / rect.height) * game.height;
  return { x, y };
}

canvas.addEventListener('pointermove', (ev) => {
  const { x, y } = canvasPos(ev);
  game.pointerMove(x, y);
});

canvas.addEventListener('pointerleave', () => game.pointerLeave());

canvas.addEventListener('pointerdown', (ev) => {
  if (game.phase !== 'playing') return;
  const { x, y } = canvasPos(ev);
  game.tryPlace(x, y);
  renderShop();
  updateDetail();
  updateFacts();
  updateStats();
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'p' || ev.key === 'P') {
    if (game.phase === 'playing' || game.phase === 'paused') {
      game.togglePause();
      syncOverlay();
    }
  }
  if (ev.key === 'Escape') {
    game.selectedTowerId = null;
    updateDetail();
  }
});

let last = performance.now();
let prevPhase = game.phase;
let prevFacts = 0;
let prevEnergy = -1;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderer.draw(game, dt);

  if (game.phase !== prevPhase) {
    prevPhase = game.phase;
    syncOverlay();
  }
  if (game.stats.factsUnlocked.length !== prevFacts) {
    prevFacts = game.stats.factsUnlocked.length;
    updateFacts();
  }
  if (game.stats.energy !== prevEnergy) {
    prevEnergy = game.stats.energy;
    renderShop();
  }
  updateStats();
  requestAnimationFrame(frame);
}

renderShop();
updateDetail();
syncOverlay();
requestAnimationFrame(frame);
