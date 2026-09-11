import type { TypePickerPayload } from '../types';

// ============================================================
// 题型选择卡片
// 在 AI 聊天框中展示，让用户选择想先回答的类别
// 分类由 AI 分析文档后动态生成，不再写死类型
// ============================================================

interface TypePickerCardProps {
  payload: TypePickerPayload;
  onPick: (vulnerabilityType: string) => void;
  disabled?: boolean;
}

// 动态颜色轮转（6 色）
const CATEGORY_COLORS = [
  { accent: 'bg-amber-400', bg: 'bg-amber-50', border: 'border-amber-300', hoverBorder: 'hover:border-amber-400', badgeBg: 'bg-amber-100', badgeText: 'text-amber-600' },
  { accent: 'bg-rose-400', bg: 'bg-rose-50', border: 'border-rose-300', hoverBorder: 'hover:border-rose-400', badgeBg: 'bg-rose-100', badgeText: 'text-rose-600' },
  { accent: 'bg-violet-400', bg: 'bg-violet-50', border: 'border-violet-300', hoverBorder: 'hover:border-violet-400', badgeBg: 'bg-violet-100', badgeText: 'text-violet-600' },
  { accent: 'bg-emerald-400', bg: 'bg-emerald-50', border: 'border-emerald-300', hoverBorder: 'hover:border-emerald-400', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-600' },
  { accent: 'bg-sky-400', bg: 'bg-sky-50', border: 'border-sky-300', hoverBorder: 'hover:border-sky-400', badgeBg: 'bg-sky-100', badgeText: 'text-sky-600' },
  { accent: 'bg-fuchsia-400', bg: 'bg-fuchsia-50', border: 'border-fuchsia-300', hoverBorder: 'hover:border-fuchsia-400', badgeBg: 'bg-fuchsia-100', badgeText: 'text-fuchsia-600' },
];

function getColorForIndex(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export const TypePickerCard = ({ payload, onPick, disabled }: TypePickerCardProps) => {
  const { categories, typeCounts, perTypeLimit } = payload;
  const limitText = perTypeLimit === Infinity ? '不限次数' : `${perTypeLimit} 道题`;
  const maxCount = perTypeLimit === Infinity ? 999 : perTypeLimit;

  if (!categories || categories.length === 0) {
    return (
      <div className="w-full bg-white border border-indigo-50 rounded-2xl overflow-hidden">
        <div className="px-5 py-4">
          <p className="text-sm text-gray-500">文档解析完成，但未识别到具体提问类别。请上传包含更多内容的文档。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white border border-indigo-50 rounded-2xl overflow-hidden">
      <div className="px-5 py-4">
        <p className="text-sm font-semibold text-indigo-600">
          请选择你想先回答的提问方向
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {disabled
            ? 'AI 正在生成题目，请稍候…'
            : `AI 根据你的文档内容分析了以下 ${categories.length} 个提问方向，每种类型最多 ${limitText}`}
        </p>
      </div>
      <div className="px-4 pb-4 space-y-2">
        {categories.map((tag, index) => {
          const config = getColorForIndex(index);
          const count = typeCounts[tag] || 0;
          const exhausted = count >= maxCount;

          const isDisabled = exhausted || disabled;

          return (
            <button
              key={tag}
              onClick={() => !isDisabled && onPick(tag)}
              disabled={isDisabled}
              className={`w-full flex items-stretch text-left rounded-xl overflow-hidden transition-colors ${
                isDisabled
                  ? 'bg-gray-100 cursor-not-allowed opacity-70'
                  : `${config.bg} border ${config.border} ${config.hoverBorder} cursor-pointer`
              }`}
            >
              <span
                className={`block w-1 shrink-0 rounded-l-xl ${
                  exhausted ? 'bg-gray-300' : config.accent
                }`}
              />
              <span className="flex-1 flex items-center justify-between px-3 py-2.5 min-w-0">
                <span className="min-w-0">
                  <span className={`text-sm font-medium ${exhausted ? 'text-gray-400' : 'text-gray-800'}`}>
                    {tag}
                  </span>
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ml-3 shrink-0 ${
                    exhausted
                      ? 'bg-gray-200 text-gray-400'
                      : `${config.badgeBg} ${config.badgeText}`
                  }`}
                >
                  {exhausted ? '已用尽' : perTypeLimit === Infinity ? `${count} 次` : `${count}/${perTypeLimit}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TypePickerCard;