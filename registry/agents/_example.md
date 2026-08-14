---
name: daily-trending
kind: scheduled        # interactive 交互对话 | service 常驻服务 | scheduled 定时任务
runs-on: vps           # local | vps | gpu
repo: git@github.com:your-name/daily-trending.git
entry: "systemctl --user status daily-trending.timer"
---

每天早上抓 GitHub Trending 写成中文日报入知识库的定时 agent。产出示例:https://notes.example.com/trending
