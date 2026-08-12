# AI 周报助手

面向个人与小团队的周报生成器：先由人设定**工作目标**与**写作标准**，再授权本地/云端数据范围；授权后可每小时自动或手动采集材料，输出 Markdown / HTML 周报（含采集摘要 + 分析结论）。

## 解决的周报痛点

| 常见问题 | 助手如何规避 |
|---|---|
| 流水账，只记「做了什么」 | 强制升维为「成果 / 价值 / 风险」；命中禁用句式会打质量警告 |
| 缺乏成果意识 | 标准默认开启 `requireOutcomeAndValue` 与 `requireRisks` |
| 下一步过于笼统 | 下一步必须含负责人、截止日期、完成定义（DoD），否则报错 |
| 数据字段与口径不统一 | 预登记指标定义 + 别名映射，未登记字段会被丢弃并告警 |

## 数据源

- **本地**：Git、浏览器历史（JSON 导出）
- **远端**：腾讯云文件 (COS)、企业微信文件、腾讯会议
- **自定义**：备注与结构化输入

> 远端连接器内置 mock / 清单模式，便于本地联调；接入正式 API 时替换 `options` 中的凭证与拉取实现即可，授权门禁逻辑不变。

## 快速开始

```bash
cd ai-weekly-assistant
npm install
npm run build

# 初始化配置（目标、标准、数据源）
npx tsx src/cli.ts init -c ./weekly.config.json -n "我的工作区"

# 授权数据源（未授权不会采集）
npx tsx src/cli.ts authorize -c ./weekly.config.json -s src-git --by "你"
npx tsx src/cli.ts authorize -c ./weekly.config.json -s src-custom --by "你"

# 追加自定义材料
npx tsx src/cli.ts add-note -c ./weekly.config.json -t "完成周报质量规则评审"

# 手动生成周报
npx tsx src/cli.ts run -c ./weekly.config.json

# 每小时自动触发（前台）
npx tsx src/cli.ts schedule -c ./weekly.config.json
```

也可直接用示例配置试跑：

```bash
npx tsx src/cli.ts run -c ./examples/weekly.config.example.json
```

产物默认写到 `output/`，同时生成 `.md` 与 `.html`。

## 本地部署

一条命令完成构建、安装 CLI、初始化配置、授权本地 Git 并首次生成：

```bash
./deploy/local-deploy.sh ~/weekly-deploy "我的工作区"
```

脚本把 CLI 装到用户级 prefix（默认 `~/.local`），无需 sudo。若 `weekly-assistant` 不可用，把 `~/.local/bin` 加进 `PATH`：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

常驻后台按小时自动生成：

```bash
./deploy/install-systemd.sh ~/weekly-deploy      # systemd 用户服务
journalctl --user -u weekly-assistant -f          # 查看日志
```

没有 systemd 的环境（如容器）可直接常驻：

```bash
nohup weekly-assistant schedule -c ~/weekly-deploy/weekly.config.json \
  > ~/weekly-deploy/scheduler.log 2>&1 &
```

## 推荐工作流

1. **设目标**：编辑 `goals`，写清成功标准与 owner  
2. **设标准**：保持四类防劣化开关开启（成果、风险、可执行下一步、统一口径）  
3. **授权范围**：`authorize` / `revoke` 精确控制本地与云端数据  
4. **采集生成**：`run` 或 `schedule`  
5. **审阅质量检查**：报告末尾的 `qualityIssues` 需人工确认后再外发  

## 配置要点

- `metrics[].definition`：权威口径说明  
- `metrics[].aliases`：跨材料别名（如 `提交次数` → `commits`）  
- `standards.forbiddenPatterns`：流水账敏感词  
- `sources[].auth.authorized`：采集硬门禁  

## 开发

```bash
npm test
npm run typecheck
```

## 目录结构

```
ai-weekly-assistant/
  src/
    cli.ts              # CLI 入口
    config/             # 默认配置与存取
    connectors/         # Git / 浏览器 / 腾讯系 / 自定义
    pipeline/           # 采集 → 归一 → 分析 → 质量
    report/             # Markdown / HTML 渲染
    scheduler/          # 小时触发
  examples/             # 示例配置与样例数据
  test/                 # 单元与端到端测试
```

## 许可

MIT
