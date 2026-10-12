# AI 答辩模拟器

基于文档证据的**答辩压力陪练系统**。上传论文 / 答辩 PPT，AI 扮演评委逐题施压提问，对回答打分并生成复盘报告。支持扫描件与图片版材料的 OCR 识别，提供 8 种导师人格与多人实时答辩委员会（1~4 位导师并发评分）。

> 本项目为高校《软件课程设计》课程项目，前端 React + Vite，后端 Express + MySQL，LLM 调用 DeepSeek。

---

## ✨ 功能特性

### 1. 文档解析与 OCR —— 扫描件 / 图片版也能用

以往解析依赖文件自带文字层，扫描件、拍照件、图片版 PPT 会直接失败。现在这些材料也能正常解析。

| 材料类型 | 处理方式 |
| --- | --- |
| `.pdf`（含文字层） | pdf.js 直接抽文本 |
| `.pdf`（扫描件，无文字层） | 取页面内嵌图 → 逐页 OCR |
| `.pptx` | 解析 `slideN.xml` 文字 + 备注；文字为空的页自动 OCR 页面图片 |
| `.pptx`（纯图片版） | 逐页 OCR 页面内嵌图片 |
| `.docx` | mammoth 抽文本；正文为空时 OCR 内嵌图片 |
| `.png / .jpg / .bmp / .tiff` | 直接 OCR |

**三种可插拔 OCR 引擎**（在 `.env` 配置，默认走本地离线方案，无需任何 Key）：

- **tesseract**（默认）：语言包内置在 `server/tessdata/`，完全离线可用。
- **vision**：任意 OpenAI 兼容的视觉大模型（GLM-4V / Qwen-VL / GPT-4o 等）。
- **baidu**：百度智能云通用精准 OCR。

`OCR_PROVIDER=auto` 按 `vision → baidu → tesseract` 顺序尝试，任一成功即返回。OCR 较慢，采用**异步任务 + 进度轮询**避免 HTTP 超时。

### 2. 8 位导师人格 + 多人实时答辩委员会

| 导师 | 关注维度 | 风格 |
| --- | --- | --- |
| 慈祥博导 | 研究动机 / 创新点 / 整体贡献 | 温和鼓励 |
| 毒舌青椒 | 逻辑漏洞 / 证据链 / 夸大表述 | 犀利尖锐 |
| 数据严师 | 数据来源 / 样本量 / 统计显著性 / 消融实验 | 只认数据 |
| 企业导师 | 工程落地 / 成本性能 / 部署运维 / 商业化 | 务实 |
| 红队质疑者 | 反例构造 / 适用边界 / 失败案例 / 鲁棒性 | 反向逼近 |
| 理论派教授 | 数学推导 / 前提假设 / 复杂度 / 收敛性 | 严谨 |
| 答辩主席 | 结构完整性 / 工作量 / 规范性 / 时间控制 | 全局把控 |
| 同门学长 | 实现细节 / 调参经验 / 踩坑复盘 / 工具链 | 接地气 |

每位导师都有独立的 `systemPrompt`、`scoringEmphasis`（评分侧重）和 `interjectStyle`（插话风格），不是换个名字而已。

新建演练时可勾选 **1~4 位**导师组成答辩委员会：

- **轮流提问**：按轮次挑选主问导师，优先让关注维度命中当前题型的导师发问，尽量避免同一人连续提问。
- **并发评分**：一次作答后，所有导师**并行**独立打分，前端一次性展示多张评分卡（带头像与评分侧重）。
- **插话追问**：回答不佳时，由**另一位**导师从自身专业视角插话追问，插话者选"最不满意"（评分最低）的那位。
- **委员会综合报告**：最终报告展示每位评委平均分对比，并综合各方视角出具意见。

预设组合：单人抗压 / 标准委员会 / 工程落地组 / 全维度压力组。

### 3. 安全与体验细节

- 所有需要大模型思考的点击操作都会弹出"正在生成回复，请稍后"等提示，避免用户误以为卡死而重复点击。
- 评分 / 报告生成期间禁用交互按钮（防重复提交）。
- 用户密码经 bcrypt 加密，JWT 鉴权。

---

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 |
| 后端 | Node.js 22 + Express 5 |
| 数据库 | MySQL 8（未配置时降级为内存存储） |
| LLM | DeepSeek `deepseek-chat`，经 **LangChain**（`@langchain/openai` 的 `ChatOpenAI`）封装，JSON Mode 强制结构化输出 |
| RAG | LangChain `MemoryVectorStore` + 本地离线嵌入（`@huggingface/transformers` · `bge-small-zh`），向量检索增强生成 |
| OCR | tesseract.js（离线）/ 视觉大模型 / 百度 OCR，三层降级 |
| 文档解析 | pdfjs-dist、mammoth、pptx 结构化抽取 |

---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 22
- （可选）MySQL 8；不安装也能以内存模式运行

### 安装与启动

```bash
# 1. 克隆并进入目录
git clone <your-repo-url>
cd AI答辩模拟器

# 2. 安装依赖
npm install

# 3. 配置环境变量（复制示例后按需填写）
cp .env.example .env
#   至少填一个 DeepSeek Key 才能出题/评分；OCR 默认离线无需 Key
#   VITE_DEEPSEEK_API_KEY=sk-xxx

# 4. 启动后端（端口 3001：文档解析 / OCR / 用户与会话）
npm run dev:server

# 5. 启动前端（端口 5173）
npm run dev
```

浏览器打开 http://localhost:5173 即可使用。

### 构建

```bash
npm run build      # tsc -b && vite build
npm run preview    # 预览构建产物
```

---

## ⚙️ 配置（.env）

```env
# 数据库（可选，未配置时后端降级为内存存储）
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=ai_defense

# ===== DeepSeek（LLM 调用已迁移到后端 LangChain，Key 放服务端） =====
# 后端 server/services/llm.js 读取此变量；也可由前端在请求体里携带 VITE_DEEPSEEK_API_KEY 覆盖
DEEPSEEK_API_KEY=sk-xxx
# 可选：自定义兼容端点 / 模型
# DEEPSEEK_BASE_URL=https://api.deepseek.com
# DEEPSEEK_MODEL=deepseek-chat

# 可选：前端若填入 Key，会随请求带给后端（优先级低于上面的 DEEPSEEK_API_KEY）
VITE_DEEPSEEK_API_KEY=

# ===== RAG 本地嵌入（@huggingface/transformers，默认 Xenova/bge-small-zh-v1.5） =====
# RAG_EMBED_MODEL=Xenova/bge-small-zh-v1.5
# 权重下载源：默认国内可达的 hf-mirror.com（无需 VPN）；要用官方源改为 https://huggingface.co
# HF_ENDPOINT=https://hf-mirror.com

# OCR（扫描件 / 图片版 PPT）
OCR_PROVIDER=auto          # auto | tesseract | vision | baidu
OCR_LANG=chi_sim+eng
OCR_MAX_PAGES=40           # 单次最多识别页数，防止超长文档卡死

# 可选：视觉大模型（OpenAI 兼容协议，准确率更高）
# OCR_VISION_BASE_URL=https://open.bigmodel.cn/api/paas/v4
# OCR_VISION_API_KEY=
# OCR_VISION_MODEL=glm-4v-flash

# 可选：百度智能云 OCR
# BAIDU_OCR_API_KEY=
# BAIDU_OCR_SECRET_KEY=

# 后端端口 / JWT 密钥
SERVER_PORT=3001
JWT_SECRET=
```

> ⚠️ 切勿将真实 `.env`（含 API Key、数据库密码）提交到仓库。仓库已通过 `.gitignore` 忽略所有 `.env` 文件，请使用 `.env.example` 作为模板。

---

## 📁 目录结构

```
AI答辩模拟器/
├── server/                          # 后端 Express 服务（端口 3001）
│   ├── index.js                     # Express 入口
│   ├── db.js                        # MySQL 连接 + 本地降级
│   ├── routes/
│   │   ├── auth.js                  # 注册 / 登录
│   │   ├── user.js                  # 用户信息
│   │   ├── chat.js                  # 会话持久化
│   │   ├── extract.js               # 文档解析（PDF / DOCX / PPTX）
│   │   ├── ocr.js                   # OCR 异步任务 + jobId 轮询
│   │   └── rag.js                   # LangChain + RAG 入口（/api/rag/ingest、/api/rag/complete）
│   ├── services/
│   │   ├── ocr.js                   # OCR Provider 三层降级
│   │   ├── pdfRaster.js             # 扫描版 PDF 抽嵌入图
│   │   ├── office.js                # PPTX / DOCX 结构化抽取
│   │   ├── rag.js                   # RAG 子系统：分块 + 本地嵌入 + MemoryVectorStore + 检索
│   │   └── llm.js                   # LangChain LLM 层：ChatOpenAI（DeepSeek 兼容）封装
│   └── tessdata/                    # 内置 tesseract 语言包（离线可用）
├── src/                             # 前端 React + Vite（端口 5173）
│   ├── main.tsx                     # React 入口
│   ├── App.tsx                      # 主调度（drillPhase 状态机）
│   ├── api.ts                       # 后端 HTTP 调用封装
│   ├── deepseek.ts                  # DeepSeek LLM 调用层
│   ├── types.ts                     # 8 导师人格库 + GenUI 类型
│   ├── utils/extractText.ts         # 前端兜底解析
│   └── components/                  # 15 个 UI 组件
│       ├── AIAvatar.tsx             # AI 头像（按人格着色）
│       ├── GenUIDispatcher.tsx      # GenUI 组件分发
│       ├── MentorPicker.tsx         # 导师与委员会选择
│       ├── MentorPanelBar.tsx       # 顶栏答辩委员会状态
│       ├── HighPressureQuestion.tsx # 高压提问卡
│       ├── ReviewCard.tsx           # 评分卡
│       ├── FinalReportCard.tsx      # 复盘报告卡
│       ├── GeneratingReportCard.tsx # 生成报告进度条
│       ├── PracticeChoiceCard.tsx   # 避坑 / 话术练习
│       ├── TypePickerCard.tsx       # 题型选择
│       ├── ParsingCard.tsx          # 文档解析进度
│       ├── AdminPanel.tsx           # 管理后台
│       ├── SettingsPage.tsx         # 设置页
│       ├── UserSettingsModal.tsx    # 用户设置弹窗
│       └── ErrorBoundary.tsx        # 错误边界
├── report_screenshots/              # 运行截图（见下）
├── diagram_architecture.png         # 架构图
├── diagram_flow.png                 # 流程图
├── 3系统实现模块.md                 # 系统实现详细说明（提示词模板 / 前后端框架 / 全过程）
├── index.html
├── vite.config.ts
└── package.json
```

---

## 🖼️ 运行截图

| 截图 | 说明 |
| --- | --- |
| `report_screenshots/01_pdf_parse.png` | PDF 论文解析 |
| `report_screenshots/02_pptx_parse.png` | PPTX 解析 |
| `report_screenshots/03_question_score.png` | 导师提问与并发评分 |
| `report_screenshots/04_tips_practice.png` | 避坑提醒与话术练习 |
| `report_screenshots/05_report_fullscore.png` | 复盘报告 —— 满分话术 |
| `report_screenshots/06_report_stats.png` | 复盘报告 —— 答题统计 |

---

## 📝 实现说明

完整的系统实现文档（提示词模板设计、前后端框架部署、端到端产品全过程：上传 → 解析 → OCR（异步）→ 出题 → 并发评分 → 复盘报告）见 **[`3系统实现模块.md`](./3系统实现模块.md)**。

> 本项目**已使用 LangChain + RAG**：所有 LLM 调用经后端 `@langchain/openai` 的 `ChatOpenAI`（DeepSeek 兼容端点）完成，文档接地通过 RAG——上传论文后被切分、用本地 `bge-small-zh` 嵌入模型向量化、存入 `MemoryVectorStore`，出题/评分/追问时按查询召回最相关原文片段注入提示词（检索增强生成）。详见 [3系统实现模块.md](./3系统实现模块.md) 第 3.7 节。
>
> **运行降级说明（重要）**：后端服务对 LangChain 采用「动态加载 + 自动降级」设计。若运行环境已 `npm install` 了 `@langchain/openai`、`@langchain/community`、`@xenova/transformers`，则走**真实 LangChain 路径**（ChatOpenAI + bge 本地嵌入 + MemoryVectorStore）；若这些包缺失或无法联网下载嵌入权重，则自动降级为**零依赖本地实现**——LLM 走内置 OpenAI 兼容 HTTP 客户端、RAG 走本地哈希 n-gram 向量检索（余弦相似）。两条路径对上层接口完全一致，应用始终可用。装好依赖即自动切换到真实 LangChain，无需改代码。

---

## 📌 备注

- OCR 默认离线（tesseract），无需联网或 Key 即可识别中英文扫描件。
- 数据库为可选依赖：未配置 MySQL 时，后端自动降级为内存存储，功能不受影响（重启后数据清空）。
- 本项目仅用于个人答辩演练与课程作业，请勿将 API Key 等敏感信息提交到公开仓库。

## 📄 License

仅供学习与非商业用途。
