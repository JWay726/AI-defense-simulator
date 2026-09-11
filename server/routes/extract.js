import express from 'express';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPptx, readDocxImages } from '../services/office.js';
import { isImageFile, isOcrableImage, imageTooSmall } from '../services/ocr.js';

const router = express.Router();

const MAX_BYTES = 25 * 1024 * 1024; // 25MB 上限
// 正文少于该字符数时，认为"没有可用文字层"，建议走 OCR
const MIN_USEFUL_CHARS = 40;

function looksLikeBinaryGarbage(text) {
  if (!text) return true;
  const nonPrintable = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/;
  if (/\b(obj|endobj|stream|endstream|xref|trailer|startxref)\b/.test(text) && nonPrintable.test(text)) {
    return true;
  }
  const total = text.length;
  if (total === 0) return true;
  // 中文/排版稀疏的 PDF 会有大量换行/空格，不能把它们当作"乱码"。
  // 只统计真正的非打印控制字符比例，超过 5% 才认为是二进制垃圾。
  const controlChars = text.split('').filter((c) => nonPrintable.test(c)).length;
  return controlChars / total > 0.05;
}

async function extractPdf(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    let line = '';
    const parts = [];
    for (const item of content.items) {
      const y = item.transform ? item.transform[5] : 0;
      if (lastY !== null && y !== lastY) {
        parts.push(line);
        line = '';
      }
      line += item.str;
      if (item.hasEOL) {
        parts.push(line);
        line = '';
      }
      lastY = y;
    }
    if (line) parts.push(line);
    pages.push(parts.join('\n'));
  }
  return { text: pages.join('\n\n').trim(), pageCount: pdf.numPages };
}

// POST /api/extract-text  body: { fileName: string, data: base64string }
router.post('/extract-text', async (req, res) => {
  try {
    const { fileName, data } = req.body || {};
    if (!fileName || typeof data !== 'string') {
      return res.status(400).json({ text: '', method: 'none', error: '缺少 fileName 或文件数据' });
    }

    let buffer;
    try {
      buffer = Buffer.from(data, 'base64');
    } catch {
      return res.status(400).json({ text: '', method: 'none', error: '文件数据解码失败' });
    }
    if (buffer.length === 0) {
      return res.status(400).json({ text: '', method: 'none', error: '文件为空' });
    }
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ text: '', method: 'none', error: '文件过大（上限 25MB）' });
    }

    const lower = fileName.toLowerCase();
    const ext = lower.includes('.') ? lower.split('.').pop() : '';

    // 旧版 Office 二进制格式直接拒绝
    if (['doc', 'ppt', 'xls', 'pps'].includes(ext)) {
      return res.json({
        text: '',
        method: 'none',
        error: '不支持旧版 Office 二进制格式（.doc/.ppt/.xls），请先另存为 .docx/.pptx/.pdf 或 .txt。',
      });
    }

    // 图片：没有文字层，必须 OCR
    if (isImageFile(fileName)) {
      return res.json({
        text: '',
        method: 'none',
        needOCR: true,
        error: '图片文件需要先做 OCR 才能提取文字。',
      });
    }

    if (ext === 'pptx') {
      try {
        const parsed = await extractPptx(buffer);
        const text = (parsed.text || '').replace(/—— 第 \d+ 页 ——/g, '').trim();
        if (text.length >= MIN_USEFUL_CHARS) {
          return res.json({ text: parsed.text, method: 'pptx', pageCount: parsed.slideCount });
        }
        if (parsed.hasImages) {
          return res.json({
            text: '',
            method: 'none',
            needOCR: true,
            error: `PPT 共 ${parsed.slideCount} 页，文字层几乎为空（疑似图片版），需要用 OCR 识别页面图片。`,
          });
        }
        return res.json({ text: '', method: 'none', error: 'PPT 中没有读到文字，也没有内嵌图片。' });
      } catch (err) {
        return res.json({ text: '', method: 'none', error: `pptx 解析异常：${err.message || String(err)}` });
      }
    }

    if (ext === 'docx') {
      try {
        const result = await mammoth.extractRawText({ buffer });
        const text = (result.value || '').trim();
        if (text) return res.json({ text, method: 'docx' });

        // 正文为空：可能是扫描件 Word（内嵌图片）
        const images = (await readDocxImages(buffer)).filter(
          (img) => isOcrableImage(img.name) && !imageTooSmall(img.buffer),
        );
        return res.json({
          text: '',
          method: 'none',
          needOCR: images.length > 0,
          error: images.length
            ? 'Word 正文为空，检测到内嵌图片（疑似扫描件），需要用 OCR 识别。'
            : 'docx 解析结果为空，可能是扫描件/图片版或文件损坏。',
        });
      } catch (err) {
        return res.json({ text: '', method: 'none', error: `docx 解析异常：${err.message || String(err)}` });
      }
    }

    if (ext === 'pdf') {
      try {
        const { text, pageCount } = await extractPdf(buffer);
        if (!text || looksLikeBinaryGarbage(text) || text.length < MIN_USEFUL_CHARS) {
          return res.json({
            text: '',
            method: 'none',
            needOCR: true,
            pageCount,
            error: `PDF 未提取到可读文字（疑似扫描件/图片版，共 ${pageCount || '若干'} 页），需要用 OCR 识别。`,
          });
        }
        return res.json({ text, method: 'pdfjs', pageCount });
      } catch (err) {
        return res.json({ text: '', method: 'none', error: `PDF 解析异常：${err.message || String(err)}` });
      }
    }

    // 纯文本类：txt / md / csv / json / text
    const text = buffer.toString('utf-8').trim();
    if (!text) {
      return res.json({ text: '', method: 'none', error: '未读取到文本内容，请确认文件编码或格式。' });
    }
    return res.json({ text, method: 'text' });
  } catch (err) {
    console.error('[extract-text] 未捕获异常:', err);
    return res.status(500).json({ text: '', method: 'none', error: `服务端解析异常：${err.message || String(err)}` });
  }
});

export { router };
