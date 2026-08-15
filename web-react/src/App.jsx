import { useEffect, useState } from 'react'

// iOS 16 UI Kit 风格(见 figma-ios16-uikit-guide.md):
// 项目 = 主屏图标网格,agent = inset grouped table view,筛选 = Segmented Picker。
const STATUS = { active: '运行中', paused: '暂停', archived: '已归档' }
const KIND = { interactive: '交互对话', service: '常驻服务', scheduled: '定时任务' }
const KIND_ICON = { interactive: '💬', service: '🛰️', scheduled: '⏰' }

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

  return (
    <div className="wrap">
      <div className="nav"><h1>agent 面板</h1></div>
      <div className="large-title">🤖 agent 面板</div>
      {cfg.DOMAIN && <div className="domain">{cfg.DOMAIN}</div>}

      <div className="section-header">项目 · registry/*.md</div>
      {projects.length > 1 && (
        <div className="seg">
          {[['all', '全部'], ['active', '运行中'], ['paused', '暂停'], ['archived', '已归档']]
            .filter(([k]) => k === 'all' || counts[k])
            .map(([k, label]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                {label}<span className="n">{counts[k] || 0}</span>
              </button>
            ))}
        </div>
      )}
      <div className="springboard">
        {shown.map((p) => {
          const href = p.url || (p.repo && repoUrl(p.repo))
          return (
            <a key={p.name} className="app" href={href || undefined}
              target="_blank" rel="noopener noreferrer" title={p.summary}>
              <span className="app-icon">
                {p.icon || '📦'}
                <span className={`dot ${p.status}`} title={STATUS[p.status] || p.status} />
              </span>
              <span className="app-name">{p.name}</span>
            </a>
          )
        })}
      </div>
      {!shown.length && <div className="empty">registry/ 里还没有登记项目 —— 拷贝 <code>registry/_example.md</code> 登记第一个。</div>}

      <div className="section-header">agent · registry/agents/*.md</div>
      {agents.length ? (
        <div className="list">
          {agents.map((a) => {
            const href = a.url || (a.repo && repoUrl(a.repo))
            const Row = href ? 'a' : 'div'
            return (
              <Row key={a.name} className="row"
                {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <span className="row-icon">{a.icon || KIND_ICON[a.kind] || '🦾'}</span>
                <span className="row-main">
                  <div className="row-title">{a.name}</div>
                  {a.summary && <div className="row-sub">{a.summary}</div>}
                  {a.entry && <div className="row-entry">{a.entry}</div>}
                </span>
                <span className="row-value">{KIND[a.kind] || a.kind || ''}</span>
                {href && <span className="chevron">›</span>}
              </Row>
            )
          })}
        </div>
      ) : (
        <div className="empty">还没有登记 agent —— 拷贝 <code>registry/agents/_example.md</code> 登记第一个。</div>
      )}
      <div className="section-footer">行点击进入访问入口或仓库;类型显示在行尾。</div>

      <footer>{asOf && <span>数据截至 {new Date(asOf).toLocaleString()}</span>}</footer>
    </div>
  )
}
