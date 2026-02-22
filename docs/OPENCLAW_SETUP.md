# OpenClaw 定时调度配置

本文档说明如何通过 OpenClaw 定时执行 `pipeline-lite.sh`，实现 PropertyFinder + Dubizzle 的无人值守增量爬取、评分、导出和部署。

---

## 概览

| 项目 | 值 |
|------|-----|
| 脚本 | `scripts/pipeline-lite.sh` |
| 推荐频率 | 每 3 小时 |
| 覆盖平台 | PropertyFinder、Dubizzle |
| 跳过平台 | Bayut（需有头浏览器 + 手动验证码） |
| 预计耗时 | 20–90 秒 |
| 输出 | `data/static/*.json` 推送至 Git → Vercel 自动部署 |
| 退出码 | 0 = 成功，1 = 失败 |

---

## 流程图

```
Preflight ──→ Scrape PF ──→ Scrape Dubizzle ──→ Score ──→ Git Pull ──→ Export JSON ──→ Git Push
   │              │                │                │          │              │              │
   ▼              ▼                ▼                ▼          ▼              ▼              ▼
 Node/Mongo    增量爬取         增量爬取          全局排名    rebase 同步    MongoDB→JSON    Vercel 部署
 Git 检查      ~60s             ~7s              ~5s         ~1s            ~2s             ~2s
```

---

## OpenClaw 配置

### 命令

```bash
cd /path/to/uae-property-scraper && bash scripts/pipeline-lite.sh
```

> 将 `/path/to/uae-property-scraper` 替换为项目实际绝对路径。

### Cron 表达式

```
0 */3 * * *
```

每 3 小时整点执行一次（00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00）。

### 环境要求

OpenClaw 执行环境必须满足：

| 依赖 | 说明 |
|------|------|
| Node.js | v18+（项目使用 `require()` 语法） |
| npm | 已安装项目依赖（`npm install`） |
| MongoDB | 可达（本地 Docker 或远程 Atlas） |
| Git | 已配置 push 权限（SSH key 或 HTTPS token） |
| `.env` | 项目根目录有 `.env` 文件，含以下变量 |

### 必需环境变量

```env
MONGO_URI=mongodb://localhost:27017    # 或 Atlas 连接串
MONGO_DB_NAME=uae_real_estate
```

脚本通过 `src/config/index.js` 读取 `.env`（使用 `dotenv`）。

---

## 安全机制

脚本内置多项安全检查，避免在异常状态下执行：

| 检查项 | 失败行为 |
|--------|----------|
| `node` 不存在 | 立即退出，错误码 1 |
| MongoDB 无法连接（5 秒超时） | 立即退出，错误码 1 |
| Git 工作区有未提交的非数据文件 | 立即退出，避免冲突 |
| `git pull --rebase` 冲突 | 立即退出，需手动解决 |
| `git push` 失败 | 立即退出，错误码 1 |
| 无数据变更 | 跳过 commit/push，正常退出 |

### Git 操作顺序

```
git checkout -- data/static/    # 丢弃旧导出文件
git pull --rebase origin main   # 同步远程（必须在 export 之前）
npm run export:json             # 导出新数据到 data/static/
git add data/static/*.json      # 仅添加数据文件
git commit + push               # 有变更才提交
```

> **关键约束：** `git pull --rebase` 必须在 `export:json` 之前执行，因为导出会在 `data/static/` 创建脏文件，阻止 rebase。

---

## 日志示例

成功执行：

```
[pipeline-lite 15:00:02] Preflight checks...
[pipeline-lite 15:00:03] [1/4] Scraping PropertyFinder (incremental)...
[pipeline-lite 15:00:18] [1/4] Scraping Dubizzle (incremental)...
[pipeline-lite 15:00:20] [2/4] Running targeted scoring...
[pipeline-lite 15:00:22] [3/4] Syncing with remote...
[pipeline-lite 15:00:23] [3/4] Exporting MongoDB to static JSON...
[pipeline-lite 15:00:24] [4/4] Committing and pushing...
[pipeline-lite 15:00:26] Pushed. Vercel will redeploy.
[pipeline-lite 15:00:26] Done. Total: 24s
```

无变更（跳过推送）：

```
[pipeline-lite 18:00:15] [4/4] Committing and pushing...
[pipeline-lite 18:00:15] No data changes. Skipping push.
[pipeline-lite 18:00:15] Done. Total: 13s
```

---

## 故障排查

| 错误信息 | 原因 | 解决方式 |
|----------|------|----------|
| `node not found` | Node.js 未安装或不在 PATH | 在 OpenClaw 环境中安装 Node.js |
| `MongoDB unreachable` | MongoDB 未运行或连接串错误 | 检查 Docker / Atlas 状态和 `.env` |
| `Uncommitted non-data changes` | 工作区有手动修改未提交 | 手动 commit 或 stash |
| `Git pull --rebase failed` | 远程有冲突变更 | 手动 `cd` 到项目目录，`git rebase --continue` 或 `--abort` |
| `Git push failed` | 权限问题或远程保护规则 | 检查 SSH key / HTTPS token |
| `PropertyFinder scrape failed` | BuildID 过期或反爬拦截 | 重试通常自动恢复（BuildID 自动刷新） |
| `Dubizzle scrape failed` | Algolia API 超时或限流 | 等待下一轮自动重试 |

---

## 手动测试

首次配置 OpenClaw 前，建议先手动执行一次验证：

```bash
# 1. 确认依赖已安装
cd /path/to/uae-property-scraper
npm install

# 2. 执行管线
bash scripts/pipeline-lite.sh

# 3. 预期输出：退出码 0，终端显示 "Done. Total: XXs"
echo $?  # 应输出 0
```

---

## 完整管线（含 Bayut）

如需包含 Bayut 的全量管线（需人工介入验证码），使用：

```bash
bash scripts/pipeline.sh
```

此脚本不适合无人值守定时任务，仅供手动执行。
