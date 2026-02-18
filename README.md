# UAE Property Scraper

阿布扎比租房市场数据爬虫与仪表盘。通过 Property Finder 的 Next.js 内部数据 API 抓取房源信息，存入 MongoDB，并提供 Web 仪表盘用于浏览和分析。

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    爬虫主进程                         │
│  ┌───────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ Build ID  │  │  令牌桶    │  │   熔断器        │  │
│  │ 解析器    │  │  限速器    │  │   (增量模式     │  │
│  │ (404时    │  │  + 随机   │  │    提前退出)    │  │
│  │  自动刷新) │  │  抖动     │  │                │  │
│  └─────┬─────┘  └─────┬─────┘  └───────┬────────┘  │
│        └──────────┬────┘               │            │
│              ┌────▼────┐    ┌──────────▼──┐         │
│              │ Fetcher │    │  Cookie Jar  │         │
│              │ (axios) │◄───│  + UA 轮换   │         │
│              └────┬────┘    └─────────────┘         │
└───────────────────┼─────────────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │   Property Finder   │
         │  _next/data/ API    │
         └─────────────────────┘
                    │
         ┌──────────▼──────────┐
         │      MongoDB        │
         │  (Docker, 本机)      │
         └──────────┬──────────┘
                    │
┌───────────────────┼─────────────────────────────────┐
│            Express API 服务器                         │
│  GET /api/listings  GET /api/stats  GET /api/bedrooms│
└───────────────────┬─────────────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │   前端仪表盘         │
         │   (深色主题 SPA)     │
         └─────────────────────┘
```

## 功能

- **两种爬取模式**：全量（首次批量抓取）和增量（日常更新）
- **自动恢复**：遇到 404 错误时自动刷新 Build ID
- **令牌桶限速**：均匀分布 + 随机抖动，避免突发请求
- **熔断器**：增量模式下连续遇到 50 条已存在的房源时自动停止翻页
- **Cookie 会话管理**：跨请求保持 Cookie
- **优雅停机**：捕获 SIGINT/SIGTERM 信号，排空队列后再退出
- **结构化日志**：通过 pino 输出 JSON 日志，包含请求统计
- **MongoDB 批量 upsert**：按 listing ID 去重，`ordered: false` 容错
- **仪表盘**：深色主题 Web 界面，包含统计卡片、卧室分布图、筛选器、分页

## 前置条件

- **Node.js** >= 18
- **Docker Desktop**（用于运行 MongoDB）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env    # 按需修改 .env

# 3. 启动 MongoDB
npm run db:setup

# 4. 运行爬虫
npm run scrape:incremental   # 增量更新（推荐日常使用）
npm run scrape:full           # 全量爬取

# 5. 启动仪表盘
npm run server               # http://localhost:3000
```

## 项目结构

```
src/
├── config/index.js              # 统一配置
├── lib/
│   ├── logger.js                # pino 结构化日志
│   ├── database.js              # MongoDB 连接、批量 upsert、查询
│   ├── rate-limiter.js          # 令牌桶限速（async-sema，均匀分布）
│   ├── cookie-manager.js        # axios + tough-cookie + User-Agent 轮换
│   └── build-id.js              # 从搜索页提取 Build ID
├── scraper/
│   ├── index.js                 # 主入口：调度器 + 优雅停机
│   ├── fetcher.js               # API 请求 + 404 自动恢复
│   ├── search-combinations.js   # 搜索过滤条件的笛卡尔积
│   └── circuit-breaker.js       # 增量模式提前退出逻辑
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

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MONGO_URI` | `mongodb://127.0.0.1:27017` | MongoDB 连接串 |
| `MODE` | `incremental` | 爬取模式：`full`（全量）或 `incremental`（增量） |
| `RATE_LIMIT_RPM` | `8` | 每分钟最大请求数（均匀分布） |
| `CONCURRENCY` | `2` | 并发爬取 worker 数 |
| `CIRCUIT_BREAK_THRESHOLD` | `50` | 连续遇到已存在房源的阈值，达到后停止翻页 |
| `API_PORT` | `3000` | 仪表盘服务端口 |
| `LOG_LEVEL` | `info` | 日志级别：`debug`、`info`、`warn`、`error` |

## API 接口

| 接口 | 说明 |
|------|------|
| `GET /api/listings?page=1&limit=20&minPrice=&maxPrice=&bedrooms=&furnished=&search=` | 分页房源搜索 |
| `GET /api/stats` | 聚合统计（总数、均价、价格区间、平均面积） |
| `GET /api/bedrooms` | 卧室数量分布 |

## 技术细节

### Property Finder API

Property Finder 在同一域名下运行多个 Next.js 应用。搜索应用的 `basePath` 为 `"/search"`，数据路由为 `/search/_next/data/{buildId}/en/search.json`。Build ID **必须**从 `/en/search` 页面提取，不能从首页提取（首页是另一个 Next.js 应用，Build ID 不同）。

### 反检测策略

- 持久化 Cookie Jar（保持 AWS CloudFront 会话 Cookie）
- User-Agent 轮换池（5 个真实浏览器 UA）
- 令牌桶均匀分布（无突发请求）
- 每次请求附加 500ms-2000ms 随机延迟
- 携带 `x-nextjs-data: 1` 请求头，模拟 SPA 内部导航

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
- 集合：`propertyfinder_raw`、`dubizzle_raw`、`bayut_raw`
- `listing_id` 字段上有唯一索引
- 原始 JSON 数据从 API 直接保存，额外附加 `crawled_at`（抓取时间）和 `spider_source`（数据来源）元数据

## 脚本命令

| 命令 | 说明 |
|------|------|
| `npm run scrape:full` | 全量爬取（抓取所有历史数据） |
| `npm run scrape:incremental` | 增量爬取（仅抓取新房源） |
| `npm run server` | 启动仪表盘，端口 3000 |
| `npm run dev` | 同时启动仪表盘和增量爬虫 |
| `npm run db:setup` | 启动 MongoDB Docker 容器 |
| `npm run db:stop` | 停止 MongoDB 容器 |
| `npm run db:migrate` | 运行所有待执行的数据库迁移 |
| `npm run db:migrate:status` | 查看迁移状态 |
| `npm run db:migrate:rollback` | 回滚指定迁移 |
| `npm run db:backup` | 备份数据库 |
| `npm run db:restore` | 从备份恢复数据库 |

## 许可证

UNLICENSED - 私有项目。
