# awesome-agent

> 个人 agent 脚手架系统:一套经过实践验证的架构蓝图 + 可复用模板。基于它,每个人都能搭出一个**最适合自己**的个人 agent。

## 这是什么

它不是一个框架,也不是一个可以 `npm install` 的库。

它是把「一个人 + AI agent」长期协作所需要的**基础设施**总结成的一套脚手架:你照着 docs 搭起四大支柱,用 templates 里的模板建每一个新项目,agent(比如 Claude Code)就能在这套设施之上替你干活——抓数据、写笔记、部署服务、定时巡检——而所有产出都沉淀在你自己的知识库和存储里,不被任何平台锁定。

核心洞察:**agent 的能力上限不取决于模型,而取决于它能触达的基础设施。** 给 agent 一个知识库,它的产出就能沉淀;给它云存储,它就能处理图片和文件;给它个人网站,它的成果就能对外发布;给它隧道,它就能把任何机器上的服务安全地暴露到公网。

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare 边缘                         │
│   Tunnel(隧道) · Access(鉴权) · R2(存储) · Pages(网站)      │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
┌───────┴───────┐  ┌───────┴───────┐  ┌───────┴───────┐
│  本地主力机    │  │  家用 GPU 机   │  │  云端 VPS     │
│  Claude Code  │  │  Whisper/推理  │  │  7×24 常驻服务 │
│  知识库主副本  │  │  知识库副本    │  │  数据抓取/agent│
│  开发与部署   │  │  claude 登录态 │  │  systemd 管理  │
└───────────────┘  └───────────────┘  └───────────────┘
```

三类机器各司其职,不是都必需——最小可用配置是「一台本地机 + Cloudflare 免费套餐」,GPU 机和 VPS 按需加。

**全局铁律:所有自建服务只监听 `127.0.0.1`,对外一律走 Cloudflare Tunnel + Access 鉴权。** 服务器上不开任何公网端口,安全模型从一开始就收敛到一处。

## 四大支柱

| 支柱 | 一句话 | 文档 |
|------|--------|------|
| 📚 个人知识库 | Obsidian 为中枢,「生成即入库」——agent 的一切产出直接写成笔记 | [docs/01-知识库.md](docs/01-知识库.md) |
| ☁️ 云存储 | Cloudflare R2 做统一对象存储:图床、文件、附件,零依赖上传 | [docs/02-云存储.md](docs/02-云存储.md) |
| 🌐 个人网站 | Docusaurus 静态站:博客 + 项目索引 + 工具门户,agent 成果的对外出口 | [docs/03-个人网站.md](docs/03-个人网站.md) |
| 🚇 隧道与鉴权 | cloudflared + Access:任何机器上的服务一条隧道上公网,邮箱验证码鉴权 | [docs/04-隧道与鉴权.md](docs/04-隧道与鉴权.md) |

四大支柱之上,还有一层「软件约定」——agent 怎么在这套设施上干活:

| 约定 | 一句话 | 文档 |
|------|--------|------|
| 🤖 agent 工程约定 | CLAUDE.md 骨架、skill 规范、四种部署模式、模型三级后端、调度策略 | [docs/05-agent-工程约定.md](docs/05-agent-工程约定.md) |
| 📣 通知系统 | agent 的反向通道:Telegram / Discord 可插拔推送,永不阻塞主流程、分级防轰炸 | [docs/06-通知系统.md](docs/06-通知系统.md) |
| 🗂️ 目录框架 | `$AGENT_ROOT` 下 projects / memory / skills 三分,项目只在 [registry/](registry/) 登记简介与 git 路径 | [docs/07-目录框架.md](docs/07-目录框架.md) |
| 🚀 项目创建流程 | 定名字/域名/图标三要素 → 建仓 → 部署 → Access 先于 DNS → 验证 → 登记,20 分钟标准动线 | [docs/08-项目创建流程.md](docs/08-项目创建流程.md) |

## 初始化与项目面板

clone 本仓库后两步可用,零依赖(只需 Node ≥ 20 与 git):

```bash
./init.sh              # 交互式初始化:输入 GitHub token、域名、Cloudflare 授权 → 生成 config.env
node web/server.mjs    # 启动项目面板 → http://127.0.0.1:8787
```

- **`init.sh`** 同时会:建好 `$AGENT_ROOT` 目录框架(docs/07)、clone 记忆/skill 仓库、把 `agent/` 初始化为你的**私有工作区**(独立 git 仓库,本仓库已 gitignore,存放个人 CLAUDE.md 等私有配置)。幂等,可重复运行。
- **`web/`** 是项目面板:读取 [registry/](registry/) 登记簿渲染所有项目卡片(状态、部署位置、仓库与访问链接)。只监听 `127.0.0.1`,对外发布走 Tunnel + Access(docs/04)。
- 真实配置只存在于 `config.env`(gitignore),模板见 [config.env.example](config.env.example)。

## 模板

`templates/` 下是建新项目时直接拷走的骨架文件:

- [`CLAUDE.md`](templates/CLAUDE.md) — 写给 agent 的工程说明模板(铁律 → 运行模型 → 目录 → 约定 → 命令 → 环境变量 → 部署 → 已知坑)
- [`SKILL.md`](templates/SKILL.md) — Claude Code skill 定义模板
- [`config.env.example`](templates/config.env.example) — 配置模板约定(真实值永不入库)
- [`deploy.sh`](templates/deploy.sh) — 零 sudo 用户级 systemd 部署脚本模板
- [`app.service`](templates/app.service) — 用户级 systemd 单元模板
- [`notify.mjs`](templates/notify.mjs) — 零依赖通知模块(Telegram + Discord 可插拔,限频、分段、429 退避)
- [`gitignore`](templates/gitignore) — 默认排除清单

## 设计原则

沉淀自十几个真实项目的共同经验:

1. **诚实** — 数据取不到就留空、记 missing,绝不编造;每个端点回包带「数据截至」时间,前端如实显示。
2. **零依赖优先** — 标准库能写完就不引第三方包。没有 node_modules,部署就是拷文件,十年后还能跑。
3. **生成即入库** — agent 产出直接写进知识库,不写「事后同步脚本」。同步脚本一定会坏,写入动作不会。
4. **涉密不入库** — 仓库只放 `config.env.example` 模板,真实密钥只存在于部署机;内网 IP、设备路径不进公开文档。
5. **一个工具一个目录** — 自带 README + 配置模板 + 部署脚本,可以独立理解、独立部署、独立报废。
6. **已知坑必须记下来** — 每个项目文档留一节「已知坑」,agent 接手时先读坑,别再踩一遍。

## 如何开始

0. **备齐依赖**(10 分钟核对):一台机器 + Cloudflare + 域名 + GitHub + Claude → [docs/00-依赖清单.md](docs/00-依赖清单.md)
1. **搭知识库**(半天):装 Obsidian,建 vault,配同步 → [docs/01](docs/01-知识库.md)
2. **开通 Cloudflare**(1 小时):域名 + R2 桶 + Tunnel + Access → [docs/02](docs/02-云存储.md) / [docs/04](docs/04-隧道与鉴权.md)
3. **建个人网站**(半天):Docusaurus 初始化,wrangler 部署 → [docs/03](docs/03-个人网站.md)
4. **立工程约定**(1 小时):把 templates 拷进你的第一个项目,写好 CLAUDE.md → [docs/05](docs/05-agent-工程约定.md)
5. 之后每个新项目 10 分钟建好:拷模板 → 建仓 → 写文档 → 登记 → 上线。

## License

MIT
