# <项目名>(一句话定位)

> 写给 AI 助手 / 新接手者的工程说明。先读这份,再动代码。面向用户的说明见 README.md。

## 三条铁律

1. **诚实**:数据取不到就留空 / 记 missing,绝不编造。
2. **可溯源**:每条数据能回答「从哪来、何时取的」。
3. **只增不改**:历史记录只追加,不回改。

## 技术栈与运行模型

- 技术栈:<Node 零框架 / Python / …>
- 运行位置:<哪台机器,什么方式常驻>
- 监听:`127.0.0.1:<port>`,对外经 <子域> 隧道 + Access

## 目录结构

```
src/
├── server.ts      # ★ 入口与路由
├── env.ts         # 配置读取
├── scheduler.ts   # poller 管理
└── ...
```

(★ 标注核心文件,改功能先看这里)

## 核心约定

- <项目特有的口径、命名、数据流约定>

## 常用命令

```bash
npm run dev        # 本地开发
npm test           # 测试
./deploy.sh        # 部署
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `PORT` | 否 | 默认 <port> |
| `...` | | |

真实值在部署机 `config.env`,仓库只有 `config.env.example`。

## 部署与运维

- 部署模式:<A tar 管道 / B 自举脚本 / C rsync / D git pull>
- 重启:`systemctl --user restart <name>`
- 日志:`journalctl --user -u <name> -f`
- 健康检查:`curl -s 127.0.0.1:<port>/healthz`

## 已知坑

- <每踩一个坑就记一条:现象 → 原因 → 对策>
