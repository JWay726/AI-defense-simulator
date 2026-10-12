// ============================================================
// server/services/llm.js
// LangChain LLM 调用层（替代前端直连 DeepSeek）
//
// 优先使用 @langchain/openai 的 ChatOpenAI 封装 DeepSeek 兼容端点；
// 若运行环境未安装 @langchain/openai（如离线沙箱无法访问 npm registry），
// 自动降级为内置的 OpenAI 兼容 HTTP 客户端，保证服务可用。
// 需要 JSON 结构化输出时强制 response_format = json_object。
// ============================================================

import { jsonrepair } from 'jsonrepair';

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

function resolveKey(apiKey) {
  const key = (apiKey && String(apiKey).trim()) || process.env.DEEPSEEK_API_KEY || '';
  if (!key) {
    throw new Error(
      '未配置 DeepSeek API Key：请在后端 .env 设置 DEEPSEEK_API_KEY，或在设置中提供。',
    );
  }
  return key;
}

// 与前端一致的鲁棒 JSON 解析：先 JSON.parse，失败再截取最外层 {}/[]，最后用 jsonrepair 修复
function parseModelJSON(content) {
  if (typeof content !== 'string') return content;
  const text = content.trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
    const candidate = match ? match[0] : text;
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(jsonrepair(candidate));
      } catch {
        throw new Error('AI 返回格式异常，请重试');
      }
    }
  }
}

/** 路径 A：经 LangChain ChatOpenAI（真实 LangChain 框架，需 @langchain/openai） */
async function completeViaLangChain({ system, user, jsonMode, temperature, maxTokens, apiKey, context }) {
  const { ChatOpenAI } = await import('@langchain/openai');
  const model = new ChatOpenAI({
    apiKey,
    model: DEEPSEEK_MODEL,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
    temperature,
    maxTokens,
    modelKwargs: jsonMode ? { response_format: { type: 'json_object' } } : undefined,
  });

  const userContent = context
    ? `【来自论文 / 答辩材料的检索片段（RAG 检索增强，优先依据这些原文作答）】\n${context}\n\n${'='.repeat(24)}\n${user}`
    : user;

  const message = await model.invoke([
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ]);
  const content = typeof message.content === 'string' ? message.content : String(message.content ?? '');
  return jsonMode ? parseModelJSON(content) : content;
}

/** 路径 B：内置 OpenAI 兼容客户端（零依赖降级，适配 DeepSeek） */
async function completeViaFetch({ system, user, jsonMode, temperature, maxTokens, apiKey, context }) {
  const userContent = context
    ? `【来自论文 / 答辩材料的检索片段（RAG 检索增强，优先依据这些原文作答）】\n${context}\n\n${'='.repeat(24)}\n${user}`
    : user;

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(data?.error?.message || 'DeepSeek 返回为空');
  return jsonMode ? parseModelJSON(content) : content;
}

/**
 * 统一的 LLM 补全入口：优先 LangChain，失败降级内置客户端。
 */
export async function runCompletion({
  system,
  user,
  jsonMode = false,
  temperature,
  maxTokens,
  apiKey,
  context = '',
}) {
  const key = resolveKey(apiKey);
  try {
    return await completeViaLangChain({
      system, user, jsonMode, temperature, maxTokens, apiKey: key, context,
    });
  } catch (err) {
    // 仅在确实缺失 LangChain 包时才降级；若已是真实 API 错误则直接抛出
    const msg = String(err?.message || '');
    const isMissingLangChain =
      msg.includes("Cannot find package '@langchain/openai'") ||
      msg.includes("Failed to resolve module specifier") ||
      msg.includes('ERR_MODULE_NOT_FOUND');
    if (!isMissingLangChain) throw err;
    console.warn('[LLM] 未检测到 @langchain/openai，降级为内置 OpenAI 兼容客户端。');
    return completeViaFetch({
      system, user, jsonMode, temperature, maxTokens, apiKey: key, context,
    });
  }
}
