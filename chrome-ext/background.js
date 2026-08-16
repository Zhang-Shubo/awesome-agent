// 面板地址不写死在代码里(公共仓库不放个人域名),存在 chrome.storage.sync,首次安装引导去选项页填写。
// 启动首屏由 newtab 接管实现(见 newtab.js),后台不再主动开标签,避免在恢复的会话上多摊一页。
const getConfig = () => chrome.storage.sync.get({ url: '' })

// 已有面板标签页就聚焦,没有才新开,避免每次点击都堆一个新标签
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

chrome.action.onClicked.addListener(async () => {
  openPanel(await getConfig())
})

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return
  const cfg = await getConfig()
  if (!cfg.url) chrome.runtime.openOptionsPage()
})
