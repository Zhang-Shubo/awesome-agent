---
name: trade-agent
icon: 📈                # 面板卡片图标(emoji)
repo: git@github.com:your-name/trade-agent.git
status: active          # active | paused | archived
runs-on: vps            # local | vps | gpu | 多个用逗号分隔
# 可选:面板小组件(常驻实时内容卡,约定见 docs/07;widget-api 是面板机内网地址,放私有登记簿)
# widget-api: http://127.0.0.1:8790/api/widget
# widget-link: https://trade.example.com/#topics
# widget-title: 交易机会 · 最新
---

AI 交易机会 agent:触发 → 分析 → 下单 → 复盘四阶段闭环,全程留痕可溯源。对外入口:https://trade.example.com
