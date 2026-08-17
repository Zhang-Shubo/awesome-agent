# 05 · agent 工程约定

> 四大支柱是硬件,这一篇是软件:agent 怎么在这套设施上干活。全部沉淀自十几个真实项目的共同做法。

## CLAUDE.md 双层文档约定

每个项目两份文档,分工明确:

- **README.md** — 写给用户:这是什么、怎么用;
- **CLAUDE.md** — 写给 AI 助手 / 新接手者:「先读这份,再动代码」。

CLAUDE.md 固定章节骨架(模板见 [templates/CLAUDE.md](../templates/CLAUDE.md)):

```
三条铁律 → 技术栈与运行模型 → 目录结构(★ 标注核心文件)
→ 核心约定 → 常用命令 → 环境变量 → 部署与运维 → 已知坑
```

铁律在所有项目里高度一致:

1. **诚实** — 取不到就留空 / 记 missing,绝不编造;
2. **可溯源** — 每条数据能回答「从哪来、何时取的」;
3. **只增不改** — 历史记录只追加,不回改。

**「已知坑」是最有复用价值的一节**:token 互挤、`process.exit()` 截断管道输出、`CREATE TABLE IF NOT EXISTS` 不会加新列、Python 管道要 `PYTHONUNBUFFERED=1`……坑记下来,agent 换个会话也不会再踩。

## 工具项目的建仓约定

1. **一个工具一个子目录**,自带 `README.md` + `config.env.example` + `deploy.sh`;
2. **零依赖优先**:标准库写完就不引第三方包,没有 node_modules,部署 = 拷文件;
3. 服务只听 `127.0.0.1`,对外走隧道 + Access(见 [04](04-隧道与鉴权.md));
4. **配置走 `config.env`,真实值只在部署机**,仓库只放 `.example` 模板;
5. 部署用**用户级 systemd**(`systemctl --user` + loginctl linger),全程免 sudo。

## skill 规范(Claude Code)

- **源码即部署位**:通用 skill 仓库直接放 `$AGENT_ROOT/skills`,`~/.claude/skills` 软链过去(见 [07](07-目录框架.md)),改完即生效;运行时文件(`config.env` 密钥、`.venv`)由 .gitignore 排除,只存在本机;
- SKILL.md frontmatter:`name` / `description`(含母语触发语)/ `argument-hint` / `allowed-tools`(细粒度到 `Bash(ssh *)`)/ `user-invocable`,模板见 [templates/SKILL.md](../templates/SKILL.md);
- 落点用「双模式」:本地写知识库,云端沙箱写仓库 `reports/` 再 commit(见 [01](01-知识库.md))。

## 四种部署模式

按项目形态选一种,写进 deploy.sh 或 CLAUDE.md:

```bash
# A. tar 管道推送(排除 node_modules/.git/data,远端装依赖后重启)
tar czf - --exclude node_modules --exclude .git --exclude data . \
  | ssh <host> 'tar xzf - -C ~/app'
ssh <host> 'cd ~/app && npm install && systemctl restart app'
# ⚠️ 永远排除 data/ —— 别用本地测试数据覆盖服务器真实数据

# B. tar 管道 + 远端自举(deploy.sh 一把梭:传码→装依赖→首次生成
#    config.env(已有不覆盖)→写 systemd unit→restart→curl /healthz 自测)

# C. 本地构建 + rsync(前端类:build 后 rsync --delete 产物目录)

# D. git pull 原地更新(服务器本身有仓库时最简单)
ssh <host> 'cd ~/app && git pull --ff-only && systemctl restart app'
```

用户级 systemd 单元模板见 [templates/app.service](../templates/app.service):`%h` 引用家目录、`EnvironmentFile` 读 config.env、Node 路径部署时 sed 替换——不写死任何机器特定路径。

## 模型调用:三级后端

agent 服务里调模型的统一抽象(同一份代码平移到所有项目,环境变量同名、日志同格式):

1. `ANTHROPIC_API_KEY` 已设 → 直连 Anthropic API(服务器首选,不依赖登录态);
2. `CLAUDE_SSH_HOST` 已设 → prompt 经 stdin 送 `ssh <host> claude -p`,**借远程机器的 Claude Code 订阅登录态**(服务器免 Key);
3. 都不设 → 本机 `claude -p`。

配套习惯:

- CLI 后端用 `--output-format json` 拿真实 token 数与等价成本;
- 每次调用(成功/失败)记账入库,出 5h/24h/7d 滚动窗用量端点(5h 对应订阅额度窗);
- 已知坑:**多台机器共用同一订阅账号会 token 互挤导致 401**;`claude -p` 记得显式指定模型,默认模型可能偏旧。

## 调度:进程内 poller 优先,cron 是逃生舱

- 常驻服务用统一的 `createPoller`(启动即跑一次 + 重入保护)管理所有周期任务;
- **约定:任一间隔设 `0` 即关闭该 poller,改用外部 cron 跑对应命令**——每个 poller 带 `disabledHint` 字符串,明确告诉运维该跑哪条命令;
- 每个端点回包带 `meta.lastRun / meta.lastIngest`,前端如实显示「数据截至」。

## 横向五件套 + 存储

小型服务间平移复用的模块:`env.ts`(配置)/ `http.ts`(请求)/ `log.ts`(日志)/ `notify.ts`(通知,详见 [06](06-通知系统.md))/ `scheduler.ts`(调度)。

存储统一 SQLite(WAL 模式);表结构迁移用极简策略:**只加可空列**,维护一份 `ADDED_COLUMNS` 清单,启动时补列——够用十年。
