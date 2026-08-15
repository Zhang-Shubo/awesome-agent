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

const projects = () => listEntries(REGISTRY)
const agents = () => listEntries(path.join(REGISTRY, 'agents'))

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/api/projects') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    return res.end(JSON.stringify({ ok: true, data: projects(), asOf: new Date().toISOString() }))
  }
  if (url.pathname === '/api/agents') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    return res.end(JSON.stringify({ ok: true, data: agents(), asOf: new Date().toISOString() }))
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
