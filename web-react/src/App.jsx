import { useEffect, useState } from 'react'

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
  return (
    <Tag className="tile" {...(href && !editing ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}>
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
      {!editing && <div className="pop">{children}</div>}
    </Tag>
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

  // 仿 iOS 主屏:空白处长按(550ms,位移<8px)进入编辑,编辑中单击空白处退出
  useEffect(() => {
    const blank = (e) => e.button === 0 &&
      !e.target.closest('.tile, .fab, .modal, .overlay, .pop, .empty, a, button, input, select, textarea')
    let timer, sx, sy, fired = false
    const down = (e) => {
      if (editing || !blank(e)) return
      sx = e.clientX; sy = e.clientY
      timer = setTimeout(() => { fired = true; setEditing(true) }, 550)
    }
    const move = (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clearTimeout(timer) }
    const up = () => { clearTimeout(timer); setTimeout(() => { fired = false }, 0) }
    const click = (e) => {
      if (fired) return                    // 长按进入编辑的那次抬起,不算退出
      if (editing && blank(e)) setEditing(false)
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
  }, [editing])

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
      {adding && <AddForm kind={adding} onClose={() => setAdding(null)}
        onSaved={() => { setAdding(null); reload() }} />}
      <button className="fab theme-btn" title="切换亮暗模式"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </>
  )
}
