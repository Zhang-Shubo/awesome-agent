---
name: new-agent
description: 创建/登记新 agent。当用户说"新建 agent""创建 agent""登记 agent""写个 agent""new agent"时触发。收三要素(名字/简介/头像)→ 写登记簿条目(kind/runs-on/tools/prompt)→ 头像与条目放到面板所在机器 → 验证面板可见、chat 可用。
argument-hint: <agent-name> [--kind interactive|service|scheduled] [--public]
allowed-tools: Bash(ls *), Bash(cat *), Bash(mkdir *), Bash(scp *), Bash(ssh *), Bash(curl *), Bash(git *), Read, Write, Edit, Glob, Grep
user-invocable: true
---

# new-agent — 新 agent 登记

agent = 登记簿里的一个 md 条目(格式见 [registry/agents/_example.md](../../registry/agents/_example.md)),不是一份代码。本 skill 固化登记动线;**skill 本身不含个人信息**,机器与路径来自实例工作空间(`$AGENT_ROOT`)。

## 0. 收集三要素(与 new-project 同规:缺则问用户;用户让你定的,定完在汇报里报备)

| 要素 | 约定 |
|---|---|
| 名字 | 小写 kebab-case,= 登记文件名;一眼看出职责(如 event-curator),不用泛词 |
| 简介 | 一句话说清干什么,写进条目正文;面板 tile 与对话开场白都展示它 |
| 头像 | **必配,不是可选**:512 viewBox、rx115、强调色渐变底 + 单个白 glyph 的家族风格(与项目面板图标同母题);放**面板机** `REGISTRY_DIR/icons/<name>.svg`,条目写 `icon: /icons/<name>.svg`。头像出现在面板 tile 和右侧对话抽屉,是 agent 的身份标识,缺了会退回默认 emoji |

再收技术字段:

| 字段 | 约定 |
|---|---|
| `kind` | `interactive` 面板对话 / `service` 常驻服务 / `scheduled` 定时任务 |
| `runs-on` | **执行机**。interactive 的执行机 = 面板所在机器(chat 由面板进程 spawn `claude`,cwd 为该机 `$AGENT_ROOT`),不是你写条目的机器 |
| `entry` | service/scheduled 必填:入口/状态命令;interactive 可省 |
| `tools` | interactive 专用:工具白名单,空格分隔(如 `Read Bash(sqlite3:*)`),面板翻成 `--allowedTools`,白名单内免授权直批。**只给只读工具,写操作让 prompt 要求先确认** |
| `prompt` | interactive 专用:系统提示词(`prompt: \|` 多行块),面板翻成 `--append-system-prompt` |

## 1. 判定落点:公共 or 私有

- **私有(默认)**:个人 agent 进私有登记簿 `REGISTRY_DIR/agents/<name>.md`(缺省 `$AGENT_ROOT/registry/agents/`),纳入私有工作区仓库同步,不进公共库;
- **公共**:仅示范/对外展示的条目进 awesome-agent 仓库 `registry/agents/`;同名时私有覆盖公共。

## 2. 写 prompt(interactive 的核心)

- **自包含**:执行机上未必部署了 skills——依赖某 skill 的,把动线直接写进 prompt,提 skill 名只作出处;
- 路径、端口按**执行机**写(如服务在执行机本机端口,不走隧道);
- 白名单内的工具明示「能查就直接查,不要先请示授权」;写库类操作明示「先向用户复述参数、确认后执行」;
- 铁律照 docs/05:诚实、可溯源;禁止编造,查不到就明说。

## 3. 落位:条目必须到达面板机

**面板只读它所在机器的登记簿**(`panel: true` 那台,见 `$AGENT_ROOT/servers/*.md`)——写在别的机器上面板不显示,这是最常踩的坑。

- 面板机 = 本机 → 写进本机 `REGISTRY_DIR/agents/` 即可;
- 面板机 = 远程 → 本机写好后同步过去:面板机的 `$AGENT_ROOT` 若是私有工作区克隆则 push + pull,否则 `scp` 直传 `~/.awesome-agent/registry/agents/`;
- 面板按请求现读登记簿,**无需重启**。

## 4. 验证与收尾

1. 面板机上 `curl -s 127.0.0.1:<PANEL_PORT>/api/agents` 确认条目在列,且 `icon` 字段非空、图标 URL 可访问;
2. interactive 的在面板 chat 里选中试问一句,确认 prompt 生效、白名单工具免授权;
3. 本机私有工作区仓库 commit(条目纳入版本管理);公共条目在 awesome-agent 仓库 commit。

## 已知坑

- 条目写在非面板机 → 面板不显示(本 skill 第 3 步);
- `runs-on` 想当然写成登记机 → prompt 里的路径/端口全错;interactive 一律按面板机写;
- prompt 引用执行机上不存在的 skill 文件 → agent 开局就迷路,prompt 必须自包含;
- `tools` 给了裸 `Bash` → 白名单形同虚设,细粒度到 `Bash(cmd:*)`。
