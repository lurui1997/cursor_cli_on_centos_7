import './style.css';
import { ACHIEVEMENTS } from './game/data/achievements';
import { ELEMENT_ORDER, ELEMENTS, COMPOUNDS } from './game/data/elements';
import { LEVELS } from './game/data/levels';
import { Game } from './game/Game';
import { Renderer } from './game/Renderer';
import type { ElementId, LevelDef } from './game/types';

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
          <div id="level-select" class="level-select"></div>
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
            <button class="icon-btn launch" id="btn-wave" type="button">开始第 1 波</button>
            <button class="icon-btn" id="btn-speed" type="button">1×</button>
            <button class="icon-btn" id="btn-sound" type="button" title="音效开关">音效 开</button>
            <button class="icon-btn" id="btn-pause" type="button">暂停</button>
            <button class="icon-btn upgrade" id="btn-upgrade" type="button">升级</button>
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
const levelSelect = document.querySelector<HTMLDivElement>('#level-select')!;
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
const btnWave = document.querySelector<HTMLButtonElement>('#btn-wave')!;
const btnSpeed = document.querySelector<HTMLButtonElement>('#btn-speed')!;
const btnUpgrade = document.querySelector<HTMLButtonElement>('#btn-upgrade')!;

const game = new Game();
const renderer = new Renderer(canvas);

const PROGRESS_KEY = 'elemental-bastion-level-progress-v1';

function loadProgress(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

let levelProgress = loadProgress();

function isLevelUnlocked(level: LevelDef): boolean {
  if (level.number === 1) return true;
  const previous = LEVELS[level.number - 2];
  return (levelProgress[previous.id] ?? 0) > 0;
}

function starsForCurrentRun(): number {
  if (game.stats.leaks === 0) return 3;
  if (game.stats.lives >= Math.ceil(game.selectedLevel.startingLives / 2)) return 2;
  return 1;
}

function saveLevelResult(): void {
  const stars = starsForCurrentRun();
  levelProgress[game.selectedLevel.id] = Math.max(levelProgress[game.selectedLevel.id] ?? 0, stars);
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(levelProgress));
  } catch {
    // The game remains playable when storage is disabled.
  }
}

function renderLevelSelect(): void {
  levelSelect.innerHTML = LEVELS.map((level) => {
    const unlocked = isLevelUnlocked(level);
    const selected = game.selectedLevel.id === level.id;
    const stars = levelProgress[level.id] ?? 0;
    return `
      <button class="level-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}"
        data-level="${level.id}" type="button" ${unlocked ? '' : 'disabled'}>
        <span class="level-number">${unlocked ? `0${level.number}` : '锁'}</span>
        <span class="level-copy">
          <strong>${level.name}</strong>
          <em>${level.subtitle} · ${level.waves.length} 波</em>
        </span>
        <span class="level-stars" aria-label="${stars} 星">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
      </button>
    `;
  }).join('');
}

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
    const next = tower.level < 3 ? ` · 升级 ${game.upgradeCost(tower)} 能量` : ' · 已满级';
    detailEl.innerHTML = `<strong>${c.formula} · ${c.name} · Lv.${tower.level}${next}</strong><br><code>${c.equation}</code><br>${c.fact}`;
    return;
  }
  if (tower?.elementId) {
    const e = ELEMENTS[tower.elementId];
    const next = tower.level < 3 ? ` · 升级 ${game.upgradeCost(tower)} 能量` : ' · 已满级';
    detailEl.innerHTML = `<strong>${e.id} ${e.name} · Lv.${tower.level}${next}</strong><br>${e.tip}<br>${e.fact}`;
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
  const waveReady = game.isWaveReady();
  btnWave.disabled = !waveReady;
  btnWave.classList.toggle('ready', waveReady);
  btnWave.textContent =
    game.stats.wave === 0 ? '开始第 1 波' : `开始第 ${game.stats.wave + 1} 波`;
  btnSpeed.textContent = `${game.gameSpeed}×`;
  const tower = game.getSelectedTower();
  btnUpgrade.disabled = !tower || tower.level >= 3 || game.phase !== 'playing';
  btnUpgrade.textContent = tower?.level === 3 ? '已满级' : tower ? `升级 ${game.upgradeCost(tower)}` : '升级';
  btnSell.disabled = !tower || game.phase !== 'playing';
}

function renderSummary(): void {
  const s = game.stats;
  const grade = s.leaks === 0 ? 'S' : s.leaks <= 3 ? 'A' : s.leaks <= 8 ? 'B' : 'C';
  const stars = game.phase === 'won' ? starsForCurrentRun() : 0;
  overlaySummary.innerHTML = `
    <div class="summary-grade">评级 ${grade} ${stars ? `<span class="result-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` : ''}</div>
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
  levelSelect.innerHTML = '';
  switch (game.phase) {
    case 'title':
      renderLevelSelect();
      showOverlay(
        `${game.selectedLevel.number}. ${game.selectedLevel.name}`,
        game.selectedLevel.description,
        `${game.selectedLevel.subtitle} · ${game.selectedLevel.waves.length} 波 · ${game.selectedLevel.recommended}`,
        '进入关卡',
      );
      break;
    case 'paused':
      showOverlay('实验暂停', '反应仍在容器中蓄势，准备好后继续。', '系统处于准稳态', '继续');
      break;
    case 'won':
      showOverlay('防线稳固', `${game.selectedLevel.name}已完成，下一关现已解锁。`, '产率 100% · 反应完成', '返回选关');
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

levelSelect.addEventListener('click', (ev) => {
  const card = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
  if (!card || card.disabled) return;
  game.selectLevel(card.dataset.level ?? LEVELS[0].id);
  game.audio.play('place');
  syncOverlay();
});

btnStart.addEventListener('click', () => {
  game.audio.unlock();
  if (game.phase === 'paused') {
    game.togglePause();
  } else if (game.phase === 'won') {
    game.showTitle();
  } else {
    game.start(game.selectedLevel.id);
  }
  syncOverlay();
  renderShop();
  renderBadges();
  updateFacts();
  updateDetail();
});

btnWave.addEventListener('click', () => {
  game.audio.unlock();
  game.launchWave();
  updateStats();
});

btnSpeed.addEventListener('click', () => {
  game.toggleSpeed();
  updateStats();
});

btnUpgrade.addEventListener('click', () => {
  game.audio.unlock();
  game.upgradeSelected();
  updateStats();
  updateDetail();
  renderShop();
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
  game.update(dt * game.gameSpeed);
  renderer.draw(game, dt * game.gameSpeed);

  for (const toast of game.drainToasts()) {
    showToast(toast.badge, toast.name, toast.desc, toast.reward);
  }

  if (game.phase !== prevPhase) {
    if (game.phase === 'won') saveLevelResult();
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
