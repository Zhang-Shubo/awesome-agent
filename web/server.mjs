// awesome-agent 项目面板 · 零依赖(node:http),clone 即跑:node web/server.mjs
// 数据源 = ../registry/*.md;只监听 127.0.0.1,对外走 Cloudflare Tunnel + Access
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

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
    const lines = m[1].split('\n')
    for (let i = 0; i < lines.length; i++) {
      // 块标量:`key: |` 后跟缩进行,收集为多行值(agent 的 prompt 用)
      const blk = lines[i].match(/^([\w-]+):\s*\|\s*$/)
      if (blk) {
        const buf = []
        while (i + 1 < lines.length && /^(\s{2,}|\s*$)/.test(lines[i + 1])) buf.push(lines[++i].replace(/^\s{2}/, ''))
        meta[blk[1]] = buf.join('\n').trim()
        continue
      }
      const kv = lines[i].match(/^([\w-]+):\s*([^#]*)/)
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
    prompt: meta.prompt || '',
    tools: meta.tools || '',
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

// 新增 app 只填链接:claude -p(headless)读取链接内容,解析出登记字段
async function resolveLink(link) {
  const prompt = `分析这个链接:${link}
用 WebFetch 读取它的内容后,只输出一个 JSON 对象,不要输出任何其他文字:
{"name":"kebab-case 短名(小写字母数字横线)","icon":"优先用它自带的站点图标(<link rel=icon> 或 /favicon.svg、/favicon.ico,验证能访问)的绝对 URL;拿不到才用一个最贴切的 emoji","summary":"一句话中文简介","repo":"若它是代码仓库,其 https clone 地址,否则空字符串","url":"若它是可直接访问的服务或网页,该链接本身,否则空字符串"}`
  const { stdout } = await execFileP(
    'claude', ['-p', prompt, '--allowedTools', 'WebFetch', '--output-format', 'json'],
    { timeout: 180000, maxBuffer: 1024 * 1024 },
  )
  const m = String(JSON.parse(stdout).result || '').match(/\{[\s\S]*\}/)
  if (!m) throw new Error('claude 未返回 JSON')
  const r = JSON.parse(m[0])
  r.name = String(r.name || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return r
}
// 会话历史:按 agent 记最近 10 个会话(存私有的 AGENT_ROOT 下,不进公共库)。
// 每轮 -p --resume 都会派生新 session_id,所以续聊时用旧 id 找到条目原位替换,不产生重复。
const CHAT_CWD = () => (AGENT_ROOT && fs.existsSync(AGENT_ROOT) ? AGENT_ROOT : ROOT)
const HIST_FILE = () => path.join(CHAT_CWD(), '.chat-history.json')
const readHist = () => { try { return JSON.parse(fs.readFileSync(HIST_FILE(), 'utf8')) } catch { return {} } }
function recordSession(agentKey, sid, prevSid, title) {
  const h = readHist()
  const list = h[agentKey] || []
  const old = prevSid ? list.find((e) => e.sid === prevSid) : null
  h[agentKey] = [
    { sid, title: old?.title || title, ts: Date.now() },
    ...list.filter((e) => e.sid !== sid && e.sid !== prevSid),
  ].slice(0, 10)
  try { fs.writeFileSync(HIST_FILE(), JSON.stringify(h)) } catch { /* 历史丢失不影响对话 */ }
}

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
      if (!isAgents && b.link && !b.name) {
        try { b = { ...(await resolveLink(String(b.link).trim())), status: 'active' } }
        catch (e) { return send(500, { ok: false, error: `链接解析失败:${String(e.message || e).slice(0, 200)}` }) }
      }
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
  // 某 agent 的历史会话列表(最多 10 条,新的在前)
  if (url.pathname === '/api/chat/history' && req.method === 'GET') {
    return send(200, { ok: true, data: readHist()[url.searchParams.get('agent') || ''] || [] })
  }
  // 还原某个会话的转录:claude CLI 存在 ~/.claude/projects/<cwd 编码>/<sid>.jsonl
  if (url.pathname === '/api/chat/session' && req.method === 'GET') {
    const sid = url.searchParams.get('id') || ''
    if (!/^[a-f0-9-]{8,64}$/i.test(sid)) return send(400, { ok: false, error: 'id 非法' })
    const file = path.join(process.env.HOME || '', '.claude', 'projects',
      CHAT_CWD().replace(/[/.]/g, '-'), `${sid}.jsonl`)
    if (!fs.existsSync(file)) return send(404, { ok: false, error: '会话转录不存在' })
    const msgs = []
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      let ev; try { ev = JSON.parse(line) } catch { continue }
      const content = ev?.message?.content
      if (ev.type === 'user' && !ev.isMeta) {
        const txt = typeof content === 'string' ? content
          : Array.isArray(content) ? content.filter((b) => b.type === 'text').map((b) => b.text).join('') : ''
        // 略过工具结果轮次和 <command-…> 之类的框架注入消息
        if (txt.trim() && !txt.trimStart().startsWith('<')) msgs.push({ role: 'user', text: txt })
      } else if (ev.type === 'assistant' && Array.isArray(content)) {
        let last = msgs[msgs.length - 1]
        if (!last || last.role !== 'ai') { last = { role: 'ai', text: '', tools: [] }; msgs.push(last) }
        for (const b of content) {
          if (b.type === 'text' && b.text) last.text += (last.text ? '\n\n' : '') + b.text
          else if (b.type === 'tool_use') last.tools.push({ name: b.name, hint: '' })
        }
      }
    }
    return send(200, { ok: true, data: msgs })
  }
  // AI 对话:流式透传本机 claude CLI 的 stream-json,认证复用 CLI 登录态。
  // 用 SSE(text/event-stream)而非裸 NDJSON——Cloudflare 边缘对 event-stream 不缓冲,流才顺。
  // 多轮靠 --resume <sessionId>;工作目录默认 $AGENT_ROOT;模型缺省 sonnet(快),config.env 的
  // CHAT_MODEL 可换;headless 下写类工具默认被拒,CHAT_ARGS 可加 --permission-mode 等放开。
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    let body
    try { body = JSON.parse(await readBody(req)) } catch { return send(400, { ok: false, error: '请求体不是 JSON' }) }
    const message = String(body.message || '').trim()
    if (!message) return send(400, { ok: false, error: '空消息' })
    const reqModel = String(body.model || '').trim()
    const model = /^[a-z0-9._-]{1,64}$/i.test(reqModel) ? reqModel : (readEnv('CHAT_MODEL') || 'sonnet')
    const args = ['-p', message, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--model', model]
    if (body.sessionId) args.push('--resume', String(body.sessionId))
    // 写入授权档位由前端选择:缺省只读(headless 默认拒绝写类工具)
    const permMode = String(body.permissionMode || '')
    if (['acceptEdits', 'bypassPermissions', 'plan'].includes(permMode)) args.push('--permission-mode', permMode)
    // 以某个登记簿 agent 的身份对话:提示词/工具白名单由服务端从登记簿取,不信任客户端传的内容。
    // tools 空格分隔(如 "Read Bash(sqlite3:*)"),白名单内的工具在只读档也免授权直批
    if (body.agent) {
      const a = agents().find((e) => e.name === String(body.agent))
      if (a?.prompt) args.push('--append-system-prompt', a.prompt)
      if (a?.tools) args.push('--allowedTools', a.tools.split(/[\s,]+/).filter(Boolean).join(','))
    }
    args.push(...(readEnv('CHAT_ARGS') || '').split(/\s+/).filter(Boolean))
    const child = spawn('claude', args, { cwd: CHAT_CWD(), env: process.env })
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no',
    })
    const emit = (line) => { if (!res.writableEnded) res.write(`data: ${line}\n\n`) }
    let out = '', errBuf = '', recorded = false
    child.stdout.on('data', (c) => {
      out += c
      const lines = out.split('\n'); out = lines.pop()
      for (const l of lines) {
        if (!l.trim()) continue
        // 首个带 session_id 的事件(init)出现时登记进会话历史
        if (!recorded && l.includes('"session_id"')) {
          try {
            const ev = JSON.parse(l)
            if (ev.session_id) {
              recorded = true
              recordSession(String(body.agent || ''), ev.session_id,
                body.sessionId ? String(body.sessionId) : null, message.slice(0, 40))
            }
          } catch { /* 非完整 JSON 行,跳过 */ }
        }
        emit(l)
      }
    })
    child.stderr.on('data', (c) => { errBuf += c })
    const finish = (errMsg) => {
      if (out.trim()) emit(out)
      if (errMsg) emit(JSON.stringify({ type: 'error', error: errMsg }))
      emit('{"type":"done"}')
      if (!res.writableEnded) res.end()
    }
    child.on('error', (e) => finish(`claude 启动失败:${e.message}`))
    child.on('close', (code) => finish(code !== 0 ? (errBuf.trim() || `claude 退出码 ${code}`).slice(-800) : null))
    req.on('close', () => child.kill('SIGTERM'))
    return
  }
  // 私有登记簿可自带图标文件:REGISTRY_DIR/icons/ 映射到 /icons/,条目里写 icon: /icons/xxx.svg 即可
  if (url.pathname.startsWith('/icons/') && PRIVATE_REGISTRY) {
    const dir = path.join(PRIVATE_REGISTRY, 'icons')
    const file = path.join(dir, url.pathname.slice('/icons/'.length))
    if (file.startsWith(dir + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' })
      return res.end(fs.readFileSync(file))
    }
  }
  // 静态文件,禁止路径穿越;按目录优先级找(React dist → static)
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  for (const dir of STATIC_DIRS) {
    const file = path.join(dir, rel)
    if (file.startsWith(dir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        // 构建产物文件名带内容哈希,可永久缓存;其余(html/favicon)每次协商,防止发版后粘旧页
        'cache-control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      return res.end(fs.readFileSync(file))
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
}).listen(PORT, '127.0.0.1', () => {
  console.log(`awesome-agent panel → http://127.0.0.1:${PORT}`)
})
