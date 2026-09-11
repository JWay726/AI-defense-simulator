// ============================================================
// 扫描版 PDF → 图片
// 没有文字层的 PDF 无法直接抽文本，只能把页面变成位图再交给 OCR。
//
// 实现说明：
// 这里不走 pdf.js 的 render 管线（在 Node + 第三方 canvas 下容易崩溃），
// 而是直接从页面操作符流里取出嵌入的图片对象（paintImageXObject）。
// 对扫描件来说这反而更好——拿到的是原始嵌入图，分辨率无损，OCR 更准。
// ============================================================

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

let canvasModulePromise = null;
async function getCanvasModule() {
  if (!canvasModulePromise) {
    canvasModulePromise = import('@napi-rs/canvas').catch((err) => {
      canvasModulePromise = null;
      throw new Error(
        `缺少 @napi-rs/canvas，无法把扫描版 PDF 转成图片（${err?.message || err}）。` +
          '请执行 npm install @napi-rs/canvas 后重启后端。',
      );
    });
  }
  return canvasModulePromise;
}

/**
 * 把原始像素数据编码成 PNG。
 * pdf.js 取出的图片可能是 RGBA(4通道) / RGB(3通道) / 灰度(1通道)，需要统一成 RGBA。
 */
async function encodePixelsToPng(data, width, height) {
  const pixels = width * height;
  let channels;
  if (data.length === pixels * 4) channels = 4;
  else if (data.length === pixels * 3) channels = 3;
  else if (data.length === pixels) channels = 1;
  else return null; // 其它色彩空间（CMYK 等）不处理

  const { createCanvas } = await getCanvasModule();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;

  for (let i = 0; i < pixels; i += 1) {
    const src = i * channels;
    const dst = i * 4;
    if (channels === 1) {
      out[dst] = data[src];
      out[dst + 1] = data[src];
      out[dst + 2] = data[src];
    } else {
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
    }
    out[dst + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer('image/png');
}

/** 兼容 pdf.js 不同版本的 objs.get（同步返回 / 回调式 / Promise 式） */
async function getPageObject(page, objId) {
  try {
    const direct = page.objs.get(objId);
    if (direct !== undefined && direct !== null) return direct;
  } catch {
    // 落到回调式
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const result = page.objs.get(objId, done);
      if (result && typeof result.then === 'function') result.then(done).catch(() => done(null));
    } catch {
      done(null);
    }
    setTimeout(() => done(null), 3000);
  });
}

function imageOps(ops) {
  const ids = [];
  const paintImage = pdfjsLib.OPS?.paintImageXObject;
  const paintJpeg = pdfjsLib.OPS?.paintJpegXObject;
  const paintInline = pdfjsLib.OPS?.paintInlineImageXObject;
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    if (fn === paintImage || fn === paintJpeg || fn === paintInline) {
      const arg = ops.argsArray?.[i]?.[0];
      if (arg != null) ids.push(arg);
    }
  }
  return [...new Set(ids)];
}

/**
 * 提取 PDF 每页中嵌入的图片（扫描件即整页图片）
 * @param {Buffer} buffer PDF 文件
 * @param {{maxPages?: number, onPage?: (pageNo:number, total:number)=>void}} options
 * @returns {Promise<{pages: Buffer[], total: number, rendered: number, truncated: boolean}>}
 */
export async function pdfToImages(buffer, options = {}) {
  const maxPages = Number(options.maxPages || 0) || Infinity;
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const total = doc.numPages || 0;
  const limit = Math.min(total, maxPages);
  const pages = [];

  for (let i = 1; i <= limit; i += 1) {
    const page = await doc.getPage(i);
    let encoded = null;
    try {
      const ops = await page.getOperatorList();
      const ids = imageOps(ops);
      for (const id of ids) {
        const img = await getPageObject(page, id);
        const data = img?.data || img?.bitmap?.data;
        const width = img?.width;
        const height = img?.height;
        if (!data || !width || !height) continue;
        // 每页取第一张能编码成功的整页图即可
        encoded = await encodePixelsToPng(data, width, height);
        if (encoded) break;
      }
    } catch (err) {
      console.warn(`[pdfRaster] 第 ${i} 页取图失败:`, err?.message || err);
    } finally {
      if (typeof page.cleanup === 'function') page.cleanup();
    }

    if (encoded) pages.push(encoded);
    if (typeof options.onPage === 'function') options.onPage(i, limit);
  }

  return { pages, total, rendered: pages.length, truncated: limit < total };
}
