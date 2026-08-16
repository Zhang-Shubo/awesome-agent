import { useEffect, useRef, useState } from 'react'
import Pet from './Pet.jsx'

// 启动台式面板:APP 与 Agent 两组小图标,详情悬浮显示。
// 编辑模式:新增/删除,写操作全部落私有登记簿(见 docs/07),公共库不被 web 改动。
const STATUS = { active: '运行中', paused: '暂停', archived: '已归档' }
const KIND = { interactive: '交互对话', service: '常驻服务', scheduled: '定时任务' }
const KIND_ICON = { interactive: '💬', service: '🛰️', scheduled: '⏰' }

const repoUrl = (r) => {
  const m = r.match(/^git@([^:]+):(.+?)(\.git)?$/)
  return m ? `https://${m[1]}/${m[2]}` : r
}

// 图标既可以是 emoji,也可以是图片地址(项目自带的 favicon);图片加载失败退回 emoji
const isImgIcon = (s) => /^(https?:)?\/\//.test(s || '') || (s || '').startsWith('/')

function Tile({ icon, fallback, name, href, editing, onDelete, children }) {
  const Tag = href && !editing ? 'a' : 'div'
  // 点击进入后悬浮详情立即收起(纯 :hover 收不掉,点完鼠标还停在瓷贴上),移开鼠标后恢复
  const [popHidden, setPopHidden] = useState(false)
  return (
    <Tag className="tile" onClick={() => setPopHidden(true)} onMouseLeave={() => setPopHidden(false)}
      {...(href && !editing ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {editing && (
        <button className="tile-del" title="删除" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}>✕</button>
      )}
      <span className="tile-icon">
        {isImgIcon(icon)
          ? <img src={icon} alt="" loading="lazy"
              onError={(e) => e.currentTarget.replaceWith(fallback || '📦')} />
          : icon}
      </span>
      <span className="tile-name">{name}</span>
      {!editing && !popHidden && <div className="pop">{children}</div>}
    </Tag>
  )
}

// 极简 markdown → html(先转义再上标记,安全):#标题 / -与1.列表 / |表格| / >引用 / ---
// / ```代码块 / **粗** / `码` / [链接](url)。与 fin-jargon 的渲染器同族。
const escMd = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
function mdHtml(src) {
  const inline = (s) => escMd(s)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
  let out = '', list = false, table = null, fence = null
  const closeList = () => { if (list) { out += '</ul>'; list = false } }
  const closeTable = () => {
    if (!table) return
    const [h, ...b] = table
    out += `<div class="tblwrap"><table><thead><tr>${h.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
      b.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    table = null
  }
  for (const line of (src || '').split('\n')) {
    if (fence !== null) {
      if (line.trim().startsWith('```')) { out += `<pre>${escMd(fence)}</pre>`; fence = null }
      else fence += (fence ? '\n' : '') + line
      continue
    }
    const t = line.trim()
    if (t.startsWith('```')) { closeList(); closeTable(); fence = ''; continue }
    if (t.startsWith('|') && t.endsWith('|') && t.length > 2) {
      closeList()
      if (!table) table = []
      if (!/^\|[\s:|-]+\|$/.test(t)) table.push(t.slice(1, -1).split('|').map((c) => inline(c.trim())))
      continue
    }
    closeTable()
    if (list && !/^[-*] |^\d+[.)] /.test(t)) closeList()
    if (!t) continue
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { out += '<hr>'; continue }
    if (t.startsWith('#')) { out += `<h4>${inline(t.replace(/^#+\s*/, ''))}</h4>`; continue }
    if (t.startsWith('> ')) { out += `<blockquote>${inline(t.slice(2))}</blockquote>`; continue }
    if (/^[-*] /.test(t)) { if (!list) { out += '<ul>'; list = true } out += `<li>${inline(t.slice(2))}</li>`; continue }
    if (/^\d+[.)] /.test(t)) { if (!list) { out += '<ul>'; list = true } out += `<li>${inline(t.replace(/^\d+[.)] /, ''))}</li>`; continue }
    out += `<p>${inline(t)}</p>`
  }
  closeList(); closeTable()
  if (fence !== null) out += `<pre>${escMd(fence)}</pre>`   // 流式中未闭合的代码块也先渲染
  return out
}

// 工具调用参数摘要:胶囊里带一眼能看懂的入参提示
const toolHint = (input = {}) => {
  const v = input.command || input.file_path || input.pattern || input.url || input.path || input.query || ''
  return String(v).replace(/\s+/g, ' ').slice(0, 42)
}
// 同名工具聚合(保持首次出现顺序):连读 12 个文件显示成一颗「Read ×12」,不刷屏
const groupTools = (tools) => {
  const order = [], byName = new Map()
  for (const t of tools) {
    if (!byName.has(t.name)) { byName.set(t.name, { name: t.name, count: 0, hint: '' }); order.push(byName.get(t.name)) }
    const g = byName.get(t.name); g.count++; g.hint = t.hint || g.hint
  }
  return order
}

// AI 对话侧边栏:后端 /api/chat 以 SSE 透传 claude CLI 的 stream-json。
// 常驻挂载(关闭仅平移隐藏),对话与 sessionId 得以保留;多轮靠 --resume。
// 流式渲染做了打字机平滑:网络突发到达的大块文本按帧匀速放出,消除一卡一卡。
function Chat({ open, onClose }) {
  const [msgs, setMsgs] = useState([])   // { role:'user'|'ai', text, tools:[{name,hint}], status }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [stick, setStick] = useState(true)   // 吸附底部:用户上滑看历史时松开,不再被流式输出拽回去
  const sidRef = useRef(null)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const typer = useRef({ target: '', timer: null, done: true })

  useEffect(() => { if (stick) bodyRef.current?.scrollTo(0, 1e9) }, [msgs, stick])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const onScroll = () => {
    const el = bodyRef.current
    if (el) setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }
  const toLatest = () => { bodyRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }); setStick(true) }

  const upd = (fn) => setMsgs((m) => { const c = m.slice(); c[c.length - 1] = fn(c[c.length - 1]); return c })

  // 打字机泵:每帧把已显示文本向 target 逼近,差距越大步子越大(突发也只需 ~0.5s 追平)
  const pump = () => {
    const t = typer.current
    if (t.timer) return
    t.timer = setInterval(() => {
      upd((x) => {
        const shown = x.text.length
        if (shown >= t.target.length) {
          if (t.done) { clearInterval(t.timer); t.timer = null }
          return x
        }
        const step = Math.max(2, Math.ceil((t.target.length - shown) / 12))
        return { ...x, text: t.target.slice(0, shown + step), status: null }
      })
    }, 33)
  }
  const flushTyper = () => {
    const t = typer.current
    t.done = true
    if (t.timer) { clearInterval(t.timer); t.timer = null }
    upd((x) => ({ ...x, text: t.target, status: null }))
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput(''); setBusy(true); setStick(true)
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'ai', text: '', tools: [], status: '启动 claude…' }])
    const t = typer.current
    t.target = ''; t.done = false
    // acc = 本轮已定稿文本(工具调用会分多条 assistant 消息),streamed = 当前消息增量
    let acc = '', streamed = ''
    const seenTools = new Set()   // partial 快照会重复携带同一 tool_use,按 id 去重
    const setTarget = (s) => { t.target = s; pump() }
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sidRef.current }),
      })
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop()
        for (const raw of lines) {
          if (!raw.startsWith('data: ')) continue
          let ev; try { ev = JSON.parse(raw.slice(6)) } catch { continue }
          if (ev.type === 'system' && ev.subtype === 'init') {
            sidRef.current = ev.session_id
            upd((x) => ({ ...x, status: `思考中…(${ev.model || 'claude'})` }))
          } else if (ev.type === 'stream_event' && ev.event?.delta?.type === 'text_delta') {
            streamed += ev.event.delta.text
            setTarget(acc + streamed)
          } else if (ev.type === 'assistant') {
            const blocks = ev.message?.content || []
            const txt = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('')
            if (txt) { acc += (acc ? '\n\n' : '') + txt; streamed = ''; setTarget(acc) }
            for (const b of blocks) if (b.type === 'tool_use' && !seenTools.has(b.id)) {
              seenTools.add(b.id)
              upd((x) => ({ ...x, status: `运行 ${b.name}…`, tools: [...x.tools, { name: b.name, hint: toolHint(b.input) }] }))
            }
          } else if (ev.type === 'result') {
            if (ev.session_id) sidRef.current = ev.session_id
            if (ev.is_error && !acc) setTarget(String(ev.result || ev.subtype || '出错了'))
          } else if (ev.type === 'error') {
            setTarget((t.target ? t.target + '\n\n' : '') + `⚠️ ${ev.error}`)
          }
        }
      }
    } catch (e) {
      setTarget((t.target ? t.target + '\n\n' : '') + `⚠️ ${e.message || e}`)
    }
    if (!t.target) t.target = '(无输出)'
    flushTyper()
    setBusy(false)
  }

  const reset = () => {
    const t = typer.current
    if (t.timer) { clearInterval(t.timer); t.timer = null }
    t.target = ''; t.done = true
    setMsgs([]); sidRef.current = null; inputRef.current?.focus()
  }

  return (
    <aside className={`chat ${open ? 'open' : ''}`}>
      <div className="chat-head">
        <b>AI 对话</b>
        <span className="chat-sub">{busy ? '思考中…' : (sidRef.current ? '会话中' : '新会话')}</span>
        <button className="chat-hbtn" title="新对话" onClick={reset}>↺</button>
        <button className="chat-hbtn" title="收起" onClick={onClose}>✕</button>
      </div>
      <div className="chat-body" ref={bodyRef} onScroll={onScroll}>
        {msgs.length === 0 && <div className="chat-hello">和跑在 ~/.awesome-agent 里的 Claude 对话。<br />问项目、查登记簿、读文件都可以。</div>}
        {msgs.map((m, i) => {
          const live = busy && i === msgs.length - 1
          return (
            <div key={i} className={`msg ${m.role}`}>
              {m.tools?.length > 0 && (
                <span className="msg-tools">{groupTools(m.tools).map((t, j) => (
                  <i key={j}>🔧 {t.name}{t.count > 1 ? ` ×${t.count}` : t.hint ? <em> {t.hint}</em> : null}</i>
                ))}</span>
              )}
              {m.role === 'ai'
                ? <span className={`md ${live ? 'live' : ''}`} dangerouslySetInnerHTML={{ __html: mdHtml(m.text) }} />
                : m.text}
              {live && m.status && <span className="msg-status">{m.status}</span>}
            </div>
          )
        })}
      </div>
      {!stick && msgs.length > 0 && (
        <button className="chat-down" title="回到最新" onClick={toLatest}>↓</button>
      )}
      <div className="chat-input">
        <textarea ref={inputRef} rows="1" value={input} placeholder="输入消息,Enter 发送"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
        <button className="chat-send" disabled={busy || !input.trim()} onClick={send}>↑</button>
      </div>
    </aside>
  )
}

function AddForm({ kind, onClose, onSaved }) {
  const isAgent = kind === 'agents'
  const [f, setF] = useState({ link: '', name: '', icon: '', repo: '', summary: '', status: 'active', agentKind: 'interactive', entry: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    let body
    if (isAgent) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(f.name)) return setErr('名字需为小写字母/数字/横线,如 my-agent')
      body = { name: f.name, icon: f.icon, repo: f.repo, summary: f.summary, status: f.status, kind: f.agentKind, entry: f.entry }
    } else {
      if (!f.link.trim()) return setErr('填一个链接(仓库或服务地址)')
      body = { link: f.link.trim() }
    }
    setErr(''); setBusy(true)
    try {
      const r = await fetch(`/api/${kind}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!d.ok) return setErr(d.error || '保存失败')
      onSaved()
    } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {isAgent ? (
          <>
            <h3>新增 Agent<span className="modal-sub">写入私有登记簿</span></h3>
            <div className="field"><label>名字 *(kebab-case)</label>
              <input value={f.name} onChange={set('name')} placeholder="my-agent" /></div>
            <div className="field-row">
              <div className="field"><label>图标(emoji)</label>
                <input value={f.icon} onChange={set('icon')} placeholder="🦾" /></div>
              <div className="field"><label>类型</label>
                <select value={f.agentKind} onChange={set('agentKind')}>
                  {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
            </div>
            <div className="field"><label>入口命令</label>
              <input value={f.entry} onChange={set('entry')} placeholder="claude" /></div>
            <div className="field"><label>简介</label>
              <textarea rows="3" value={f.summary} onChange={set('summary')} placeholder="一句话说清它是干什么的" /></div>
          </>
        ) : (
          <>
            <h3>新增 APP<span className="modal-sub">填链接,AI 解析后自动登记</span></h3>
            <div className="field"><label>链接 *(仓库或服务地址)</label>
              <input value={f.link} onChange={set('link')} disabled={busy}
                placeholder="https://github.com/you/my-app 或 http://127.0.0.1:8xxx"
                onKeyDown={(e) => e.key === 'Enter' && !busy && save()} /></div>
            <div className="form-hint">名字、图标、简介由 claude 读取链接内容自动生成,写入私有登记簿。</div>
          </>
        )}
        {err && <div className="form-err">{err}</div>}
        <div className="actions">
          <button className="btn2" onClick={onClose} disabled={busy}>取消</button>
          <button className="btn2 primary" onClick={save} disabled={busy}>
            {busy ? '解析中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [apps, setApps] = useState([])
  const [agents, setAgents] = useState([])
  const [theme, setTheme] = useState(localStorage.getItem('panel-theme') || 'light')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(null)   // null | 'apps' | 'agents'
  const [chatOpen, setChatOpen] = useState(false)

  const reload = () =>
    Promise.all([
      fetch('/api/apps').then((r) => r.json()),
      fetch('/api/agents').then((r) => r.json()),
    ]).then(([p, a]) => { setApps(p.data); setAgents(a.data) })

  useEffect(() => { reload() }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('panel-theme', theme)
  }, [theme])

  // 仿 iOS 主屏:空白处长按(550ms,位移<8px)进入编辑,编辑中单击空白处退出。
  // 监听器只挂一次,editing 经 ref 读——若依赖 [editing] 重挂,fired 标志会被重置,
  // 长按松开的 click 就被误判成"单击空白"而立即退出编辑。
  const editingRef = useRef(editing)
  useEffect(() => { editingRef.current = editing }, [editing])
  useEffect(() => {
    const blank = (e) => e.button === 0 &&
      !e.target.closest('.tile, .fab, .modal, .overlay, .pop, .empty, .pet, .chat, a, button, input, select, textarea')
    let timer, sx, sy, fired = false
    const down = (e) => {
      if (editingRef.current || !blank(e)) return
      sx = e.clientX; sy = e.clientY
      timer = setTimeout(() => { fired = true; setEditing(true) }, 550)
    }
    const move = (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clearTimeout(timer) }
    const up = () => { clearTimeout(timer); setTimeout(() => { fired = false }, 0) }
    const click = (e) => {
      if (fired) return                    // 长按进入编辑的那次抬起,不算退出
      if (editingRef.current && blank(e)) setEditing(false)
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    document.addEventListener('click', click)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', down)
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.removeEventListener('click', click)
    }
  }, [])

  const del = async (kind, name) => {
    await fetch(`/api/${kind}?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    reload()
  }

  const group = (kind, title, items, renderPop, fallbackIcon) => (
    <section>
      <h2>{title}</h2>
      {items.length || editing ? (
        <div className={`launcher ${editing ? 'editing' : ''}`}>
          {items.map((it) => (
            <Tile key={it.name} icon={it.icon || fallbackIcon(it)} fallback={fallbackIcon(it)} name={it.name}
              href={it.url || (it.repo && repoUrl(it.repo))}
              editing={editing} onDelete={() => del(kind, it.name)}>
              {renderPop(it)}
            </Tile>
          ))}
          {editing && (
            <button className="tile add" onClick={() => setAdding(kind)}>
              <span className="tile-icon">＋</span>
              <span className="tile-name">新增</span>
            </button>
          )}
        </div>
      ) : (
        <div className="empty">还没有条目 —— 长按页面空白处进入编辑模式新增。</div>
      )}
    </section>
  )

  return (
    <>
      <div className="aurora"><i /><i /><i /></div>
      <div className="shell">
        {group('apps', 'APP', apps, (p) => (
          <>
            <p className="pop-title">{p.name}
              <span className={`status ${p.status}`}><i />{STATUS[p.status] || p.status}</span></p>
            {p.summary && <p className="pop-body">{p.summary}</p>}
          </>
        ), () => '📦')}
        {group('agents', 'Agent', agents, (a) => (
          <>
            <p className="pop-title">{a.name}
              <span className="status"><i />{KIND[a.kind] || a.kind || '—'}</span></p>
            {a.summary && <p className="pop-body">{a.summary}</p>}
            {a.entry && <p className="pop-entry"><code>{a.entry}</code></p>}
          </>
        ), (a) => KIND_ICON[a.kind] || '🦾')}
      </div>
      <Pet />
      {adding && <AddForm kind={adding} onClose={() => setAdding(null)}
        onSaved={() => { setAdding(null); reload() }} />}
      <Chat open={chatOpen} onClose={() => setChatOpen(false)} />
      <button className="fab chat-btn" title="AI 对话" onClick={() => setChatOpen((v) => !v)}>✨</button>
      <button className="fab theme-btn" title="切换亮暗模式"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </>
  )
}
