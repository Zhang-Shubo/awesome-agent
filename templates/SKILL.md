---
name: <skill-name>
description: <一句话说明,包含触发语,如:当用户说「收藏这个网页」「保存网页」时使用>
argument-hint: <URL 或其它参数提示>
allowed-tools: Read, Write, Bash(python3 *), Bash(ssh *)
user-invocable: true
---

# <Skill 名称>

## 做什么

<一句话:输入什么,产出什么,落到哪里>

## 步骤

1. <步骤一>
2. <步骤二>
3. 产出落点:
   - 检测到知识库目录(`<VAULT_DIR>`)→ 直接写入 `<VAULT_DIR>/<分区>/`;
   - 检测不到(云端沙箱)→ 写入仓库 `reports/` 并 `git commit && git push`。

## 配置

读取同目录 `config.env`(真实值只在部署机,仓库只有 `config.env.example`):

```bash
VAULT_DIR=~/Documents/vault
R2_ENDPOINT=...
```

## 降级策略

- <依赖不可用时怎么办,如:R2 未配置则保留原图外链;单图失败保留原链继续>

## 已知坑

- <坑记录>
