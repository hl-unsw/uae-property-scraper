# UAE Property Scraper & Dashboard

阿布扎比租房市场数据爬虫与精选房源仪表盘。支持三大房产平台：Property Finder、Bayut、Dubizzle。

## 核心架构：Serverless + 静态 JSON

本项目采用 **Serverless + 静态 JSON** 架构，旨在实现零成本、高性能的 Vercel 部署。

- **本地爬虫层**：在本地环境运行，通过三大平台爬虫抓取最新数据并存入 MongoDB。
- **数据导出层**：使用 `export:json` 脚本将 MongoDB 中的数据归一化并导出为静态 JSON。
- **云端展示层**：部署在 Vercel。通过 Vercel Functions 读取静态 JSON 文件提供 API 接口。
- **前端交互层**：Vanilla JS 开发的轻量级仪表盘，支持双语、实时汇率和多维度评分过滤。

## 核心功能

- **多源数据聚合**：统一展示 PropertyFinder (API), Bayut (Playwright SSR), Dubizzle (Algolia API) 数据。
- **定向精选系统 (`targeted.html`)**：
    - **双语切换**：CN/EN 一键切换，中文模式下优先展示翻译后的标题。
    - **Wise 汇率集成**：中文模式自动拉取 Wise 实时汇率，将 AED 租金换算为人民币 (CNY)。
    - **多维度评分**：基于性价比 (30分)、停车 (20分)、水电 (15分)、面积 (15分)、佣金 (10分)、付款 (10分) 的加权打分。
    - **数据指标优化**：采用**中位数价格**替代平均价，更真实反映市场水平。
- **极速响应**：基于 Vercel 边缘读取静态文件，无数据库查询延迟。

## 快速开始

### 1. 数据准备 (本地)
```bash
# 1. 安装依赖
npm install

# 2. 运行爬虫 (增量模式)
npm run scrape:incremental
npm run scrape:dubizzle:incremental
npm run scrape:bayut:incremental

# 3. 运行定向筛选与评分脚本
npm run search:targeted

# 4. 导出静态 JSON 文件
npm run export:json
```

### 2. 部署 (Vercel)
1. 将代码推送到 GitHub。
2. 在 Vercel 中导入项目。
3. Vercel 会自动读取 `vercel.json` 完成路由与 API 部署。

## 脚本命令

| 命令 | 说明 |
|------|------|
| `npm run scrape:incremental` | 运行所有平台的增量爬取 |
| `npm run search:targeted` | 运行定向评分与筛选脚本（生成精选数据集） |
| `npm run export:json` | **[关键]** 将 MongoDB 数据导出为 Vercel 部署所需的静态 JSON |
| `npm run server` | 本地测试启动 API 服务器 (端口 3000) |
| `npm run db:setup` | 本地启动 MongoDB Docker 容器 |

## 技术栈
- **Backend**: Node.js, Express, Vercel Functions
- **Database**: MongoDB (Local) / Static JSON (Vercel)
- **Frontend**: Vanilla HTML/CSS/JS
- **Tools**: Playwright, Axios, Wise API

## 许可证
UNLICENSED - 私有项目。
