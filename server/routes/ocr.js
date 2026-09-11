import express from 'express';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  recognizeImage,
  normalizeOcrText,
  isImageFile,
  isOcrableImage,
  imageTooSmall,
  ocrProviderInfo,
  OCR_MAX_PAGES,
} from '../services/ocr.js';
import { pdfToImages } from '../services/pdfRaster.js';
import { extractPptx, readPptxImages, readDocxImages } from '../services/office.js';

const router = express.Router();

const MAX_BYTES = 25 * 1024 * 1024;
const JOB_TTL = 30 * 60 * 1000; // 任务结果保留 30 分钟

/** @type {Map<string, any>} */
const jobs = new Map();

function setJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch);
  job.updatedAt = Date.now();
}

function newJob() {
  const jobId = `ocr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  jobs.set(jobId, {
    jobId,
    status: 'queued', // queued | running | done | error
    progress: 0,
    message: '已加入识别队列',
    fileName: '',
    result: null,
    error: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return jobId;
}

// 定期清理过期任务，避免内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > JOB_TTL) jobs.delete(id);
  }
}, 5 * 60 * 1000).unref?.();

function extOf(fileName) {
  const lower = (fileName || '').toLowerCase();
  return lower.includes('.') ? lower.split('.').pop() : '';
}

/** PDF 是否已有可用的文字层 */
async function pdfHasTextLayer(buffer) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const probe = Math.min(pdf.numPages, 5);
    let chars = 0;
    for (let i = 1; i <= probe; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      chars += (content.items || []).reduce((sum, it) => sum + (it?.str?.length || 0), 0);
    }
    return chars > 40;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// 各类材料的 OCR 主流程
// ------------------------------------------------------------

async function ocrPdf(buffer, jobId) {
  const hasText = await pdfHasTextLayer(buffer);
  if (hasText) {
    return {
      text: '',
      provider: 'none',
      note: '该 PDF 已包含文字层，无需 OCR，请直接使用常规解析。',
      skip: true,
    };
  }

  setJob(jobId, { status: 'running', message: '正在把扫描页渲染成图片…', progress: 3 });

  const { pages, total, truncated } = await pdfToImages(buffer, {
    maxPages: OCR_MAX_PAGES,
    onPage: (pageNo, limit) => {
      // 渲染阶段占 3%~25%
      setJob(jobId, {
        message: `正在渲染扫描页（${pageNo}/${limit}）`,
        progress: Math.round(3 + (pageNo / Math.max(1, limit)) * 22),
      });
    },
  });

  if (!pages.length) {
    return { text: '', provider: 'none', note: '未能渲染出可识别的页面。' };
  }

  const chunks = [];
  let used = 'none';
  for (let i = 0; i < pages.length; i += 1) {
    setJob(jobId, {
      message: `正在识别第 ${i + 1}/${pages.length} 页（扫描件 OCR）`,
      progress: Math.round(25 + ((i + 1) / pages.length) * 72),
    });
    const res = await recognizeImage(pages[i], 'image/png');
    if (res.provider !== 'none') used = res.provider;
    if (res.text) chunks.push(`—— 第 ${i + 1} 页 ——\n${res.text}`);
  }

  return {
    text: chunks.join('\n\n'),
    provider: used,
    pageCount: total,
    truncated,
  };
}

async function ocrPptx(buffer, jobId) {
  setJob(jobId, { status: 'running', message: '正在拆解 PPT 页面…', progress: 5 });
  const parsed = await extractPptx(buffer);

  const plainText = parsed.slides.reduce((sum, s) => sum + (s.text?.length || 0), 0);
  const needOcrSlides = parsed.slides.filter((s) => (s.text || '').trim().length < 12 && s.images.length > 0);

  if (!needOcrSlides.length) {
    return {
      text: parsed.text,
      provider: 'none',
      note: plainText > 0 ? 'PPT 自带文字层，无需 OCR。' : 'PPT 中没有可识别的文字或图片。',
      slideCount: parsed.slideCount,
      usedOcr: false,
    };
  }

  const targetSlides = needOcrSlides.slice(0, OCR_MAX_PAGES);
  const chunks = [];
  let used = 'none';
  let processed = 0;

  for (const slide of targetSlides) {
    const images = await readPptxImages(buffer, slide.images);
    const usable = images.filter((img) => isOcrableImage(img.name) && !imageTooSmall(img.buffer));
    if (!usable.length) {
      processed += 1;
      continue;
    }
    setJob(jobId, {
      message: `正在识别第 ${slide.index} 页的图片内容（图片版 PPT）`,
      progress: Math.round(5 + (processed / targetSlides.length) * 90),
    });

    const pieces = [];
    for (const img of usable.slice(0, 4)) {
      const res = await recognizeImage(img.buffer, guessMime(img.name));
      if (res.provider !== 'none') used = res.provider;
      if (res.text) pieces.push(res.text);
    }
    if (pieces.length) {
      chunks.push(`—— 第 ${slide.index} 页（图片识别）——\n${pieces.join('\n')}`);
    }
    processed += 1;
  }

  const ocrText = chunks.join('\n\n');
  const merged = [parsed.text, ocrText].filter((t) => t && t.trim()).join('\n\n').trim();

  return {
    text: merged,
    provider: used,
    slideCount: parsed.slideCount,
    ocrSlides: chunks.length,
    usedOcr: true,
  };
}

async function ocrDocx(buffer, jobId) {
  setJob(jobId, { status: 'running', message: '正在检查 Word 文档…', progress: 8 });
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value || '').trim();
  if (text.length >= 200) {
    return { text, provider: 'none', note: 'Word 已包含文字，无需 OCR。' };
  }

  const images = (await readDocxImages(buffer)).filter(
    (img) => isOcrableImage(img.name) && !imageTooSmall(img.buffer),
  );
  if (!images.length) {
    return { text, provider: 'none', note: 'Word 正文为空且没有内嵌图片。' };
  }

  const chunks = [];
  let used = 'none';
  for (let i = 0; i < images.length; i += 1) {
    setJob(jobId, {
      message: `正在识别内嵌图片（${i + 1}/${images.length}）`,
      progress: Math.round(10 + ((i + 1) / images.length) * 85),
    });
    const res = await recognizeImage(images[i].buffer, guessMime(images[i].name));
    if (res.provider !== 'none') used = res.provider;
    if (res.text) chunks.push(res.text);
  }
  return { text: [text, ...chunks].filter(Boolean).join('\n\n'), provider: used, usedOcr: true };
}

async function ocrSingleImage(buffer, mime, jobId) {
  setJob(jobId, { status: 'running', message: '正在识别图片文字…', progress: 20 });
  const res = await recognizeImage(buffer, mime);
  setJob(jobId, { progress: 90 });
  return { text: res.text, provider: res.provider, error: res.error };
}

function guessMime(name) {
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.bmp$/i.test(name)) return 'image/bmp';
  if (/\.tiff?$/i.test(name)) return 'image/tiff';
  return 'image/png';
}

// ------------------------------------------------------------
// 任务执行
// ------------------------------------------------------------
async function runJob(jobId, fileName, buffer) {
  try {
    setJob(jobId, { status: 'running', fileName, message: '正在准备识别…', progress: 1 });
    const ext = extOf(fileName);

    let out;
    if (isImageFile(fileName)) {
      out = await ocrSingleImage(buffer, guessMime(fileName), jobId);
    } else if (ext === 'pdf') {
      out = await ocrPdf(buffer, jobId);
    } else if (ext === 'pptx') {
      out = await ocrPptx(buffer, jobId);
    } else if (ext === 'docx') {
      out = await ocrDocx(buffer, jobId);
    } else {
      throw new Error(`该格式不需要 OCR：${ext || '未知格式'}`);
    }

    const text = normalizeOcrText(out.text || '');
    if (!text) {
      setJob(jobId, {
        status: 'error',
        progress: 100,
        message: out.note || out.error || 'OCR 未能识别出任何文字',
        error: out.error || out.note || 'OCR 未识别出文字',
      });
      return;
    }

    setJob(jobId, {
      status: 'done',
      progress: 100,
      message: '识别完成',
      result: {
        text,
        method: out.usedOcr === false ? 'pptx' : 'ocr',
        provider: out.provider || 'none',
        pageCount: out.pageCount || out.slideCount || 1,
        truncated: Boolean(out.truncated),
      },
    });
  } catch (err) {
    console.error('[ocr] 任务失败:', err);
    setJob(jobId, {
      status: 'error',
      progress: 100,
      message: `识别失败：${err?.message || String(err)}`,
      error: err?.message || String(err),
    });
  }
}

// ------------------------------------------------------------
// 接口
// ------------------------------------------------------------

// GET /api/ocr/config —— 前端判断 OCR 是否可用
router.get('/ocr/config', (_req, res) => {
  res.json({ ok: true, ...ocrProviderInfo() });
});

// POST /api/ocr/start —— 上传文件并启动 OCR 任务
router.post('/ocr/start', async (req, res) => {
  try {
    const { fileName, data } = req.body || {};
    if (!fileName || typeof data !== 'string') {
      return res.status(400).json({ error: '缺少 fileName 或文件数据' });
    }
    let buffer;
    try {
      buffer = Buffer.from(data, 'base64');
    } catch {
      return res.status(400).json({ error: '文件数据解码失败' });
    }
    if (!buffer.length) return res.status(400).json({ error: '文件为空' });
    if (buffer.length > MAX_BYTES) return res.status(413).json({ error: '文件过大（上限 25MB）' });

    const jobId = newJob();
    setJob(jobId, { fileName });
    // 异步执行，前端轮询进度
    runJob(jobId, fileName, buffer);
    return res.json({ jobId });
  } catch (err) {
    return res.status(500).json({ error: `OCR 任务启动失败：${err?.message || String(err)}` });
  }
});

// GET /api/ocr/status/:jobId
router.get('/ocr/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: '任务不存在或已过期' });
  res.json({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    result: job.result,
  });
});

// DELETE /api/ocr/status/:jobId
router.delete('/ocr/status/:jobId', (req, res) => {
  jobs.delete(req.params.jobId);
  res.json({ ok: true });
});

export { router as ocrRouter };
