import { useEffect, useRef, useState } from 'react'
import LiquidGlass from 'liquid-glass-react'

const STATUS = { active: '运行中', paused: '暂停', archived: '已归档' }
const KIND = { interactive: '交互对话', service: '常驻服务', scheduled: '定时任务' }
const WALLS = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg']

const repoUrl = (r) => {
  const m = r.match(/^git@([^:]+):(.+?)(\.git)?$/)
  return m ? `https://${m[1]}/${m[2]}` : r
}

// 液态玻璃卡片:liquid-glass-react 提供折射/色差/弹性,参数取库推荐值。
// 该组件恒定 translate(-50%,-50%) 居中(为浮动元素设计),要进文档流需要:
// 外层定位壳 + 隐形同款内容撑出尺寸,玻璃绝对定位居中覆盖。
function Glass({ children, radius = 18, container, overLight, pad = '16px 18px' }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ visibility: 'hidden', padding: pad }} aria-hidden>
        {children}
      </div>
      <LiquidGlass
        displacementScale={48}
        blurAmount={0.08}
        saturation={150}
        aberrationIntensity={2}
        elasticity={0.12}
        cornerRadius={radius}
        padding={pad}
        mouseContainer={container}
        overLight={overLight}
        style={{ position: 'absolute', top: '50%', left: '50%' }}
      >
        {children}
      </LiquidGlass>
    </div>
  )
}

function Meta({ item }) {
  return (
    <div className="meta">
      {item.runsOn && <span>📍 {item.runsOn}</span>}
      {item.repo && <a href={repoUrl(item.repo)} target="_blank" rel="noopener noreferrer">仓库</a>}
      {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer">访问 ↗</a>}
    </div>
  )
}

export default function App() {
  const [projects, setProjects] = useState([])
  const [agents, setAgents] = useState([])
  const [cfg, setCfg] = useState({})
  const [asOf, setAsOf] = useState(null)
  const [filter, setFilter] = useState('all')
  const [bg, setBg] = useState(localStorage.getItem('panel-bg') || '')
  const [overLight, setOverLight] = useState(!matchMedia('(prefers-color-scheme: dark)').matches)
  const pageRef = useRef(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/agents').then((r) => r.json()),
      fetch('/api/config').then((r) => r.json()),
    ]).then(([p, a, c]) => {
      setProjects(p.data); setAgents(a.data); setCfg(c.data); setAsOf(p.asOf)
      if (!localStorage.getItem('panel-bg')) setBg(c.data.WALLPAPER || 'aurora')
    })
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setOverLight(!mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const pickBg = (name) => { setBg(name); localStorage.setItem('panel-bg', name) }
  const wall = bg && bg !== 'aurora' ? bg : null
  const shown = filter === 'all' ? projects : projects.filter((p) => p.status === filter)
  const counts = projects.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), { all: projects.length })

  return (
    <div ref={pageRef}>
      {wall
        ? <div className="wallpaper" style={{ backgroundImage: `url(/wallpapers/${wall})` }} />
        : <div className="aurora"><i /><i /><i /><i /></div>}

      <div className="wrap">
        <Glass container={pageRef} overLight={overLight}>
          <h1>🤖 agent 面板{cfg.DOMAIN && <span className="domain">{cfg.DOMAIN}</span>}</h1>
        </Glass>
        <div className="sub">数据来自 <code>registry/</code> 登记簿 —— 项目与 agent 各一个文件一条,改文件即改面板。React + liquid-glass-react 版。</div>

        <h2>📁 项目 <span className="count">{projects.length || ''}</span></h2>
        <div className="hint">登记于 <code>registry/*.md</code>:简介 + git 路径 + 状态。</div>
        <div className="filters">
          {[['all', '全部'], ['active', '运行中'], ['paused', '暂停'], ['archived', '已归档']]
            .filter(([k]) => k === 'all' || counts[k])
            .map(([k, label]) => (
              <span key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                {label} {counts[k] || 0}
              </span>
            ))}
        </div>
        <div className="grid tiles">
          {shown.map((p) => {
            const href = p.url || (p.repo && repoUrl(p.repo))
            return (
              <Glass key={p.name} container={pageRef} overLight={overLight} pad="18px 14px">
                <a className="tile" href={href || undefined} target="_blank" rel="noopener noreferrer"
                  title={p.summary}>
                  <span className="tile-icon">{p.icon || '📦'}</span>
                  <span className="tile-name">{p.name}</span>
                </a>
              </Glass>
            )
          })}
        </div>
        {!shown.length && <div className="empty">registry/ 里还没有登记项目 —— 拷贝 <code>registry/_example.md</code> 登记第一个。</div>}

        <h2>🦾 agent <span className="count">{agents.length || ''}</span></h2>
        <div className="hint">登记于 <code>registry/agents/*.md</code>:名字 + 类型 + 所在机器 + 入口。</div>
        <div className="grid">
          {agents.map((a) => (
            <Glass key={a.name} container={pageRef} overLight={overLight}>
              <div className="card-body">
                <div className="top"><h3>{a.name}</h3>
                  <span className={`badge ${a.kind || 'interactive'}`}>{KIND[a.kind] || a.kind || '—'}</span></div>
                <div className="summary">{a.summary || '（暂无简介）'}</div>
                {a.entry && <div className="entry">{a.entry}</div>}
                <Meta item={a} />
              </div>
            </Glass>
          ))}
        </div>
        {!agents.length && <div className="empty">还没有登记 agent —— 拷贝 <code>registry/agents/_example.md</code> 登记第一个。</div>}

        <footer>
          {asOf && <span>数据截至 {new Date(asOf).toLocaleString()}</span>}
          <div className="bg-picker" title="背景">
            <button className={`aurora-thumb ${!wall ? 'on' : ''}`} title="极光" onClick={() => pickBg('aurora')} />
            {WALLS.map((w) => (
              <button key={w} className={wall === w ? 'on' : ''} title={w}
                style={{ backgroundImage: `url(/wallpapers/${w})` }} onClick={() => pickBg(w)} />
            ))}
          </div>
        </footer>
      </div>
    </div>
  )
}
