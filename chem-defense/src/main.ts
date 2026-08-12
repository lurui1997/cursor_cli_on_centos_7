import './style.css';
import { ACHIEVEMENTS } from './game/data/achievements';
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
        <p>用元素与化合反应守护实验室</p>
      </div>
      <div class="stats">
        <div class="stat" id="stat-energy-box"><span>能量</span><strong id="stat-energy">150</strong></div>
        <div class="stat" id="stat-lives-box"><span>生命</span><strong id="stat-lives">16</strong></div>
        <div class="stat"><span>分数</span><strong id="stat-score">0</strong></div>
        <div class="stat"><span>波次</span><strong id="stat-wave">—</strong></div>
      </div>
    </header>

    <div class="stage-wrap">
      <canvas id="game" width="960" height="540" aria-label="元素防线游戏画布"></canvas>
      <div class="toasts" id="toasts" aria-live="polite"></div>
      <div class="overlay visible" id="overlay">
        <div class="overlay-card">
          <h2 id="overlay-title">元素防线</h2>
          <div class="formula" id="overlay-formula">ΔG &lt; 0 · 正向反应自发进行</div>
          <p id="overlay-body">
            放置元素塔拦截入侵的化学威胁。相邻的可反应元素会自动合成化合物，
            克制关系遵循真实化学直觉。
          </p>
          <div id="overlay-summary" class="summary"></div>
          <div class="btn-row">
            <button class="btn-primary" id="btn-start" type="button">开始实验</button>
            <button class="btn-ghost" id="btn-how" type="button">玩法速览</button>
          </div>
        </div>
      </div>
    </div>

    <div class="bottom">
      <section class="panel">
        <div class="panel-head">
          <h3>元素货架</h3>
          <div class="controls">
            <button class="icon-btn" id="btn-sound" type="button" title="音效开关">音效 开</button>
            <button class="icon-btn" id="btn-pause" type="button">暂停</button>
            <button class="icon-btn warn" id="btn-sell" type="button">出售</button>
          </div>
        </div>
        <div class="shop" id="shop"></div>
        <div class="detail" id="detail">选择元素查看性质，点击已放置的塔可复习知识点。</div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>成就</h3>
          <span class="counter" id="ach-counter">0 / 8</span>
        </div>
        <div class="badges" id="badges"></div>
        <div class="reaction-line" id="reaction-line">等待第一次反应</div>
        <div class="facts" id="facts"></div>
      </section>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const overlayTitle = document.querySelector<HTMLHeadingElement>('#overlay-title')!;
const overlayBody = document.querySelector<HTMLParagraphElement>('#overlay-body')!;
const overlayFormula = document.querySelector<HTMLDivElement>('#overlay-formula')!;
const overlaySummary = document.querySelector<HTMLDivElement>('#overlay-summary')!;
const shop = document.querySelector<HTMLDivElement>('#shop')!;
const factsEl = document.querySelector<HTMLDivElement>('#facts')!;
const detailEl = document.querySelector<HTMLDivElement>('#detail')!;
const reactionLine = document.querySelector<HTMLDivElement>('#reaction-line')!;
const badgesEl = document.querySelector<HTMLDivElement>('#badges')!;
const achCounter = document.querySelector<HTMLSpanElement>('#ach-counter')!;
const toastsEl = document.querySelector<HTMLDivElement>('#toasts')!;
const energyBox = document.querySelector<HTMLDivElement>('#stat-energy-box')!;
const livesBox = document.querySelector<HTMLDivElement>('#stat-lives-box')!;
const btnStart = document.querySelector<HTMLButtonElement>('#btn-start')!;
const btnHow = document.querySelector<HTMLButtonElement>('#btn-how')!;
const btnPause = document.querySelector<HTMLButtonElement>('#btn-pause')!;
const btnSell = document.querySelector<HTMLButtonElement>('#btn-sell')!;
const btnSound = document.querySelector<HTMLButtonElement>('#btn-sound')!;

const game = new Game();
const renderer = new Renderer(canvas);

function renderShop(): void {
  shop.innerHTML = ELEMENT_ORDER.map((id) => {
    const el = ELEMENTS[id];
    const selected = game.selectedElement === id ? 'selected' : '';
    const poor = game.phase === 'playing' && game.stats.energy < el.cost ? 'poor' : '';
    return `
      <button class="el-btn ${selected} ${poor}" data-el="${id}" type="button">
        <span class="sym" style="color:${el.color}">${el.id}</span>
        <span class="meta">${el.name}</span>
        <span class="cost">${el.cost}</span>
      </button>
    `;
  }).join('');
}

function renderBadges(): void {
  badgesEl.innerHTML = ACHIEVEMENTS.map((a) => {
    const got = game.stats.achievements.includes(a.id);
    return `
      <div class="badge ${got ? 'earned' : ''}" title="${a.name}：${a.desc}">
        <span class="badge-mark">${a.badge}</span>
        <span class="badge-name">${got ? a.name : '未解锁'}</span>
      </div>
    `;
  }).join('');
  achCounter.textContent = `${game.stats.achievements.length} / ${game.totalAchievements()}`;
}

function updateDetail(): void {
  const tower = game.getSelectedTower();
  if (tower?.compoundId) {
    const c = COMPOUNDS[tower.compoundId];
    detailEl.innerHTML = `<strong>${c.formula} · ${c.name}</strong><br><code>${c.equation}</code><br>${c.fact}`;
    return;
  }
  if (tower?.elementId) {
    const e = ELEMENTS[tower.elementId];
    detailEl.innerHTML = `<strong>${e.id} ${e.name} · Z=${e.atomicNumber}</strong><br>${e.tip}<br>${e.fact}`;
    return;
  }
  if (game.selectedElement) {
    const e = ELEMENTS[game.selectedElement];
    detailEl.innerHTML = `<strong>${e.id} ${e.name} · ${e.cost} 能量</strong><br>${e.tip}`;
    return;
  }
  detailEl.textContent = '选择元素查看性质，点击已放置的塔可复习知识点。';
}

function updateFacts(): void {
  factsEl.innerHTML = game.stats.factsUnlocked
    .slice(0, 3)
    .map((f) => `<div class="fact">${f}</div>`)
    .join('');
}

function pulse(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function showToast(badge: string, name: string, desc: string, reward: number): void {
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `
    <span class="toast-badge">${badge}</span>
    <span class="toast-text">
      <strong>成就解锁 · ${name}</strong>
      <em>${desc} · +${reward} 能量</em>
    </span>
  `;
  toastsEl.appendChild(node);
  setTimeout(() => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 400);
  }, 3200);
}

function updateStats(): void {
  document.querySelector('#stat-energy')!.textContent = String(game.stats.energy);
  document.querySelector('#stat-lives')!.textContent = String(Math.max(0, game.stats.lives));
  document.querySelector('#stat-score')!.textContent = String(game.stats.score);
  document.querySelector('#stat-wave')!.textContent = game.waveProgressLabel() || '—';
  reactionLine.textContent = game.stats.lastReaction ?? '等待第一次反应';
  livesBox.classList.toggle('critical', game.phase === 'playing' && game.stats.lives <= 5);
}

function renderSummary(): void {
  const s = game.stats;
  const grade = s.leaks === 0 ? 'S' : s.leaks <= 3 ? 'A' : s.leaks <= 8 ? 'B' : 'C';
  overlaySummary.innerHTML = `
    <div class="summary-grade">评级 ${grade}</div>
    <div class="summary-grid">
      <div><span>分数</span><strong>${s.score}</strong></div>
      <div><span>击溃</span><strong>${s.kills}</strong></div>
      <div><span>最高连击</span><strong>${s.maxCombo}</strong></div>
      <div><span>合成化合物</span><strong>${s.compoundsBuilt.length} / 6</strong></div>
      <div><span>解锁知识</span><strong>${s.factsSeen}</strong></div>
      <div><span>成就</span><strong>${s.achievements.length} / ${game.totalAchievements()}</strong></div>
    </div>
  `;
  overlaySummary.classList.add('visible');
}

function showOverlay(title: string, body: string, formula: string, primaryLabel: string): void {
  overlayTitle.textContent = title;
  overlayBody.textContent = body;
  overlayFormula.textContent = formula;
  btnStart.textContent = primaryLabel;
  overlay.classList.add('visible');
}

function syncOverlay(): void {
  overlaySummary.classList.remove('visible');
  switch (game.phase) {
    case 'title':
      showOverlay(
        '元素防线',
        '放置元素塔拦截入侵的化学威胁。相邻的可反应元素会自动合成化合物，克制关系遵循真实化学直觉。',
        'ΔG < 0 · 正向反应自发进行',
        '开始实验',
      );
      break;
    case 'paused':
      showOverlay('实验暂停', '反应仍在容器中蓄势，准备好后继续。', '系统处于准稳态', '继续');
      break;
    case 'won':
      showOverlay('防线稳固', '你用周期表的逻辑完成了这场实验。', '产率 100% · 反应完成', '再来一局');
      renderSummary();
      break;
    case 'lost':
      showOverlay('反应失控', '有害物种突破了实验室，调整元素搭配再试一次。', '产率不足 · 需要重新设计', '重新开始');
      renderSummary();
      break;
    case 'playing':
      overlay.classList.remove('visible');
      break;
    default: {
      const exhaustive: never = game.phase;
      throw new Error(`Unhandled phase: ${String(exhaustive)}`);
    }
  }
}

shop.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-el]');
  if (!btn) return;
  const id = btn.dataset.el as ElementId;
  game.audio.unlock();
  if (game.phase === 'playing' && game.stats.energy < ELEMENTS[id].cost) {
    pulse(btn, 'shake');
    game.audio.play('deny');
  }
  game.selectElement(id);
  renderShop();
  updateDetail();
});

btnStart.addEventListener('click', () => {
  game.audio.unlock();
  if (game.phase === 'paused') {
    game.togglePause();
  } else {
    game.start();
  }
  syncOverlay();
  renderShop();
  renderBadges();
  updateFacts();
  updateDetail();
});

btnHow.addEventListener('click', () => {
  overlayBody.textContent =
    '① 选元素后点击网格空位放置（避开管道）。② H+O、Na+Cl、H+Cl、C+O、Fe+O、S+O 相邻自动合成。③ 克制关系：碱打酸雾、酸打碱液、氧烧甲烷、硫沉重金属。④ 连续击杀累积连击倍率，达成成就可获得能量奖励。';
  overlayFormula.textContent = '玩法 = 策略 × 化学亲和性';
});

btnPause.addEventListener('click', () => {
  if (game.phase === 'playing' || game.phase === 'paused') {
    game.togglePause();
    btnPause.textContent = game.phase === 'paused' ? '继续' : '暂停';
    syncOverlay();
  }
});

btnSell.addEventListener('click', () => {
  game.sellSelected();
  updateStats();
  updateDetail();
  renderShop();
});

btnSound.addEventListener('click', () => {
  game.audio.unlock();
  const next = !game.audio.isMuted();
  game.audio.setMuted(next);
  btnSound.textContent = next ? '音效 关' : '音效 开';
  btnSound.classList.toggle('off', next);
  if (!next) game.audio.play('place');
});

function canvasPos(ev: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * game.width,
    y: ((ev.clientY - rect.top) / rect.height) * game.height,
  };
}

canvas.addEventListener('pointermove', (ev) => {
  const { x, y } = canvasPos(ev);
  game.pointerMove(x, y);
});

canvas.addEventListener('pointerleave', () => game.pointerLeave());

canvas.addEventListener('pointerdown', (ev) => {
  if (game.phase !== 'playing') return;
  game.audio.unlock();
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
      btnPause.textContent = game.phase === 'paused' ? '继续' : '暂停';
      syncOverlay();
    }
  }
  if (ev.key === 'Escape') {
    game.selectedTowerId = null;
    updateDetail();
  }
  const index = Number(ev.key);
  if (Number.isInteger(index) && index >= 1 && index <= ELEMENT_ORDER.length) {
    game.selectElement(ELEMENT_ORDER[index - 1]);
    renderShop();
    updateDetail();
  }
});

let last = performance.now();
let prevPhase = game.phase;
let prevFacts = 0;
let prevEnergy = -1;
let prevAchievements = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderer.draw(game, dt);

  for (const toast of game.drainToasts()) {
    showToast(toast.badge, toast.name, toast.desc, toast.reward);
  }

  if (game.phase !== prevPhase) {
    prevPhase = game.phase;
    syncOverlay();
  }
  if (game.stats.factsUnlocked.length !== prevFacts) {
    prevFacts = game.stats.factsUnlocked.length;
    updateFacts();
  }
  if (game.stats.energy !== prevEnergy) {
    if (game.stats.energy > prevEnergy && prevEnergy >= 0) pulse(energyBox, 'bump');
    prevEnergy = game.stats.energy;
    renderShop();
  }
  if (game.stats.achievements.length !== prevAchievements) {
    prevAchievements = game.stats.achievements.length;
    renderBadges();
  }
  updateStats();
  requestAnimationFrame(frame);
}

renderShop();
renderBadges();
updateDetail();
syncOverlay();
requestAnimationFrame(frame);
