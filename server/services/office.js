// ============================================================
// Office 文档结构化抽取
// 重点解决两类"看起来没法解析"的材料：
//   1. .pptx —— 本质是 zip，文字在 slideN.xml 的 <a:t> 里，图片在 ppt/media 下
//   2. .docx —— mammoth 只能拿到文字；扫描件里的图在 word/media 下，需要 OCR
// ============================================================

import JSZip from 'jszip';

const IMAGE_RE = /\.(png|jpe?g|bmp|tiff?)$/i;
const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
const NOTES_RE = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/;

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/** 抽取 Shape 里的所有 <a:t> 文本，按段落（<a:p>）分行 */
export function extractShapeText(xml) {
  if (!xml) return '';
  const paragraphs = xml.match(/<a:p>[\s\S]*?<\/a:p>/g);
  const source = Array.isArray(paragraphs) && paragraphs.length ? paragraphs : [xml];
  const lines = [];

  for (const block of source) {
    const texts = [...block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const line = texts.join('').trim();
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

function slideNumber(name, re) {
  const m = name.match(re);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** 从 rels 文件里找出该页引用的媒体资源路径 */
async function readSlideImages(zip, slideName) {
  const base = slideName.split('/').pop();
  const relsName = `ppt/slides/_rels/${base}.rels`;
  const relsFile = zip.file(relsName);
  if (!relsFile) return [];
  const rels = await relsFile.async('string');
  const targets = [...rels.matchAll(/Target="([^"]+)"/g)].map((m) => decodeXmlEntities(m[1]));
  const resolved = targets
    .map((t) => {
      const clean = t.replace(/^\.\.\//, 'ppt/').replace(/^\//, '');
      return clean.startsWith('ppt/') ? clean : `ppt/${clean}`;
    })
    .filter((t) => IMAGE_RE.test(t));
  return [...new Set(resolved)];
}

/**
 * 解析 pptx
 * @returns {Promise<{text: string, slides: {index:number, text:string, images:string[]}[], slideCount:number, imageCount:number, hasImages:boolean}>}
 */
export async function extractPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);

  const slideNames = names.filter((n) => SLIDE_RE.test(n)).sort((a, b) => slideNumber(a, SLIDE_RE) - slideNumber(b, SLIDE_RE));
  const notesNames = names.filter((n) => NOTES_RE.test(n)).sort((a, b) => slideNumber(a, NOTES_RE) - slideNumber(b, NOTES_RE));
  const mediaNames = names.filter((n) => /^ppt\/media\//.test(n) && IMAGE_RE.test(n));

  const notesByIndex = new Map();
  for (const n of notesNames) {
    const xml = await zip.file(n).async('string');
    const text = extractShapeText(xml)
      .split('\n')
      // 备注页第一行为页码占位，过滤掉纯数字行
      .filter((line) => !/^\d+$/.test(line.trim()))
      .join('\n')
      .trim();
    if (text) notesByIndex.set(slideNumber(n, NOTES_RE), text);
  }

  const slides = [];
  for (let i = 0; i < slideNames.length; i += 1) {
    const name = slideNames[i];
    const index = slideNumber(name, SLIDE_RE);
    const xml = await zip.file(name).async('string');
    let text = extractShapeText(xml);
    const notes = notesByIndex.get(index);
    if (notes) text = `${text}\n【备注】${notes}`.trim();
    const images = await readSlideImages(zip, name);
    slides.push({ index, text, images });
  }

  const bundle = slides
    .map((s, i) => {
      const head = `—— 第 ${s.index || i + 1} 页 ——`;
      return s.text ? `${head}\n${s.text}` : `${head}`;
    })
    .join('\n\n');

  return {
    text: bundle.trim(),
    slides,
    slideCount: slides.length,
    imageCount: mediaNames.length,
    hasImages: mediaNames.length > 0,
  };
}

/** 读取 pptx 中指定路径的图片二进制 */
export async function readPptxImages(buffer, paths) {
  const zip = await JSZip.loadAsync(buffer);
  const out = [];
  for (const p of paths) {
    const file = zip.file(p);
    if (!file) continue;
    const buf = await file.async('nodebuffer');
    out.push({ name: p.split('/').pop(), buffer: buf });
  }
  return out;
}

/** 读取 docx 中 word/media 下的图片 */
export async function readDocxImages(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((n) => /^word\/media\//.test(n) && IMAGE_RE.test(n));
  const out = [];
  for (const n of names) {
    out.push({ name: n.split('/').pop(), buffer: await zip.file(n).async('nodebuffer') });
  }
  return out;
}

export function isPptx(fileName) {
  return /\.pptx$/i.test(fileName || '');
}
