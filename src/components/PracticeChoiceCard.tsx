import { useState } from 'react';

interface PracticeChoiceCardProps {
  onChoice: (choice: 'practice' | 'skip') => void;
}

// 话术练习选择卡片：练习 / 不练习 互斥，选后锁定
export const PracticeChoiceCard = ({ onChoice }: PracticeChoiceCardProps) => {
  const [chosen, setChosen] = useState<'practice' | 'skip' | null>(null);

  const handle = (choice: 'practice' | 'skip') => {
    if (chosen) return; // 已选择则锁定，不可再点
    setChosen(choice);
    onChoice(choice);
  };

  return (
    <div className="mb-3 bg-white border border-indigo-200 rounded-xl p-4 shadow-sm">
      <p className="text-sm text-gray-700 mb-3">需要练习这个话术吗？</p>
      <div className="flex gap-3">
        <button
          onClick={() => handle('practice')}
          disabled={chosen !== null}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            chosen === 'practice'
              ? 'bg-indigo-600 text-white'
              : chosen === null
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          练习话术
        </button>
        <button
          onClick={() => handle('skip')}
          disabled={chosen !== null}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            chosen === 'skip'
              ? 'bg-gray-400 text-white'
              : chosen === null
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          不练习
        </button>
      </div>
    </div>
  );
};

export default PracticeChoiceCard;
