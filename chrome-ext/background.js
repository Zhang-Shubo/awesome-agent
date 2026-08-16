// 面板地址不写死在代码里(公共仓库不放个人域名),存在 chrome.storage.sync,首次安装引导去选项页填写。
// 启动语义:浏览器会话首次醒来时,把启动自带的那个空白新标签页「原地替换」成面板——
// 第一屏即面板,不额外摊页面;之后 ⌘T 新建标签保持 Chrome 原生新标签页。
const getConfig = () => chrome.storage.sync.get({ url: '' })

// 已有面板标签页就聚焦,没有才新开(工具栏按钮用)
async function openPanel(cfg) {
  const url = (cfg.url || '').trim()
  if (!url) {
    chrome.runtime.openOptionsPage()
    return
  }
  const origin = new URL(url).origin
  const tabs = await chrome.tabs.query({ url: origin + '/*' })
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true })
    await chrome.windows.update(tabs[0].windowId, { focused: true })
  } else {
    await chrome.tabs.create({ url })
  }
}

const isNtp = (u) => !u || u === 'about:blank' || u.startsWith('chrome://newtab') || u.startsWith('chrome://new-tab-page')

// 启动第一屏:找到当前活动标签,若是空白新标签页则原地导航到面板;
// 若是恢复的会话页面(用户设置了"继续上次"),不动它,前台新开一个。
// 启动瞬间标签可能还没建好,轻量重试几次。
async function takeoverStartTab(url) {
  for (let i = 0; i < 10; i++) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (tab) {
      if (isNtp(tab.pendingUrl || tab.url)) await chrome.tabs.update(tab.id, { url })
      else await chrome.tabs.create({ url })
      return
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  await chrome.tabs.create({ url })
}

// onStartup 在 macOS 上对 unpacked 扩展不可靠,用 storage.session 做哨兵:
// 它随浏览器会话清空,本次会话第一次跑到这里就视为"启动"。三个入口谁先到谁触发。
let autoOpening = null
function maybeAutoOpen() {
  return (autoOpening ??= (async () => {
    const { opened } = await chrome.storage.session.get('opened')
    if (opened) return
    await chrome.storage.session.set({ opened: true })
    const cfg = await getConfig()
    if (cfg.url) await takeoverStartTab(cfg.url.trim())
  })())
}

chrome.runtime.onStartup.addListener(maybeAutoOpen)
chrome.windows.onCreated.addListener(maybeAutoOpen)
maybeAutoOpen()

chrome.action.onClicked.addListener(async () => {
  openPanel(await getConfig())
})

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return
  const cfg = await getConfig()
  if (!cfg.url) chrome.runtime.openOptionsPage()
})
