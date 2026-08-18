---
name: claude-code
icon: /icons/claude-code.svg
kind: interactive
runs-on: local
entry: "claude"
---

主力交互 agent:终端里对话干活的施工队——建项目、部署服务、写文档、按 docs/08 流程上线新工具。记忆挂在 $AGENT_ROOT/memory,通用 skill 挂在 $AGENT_ROOT/skills(见 docs/07)。
