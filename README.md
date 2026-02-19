# UAE Property Scraper

阿布扎比租房市场数据爬虫与仪表盘。支持三大房产平台：Property Finder（Next.js API）、Bayut（Playwright SSR 提取）、Dubizzle（Algolia API 直连）。数据存入 MongoDB，并提供 Web 仪表盘用于浏览和分析。

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         爬虫集群                                     │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  PropertyFinder   │  │      Bayut        │  │    Dubizzle      │  │
│  │  (HTTP / axios)   │  │  (Playwright)     │  │  (HTTP / axios)  │  │
│  │                   │  │                   │  │                  │  │
│  │ _next/data/ API   │  │ window.state      │  │ Algolia API      │  │
│  │ Build ID 自动刷新 │  │ SSR 数据提取      │  │ 直连（无需浏览器）│  │
│  │ Cookie + UA 轮换  │  │ Humbucker 反爬    │  │ ~7 秒完成        │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                      │            │
│           │    ┌────────────────┴──────────────┐       │            │
│           └────┤        共享基础设施            ├───────┘            │
│                │  · 令牌桶限速 + 随机抖动      │                    │
│                │  · 熔断器（增量模式提前退出）  │                    │
│                │  · 结构化日志 (pino)           │                    │
│                │  · MongoDB 批量 upsert         │                    │
│                └────────────┬──────────────────┘                    │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                   ┌──────────▼──────────┐
                   │      MongoDB        │
                   │  (Docker, 本机)      │
                   │  3 个集合:           │
                   │  · propertyfinder_raw│
                   │  · bayut_raw         │
                   │  · dubizzle_raw      │
                   └──────────┬──────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────────┐
│              Express API 服务器                                      │
│  GET /api/listings    GET /api/stats    GET /api/bedrooms            │
│  (默认混合三平台 source=all，可切换 pf | bayut | dubizzle)          │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                   ┌──────────▼──────────┐
                   │   前端仪表盘         │
                   │   (深色主题 SPA)     │
                   └─────────────────────┘
```

## 功能

- **三大平台支持**：PropertyFinder（HTTP API）、Bayut（Playwright 浏览器自动化）、Dubizzle（Algolia API 直连，约 7 秒完成）
- **两种爬取模式**：全量（首次批量抓取）和增量（日常更新）
- **自动恢复**：PropertyFinder 遇到 404 错误时自动刷新 Build ID；Bayut 遇到 Humbucker 反爬自动等待
- **令牌桶限速**：均匀分布 + 随机抖动，避免突发请求
- **熔断器**：增量模式下连续遇到 50 条已存在房源时自动停止翻页（三个爬虫各自独立配置）
- **Cookie 会话管理**：PropertyFinder 跨请求保持 Cookie；Bayut 通过 Playwright 管理浏览器会话
- **优雅停机**：捕获 SIGINT/SIGTERM 信号，排空队列后再退出
- **结构化日志**：通过 pino 输出 JSON 日志，包含请求统计
- **MongoDB 批量 upsert**：按 listing ID 去重，`ordered: false` 容错
- **统一仪表盘**：深色主题 Web 界面，默认混合显示三平台数据，每条房源标注来源徽章（PropertyFinder / Bayut / Dubizzle），支持按平台筛选、统计卡片、卧室分布图、价格/关键词/装修筛选、分页

## 前置条件

- **Node.js** >= 18
- **Docker Desktop**（用于运行 MongoDB）
- **Playwright**（仅 Bayut 爬虫需要）：`npx playwright install chromium`

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env    # 按需修改 .env

# 3. 启动 MongoDB
npm run db:setup

# 4. 运行爬虫（三选一或组合使用）
npm run scrape:incremental           # PropertyFinder 增量
npm run scrape:bayut:incremental     # Bayut 增量（需要 Playwright）
npm run scrape:dubizzle:incremental  # Dubizzle 增量（最快，~7 秒）

# 5. 启动仪表盘
npm run server               # http://localhost:3000
```

## 项目结构

```
src/
├── config/index.js              # 统一配置（三个爬虫 + API + 日志）
├── lib/
│   ├── logger.js                # pino 结构化日志
│   ├── database.js              # MongoDB 连接、批量 upsert、查询（含数据源适配器）
│   ├── rate-limiter.js          # 令牌桶限速（async-sema，均匀分布）
│   ├── cookie-manager.js        # axios + tough-cookie + User-Agent 轮换
│   └── build-id.js              # 从搜索页提取 Build ID
├── scraper/                     # PropertyFinder 爬虫
│   ├── index.js                 # 主入口：调度器 + 优雅停机
│   ├── fetcher.js               # API 请求 + 404 自动恢复
│   ├── search-combinations.js   # 搜索过滤条件的笛卡尔积
│   └── circuit-breaker.js       # 增量模式提前退出逻辑
├── scraper-bayut/               # Bayut 爬虫（Playwright + SSR 提取）
│   ├── index.js                 # 主入口：调度器 + 优雅停机
│   ├── fetcher.js               # 页面导航 + window.state 数据提取
│   ├── search-combinations.js   # 搜索 URL 组合生成
│   └── browser-session.js       # Playwright 浏览器会话 + Humbucker 反爬处理
├── scraper-dubizzle/            # Dubizzle 爬虫（Algolia API 直连）
│   ├── index.js                 # 主入口：调度器 + 优雅停机
│   ├── fetcher.js               # Algolia API 请求 + 过滤器构造
│   └── search-combinations.js   # 搜索组合生成（城市/类别/卧室/价格）
├── api/
│   ├── server.js                # Express 服务器 + 静态文件托管
│   └── routes/listings.js       # 前端 REST 接口
└── frontend/
    ├── index.html               # 仪表盘页面
    ├── css/styles.css            # 深色主题样式
    └── js/app.js                # 统计、图表、房源卡片、分页
```

## 配置

所有配置通过 `.env` 文件管理：

### 通用配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MONGO_URI` | `mongodb://127.0.0.1:27017` | MongoDB 连接串 |
| `API_PORT` | `3000` | 仪表盘服务端口 |
| `LOG_LEVEL` | `info` | 日志级别：`debug`、`info`、`warn`、`error` |

### PropertyFinder 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODE` | `incremental` | 爬取模式：`full`（全量）或 `incremental`（增量） |
| `RATE_LIMIT_RPM` | `8` | 每分钟最大请求数（均匀分布） |
| `CONCURRENCY` | `2` | 并发爬取 worker 数 |
| `CIRCUIT_BREAK_THRESHOLD` | `50` | 连续遇到已存在房源的阈值，达到后停止翻页 |

### Bayut 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BAYUT_MODE` | `incremental` | 爬取模式：`full` 或 `incremental` |
| `BAYUT_SEED_URL` | `https://www.bayut.com/to-rent/apartments/abu-dhabi/` | 初始 URL（用于触发 Humbucker 验证） |
| `BAYUT_HEADLESS` | `true` | 是否无头模式运行浏览器（`false` 可看到浏览器界面） |
| `BAYUT_PAGE_DELAY_MS` | `5000` | 页面间延迟（毫秒） |
| `BAYUT_MAX_RECHALLENGE` | `3` | 最大 captcha 重试次数 |
| `BAYUT_CIRCUIT_BREAK_THRESHOLD` | `50` | 连续重复房源阈值（增量模式） |

### Dubizzle 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DUBIZZLE_MODE` | `incremental` | 爬取模式：`full` 或 `incremental` |
| `DUBIZZLE_PAGE_DELAY_MS` | `1000` | 页面间延迟（毫秒） |
| `DUBIZZLE_CIRCUIT_BREAK_THRESHOLD` | `50` | 连续重复房源阈值（增量模式） |

## API 接口

| 接口 | 说明 |
|------|------|
| `GET /api/listings?page=1&limit=20&source=all&minPrice=&maxPrice=&bedrooms=&furnished=&search=` | 分页房源搜索（`source`: `all`/`pf`/`bayut`/`dubizzle`，默认 `all` 混合三平台） |
| `GET /api/stats?source=all` | 聚合统计（总数、均价、中位数、单位价、IQR、在架天数、平均面积等；默认 `all`） |
| `GET /api/bedrooms?source=all` | 卧室数量分布（默认 `all`，自动合并三平台的开间/1室等分类） |

详细参数说明见 [docs/API_QUERY_REFERENCE.md](docs/API_QUERY_REFERENCE.md)。

## 技术细节

### PropertyFinder API

Property Finder 在同一域名下运行多个 Next.js 应用。搜索应用的 `basePath` 为 `"/search"`，数据路由为 `/search/_next/data/{buildId}/en/search.json`。Build ID **必须**从 `/en/search` 页面提取，不能从首页提取（首页是另一个 Next.js 应用，Build ID 不同）。

### Bayut SSR 提取

Bayut 使用自定义 SSR 框架（非 Next.js/Nuxt）。搜索数据嵌入在 `window.state.algolia.content` 中。爬虫通过 Playwright 加载页面后提取该数据。首次访问时需要通过 Humbucker WAF 验证（headed 模式下约 20 秒自动通过）。浏览器上下文每 50 页重启一次以防内存泄漏。

### Dubizzle Algolia 直连

Dubizzle 的前端使用 Next.js，但搜索数据来自 Algolia。爬虫直接调用 Algolia API（无需浏览器），速度极快（约 7 秒）。API Key 仅限访问住宅租赁和合租索引。

### 反检测策略

- **PropertyFinder**：持久化 Cookie Jar + User-Agent 轮换池 + `x-nextjs-data: 1` 请求头模拟 SPA 导航
- **Bayut**：Playwright 隐藏 webdriver 标记 + 真实浏览器 UA + Dubai 时区/语言
- **Dubizzle**：直接调用 Algolia API，无需特殊反检测措施

### MongoDB 连接

MongoDB 通过 Docker 运行，已启用认证。账号密码存储在 `.env` 文件中（该文件已被 `.gitignore` 排除，不会提交到 git）。

**连接串格式：**

```
mongodb://<用户名>:<密码>@<主机>:<端口>/uae_real_estate?authSource=admin
```

**本机连接：**

```
mongodb://<用户名>:<密码>@127.0.0.1:27018/uae_real_estate?authSource=admin
```

**局域网连接（其他设备）：**

```
mongodb://<用户名>:<密码>@<本机局域网IP>:27018/uae_real_estate?authSource=admin
```

> 获取本机局域网 IP：`ipconfig getifaddr en0`（macOS）

**DataGrip 等 GUI 客户端配置：**

| 字段 | 值 |
|------|------|
| Host | `127.0.0.1`（本机）或局域网 IP（远程） |
| Port | `27018` |
| Authentication | Username & Password |
| User | 见 `.env` 中的 `MONGO_URI` |
| Password | 见 `.env` 中的 `MONGO_URI` |
| Authentication database | `admin` |
| Database | `uae_real_estate` |

> **注意：** 端口为 `27018`，不是默认的 `27017`。连接串中 `authSource=admin` 参数不可省略，否则认证失败。

### MongoDB 数据结构

- 数据库：`uae_real_estate`
- 集合：`propertyfinder_raw`、`bayut_raw`、`dubizzle_raw`
- `listing_id` 字段上有唯一索引
- 原始 JSON 数据从 API 直接保存，额外附加 `crawled_at`（抓取时间）和 `spider_source`（数据来源）元数据

## 脚本命令

| 命令 | 说明 |
|------|------|
| `npm run scrape:full` | PropertyFinder 全量爬取 |
| `npm run scrape:incremental` | PropertyFinder 增量爬取 |
| `npm run scrape:bayut:full` | Bayut 全量爬取 |
| `npm run scrape:bayut:incremental` | Bayut 增量爬取 |
| `npm run scrape:bayut:debug` | Bayut 全量爬取（显示浏览器窗口） |
| `npm run scrape:dubizzle:full` | Dubizzle 全量爬取 |
| `npm run scrape:dubizzle:incremental` | Dubizzle 增量爬取 |
| `npm run server` | 启动仪表盘，端口 3000 |
| `npm run dev` | 同时启动仪表盘和 PropertyFinder 增量爬虫 |
| `npm run db:setup` | 启动 MongoDB Docker 容器 |
| `npm run db:stop` | 停止 MongoDB 容器 |
| `npm run db:migrate` | 运行所有待执行的数据库迁移 |
| `npm run db:migrate:status` | 查看迁移状态 |
| `npm run db:migrate:rollback` | 回滚指定迁移 |
| `npm run db:backup` | 备份数据库 |
| `npm run db:restore` | 从备份恢复数据库 |

## 许可证

UNLICENSED - 私有项目。
