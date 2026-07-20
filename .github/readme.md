# SillyTavern-Patch

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)
[![Upstream](https://img.shields.io/badge/based%20on-SillyTavern%201.18.0-orange.svg)](https://github.com/SillyTavern/SillyTavern)
[![Version](https://img.shields.io/badge/version-1.18.0--patch--1-brightgreen.svg)](CHANGELOG.md)

基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) `1.18.0` 的个人定制分支，针对**国内模型**与**大量角色卡**使用场景做了针对性改进。

> ⚠️ 本仓库是个人 fork，与 SillyTavern 官方项目**无任何隶属关系**，亦不代表官方立场。所有定制功能仅做有限测试，请按需评估稳定性。

---

## ✨ 这个分支做了什么

### 定制功能

- **国内模型思考模式开关**：为 DeepSeek、Qwen 等国内大模型增加思考/推理模式的开关控制，便于在角色扮演场景中灵活开关推理过程。
  > 目前主要针对 DeepSeek 适配，其它国内模型未做充分测试。
- **角色卡无限层级子目录**：角色卡文件夹支持任意层级子目录，方便组织与管理大量角色卡。
- **UI 文件夹目录浏览**：角色选择界面集成文件夹目录浏览，可直接在界面上按目录浏览与定位角色卡。
- **并发角色卡扫描**：新增可配置并发数的角色卡列表扫描，角色卡数量巨大时加载显著提速。并发数根据 CPU 核数自动探测（≤4 核 → 8，>4 核 → 32，Android/Termux → 8），也可在 `config.yaml` 中手动指定。
- **移动端世界书搜索**：角色、人格与聊天内 Lorebook / 世界书选择器在移动端替换为带关键词过滤的搜索界面，原生的全屏 `<select>` 选择器无法搜索，这在移动端极不友好。
- **MacroBrowser 扩展**：内置 MacroBrowser 扩展及预设配置，便于浏览与插入宏。

### 精简与优化

- 移除未使用的扩展（caption、gallery、regex、stable-diffusion、translate、tts 等）及其对应的后端端点、video generation 代码，减小体积、降低维护面。
- 优化 PNG 角色卡元数据处理逻辑，修复角色列表空白状态问题。
- 移除 `getEntitiesList` 的内存缓存以修正过期结果问题。

完整变更记录见 [CHANGELOG.md](CHANGELOG.md)。

---

## 📦 系统要求

- [Node.js](https://nodejs.org/) **>= 20**（推荐 LTS 版本）
- [Git](https://git-scm.com/)（用于克隆与更新）
- 可选：[Docker](https://www.docker.com/)（容器化部署）

---

## 🚀 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/JiYeHuanXiang/sillytavern-patch.git
cd sillytavern-patch

# 2. 安装依赖（生产模式）
npm install --omit=dev --ignore-scripts

# 3. 启动
node server.js
```

启动后默认在 **http://localhost:8000** 打开管理界面。

### 各平台启动脚本

| 平台 | 命令 / 脚本 |
|------|------------|
| Windows | 双击 `Start.bat`，或运行 `UpdateAndStart.bat`（更新并启动） |
| Linux / macOS / Termux | `bash start.sh` |
| Fork 维护者（Windows） | `UpdateForkAndStart.bat`——自动拉取上游变更并入 fork，详见 [Update-Instructions.txt](Update-Instructions.txt) |

### Docker

仓库已附带 `docker/docker-compose.yml` 与 `Dockerfile`，可一键容器化部署：

```bash
cd docker
docker compose up -d
```

具体挂载与配置参见 [docker/docker-compose.yml](docker/docker-compose.yml)。

---

## ⚙️ 配置

主配置文件为 [`config.yaml`](config.yaml)，常用项：

- `port`：监听端口（默认 `8000`）
- `whitelistMode` / `whitelist`：IP 白名单，默认仅允许本机访问
- `listen`：是否监听所有网卡（默认 `false`，仅本机）
- `performance.characterListConcurrency`：角色卡扫描并发数
- `securityOverride` / `disableCsrfProtection`：安全相关开关，**请谨慎使用**

> 首次启动会自动在 `data/` 下创建用户数据目录（默认用户 `default-user`），角色卡放在 `data/default-user/characters/`，支持子目录。

更完整的配置说明参见 [SillyTavern 官方文档](https://docs.sillytavern.app/)。

---

## 🔄 更新

本仓库克隆自 Git，更新非常简单：

```bash
# 拉取最新代码并安装依赖
git pull
npm install --omit=dev --ignore-scripts
node server.js
```

Windows 用户可直接运行 `UpdateAndStart.bat`。

> 如果你维护了自己的 fork，使用 `UpdateForkAndStart.bat` 可从上游（`upstream`）rebase 最新改动并入本地分支。

---

## 📁 项目结构

```
sillytavern-patch/
├── public/              # 前端静态资源（UI、脚本、样式）
├── src/                 # 后端源码
├── data/                # 用户数据目录
│   └── default-user/
│       └── characters/  # 角色卡目录（支持无限层级子目录）
├── docker/              # Docker 相关配置
├── config.yaml          # 服务配置
├── server.js            # 入口文件
└── package.json
```

---

## ⚠️ 已知限制与说明

- **非官方分支**：本仓库不承诺与上游保持同步更新，也不承诺兼容上游的所有扩展与插件。
- **部分扩展已被移除**：caption、gallery、regex、stable-diffusion、translate、tts 等扩展及对应后端端点已删除，依赖这些功能的用户请使用上游版本。
- **模型适配范围有限**：思考模式开关主要针对 DeepSeek 验证，其它国内模型（如 Qwen）为按需适配，未做全面回归测试。
- **安全性**：默认仅监听本机；如需对外暴露请务必配置 `listen`、白名单、CSRF 及 Basic Auth，并评估风险。

---

## 🗺️ 发展说明

- **跟随上游**：我们会尽量跟进 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 官方的版本更新，但作为补丁版，需要在此基础上重新适配定制功能，因此**不可避免地存在一定时间的落后**，无法保证与上游 release 同步发布。
- **更新节奏**：以「功能可用、基本稳定」为前提推进，不承诺固定的发布周期。重大上游更新会评估合并成本与冲突后决定是否跟进。
- **反馈与需求**：本分支虽基于个人使用需求制作，但我们**仍欢迎问题反馈与合理的功能建议**。遇到 Bug 请提 Issue 并附上复现步骤与日志；功能建议请说明使用场景与预期效果，我们会在精力范围内评估实现。
- **维护优先级**：定制功能（国内模型思考模式、角色卡子目录等）的稳定性优先级高于新功能堆叠；与上游冲突时，以保留定制功能为前提做最小化调整。

---

## 🤝 贡献

欢迎提 Issue 与 Pull Request。开发环境与代码规范请参考 [CONTRIBUTING.md](CONTRIBUTING.md)（沿用上游指南，语言以英文为主）。

基本开发流程：

```bash
git clone <your-fork>
cd sillytavern-patch
npm install          # 安装全部依赖（含 dev）
npm run lint         # 代码检查
```

---

## 📜 许可证

本项目继承上游 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 采用的 **GNU Affero General Public License v3.0 (AGPL-3.0)**，详见 [LICENSE](LICENSE)。

> 网络服务使用者同样受 AGPL-3.0 约束，修改后的代码须按许可证条款公开。

### 关于我们修改部分的额外授权

需要说明的是：项目整体因继承上游而受 AGPL-3.0 约束，这是许可证要求，并非我们的本意选择。我们偏爱开放、宽松的协议。

**对于本仓库新增/修改的部分**，我们在 AGPL-3.0 之外额外授予如下许可：

- 你可以将其视为 **MIT** 或 **BSD** 中的任意一种来使用——选择对你最宽松、最方便的一种即可。
- 换言之，我们对这部分内容**不施加任何额外限制**，仅需在分发时保留原作者署名。

> ⚠️ 以上额外授权**仅适用于本 fork 新增或修改的代码与内容**。上游 SillyTavern 的原始代码仍严格遵循 AGPL-3.0，不可降级。若你仅需复用我们改动的片段（不涉及上游代码），可按上述宽松条款使用；若涉及完整项目或上游代码，则整体仍须遵循 AGPL-3.0。

---

## 🙏 致谢

本项目基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 开发，衷心感谢原作者及社区贡献者的杰出工作。
