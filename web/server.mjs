// awesome-agent 项目面板 · 零依赖(node:http),clone 即跑:node web/server.mjs
// 数据源 = ../registry/*.md;只监听 127.0.0.1,对外走 Cloudflare Tunnel + Access
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const REGISTRY = path.join(ROOT, 'registry')
const STATIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static')
// React 版(web-react,liquid-glass-react)构建产物存在时优先;缺的文件(壁纸等)落回 static
const REACT_DIST = path.join(ROOT, 'web-react', 'dist')
const STATIC_DIRS = [REACT_DIST, STATIC].filter(d => fs.existsSync(d))
const PORT = Number(process.env.PANEL_PORT || readEnv('PANEL_PORT') || 8787)

// config.env 只取白名单键给前端,密钥永不出后端
const SAFE_KEYS = ['DOMAIN', 'GIT_USER', 'AGENT_ROOT', 'WALLPAPER']

function readEnv(key) {
  const file = path.join(ROOT, 'config.env')
  if (!fs.existsSync(file)) return undefined
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/)
    if (m && m[1] === key) return m[2].trim() || undefined
  }
  return undefined
}

function parseEntry(dir, file) {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const meta = {}
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([\w-]+):\s*([^#]*)/)
      if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  const body = (m ? m[2] : raw).trim()
  const link = body.match(/https?:\/\/\S+/)
  return {
    name: meta.name || file.replace(/\.md$/, ''),
    repo: meta.repo || '',
    status: meta.status || 'active',
    runsOn: meta['runs-on'] || '',
    kind: meta.kind || '',
    entry: meta.entry || '',
    icon: meta.icon || '',
    hidden: meta.hidden === 'true',
    summary: body.replace(/\s+/g, ' ').slice(0, 300),
    url: link ? link[0].replace(/[),.;]$/, '') : '',
  }
}

function listEntries(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map(f => { try { return parseEntry(dir, f) } catch { return null } })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// 私有登记簿 overlay:公共 registry/ 只放模板与愿意公开的条目,个人条目放私有目录
// (config.env 的 REGISTRY_DIR,缺省 $AGENT_ROOT/registry),同名条目私有覆盖公共。
const expand = (p) => (p || '')
  .replace(/^~(?=\/|$)/, process.env.HOME || '~')
  .replace(/\$HOME\b/g, process.env.HOME || '')
const AGENT_ROOT = expand(readEnv('AGENT_ROOT'))
const PRIVATE_REGISTRY = expand(readEnv('REGISTRY_DIR')) || (AGENT_ROOT && path.join(AGENT_ROOT, 'registry'))

function mergeEntries(dirs) {
  const map = new Map()
  for (const dir of dirs.filter(Boolean)) for (const e of listEntries(dir)) map.set(e.name, e)
  // hidden 墓碑:私有条目可把同名公共条目从面板隐藏(不动公共库)
  return [...map.values()].filter((e) => !e.hidden).sort((a, b) => a.name.localeCompare(b.name))
}
const apps = () => mergeEntries([REGISTRY, PRIVATE_REGISTRY])
const agents = () => mergeEntries([
  path.join(REGISTRY, 'agents'),
  PRIVATE_REGISTRY && path.join(PRIVATE_REGISTRY, 'agents'),
])

// 登记文件生成(写入私有登记簿用)
function entryMd(b) {
  const lines = ['---', `name: ${b.name}`]
  if (b.icon) lines.push(`icon: ${b.icon}`)
  if (b.repo) lines.push(`repo: ${b.repo}`)
  lines.push(`status: ${b.status || 'active'}`)
  if (b.runsOn) lines.push(`runs-on: ${b.runsOn}`)
  if (b.kind) lines.push(`kind: ${b.kind}`)
  if (b.entry) lines.push(`entry: ${b.entry}`)
  lines.push('---', '', (b.summary || '').trim())
  if (b.url) lines.push('', `入口:${b.url}`)
  return lines.join('\n') + '\n'
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/
const readBody = (req) => new Promise((resolve) => {
  let s = ''
  req.on('data', (c) => { s += c })
  req.on('end', () => resolve(s))
})

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const send = (code, data) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }
  if (url.pathname === '/api/apps' || url.pathname === '/api/agents') {
    const isAgents = url.pathname === '/api/agents'
    if (req.method === 'GET') {
      return send(200, { ok: true, data: isAgents ? agents() : apps(), asOf: new Date().toISOString() })
    }
    // 写操作只落私有登记簿,公共库永远不被 web 改动
    if (!PRIVATE_REGISTRY) return send(400, { ok: false, error: '未配置私有登记簿(config.env 的 AGENT_ROOT 或 REGISTRY_DIR)' })
    const dir = isAgents ? path.join(PRIVATE_REGISTRY, 'agents') : PRIVATE_REGISTRY
    if (req.method === 'POST') {
      let b
      try { b = JSON.parse(await readBody(req)) } catch { return send(400, { ok: false, error: 'JSON 解析失败' }) }
      if (!NAME_RE.test(b.name || '')) return send(400, { ok: false, error: 'name 需为小写字母/数字/横线(kebab-case)' })
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${b.name}.md`), entryMd(b))
      return send(200, { ok: true })
    }
    if (req.method === 'DELETE') {
      const name = url.searchParams.get('name') || ''
      if (!NAME_RE.test(name)) return send(400, { ok: false, error: 'name 非法' })
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `${name}.md`)
      if (fs.existsSync(file)) fs.rmSync(file)
      // 若删的是公共条目,写 hidden 墓碑把它从面板隐藏(公共库文件不动)
      if ((isAgents ? agents() : apps()).some((e) => e.name === name)) {
        fs.writeFileSync(file, `---\nname: ${name}\nhidden: true\n---\n`)
      }
      return send(200, { ok: true })
    }
  }
  if (url.pathname === '/api/config') {
    const cfg = Object.fromEntries(SAFE_KEYS.map(k => [k, readEnv(k) || '']).filter(([, v]) => v))
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    return res.end(JSON.stringify({ ok: true, data: cfg }))
  }
  // 静态文件,禁止路径穿越;按目录优先级找(React dist → static)
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  for (const dir of STATIC_DIRS) {
    const file = path.join(dir, rel)
    if (file.startsWith(dir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
      return res.end(fs.readFileSync(file))
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
}).listen(PORT, '127.0.0.1', () => {
  console.log(`awesome-agent panel → http://127.0.0.1:${PORT}`)
})
