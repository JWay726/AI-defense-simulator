import AIAvatar from './AIAvatar';
import { MENTOR_PERSONAS, type MentorPersonaId } from '../types';

// ============================================================
// 答辩委员会状态条
// 展示本次演练的导师阵容，并高亮"当前发言人"
// ============================================================

interface MentorPanelBarProps {
  mentorIds: MentorPersonaId[];
  /** 当前正在发言/提问的导师 */
  speakingId?: MentorPersonaId | string;
  compact?: boolean;
}

export default function MentorPanelBar({ mentorIds, speakingId, compact }: MentorPanelBarProps) {
  const members = mentorIds.map((id) => MENTOR_PERSONAS[id]).filter(Boolean);
  if (!members.length) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {members.map((m) => {
          const speaking = m.id === speakingId;
          return (
          <AIAvatar
            key={m.id}
            mentorId={m.id}
            size="sm"
            className={`ring-2 transition-all ${speaking ? 'ring-indigo-300 scale-110' : 'ring-white'}`}
          />
          );
        })}
        {members.length > 1 && (
          <span className="ml-1 text-[10px] text-gray-400">{members.length} 人委员会</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {members.map((m) => {
        const speaking = m.id === speakingId;
        return (
          <div
            key={m.id}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all ${
              speaking ? `${m.accent.chip} ${m.accent.border} shadow-sm` : 'bg-gray-50 border-gray-100'
            }`}
          >
            <AIAvatar mentorId={m.id} size="xs" className="shrink-0" />
            <span className={`text-xs ${speaking ? m.accent.text : 'text-gray-500'}`}>{m.name}</span>
            {speaking && (
              <span className="flex gap-0.5 ml-0.5" aria-label="正在发言">
                <span className="w-0.5 h-2 bg-current rounded-full animate-pulse" />
                <span className="w-0.5 h-3 bg-current rounded-full animate-pulse" />
                <span className="w-0.5 h-2 bg-current rounded-full animate-pulse" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
