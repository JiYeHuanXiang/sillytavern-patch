# 更新日志

本文件记录 sillytavern-patch 个人 fork 相对于上游 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 的改动。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.18.0-patch-1.1] - 2026-07-24

恢复正则扩展功能，并增强不规范角色卡的正则脚本防护。

- 从上游 staging 恢复 regex 扩展（含调试器）及相关前端/后端集成。
- 新增 `validateRegexScript` 字段验证：自动过滤 placement 非数组、findRegex 缺失等不规范脚本，防止崩溃。
- 新增 ReDoS 超时降级：单次替换超过 100ms 降级返回原文并 console 警告。
- 新增"启用正则规范检查"开关（默认开启），关闭后跳过格式验证仅保留上游原生弹窗。
- 切换角色卡时自动检测内置正则：规范脚本弹窗确认允许，不规范脚本追加具体无效脚本名称及跳过提示。
- 版本号升级至 `1.18.0-patch-1.1`。

## [1.18.0-patch-1.0] - 2026-07-19

首个正式版本。

相对于预览版 `1.18.0-patch-1-pre.1` 的主要变化：

- 精简依赖与代码体积，移除未使用的扩展（caption、gallery、regex、stable-diffusion、translate、tts 等）及其对应后端端点与 video generation 代码。
- 优化 PNG 角色卡元数据处理逻辑，修复角色列表空白状态问题。
- 更新 README，明确模型支持范围与修改内容。
- 调整 `jsconfig.json` 模块解析配置并清理。
- 移动端支持对世界书的手动搜索

### ✨ 新增

- **移动端世界书手动搜索**：为移动端添加世界书/lorebook 的手动搜索功能，提升移动端使用体验。

### 🔧 其他

- 添加协议说明。

## [1.18.0-patch-1-pre.1] - 2026-07-17

首个预览版本。基于上游 SillyTavern `1.18.0` release 快照，针对国内模型使用场景做初步定制。

### ✨ 新增

- **DeepSeek 思考模式开关**：为 DeepSeek、Qwen 等国内大模型增加思考/推理模式开关，便于在角色扮演场景中灵活切换。
- **角色卡子目录支持**：角色卡文件夹支持无限层级子目录，便于组织和管理大量角色卡。
- **UI 文件夹目录浏览**：角色选择界面集成文件夹目录浏览功能，可直接在界面上按目录浏览角色卡。
- **MacroBrowser 扩展**：添加 MacroBrowser 扩展及预设配置。
- **并发角色卡扫描**：新增可配置并发数的角色卡列表扫描，提升大量角色卡时的加载速度。

### ⚡ 性能优化

- 优化角色卡列表渲染，修复子目录标签同步问题。
- 移除 `getEntitiesList` 的内存缓存以修正过期结果问题。

### 🐛 修复

- 修正 shell 脚本的 LF 行尾符及 `start.sh` 中的 ANSI 转义码。

### 🔧 其他

- 清理上游 CI 配置，更新 README 与项目配置，使其贴合个人 fork 定位。

