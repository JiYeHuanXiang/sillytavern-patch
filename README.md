# SillyTavern (Personal Fork)

基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 的个人修改版
 - 移除大量不常用功能，支持部分混合模型的思考模式开关，优化角色卡加载。

## 特性 / 修改内容

### 🧠 国内模型思考模式开关

为 DeepSeek、Qwen 等支持思考/推理模式的国内大模型添加开关控制，方便在角色扮演场景中灵活切换。

### 📁 角色卡子目录支持

角色卡文件夹支持无限层级子目录，便于组织和管理大量角色卡。

### 🗂️ UI 文件夹目录浏览

角色选择界面集成文件夹目录浏览功能，可直接在界面上按目录浏览角色卡。

### ⚡ 并发角色卡扫描

可配置并发数的角色卡列表扫描，提升大量角色卡时的加载速度。

### 🔌 MacroBrowser 扩展

内置 MacroBrowser 扩展及预设配置。
（未测试）

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 20

### 安装与启动

```bash
# 克隆仓库
git clone <your-repo-url>
cd ST

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
git pull
```

Windows 用户也可直接运行 `UpdateAndStart.bat`。

## 项目结构

```
ST/
├── public/          # 前端静态资源
├── src/             # 后端源码
├── data/            # 用户数据目录
│   └── default-user/characters/  # 角色卡目录（支持子目录）
├── config.yaml      # 服务配置
├── server.js        # 入口文件
└── package.json
```

## 配置

主要配置文件为 `config.yaml`，可配置端口、网络、SSL 等参数。详细说明参见[官方文档](https://docs.sillytavern.app/)。

## 致谢

本项目基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 开发，感谢原作者的杰出工作。

## 许可证

本项目随上游使用 [AGPL-3.0](LICENSE) 许可证。你对本项目的任何使用、修改和分发均需遵循该许可证的条款。
