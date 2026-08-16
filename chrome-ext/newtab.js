// 新标签页即面板:配置了地址就直接跳过去(replace 不留历史,后退不会绕回来),
// 没配置就显示引导。
chrome.storage.sync.get({ url: '' }).then(({ url }) => {
  if (url.trim()) {
    location.replace(url.trim())
  } else {
    document.getElementById('setup').style.display = 'block'
    document.getElementById('go').addEventListener('click', () => chrome.runtime.openOptionsPage())
  }
})
