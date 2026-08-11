# 墨迹成码 · Handwriting to Action

从**手写体照片**识别文字（OCR），提取关键任务与约束，自动制定行动计划，并生成可执行代码。

## 能力

1. **手写 OCR**：通过 OpenAI 兼容视觉模型识别笔记/白板照片  
2. **关键内容提取**：目标、任务优先级、约束、备注  
3. **行动计划**：带依赖关系的步骤清单  
4. **行动代码**：`ACTION_PLAN.md`、`run_plan.py`、`bootstrap.sh`、`manifest.json`

未配置 API Key 时，内置 **Demo 模式**，可用示例文本完整跑通流水线。

## 快速开始

```bash
cd handwriting-to-action
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### CLI

```bash
# 纯文本（跳过 OCR，适合本地验证）
hta from-text examples/sprint-note.txt -o out --mode demo

# 手写照片（无 Key 时自动 demo；有 OPENAI_API_KEY 时走视觉 OCR）
hta run path/to/note.jpg -o out --mode auto

# 启动 Web UI
hta serve
# 浏览器打开 http://127.0.0.1:8765
```

### 环境变量

复制 `.env.example` 为 `.env`：

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_VISION_MODEL=gpt-4o
OPENAI_TEXT_MODEL=gpt-4o-mini
```

也兼容其它 OpenAI 兼容网关（修改 `OPENAI_BASE_URL` 即可）。

## 输出说明

| 文件 | 作用 |
|------|------|
| `ACTION_PLAN.md` | 可勾选行动清单 |
| `run_plan.py` | 带依赖检查的进度脚本（`--start` / `--done` / `--status`） |
| `bootstrap.sh` | 一键查看计划状态 |
| `manifest.json` | 机器可读完整结果 |

```bash
python out/run_plan.py
python out/run_plan.py --start S1
python out/run_plan.py --done S1
```

## 项目结构

```
handwriting-to-action/
├── src/handwriting_to_action/
│   ├── ocr.py          # 手写视觉 OCR
│   ├── extract.py      # 关键内容提取
│   ├── planner.py      # 行动计划
│   ├── codegen.py      # 行动代码生成
│   ├── pipeline.py     # 端到端流水线
│   ├── api.py / cli.py # Web / 命令行
│   └── static/         # Web UI
├── examples/
├── tests/
└── pyproject.toml
```

## 测试

```bash
pytest -q
```

## 许可证

与仓库根目录一致（MIT）。
