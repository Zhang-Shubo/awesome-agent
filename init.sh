#!/usr/bin/env bash
# awesome-agent 初始化:交互式生成 config.env → 配 git 授权 → Cloudflare 隧道授权
# → 建 agent/ 私有工作区(独立 git 仓库) → 建 $AGENT_ROOT 目录框架。
# 幂等:重复运行只补缺,不覆盖已有配置。
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\n\033[1;36m» %s\033[0m\n' "$*"; }
note() { printf '  \033[0;90m%s\033[0m\n' "$*"; }

# 已有 config.env 时读入作默认值
[ -f config.env ] && set -a && . ./config.env && set +a

ask() { # ask <变量名> <提示> [默认值]
  local var="$1" prompt="$2" def="${3:-}" cur val
  cur="$(eval "printf '%s' \"\${$var:-}\"")"
  [ -n "$cur" ] && def="$cur"
  if [ -n "$def" ]; then read -r -p "$prompt [$def]: " val; val="${val:-$def}"
  else read -r -p "$prompt: " val; fi
  eval "$var=\"\$val\""
}

say "1/5 基础配置"
ask AGENT_ROOT  "agent 根目录" "$HOME/agent"
ask DOMAIN      "你的域名(DNS 已托管到 Cloudflare,如 example.com)"
ask PANEL_HOST  "面板对外子域名" "panel.${DOMAIN:-example.com}"
ask PANEL_PORT  "面板本地端口" "8787"

say "2/5 GitHub 授权"
note "Token 在 https://github.com/settings/tokens 生成,scope 勾选 repo;只存本机 config.env。"
ask GIT_USER  "GitHub 用户名"
read -r -s -p "GitHub Token(输入不回显,留空跳过): " _t; echo
[ -n "$_t" ] && GIT_TOKEN="$_t"
ask MEMORY_REPO "记忆仓库地址(留空稍后再配)" "${MEMORY_REPO:-}"
ask SKILLS_REPO "通用 skill 仓库地址(留空稍后再配)" "${SKILLS_REPO:-}"

say "3/5 写入 config.env(chmod 600)"
cat > config.env <<EOF
# 由 init.sh 生成 $(date '+%Y-%m-%d %H:%M') · 真实值永不入库
AGENT_ROOT="${AGENT_ROOT}"
DOMAIN="${DOMAIN}"
GIT_USER="${GIT_USER}"
GIT_TOKEN="${GIT_TOKEN:-}"
MEMORY_REPO="${MEMORY_REPO}"
SKILLS_REPO="${SKILLS_REPO}"
CF_ACCOUNT_ID="${CF_ACCOUNT_ID:-}"
CF_API_TOKEN="${CF_API_TOKEN:-}"
PANEL_HOST="${PANEL_HOST}"
PANEL_PORT="${PANEL_PORT}"
EOF
chmod 600 config.env
note "config.env 已生成"

# gh CLI 在则顺手登录(优先 gh,token 作后备)
if command -v gh >/dev/null 2>&1 && ! gh auth status >/dev/null 2>&1 && [ -n "${GIT_TOKEN:-}" ]; then
  printf '%s' "$GIT_TOKEN" | gh auth login --with-token 2>/dev/null \
    && note "gh CLI 已用该 token 登录" || note "gh 登录失败,可稍后手动 gh auth login"
fi

say "4/5 Cloudflare 隧道授权"
if command -v cloudflared >/dev/null 2>&1; then
  if [ -f "$HOME/.cloudflared/cert.pem" ]; then note "已授权过(~/.cloudflared/cert.pem 存在),跳过"
  else
    read -r -p "现在打开浏览器授权 cloudflared?(y/N): " yn
    [ "${yn:-n}" = "y" ] && cloudflared tunnel login
  fi
else
  note "未安装 cloudflared,跳过。安装:brew install cloudflared / apt install cloudflared"
fi

say "5/5 目录框架与 agent/ 工作区"
mkdir -p "$AGENT_ROOT/projects"
[ -n "$MEMORY_REPO" ] && [ ! -d "$AGENT_ROOT/memory" ] && git clone "$MEMORY_REPO" "$AGENT_ROOT/memory" || true
[ -n "$SKILLS_REPO" ] && [ ! -d "$AGENT_ROOT/skills" ] && git clone "$SKILLS_REPO" "$AGENT_ROOT/skills" || true

# agent/ = 你的私有工作区,独立 git 仓库,被本仓库 gitignore
if [ ! -d agent/.git ]; then
  mkdir -p agent
  git -C agent init -q
  [ -f agent/CLAUDE.md ] || cp templates/CLAUDE.md agent/CLAUDE.md
  [ -f agent/README.md ] || cat > agent/README.md <<'EOF'
# agent · 私有工作区

独立 git 仓库(awesome-agent 已将本目录 gitignore),存放你个人 agent 的私有配置:
CLAUDE.md、个性化 skill、调度定义等。建议在 GitHub 建私有仓库后:
  git remote add origin git@github.com:<you>/agent.git && git push -u origin main
EOF
  git -C agent add -A && git -C agent commit -qm "init agent workspace"
  note "agent/ 已初始化为独立 git 仓库"
else
  note "agent/ 已存在,跳过"
fi

say "完成 ✅"
note "启动面板:node web/server.mjs → http://127.0.0.1:${PANEL_PORT}"
note "对外发布:cloudflared tunnel 路由 ${PANEL_HOST} → 127.0.0.1:${PANEL_PORT},并在 Access 上加鉴权(docs/04)"
