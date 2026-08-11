# 元素防线 · Elemental Bastion

在浏览器里运行的**化学主题塔防游戏**：用元素与真实化合反应守护实验室，边玩边体会化学的美感与直觉。

## 快速开始

```bash
cd chem-defense
npm install
npm run dev
```

然后打开终端提示的本地地址（通常是 `http://localhost:5173`）。

生产构建：

```bash
npm run build
npm run preview
```

## 玩法

1. 从元素货架选择 **H / O / C / N / Na / S / Cl / Fe** 并放置在网格上（避开管道路径）。
2. 将可反应的元素放在**相邻格子**，会自动合成更强的化合物塔：
   - `H + O → H₂O`
   - `Na + Cl → NaCl`
   - `H + Cl → HCl`
   - `C + O → CO₂`
   - `Fe + O → Fe₂O₃`
   - `S + O → SO₂`
3. 利用克制关系：
   - 碱（Na）克酸雾
   - 酸/卤素（Cl、HCl）克碱液
   - 氧克制甲烷火团（燃烧）
   - 硫/沉淀克制重金属离子
   - 氢/氮克制自由基
4. 右侧「化学笔记」会解锁真实知识点与反应方程式。
5. 从第 3 波起，**AI 导演**会根据你的塔组成调整敌军配方，逼你用更完整的化学思路应对。

## 技术

- Vite + TypeScript
- Canvas 2D 渲染
- 轻量自适应波次 AI（根据元素/化合物标签调整敌人）
- 纯前端，无需后端
