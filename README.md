# SillyTavern (Personal Fork)

基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 的个人修改版，针对国内模型使用场景做了定制化改进。

> **注意：** 因 AGPL 许可证的传染性条款，此仓库为私有仓库，不对外分发。

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

## 修改内容

### 1. 国内模型思考模式开关

为部分国内大模型（如 DeepSeek、Qwen 等）添加了思考/推理模式的开关控制，方便在角色扮演场景中灵活切换。

### 2. 角色卡子目录支持

角色卡文件夹支持无限层级子目录，便于组织和管理大量角色卡。

### 3. UI 文件夹目录

在角色选择界面的 UI 中集成了文件夹目录浏览功能，可直接在界面上按目录浏览角色卡。

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 20

### 安装与启动

```bash
# 安装依赖
npm install

# 启动服务（默认端口 8000）
npm start

# 或使用批处理（Windows）
Start.bat
```

启动后浏览器访问 `http://localhost:8000`。

### 更新

```bash
# 如果你使用 Git 克隆
git pull

# Windows 用户可直接运行
UpdateAndStart.bat
```

## 项目结构

```
ST/
├── public/          # 前端静态资源
│   └── characters/  # 角色卡目录（支持子目录）
├── src/             # 后端源码
├── data/            # 用户数据目录
├── config.yaml      # 服务配置
├── server.js        # 入口文件
└── package.json
```

## 配置

主要配置文件为 `config.yaml`，可配置端口、网络、SSL 等参数。详细说明参见[官方文档](https://docs.sillytavern.app/)。

## 致谢

本项目基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 开发，感谢原作者的杰出工作。

## 许可证

原始项目使用 AGPL-3.0 许可证。本仓库为私有仓库，不对外分发。
