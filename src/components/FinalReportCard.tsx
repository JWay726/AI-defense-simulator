import { useState } from 'react';
import AIAvatar from './AIAvatar';
import { getMentor, type FinalReportPayload } from '../types';

// ============================================================
// 最终综合报告卡片
// 全部类型完成后生成，包含各类型话术模板、综合评价
// ============================================================

interface FinalReportCardProps {
  payload: FinalReportPayload;
}

// 动态颜色轮转（6 色）
const COLOR_PALETTE = [
  { label: '', color: 'text-amber-400', bg: 'bg-amber-50', barFill: 'bg-amber-400' },
  { label: '', color: 'text-rose-400', bg: 'bg-rose-50', barFill: 'bg-rose-400' },
  { label: '', color: 'text-violet-400', bg: 'bg-violet-50', barFill: 'bg-violet-400' },
  { label: '', color: 'text-emerald-400', bg: 'bg-emerald-50', barFill: 'bg-emerald-400' },
  { label: '', color: 'text-sky-400', bg: 'bg-sky-50', barFill: 'bg-sky-400' },
  { label: '', color: 'text-fuchsia-400', bg: 'bg-fuchsia-50', barFill: 'bg-fuchsia-400' },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getTypeColor(tag: string) {
  return COLOR_PALETTE[hashString(tag) % COLOR_PALETTE.length];
}

// 防御性渲染：确保任何字段都不会把对象直接作为 React child 渲染
function renderText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export const FinalReportCard = ({ payload }: FinalReportCardProps) => {
  const safePayload = payload || ({} as FinalReportPayload);
  const {
    typeCounts = {},
    totalQuestions = 0,
    totalDuration = 0,
    templates = {},
    overallEvaluation = '暂无综合评价',
    score = 0,
    mentorName = '导师',
    perMentorScores = [],
  } = safePayload;
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // 确保渲染字段都是字符串
  const safeOverall = renderText(overallEvaluation, '暂无综合评价');
  const safeTemplates: Record<string, string> = {};
  Object.entries(templates || {}).forEach(([key, value]) => {
    safeTemplates[key] = renderText(value, '');
  });
  const safeMentorName = renderText(mentorName, '导师');
  const safeTotalQuestions = typeof totalQuestions === 'number' ? totalQuestions : 0;
  const safeTotalDuration = typeof totalDuration === 'number' ? totalDuration : 0;
  const safeScore = typeof score === 'number' ? score : 0;
  const safeTypeCounts: Record<string, number> = {};
  Object.entries(typeCounts || {}).forEach(([key, value]) => {
    const num = typeof value === 'number' ? value : Number(value);
    safeTypeCounts[key] = Number.isFinite(num) ? num : 0;
  });

  const handleCopyTemplate = (type: string, template: string) => {
    try {
      navigator.clipboard?.writeText(template);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      setCopiedType(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
  };

  const scoreColor = safeScore >= 80 ? 'text-emerald-500' : safeScore >= 60 ? 'text-amber-500' : 'text-rose-500';
  const scoreBg = safeScore >= 80 ? 'bg-emerald-50' : safeScore >= 60 ? 'bg-amber-50' : 'bg-rose-50';
  const scoreRing = safeScore >= 80 ? 'border-emerald-500' : safeScore >= 60 ? 'border-amber-500' : 'border-rose-500';

  return (
    <div className="w-full bg-white border border-gray-100 rounded-2xl overflow-hidden">
      {/* 头部：报告标题 + 分数 */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white text-lg font-semibold tracking-tight">演练完成报告</h3>
            <p className="text-indigo-100 text-sm mt-1">
              导师：{safeMentorName} · 共 {safeTotalQuestions} 题 · 用时 {formatDuration(safeTotalDuration)}
            </p>
          </div>
          <div className={`w-14 h-14 rounded-full ${scoreBg} flex items-center justify-center border-2 ${scoreRing}`}>
            <span className={`text-lg font-bold ${scoreColor}`}>{safeScore}</span>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 text-sm font-medium py-3 text-center transition-colors ${
            activeTab === 'overview'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          综合评价
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 text-sm font-medium py-3 text-center transition-colors ${
            activeTab === 'templates'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          满分话术
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 text-sm font-medium py-3 text-center transition-colors ${
            activeTab === 'stats'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          统计数据
        </button>
      </div>

      {/* Tab 内容 */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <div>
            {Array.isArray(perMentorScores) && perMentorScores.length > 1 && (
              <div className="mb-5 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                <h4 className="font-semibold text-gray-900 mb-3 text-sm">各位评委打分</h4>
                <div className="space-y-2">
                  {perMentorScores.map((item) => {
                    const mentor = getMentor(item?.mentorId);
                    const value = typeof item?.score === 'number' ? item.score : 0;
                    return (
                      <div key={item?.mentorId || item?.name} className="flex items-center gap-2.5">
                        <AIAvatar mentorId={mentor.id} size="sm" />
                        <span className="text-sm text-gray-600 w-24 shrink-0 truncate">
                          {item?.name || mentor.name}
                        </span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${mentor.accent.bar}`}
                            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 w-9 text-right">{value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <h4 className="font-semibold text-gray-900 mb-4">导师综合评价</h4>
            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
              {safeOverall}
            </p>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 mb-2">各类型满分话术模板</h4>
            {Object.entries(safeTemplates).map(([type, template]) => {
              const config = getTypeColor(type);
              return (
                <div key={type} className={`${config.bg} border border-gray-100 rounded-xl overflow-hidden`}>
                  <div className="px-4 py-2 flex items-center justify-between">
                    <span className={`text-sm font-medium ${config.color}`}>
                      {type}
                    </span>
                    <button
                      onClick={() => handleCopyTemplate(type, template)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-600 transition-colors"
                    >
                      {copiedType === type ? '已复制' : '复制'}
                    </button>
                  </div>
                  <div className="px-4 pb-4">
                    <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                      {template}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'stats' && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">答题统计</h4>
            <div className="space-y-3">
              {Object.entries(safeTypeCounts).map(([type, count]) => {
                const config = getTypeColor(type);
                const percentage = Math.round((count / 3) * 100);
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${config.color}`}>
                        {type}
                      </span>
                      <span className="text-sm text-gray-400">{count}/3 题</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${config.barFill}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 border-t border-gray-100 mt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">总答题数</span>
                  <span className="font-semibold text-gray-900">{safeTotalQuestions} 题</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-400">总用时</span>
                  <span className="font-semibold text-gray-900">{formatDuration(safeTotalDuration)}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-400">综合评分</span>
                  <span className={`font-semibold ${scoreColor}`}>{safeScore}/100</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinalReportCard;