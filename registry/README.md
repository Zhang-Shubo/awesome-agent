# registry · 登记簿

一个条目一个 md 文件,只登记**简介 + git 路径 + 状态**,不放任何代码。两类条目:

- **项目**:`registry/<name>.md`(格式见 [_example.md](_example.md))
- **agent**:`registry/agents/<name>.md`——多一个 `kind` 字段(interactive 交互对话 / service 常驻服务 / scheduled 定时任务)和 `entry` 入口命令(格式见 [agents/_example.md](agents/_example.md))

面板(`web/`)读取这两处渲染「项目列表」和「agent 列表」。

- 新项目上线时在这里加一个文件(格式见 [_example.md](_example.md),也可直接拷贝改)。
- 项目归档时把 `status` 改成 `archived`,文件保留——登记簿同时也是历史。
- fork 本仓库的人:清空这里(保留 README 和 _example),从零登记你自己的项目。

## 私有登记簿(overlay)

不想公开的条目**不要放这里**——放到私有登记簿目录(`config.env` 的 `REGISTRY_DIR`,
缺省 `$AGENT_ROOT/registry`,结构与本目录相同:项目在根、agent 在 `agents/` 子目录)。
面板会合并两处,**同名条目私有覆盖公共**。这里只留模板和愿意公开展示的条目,
公共库永远干净;私有目录建议纳入你的私有工作区仓库一起同步。

目录框架的完整约定见 [docs/07-目录框架.md](../docs/07-目录框架.md)。
