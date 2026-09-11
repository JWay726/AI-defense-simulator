// ============================================================
// OCR 能力抽象层
// 目标：让"扫描件 PDF / 图片版 PPT / 纯图片"也能变成可分析的文本。
//
// 三种可插拔 Provider（通过 .env 的 OCR_PROVIDER 选择，auto = 自动降级）：
//   1. tesseract  —— 本地离线识别，零配置，默认方案
//   2. vision     —— OpenAI 兼容的视觉大模型（GLM-4V / Qwen-VL / GPT-4o 等），准确率高
//   3. baidu      —— 百度智能云 OCR，中文印刷体准确率高
//
// 配置示例（.env）：
//   OCR_PROVIDER=auto
//   OCR_LANG=chi_sim+eng
//   OCR_MAX_PAGES=40
//   # 视觉大模型（可选，填写后优先使用）
//   OCR_VISION_BASE_URL=https://open.bigmodel.cn/api/paas/v4
//   OCR_VISION_API_KEY=xxx
//   OCR_VISION_MODEL=glm-4v-flash
//   # 百度 OCR（可选）
//   BAIDU_OCR_API_KEY=xxx
//   BAIDU_OCR_SECRET_KEY=xxx
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';

const OCR_PROVIDER = (process.env.OCR_PROVIDER || 'auto').toLowerCase();
const OCR_LANG = process.env.OCR_LANG || 'chi_sim+eng';
export const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 40);

// 语言包（traineddata）位置。优先使用仓库内置的 server/tessdata，
// 这样 OCR 完全离线可用；目录缺失时回落到 jsDelivr CDN。
const LOCAL_TESSDATA = fileURLToPath(new URL('../tessdata', import.meta.url));
const CDN_TESSDATA = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';
const TESSERACT_LANG_PATH =
  process.env.TESSERACT_LANG_PATH ||
  (fs.existsSync(path.join(LOCAL_TESSDATA, 'chi_sim.traineddata.gz')) ? LOCAL_TESSDATA : CDN_TESSDATA);
const TESSERACT_CACHE_PATH = process.env.TESSERACT_CACHE_PATH || LOCAL_TESSDATA;
const TESSERACT_GZIP = TESSERACT_LANG_PATH === CDN_TESSDATA || fs.existsSync(path.join(LOCAL_TESSDATA, 'chi_sim.traineddata.gz'));

const VISION_BASE_URL = (process.env.OCR_VISION_BASE_URL || '').replace(/\/+$/, '');
const VISION_API_KEY = process.env.OCR_VISION_API_KEY || '';
const VISION_MODEL = process.env.OCR_VISION_MODEL || 'glm-4v-flash';

const BAIDU_API_KEY = process.env.BAIDU_OCR_API_KEY || '';
const BAIDU_SECRET_KEY = process.env.BAIDU_OCR_SECRET_KEY || '';

// 小于该体积的图片基本是图标/装饰，跳过识别
const MIN_IMAGE_BYTES = 6 * 1024;

export function isImageFile(fileName) {
  return /\.(png|jpe?g|bmp|gif|tiff?|webp)$/i.test(fileName || '');
}

export function isOcrableImage(name) {
  return /\.(png|jpe?g|bmp|tiff?)$/i.test(name || '');
}

export function imageTooSmall(buffer) {
  return !buffer || buffer.length < MIN_IMAGE_BYTES;
}

// ------------------------------------------------------------
// OCR 文本后处理：中文 OCR 常见"字之间被插入空格"，需要收紧
// ------------------------------------------------------------
export function normalizeOcrText(raw) {
  if (!raw) return '';
  return raw
    .replace(/\r\n?/g, '\n')
    // 去掉中文字符之间的空格
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, '$1$2')
    // 去掉中文与数字/英文之间多余的空格（保留一个）
    .replace(/([\u3400-\u9fff])\s+([A-Za-z0-9])/g, '$1$2')
    .replace(/([A-Za-z0-9])\s+([\u3400-\u9fff])/g, '$1$2')
    // 行尾空白
    .replace(/[ \t]+$/gm, '')
    // 连续空行压缩为一个
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ------------------------------------------------------------
// Provider 1：tesseract.js（本地离线）
// ------------------------------------------------------------
let workerPromise = null;

async function getTesseractWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const options = {
        cachePath: TESSERACT_CACHE_PATH,
        langPath: TESSERACT_LANG_PATH,
        gzip: TESSERACT_GZIP,
        logger: () => {},
      };
      if (TESSERACT_LANG_PATH) options.langPath = TESSERACT_LANG_PATH;
      const langs = OCR_LANG.split('+').map((l) => l.trim()).filter(Boolean);
      const worker = await createWorker(langs, 1, options);
      return worker;
    })().catch((err) => {
      // 失败后允许下一次重试
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

async function ocrWithTesseract(imageBuffer) {
  const worker = await getTesseractWorker();
  const { data } = await worker.recognize(imageBuffer);
  return normalizeOcrText(data?.text || '');
}

// ------------------------------------------------------------
// Provider 2：OpenAI 兼容的视觉大模型
// ------------------------------------------------------------
function visionEnabled() {
  return Boolean(VISION_BASE_URL && VISION_API_KEY);
}

async function ocrWithVision(imageBuffer, mime = 'image/png') {
  if (!visionEnabled()) throw new Error('未配置视觉大模型');

  const dataUrl = `data:${mime};base64,${Buffer.from(imageBuffer).toString('base64')}`;
  const res = await fetch(`${VISION_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VISION_API_KEY}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                '你是 OCR 引擎。请逐字识别图片中的全部文字，保留标题、列表与段落结构。' +
                '不要翻译、不要总结、不要补充图片中不存在的内容，也不要输出任何解释性语句。',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`视觉模型 OCR 失败(${res.status})：${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  return normalizeOcrText(typeof text === 'string' ? text : '');
}

// ------------------------------------------------------------
// Provider 3：百度智能云 OCR
// ------------------------------------------------------------
let baiduTokenCache = { token: '', expiresAt: 0 };

async function getBaiduToken() {
  if (baiduTokenCache.token && Date.now() < baiduTokenCache.expiresAt) {
    return baiduTokenCache.token;
  }
  const url =
    'https://aip.baidubce.com/oauth/2.0/token' +
    `?grant_type=client_credentials&client_id=${encodeURIComponent(BAIDU_API_KEY)}` +
    `&client_secret=${encodeURIComponent(BAIDU_SECRET_KEY)}`;
  const res = await fetch(url, { method: 'POST' });
  const json = await res.json();
  if (!json?.access_token) throw new Error('百度 OCR 鉴权失败');
  baiduTokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(60, (json.expires_in || 2592000) - 3600) * 1000,
  };
  return baiduTokenCache.token;
}

function baiduEnabled() {
  return Boolean(BAIDU_API_KEY && BAIDU_SECRET_KEY);
}

async function ocrWithBaidu(imageBuffer) {
  if (!baiduEnabled()) throw new Error('未配置百度 OCR');
  const token = await getBaiduToken();
  const body = new URLSearchParams();
  body.set('image', Buffer.from(imageBuffer).toString('base64'));
  const res = await fetch(
    `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  );
  const json = await res.json();
  if (json?.error_code) throw new Error(`百度 OCR 失败(${json.error_code})：${json.error_msg || ''}`);
  const words = Array.isArray(json?.words_result) ? json.words_result : [];
  return normalizeOcrText(words.map((w) => w?.words || '').join('\n'));
}

// ------------------------------------------------------------
// 统一入口：按 provider 顺序尝试，任一成功即返回
// ------------------------------------------------------------
function resolveOrder() {
  if (OCR_PROVIDER === 'tesseract') return ['tesseract'];
  if (OCR_PROVIDER === 'vision') return ['vision', 'tesseract'];
  if (OCR_PROVIDER === 'baidu') return ['baidu', 'tesseract'];
  // auto：优先云端的中文准确率，失败再退到本地
  return ['vision', 'baidu', 'tesseract'];
}

const RUNNERS = {
  tesseract: (buf) => ocrWithTesseract(buf),
  vision: (buf, mime) => ocrWithVision(buf, mime),
  baidu: (buf) => ocrWithBaidu(buf),
};

/**
 * 识别单张图片
 * @returns {Promise<{text: string, provider: string, error?: string}>}
 */
export async function recognizeImage(imageBuffer, mime = 'image/png') {
  const errors = [];
  for (const provider of resolveOrder()) {
    if ((provider === 'vision' && !visionEnabled()) || (provider === 'baidu' && !baiduEnabled())) {
      continue;
    }
    try {
      const text = await RUNNERS[provider](imageBuffer, mime);
      if (text && text.trim()) {
        return { text: text.trim(), provider };
      }
      errors.push(`${provider}: 未识别到文字`);
    } catch (err) {
      errors.push(`${provider}: ${err?.message || String(err)}`);
    }
  }
  return {
    text: '',
    provider: 'none',
    error: errors.length ? errors.join(' | ') : '没有可用的 OCR 引擎',
  };
}

/** 当前生效的 OCR 配置（用于前端展示） */
export function ocrProviderInfo() {
  const order = resolveOrder().filter(
    (p) => p === 'tesseract' || (p === 'vision' && visionEnabled()) || (p === 'baidu' && baiduEnabled()),
  );
  const label = { tesseract: '本地 Tesseract（离线）', vision: '视觉大模型', baidu: '百度 OCR' };
  return {
    order,
    primary: order[0] || 'tesseract',
    primaryLabel: label[order[0]] || '未配置',
    vision: visionEnabled(),
    baidu: baiduEnabled(),
    lang: OCR_LANG,
    maxPages: OCR_MAX_PAGES,
  };
}
