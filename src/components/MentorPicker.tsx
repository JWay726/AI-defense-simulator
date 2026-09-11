import { useState } from 'react';
import AIAvatar from './AIAvatar';
import {
  MENTOR_PERSONAS,
  MENTOR_PERSONA_LIST,
  MAX_PANEL_SIZE,
  type MentorPersonaId,
} from '../types';

// ============================================================
// 导师 / 答辩委员会选择器
// 单人陪练：选 1 位导师
// 多人实时答辩：选 2~4 位组成委员会，轮流提问、并发评分、互相插话
// ============================================================

interface MentorPickerProps {
  onConfirm: (ids: MentorPersonaId[]) => void;
  onCancel: () => void;
}

interface Preset {
  label: string;
  desc: string;
  ids: MentorPersonaId[];
}

const PRESETS: Preset[] = [
  { label: '单人抗压', desc: '毒舌青椒单独施压', ids: ['toxic'] },
  { label: '标准委员会', desc: '主席 + 毒舌 + 数据', ids: ['chairman', 'toxic', 'data'] },
  { label: '工程落地组', desc: '企业 + 理论 + 学长', ids: ['industry', 'theory', 'peer'] },
  { label: '全维度压力组', desc: '四位导师轮番轰炸', ids: ['toxic', 'data', 'industry', 'skeptic'] },
];

export default function MentorPicker({ onConfirm, onCancel }: MentorPickerProps) {
  const [selected, setSelected] = useState<MentorPersonaId[]>(['toxic']);

  const toggle = (id: MentorPersonaId) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        // 至少保留一位
        return prev.length === 1 ? prev : prev.filter((item) => item !== id);
      }
      if (prev.length >= MAX_PANEL_SIZE) return prev;
      return [...prev, id];
    });
  };

  const isPanel = selected.length > 1;

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">组建答辩委员会</h2>
        <p className="text-sm text-gray-500 mb-4">
          选 1 位导师做单人陪练，或选 2~{MAX_PANEL_SIZE} 位组成委员会——他们会轮流提问、同时打分，并在你回答后互相插话追问。
        </p>

        {/* 预设组合 */}
        <div className="mb-4">
          <p className="text-xs text-gray-400 mb-2">快速组合</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active =
                preset.ids.length === selected.length && preset.ids.every((id) => selected.includes(id));
              return (
                <button
                  key={preset.label}
                  onClick={() => setSelected(preset.ids)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {preset.label}
                  <span className={`ml-1.5 ${active ? 'text-indigo-100' : 'text-gray-400'}`}>{preset.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 导师卡片 */}
        <div className="grid grid-cols-2 gap-2.5">
          {MENTOR_PERSONA_LIST.map((p) => {
            const active = selected.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  active
                    ? `${p.accent.border} bg-white ring-2 ring-offset-1 ring-indigo-200 shadow-sm`
                    : 'border-gray-200 bg-gray-50/60 hover:border-gray-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <AIAvatar
                    mentorId={p.id}
                    size="md"
                    className={`shrink-0 ${!active ? 'opacity-60 grayscale-[0.25]' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 text-sm truncate">{p.name}</span>
                      {active && (
                        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">{p.title}</div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{p.description}</p>
                <div className="flex flex-wrap gap-1">
                  {p.focus.slice(0, 3).map((f) => (
                    <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded border ${p.accent.chip}`}>
                      {f}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* 底部操作区 */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              {selected.map((id) => {
                const p = MENTOR_PERSONAS[id];
                return (
                  <span key={id} className="-ml-1.5 first:ml-0" title={p.name}>
                    <AIAvatar mentorId={id} size="sm" className="ring-2 ring-white" />
                  </span>
                );
              })}
              <span className="ml-2 text-xs text-gray-500">
                已选 {selected.length} 位 ·{' '}
                {isPanel ? '多人实时答辩（并发评分 + 插话追问）' : '单人陪练'}
              </span>
            </div>
            {selected.length >= MAX_PANEL_SIZE && (
              <span className="text-[11px] text-amber-600">已达上限</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => onConfirm(selected)}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
            >
              {isPanel ? `开始 ${selected.length} 人答辩委员会` : '开始单人陪练'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
