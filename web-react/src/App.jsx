import { useEffect, useRef, useState } from 'react'
import Pet from './Pet.jsx'
import Chat from './Chat.jsx'

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

function Tile({ icon, fallback, name, href, editing, onDelete, onOpen, showPop = true, dragProps, children }) {
  // onOpen 优先于 href:agent 瓷贴点击打开对话侧栏,仓库链接挪进悬浮详情
  const Tag = href && !editing && !onOpen ? 'a' : 'div'
  // 点击进入后悬浮详情立即收起(纯 :hover 收不掉,点完鼠标还停在瓷贴上),移开鼠标后恢复
  const [popHidden, setPopHidden] = useState(false)
  return (
    <Tag className="tile" {...dragProps} onMouseLeave={() => setPopHidden(false)}
      onClick={() => { setPopHidden(true); if (!editing && onOpen) onOpen() }}
      {...(href && !editing && !onOpen ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}>
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
      {!editing && !popHidden && showPop && <div className="pop">{children}</div>}
    </Tag>
  )
}

// 小组件:登记簿声明 widget-api 的 app 在面板常驻一张实时内容卡(数据走 /api/widgets 服务端代理,约定见 docs/07)
const relTime = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (isNaN(m)) return ''
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} 小时前` : `${Math.round(h / 24)} 天前`
}

function Widget({ w, dragProps }) {
  return (
    <div className="widget" {...dragProps}>
      <div className="widget-head">
        <span className="widget-ico">{isImgIcon(w.icon) ? <img src={w.icon} alt="" /> : (w.icon || '📦')}</span>
        <b>{w.title}</b>
      </div>
      {w.ok ? (
        <div className="widget-list">
          {w.items.slice(0, 6).map((it, i) => (
            <a key={i} href={it.url || w.link} target="_blank" rel="noopener noreferrer">
              <span className="wi-text">{it.text}</span>
              {it.time && <span className="wi-time">{relTime(it.time)}</span>}
            </a>
          ))}
          {!w.items.length && <p className="widget-err">暂无内容</p>}
        </div>
      ) : (
        <p className="widget-err">数据暂不可用:{w.error}</p>
      )}
      {w.link && <a className="widget-more" href={w.link} target="_blank" rel="noopener noreferrer">查看全部 →</a>}
    </div>
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
  const [loaded, setLoaded] = useState(false)   // 首次数据未回来前不渲染空态,避免刷新时闪「还没有条目」
  const [theme, setTheme] = useState(localStorage.getItem('panel-theme') || 'light')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(null)   // null | 'apps' | 'agents'
  const [chatOpen, setChatOpen] = useState(false)
  // 对话默认就是 claude-code 身份(登记条目加载前先用同名占位,不存在独立的「默认对话」);点 agent 瓷贴则以其身份对话
  const [chatAgent, setChatAgent] = useState({ name: 'claude-code', icon: '/icons/claude-code.svg' })
  // 偏好:noPop 关掉悬浮简介,noPet 关掉宠物;存 localStorage
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('panel-prefs')) || {} } catch { return {} }
  })
  const [setsOpen, setSetsOpen] = useState(false)
  const togglePref = (k) => setPrefs((p) => {
    const n = { ...p, [k]: !p[k] }
    localStorage.setItem('panel-prefs', JSON.stringify(n))
    return n
  })
  // 设置弹层:点外面自动收起
  useEffect(() => {
    if (!setsOpen) return
    const close = (e) => { if (!e.target.closest('.setpop, .set-btn')) setSetsOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [setsOpen])

  const reload = () =>
    Promise.all([
      fetch('/api/apps').then((r) => r.json()),
      fetch('/api/agents').then((r) => r.json()),
    ]).then(([p, a]) => { setApps(p.data); setAgents(a.data); setLoaded(true) })

  useEffect(() => { reload() }, [])

  // 小组件:进页拉一次,之后 5 分钟一轮(面板是启动台不是监控台);页面在后台时跳过,
  // 切回前台立即补拉(后台标签页里首次加载会错过首拉;服务端有 60s 缓存,不会打穿上游)
  const [widgets, setWidgets] = useState([])
  useEffect(() => {
    const pull = () => { if (!document.hidden) fetch('/api/widgets').then((r) => r.json()).then((d) => setWidgets(d.data || [])).catch(() => {}) }
    pull()
    const t = setInterval(pull, 300_000)
    document.addEventListener('visibilitychange', pull)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', pull) }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('panel-theme', theme)
  }, [theme])

  // 对话抽屉开着时,点击抽屉外的空白处收起(交互控件各自管理开合,不在此列)
  useEffect(() => {
    if (!chatOpen) return
    const h = (e) => {
      if (e.button !== 0) return
      if (e.target.closest('.chat, .fab, .tile, .modal, .overlay, .pop, .setpop, .pet, .widget, a, button, input, select, textarea')) return
      setChatOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [chatOpen])

  // 仿 iOS 主屏:空白处长按(550ms,位移<8px)进入编辑,编辑中单击空白处退出。
  // 监听器只挂一次,editing 经 ref 读——若依赖 [editing] 重挂,fired 标志会被重置,
  // 长按松开的 click 就被误判成"单击空白"而立即退出编辑。
  const editingRef = useRef(editing)
  useEffect(() => { editingRef.current = editing }, [editing])
  useEffect(() => {
    const blank = (e) => e.button === 0 &&
      !e.target.closest('.tile, .fab, .modal, .overlay, .pop, .empty, .pet, .chat, .setpop, .widget, a, button, input, select, textarea')
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

  // 拖动排序(编辑模式下,App/Agent 瓷贴与 Widget 卡片通用):HTML5 DnD,拖入别的条目时实时换位,
  // 松手把该分组的 name 顺序 POST /api/order 持久化(存面板机,跨设备生效)
  const dragRef = useRef(null)   // { kind, index }
  const arrMove = (arr, from, to) => { const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a }
  const saveOrder = (kind, list) =>
    fetch('/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [kind]: list.map((x) => x.name) }) }).catch(() => {})
  const dragProps = (kind, setItems, i) => editing ? {
    draggable: true,
    onDragStart: (e) => { dragRef.current = { kind, index: i }; e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e) => {
      e.preventDefault()
      const d = dragRef.current
      if (!d || d.kind !== kind || d.index === i) return
      setItems((cur) => arrMove(cur, d.index, i))
      d.index = i
    },
    onDragEnd: () => { setItems((cur) => { saveOrder(kind, cur); return cur }); dragRef.current = null },
  } : undefined

  const setterOf = { apps: setApps, agents: setAgents }
  const group = (kind, title, items, renderPop, fallbackIcon, onOpen) => (
    <section>
      <h2>{title}</h2>
      {items.length || editing ? (
        <div className={`launcher ${editing ? 'editing' : ''}`}>
          {items.map((it, i) => (
            <Tile key={it.name} icon={it.icon || fallbackIcon(it)} fallback={fallbackIcon(it)} name={it.name}
              href={it.url || (it.repo && repoUrl(it.repo))}
              editing={editing} onDelete={() => del(kind, it.name)}
              onOpen={onOpen && (() => onOpen(it))} showPop={!prefs.noPop}
              dragProps={dragProps(kind, setterOf[kind], i)}>
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
      ) : loaded ? (
        <div className="empty">还没有条目 —— 长按页面空白处进入编辑模式新增。</div>
      ) : null}
    </section>
  )

  return (
    <>
      <div className="aurora"><i /><i /><i /></div>
      <div className="shell">
        {group('apps', 'App', apps, (p) => (
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
            {a.repo && <p className="pop-entry"><a href={repoUrl(a.repo)} target="_blank" rel="noopener noreferrer">仓库 ↗</a></p>}
            <p className="pop-hint">点击开始对话</p>
          </>
        ), (a) => KIND_ICON[a.kind] || '🦾',
        (a) => { setChatAgent(a); setChatOpen(true) })}
        {widgets.length > 0 && !prefs.noWidget && (
          <section>
            <h2>Widget</h2>
            <div className={`widgets ${editing ? 'editing' : ''}`}>
              {widgets.map((w, i) => <Widget key={w.name} w={w} dragProps={dragProps('widgets', setWidgets, i)} />)}
            </div>
          </section>
        )}
      </div>
      {!prefs.noPet && <Pet />}
      {adding && <AddForm kind={adding} onClose={() => setAdding(null)}
        onSaved={() => { setAdding(null); reload() }} />}
      <button className="fab set-btn" title="设置" onClick={() => setSetsOpen((v) => !v)}>⚙️</button>
      {setsOpen && (
        <div className="setpop">
          <label className="setrow">悬浮显示简介
            <input type="checkbox" checked={!prefs.noPop} onChange={() => togglePref('noPop')} /></label>
          <label className="setrow">桌面宠物
            <input type="checkbox" checked={!prefs.noPet} onChange={() => togglePref('noPet')} /></label>
          <label className="setrow">小组件
            <input type="checkbox" checked={!prefs.noWidget} onChange={() => togglePref('noWidget')} /></label>
          <label className="setrow">暗色模式
            <input type="checkbox" checked={theme === 'dark'}
              onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')} /></label>
        </div>
      )}
      <Chat open={chatOpen} agent={chatAgent} onClose={() => setChatOpen(false)}
        onSwitch={(a) => { setChatAgent(a); setChatOpen(true) }} />
      <button className="fab chat-btn" title="AI 对话"
        onClick={() => {
          if (chatOpen) return setChatOpen(false)
          setChatAgent(agents.find((a) => a.name === 'claude-code') || chatAgent)
          setChatOpen(true)
        }}>✨</button>
    </>
  )
}
