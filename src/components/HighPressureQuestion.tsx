import { useState, useEffect } from 'react';
import type { HighPressureQuestionPayload } from '../types';

// ============================================================
// 致命提问卡片 (P0 动态追问 - 深挖场景)
// 对应 PRD 4.2：AI 评估用户回答，决定继续深挖追问
// 对应 PRD 8.1：压迫感指数 5 分 = "直击要害的致命打击"
// 视觉策略：极简现代风格，玫瑰色系点缀，营造紧迫感。
// ============================================================

interface HighPressureQuestionProps {
  payload: HighPressureQuestionPayload;
  // 是否是当前最新问题（控制倒计时是否启动）
  isLatest?: boolean;
  // 是否已开始作答（用户按下麦克风后置 true）
  isAnswering?: boolean;
}

export default function HighPressureQuestionCard({
  payload,
  isLatest = false,
  isAnswering = false,
}: HighPressureQuestionProps) {
  const { content, timeLimit, hasHint, hint, triggerSnippet } = payload;

  // PRD: 每题作答时间最长 3 分钟
  const [timeLeft, setTimeLeft] = useState(timeLimit || 180);
  const [isHintUnlocked, setIsHintUnlocked] = useState(false);

  // 倒计时：仅当是最新问题、用户已开始作答、且时间未到时启动
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isLatest && isAnswering && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLatest, isAnswering, timeLeft]);

  // 格式化时间 mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isTimeUrgent = timeLeft <= 10 && timeLeft > 0;

  return (
    <div className="bg-white border border-rose-100 rounded-xl p-5 shadow-sm mb-4 bg-rose-50/20">
      {/* 头部标签与倒计时 */}
      <div className="flex justify-between items-center mb-4">
        <span className="bg-rose-500 text-white text-xs font-bold px-2.5 py-1 rounded flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          致命追问
        </span>
        {/* 倒计时 */}
        <span
          className={`font-mono text-sm font-semibold px-2.5 py-1 rounded-md transition-colors duration-300 ${
            timeLeft === 0
              ? 'bg-rose-50 text-rose-500'
              : isTimeUrgent
                ? 'bg-rose-50 text-rose-500 animate-pulse'
                : isAnswering
                  ? 'bg-rose-50 text-rose-500'
                  : 'bg-gray-100 text-gray-500'
          }`}
        >
          {timeLeft === 0 ? '时间到' : formatTime(timeLeft)}
        </span>
      </div>

      {/* 触发片段：引用用户上一轮原话 */}
      {triggerSnippet && (
        <div className="bg-indigo-50 border-l-2 border-rose-500 pl-3 py-2 mb-3 rounded-r">
          <span className="text-[10px] text-gray-500 font-mono block mb-1">你刚才说：</span>
          <p className="text-gray-700 text-xs italic">"{triggerSnippet}"</p>
        </div>
      )}

      {/* 提问内容 */}
      <p className="text-gray-800 text-base leading-relaxed mb-4 font-medium">{content}</p>

      {/* 提示区交互 */}
      {hasHint && !isHintUnlocked && (
        <button
          onClick={() => setIsHintUnlocked(true)}
          className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 py-2 rounded-lg transition-colors text-sm mb-3"
        >
          💡 消耗 1 积分获取反击提示
        </button>
      )}
      {isHintUnlocked && hint && (
        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 mb-3">
          <span className="text-emerald-600 text-xs font-bold mb-1 block">反击思路提示：</span>
          <p className="text-gray-700 text-sm leading-relaxed">{hint}</p>
        </div>
      )}

      {/* 状态提示：未开始作答时 */}
      {isLatest && !isAnswering && timeLeft > 0 && (
        <div className="text-xs text-gray-500 mt-2 flex items-center">
          <svg
            className="w-3 h-3 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          按住 🎤 麦克风或直接打字，开始即倒计时
        </div>
      )}
    </div>
  );
}