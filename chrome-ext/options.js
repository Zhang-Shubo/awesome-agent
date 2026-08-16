const $ = (id) => document.getElementById(id)

chrome.storage.sync.get({ url: '', openOnStartup: true }).then((cfg) => {
  $('url').value = cfg.url
  $('startup').checked = cfg.openOnStartup
})

$('save').addEventListener('click', async () => {
  const tip = $('tip')
  const url = $('url').value.trim()
  if (url) {
    try { new URL(url) } catch {
      tip.textContent = '地址格式不对,需要带 https:// 前缀'
      tip.className = 'err'
      return
    }
  }
  await chrome.storage.sync.set({ url, openOnStartup: $('startup').checked })
  tip.textContent = '已保存 ✓'
  tip.className = ''
})
