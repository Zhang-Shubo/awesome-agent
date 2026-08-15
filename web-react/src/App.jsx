import { useEffect, useState } from 'react'

// Figma 网站线框模板(Landing page)版式:导航 + 大标题 + 卡片网格。
// 项目 = 产品卡(2:1498),agent = Customer Quote 卡(2:1419)。
const STATUS = { active: '运行中', paused: '暂停', archived: '已归档' }
const KIND = { interactive: '交互对话', service: '常驻服务', scheduled: '定时任务' }
const KIND_ICON = { interactive: '💬', service: '🛰️', scheduled: '⏰' }
const REPO = 'https://github.com/Zhang-Shubo/awesome-agent'

const repoUrl = (r) => {
  const m = r.match(/^git@([^:]+):(.+?)(\.git)?$/)
  return m ? `https://${m[1]}/${m[2]}` : r
}

export default function App() {
  const [projects, setProjects] = useState([])
  const [agents, setAgents] = useState([])
  const [cfg, setCfg] = useState({})
  const [asOf, setAsOf] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/agents').then((r) => r.json()),
      fetch('/api/config').then((r) => r.json()),
    ]).then(([p, a, c]) => {
      setProjects(p.data); setAgents(a.data); setCfg(c.data); setAsOf(p.asOf)
    })
  }, [])

  const shown = filter === 'all' ? projects : projects.filter((p) => p.status === filter)
  const counts = projects.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), { all: projects.length })
  const siteName = cfg.DOMAIN || 'awesome-agent'

  return (
    <div className="shell">
      <nav className="nav">
        <a className="site" href="/">🤖 {siteName}</a>
        <div className="nav-items">
          <a href="#projects">项目</a>
          <a href="#agents">agent</a>
          <a className="btn" href={`${REPO}/blob/main/docs/08-项目创建流程.md`}
            target="_blank" rel="noopener noreferrer">新建项目</a>
        </div>
      </nav>

      <header className="hero">
        <h1>agent 面板</h1>
        <p className="sub">registry/ 登记簿驱动的个人 agent 工作台 —— 项目与 agent 各一个文件一条,改文件即改面板。</p>
      </header>

      <section id="projects">
        <div className="section-head">
          <h2>项目</h2>
          {projects.length > 1 && (
            <div className="filters">
              {[['all', '全部'], ['active', '运行中'], ['paused', '暂停'], ['archived', '已归档']]
                .filter(([k]) => k === 'all' || counts[k])
                .map(([k, label]) => (
                  <span key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                    {label} {counts[k] || 0}
                  </span>
                ))}
            </div>
          )}
        </div>
        {shown.length ? (
          <div className="grid">
            {shown.map((p) => {
              const href = p.url || (p.repo && repoUrl(p.repo))
              return (
                <a key={p.name} className="card" href={href || undefined}
                  target="_blank" rel="noopener noreferrer">
                  <div className="thumb">{p.icon || '📦'}</div>
                  <div className="copy">
                    <p className="card-title">{p.name}</p>
                    {p.summary && <p className="card-body">{p.summary}</p>}
                    <p className={`status ${p.status}`}><i />{STATUS[p.status] || p.status}</p>
                  </div>
                </a>
              )
            })}
          </div>
        ) : (
          <div className="empty">registry/ 里还没有登记项目 —— 拷贝 <code>registry/_example.md</code> 登记第一个。</div>
        )}
      </section>

      <section id="agents">
        <div className="section-head"><h2>agent</h2></div>
        {agents.length ? (
          <div className="grid">
            {agents.map((a) => {
              const href = a.url || (a.repo && repoUrl(a.repo))
              return (
                <a key={a.name} className="quote"
                  {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  <p className="quote-text">“{a.summary || '暂无简介'}”</p>
                  <div className="avatar-row">
                    <span className="avatar">{a.icon || KIND_ICON[a.kind] || '🦾'}</span>
                    <div className="who">
                      <span>{a.name}</span>
                      <span className="desc">{KIND[a.kind] || a.kind || '—'}{a.entry && <> · <code>{a.entry}</code></>}</span>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        ) : (
          <div className="empty">还没有登记 agent —— 拷贝 <code>registry/agents/_example.md</code> 登记第一个。</div>
        )}
      </section>

      <footer>
        <span className="site-foot">🤖 {siteName}</span>
        <span className="meta">数据来自 registry/{asOf && ` · 截至 ${new Date(asOf).toLocaleString()}`}</span>
      </footer>
    </div>
  )
}
