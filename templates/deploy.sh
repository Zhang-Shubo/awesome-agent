#!/usr/bin/env bash
# 零 sudo 用户级 systemd 部署模板:传源码 → 首次生成 config.env(已有不覆盖)
# → 写 unit → 重启 → 健康自测。用法:./deploy.sh [ssh别名]
set -euo pipefail

APP=myapp                 # 服务名(改这里)
PORT=8900                 # 健康检查端口(改这里)
HOST="${1:-myserver}"     # ssh 别名
REMOTE="~/$APP"

# 1) 传源码(永远排除依赖、git 与真实数据)
tar czf - --exclude node_modules --exclude .git --exclude data \
          --exclude config.env . \
  | ssh "$HOST" "mkdir -p $REMOTE && tar xzf - -C $REMOTE"

# 2) 远端自举:装依赖 / 首次配置 / 用户级 unit / 重启 / 自测
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd $REMOTE

# 首次生成 config.env,已有则不覆盖(真实密钥只活在部署机)
[ -f config.env ] || cp config.env.example config.env

# 用户级 systemd(免 sudo;首次需 loginctl enable-linger \$USER)
mkdir -p ~/.config/systemd/user
NODE_BIN=\$(command -v node)
sed "s|__NODE__|\$NODE_BIN|g" systemd/$APP.service \
  > ~/.config/systemd/user/$APP.service
systemctl --user daemon-reload
systemctl --user enable --now $APP
systemctl --user restart $APP

sleep 1
curl -sf "http://127.0.0.1:$PORT/healthz" && echo " ✅ $APP healthy"
EOF
