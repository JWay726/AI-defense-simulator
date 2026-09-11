import { useState, useEffect } from 'react';
import type { ParsingStatusPayload } from '../types';

// ============================================================
// 文档解析进度卡片 (P0 文档解析引擎)
// 对应 PRD 4.1 Story 1：
//   "上传文件后，系统需在10秒内完成解析并抛出第一个问题，
//    期间要有'导师正在翻阅你的PPT'的 loading 动画缓解焦虑。"
// 视觉策略：极简现代风，白色卡片 + 靛蓝色系，专注专业。
// ============================================================

interface ParsingCardProps {
  payload: ParsingStatusPayload;
}

export default function ParsingCard({ payload }: ParsingCardProps) {
  const { progress, currentAction, mentorMessage, fileName } = payload || {};
  const [displayProgress, setDisplayProgress] = useState(0);

  const safeProgress = typeof progress === 'number' && !Number.isNaN(progress) ? progress : 0;
  const safeMessage = typeof mentorMessage === 'string' ? mentorMessage : '';
  const safeAction = typeof currentAction === 'string' ? currentAction : '';
  const safeFileName = typeof fileName === 'string' ? fileName : '';

  // 进度条平滑增长动画
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayProgress(safeProgress);
    }, 100);
    return () => clearTimeout(timer);
  }, [safeProgress]);

  // 计算 SVG 圆环的偏移量 (周长 = 2 * π * 45)
  const CIRCUMFERENCE = 2 * Math.PI * 45;
  const strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * displayProgress) / 100;

  return (
    <div className="bg-white border border-indigo-50 rounded-2xl p-6 mb-3">
      {/* 顶部文件名标识 */}
      {safeFileName && (
        <div className="mb-4 inline-block text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">
          {safeFileName.length > 24 ? safeFileName.substring(0, 22) + '...' : safeFileName}
        </div>
      )}

      {/* 导师评论块 */}
        <div className="flex-1 min-w-0 bg-indigo-50/30 p-6 rounded-xl">
          <p className="text-gray-700 text-base leading-relaxed">
            {safeMessage}
          </p>
        </div>

      {/* 动态圆环 + 状态文字 */}
      <div className="flex flex-col items-center justify-center pt-6 pb-4">
        {/* 圆环 */}
        <div className="relative w-40 h-40 flex items-center justify-center mb-6">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* 轨道背景 */}
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              className="text-indigo-100"
            />
            {/* 进度条 */}
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              strokeLinecap="round"
              className="text-indigo-600 transition-all duration-1000 ease-out"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          {/* 百分比文字 */}
          <span className="absolute text-4xl font-semibold text-indigo-600">
            {displayProgress}%
          </span>
        </div>

        {/* 当前动作文字 */}
        <p className="text-indigo-500 text-lg text-center">
          {safeAction}
        </p>
      </div>
    </div>
  );
}