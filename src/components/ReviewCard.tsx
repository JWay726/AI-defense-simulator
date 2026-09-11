import { useState } from 'react';
import type { ReviewCardPayload } from '../types';

// ============================================================
// 复盘卡片 (P0 动态追问与复盘)
// 对应 PRD 3 功能清单：给出"原回答指出缺陷 + 标准话术"
// 对应 PRD 8.1：漏洞命中率 (高亮显示用户原话中的逻辑缺陷词)
// 视觉策略：三栏对比布局，极简现代风格，白色卡片。
// ============================================================

interface ReviewCardProps {
  payload: ReviewCardPayload;
}

const REVIEW_COLORS = [
  { bg: 'bg-amber-50', text: 'text-amber-400', border: 'border-amber-200' },
  { bg: 'bg-rose-50', text: 'text-rose-400', border: 'border-rose-200' },
  { bg: 'bg-violet-50', text: 'text-violet-400', border: 'border-violet-200' },
  { bg: 'bg-emerald-50', text: 'text-emerald-400', border: 'border-emerald-200' },
  { bg: 'bg-sky-50', text: 'text-sky-400', border: 'border-sky-200' },
  { bg: 'bg-fuchsia-50', text: 'text-fuchsia-400', border: 'border-fuchsia-200' },
];

function hashStr(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export const ReviewCard = ({ payload }: ReviewCardProps) => {
  const [copied, setCopied] = useState(false);
  const { originalTranscript, flawWords, mentorCritique, goldenTemplate, vulnerabilityType } =
    payload;

  const vulnColors = vulnerabilityType
    ? REVIEW_COLORS[hashStr(vulnerabilityType) % REVIEW_COLORS.length]
    : null;

  // 高亮用户原话中的缺陷关键词
  const highlightTranscript = (text: string, flaws: string[]) => {
    if (!flaws || flaws.length === 0) return text;
    // 按长度降序，避免短词先替换破坏长词
    const sortedFlaws = [...flaws].sort((a, b) => b.length - a.length);
    const parts: (string | { flaw: string })[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      let earliestIdx = -1;
      let matchedFlaw = '';
      for (const flaw of sortedFlaws) {
        const idx = remaining.indexOf(flaw);
        if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
          earliestIdx = idx;
          matchedFlaw = flaw;
        }
      }
      if (earliestIdx === -1) {
        parts.push(remaining);
        break;
      }
      if (earliestIdx > 0) parts.push(remaining.substring(0, earliestIdx));
      parts.push({ flaw: matchedFlaw });
      remaining = remaining.substring(earliestIdx + matchedFlaw.length);
    }
    return parts.map((p, i) =>
      typeof p === 'string' ? (
        <span key={i}>{p}</span>
      ) : (
        <span
          key={i}
          className="bg-rose-500/20 text-rose-600 px-1 rounded font-medium"
        >
          {p.flaw}
        </span>
      ),
    );
  };

  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(goldenTemplate);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：选中文本
      setCopied(false);
    }
  };

  return (
    <div className="w-full">
      {/* 漏洞分类标签 */}
      {vulnerabilityType && vulnColors && (
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-mono px-2 py-1 rounded-md border ${vulnColors.bg} ${vulnColors.text} ${vulnColors.border}`}>
            漏洞类型：{vulnerabilityType}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-indigo-100 border border-indigo-50 rounded-xl bg-white overflow-hidden">
        {/* 你的原话 */}
        <div className="bg-indigo-50/30 p-4 flex flex-col">
          <h4 className="text-indigo-700 text-xs font-semibold mb-3 uppercase tracking-wider">
            你的原话
          </h4>
          <div className="text-gray-700 text-sm leading-relaxed grow">
            {highlightTranscript(originalTranscript, flawWords)}
          </div>
        </div>

        {/* 导师点评 */}
        <div className="bg-amber-50/30 p-4 flex flex-col">
          <h4 className="text-amber-700 text-xs font-semibold mb-3 uppercase tracking-wider">
            导师点评
          </h4>
          <p className="text-gray-700 text-sm leading-relaxed grow">
            "{mentorCritique}"
          </p>
        </div>

        {/* 满分话术 */}
        <div className="bg-emerald-50/30 p-4 flex flex-col">
          <h4 className="text-emerald-700 text-xs font-semibold mb-3 uppercase tracking-wider">
            满分话术
          </h4>
          <p className="text-gray-700 text-sm leading-relaxed mb-3 grow">{goldenTemplate}</p>
          <button
            onClick={handleCopy}
            className="mt-auto text-xs text-indigo-600 hover:text-indigo-700 transition-colors flex items-center justify-end gap-1.5 py-1.5 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 self-end"
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? '已复制' : '复制话术'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewCard;