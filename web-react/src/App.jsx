import { useEffect, useState } from 'react'

// 启动台式面板:APP(项目)与 Agent 两组小图标,详情悬浮图标才显示。
const STATUS = { active: '运行中', paused: '暂停', archived: '已归档' }
const KIND = { interactive: '交互对话', service: '常驻服务', scheduled: '定时任务' }
const KIND_ICON = { interactive: '💬', service: '🛰️', scheduled: '⏰' }

const repoUrl = (r) => {
  const m = r.match(/^git@([^:]+):(.+?)(\.git)?$/)
  return m ? `https://${m[1]}/${m[2]}` : r
}

function Tile({ icon, name, href, children }) {
  const Tag = href ? 'a' : 'div'
  return (
    <Tag className="tile" {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <span className="tile-icon">{icon}</span>
      <span className="tile-name">{name}</span>
      <div className="pop">{children}</div>
    </Tag>
  )
}

export default function App() {
  const [projects, setProjects] = useState([])
  const [agents, setAgents] = useState([])
  const [theme, setTheme] = useState(localStorage.getItem('panel-theme') || 'light')

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/agents').then((r) => r.json()),
    ]).then(([p, a]) => {
      setProjects(p.data); setAgents(a.data)
    })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('panel-theme', theme)
  }, [theme])

  return (
    <>
      <div className="aurora"><i /><i /><i /></div>
      <div className="shell">
        <section>
          <h2>APP</h2>
          {projects.length ? (
            <div className="launcher">
              {projects.map((p) => (
                <Tile key={p.name} icon={p.icon || '📦'} name={p.name}
                  href={p.url || (p.repo && repoUrl(p.repo))}>
                  <p className="pop-title">{p.name}
                    <span className={`status ${p.status}`}><i />{STATUS[p.status] || p.status}</span></p>
                  {p.summary && <p className="pop-body">{p.summary}</p>}
                </Tile>
              ))}
            </div>
          ) : (
            <div className="empty">registry/ 里还没有登记项目 —— 拷贝 <code>registry/_example.md</code> 登记第一个。</div>
          )}
        </section>

        <section>
          <h2>Agent</h2>
          {agents.length ? (
            <div className="launcher">
              {agents.map((a) => (
                <Tile key={a.name} icon={a.icon || KIND_ICON[a.kind] || '🦾'} name={a.name}
                  href={a.url || (a.repo && repoUrl(a.repo))}>
                  <p className="pop-title">{a.name}
                    <span className="status"><i />{KIND[a.kind] || a.kind || '—'}</span></p>
                  {a.summary && <p className="pop-body">{a.summary}</p>}
                  {a.entry && <p className="pop-entry"><code>{a.entry}</code></p>}
                </Tile>
              ))}
            </div>
          ) : (
            <div className="empty">还没有登记 agent —— 拷贝 <code>registry/agents/_example.md</code> 登记第一个。</div>
          )}
        </section>

      </div>
      <button className="theme-btn" title="切换亮暗模式"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </>
  )
}
