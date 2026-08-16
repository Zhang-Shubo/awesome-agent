# chrome-ext — 面板启动伴侣

把 awesome-agent 面板变成浏览器的第一屏:接管新标签页,Chrome 启动(默认打开新标签页)的首个页面就是面板,⌘T 新开标签也是面板。另有工具栏图标一键聚焦/打开面板(已开着就切过去,不会堆新标签)。

面板地址不写在代码里,安装后在选项页填一次,存浏览器 `chrome.storage.sync`(登录同一 Google 账号的 Chrome 会自动同步)。

## 安装

1. 打开 `chrome://extensions`,右上角开启「开发者模式」
2. 点「加载已解压的扩展程序」,选择本目录 `chrome-ext/`
3. 首次安装会自动弹出设置页,填面板地址(如 `https://agent.example.com`),保存
4. ⌘T 新开一个标签验证:应直接进入面板

## 说明

- Chrome 的启动行为需保持默认「打开新标签页标签」(chrome://settings/onStartup);若选了「继续浏览上次打开的网页」,启动恢复的是旧会话,不经过新标签页
- 扩展 API 在 macOS 上改不了「启动时打开特定网页」那个设置(`chrome_settings_overrides.startup_pages` 仅 Windows),newtab 接管是扩展能实现"启动即面板"的标准方式
- 若只想要"启动首页"而不想动 ⌘T 新标签,不用本扩展,直接在 chrome://settings/onStartup 选「打开特定网页」填面板地址即可
