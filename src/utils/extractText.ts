// ============================================================
// 文档文本提取工具
// 目标：把用户上传的文件转成纯文本，再交给 DeepSeek 解析。
// DeepSeek API 只接受文本，无法直接读 PDF/PPT/Word 等二进制格式。
//
// 提取统一放到后端（Node）完成，前端只负责把文件上传给后端 /api/extract-text。
// 这样避开浏览器里 pdfjs worker、mammoth 打包、缓存等各种不稳定因素，
// 复用成熟的 Node 生态（mammoth / pdfjs-dist）做抽取，更可靠、更易调试。
// ============================================================
import { extractDocumentText, type ExtractResult } from '../api';

export type { ExtractResult };

// 判断字符串是否像二进制乱码：包含真正非打印控制字符，或直接把 PDF 二进制流当作文本
export function looksLikeBinaryGarbage(text: string): boolean {
  if (!text) return true;
  const nonPrintable = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/;
  // 包含典型 PDF 对象关键字 + 控制字符时，基本判定为二进制流
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

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  const lowerName = file.name.toLowerCase();
  const ext = lowerName.includes('.') ? lowerName.split('.').pop() || '' : '';
  console.log('[extractText] upload to backend:', file.name, 'ext:', ext, 'size:', file.size);

  try {
    const buf = await file.arrayBuffer();
    const result = await extractDocumentText(file.name, buf);
    console.log(
      '[extractText] backend result:',
      'method:',
      result.method,
      'textLen:',
      result.text.length,
      'error:',
      result.error || '(none)',
    );
    return result;
  } catch (err: any) {
    console.error('[extractText] 上传后端失败:', err);
    return {
      text: '',
      method: 'none',
      error: `无法连接解析服务（${err?.message || String(err)}）。请确认后端服务已启动（默认 http://localhost:3001）。`,
    };
  }
}
