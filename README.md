# cursor-agent CentOS 7 Compatibility Tool

[English](README.md) | [中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Required-blue.svg)](https://www.docker.com/)
[![CentOS 7](https://img.shields.io/badge/CentOS-7-green.svg)](https://www.centos.org/)
[![cursor-agent](https://img.shields.io/badge/cursor--agent-compatible-orange.svg)](https://www.cursor.com/)

Solves the issue where cursor-agent cannot run on CentOS 7 due to low glibc version.

## Problem Description

cursor-agent depends on a Node.js binary that requires **glibc 2.27+**, but CentOS 7 only supports up to **glibc 2.17**, causing runtime errors:

```
/lib64/libc.so.6: version `GLIBC_2.27' not found
/lib64/libc.so.6: version `GLIBC_2.28' not found
/lib64/libstdc++.so.6: version `GLIBCXX_3.4.21' not found
```

## Solution

Run cursor-agent inside a Docker container using an Ubuntu 20.04 image (glibc 2.31) to provide a compatible runtime environment.

## Requirements

- CentOS 7 system
- Docker installed and running
- cursor-agent installed (usually at `~/.local/share/cursor-agent/`)

## Quick Install

```bash
./install.sh
```

The install script will automatically:
1. Build a Docker image based on Ubuntu 20.04
2. Create a `~/.local/bin/agent` wrapper script

## Usage

After installation, run directly:

```bash
agent --version
agent [other arguments...]
```

## File Description

| File | Description |
|------|-------------|
| `install.sh` | One-click installation script |
| `agent-docker.sh` | Manual run script (does not modify system agent command) |

## How It Works

The wrapper script runs cursor-agent via Docker and mounts the following directories:
- cursor-agent installation directory (read-only)
- Current working directory
- SSH keys (`~/.ssh`)
- Cache directory (`~/.cache`)
- cursor-agent data directory

## Related: 墨迹成码

本仓库另含子项目 [`handwriting-to-action/`](handwriting-to-action/)：手写体照片 OCR → 关键内容提取 → 行动计划 → 可执行代码。

## License

[MIT License](LICENSE)
