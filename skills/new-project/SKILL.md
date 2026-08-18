---
name: new-project
description: 创建新项目。当用户说"新建项目""创建项目""搭个新服务""起个新项目""new project"时触发。按 docs/08 标准动线走完:三要素 → projects/ 建目录建仓 → 图标 → 选服务器部署 → 按 Cloudflare 权限决定是否挂域名 → 默认注册进面板 APP。
argument-hint: <name> [--server <servers/ 里的名字>] [--port <N>] [--no-domain]
allowed-tools: Bash(git *), Bash(gh *), Bash(ssh *), Bash(scp *), Bash(mkdir *), Bash(cp *), Bash(mv *), Bash(curl *), Bash(qlmanage *), Bash(lsof *), Bash(ss *), Bash(cat *), Bash(ls *), Bash(chmod *), Read, Write, Edit, Glob, Grep
user-invocable: true
---

# new-project — 新项目创建

本 skill 是 [docs/08-项目创建流程](../../docs/08-项目创建流程.md) 的可执行封装。**skill 本身不含任何个人信息**——服务器清单、域名、凭证全部来自实例工作空间(`$AGENT_ROOT`),细节以 docs/08 为准,本文只写执行顺序与分支判断。

## 0. 收集三要素(缺则问用户)

| 要素 | 约定 |
|---|---|
| 名字 | 小写 kebab-case;仓库名 = 目录名 = systemd 单元名 = registry 文件名,四处同名 |
| 简介 | 一句话说清干什么,登记与 README 复用 |
| 图标 | 项目强调色底 + 单个白色 glyph 的家族风格(规格见 docs/08 第 2 步) |

## 1. 选部署服务器

读 `$AGENT_ROOT/servers/*.md`(格式见 [templates/server.md](../../templates/server.md)),用户未指定时**默认 local(本机)**。字段决定后续分支:

| 字段 | 含义 | 影响 |
|---|---|---|
| `ssh` | 登录方法(ssh alias;`local` 为本机) | 部署/验证命令的前缀 |
| `public-ip` | 是否有对外 IP | 仅记述参考 |
| `cloudflare` | 有无隧道/DNS 权限 | **true 才做第 5 步挂域名,false 直接跳过** |
| `domain` | 挂域名时的后缀 | `<name>.<domain>` |
| `sudo` | 有无免密 sudo | false → 一律用户级 systemd(`systemctl --user` + linger) |
| `deploy` | local / git-bare / github-pull | 部署通道(见 docs/08 第 4 步) |
| `panel` | 面板运行处 | 第 6 步登记写到这台机器 |

正文自由记述(端口段、隧道形态、已知坑)也要读,别只看 frontmatter。

## 2. 建目录、建仓(docs/08 第 1 步)

`$AGENT_ROOT/projects/<name>` 建目录 → 拷 templates 骨架(CLAUDE.md、config.env.example、deploy.sh、gitignore、notify.mjs)→ `git init` + 首次 commit → `gh repo create <name> --private --source . --push`。真实密钥只进本地 config.env,永不入库。

## 3. 图标 + 本地跑通(docs/08 第 2、3 步)

favicon.svg(64 viewBox、rx14、强调色底白 glyph)→ `qlmanage -t -s 128` 目检;服务只听 `127.0.0.1`(铁律),端口先查占用,curl 200 才算通。

## 4. 部署(docs/08 第 4 步)

- `deploy: local` → 不外发,本机跑;纯本地工具做完直接跳第 6 步登记。
- `deploy: git-bare` → 机器上建裸仓 + post-receive 钩子(checkout → build → restart),本地 `git push deploy main`。
- `deploy: github-pull` → push origin 后上机 `git pull` + 重启;**注意:若机器配的是只读 deploy key,push 必须在本机做**。
- 服务单元按 `sudo` 字段选用户级/系统级 systemd,`EnvironmentFile=` 指机上 config.env;config.env 用 scp 直传。

## 5. 域名(仅当服务器 `cloudflare: true` 且项目需要 Web 访问;`--no-domain` 强制跳过)

严格按 docs/08 第 5、6 步:**先建 Access 应用,再绑 DNS**(消灭裸奔空窗);隧道远程管理模式下 ingress 的 PUT 是**全量覆盖**——先 GET 再插入再 PUT,改完把该隧道所有域名回归一遍。`cloudflare: false` 的服务器不挂域名,面板卡片只带仓库链接。

## 6. 注册面板(默认必做,docs/08 第 8 步)

1. 生成面板图标:512 viewBox、rx115、渐变底 + 白 glyph(与 64 favicon 同一母题),放到 **panel: true 那台机器**的 `$AGENT_ROOT/registry/icons/<name>.svg`(本机无 panel 机器时写本机 registry);
2. 写登记条目 `$AGENT_ROOT/registry/<name>.md`:name / icon(`/icons/<name>.svg`)/ repo / status / runs-on + 一句话简介 + 访问入口(有域名写域名,没有写仓库);项目若提供面板小组件,再补 widget-api / widget-link / widget-title(约定见 awesome-agent docs/07);
3. 收尾清单:项目 CLAUDE.md 补上线信息(域名/机器/端口/隧道/Access app id/发布命令)、知识库记一笔、新挂的 Access 应用记入记忆。

## 完成汇报

向用户交付:仓库地址、部署机器与端口、域名(或"未挂域名+原因")、面板卡片已就位;列出跳过的步骤及原因。
