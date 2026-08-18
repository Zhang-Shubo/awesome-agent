// annotate.js — 划线高亮公共组件,零依赖纯浏览器 JS。
// 权威源: awesome-agent/templates/annotate.js;各项目拷贝到 public/ 静态引用,改动请回流权威源再重拷。
//
// 锚定策略(文字引用式,不依赖 DOM 结构,内容重渲染后仍可复位):
//   一条划线 = { id, quote(选中原文), prefix/suffix(前后文各~30字,消歧), note(评论,可空) }
//   复位时在容器纯文本里找 quote 出现位置,多处命中用 prefix/suffix 打分取最优;
//   跨元素节点用 TreeWalker 把区间逐文本节点包 <mark data-hl="id">(倒序包,避免偏移失效)。
// 存储由宿主应用负责,本组件只管 捕获选区 / 复位渲染 / 清除。
//
// 用法:
//   Annotate.capture(root)            → {quote, prefix, suffix} | null  (读当前选区)
//   Annotate.apply(root, highlights)  → 把划线数组渲染成 <mark>;有 note 的加 .has-note
//   Annotate.clear(root)              → 移除所有 <mark data-hl>
window.Annotate = (function () {
  // 容器纯文本 + 每个文本节点的全局偏移
  function textIndex(root) {
    const nodes = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let text = '', n
    while ((n = walker.nextNode())) { nodes.push({ node: n, start: text.length }); text += n.nodeValue }
    return { text, nodes }
  }

  function contextScore(text, pos, hl) {
    let s = 0
    if (hl.prefix && text.slice(Math.max(0, pos - hl.prefix.length), pos) === hl.prefix) s += 2
    if (hl.suffix) {
      const e = pos + hl.quote.length
      if (text.slice(e, e + hl.suffix.length) === hl.suffix) s += 2
    }
    return s
  }

  // 在容器纯文本里定位一条划线,返回 [start, end) 或 null
  function locate(root, hl) {
    const { text } = textIndex(root)
    const cands = []
    let i = -1
    while ((i = text.indexOf(hl.quote, i + 1)) !== -1) cands.push(i)
    if (!cands.length) return null
    cands.sort((a, b) => contextScore(text, b, hl) - contextScore(text, a, hl))
    return [cands[0], cands[0] + hl.quote.length]
  }

  // 把 [start, end) 包上 <mark>;倒序处理各文本节点段,splitText 不影响未处理段的偏移
  function wrap(root, start, end, id, hasNote) {
    const { nodes } = textIndex(root)
    const segs = []
    for (const { node, start: ns } of nodes) {
      const ne = ns + node.nodeValue.length
      const s = Math.max(start, ns), e = Math.min(end, ne)
      if (s < e) segs.push({ node, from: s - ns, to: e - ns })
    }
    for (const seg of segs.reverse()) {
      const r = document.createRange()
      r.setStart(seg.node, seg.from)
      r.setEnd(seg.node, seg.to)
      const mark = document.createElement('mark')
      mark.dataset.hl = String(id)
      if (hasNote) mark.classList.add('has-note')
      r.surroundContents(mark)  // 区间在单一文本节点内,surroundContents 安全
    }
  }

  function apply(root, highlights) {
    for (const hl of highlights || []) {
      const range = locate(root, hl)
      if (range) wrap(root, range[0], range[1], hl.id, !!(hl.note && hl.note.trim()))
    }
  }

  // 读当前选区(需在 root 内、非空),返回锚定三元组;ctx 为前后文长度
  function capture(root, ctx = 30) {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null
    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return null
    const quote = sel.toString()
    if (!quote.trim() || quote.length > 2000) return null
    // 选区起点的全局文本偏移:root 开头到选区起点的 Range 文本长度
    const pre = range.cloneRange()
    pre.selectNodeContents(root)
    pre.setEnd(range.startContainer, range.startOffset)
    const start = pre.toString().length
    const { text } = textIndex(root)
    return {
      quote,
      prefix: text.slice(Math.max(0, start - ctx), start),
      suffix: text.slice(start + quote.length, start + quote.length + ctx),
    }
  }

  function clear(root) {
    root.querySelectorAll('mark[data-hl]').forEach((m) => m.replaceWith(...m.childNodes))
    root.normalize()
  }

  return { apply, capture, clear, locate }
})()
