# chrome-ext — 面板启动伴侣

Chrome 启动时自动打开 awesome-agent 面板;点工具栏图标随时聚焦/打开面板(已开着就切过去,不会堆新标签)。

面板地址不写在代码里,安装后在选项页填一次,存浏览器 `chrome.storage.sync`(登录同一 Google 账号的 Chrome 会自动同步)。

## 安装

1. 打开 `chrome://extensions`,右上角开启「开发者模式」
2. 点「加载已解压的扩展程序」,选择本目录 `chrome-ext/`
3. 首次安装会自动弹出设置页,填面板地址(如 `https://agent.example.com`),保存
4. 重启 Chrome 验证:启动后自动打开面板

## 说明

- 「启动时自动打开」可在选项页关掉,只留工具栏一键直达
- `onStartup` 只在浏览器进程冷启动时触发;Chrome 常驻后台(macOS 关掉所有窗口但没退出)再开新窗口不算启动
