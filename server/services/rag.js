// ============================================================
// server/services/rag.js
// RAG 子系统：文档分块 -> 嵌入 -> 向量库 -> 检索
//
// 优先使用 LangChain（@langchain/textsplitters + @langchain/community 的
// MemoryVectorStore + HuggingFaceTransformersEmbeddings 本地 bge 嵌入）；
// 若运行环境无法安装这些包（如离线沙箱），自动降级为「零依赖本地实现」：
//   - 分块：按中文字符边界切分
//   - 嵌入：哈希 n-gram 词袋向量（L2 归一化），做余弦相似检索
//   - 向量库：进程内数组
// 两条路径对上层暴露完全一致的 similaritySearch 接口，可无缝切换。
// ============================================================

const stores = new Map(); // sessionId -> { vs, bge }

const BGE_QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';
const MAX_CHUNKS = 500;

// ---------- 动态加载（优先 LangChain） ----------
async function loadSplitter() {
  const { RecursiveCharacterTextSplitter } = await import('@langchain/textsplitters');
  return new RecursiveCharacterTextSplitter({
    chunkSize: 600,
    chunkOverlap: 80,
    separators: ['\n\n', '\n', '。', '；', '，', '、', ' ', ''],
  });
}

async function loadEmbeddings() {
  // 模型权重默认从国内可达的 hf-mirror.com 下载（可用 HF_ENDPOINT 覆盖为其它镜像/官方源）。
  // transformers.js 与 @langchain/community 共享同一模块单例，故此处设置 env.remoteHost 会全局生效。
  const endpoint = `${(process.env.HF_ENDPOINT || 'https://hf-mirror.com').replace(/\/+$/, '')}/`;
  try {
    const T = await import('@huggingface/transformers');
    const env = T.env || (T.default && T.default.env);
    if (env && 'remoteHost' in env) env.remoteHost = endpoint;
  } catch {
    // 忽略：嵌入器内部会自行加载该包
  }
  const { HuggingFaceTransformersEmbeddings } = await import(
    '@langchain/community/embeddings/huggingface_transformers'
  );
  return new HuggingFaceTransformersEmbeddings({
    modelName: process.env.RAG_EMBED_MODEL || 'Xenova/bge-small-zh-v1.5',
  });
}

async function loadVectorStore() {
  // MemoryVectorStore 在不同 LangChain 版本位置不同，按新→旧依次尝试
  const candidates = [
    '@langchain/classic/vectorstores/memory', // LangChain 1.x（当前安装版本）
    '@langchain/community/vectorstores/memory',
    '@langchain/core/vectorstores/memory',
    'langchain/vectorstores/memory',
  ];
  let lastErr;
  for (const spec of candidates) {
    try {
      const mod = await import(spec);
      if (mod && mod.MemoryVectorStore) return mod.MemoryVectorStore;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('MemoryVectorStore not found');
}

// ---------- 本地降级实现（零依赖） ----------
function splitTextLocal(text, chunkSize = 600, overlap = 80) {
  const seps = ['\n\n', '\n', '。', '；', '，', '、', ' '];
  const docs = [];
  const n = text.length;
  let start = 0;
  while (start < n) {
    let end = Math.min(start + chunkSize, n);
    if (end < n) {
      let cut = end;
      for (let i = end; i > start + Math.floor(chunkSize * 0.5); i -= 1) {
        if (seps.includes(text[i])) { cut = i + 1; break; }
      }
      end = cut;
    }
    const piece = text.slice(start, end).trim();
    if (piece) docs.push({ pageContent: piece });
    if (end >= n) break;
    start = Math.max(start + 1, end - overlap);
  }
  return docs;
}

const DIM = 1024;
function hashTerm(term) {
  let h = 2166136261;
  for (let i = 0; i < term.length; i += 1) {
    h ^= term.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % DIM;
}
function tokenize(text) {
  const tokens = [];
  const cjk = text.match(/[一-鿿]/g);
  if (cjk) tokens.push(...cjk);
  const cleaned = (text.replace(/[^一-鿿]/g, '')).split('');
  const run = cleaned.join('');
  for (let i = 0; i < run.length - 1; i += 1) tokens.push(run.slice(i, i + 2));
  const latin = text.toLowerCase().match(/[a-z0-9]+/g);
  if (latin) tokens.push(...latin);
  return tokens;
}
function embed(text) {
  const vec = new Array(DIM).fill(0);
  const counts = {};
  for (const t of tokenize(text)) counts[t] = (counts[t] || 0) + 1;
  let norm = 0;
  for (const t of Object.keys(counts)) {
    const d = hashTerm(t);
    vec[d] += counts[t];
    norm += counts[t] * counts[t];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i += 1) vec[i] /= norm;
  return vec;
}
function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}
function buildLocalStore(docs) {
  const items = docs.map((d) => ({ pageContent: d.pageContent, vec: embed(d.pageContent) }));
  return {
    similaritySearch: async (query, k = 4) => {
      const qv = embed(query);
      return items
        .map((it) => ({ pageContent: it.pageContent, score: cosine(qv, it.vec) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map((s) => ({ pageContent: s.pageContent }));
    },
  };
}

/**
 * 把一份文档正文切分、嵌入并存入向量库。
 * @returns {Promise<number>} 实际写入的片段数（0 表示失败）
 */
export async function ingestDocument(sessionId, text) {
  if (!sessionId || typeof text !== 'string' || !text.trim()) {
    throw new Error('sessionId 与 text 无效');
  }

  // 1) 分块
  let docs;
  try {
    const splitter = await loadSplitter();
    docs = await splitter.createDocuments([text]);
  } catch {
    docs = splitTextLocal(text);
  }
  if (docs.length > MAX_CHUNKS) docs = docs.slice(0, MAX_CHUNKS);

  // 2) 嵌入 + 向量库（优先 LangChain，否则本地降级）
  try {
    const [emb, Store] = await Promise.all([loadEmbeddings(), loadVectorStore()]);
    const vs = await Store.fromDocuments(docs, emb); // 首次会触发本地模型加载/下载
    stores.set(sessionId, { vs, bge: true });
    return docs.length;
  } catch (err) {
    const msg = String(err?.message || '');
    const missing =
      msg.includes("Cannot find package") ||
      msg.includes('Failed to resolve module') ||
      msg.includes('ERR_MODULE_NOT_FOUND') ||
      msg.includes('fetch failed') || // 无网络下载 bge 权重
      msg.includes('getaddrinfo') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT');
    if (!missing) throw err; // 真实错误（如配置错误）直接抛出
    console.warn('[RAG] 未检测到 LangChain 嵌入包/无法下载模型，降级为本地哈希向量检索。');
    stores.set(sessionId, { vs: buildLocalStore(docs), bge: false });
    return docs.length;
  }
}

/** 该 session 是否已有可用向量库 */
export function isRagAvailable(sessionId) {
  return stores.has(sessionId);
}

/**
 * 按查询召回 top-k 原文片段，拼接为上下文字符串。
 * bge 路径自动加指令前缀以匹配文档嵌入分布。
 */
export async function retrieveContext(sessionId, query, k = 4) {
  const entry = stores.get(sessionId);
  if (!entry || !query || !query.trim()) return '';
  const q = entry.bge ? `${BGE_QUERY_PREFIX}${query}` : query;
  const docs = await entry.vs.similaritySearch(q, Number(k) || 4);
  if (!docs.length) return '';
  return docs.map((d, i) => `【片段${i + 1}】\n${d.pageContent}`).join('\n\n');
}

/** 清理某个 session 的向量库（新文档上传 / 会话重置时） */
export function clearRag(sessionId) {
  if (sessionId) stores.delete(sessionId);
}
