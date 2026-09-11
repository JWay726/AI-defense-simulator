import React, { useState, useEffect } from 'react';
import type {
  GenUIResponse,
  ParsingStatusPayload,
  QuestionCardPayload,
  EvaluationCardPayload,
  ReviewCardPayload,
  FinalReportPayload,
  GeneratingReportPayload,
  TypePickerPayload,
} from '../types';
import ParsingCard from './ParsingCard';
import { ReviewCard } from './ReviewCard';
import { FinalReportCard } from './FinalReportCard';
import { TypePickerCard } from './TypePickerCard';
import { PracticeChoiceCard } from './PracticeChoiceCard';
import { GeneratingReportCard } from './GeneratingReportCard';
import AIAvatar from './AIAvatar';
import { getMentor } from '../types';

// ============================================================
// GenUI 分发器
// 统一渲染 AI 下发的各类卡片组件
// 对应 PRD：P0 文档解析引擎 / 漏洞施压提问 / 动态追问与复盘
// ============================================================

// 漏洞标签颜色映射（动态分配，基于标签名哈希）
const COLOR_PALETTE = [
  'text-amber-500 bg-amber-50 border-amber-100',
  'text-rose-500 bg-rose-50 border-rose-100',
  'text-violet-500 bg-violet-50 border-violet-100',
  'text-emerald-500 bg-emerald-50 border-emerald-100',
  'text-sky-500 bg-sky-50 border-sky-100',
  'text-fuchsia-500 bg-fuchsia-50 border-fuchsia-100',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const getVulnerabilityTagStyle = (tag: string) => {
  return COLOR_PALETTE[hashString(tag) % COLOR_PALETTE.length];
};

// --- 导师身份条：多人答辩委员会时标明是谁在说 ---
const MentorBadge: React.FC<{ mentorId?: string; suffix?: string }> = ({ mentorId, suffix }) => {
  const mentor = getMentor(mentorId);
  if (!mentor) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${mentor.accent.chip}`}
      title={`${mentor.name}（${mentor.title}）· ${mentor.tagline}`}
    >
      <AIAvatar mentorId={mentor.id} size="xs" />
      {mentor.name}
      {suffix ? <span className="opacity-70">{suffix}</span> : null}
    </span>
  );
};

// --- 常规提问卡片 (带触发式倒计时) ---
const QuestionCardViewer: React.FC<{
  payload: QuestionCardPayload;
  isAnswering?: boolean;
  isLatest?: boolean;
}> = ({ payload, isAnswering, isLatest }) => {
  const isFollowUp = payload.isFollowUp === true;
  const isInterjection = payload.isInterjection === true;
  const mentor = getMentor(payload.mentorId);
  // PRD: 每题作答时间最长30s
  const [timeLeft, setTimeLeft] = useState(payload.timeLimit || 30);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isLatest && isAnswering && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev: number) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLatest, isAnswering, timeLeft]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isTimeUrgent = timeLeft <= 10 && timeLeft > 0;

  return (
    <div className={`rounded-xl p-5 shadow-sm mb-3 relative overflow-hidden ${
      isFollowUp
        ? 'bg-gradient-to-r from-rose-50 to-red-50 border-2 border-rose-300 animate-pulse'
        : 'bg-white border border-gray-100'
    }`}>
      <div
        className={`absolute top-0 left-0 w-1 h-full rounded-full ${
          isFollowUp ? 'bg-rose-500' : mentor.accent.bar
        }`}
      />

      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          {isFollowUp ? (
            <h4 className="font-bold text-rose-600 text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
              {isInterjection ? '导师插话' : '导师追问'}
            </h4>
          ) : (
            <h4 className="font-medium text-indigo-600 text-sm">导师提问</h4>
          )}
          <MentorBadge mentorId={payload.mentorId} suffix={isInterjection ? '插话' : undefined} />
          {payload.questionIndex && payload.questionIndex > 0 && (
            <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
              {payload.totalQuestions && payload.totalQuestions > 0
                ? `${payload.questionIndex}/${payload.totalQuestions}`
                : `第 ${payload.questionIndex} 题`}
            </span>
          )}
          {payload.vulnerabilityTag && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getVulnerabilityTagStyle(payload.vulnerabilityTag)}`}>
              #{payload.vulnerabilityTag}
            </span>
          )}
          {isFollowUp && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500 text-white font-medium animate-pulse">
              紧迫
            </span>
          )}
        </div>

        <div
          className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 transition-colors duration-300 ${
            timeLeft === 0
              ? 'text-rose-500 bg-rose-50'
              : isTimeUrgent
                ? 'text-amber-500 bg-amber-50 animate-pulse'
                : isAnswering
                  ? 'text-indigo-500 bg-indigo-50'
                  : 'text-gray-400 bg-gray-50'
          }`}
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {timeLeft === 0 ? '时间到' : formatTime(timeLeft)}
        </div>
      </div>

      <p className={`text-sm leading-relaxed mb-3 p-3 rounded-lg ${
        isFollowUp ? 'text-rose-800 bg-white/80 border border-rose-200 font-medium' : 'text-gray-700 bg-indigo-50'
      }`}>{payload.content}</p>

      {isLatest && !isAnswering && timeLeft > 0 && (
        <div className={`text-xs mt-2 flex items-center px-2 py-1.5 rounded ${
          isFollowUp ? 'text-rose-600 bg-rose-100/50' : 'text-gray-400 bg-gray-50'
        }`}>
          <svg
            className="w-3 h-3 mr-1 shrink-0"
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
          {isFollowUp ? '导师正在深挖你的漏洞，请认真作答！' : '按住麦克风或直接打字，开始作答后倒计时启动（最长 30 秒）'}
        </div>
      )}
    </div>
  );
};

// --- 评分卡片组件 ---
const EvaluationCardViewer: React.FC<{
  payload: EvaluationCardPayload;
  currentVulnerabilityTag?: string;
  onChooseQuestionType?: (type: 'same' | 'different' | 'end') => void;
  isLatest?: boolean;
  showActions?: boolean;
  isThinking?: boolean;
}> = ({ payload, currentVulnerabilityTag, onChooseQuestionType, isLatest, showActions, isThinking }) => {
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-500 border-emerald-200';
    if (score >= 60) return 'text-amber-500 border-amber-200';
    return 'text-rose-500 border-rose-200';
  };
  const scoreStyle = getScoreColor(payload.score);
  const [textCls, borderCls] = scoreStyle.split(' ');

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm mb-3">
      <div className="px-5 py-4 flex items-center gap-4">
        <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center shrink-0 bg-white ${borderCls} ${textCls}`}>
          <span className="text-lg font-bold">{payload.score}</span>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <MentorBadge mentorId={payload.mentorId} suffix="评分" />
            <span className={`text-sm font-semibold ${textCls}`}>{payload.level}</span>
          </div>
          <span className="text-xs text-gray-400 mt-1 truncate">
            {payload.emphasis || 'AI 答辩评分'}
          </span>
        </div>
      </div>

      <div className="px-5 pb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          {getMentor(payload.mentorId).name}点评
        </h4>
        <p className="text-sm text-gray-600 leading-relaxed bg-indigo-50/30 p-3 rounded-lg border border-gray-100">
          {payload.analysis}
        </p>

        {payload.improvements && payload.improvements.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">提升建议</h4>
            <ul className="space-y-1.5">
              {payload.improvements.map((item: string, idx: number) => (
                <li key={idx} className="flex items-start text-sm text-gray-500">
                  <span className="text-emerald-600 mr-2 mt-1 text-[10px] leading-none font-semibold">{idx + 1}</span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {payload.nextAction === 'follow_up' && (
          <div className="mt-4 text-xs text-rose-500 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg flex items-center">
            <svg
              className="w-3.5 h-3.5 mr-1.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            导师对你的回答不够满意，即将发起致命追问...
          </div>
        )}

        {onChooseQuestionType && currentVulnerabilityTag && isLatest && showActions && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">
              {isThinking ? 'AI 正在生成中，请稍候…' : '想继续练习还是结束？'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onChooseQuestionType('same')}
                disabled={isThinking}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-medium rounded-lg border border-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                继续同类
                <span className="text-[10px] opacity-50">#{currentVulnerabilityTag}</span>
              </button>
              <button
                onClick={() => onChooseQuestionType('different')}
                disabled={isThinking}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-600 text-xs font-medium rounded-lg border border-violet-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                换一种类型
              </button>
            </div>
            <button
              onClick={() => onChooseQuestionType('end')}
              disabled={isThinking}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-medium rounded-lg border border-rose-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              结束演练，生成报告
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- 核心分发器 ---
export const GenUIDispatcher: React.FC<{
  responses: GenUIResponse[];
  isAnswering?: boolean;
  isLatest?: boolean;
  currentVulnerabilityTag?: string;
  onChooseQuestionType?: (type: 'same' | 'different' | 'end') => void;
  onTypePick?: (vulnerabilityType: string) => void;
  showEvaluationActions?: boolean;
  onPracticeChoice?: (choice: 'practice' | 'skip') => void;
  isThinking?: boolean;
}> = ({ responses, isAnswering, isLatest, currentVulnerabilityTag, onChooseQuestionType, onTypePick, showEvaluationActions, onPracticeChoice, isThinking }) => {
  // 多人委员会会一次下发多张评分卡，操作按钮只挂在最后一张上
  const lastEvaluationIndex = responses.map((r) => r.type).lastIndexOf('evaluation_card');

  return (
    <div className="flex flex-col">
      {responses.map((res, index) => {
        switch (res.type) {
          case 'parsing_status':
            return <ParsingCard key={index} payload={res.payload as ParsingStatusPayload} />;
          case 'question_card':
            return (
              <QuestionCardViewer
                key={index}
                payload={res.payload as QuestionCardPayload}
                isAnswering={isAnswering}
                isLatest={isLatest}
              />
            );
          case 'evaluation_card':
            return (
              <EvaluationCardViewer
                key={index}
                payload={res.payload as EvaluationCardPayload}
                currentVulnerabilityTag={currentVulnerabilityTag}
                onChooseQuestionType={onChooseQuestionType}
                isLatest={isLatest && index === lastEvaluationIndex}
                showActions={showEvaluationActions}
                isThinking={isThinking}
              />
            );
          case 'review_card':
            return <ReviewCard key={index} payload={res.payload as ReviewCardPayload} />;
          case 'final_report':
            return <FinalReportCard key={index} payload={res.payload as FinalReportPayload} />;
          case 'generating_report':
            return <GeneratingReportCard key={index} payload={res.payload as GeneratingReportPayload} />;
          case 'type_picker':
            return onTypePick ? (
              <TypePickerCard
                key={index}
                payload={res.payload as TypePickerPayload}
                onPick={onTypePick}
                disabled={isThinking}
              />
            ) : null;
          case 'practice_choice':
            return onPracticeChoice ? (
              <PracticeChoiceCard key={index} onChoice={onPracticeChoice} />
            ) : null;
          case 'end_prompt':
            return onChooseQuestionType ? (
              <div key={index} className="mb-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-emerald-700">
                    三种类型你都已经练习过了，评分也不错，基本掌握了。是否结束演练？
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => onChooseQuestionType('end')}
                    disabled={isThinking}
                    className="flex-1 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    结束演练，生成报告
                  </button>
                  <button
                    onClick={() => onChooseQuestionType('same')}
                    disabled={isThinking}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    继续练习
                  </button>
                </div>
              </div>
            ) : null;
          case 'mentor_intro':
            return null;
          default:
            return null;
        }
      })}
    </div>
  );
};