#!/usr/bin/env bash
# AI 周报助手本地部署脚本
# 用法: ./deploy/local-deploy.sh [部署目录] [工作区名称]
#
# 完成：构建 -> 安装 CLI 到用户级 prefix -> 初始化配置 -> 授权本地 Git -> 首次生成

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${1:-$HOME/weekly-deploy}"
WORKSPACE_NAME="${2:-我的工作区}"
NPM_PREFIX="${NPM_PREFIX:-$HOME/.local}"
CLI="$NPM_PREFIX/bin/weekly-assistant"

if ! command -v node >/dev/null 2>&1; then
    echo "错误: 未找到 node，请先安装 Node.js 18+"
    exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "错误: Node.js 版本过低（当前 $(node -v)），需要 18+"
    exit 1
fi

echo "==> 安装依赖并构建 ($PROJECT_DIR)"
cd "$PROJECT_DIR"
npm install
npm run build

echo "==> 安装 CLI 到 $NPM_PREFIX"
npm config set prefix "$NPM_PREFIX"
npm link

if ! command -v weekly-assistant >/dev/null 2>&1; then
    echo "提示: $NPM_PREFIX/bin 不在 PATH 中，请加入 shell 配置："
    echo "      export PATH=\"$NPM_PREFIX/bin:\$PATH\""
fi

echo "==> 初始化部署目录 $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

CONFIG="$DEPLOY_DIR/weekly.config.json"
if [ -f "$CONFIG" ]; then
    echo "已存在配置，跳过初始化: $CONFIG"
else
    "$CLI" init -c "$CONFIG" -n "$WORKSPACE_NAME"
fi

echo "==> 授权本地 Git 数据源（仅读取提交元数据）"
"$CLI" authorize -c "$CONFIG" -s src-git --by "$(whoami)" --note "本地部署自动授权：仅读取 commit 元数据"

echo "==> 首次生成周报"
"$CLI" run -c "$CONFIG"

cat <<EOF

部署完成。
  配置文件: $CONFIG
  产物目录: $DEPLOY_DIR/output

常用命令：
  weekly-assistant sources  -c "$CONFIG"     # 查看数据源与授权状态
  weekly-assistant authorize -c "$CONFIG" -s src-meeting --by "$(whoami)"
  weekly-assistant run      -c "$CONFIG"     # 手动触发
  weekly-assistant schedule -c "$CONFIG"     # 每小时自动触发（前台）

后台常驻（systemd 用户服务）：
  ./deploy/install-systemd.sh "$DEPLOY_DIR"
EOF
