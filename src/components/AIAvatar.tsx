import React from 'react';
import { getMentor, type MentorPersonaId } from '../types';

// ============================================================
// 统一 AI 风格头像
// 所有导师共用的机器人/AI 图标，背景色保留导师专属 accent，
// 在提问、评分等场景中既能一眼识别性格，又保持视觉统一。
// ============================================================

export type AIAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AIAvatarProps {
  /** 导师 id；为空或 generic=true 时显示通用 AI 头像 */
  mentorId?: MentorPersonaId | string;
  size?: AIAvatarSize;
  /** 是否显示通用 AI 头像（不采用导师配色） */
  generic?: boolean;
  className?: string;
  title?: string;
}

const SIZE_MAP: Record<AIAvatarSize, string> = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-14 h-14',
};

const ICON_SIZE_MAP: Record<AIAvatarSize, number> = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
};

/**
 * 通用 AI 机器人图标
 */
export const RobotIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <path d="M10 16h4" />
  </svg>
);

export default function AIAvatar({
  mentorId,
  size = 'md',
  generic = false,
  className = '',
  title,
}: AIAvatarProps) {
  const mentor = generic ? null : getMentor(mentorId);
  const bgClass = mentor?.accent?.avatar || 'bg-indigo-500';
  const sizeClass = SIZE_MAP[size];
  const iconSize = ICON_SIZE_MAP[size];
  const displayTitle = title || (mentor ? `${mentor.name} · ${mentor.tagline}` : 'AI 导师');

  return (
    <div
      className={`${sizeClass} rounded-full ${bgClass} text-white flex items-center justify-center shrink-0 ${className}`}
      title={displayTitle}
    >
      <RobotIcon size={iconSize} />
    </div>
  );
}

/**
 * 通用 AI 头像（不带导师配色，用于系统级消息/加载态）
 */
export function GenericAIAvatar({ size = 'md', className = '', title = 'AI 导师' }: Omit<AIAvatarProps, 'mentorId' | 'generic'>) {
  return (
    <div
      className={`${SIZE_MAP[size]} rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0 ${className}`}
      title={title}
    >
      <RobotIcon size={ICON_SIZE_MAP[size]} />
    </div>
  );
}
