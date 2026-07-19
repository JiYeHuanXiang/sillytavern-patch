# SillyTavern (Personal Fork)

基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 的个人修改版，针对国内模型使用场景做了定制化改进。

> **注意：** 因 AGPL 许可证的传染性条款，此仓库为私有仓库，不对外分发。

## 修改内容

### 1. 国内模型思考模式开关

为部分国内混合模型（仅DeepSeek，其它模型未测试）添加了思考/推理模式的开关控制，方便在角色扮演场景中灵活切换。

### 2. 角色卡子目录支持

角色卡文件夹支持无限层级子目录，便于组织和管理大量角色卡。

### 3. UI 文件夹目录

在角色选择界面的 UI 中集成了文件夹目录浏览功能，可直接在界面上按目录浏览角色卡。

## 项目结构

```
ST/
├── public/          # 前端静态资源
├── src/             # 后端源码
├── data/            # 用户数据目录
│    └── default-user/characters/  # 角色卡目录（支持子目录）
├── config.yaml      # 服务配置
├── server.js        # 入口文件
└── package.json
```

## 配置

主要配置文件为 `config.yaml`，可配置端口、网络、SSL 等参数。详细说明参见[官方文档](https://docs.sillytavern.app/)。

## 致谢

本项目基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 开发，感谢原作者的杰出工作。

## 许可证

原始项目使用 AGPL-3.0 许可证。本仓库目前为私有仓库，暂不考虑分发。
