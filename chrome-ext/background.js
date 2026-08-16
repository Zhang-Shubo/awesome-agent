// 面板地址不写死在代码里(公共仓库不放个人域名),存在 chrome.storage.sync,首次安装引导去选项页填写。
const DEFAULTS = { url: '', openOnStartup: true }

const getConfig = () => chrome.storage.sync.get(DEFAULTS)

// 已有面板标签页就聚焦,没有才新开,避免每次启动/点击都堆一个新标签
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

// onStartup 在 macOS 上不可靠(Chrome 常驻后台、unpacked 扩展偶发不触发),
// 改用 storage.session 做哨兵:它随浏览器会话清空,本次会话第一次跑到这里就视为"启动"。
// service worker 醒来的每个入口(onStartup/开窗/顶层)都走一遍,谁先到谁触发,只开一次。
let autoOpening = null   // 启动瞬间三个入口并发,进程内锁保证只跑一次
function maybeAutoOpen() {
  return (autoOpening ??= (async () => {
    const { opened } = await chrome.storage.session.get('opened')
    if (opened) return
    await chrome.storage.session.set({ opened: true })
    const cfg = await getConfig()
    if (cfg.openOnStartup && cfg.url) await openPanel(cfg)
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
