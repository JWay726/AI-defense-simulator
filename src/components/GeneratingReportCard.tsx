import React, { useState, useEffect } from 'react';
import type { GeneratingReportPayload } from '../types';

// ============================================================
// 复盘报告生成进度卡片
// 最终报告前的等待态：展示文案 + 进度条
// ============================================================

export const GeneratingReportCard: React.FC<{
  payload: GeneratingReportPayload;
}> = ({ payload }) => {
  const [displayProgress, setDisplayProgress] = useState(payload.progress);

  // 进度条平滑过渡：props 进度更新时，用 600ms 动画追过去
  useEffect(() => {
    const target = Math.min(100, Math.max(0, payload.progress));
    const timer = setTimeout(() => setDisplayProgress(target), 50);
    return () => clearTimeout(timer);
  }, [payload.progress]);

  return (
    <div className="bg-white border border-indigo-100 rounded-xl shadow-sm mb-3 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
          <svg
            className="w-5 h-5 text-indigo-500 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 4.418 3.582 8 8 8v-4c-2.133 0-4.067-.84-5.5-2.209z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900">{payload.message}</h4>
          {payload.detail ? (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{payload.detail}</p>
          ) : null}
        </div>
        <span className="text-sm font-medium text-indigo-600">{displayProgress}%</span>
      </div>

      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${displayProgress}%` }}
        />
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        综合各导师评分与历史作答记录，请稍候…
      </div>
    </div>
  );
};
