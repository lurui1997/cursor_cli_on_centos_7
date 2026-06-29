#!/bin/bash
# cursor-agent CentOS 7 兼容安装脚本
# 用法: ./install.sh

set -euo pipefail

AGENT_DIR="/root/.local/share/cursor-agent/versions/2026.06.19-20-24-33-653a7fb"
IMAGE_NAME="cursor-agent:ubuntu20"

# 检查 Docker
if ! command -v docker &>/dev/null; then
    echo "错误: Docker 未安装，请先安装 Docker"
    exit 1
fi

# 检查 cursor-agent 是否已安装
if [ ! -d "$AGENT_DIR" ]; then
    echo "错误: cursor-agent 未安装，请先安装 cursor-agent"
    echo "安装命令: curl -fsSL https://... | bash"
    exit 1
fi

# 构建 Docker 镜像
echo "正在构建 Docker 镜像..."
BUILD_DIR=$(mktemp -d)
cat > "$BUILD_DIR/Dockerfile" << 'DOCKEREOF'
FROM nvidia/cuda:11.8.0-devel-ubuntu20.04

RUN apt-get update && apt-get install -y \
    libstdc++6 \
    libc6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /agent

ENV NODE_COMPILE_CACHE=/tmp/cursor-compile-cache
ENV CURSOR_INVOKED_AS=agent

ENTRYPOINT ["/agent/node"]
CMD ["/agent/index.js"]
DOCKEREOF

docker build -t "$IMAGE_NAME" "$BUILD_DIR"
rm -rf "$BUILD_DIR"

# 创建 wrapper 脚本
mkdir -p /root/.local/bin
cat > /root/.local/bin/agent << 'WRAPPEREOF'
#!/bin/bash
# cursor-agent wrapper for CentOS 7
# 使用 Docker 容器运行 agent，解决 glibc 版本不兼容问题

set -euo pipefail

AGENT_DIR="/root/.local/share/cursor-agent/versions/2026.06.19-20-24-33-653a7fb"
IMAGE_NAME="cursor-agent:ubuntu20"

if ! command -v docker &>/dev/null; then
    echo "错误: Docker 未安装"
    exit 1
fi

if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "错误: Docker 镜像不存在，请运行 install.sh 安装"
    exit 1
fi

if [ -t 0 ] && [ -t 1 ]; then
    TTY_FLAGS="-it"
else
    TTY_FLAGS="-i"
fi

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
WRAPPEREOF

chmod +x /root/.local/bin/agent

echo "安装完成！"
echo "现在可以直接运行 'agent' 命令了"
