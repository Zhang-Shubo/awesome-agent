---
name: new-skill
description: 创建新 skill。当用户说"新建 skill""创建 skill""写个 skill""把 XX 固化成 skill""new skill"时触发。判定三类落点(对外通用 / 个人通用 / 项目专属)→ 按 templates/SKILL.md 骨架写 SKILL.md → 落位生效 → 验证可触发。
argument-hint: <skill-name> [--scope public|personal|project] [--project <项目路径>]
allowed-tools: Bash(mkdir *), Bash(ln *), Bash(ls *), Bash(cat *), Bash(git *), Read, Write, Edit, Glob, Grep
user-invocable: true
---

# new-skill — 新 skill 创建

本 skill 是 [docs/05 skill 规范](../../docs/05-agent-工程约定.md) 的可执行封装。**skill 本身不含任何个人信息**——个人库路径、项目位置来自实例工作空间(`$AGENT_ROOT`),本文只写执行顺序与落点判定。

## 0. 收集三要素(缺则问用户)

| 要素 | 约定 |
|---|---|
| 名字 | 小写 kebab-case,目录名 = frontmatter `name` |
| 简介 | 一句话说清干什么,**必须含母语触发语**(如:当用户说「XX」「YY」时触发) |
| 落点 | public / personal / project 三选一,判定规则见下 |

## 1. 判定落点(用户未指定时按此判,拿不准就问)

| scope | 判定标准 | 落点 | 生效方式 |
|---|---|---|---|
| **public** 对外通用 | 不含任何个人信息/凭证/机器细节,是生态约定的可执行封装,fork 本仓库的人也用得上 | awesome-agent 仓库 `skills/<name>/` | `ln -s` 进 `$AGENT_ROOT/skills/<name>` |
| **personal** 个人通用 | 跨项目复用,但绑定个人设施(私有服务、隧道、知识库、凭证) | `$AGENT_ROOT/skills/<name>/`(个人 skill 仓库,源码即部署位) | 写完即生效 |
| **project** 项目专属 | 只服务一个项目 | 该项目仓库 `.claude/skills/<name>/` | 项目内生效 |

判定原则:

- **个人信息一票否决 public**:出现私有域名、IP、端口、账号、机器名的,最多到 personal;
- 默认从 personal / project 起步,被第二个项目用到再上提 personal,要对外分享才进 public(docs/07 的上提约定);
- 文档义务不同:public 的在 docs 相应篇提及;**personal 是个人配置,不写公共文档**;project 的在项目 CLAUDE.md 提一句。

## 2. 写 SKILL.md(骨架拷 [templates/SKILL.md](../../templates/SKILL.md))

- frontmatter 五件套:`name` / `description`(含触发语)/ `argument-hint` / `allowed-tools`(细粒度到 `Bash(ssh *)` 级)/ `user-invocable`;
- 正文固定节:做什么 → 步骤 → 配置 → 降级策略 → 已知坑;
- 铁律同 docs/05:诚实(取不到留空不编造)、可溯源、只增不改;
- 有密钥/机器配置 → 只提交 `config.env.example`,真实 `config.env` 只在本机(个人库 .gitignore 已排除);
- 产出落点如适用用「双模式」:本地写知识库,云端沙箱写仓库 `reports/` 再 commit。

## 3. 落位与生效

- **public**:写进本机 awesome-agent 克隆的 `skills/<name>/`,再 `ln -s <克隆>/skills/<name> $AGENT_ROOT/skills/<name>`(个人库经 `~/.claude/skills` 软链加载,链上即生效);
- **personal**:直接建 `$AGENT_ROOT/skills/<name>/`,无需软链;
- **project**:建在项目仓库 `.claude/skills/<name>/`。

## 4. 验证与收尾

1. 新开会话确认 skill 出现在可用列表、触发语能命中;
2. 按 scope 补文档(public → docs;project → 项目 CLAUDE.md;personal 不动公共文档);
3. commit/push 只做版本管理,由用户决定何时提交(public 与 personal 分属两个仓库,别混提)。

## 已知坑

- description 不写触发语 → skill 永远不会被自动选中;
- allowed-tools 给太宽(裸 `Bash`)→ 违背最小授权;给太窄 → 运行时反复请示,细粒度到子命令刚好;
- public skill 里写死 `$AGENT_ROOT` 之外的绝对路径 → 换机器即坏,路径一律从环境/配置来。
