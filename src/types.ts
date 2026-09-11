// ============================================================
// AI 答辩漏洞扫描器 - 类型定义
// 对应 PRD：《AI 答辩漏洞扫描器 (MVP 1.0)》
// ============================================================

// --- 1. GenUI 组件类型枚举 ---
// 对应 PRD 功能清单中的各类卡片
export type UIComponentType =
  | 'parsing_status' // 文档解析进度卡片 (P0 文档解析引擎)
  | 'mentor_intro' // 导师开场白气泡
  | 'question_card' // 常规施压提问卡片
  | 'high_pressure_question' // 致命提问卡片 (追问深挖)
  | 'evaluation_card' // AI 评分卡片
  | 'review_card' // 复盘卡片 (原话缺陷 + 标准话术)
  | 'final_report' // 最终综合报告（全部类型完成后）
  | 'generating_report' // 生成复盘报告中的进度卡片
  | 'type_picker' // 题型选择卡片（选择先回答哪种类型）
  | 'practice_choice' // 话术练习选择卡片
  | 'end_prompt'; // 包年用户掌握提示卡片

// --- 2. 导师人设 (压力模式切换 + 多人答辩委员会) ---
export type MentorPersonaId =
  | 'kind' // 慈祥博导
  | 'toxic' // 毒舌青椒
  | 'data' // 数据严师
  | 'industry' // 企业导师
  | 'skeptic' // 红队怀疑者
  | 'theory' // 理论派教授
  | 'chairman' // 答辩主席
  | 'peer'; // 同门学长

export type MentorTone = 'gentle' | 'sharp' | 'rigorous' | 'pragmatic';

export interface MentorPersona {
  id: MentorPersonaId;
  name: string;
  shortName: string; // 头像上的 1~2 个字
  title: string; // 身份头衔
  tagline: string; // 一句话风格
  tone: MentorTone;
  focus: string[]; // 主要追问维度
  description: string; // 选择卡片上的介绍
  systemPrompt: string; // 注入大模型的人设
  scoringEmphasis: string; // 评分侧重
  interjectStyle: string; // 插话/追问风格
  accent: {
    avatar: string; // 头像底色
    chip: string; // 标签底色+文字色
    border: string; // 卡片描边
    bar: string; // 左侧色条
    text: string; // 文字色
  };
}

export const MENTOR_PERSONAS: Record<MentorPersonaId, MentorPersona> = {
  kind: {
    id: 'kind',
    name: '慈祥博导',
    shortName: '博',
    title: '资深博士生导师',
    tagline: '温和引导，循序善诱',
    tone: 'gentle',
    focus: ['研究动机', '创新点', '整体贡献'],
    description: '提问语气友好，先肯定再追问，适合建立信心、打磨表达。',
    systemPrompt:
      '你是一位温和耐心的答辩导师——"慈祥博导"。你循序善诱、语气友好、以鼓励为主。' +
      '你会先肯定学生回答中站得住的部分，再指出缺口，并给出可执行的改进方向。' +
      '提问和点评都必须专业、有建设性，不讽刺、不人身攻击。',
    scoringEmphasis: '表达清晰度与自信心占更高权重，允许学生逐步完善，不因紧张而重罚。',
    interjectStyle: '用"老师再追问一句""你能不能再展开说说"温和地向前推进。',
    accent: {
      avatar: 'bg-emerald-500',
      chip: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      border: 'border-emerald-200',
      bar: 'bg-emerald-500',
      text: 'text-emerald-600',
    },
  },
  toxic: {
    id: 'toxic',
    name: '毒舌青椒',
    shortName: '毒',
    title: '青年副教授',
    tagline: '犀利挑剔，直击要害',
    tone: 'sharp',
    focus: ['逻辑漏洞', '证据链', '夸大表述'],
    description: '提问直白尖锐、不留情面，专挑论证断层下手，适合抗压训练。',
    systemPrompt:
      '你是一位犀利挑剔的答辩导师——"毒舌青椒"。你直白尖锐、不留情面、直击要害。' +
      '你会抓住回答里的模糊表述、因果跳跃和没有证据的断言，逼学生给出可核验的依据。' +
      '语气可以带刺，但内容必须专业、有建设性，绝不人身攻击或羞辱。',
    scoringEmphasis: '证据与逻辑权重最高，空话、套话和未经验证的断言会被明显扣分。',
    interjectStyle: '直接打断："等一下，你这句话的依据是什么？"',
    accent: {
      avatar: 'bg-rose-500',
      chip: 'bg-rose-50 text-rose-600 border-rose-100',
      border: 'border-rose-200',
      bar: 'bg-rose-500',
      text: 'text-rose-600',
    },
  },
  data: {
    id: 'data',
    name: '数据严师',
    shortName: '数',
    title: '实验方法专家',
    tagline: '拿数据说话，拒绝拍脑袋',
    tone: 'rigorous',
    focus: ['数据来源', '样本量', '统计显著性', '消融实验'],
    description: '只认数据：样本怎么来的、对照组在哪、指标是否显著、消融做了没有。',
    systemPrompt:
      '你是一位严谨的实验方法专家——"数据严师"。你只相信可核验的数据与规范的实验设计。' +
      '你关心数据来源、样本量与代表性、对照组与基线、评价指标的选择依据、统计显著性与误差分析、' +
      '消融实验是否充分、实验是否可复现。语气冷静克制，用数字和实验设计说话。',
    scoringEmphasis: '证据可靠性与实验设计权重最高；缺少对照、未报告方差或未做消融会显著扣分。',
    interjectStyle: '追问具体数字："这个 3.2% 的提升，方差是多少？做了几次重复实验？"',
    accent: {
      avatar: 'bg-sky-500',
      chip: 'bg-sky-50 text-sky-600 border-sky-100',
      border: 'border-sky-200',
      bar: 'bg-sky-500',
      text: 'text-sky-600',
    },
  },
  industry: {
    id: 'industry',
    name: '企业导师',
    shortName: '企',
    title: '产业界技术专家',
    tagline: '能不能落地，多少钱，多快',
    tone: 'pragmatic',
    focus: ['工程落地', '成本与性能', '部署运维', '商业化'],
    description: '从工程视角提问：延迟、成本、可维护性、真实场景，拒绝实验室玩具。',
    systemPrompt:
      '你是一位来自产业界的答辩导师——"企业导师"。你只关心这套东西能不能真正用起来。' +
      '你追问部署环境、推理时延、资源占用与硬件成本、数据隐私与合规、线上故障如何兜底、' +
      '团队接手维护的难度、以及在真实业务里到底值多少钱。务实、直接、不谈空泛的学术价值。',
    scoringEmphasis: '部署可行性与工程权衡权重最高，忽视成本、时延、运维的回答会被压低。',
    interjectStyle: '从真实场景切入："这套方案放到线上，QPS 上来之后怎么办？"',
    accent: {
      avatar: 'bg-amber-500',
      chip: 'bg-amber-50 text-amber-600 border-amber-100',
      border: 'border-amber-200',
      bar: 'bg-amber-500',
      text: 'text-amber-600',
    },
  },
  skeptic: {
    id: 'skeptic',
    name: '红队质疑者',
    shortName: '红',
    title: '学术红队评审',
    tagline: '凡事反过来问一句',
    tone: 'sharp',
    focus: ['反例构造', '适用边界', '失败案例', '鲁棒性'],
    description: '专门构造反例：什么情况下你的方法会失效？边界在哪里？',
    systemPrompt:
      '你是一位答辩场上的"红队质疑者"。你的职责是构造反例、逼近边界、找出会失效的场景。' +
      '你追问：这个方法在什么条件下不成立？输入稍微变化会怎样？最坏情况是什么？' +
      '有没有被刻意回避的失败案例？你不会为了质疑而质疑，每个反例都必须指向真实的技术风险。',
    scoringEmphasis: '边界意识与鲁棒性权重最高；主动承认适用边界的回答会得到加分。',
    interjectStyle: '抛出反例："如果输入是这种情况，你的方法还成立吗？"',
    accent: {
      avatar: 'bg-fuchsia-500',
      chip: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100',
      border: 'border-fuchsia-200',
      bar: 'bg-fuchsia-500',
      text: 'text-fuchsia-600',
    },
  },
  theory: {
    id: 'theory',
    name: '理论派教授',
    shortName: '理',
    title: '理论与数学方向教授',
    tagline: '公式、假设与推导',
    tone: 'rigorous',
    focus: ['数学推导', '前提假设', '复杂度', '收敛性'],
    description: '追问公式推导、前提假设、复杂度与收敛性，不放过任何跳步。',
    systemPrompt:
      '你是一位偏理论与数学的答辩教授——"理论派教授"。你关心形式化定义、推导过程、' +
      '前提假设是否成立、时间与空间复杂度、收敛性或正确性证明、以及结论的适用条件。' +
      '你不接受"跑出来效果不错"式的论证，要求把每一步推理讲清楚。表述精确、逻辑严密。',
    scoringEmphasis: '推理与技术理解权重最高；跳步、符号滥用、假设不成立会被严格扣分。',
    interjectStyle: '要求补全推导："这一步到这一步，中间的推导能写一下吗？"',
    accent: {
      avatar: 'bg-violet-500',
      chip: 'bg-violet-50 text-violet-600 border-violet-100',
      border: 'border-violet-200',
      bar: 'bg-violet-500',
      text: 'text-violet-600',
    },
  },
  chairman: {
    id: 'chairman',
    name: '答辩主席',
    shortName: '主',
    title: '答辩委员会主席',
    tagline: '把控全局与规范',
    tone: 'pragmatic',
    focus: ['结构完整性', '工作量', '规范性', '时间控制'],
    description: '把控整体：结构是否完整、工作量是否充实、表述是否规范、时间是否合理。',
    systemPrompt:
      '你是"答辩委员会主席"。你负责把控整场答辩的全局质量与规范。' +
      '你关心论文结构是否完整、工作量是否充实、图表与引用是否规范、' +
      '创新点是否被清楚陈述、以及学生能否在规定时间里把重点讲明白。' +
      '你会在其他评委深挖细节后做总结性追问，语气稳重、有权威感。',
    scoringEmphasis: '结构完整性与表达控制权重最高，顾左右而言他或严重超时会被扣分。',
    interjectStyle: '做总结性追问："请用一句话概括你最核心的贡献。"',
    accent: {
      avatar: 'bg-indigo-500',
      chip: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      border: 'border-indigo-200',
      bar: 'bg-indigo-500',
      text: 'text-indigo-600',
    },
  },
  peer: {
    id: 'peer',
    name: '同门学长',
    shortName: '学',
    title: '同课题组博士学长',
    tagline: '专问实现细节和踩过的坑',
    tone: 'gentle',
    focus: ['实现细节', '调参经验', '踩坑复盘', '工具链'],
    description: '像同学一样聊天，但专挑实现细节：代码怎么写的、参数怎么调的、坑怎么填的。',
    systemPrompt:
      '你是被答辩学生的同门学长——"同门学长"。你熟悉这个项目的一线实现细节。' +
      '你追问代码结构、关键模块怎么实现、超参数怎么调、训练崩过几次、踩过什么坑、' +
      '环境依赖和版本问题、以及论文里没写但实际很关键的操作。语气随意、接地气，' +
      '但问题非常具体，躲不过去。',
    scoringEmphasis: '真实实践经验权重最高；答不出实现细节或明显没自己动手会被看穿。',
    interjectStyle: '像聊天一样追问："这块代码你当时是怎么写的？我猜你是直接调库吧。"',
    accent: {
      avatar: 'bg-teal-500',
      chip: 'bg-teal-50 text-teal-600 border-teal-100',
      border: 'border-teal-200',
      bar: 'bg-teal-500',
      text: 'text-teal-600',
    },
  },
};

export const MENTOR_PERSONA_LIST: MentorPersona[] = Object.values(MENTOR_PERSONAS);

/** 答辩委员会：一次演练可由 1~4 位导师组成 */
export type MentorPanel = MentorPersona[];

export const MAX_PANEL_SIZE = 4;

export function getMentor(id?: MentorPersonaId | string | null): MentorPersona {
  return (id && MENTOR_PERSONAS[id as MentorPersonaId]) || MENTOR_PERSONAS.toxic;
}

/** 兼容旧代码：把任意入参归一成导师数组 */
export function resolveMentorIds(input: unknown): MentorPersonaId[] {
  if (Array.isArray(input)) {
    const ids: string[] = input
      .map((item) => (typeof item === 'string' ? item : (item as { id?: string })?.id))
      .filter((id): id is string => typeof id === 'string' && Boolean(id));
    const valid = ids.filter((id) => Boolean(MENTOR_PERSONAS[id as MentorPersonaId]));
    if (valid.length) return valid as MentorPersonaId[];
  }
  if (typeof input === 'string' && MENTOR_PERSONAS[input as MentorPersonaId]) {
    return [input as MentorPersonaId];
  }
  return ['toxic'];
}

// --- 3. GenUI 响应统一结构 ---
export interface GenUIResponse {
  type: UIComponentType;
  payload: any;
}

// --- 4. 文档解析进度卡片 payload (P0 文档解析引擎) ---
export interface ParsingStatusPayload {
  progress: number; // 0-100
  currentAction: string; // 当前解析动作描述
  mentorMessage: string; // 导师打字机气泡内容
  fileName?: string; // 上传的文件名
}

// --- 5. 常规提问卡片 payload (P0 漏洞施压提问) ---
export interface QuestionCardPayload {
  questionId: string;
  content: string; // 提问内容
  timeLimit: number; // 作答时间上限 (PRD: 最长 3 分钟 = 180s)
  hasHint: boolean; // 是否提供反击提示
  hint?: string; // 提示内容
  vulnerabilityTag?: string; // 提问类别标签（由 AI 分析文档后动态生成）
  questionIndex?: number; // 第几个问题 (1-3)
  totalQuestions?: number; // 共几个问题
  isFollowUp?: boolean; // 是否为导师追问（包月/包年用户专属）
  mentorId?: MentorPersonaId; // 提问的导师（多人答辩委员会）
  isInterjection?: boolean; // 是否为另一位导师的插话追问
}

// --- 6. 致命提问卡片 payload (P0 动态追问 - 深挖) ---
export interface HighPressureQuestionPayload {
  questionId: string;
  content: string;
  timeLimit: number;
  hasHint: boolean;
  hint?: string;
  triggerSnippet?: string; // 触发深挖的用户原话片段
  mentorId?: MentorPersonaId; // 追问的导师
}

// --- 7. 评分卡片 payload ---
export interface EvaluationCardPayload {
  score: number; // 0-100
  level: string; // 优秀/良好/需改进
  analysis: string; // 导师点评
  improvements: string[]; // 提升建议
  nextAction?: 'follow_up' | 'finish'; // 后续动作：追问 / 结束复盘
  mentorId?: MentorPersonaId; // 评分导师
  emphasis?: string; // 该导师的评分侧重
}

// --- 8. 复盘卡片 payload (P0 动态追问与复盘) ---
export interface ReviewCardPayload {
  originalTranscript: string; // 用户原话
  flawWords: string[]; // 有缺陷的关键词
  mentorCritique: string; // 导师点评
  goldenTemplate: string; // 满分话术模板
  vulnerabilityType?: string; // 漏洞分类
}

// --- 8.5 生成复盘报告进度卡片 payload ---
export interface GeneratingReportPayload {
  progress: number; // 0-100
  message: string; // 当前阶段文案
  detail?: string; // 辅助说明
}

// --- 9. 最终综合报告 payload（全部类型完成后生成） ---
export interface FinalReportPayload {
  typeCounts: Record<string, number>; // 各类型完成次数
  totalQuestions: number; // 总答题数
  totalDuration: number; // 总时长（秒）
  templates: Record<string, string>; // 各类型满分话术模板
  overallEvaluation: string; // 综合评价
  score: number; // 综合评分 0-100
  mentorName: string; // 导师名称
  personaId: string; // 导师人设 id
  mentorIds?: MentorPersonaId[]; // 参与本次演练的全部导师
  perMentorScores?: { mentorId: MentorPersonaId; name: string; score: number }[]; // 各导师给出的平均分
}

// --- 10. 题型选择卡片 payload ---
export interface TypePickerPayload {
  categories: string[]; // AI 分析文档后动态生成的分类列表
  typeCounts: Record<string, number>; // 各类型已出题数
  perTypeLimit: number; // 每种类型最多可出题数（根据订阅等级）
}

// --- 11. 话术练习选择卡片 payload ---
export interface PracticeChoicePayload {
  vulnerabilityTag?: string;
  onPractice: () => void; // 练习回调
  onSkip: () => void; // 不练习回调
}

// --- 11. 聊天消息结构 ---
export interface ChatMessage {
  role: 'ai' | 'user';
  content?: string; // 纯文本开场白
  components?: GenUIResponse[]; // GenUI 组件流
  timestamp?: number;
  mentorId?: MentorPersonaId; // 该条消息出自哪位导师（多人答辩委员会）
}

// --- 10. 历史记录项 (P2 错题本与历史归档) ---
export interface HistoryItem {
  id: string;
  title: string;
  date: string;
  personaId?: MentorPersonaId; // 当时演练使用的主要人设（兼容旧数据）
  mentorIds?: MentorPersonaId[]; // 当时参与演练的导师委员会
  reportCount?: number; // 该次演练的复盘报告数
}

// --- 11. 文件上传状态 ---
export type UploadStatus = 'idle' | 'uploading' | 'parsing' | 'ready' | 'error';

// --- 12. ASR 语音识别状态 (P0 ASR 语音强制交互) ---
export type ASRStatus = 'idle' | 'listening' | 'transcribing' | 'error';

// --- 13. 数据埋点事件 (PRD 第7章) ---
export type TrackingEvent =
  | 'btn_upload_click' // 上传按钮点击率
  | 'upload_success_rate' // 文件解析成功率
  | 'voice_input_duration' // 单次语音作答平均时长
  | 'complete_drill_rate' // 完整演练完播率 (北极星指标)
  | 'persona_switch' // 人设切换
  | 'user_question' // 用户自由提问 (非作答)
  | 'history_delete' // 删除历史记录
  | 'drill_start_click' // 用户点击"开始演练"按钮
  | 'drill_type_choice' // 用户选择"继续同类"或"换一种类型"
  | 'drill_exit' // 用户点击退出作答
  | 'template_practice_choice' // 用户选择练习/不练习话术
  | 'drill_follow_up'; // AI 追问（包月/包年用户专属）

// 极简埋点上报器 (前端 MVP，仅 console 输出 + 内存暂存)
export const track = (event: TrackingEvent, payload: Record<string, any> = {}): void => {
  const entry = { event, payload, ts: Date.now() };
  // MVP 阶段：仅控制台输出，后续可接入真实上报 SDK
  // eslint-disable-next-line no-console
  console.log('[tracking]', entry);
};

// --- 14. 演练阶段 ---
// idle: 新会话/未上传文档；parsing: 文档解析中；ready: 解析完成待用户开始；questioning: 作答中；evaluating: AI 评估中；reviewing: 演练结束复盘
export type DrillPhase = 'idle' | 'parsing' | 'ready' | 'questioning' | 'evaluating' | 'reviewing';

// --- 15. 订阅类型 ---
export type SubscriptionTier = 'free' | 'monthly' | 'yearly';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  expiresAt: string | null;
}

export interface UsageInfo {
  monthlyQuestionCount: number;
  monthlyResetDate: string | null;
  perTypeLimit: number;      // 每种类型最多几题
  monthlyLimit: number;      // 每月总上限（0 = 无限制）
}
