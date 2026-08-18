// md.js — 极简 markdown 渲染,零依赖公共组件(纯浏览器 JS,亦可 node require 做测试)。
// 权威源: awesome-agent/templates/md.js;各项目拷贝到 public/ 静态引用,改动请回流权威源再重拷。
// 用法: renderMd(src, { jumpBase }) → HTML 字符串(样式由宿主页面的 .md/.tbl 类负责)
// 能力: #标题 / -列表 / |表格| / >引用 / 分隔线 / **粗体** / `行内码` / ![图片]() / [链接]()
//       [[wikilink]] 剥壳 / 文件头 frontmatter 剥离
//       jumpBase: 行首 [MM:SS] 转为 `${jumpBase}${秒}s` 跳转链接(视频转录用),不传则原样输出
;(function () {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  function renderMd(src, { jumpBase = '' } = {}) {
    src = String(src || '').replace(/^---\n[\s\S]*?\n---\n?/, '')
    const inline = (s) => {
      s = esc(s)
        .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/!\[[^\]]*\]\(([^)\s"]+)\)/g, '<img src="$1" loading="lazy">')
        .replace(/\[([^\]]+)\]\((https?:[^)\s"]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
      if (jumpBase) s = s.replace(/^\[(\d+):(\d{2})\]/, (m, mm, ss) =>
        `<a class="ts" href="${jumpBase}${Number(mm) * 60 + Number(ss)}s" target="_blank" rel="noopener">${mm}:${ss}</a>`)
      return s
    }
    const tbl = (rows) => {
      const [h, ...body] = rows
      return `<div class="tbl"><table><thead><tr>${h.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    }
    let out = '', list = false, table = null
    const closeList = () => { if (list) { out += '</ul>'; list = false } }
    const closeTable = () => { if (table) { out += tbl(table); table = null } }
    for (const line of src.split('\n')) {
      const t = line.trim()
      if (t.startsWith('|') && t.endsWith('|') && t.length > 2) {
        closeList()
        if (!table) table = []
        if (!/^\|[\s:|-]+\|$/.test(t)) table.push(t.slice(1, -1).split('|').map((c) => inline(c.trim())))
        continue
      }
      closeTable()
      if (list && !/^[-*] /.test(t)) closeList()
      if (!t) continue
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { out += '<hr>'; continue }
      if (t.startsWith('#')) out += `<h3>${inline(t.replace(/^#+\s*/, ''))}</h3>`
      else if (t.startsWith('> ')) out += `<blockquote>${inline(t.slice(2))}</blockquote>`
      else if (/^[-*] /.test(t)) { if (!list) { out += '<ul>'; list = true } out += `<li>${inline(t.slice(2))}</li>` }
      else out += `<p>${inline(t)}</p>`
    }
    closeList(); closeTable()
    return out
  }

  if (typeof window !== 'undefined') window.renderMd = renderMd
  if (typeof module !== 'undefined' && module.exports) module.exports = { renderMd }
})()
