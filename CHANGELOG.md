# 更新日志

本文件记录 sillytavern-patch 个人 fork 相对于上游 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 的改动。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.18.0-patch-2.1.3] - 2026-08-20

### ✨ 新增

- **端口占用自动回退**：配置端口被占用时不再直接启动失败。新增
  `enableAutoPortFallback` 配置项（默认开）+ CLI flag，启动时按后续端口顺序
  重试（最多 100 个），兼顾 IPv4/IPv6 双栈。上游 #5349 只把崩溃栈改成
  友好报错并干净退出，不自动换端口；本 fork 额外做了自动回退。

### 🐛 修复

- **character-index 写盘原子性**：异步 `flush()` 原先用非原子 `fsPromises.writeFile`，
  而 `flushSync` 用原子写——写盘中途崩溃会损坏整个 index 文件，违反该类
  "崩溃最多丢一次编辑"的契约。改为统一用 `write-file-atomic`；定时器外层
  `.catch(()=>{})` 改为记录意外错误。
- **浮动 Promise 兜底**：`utils.js` 的 select2 transport 把 `promise.then(success)`
  与独立 `.catch(failure)` 合成链式调用（原 promise 恒 resolve，外层 catch 是死代码）；
  `world-info.js` 内嵌世界书导入弹窗的 `importEmbeddedWorldInfo(true)` 未 await，
  改为 async + try/catch；`server-main.js` 启动链末尾加 `.catch(log + exit)`，
  与既有 port-in-use fatal 模式一致。
- **chat 加载错误日志级别**：`script.js` 的 chat 加载 catch 原用 `console.log`
  记错误（被默认控制台过滤吞掉），改为 `console.error('Failed to load chat', ...)`。

### 🔒 安全

- **npm audit 非破坏性 bump（44→16）**：在现有 ^range 内升级 lockfile 到补丁版，
  package.json 一字未改（与上游 staging 逐字一致）。覆盖 express/body-parser/
  dompurify/multer/form-data/simple-git/axios/js-yaml/brace-expansion/fast-uri 等。
  webpack build + 351 单元测试全绿。余 16 个为 breaking 或无 fix（protobufjs/
  sillytavern-transformers/image-size/showdown/chevrotain/vectra 等），延后。

## [1.18.0-patch-2.1.2] - 2026-08-15

### 🐛 修复

- **备份文件名冲突（#5780）**：`backupChat` 原先用 `sanitize(name).replace(/[^a-z0-9]/gi,'_')`
  把所有非 ASCII 字符（中/日/韩文角色名）塌缩成下划线，导致不同角色共用一个备份
  清理前缀、互相覆盖/共占配额（数据丢失风险）。改为只做 `sanitize-filename`（保留
  Unicode）+ 去前导点 + 空值兜底 `Unnamed`，每个角色独立备份命名空间。

- **测试目录 ESLint 配置**：删除遗留的 `tests/.eslintrc.js`（CJS 语法被
  `"type":"module"` 误当 ESM 加载，报 "module is not defined"），让更完整的
  `tests/.eslintrc.cjs` 生效，`npm run lint` 恢复正常。

### ✨ 新增

- **多窗口数据安全（#5864，Bug1+Bug2）**：同一账号开两个窗口会静默损坏数据
  （settings 乒乓覆盖、聊天消息丢失）。新增乐观锁 + 冲突检测，全部藏在
  `multiWindow.enabled` 配置开关后（默认关，关闭时行为与旧版字节一致）：
  - settings.json 增加 `_mw_rev` 版本字段、聊天增加 `chat_metadata.rev`，保存时做
    compare-and-swap，版本过期返回 HTTP 409 `{error:'conflict'}` 而非静默覆盖。
  - 前端每个保存点弹「重载 / 强制覆盖 / 取消」冲突确认框，成功后推进本地版本号。
  - 覆盖 settings、单聊、群聊；世界书/角色卡/主题/快捷回复的实时租约（Bug3/4）
    需服务端推送层，留待后续。

## [1.18.0-patch-2.1.1] - 2026-08-14

### 🔧 重构

- **局域网功能调整**
 - 局域网联机功能已从主线移除，移动到dev测试分支

### 🐛 修复
- 通用修复，涵盖安全、性能、稳定性与工程化：

 - SSRF防护(项目2): 新增 src/url-safety.js。CORS代理(/proxy)严格
  拦截私有/环回/云元数据/非http协议；LLM API路径(allowPrivate)
  放行本地推理后端仍拦云元数据与非http。新增 ssrfProtection 配置
  开关(env: SILLYTAVERN_SSRFPROTECTION)。覆盖 chat-completions/
  text-completions/openai/google 各 URL 派生点。

 - DeepSeek思考开关统一(项目5): 抽取 resolveDeepSeekThinking 合并
  四处重复逻辑，修 universal 分支 ===false 与另三处 ! 的不一致。
  非 DeepSeek 模型当 reasoning_effort==='disabled' 时映射为最小
  深度 'low'(无法真正关闭思考)。

 - 子目录缓存失效(项目4): util.js 新增 invalidateDirListCache，
  characters.js 写路径(writeCharacterData/delete/duplicate/rename)
  调用，修复子目录增删卡后 /api/characters/all 返回陈旧列表。
  附回归测试。

 - 同步FS转异步(项目7a): characters.js 19处 + stable-diffusion.js
  6处 readFileSync/unlinkSync/cpSync/writeFileAtomicSync 等转为
  await fsPromises/writeFileAtomic，解除事件循环阻塞。保留
  existsSync 守卫与 getUniqueName/getCacheKey 谓词不动。

 - 上游fetch超时(项目7b): util.js 新增 combineAbortSignals，合并
  客户端断开与服务端超时(AbortSignal.any/.timeout)。两 backend
  14处 fetch 加 requestTimeout(默认0=不启用)。删除 node-fetch v3
  已忽略的死 timeout:0。

 - CI复活(项目6): 删 .gitignore 对 .github/workflows/ 的忽略
  (CI死掉的根因)；新增 ci.yml(lint/build/unit-test硬门 +
  typecheck信息性)；根 package.json 加 test/build/typecheck 脚本；
  新增 scripts/build.mjs 独立 webpack 构建；@types/node ^18→^22
  对齐 engines>=20。jest 排除误拾取的 sample e2e 占位。

 - 顺带清理因 CI从未运行而积累的若干 lint 遗留错误(未用变量/引号/
  逗号/重复键)，含 group-chats.js connectionSnapshot 作用域 bug 修复。

- **CI 类型检查**：修复 `Type check (informational)` 检查项因 6000+ 假错误而始终失败的问题，检查现可通过。
  - 新增 `tsconfig.ci.json`，仅对 `src/` 服务端源码执行类型检查，避免 minified 第三方库与 `public/` 打包产物产生噪音。
  - 新增 `stubs/agnai-sentencepiece-js.d.ts`，为无类型声明的 `@agnai/sentencepiece-js` 包提供最小类型定义。
  - 修正 `src/` 下若干 JSDoc 类型标注（HTTPS server 返回类型、async 函数 Promise 返回类型、Buffer 断言等），均为纯类型标注，零运行时变化。
  - 移除 `src/endpoints/chats.js` 中对 `public/scripts/welcome-screen.js` 的 JSDoc 类型引用（该引用会把整个 `public/` 依赖图拉入检查范围）。

## [1.18.0-patch-2.1] - 2026-08-07

2.0 之后第一个小更新。新增局域网聊天（实验性）与 HTML 沙盒预览，并同步上游多项修复与性能优化。

### ✨ 新增
- **HTML 页面沙盒预览**：当消息（包括角色卡初始对话）或代码块内容为完整 HTML 页面时，可选择将其渲染为 sandboxed iframe 预览，而不是仅显示源代码。
  - 新增"将完整 HTML 页面渲染为沙盒预览"开关（默认开启），位于用户设置的消息显示区域。
  - 角色卡 `first_mes` 中的完整 HTML 页面会直接以 iframe 形式内嵌在聊天中，并支持源码/预览切换。
  - 普通消息中的 HTML 代码块会显示"预览 HTML"按钮，点击后在弹窗中查看渲染效果。
  - 注：该功能修复了原版酒馆遇到 HTML 代码时只能直接显示代码块的问题。
- **局域网（LAN）聊天（实验性）**：该功能为半成品，暂无测试环境覆盖，仅供参考。
  - 新增局域网聊天功能，支持同一本地网络下的多实例相互通信。
  - `config.yaml` 新增 `lanDiscovery` 配置项，可开关局域网聊天与历史持久化。
  - 用户设置面板新增局域网聊天设置：显示面板按钮、加入/离开通知、持久化历史、昵称等选项。
  - 独立的局域网聊天面板，含连接视图、房间管理与消息展示。

### 🔧 重构

- **群聊面板整合**：将局域网聊天面板整合进群聊界面，并改用聊天实体（chat entities）管理。

### 🐛 修复

- **index.html**：修复 `index.html` 中的乱码字符与 BOM 头问题。
- **chat**：修复附件文件已不存在时导致界面冻结的问题 (#5828)。
- **openai**：校验非流式响应必须包含消息内容 (#5647)。
- **image**：图片生成时尊重自定义 OpenAI 反向代理 (#5793)。
- **regex**：使用 `Number.isFinite` 进行深度限制检查 (#4919)。
- **regex**：修复欢迎页切换预设时重新载入聊天的问题 (#5718)。
- **config**：启动时容忍只读的 `config.yaml` (#4950)。
- **proxy**：校验前修剪代理 URL (#4883)。
- **proxy**：规范化 `no_proxy` 通配符绕过规则 (#5787)。
- **backup**：按聊天而非按用户限制备份频率 (#5796)。
- **ra**：恢复 `RA_autoconnect` 指数退避重试 (#5696)。
- **openrouter**：启用网页搜索时为 claude 模型添加原生 `web_search` 工具 (#5812)。
- **comfyui**：仅从历史端点获取当前提示词 (#5790)。

### ⚡ 性能优化（上游同步）

- **world-info**：优化世界书条目排序，避免 O(n²) 查找 (#5809)。
- **util**：`getImages` 按日期排序时每个文件仅读取一次 mtime (#5689)。
- **plugins**：列出插件目录时不再逐项 `statSync` (#5690)。

### 🔨 构建

- **macros**：新增 `{{currentMessageId}}` 宏 (#5018)。
- **lint**：忽略本地第三方扩展与 `.windsurf` 目录 (#5847)。

## [1.18.0-patch-2] - 2026-07-28

### ✨ 改进

- **群聊定向发送列表优化**：选择收件人的弹出列表不再显示头像，仅显示角色名称，避免头像变形问题。
- **世界书搜索**：已启用的世界书默认置顶。

### 🔧 其他

- 主界面版本号 patch 字段新增点击事件，点击可跳转项目地址。

## [1.18.0-patch-pre2] - 2026-07-27

第二个预览版本。在 1.1 基础上新增群聊增强、TTS/Stable Diffusion 扩展恢复、角色导出等功能，并同步上游多项修复。

### ✨ 新增

- **群聊定向发送与消息可见性**：群聊中支持定向发送消息（directed send）及按角色控制消息可见性，提升多人角色扮演的灵活度。
- **TTS 与 Stable Diffusion 扩展**：恢复 TTS（文字转语音）和 Stable Diffusion（AI 绘图）扩展支持，含对应后端端点。
- **角色卡批量导出**：支持将角色卡批量导出为 ZIP 压缩包。
- **正则扩展功能完善**：完善正则脚本扩展的文档与交互体验。

### 🌐 国际化

- **中文翻译**：为收件人选择（recipient selection）和多视角导出（multi-perspective export）界面添加中文翻译。

### 🐛 修复（上游同步）

- **macros**：修复管道符/过滤器导致宏中断的问题；修复 `{{//}}...{{///}}` 作用域注释宏未移除内容的问题；修复变量宏尾部空白字符问题；新增数组和对象按索引/键访问元素支持。
- **reasoning**：修复纯空白推理块控件显示问题；修复推理/工具调用边界情况。
- **world-info**：修复世界书重命名后 persona lore 未同步更新及聊天绑定 lore 名称过期问题。
- **markdown**：修复相同分隔符嵌套强调渲染问题。
- **chats**：修复聊天文件首行不可解析时静默重置的问题。
- **expressions**：补充缺失的 `default-expressions/null.png`。
- **novelai**：将用户订阅状态 API 调用切换至 `image.novelai.net`。

### 🔨 构建

- **Docker**：移除预构建镜像，改为本地构建。

### 📝 文档

- **README 中英双语**：README 翻译为英文并添加双语链接。
- 调整 README 目录结构。

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

## [1.18.0-patch-pre1] - 2026-07-17

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

