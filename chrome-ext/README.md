# chrome-ext — 面板启动伴侣

Chrome 启动时,把启动自带的那个空白新标签页**原地替换**成 awesome-agent 面板——第一屏即面板,不额外摊页面;之后 ⌘T 新建的标签保持 Chrome 原生新标签页。另有工具栏图标一键聚焦/打开面板(已开着就切过去,不会堆新标签)。

面板地址不写在代码里,安装后在选项页填一次,存浏览器 `chrome.storage.sync`(登录同一 Google 账号的 Chrome 会自动同步)。

## 安装

1. 打开 `chrome://extensions`,右上角开启「开发者模式」
2. 点「加载已解压的扩展程序」,选择本目录 `chrome-ext/`
3. 首次安装会自动弹出设置页,填面板地址(如 `https://agent.example.com`),保存
4. 完全退出 Chrome(macOS ⌘Q)再启动:第一屏应是面板;⌘T 新开标签应是原生新标签页

## 实现说明

- 启动检测:`onStartup` 在 macOS 上对 unpacked 扩展不可靠,改用 `chrome.storage.session` 哨兵(随浏览器会话清空,本会话首次醒来即视为启动),`onStartup`/`windows.onCreated`/顶层三入口触发,进程内锁去重
- 第一屏替换:仅当当前活动标签是空白新标签页(`chrome://newtab` 等)才原地导航;若设置了「继续浏览上次打开的网页」,恢复的页面不动,改为前台新开一个
- 扩展重载(chrome://extensions 的 ↻)也会清会话哨兵,可当作即时验证入口
- 扩展 API 在 macOS 上改不了「启动时打开特定网页」那个原生设置(`chrome_settings_overrides.startup_pages` 仅 Windows);想要完全原生的方案是 chrome://settings/onStartup 手动配置,本扩展是它的自动化替代
