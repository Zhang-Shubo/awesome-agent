import { useEffect, useRef, useState } from 'react'

// AI 对话侧边栏(独立组件):后端 /api/chat 以 SSE 透传 claude CLI 的 stream-json。
// - 常驻挂载(关闭仅平移隐藏),对话与 sessionId 保留;多轮靠 --resume
// - 打字机平滑:突发到达的大块文本按帧匀速放出
// - 回答中可继续发消息:进队列,当前轮结束后依次发出;⏹ 可中断当前轮
// - 头部可切模型(默认 sonnet,haiku 更快,opus 更强),存 localStorage

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

// 图标既可以是 emoji 也可以是图片地址(与 App 的瓷贴同规则)
const isImgIcon = (s) => /^(https?:)?\/\//.test(s || '') || (s || '').startsWith('/')
const Ava = ({ icon, fallback = '✨' }) =>
  isImgIcon(icon) ? <img src={icon} alt="" /> : <>{icon || fallback}</>

// agent:登记簿里的 agent 条目(name/icon/summary/prompt),null = 默认 Claude。
// 会话按 agent 隔离:切换时保存当前对话,切回来还在;有 prompt 的 agent 由后端注入系统提示词。
export default function Chat({ open, agent, onClose }) {
  const [msgs, setMsgs] = useState([])   // { role:'user'|'ai', text, tools:[{name,hint}], status, live }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [stick, setStick] = useState(true)   // 吸附底部:用户上滑看历史时松开,不再被流式输出拽回去
  const [model, setModel] = useState(localStorage.getItem('chat-model') || '')
  const [perm, setPerm] = useState(localStorage.getItem('chat-perm') || '')   // '' 只读 | acceptEdits | bypassPermissions
  const modelRef = useRef(model)
  const permRef = useRef(perm)
  useEffect(() => { modelRef.current = model }, [model])
  useEffect(() => { permRef.current = perm }, [perm])
  const sidRef = useRef(null)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const queueRef = useRef([])       // 回答中新发的消息排队,依次跑
  const runningRef = useRef(false)
  const activeRef = useRef(null)    // 当前轮的 { ctrl, typer },供中断/清理

  // 会话按 agent 隔离:key = agent 名('' 为默认 Claude),切换时把当前对话存进抽屉,切回原样恢复
  const key = agent?.name || ''
  const keyRef = useRef(key)
  const storeRef = useRef({})
  const msgsRef = useRef(msgs)
  useEffect(() => { msgsRef.current = msgs }, [msgs])
  useEffect(() => {
    if (key === keyRef.current) return
    storeRef.current[keyRef.current] = { msgs: msgsRef.current, sid: sidRef.current }
    queueRef.current = []
    activeRef.current?.ctrl.abort()   // 换身份不带走上一个身份进行中的轮次
    const s = storeRef.current[key] || { msgs: [], sid: null }
    keyRef.current = key
    setMsgs(s.msgs)
    sidRef.current = s.sid
    setStick(true)
    inputRef.current?.focus()
  }, [key])

  useEffect(() => { if (stick) bodyRef.current?.scrollTo(0, 1e9) }, [msgs, stick])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const onScroll = () => {
    const el = bodyRef.current
    if (el) setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }
  const toLatest = () => { bodyRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }); setStick(true) }
  const pickModel = (e) => { setModel(e.target.value); localStorage.setItem('chat-model', e.target.value) }
  const pickPerm = (e) => { setPerm(e.target.value); localStorage.setItem('chat-perm', e.target.value) }

  // 跑一轮:创建 ai 气泡(记住下标——队列模式下它未必是最后一条),SSE 流式填充
  const runTurn = async (text) => {
    setStick(true)
    const turnKey = keyRef.current   // 本轮所属的 agent;切走后 upd 不再改到新对话的消息上
    let aiIdx = -1
    setMsgs((m) => { aiIdx = m.length; return [...m, { role: 'ai', text: '', tools: [], denied: [], status: '启动 claude…', live: true }] })
    const upd = (fn) => setMsgs((m) => {
      if (keyRef.current !== turnKey || aiIdx < 0 || !m[aiIdx]) return m
      const c = m.slice(); c[aiIdx] = fn(c[aiIdx]); return c
    })
    // 每轮独立的打字机
    const typer = { target: '', timer: null, done: false }
    const pump = () => {
      if (typer.timer) return
      typer.timer = setInterval(() => {
        upd((x) => {
          const shown = x.text.length
          if (shown >= typer.target.length) {
            if (typer.done) { clearInterval(typer.timer); typer.timer = null }
            return x
          }
          const step = Math.max(2, Math.ceil((typer.target.length - shown) / 12))
          return { ...x, text: typer.target.slice(0, shown + step), status: null }
        })
      }, 33)
    }
    const setTarget = (s) => { typer.target = s; pump() }
    const ctrl = new AbortController()
    activeRef.current = { ctrl, typer }
    // session id 也归本轮的 agent:切走后写回它的抽屉,不污染当前对话
    const setSid = (sid) => {
      if (keyRef.current === turnKey) sidRef.current = sid
      else if (storeRef.current[turnKey]) storeRef.current[turnKey].sid = sid
    }
    // acc = 本轮已定稿文本(工具调用会分多条 assistant 消息),streamed = 当前消息增量
    let acc = '', streamed = ''
    const seenTools = new Set()   // partial 快照会重复携带同一 tool_use,按 id 去重
    const toolNames = new Map()   // tool_use id → 名字,用于把授权拒绝对应回工具
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text, sessionId: sidRef.current,
          model: modelRef.current || undefined,
          permissionMode: permRef.current || undefined,
          agent: turnKey || undefined,
        }),
        signal: ctrl.signal,
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
            setSid(ev.session_id)
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
              toolNames.set(b.id, b.name)
              upd((x) => ({ ...x, status: `运行 ${b.name}…`, tools: [...x.tools, { name: b.name, hint: toolHint(b.input) }] }))
            }
          } else if (ev.type === 'user') {
            // 工具结果:headless 下未授权的写操作会被静默拒绝,这里把拒绝显性化
            for (const b of (ev.message?.content || [])) {
              if (b.type !== 'tool_result' || !b.is_error) continue
              const rtxt = typeof b.content === 'string' ? b.content
                : (Array.isArray(b.content) ? b.content.map((c) => c.text || '').join(' ') : '')
              if (/permission|granted|denied|授权/i.test(rtxt)) {
                const name = toolNames.get(b.tool_use_id) || '工具'
                upd((x) => (x.denied.includes(name) ? x : { ...x, denied: [...x.denied, name] }))
              }
            }
          } else if (ev.type === 'result') {
            if (ev.session_id) setSid(ev.session_id)
            if (ev.is_error && !acc) setTarget(String(ev.result || ev.subtype || '出错了'))
          } else if (ev.type === 'error') {
            setTarget((typer.target ? typer.target + '\n\n' : '') + `⚠️ ${ev.error}`)
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') setTarget((typer.target ? typer.target + '\n\n' : '') + '⏹ 已中断')
      else setTarget((typer.target ? typer.target + '\n\n' : '') + `⚠️ ${e.message || e}`)
    }
    if (!typer.target) typer.target = '(无输出)'
    typer.done = true
    if (typer.timer) { clearInterval(typer.timer); typer.timer = null }
    upd((x) => ({ ...x, text: typer.target, status: null, live: false }))
    activeRef.current = null
  }

  const drain = async () => {
    if (runningRef.current) return
    runningRef.current = true; setBusy(true)
    while (queueRef.current.length) await runTurn(queueRef.current.shift())
    runningRef.current = false; setBusy(false)
  }

  const submit = () => {
    const text = input.trim()
    if (!text) return
    setInput(''); setStick(true)
    setMsgs((m) => [...m, { role: 'user', text }])
    queueRef.current.push(text)
    drain()
  }

  const stop = () => activeRef.current?.ctrl.abort()

  const reset = () => {
    queueRef.current = []
    activeRef.current?.ctrl.abort()
    setMsgs([]); sidRef.current = null; inputRef.current?.focus()
  }

  // 被拒后的一键授权重试:切到「可编辑」,续会话让它补做刚才被拒的操作
  const retryWithPerm = () => {
    const v = 'acceptEdits'
    setPerm(v); permRef.current = v; localStorage.setItem('chat-perm', v)
    const text = '我已授权写入(可编辑文件),请继续完成刚才因权限被拒的操作。'
    setMsgs((m) => [...m, { role: 'user', text }])
    queueRef.current.push(text)
    drain()
  }

  const queued = queueRef.current.length

  return (
    <aside className={`chat ${open ? 'open' : ''}`}>
      <div className="chat-head">
        <div className="chat-head-top">
          <span className="chat-ava"><Ava icon={agent?.icon} /></span>
          <b>{agent?.name || 'AI 对话'}</b>
          <span className="chat-sub">{busy ? `思考中…${queued ? `(+${queued} 排队)` : ''}` : (sidRef.current ? '会话中' : '新会话')}</span>
          {busy && <button className="chat-hbtn" title="中断当前回答" onClick={stop}>⏹</button>}
          <button className="chat-hbtn" title="新对话" onClick={reset}>↺</button>
          <button className="chat-hbtn" title="收起" onClick={onClose}>✕</button>
        </div>
        <div className="chat-opts">
          <select className="chat-model" value={model} onChange={pickModel} title="切换模型(下一条生效)">
            <option value="">sonnet · 默认</option>
            <option value="haiku">haiku · 快</option>
            <option value="opus">opus · 强</option>
          </select>
          <select className="chat-model" value={perm} onChange={pickPerm} title="写入授权(下一条生效)">
            <option value="">🔒 只读 · 默认</option>
            <option value="acceptEdits">✏️ 可编辑文件</option>
            <option value="bypassPermissions">⚡ 全权限</option>
          </select>
        </div>
      </div>
      <div className="chat-body" ref={bodyRef} onScroll={onScroll}>
        {msgs.length === 0 && (
          agent?.prompt ? (
            <div className="chat-hello">
              <span className="hello-ava"><Ava icon={agent.icon} /></span>
              <b>{agent.name}</b><br />{agent.summary}
            </div>
          ) : (
            <div className="chat-hello">和跑在 ~/.awesome-agent 里的 Claude 对话。<br />问项目、查登记簿、读文件都可以。</div>
          )
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.tools?.length > 0 && (
              <span className="msg-tools">{groupTools(m.tools).map((t, j) => (
                <i key={j}>🔧 {t.name}{t.count > 1 ? ` ×${t.count}` : t.hint ? <em> {t.hint}</em> : null}</i>
              ))}</span>
            )}
            {m.role === 'ai'
              ? <span className={`md ${m.live ? 'live' : ''}`} dangerouslySetInnerHTML={{ __html: mdHtml(m.text) }} />
              : m.text}
            {m.denied?.length > 0 && (
              <span className="msg-denied">
                ⛔ {m.denied.join('、')} 需要写入授权,已被拒
                {!m.live && <button onClick={retryWithPerm}>授权并重试</button>}
              </span>
            )}
            {m.live && m.status && <span className="msg-status">{m.status}</span>}
          </div>
        ))}
      </div>
      {!stick && msgs.length > 0 && (
        <button className="chat-down" title="回到最新" onClick={toLatest}>↓</button>
      )}
      <div className="chat-input">
        <textarea ref={inputRef} rows="1" value={input}
          placeholder={busy ? '可以继续输入,回答完自动发出…' : '输入消息,Enter 发送'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }} />
        <button className="chat-send" disabled={!input.trim()} onClick={submit}>↑</button>
      </div>
    </aside>
  )
}
