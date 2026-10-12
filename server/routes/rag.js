// ============================================================
// server/routes/rag.js
// RAG + LangChain 的 HTTP 入口
//
// POST /api/rag/ingest   文档入库：{ sessionId, text } -> { chunks, available }
// POST /api/rag/complete  LLM 补全：{ sessionId, system, user, jsonMode, retrievalQuery, ... }
//                          -> { result }（经 LangChain ChatOpenAI + RAG 检索增强）
// DELETE /api/rag/session/:id  清理向量库
// ============================================================

import express from 'express';
import {
  ingestDocument,
  retrieveContext,
  isRagAvailable,
  clearRag,
} from '../services/rag.js';
import { runCompletion } from '../services/llm.js';

const router = express.Router();

// 文档入库（分块 + 本地嵌入 + 向量库）
router.post('/ingest', async (req, res) => {
  const { sessionId, text } = req.body || {};
  try {
    const chunks = await ingestDocument(sessionId, text);
    res.json({ chunks, available: chunks > 0 });
  } catch (err) {
    // 优雅降级：嵌入模型不可用不等于服务挂掉
    res.json({ chunks: 0, available: false, error: err.message });
  }
});

// LLM 补全（经 LangChain，可选 RAG 检索增强）
router.post('/complete', async (req, res) => {
  const {
    sessionId,
    system,
    user,
    jsonMode,
    temperature,
    maxTokens,
    apiKey,
    retrievalQuery,
    k,
  } = req.body || {};

  if (!system || !user) {
    return res.status(400).json({ error: 'system 与 user 必填' });
  }

  try {
    let context = '';
    if (sessionId && retrievalQuery && isRagAvailable(sessionId)) {
      context = await retrieveContext(sessionId, retrievalQuery, Number(k) || 4);
    }

    const result = await runCompletion({
      system,
      user,
      jsonMode: Boolean(jsonMode),
      temperature,
      maxTokens,
      apiKey,
      context,
    });

    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 清理向量库
router.delete('/session/:sessionId', (req, res) => {
  clearRag(req.params.sessionId);
  res.json({ ok: true });
});

export default router;
