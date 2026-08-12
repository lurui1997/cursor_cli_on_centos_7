#!/usr/bin/env bash
# 将周报助手的小时调度安装为 systemd 用户服务
# 用法: ./deploy/install-systemd.sh [部署目录]

set -euo pipefail

DEPLOY_DIR="${1:-$HOME/weekly-deploy}"
NPM_PREFIX="${NPM_PREFIX:-$HOME/.local}"
CLI="$NPM_PREFIX/bin/weekly-assistant"
CONFIG="$DEPLOY_DIR/weekly.config.json"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/weekly-assistant.service"

if [ ! -x "$CLI" ]; then
    echo "错误: 未找到 CLI ($CLI)，请先运行 ./deploy/local-deploy.sh"
    exit 1
fi

if [ ! -f "$CONFIG" ]; then
    echo "错误: 未找到配置 ($CONFIG)，请先运行 ./deploy/local-deploy.sh"
    exit 1
fi

mkdir -p "$UNIT_DIR"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=AI Weekly Assistant hourly scheduler
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$DEPLOY_DIR
ExecStart=$CLI schedule -c $CONFIG
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
EOF

echo "已写入 $UNIT_FILE"

fallback_to_nohup() {
    echo "$1"
    echo "==> 改用 nohup 后台常驻"
    local logfile="$DEPLOY_DIR/scheduler.log"
    if pgrep -f "weekly-assistant schedule -c $CONFIG" >/dev/null 2>&1; then
        echo "调度进程已在运行，跳过启动"
    else
        (cd "$DEPLOY_DIR" && nohup "$CLI" schedule -c "$CONFIG" >> "$logfile" 2>&1 &)
        sleep 2
        echo "已启动"
    fi
    echo "查看日志: tail -f $logfile"
    echo "停止服务: pkill -f 'weekly-assistant schedule'"
    exit 0
}

# 容器等环境常有 systemctl 但没有 user D-Bus，需降级而不是失败
if ! command -v systemctl >/dev/null 2>&1; then
    fallback_to_nohup "提示: 当前环境没有 systemctl。"
fi

if ! systemctl --user daemon-reload 2>/dev/null; then
    fallback_to_nohup "提示: 无法连接 systemd 用户总线（常见于容器/无 session 环境）。"
fi

systemctl --user enable --now weekly-assistant.service
systemctl --user status weekly-assistant.service --no-pager || true

echo
echo "查看日志: journalctl --user -u weekly-assistant -f"
echo "停止服务: systemctl --user stop weekly-assistant"
