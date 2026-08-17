---
name: local                # 服务器名,servers/ 下文件名与之一致
ssh: local                 # 登录方法:ssh alias;本机固定写 local
public-ip: false           # 是否有对外 IP
cloudflare: false          # 有无 Cloudflare 隧道/DNS 权限;true 才给新项目挂域名
domain:                    # cloudflare: true 时,新项目域名后缀(如 example.com)
panel: false               # 面板是否跑在这台机器;新项目登记写 panel: true 的机器
sudo: true                 # 有无免密 sudo;false → 一律用户级 systemd
deploy: local              # 部署通道:local | git-bare | github-pull
---

自由记述:机器形态、端口段约定、隧道/钩子位置、已知坑。
新建项目的 skill(skills/new-project)会同时读 frontmatter 与此正文。
实例的真实服务器清单放 `$AGENT_ROOT/servers/`,一台一个文件,不进公共仓库。
