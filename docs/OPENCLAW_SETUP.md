# OpenClaw 定时调度配置

本文档说明如何通过 OpenClaw 定时执行 `pipeline-lite.sh`，实现 PropertyFinder + Dubizzle 的无人值守爬取、评分、导出和部署。

---

## 概览

| 项目 | 值 |
|------|-----|
| 脚本 | `scripts/pipeline-lite.sh` |
| 频率 | 每 2 小时 + 10 分钟随机抖动（防反爬） |
| 爬取模式 | `SCRAPE_MODE=full`（全量）或 `incremental`（增量，默认） |
| 覆盖平台 | PropertyFinder、Dubizzle |
| 跳过平台 | Bayut（需有头浏览器 + 手动验证码） |
| 预计耗时 | 20–90 秒（增量），更长（全量） |
| 输出 | `data/static/*.json` 推送至 Git → Vercel 自动部署 |
| 退出码 | 0 = 成功，1 = 失败 |

---

## 架构

```
GuestOS (OpenClaw cron)
  │
  │  openclaw cron → agent turn → exec tool
  │
  ▼
ssh huan.lu@192.168.64.1 'bash -l -c "SCRAPE_MODE=full bash /path/to/scripts/pipeline-lite.sh"'
  │
  ▼
HostOS (项目所在机器)
  │
  ▼
Preflight ──→ Scrape PF ──→ Scrape Dubizzle ──→ Score ──→ Git Pull ──→ Export JSON ──→ Git Push
   │              │                │                │          │              │              │
   ▼              ▼                ▼                ▼          ▼              ▼              ▼
 Node/Mongo    全量/增量        全量/增量        全局排名    rebase 同步    MongoDB→JSON    Vercel 部署
 Git 检查      ~60s             ~7s              ~5s         ~1s            ~2s             ~2s
```

---

## 当前 Cron Job

| 项目 | 值 |
|------|-----|
| Job ID | `d51ad594-f113-4c59-82b3-b1569f1d71cc` |
| Name | `uae-property-scrape` |
| Cron 表达式 | `0 */2 * * *` |
| 时区 | Asia/Dubai |
| 抖动窗口 | 10 分钟（`staggerMs: 600000`） |
| Agent | `main` |
| 超时 | 600 秒 |
| 执行命令 | `ssh huan.lu@192.168.64.1 'bash -l -c "SCRAPE_MODE=full bash /Users/huan.lu/GitHub/uae-property-scraper/scripts/pipeline-lite.sh"'` |

### 管理命令

在 GuestOS 上执行（需先 `export PATH="/opt/homebrew/bin:$PATH"`）：

```bash
# 查看所有 cron jobs
openclaw cron list --json

# 手动触发
openclaw cron run d51ad594-f113-4c59-82b3-b1569f1d71cc

# 查看运行历史
openclaw cron runs --id d51ad594-f113-4c59-82b3-b1569f1d71cc

# 禁用
openclaw cron disable d51ad594-f113-4c59-82b3-b1569f1d71cc

# 启用
openclaw cron enable d51ad594-f113-4c59-82b3-b1569f1d71cc

# 删除
openclaw cron rm d51ad594-f113-4c59-82b3-b1569f1d71cc
```

### 重新创建（如需修改参数）

```bash
openclaw cron add \
  --name "uae-property-scrape" \
  --description "Full scrape PF+Dubizzle, score, export JSON, git push to Vercel" \
  --cron "0 */2 * * *" \
  --stagger 10m \
  --tz "Asia/Dubai" \
  --message "Run the UAE property scraper pipeline. Execute this single command via your exec tool: ssh huan.lu@192.168.64.1 'bash -l -c \"SCRAPE_MODE=full bash /Users/huan.lu/GitHub/uae-property-scraper/scripts/pipeline-lite.sh\"'. Report the full stdout and stderr. If any step fails, report the error details." \
  --agent main \
  --timeout-seconds 600 \
  --no-deliver
```

---

## 环境要求

### HostOS（项目所在）

| 依赖 | 说明 |
|------|------|
| Node.js | v18+（项目使用 `require()` 语法） |
| npm | 已安装项目依赖（`npm install`） |
| MongoDB | 可达（本地 Docker 端口 27018） |
| Git | 已配置 push 权限（SSH key） |
| `.env` | 项目根目录有 `.env` 文件 |

### GuestOS（OpenClaw 所在）

| 依赖 | 说明 |
|------|------|
| OpenClaw | Gateway 运行中，监听 `127.0.0.1:18789` |
| SSH | 可免密连接 HostOS（`huan.lu@192.168.64.1`） |
| 设备配对 | CLI 已与 Gateway 配对（`openclaw devices list` 确认） |

### 必需环境变量（HostOS `.env`）

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

成功执行（全量）：

```
[pipeline-lite 22:05:09] Preflight checks...
[pipeline-lite 22:05:09] [1/4] Scraping PropertyFinder (full)...
[pipeline-lite 22:05:37] [1/4] Scraping Dubizzle (full)...
[pipeline-lite 22:05:37] [2/4] Running targeted scoring...
[pipeline-lite 22:05:37] [3/4] Syncing with remote...
[pipeline-lite 22:05:37] [3/4] Exporting MongoDB to static JSON...
[pipeline-lite 22:05:37] [4/4] Committing and pushing...
[pipeline-lite 22:05:38] Pushed. Vercel will redeploy.
[pipeline-lite 22:05:38] Done. Total: 29s
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
| `node not found` | 非交互式 SSH 的 PATH 缺失 | 确保用 `bash -l -c "..."` 包裹命令 |
| `MongoDB unreachable` | MongoDB 未运行或连接串错误 | 检查 Docker 状态和 `.env` |
| `Uncommitted non-data changes` | 工作区有手动修改未提交 | 手动 commit 或 stash |
| `Git pull --rebase failed` | 远程有冲突变更 | 手动 `git rebase --continue` 或 `--abort` |
| `Git push failed` | 权限问题或远程保护规则 | 检查 SSH key |
| `PropertyFinder scrape failed` | BuildID 过期或反爬拦截 | 重试通常自动恢复（BuildID 自动刷新） |
| `Dubizzle scrape failed` | Algolia API 超时或限流 | 等待下一轮自动重试 |
| `pairing required` | OpenClaw CLI 未与 Gateway 配对 | `openclaw devices list` → `openclaw devices approve <id>` |
| `gateway timeout` | Gateway 响应超时 | 检查 Gateway 是否运行：`openclaw health` |

---

## 手动测试

### 从 HostOS 本地测试

```bash
cd /Users/huan.lu/GitHub/uae-property-scraper
SCRAPE_MODE=full bash scripts/pipeline-lite.sh
echo $?  # 应输出 0
```

### 从 GuestOS 远程测试（模拟 cron 执行路径）

```bash
export PATH="/opt/homebrew/bin:$PATH"
openclaw cron run d51ad594-f113-4c59-82b3-b1569f1d71cc
# 等待 1-2 分钟后查看结果：
openclaw cron runs --id d51ad594-f113-4c59-82b3-b1569f1d71cc
```

---

## 完整管线（含 Bayut）

如需包含 Bayut 的全量管线（需人工介入验证码），使用：

```bash
bash scripts/pipeline.sh
```

此脚本不适合无人值守定时任务，仅供手动执行。
