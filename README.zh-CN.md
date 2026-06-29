# cursor-agent CentOS 7 兼容工具

[English](README.md) | [中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Required-blue.svg)](https://www.docker.com/)
[![CentOS 7](https://img.shields.io/badge/CentOS-7-green.svg)](https://www.centos.org/)
[![cursor-agent](https://img.shields.io/badge/cursor--agent-compatible-orange.svg)](https://www.cursor.com/)

解决 cursor-agent 在 CentOS 7 上因 glibc 版本过低而无法运行的问题。

## 问题描述

cursor-agent 依赖的 Node.js 二进制文件需要 **glibc 2.27+**，但 CentOS 7 系统最高只支持 **glibc 2.17**，导致运行时报错：

```
/lib64/libc.so.6: version `GLIBC_2.27' not found
/lib64/libc.so.6: version `GLIBC_2.28' not found
/lib64/libstdc++.so.6: version `GLIBCXX_3.4.21' not found
```

## 解决方案

使用 Docker 容器运行 cursor-agent，利用 Ubuntu 20.04 镜像（glibc 2.31）提供兼容的运行环境。

## 安装要求

- CentOS 7 系统
- Docker 已安装并运行
- cursor-agent 已安装（通常在 `~/.local/share/cursor-agent/`）

## 快速安装

```bash
./install.sh
```

安装脚本会自动：
1. 构建基于 Ubuntu 20.04 的 Docker 镜像
2. 创建 `~/.local/bin/agent` wrapper 脚本

## 使用方法

安装完成后，直接运行：

```bash
agent --version
agent [其他参数...]
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `install.sh` | 一键安装脚本 |
| `agent-docker.sh` | 手动运行脚本（不修改系统 agent 命令） |

## 工作原理

wrapper 脚本通过 Docker 运行 cursor-agent，并挂载以下目录：
- cursor-agent 安装目录（只读）
- 当前工作目录
- SSH 密钥（`~/.ssh`）
- 缓存目录（`~/.cache`）
- cursor-agent 数据目录

## 许可证

[MIT License](LICENSE)
