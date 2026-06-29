#!/bin/bash
# cursor-agent Docker 运行脚本 (CentOS 7 兼容版)
# 用法: ./agent-docker.sh [agent 参数]
#
# 问题背景:
#   cursor-agent 依赖的 Node.js 二进制文件需要 glibc 2.27+，
#   但 CentOS 7 系统最高只支持 glibc 2.17，导致库版本不兼容。
#
# 解决方案:
#   使用 Docker 容器运行 cursor-agent，利用 Ubuntu 20.04 镜像
#   (glibc 2.31) 来提供兼容的运行环境。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="/root/.local/share/cursor-agent/versions/2026.06.19-20-24-33-653a7fb"
IMAGE_NAME="cursor-agent:ubuntu20"

# 检查 Docker
if ! command -v docker &>/dev/null; then
    echo "错误: Docker 未安装，无法运行 cursor-agent"
    exit 1
fi

# 构建镜像（如果不存在）
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "首次运行，正在构建 Docker 镜像..."
    
    # 创建临时构建目录
    BUILD_DIR=$(mktemp -d)
    cat > "$BUILD_DIR/Dockerfile" << 'DOCKEREOF'
FROM nvidia/cuda:11.8.0-devel-ubuntu20.04

# 安装必要的依赖
RUN apt-get update && apt-get install -y \
    libstdc++6 \
    libc6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 创建工作目录
WORKDIR /agent

# 设置环境变量
ENV NODE_COMPILE_CACHE=/tmp/cursor-compile-cache
ENV CURSOR_INVOKED_AS=agent

ENTRYPOINT ["/agent/node"]
CMD ["/agent/index.js"]
DOCKEREOF

    docker build -t "$IMAGE_NAME" "$BUILD_DIR"
    rm -rf "$BUILD_DIR"
    echo "镜像构建完成"
fi

# 检测是否在 TTY 环境
if [ -t 0 ] && [ -t 1 ]; then
    TTY_FLAGS="-it"
else
    TTY_FLAGS="-i"
fi

# 运行 agent
# 挂载 agent 目录、当前工作目录、SSH 密钥等
docker run $TTY_FLAGS --rm \
    -v "$AGENT_DIR:/agent:ro" \
    -v "$PWD:/workspace" \
    -w /workspace \
    -v "$HOME/.ssh:/root/.ssh:ro" \
    -v "$HOME/.cache:/root/.cache" \
    -v "$HOME/.local/share/cursor-agent:/root/.local/share/cursor-agent" \
    -e CURSOR_INVOKED_AS=agent \
    -e HOME=/root \
    -e TERM="${TERM:-xterm-256color}" \
    "$IMAGE_NAME" \
    /agent/index.js "$@"
