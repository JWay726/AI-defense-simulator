import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GenUIDispatcher } from './components/GenUIDispatcher';
import SettingsPage from './components/SettingsPage';
import AdminPanel from './components/AdminPanel';
import MentorPicker from './components/MentorPicker';
import MentorPanelBar from './components/MentorPanelBar';
import AIAvatar, { GenericAIAvatar } from './components/AIAvatar';
import { api, setToken, startOcrJob, getOcrStatus, cancelOcrJob } from './api';
import { extractTextFromFile, looksLikeBinaryGarbage, type ExtractResult } from './utils/extractText';
import {
  parseDocument,
  generateQuestionByType,
  evaluateAnswer,
  evaluateAnswerByPanel,
  generateFollowUp,
  generateInterjection,
  pickInterjector,
  pickNextSpeaker,
  setMentorPanel,
  generateTemplate,
  generateTypeReport,
  generateFinalReport,
  answerUserQuestion,
} from './deepseek';
import {
  MENTOR_PERSONAS,
  getMentor,
  resolveMentorIds,
  track,
  type MentorPersona,
  type MentorPersonaId,
  type ChatMessage,
  type HistoryItem,
  type ASRStatus,
  type DrillPhase,
  type ParsingStatusPayload,
  type QuestionCardPayload,
  type EvaluationCardPayload,
  type TypePickerPayload,
  type SubscriptionInfo,
} from './types';

// ============================================================
// Web Speech API ASR Hook（浏览器原生语音识别，免费但依赖 Google 服务）
// 对应 PRD P0: ASR 语音强制交互
// 使用浏览器内置 Web Speech API 实现实时语音识别
// ============================================================
const useASR = (onResult: (text: string) => void) => {
  const [status, setStatus] = useState<ASRStatus>('idle');
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef('');
  const asrErrorRef = useRef(false);
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTextRef.current += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(finalTextRef.current + interim);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      asrErrorRef.current = true;
      if (event.error === 'network') {
        setStatus('error');
        setErrorMessage('语音识别服务不可用，请使用文字输入');
      } else if (event.error === 'not-allowed') {
        setStatus('error');
        setErrorMessage('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问');
      } else if (event.error === 'no-speech') {
        setStatus('error');
        setErrorMessage('未检测到语音，请靠近麦克风再试');
      } else {
        setStatus('error');
        setErrorMessage('语音识别出错，请使用文字输入');
      }
    };

    recognition.onend = () => {
      if (!asrErrorRef.current) {
        setStatus('idle');
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognition.abort(); } catch {}
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    finalTextRef.current = '';
    setInterimText('');
    setErrorMessage(null);
    asrErrorRef.current = false;
    setStatus('listening');
    try {
      recognitionRef.current.start();
    } catch {
      // 可能已经在运行中
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {}
    const text = finalTextRef.current.trim();
    setInterimText('');
    setStatus('idle');
    asrErrorRef.current = false;
    if (text) {
      onResult(text);
    }
  }, [onResult]);

  const dismissError = useCallback(() => {
    setErrorMessage(null);
    setStatus('idle');
    asrErrorRef.current = false;
  }, []);

  return { status, interimText, isSupported, errorMessage, start, stop, dismissError };
};

// ============================================================
// 主 App 组件
// ============================================================

// --- 初始默认数据 ---
const initialHistory: HistoryItem[] = [];

const initialSessionsData: Record<string, ChatMessage[]> = {};

export default function App() {
  // --- 认证与登录状态 ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [currentUser, setCurrentUser] = useState({ name: '', avatar: '' });
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  // 管理员面板
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  // 当前视图：chat 或 settings
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat');
  // 订阅信息
  const [subscription, setSubscription] = useState<SubscriptionInfo>({ tier: 'free', expiresAt: null });
  const [monthlyQuestionCount, setMonthlyQuestionCount] = useState(0);

  // --- 表单输入状态 ---
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // --- 聊天与交互状态 ---
  const [activeSessionId, setActiveSessionId] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  // 长耗时 AI 操作的具体提示文字（生成问题、生成报告等）
  const [loadingMessage, setLoadingMessage] = useState('分析中...');

  // --- 核心数据状态 ---
  const [historyList, setHistoryList] = useState<HistoryItem[]>(initialHistory);
  const [chatRecords, setChatRecords] = useState<Record<string, ChatMessage[]>>(initialSessionsData);

  // --- PRD 新增状态 ---
  // 压力模式切换 + 多人答辩委员会：一次演练可由 1~4 位导师组成
  const [activeMentorIds, setActiveMentorIds] = useState<MentorPersonaId[]>(['toxic']);
  // 委员会轮流提问的轮次指针
  const speakerRoundRef = useRef(0);
  // P0: 文档上传 - 文件输入引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  // submitAnswer 的 ref，避免 handleASRResult 闭包过期导致评分写入幽灵会话
  const submitAnswerRef = useRef<(answer: string) => void>(() => {});
  // P0: 演练阶段状态机
  const [drillPhase, setDrillPhase] = useState<DrillPhase>('idle');
  // 当前演练的问题队列（一次生成3个）
  const [questionQueue, setQuestionQueue] = useState<QuestionCardPayload[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  // 降级：浏览器不支持 ASR 时允许文字输入（已统一为始终可用文字输入，保留状态以备扩展）
  const [inputText, setInputText] = useState('');
  // 用户自由提问时 AI 思考中
  const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);
  // 演练开始时间（埋点用）
  const drillStartTimeRef = useRef<number>(0);
  // 删除历史记录的两步确认：记录待确认删除的会话 ID
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 当前作答题目的漏洞类型（用于"继续同类/换一种类型"选择）
  const currentVulnerabilityTagRef = useRef<string>('');
  // 取消自动流程标志（用户点击选择按钮后，阻止追问/下一题/结束的自动触发）
  const cancelAutoFlowRef = useRef(false);
  // 防止重复生成问题
  const generatingQuestionRef = useRef(false);
  // 连续追问计数
  const followUpCountRef = useRef(0);
  // 包年用户“是否结束”已提示标记
  const yearlyEndPromptedRef = useRef(false);
  // 评分卡按钮是否可操作（仅最新评分卡且无未回答问题时可操作）
  const [evaluationActionPending, setEvaluationActionPending] = useState(false);
  // 退出作答对话框
  const [showExitDialog, setShowExitDialog] = useState(false);
  // 结束演练确认对话框
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  // 各类型已出题次数（上限根据订阅等级动态变化）
  const [categories, setCategories] = useState<string[]>([]);
  // 根据 categories 动态构建 typeQuestionCounts
  const buildTypeCounts = (cats: string[]) => {
    const counts: Record<string, number> = {};
    cats.forEach((c) => { counts[c] = 0; });
    return counts;
  };
  const [typeQuestionCounts, setTypeQuestionCounts] = useState<Record<string, number>>({});
  // 当前正在作答的漏洞类型
  const [activeVulnerabilityType, setActiveVulnerabilityType] = useState<string>('');
  // 新建会话前的人设选择模态框
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  // 待创建会话的解析信息（解析完成后暂存，等用户选择题型后按需生成问题）
  const [pendingParsedInfo, setPendingParsedInfo] = useState<{
    fileName: string;
    pageCount: number;
    wordCount: number;
    categories: string[];
  } | null>(null);
  // 持久保存最近一次解析结果，供"不练习话术后重新弹出题型选择"时恢复
  const parsedInfoRef = useRef<{
    fileName: string;
    pageCount: number;
    wordCount: number;
    categories: string[];
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentMessages = chatRecords[activeSessionId] || [];

  // 由选中的导师 id 推导出答辩委员会
  const activePanel: MentorPersona[] = activeMentorIds.map((id) => getMentor(id));
  const activePersona: MentorPersona = activePanel[0];
  const activePersonaId = activePersona.id;
  const isPanelMode = activePanel.length > 1;

  // 委员会变化时同步给 AI 层（用于并发评分与插话）
  useEffect(() => {
    setMentorPanel(activePanel.length ? activePanel : [MENTOR_PERSONAS.toxic]);
  }, [activeMentorIds.join(',')]);

  // 当前发言人：最近一道题目的提问导师
  const currentSpeakerId = (() => {
    for (let i = currentMessages.length - 1; i >= 0; i -= 1) {
      const msg = currentMessages[i];
      const comps = msg?.components;
      if (comps) {
        for (const comp of comps) {
          if (
            (comp.type === 'question_card' || comp.type === 'high_pressure_question') &&
            comp.payload?.mentorId
          ) {
            return comp.payload.mentorId as MentorPersonaId;
          }
        }
      }
      if (msg?.mentorId) return msg.mentorId;
    }
    return undefined;
  })();

  // 根据订阅类型获取限制
  const getPerTypeLimit = () => {
    if (subscription.tier === 'yearly') return Infinity;
    if (subscription.tier === 'monthly') return 5;
    return 3;
  };
  const getMonthlyLimit = () => {
    if (subscription.tier === 'yearly') return 0; // 0 = 无限制
    if (subscription.tier === 'monthly') return 100;
    return 50;
  };

  // --- ASR Hook ---
  const handleASRResult = useCallback((text: string) => {
    setInputText(text);
    setDrillPhase('evaluating');
    setIsEvaluating(true);
    // 埋点：单次语音作答时长
    track('voice_input_duration', { chars: text.length });
    // 自动提交（通过 ref 调用最新的 submitAnswer，避免闭包过期）
    setTimeout(() => submitAnswerRef.current(text), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    status: asrStatus,
    interimText,
    errorMessage: asrError,
    isSupported,
    start: startASR,
    stop: stopASR,
    dismissError: dismissASRError,
  } = useASR(handleASRResult);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, isEvaluating, isAnsweringQuestion]);

  // --- 自动保存聊天记录到后端（防抖 800ms） ---
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!activeSessionId || !isLoggedIn) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const msgs = chatRecords[activeSessionId];
      if (msgs && msgs.length > 0) {
        const title = historyList.find((h) => h.id === activeSessionId)?.title || '';
        api.saveChatHistory(activeSessionId, msgs, title).catch(() => {});
      }
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [chatRecords, activeSessionId, isLoggedIn, historyList]);

  // --- 认证逻辑 ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) return;
    setAuthError('');
    setAuthLoading(true);
    try {
      const result = isRegisterMode
        ? await api.register(usernameInput.trim(), passwordInput.trim())
        : await api.login(usernameInput.trim(), passwordInput.trim());
      setToken(result.token);
      setCurrentUser({ name: result.user.username, avatar: result.user.avatar });
      setIsAdmin(!!result.user.isAdmin);
      setIsLoggedIn(true);
      // 加载订阅和用量信息
      if (result.user.subscription) {
        setSubscription(result.user.subscription);
      }
      try {
        const usage = await api.getUsage();
        setMonthlyQuestionCount(usage.monthlyQuestionCount || 0);
      } catch { /* 忽略 */ }
      // 登录后加载历史聊天记录
      if (!isRegisterMode) {
        try {
          const { sessions } = await api.listChatSessions();
          if (sessions && sessions.length > 0) {
            const historyItems: HistoryItem[] = sessions.map((s: any) => ({
              id: s.session_id,
              title: s.title || '未命名会话',
              personaId: 'toxic',
            }));
            setHistoryList(historyItems);
            const records: Record<string, ChatMessage[]> = {};
            for (const s of sessions) {
              try {
                const { messages } = await api.loadChatHistory(s.session_id);
                records[s.session_id] = messages || [];
              } catch { /* 跳过加载失败的会话 */ }
            }
            setChatRecords(records);
            // 自动选中最近的会话
            if (sessions.length > 0) {
              setActiveSessionId(sessions[0].session_id);
            }
          } else {
            setShowPersonaPicker(true);
          }
        } catch {
          // 加载失败，显示人设选择器
          if (historyList.length === 0) {
            setShowPersonaPicker(true);
          }
        }
      } else {
        setShowPersonaPicker(true);
      }
    } catch (err: any) {
      setAuthError(err.message || '操作失败，请检查网络连接');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    // 退出前保存当前会话
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (activeSessionId && isLoggedIn) {
      const msgs = chatRecords[activeSessionId];
      if (msgs && msgs.length > 0) {
        const title = historyList.find((h) => h.id === activeSessionId)?.title || '';
        api.saveChatHistory(activeSessionId, msgs, title).catch(() => {});
      }
    }
    setToken('');
    setIsLoggedIn(false);
    setIsAdmin(false);
    setCurrentUser({ name: '', avatar: '' });
    setUsernameInput('');
    setPasswordInput('');
    setAuthError('');
    // 清理所有会话状态
    setChatRecords({});
    setActiveSessionId('');
    setHistoryList([]);
    setDrillPhase('idle');
    setTypeQuestionCounts({});
    setCategories([]);
    setEvaluationActionPending(false);
    setSubscription({ tier: 'free', expiresAt: null });
    setMonthlyQuestionCount(0);
    setCurrentView('chat');
    setQuestionQueue([]);
    setCurrentQuestionIdx(0);
    setIsEvaluating(false);
    setPendingParsedInfo(null);
    setShowEndConfirm(false);
    setShowExitDialog(false);
    setShowAdminPanel(false);
    cancelAutoFlowRef.current = false;
    currentVulnerabilityTagRef.current = '';
    followUpCountRef.current = 0;
    yearlyEndPromptedRef.current = false;
  };

  // 用户资料更新回调
  const handleUpdateProfile = async (data: { username?: string; avatar?: string }) => {
    const result = await api.updateProfile(data);
    setCurrentUser({ name: result.user.username, avatar: result.user.avatar });
  };

  const handleChangePassword = async (oldPassword: string, newPassword: string) => {
    await api.changePassword(oldPassword, newPassword);
  };

  // --- 新建答辩演练：先弹出人设选择，选定后创建会话 ---
  const handleNewSession = () => {
    setShowPersonaPicker(true);
  };

  // 选定导师（可多选组成答辩委员会）后真正创建会话（创建后不可更换）
  const handleCreateSessionWithPersona = (mentorIds: MentorPersonaId[]) => {
    const ids: MentorPersonaId[] = mentorIds.length ? mentorIds : ['toxic'];
    const persona = getMentor(ids[0]);
    const newSessionId = Date.now().toString();
    const newHistoryItem: HistoryItem = {
      id: newSessionId,
      title: '新答辩演练',
      date: '刚刚',
      personaId: persona.id,
      mentorIds: ids,
      reportCount: 0,
    };
    const panel = ids.map((id) => getMentor(id));
    const mentorIntro = panel.length > 1
      ? `本次答辩委员会由 ${panel.map((p) => p.name).join('、')} ${panel.length} 位导师组成，我们会轮流提问、并发打分，并在你回答后互相插话追问。`
      : `我是你的${persona.name}（${persona.tagline}）。`;

    setHistoryList((prev) => [newHistoryItem, ...prev]);
    setChatRecords((prev) => ({
      ...prev,
      [newSessionId]: [
        {
          role: 'ai',
          content: subscription.tier === 'free'
            ? `Hi，${currentUser.name}！${mentorIntro}\n\n📌 接下来你可以：\n• 点击左下角 📎 上传 PPT / PDF / 扫描件 / 图片，我将逐页分析并找出可提问的方向\n• 在下方输入框向我提问\n\n💡 文档分析完成后，AI 会根据文档内容自动生成提问分类，请选择你想先回答的方向。\n\n🔓 升级包月/包年订阅，可解锁 AI 总结同类提问方式（包月 5 条，包年 10 条）。`
            : `Hi，${currentUser.name}！${mentorIntro}\n\n📌 接下来你可以：\n• 点击左下角 📎 上传 PPT / PDF / 扫描件 / 图片，我将逐页分析并找出可提问的方向\n• 在下方输入框向我提问，例如「帮我总结一下这类问题的类似提问方式」\n\n💡 文档分析完成后，AI 会根据文档内容自动生成提问分类，请选择你想先回答的方向，每种方向最多 ${subscription.tier === 'yearly' ? '不限次数' : '5 道题'}。\n\n✨ AI 可为你总结同类型类似提问方式（${subscription.tier === 'yearly' ? '10 条' : '5 条'}），随时向我提问即可。`,
        },
      ],
    }));
    setActiveMentorIds(ids);
    setMentorPanel(panel);
    speakerRoundRef.current = 0;
    setActiveSessionId(newSessionId);
    setDrillPhase('idle');
    setQuestionQueue([]);
    setCurrentQuestionIdx(0);
    setPendingParsedInfo(null);
    setShowPersonaPicker(false);
    setActiveVulnerabilityType('');
    const emptyCounts = buildTypeCounts(categories);
    setTypeQuestionCounts(emptyCounts);
    setEvaluationActionPending(false);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // --- 切换会话：同步人设，并按最后一条消息推断演练阶段 ---
  const handleSelectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    const item = historyList.find((h) => h.id === sessionId);
    const restored = resolveMentorIds(item?.mentorIds?.length ? item.mentorIds : item?.personaId);
    setActiveMentorIds(restored);
    setMentorPanel(restored.map((id) => getMentor(id)));
    speakerRoundRef.current = 0;
    // 如果该会话的聊天记录未加载，尝试从后端加载
    let msgs = chatRecords[sessionId];
    if (!msgs || msgs.length === 0) {
      try {
        const { messages } = await api.loadChatHistory(sessionId);
        if (messages && messages.length > 0) {
          msgs = messages;
          setChatRecords((prev) => ({ ...prev, [sessionId]: messages }));
        }
      } catch { /* 忽略 */ }
    }
    msgs = msgs || [];
    // 根据该会话最后一条消息推断 drillPhase
    const lastMsg = msgs[msgs.length - 1];
    let phase: DrillPhase = 'idle';
    if (lastMsg?.role === 'ai' && lastMsg.components) {
      const types = lastMsg.components.map((c) => c.type);
      if (types.includes('review_card')) phase = 'reviewing';
      else if (types.includes('question_card') || types.includes('high_pressure_question'))
        phase = 'questioning';
      else if (types.includes('parsing_status')) {
        // 根据进度判断是解析中还是已就绪
        const parsingComp = lastMsg.components.find((c) => c.type === 'parsing_status');
        const progress = (parsingComp?.payload as ParsingStatusPayload)?.progress ?? 100;
        phase = progress < 100 ? 'parsing' : 'ready';
      }
    }
    setDrillPhase(phase);
    setQuestionQueue([]);
    setCurrentQuestionIdx(0);
    setPendingParsedInfo(null);
    setActiveVulnerabilityType('');
    const emptyCounts = buildTypeCounts(categories);
    setTypeQuestionCounts(emptyCounts);
    setEvaluationActionPending(false);
    setIsSidebarOpen(false);
  };

  // --- 删除历史记录（两步内联确认，避免 window.confirm 在 iframe 沙箱中被拦截） ---
  const handleDeleteHistory = (historyId: string) => {
    // 第一步：标记为待确认
    if (pendingDeleteId !== historyId) {
      setPendingDeleteId(historyId);
      // 清除之前的 timer
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
      }
      // 3 秒后自动取消确认状态
      deleteConfirmTimerRef.current = setTimeout(() => {
        setPendingDeleteId(null);
        deleteConfirmTimerRef.current = null;
      }, 3000);
      return;
    }

    // 第二步：执行真删除
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }
    setPendingDeleteId(null);

    const target = historyList.find((h) => h.id === historyId);
    if (!target) return;
    track('history_delete', { historyId, title: target.title });

    setHistoryList((prev) => prev.filter((h) => h.id !== historyId));
    setChatRecords((prev) => {
      const next = { ...prev };
      delete next[historyId];
      return next;
    });
    // 同步删除后端记录
    api.deleteChatSession(historyId).catch(() => {});

    // 若删除的是当前活动会话，切换到剩余的第一个；无剩余则新建空会话
    if (activeSessionId === historyId) {
      const remaining = historyList.filter((h) => h.id !== historyId);
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
        setDrillPhase('idle');
        setQuestionQueue([]);
        setCurrentQuestionIdx(0);
        setPendingParsedInfo(null);
        setActiveVulnerabilityType('');
        const emptyCounts = buildTypeCounts(categories);
        setTypeQuestionCounts(emptyCounts);
      } else {
        // 没有历史了，直接回到人设选择
        setShowPersonaPicker(true);
        setActiveSessionId('');
      }
    }
  };

  // --- OCR：扫描件 PDF / 图片版 PPT / 纯图片 ---
  // 后端异步任务 + 前端轮询，把真实进度回写到解析卡片
  const runOcrFlow = async (file: File): Promise<string | null> => {
    let jobId = '';
    try {
      const buffer = await file.arrayBuffer();
      jobId = await startOcrJob(file.name, buffer);
    } catch (err: any) {
      updateLastParsingProgress(
        0,
        'OCR 启动失败',
        `无法启动 OCR 识别：${err?.message || '请确认后端服务已启动'}。`,
      );
      return null;
    }

    const result = await new Promise<{ text: string } | null>((resolve) => {
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts += 1;
        try {
          const status = await getOcrStatus(jobId);
          if (status.status === 'done' && status.result?.text) {
            clearInterval(timer);
            resolve({ text: status.result.text });
            return;
          }
          if (status.status === 'error') {
            clearInterval(timer);
            resolve(null);
            return;
          }
          updateLastParsingProgress(
            Math.max(8, Math.min(96, Math.round(status.progress || 10))),
            status.message || '正在识别扫描内容…',
          );
        } catch {
          // 单次轮询失败不中断，继续重试
        }
        if (attempts > 900) {
          clearInterval(timer);
          resolve(null);
        }
      }, 700);
    });

    await cancelOcrJob(jobId);
    return result?.text?.trim() ? result.text : null;
  };

  // --- P0: 文档上传与解析（含 OCR 兜底） ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 埋点：上传按钮点击
    track('btn_upload_click', { fileName: file.name, size: file.size });
    setDrillPhase('parsing');
    drillStartTimeRef.current = Date.now();
    // 清空 input 以便重复上传同一文件
    e.target.value = '';

    // 先给出解析卡片，后续所有阶段（含 OCR 进度）都复用它
    appendAIMessage([
      {
        type: 'parsing_status',
        payload: {
          progress: 12,
          currentAction: '正在读取文档...',
          mentorMessage: `收到你的《${file.name}》，让我逐页翻一翻，找找逻辑漏洞。`,
          fileName: file.name,
        },
      },
    ]);

    // 提取文本内容（PDF 走 pdfjs，PPTX 走 slide XML，其余纯文本直接读取）
    let extractResult: ExtractResult = { text: '', method: 'none' };
    try {
      extractResult = await extractTextFromFile(file);
    } catch (err) {
      console.warn('无法读取文件文本内容，将退化为无正文解析', err);
    }
    let textContent = extractResult.text || '';
    let usedOcr = false;

    // 没有文字层 → 自动转 OCR（扫描件 / 图片版 PPT / 图片）
    if ((!textContent.trim() || looksLikeBinaryGarbage(textContent)) && extractResult.needOCR) {
      usedOcr = true;
      updateLastParsingProgress(
        20,
        '未检测到文字层，正在启动 OCR 识别…',
        '这份材料里没有文字层，应该是扫描件或图片版。我改用 OCR 逐页识别，稍等一下。',
      );
      const ocrText = await runOcrFlow(file);
      if (!ocrText) {
        setDrillPhase('idle');
        replaceLastAIMessage([
          {
            type: 'parsing_status',
            payload: {
              progress: 0,
              currentAction: 'OCR 识别失败',
              mentorMessage:
                `OCR 没能从这份材料中识别出文字。\n${extractResult.error ? `诊断信息：${extractResult.error}\n` : ''}\n可能原因：\n1. 图片分辨率过低或拍摄倾斜、反光；\n2. 手写体或艺术字，识别困难；\n3. 后端 OCR 引擎未就绪。\n\n建议：换一张更清晰的扫描图，或改用文字版 PDF / .docx / .pptx。`,
              fileName: file.name,
            },
          },
        ]);
        track('upload_success_rate', { success: false, reason: 'ocr_failed', fileName: file.name });
        return;
      }
      textContent = ocrText;
      updateLastParsingProgress(96, 'OCR 识别完成，正在整理文本…', '识别完成，正在把扫描内容整理成可分析的正文。');
      track('upload_success_rate', { success: true, method: 'ocr', fileName: file.name });
    }

    // 若提取结果为空或像 PDF 二进制乱码，直接报错，不再把乱码传给 DeepSeek
    const isUnreadable = !textContent.trim() || looksLikeBinaryGarbage(textContent);
    if (isUnreadable) {
      setDrillPhase('idle');
      const diagnostic = extractResult.error
        ? `诊断信息：${extractResult.error}\n`
        : textContent.trim()
          ? `诊断信息：提取到 ${textContent.length} 个字符，但内容不可读（可能是二进制乱码）。\n`
          : '诊断信息：未提取到任何文本。\n';
      replaceLastAIMessage([
        {
          type: 'parsing_status',
          payload: {
            progress: 0,
            currentAction: '文档解析失败',
            mentorMessage:
              `无法从该文件中提取可读文本。\n${diagnostic}\n常见原因：\n1. 浏览器缓存了旧代码，请按 Ctrl+F5（笔记本需按 Fn+Ctrl+F5）或 Ctrl+Shift+R 强制刷新后重试；\n2. 扫描件/图片版材料需要后端 OCR 支持，请确认后端服务已启动（默认 http://localhost:3001）；\n3. 文件损坏或受密码保护。\n\n你可以先换一份 .txt/.md 或普通文字版 PDF 测试。`,
            fileName: file.name,
          },
        },
      ]);
      track('upload_success_rate', { success: false, reason: 'unreadable', fileName: file.name });
      return;
    }

    updateLastParsingProgress(
      30,
      usedOcr ? 'OCR 文本已就绪，正在分析内容…' : '正在按页码分块提取文本...',
    );

    // 阶段2: 解析中（按页码分块）
    setTimeout(() => {
      updateLastParsingProgress(55, '正在按页码分块提取文本...');
    }, 1200);

    setTimeout(() => {
      updateLastParsingProgress(85, '正在识别逻辑漏洞与论证断层...');
    }, 2400);

    // 阶段3: 调用 DeepSeek 解析文档，进入 ready 阶段
    setTimeout(async () => {
      try {
        // 传入 textContent 强绑定真实文档事实
        const parsed = await parseDocument(file.name, activePersona, textContent);
        // 埋点：解析成功率
        track('upload_success_rate', { success: true, ...parsed });

        // 保存 AI 分析出的分类并初始化计数
        const cats = parsed.categories || [];
        setCategories(cats);
        setTypeQuestionCounts(buildTypeCounts(cats));

        // 暂存解析结果，等用户选择题型后按需生成问题
        const parsedInfo = { fileName: file.name, ...parsed };
        parsedInfoRef.current = parsedInfo;
        setPendingParsedInfo(parsedInfo);

        // 替换最后一条 AI 消息为：解析完成提示
        replaceLastAIMessage([
          {
            type: 'parsing_status',
            payload: {
              progress: 100,
              currentAction: `解析完成：共 ${parsed.pageCount} 页，${parsed.wordCount} 字`,
              mentorMessage: `文档解析完毕，AI 根据内容识别出 ${cats.length} 个提问方向。\n\n请在下方选择你想先从哪个方向开始作答，每种方向最多 ${subscription.tier === 'yearly' ? '不限次数' : subscription.tier === 'monthly' ? '5 道题' : '3 道题'}。`,
              fileName: file.name,
            },
          },
        ]);

        setDrillPhase('ready');
        const initialCounts = buildTypeCounts(cats);
        setTypeQuestionCounts(initialCounts);
        appendAIMessage([
          {
            type: 'type_picker',
            payload: { categories: cats, typeCounts: initialCounts, perTypeLimit: getPerTypeLimit() },
          },
        ]);
        // 更新侧边栏标题
        setHistoryList((prev) =>
          prev.map((item) =>
            item.id === activeSessionId ? { ...item, title: file.name.replace(/\.[^.]+$/, '') } : item,
          ),
        );
      } catch (err: any) {
        replaceLastAIMessage([
          {
            type: 'parsing_status',
            payload: {
              progress: 0,
              currentAction: '解析失败',
              mentorMessage: `文档解析出错：${err.message || '请重试'}`,
              fileName: file.name,
            },
          },
        ]);
        setDrillPhase('idle');
      }
    }, 3600);

    // 清空 input 以便重复上传同一文件
    e.target.value = '';
  };

  // --- 在聊天中追加题型选择卡片 ---
  const appendTypePickerMessage = () => {
    const payload: TypePickerPayload = { categories, typeCounts: { ...typeQuestionCounts }, perTypeLimit: getPerTypeLimit() };
    appendAIMessage([{ type: 'type_picker', payload }]);
  };

  // --- 用户选择题型：生成该类型的第一道题 ---
  const handleTypePick = async (vulnerabilityType: string) => {
    if (!pendingParsedInfo) return;
    if (generatingQuestionRef.current) return;
    const perTypeLimit = getPerTypeLimit();
    const monthlyLimit = getMonthlyLimit();

    // 检查该类型是否已用尽
    if ((typeQuestionCounts[vulnerabilityType] || 0) >= perTypeLimit) return;
    // 检查月上限
    if (monthlyLimit > 0 && monthlyQuestionCount >= monthlyLimit) {
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          { role: 'ai' as const, content: monthlyLimit === 50 ? '本月提问次数已用完（免费用户每月最多 50 次）。请前往个人中心升级订阅即可解锁更多次数。' : '本月提问次数已用完（包月用户每月最多 100 次）。升级到包年即可无限提问。' },
        ],
      }));
      return;
    }

    generatingQuestionRef.current = true;
    setIsEvaluating(true);
    setLoadingMessage('正在生成题目，请稍候...');
    const fileName = pendingParsedInfo.fileName;
    // 立即清除 pendingParsedInfo，防止重复触发
    setPendingParsedInfo(null);

    const count = (typeQuestionCounts[vulnerabilityType] || 0) + 1;
    let newQuestion: QuestionCardPayload;
    try {
      // 委员会轮流提问：按轮次挑选本道题的主问导师
      const speaker = pickNextSpeaker(vulnerabilityType, undefined, speakerRoundRef.current);
      speakerRoundRef.current += 1;
      newQuestion = await generateQuestionByType(speaker, vulnerabilityType, count);
    } catch (err: any) {
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          { role: 'ai' as const, content: `生成问题失败：${err.message || '请重试'}` },
        ],
      }));
      setIsEvaluating(false);
      setLoadingMessage('分析中...');
      generatingQuestionRef.current = false;
      return;
    }

    setTypeQuestionCounts((prev) => ({ ...prev, [vulnerabilityType]: count }));
    setActiveVulnerabilityType(vulnerabilityType);
    currentVulnerabilityTagRef.current = vulnerabilityType;
    setQuestionQueue([newQuestion]);
    setCurrentQuestionIdx(0);
    drillStartTimeRef.current = Date.now();
    setEvaluationActionPending(false);
    followUpCountRef.current = 0;

    // 增加使用计数
    setMonthlyQuestionCount((prev) => prev + 1);
    api.incrementUsage().catch(() => {});

    appendAIMessage([{ type: 'question_card', payload: newQuestion }]);
    setDrillPhase('questioning');
    setIsEvaluating(false);
    setLoadingMessage('分析中...');

    track('drill_start_click', {
      fileName,
      type: vulnerabilityType,
      questionCount: count,
    });

    generatingQuestionRef.current = false;
  };

  // --- 工具函数：追加/替换 AI 消息 ---
  const appendAIMessage = (components: ChatMessage['components']) => {
    setChatRecords((prev) => ({
      ...prev,
      [activeSessionId]: [...(prev[activeSessionId] || []), { role: 'ai', components }],
    }));
  };

  const updateLastParsingProgress = (progress: number, action: string, mentorMessage?: string) => {
    setChatRecords((prev) => {
      const msgs = [...(prev[activeSessionId] || [])];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'ai' && last.components && last.components[0]?.type === 'parsing_status') {
        const newComponents = [...last.components];
        newComponents[0] = {
          ...newComponents[0],
          payload: {
            ...newComponents[0].payload,
            progress,
            currentAction: action,
            ...(mentorMessage ? { mentorMessage } : {}),
          },
        };
        msgs[msgs.length - 1] = { ...last, components: newComponents };
      }
      return { ...prev, [activeSessionId]: msgs };
    });
  };

  const replaceLastAIMessage = (components: ChatMessage['components']) => {
    setChatRecords((prev) => {
      const msgs = [...(prev[activeSessionId] || [])];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { role: 'ai', components };
      }
      return { ...prev, [activeSessionId]: msgs };
    });
  };

  // --- 工具函数：最终复盘报告生成（带进度条）---
  const generateFinalReportWithProgress = async (
    counts: Record<string, number>,
    panel: MentorPersona[],
    startTime: number,
  ) => {
    setIsEvaluating(true);
    setLoadingMessage('正在生成复盘报告，请稍后…');
    setDrillPhase('reviewing');

    // 先插入生成中卡片
    appendAIMessage([
      {
        type: 'generating_report',
        payload: {
          progress: 0,
          message: '正在生成复盘报告…',
          detail: '汇总各导师评分与作答记录',
        },
      },
    ]);

    const stages = [
      { progress: 25, detail: '整理历次作答与评分数据', delay: 600 },
      { progress: 55, detail: '综合各导师点评与改进建议', delay: 700 },
      { progress: 80, detail: '生成综合评价与可执行建议', delay: 600 },
      { progress: 100, detail: '即将完成', delay: 500 },
    ];

    for (const stage of stages) {
      await new Promise((resolve) => setTimeout(resolve, stage.delay));
      setChatRecords((prev) => {
        const msgs = [...(prev[activeSessionId] || [])];
        const lastIdx = msgs.length - 1;
        const last = msgs[lastIdx];
        if (
          last &&
          last.role === 'ai' &&
          last.components &&
          last.components[0]?.type === 'generating_report'
        ) {
          const newComponents = [...last.components];
          newComponents[0] = {
            ...newComponents[0],
            payload: {
              ...newComponents[0].payload,
              progress: stage.progress,
              message: '正在生成复盘报告…',
              detail: stage.detail,
            },
          };
          msgs[lastIdx] = { ...last, components: newComponents };
        }
        return { ...prev, [activeSessionId]: msgs };
      });
    }

    try {
      const finalReport = await generateFinalReport(counts, panel, startTime);
      replaceLastAIMessage([{ type: 'final_report', payload: finalReport }]);
    } catch (err: any) {
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          { role: 'ai' as const, content: `生成报告失败：${err.message || '请重试'}` },
        ],
      }));
    } finally {
      setIsEvaluating(false);
      setLoadingMessage('分析中…');
    }
  };

  // --- P0: 提交答案 + AI 评估 + 决策（追问/下一题/结束）---
  const submitAnswer = async (answer: string) => {
    if (!answer.trim()) {
      setIsEvaluating(false);
      setDrillPhase('questioning');
      return;
    }

    // 追加用户消息
    setChatRecords((prev) => ({
      ...prev,
      [activeSessionId]: [...(prev[activeSessionId] || []), { role: 'user', content: answer }],
    }));
    setInputText('');
    setIsEvaluating(true);
    setLoadingMessage('正在评估作答，请稍后…');
    setDrillPhase('evaluating');

    try {
      const currentQ = questionQueue[currentQuestionIdx];
      // 记录当前题目漏洞类型，供"继续同类/换一种类型"选择使用
      currentVulnerabilityTagRef.current = currentQ?.vulnerabilityTag || '';
      
      if (!currentQ) throw new Error('未能获取到当前题目的上下文。');

      // 多人答辩委员会：每位导师并发独立打分；单人模式保持原逻辑
      const evaluations: EvaluationCardPayload[] = isPanelMode
        ? await evaluateAnswerByPanel(answer, activePanel, currentQ)
        : [await evaluateAnswer(answer, activePersona, currentQ)];

      // 以最严格（最低）的评分作为是否继续追问的依据
      const evaluation =
        evaluations.length > 1
          ? evaluations.reduce((lowest, item) => (item.score < lowest.score ? item : lowest), evaluations[0])
          : evaluations[0];

      // 追加评分卡，同时恢复作答状态，等待用户选择
      const messages: any[] = evaluations.map((item) => ({ type: 'evaluation_card', payload: item }));
      let hasFollowUp = false;

      // 包月/包年用户：低分（<65）同步给出追问；高分则重置追问计数
      if (subscription.tier !== 'free' && evaluation.score < 65) {
        followUpCountRef.current += 1;

        // 连续追问 3 次仍低分：生成话术模板，询问是否练习
        if (followUpCountRef.current >= 3) {
          hasFollowUp = true;
          const currentCount = followUpCountRef.current;
          const template = await generateTemplate(currentQ, activePersona);
          setChatRecords((prev) => ({
            ...prev,
            [activeSessionId]: [
              ...(prev[activeSessionId] || []),
              { role: 'ai', content: `你已经连续被追问 ${currentCount} 次了，看来这个类型的问题还需要加强。以下是对"${currentQ.vulnerabilityTag || '该类型'}"的标准回答话术：\n\n${template}` },
            ],
          }));
          appendAIMessage([{
            type: 'practice_choice',
            payload: { vulnerabilityTag: currentQ.vulnerabilityTag, onPractice: () => {}, onSkip: () => {} },
          }]);
          followUpCountRef.current = 0;
        } else {
          hasFollowUp = true;
          const asker = getMentor(currentQ.mentorId);
          // 委员会模式下由「另一位导师」插话，单人模式则由本人追问
          const interjector = isPanelMode ? pickInterjector(evaluations, currentQ.mentorId) : null;
          const followUp = interjector
            ? await generateInterjection(answer, interjector, currentQ, asker, followUpCountRef.current)
            : await generateFollowUp(
                answer,
                activePersona,
                currentQ.vulnerabilityTag || '数据来源不明',
                followUpCountRef.current,
                currentQ.content || '',
              );
          setQuestionQueue([followUp]);
          setCurrentQuestionIdx(0);
          messages.push({ type: 'question_card', payload: followUp });
          track('drill_follow_up', {
            tier: subscription.tier,
            tag: currentQ.vulnerabilityTag,
            interjector: interjector?.id || null,
          });
        }
      } else {
        // 高分回答，重置追问计数
        followUpCountRef.current = 0;
      }

      // 包年用户：所有类型均 ≥5 次，且当前没有追问待回答，AI 告知已掌握，询问是否结束（仅提示一次）
      if (
        subscription.tier === 'yearly' &&
        !yearlyEndPromptedRef.current &&
        !hasFollowUp &&
        categories.length > 0 &&
        categories.every((tag) => (typeQuestionCounts[tag] || 0) >= 5)
      ) {
        yearlyEndPromptedRef.current = true;
        messages.push({ type: 'end_prompt', payload: {} });
      }

      appendAIMessage(messages);
      setDrillPhase('questioning');
      setIsEvaluating(false);
      setEvaluationActionPending(!hasFollowUp);
    } catch (err: any) {
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          { role: 'ai', content: `评估失败：${err.message || '请重试'}` },
        ],
      }));
      setIsEvaluating(false);
      setDrillPhase('questioning');
      setEvaluationActionPending(false);
    }
  };
  // 同步 ref，确保 handleASRResult（useCallback 空依赖）始终调用最新的 submitAnswer
  submitAnswerRef.current = submitAnswer;

  // --- 题型选择：继续同类 / 换一种类型 / 结束演练 ---
  const handleChooseQuestionType = async (choice: 'same' | 'different' | 'end') => {
    // 防止重复点击导致多次生成问题
    if (generatingQuestionRef.current) return;
    // 无论选择什么，评分卡按钮已消费，关闭操作状态
    setEvaluationActionPending(false);
    cancelAutoFlowRef.current = true;
    followUpCountRef.current = 0;

    // 结束演练：弹出确认对话框，提醒用户无法继续回答
    if (choice === 'end') {
      setShowEndConfirm(true);
      return;
    }

    generatingQuestionRef.current = true;
    setIsEvaluating(true);
    setLoadingMessage('正在生成题目，请稍候...');

    const currentTag = activeVulnerabilityType || currentVulnerabilityTagRef.current;
    const allTags = categories.length > 0 ? categories : ['数据来源不明', '因果强加', '前提条件缺失'];
    const perTypeLimit = getPerTypeLimit();
    const monthlyLimit = getMonthlyLimit();

    let targetTag: string;
    if (choice === 'same') {
      targetTag = currentTag || '数据来源不明';
    } else {
      // 换一种类型：排除当前类型，优先选未用尽的
      const otherTags = allTags.filter((t) => t !== currentTag && (typeQuestionCounts[t] || 0) < perTypeLimit);
      if (otherTags.length === 0) {
        // 所有其他类型都已用尽或达上限
        const allExhausted = allTags.every((t) => (typeQuestionCounts[t] || 0) >= perTypeLimit);
        if (allExhausted || (monthlyLimit > 0 && monthlyQuestionCount >= monthlyLimit)) {
          // 全部用尽或达月上限，生成最终综合报告（带进度条）
          cancelAutoFlowRef.current = true;
          generatingQuestionRef.current = false;
          await generateFinalReportWithProgress(
            typeQuestionCounts,
            activePanel,
            drillStartTimeRef.current,
          );
          track('complete_drill_rate', {
            totalQuestions: Object.values(typeQuestionCounts).reduce((a, b) => a + b, 0),
          });
          return;
        }
        targetTag = allTags.find((t) => (typeQuestionCounts[t] || 0) < perTypeLimit) || allTags[0];
      } else {
        targetTag = otherTags[Math.floor(Math.random() * otherTags.length)];
      }
    }

    // 阻止自动流程（追问/下一题/结束），由用户选择接管
    cancelAutoFlowRef.current = true;

    const count = (typeQuestionCounts[targetTag] || 0) + 1;

    // 如果同类型且已达上限，生成该类型报告并回到题型选择
    if (choice === 'same' && count > perTypeLimit) {
      setLoadingMessage('正在生成类型报告，请稍候...');
      try {
        const report = await generateTypeReport(targetTag, activePersona);
        setChatRecords((prev) => ({
          ...prev,
          [activeSessionId]: [
            ...(prev[activeSessionId] || []),
            { role: 'ai', content: report },
          ],
        }));
      } catch (err: any) {
        setChatRecords((prev) => ({
          ...prev,
          [activeSessionId]: [
            ...(prev[activeSessionId] || []),
            { role: 'ai', content: `生成报告失败：${err.message || '请重试'}` },
          ],
        }));
      }
      // 更新计数（标记为用尽）
      const updatedCounts = { ...typeQuestionCounts, [targetTag]: count };
      const trulyAllExhausted = allTags.every((t) => (updatedCounts[t] || 0) >= perTypeLimit);
      setTypeQuestionCounts(updatedCounts);

      if (trulyAllExhausted) {
        // 全部用尽，生成最终综合报告（带进度条）
        await generateFinalReportWithProgress(
          updatedCounts,
          activePanel,
          drillStartTimeRef.current,
        );
        track('complete_drill_rate', {
          totalQuestions: Object.values(updatedCounts).reduce((a, b) => a + b, 0),
        });
      } else {
        // 还有未用尽的类型，显示题型选择卡片
        appendTypePickerMessage();
        setDrillPhase('ready');
      }
      setIsEvaluating(false);
      setLoadingMessage('分析中...');
      generatingQuestionRef.current = false;
      return;
    }

    // 正常生成新题目
    let newQuestion: QuestionCardPayload;
    try {
      // 委员会轮流提问：避免与上一位提问导师重复
      const lastSpeaker = questionQueue[currentQuestionIdx]?.mentorId;
      const speaker = pickNextSpeaker(targetTag, lastSpeaker, speakerRoundRef.current);
      speakerRoundRef.current += 1;
      newQuestion = await generateQuestionByType(speaker, targetTag, count);
    } catch (err: any) {
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          { role: 'ai', content: `生成问题失败：${err.message || '请重试'}` },
        ],
      }));
      setIsEvaluating(false);
      setLoadingMessage('分析中...');
      generatingQuestionRef.current = false;
      return;
    }

    setTypeQuestionCounts((prev) => ({ ...prev, [targetTag]: count }));
    setActiveVulnerabilityType(targetTag);
    currentVulnerabilityTagRef.current = targetTag;
    setQuestionQueue([newQuestion]);
    setCurrentQuestionIdx(0);

    // 增加使用计数
    setMonthlyQuestionCount((prev) => prev + 1);
    api.incrementUsage().catch(() => {});

    appendAIMessage([{ type: 'question_card', payload: newQuestion }]);
    setDrillPhase('questioning');
    setIsEvaluating(false);
    setLoadingMessage('分析中...');
    generatingQuestionRef.current = false;

    track('drill_type_choice', { choice, targetTag, count, fromTag: currentTag });
  };

  // --- 退出作答按钮 ---
  const handleExitAnswer = () => {
    setShowExitDialog(true);
  };

  // 退出对话框选择：不会回答 / 直接退出
  const handleExitChoice = async (choice: 'dont_know' | 'quit') => {
    setShowExitDialog(false);
    setEvaluationActionPending(false);

    if (choice === 'quit') {
      // 直接退出：结束演练并生成复盘报告（带进度条）
      setQuestionQueue([]);
      setCurrentQuestionIdx(0);
      cancelAutoFlowRef.current = true;
      await generateFinalReportWithProgress(
        typeQuestionCounts,
        activePanel,
        drillStartTimeRef.current,
      );
      track('drill_exit', { reason: 'quit' });
      return;
    }

    // 不会回答：生成话术模板
    const currentQ = questionQueue[currentQuestionIdx];
    if (!currentQ) {
      setIsEvaluating(false);
      setDrillPhase('questioning');
      return;
    }

    setLoadingMessage('正在生成标准话术模板，请稍后…');
    try {
      const template = await generateTemplate(currentQ, activePersona);
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          { role: 'ai', content: template },
        ],
      }));
    } catch (err: any) {
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          { role: 'ai', content: `生成话术失败：${err.message || '请重试'}` },
        ],
      }));
    }
    // 显示"是否练习"询问（内联卡片）
    appendAIMessage([{
      type: 'practice_choice',
      payload: { vulnerabilityTag: currentQ.vulnerabilityTag, onPractice: () => {}, onSkip: () => {} },
    }]);
    setIsEvaluating(false);
    setDrillPhase('questioning');
    track('drill_exit', { reason: 'dont_know', tag: currentQ.vulnerabilityTag });
  };

  // 话术练习询问：练习 / 不练习
  const handleTemplatePracticeChoice = (choice: 'practice' | 'skip') => {
    setEvaluationActionPending(false);

    if (choice === 'practice') {
      // 用户选择练习：追加鼓励消息
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          {
            role: 'ai',
            content:
              activePersonaId === 'toxic'
                ? '好，那就照着模板练一遍。别光背，要理解逻辑。按住麦克风开始。'
                : '好的，请参考上面的模板，用自己的话复述一遍。按住麦克风或直接打字开始练习吧。',
          },
        ],
      }));
    } else {
      // 不练习：回到题型选择器，不生成报告
      // 恢复 pendingParsedInfo（首题生成后会被清空），否则题型卡片点击无反应
      if (parsedInfoRef.current) {
        setPendingParsedInfo(parsedInfoRef.current);
      }
      appendTypePickerMessage();
    }
    track('template_practice_choice', { choice });
  };

  // --- P0: 按住麦克风 ASR 作答 (Web Speech API) ---
  const handleMicPointerDown = () => {
    if (isEvaluating || drillPhase !== 'questioning') return;
    startASR();
  };

  const handleMicPointerUp = () => {
    if (asrStatus === 'listening') {
      stopASR();
    }
  };

  // --- 用户自由提问 (非作答阶段的文字输入) ---
  const handleUserQuestion = async (question: string) => {
    if (!question.trim()) return;
    // 埋点
    track('user_question', { question });
    // 追加用户消息
    setChatRecords((prev) => ({
      ...prev,
      [activeSessionId]: [...(prev[activeSessionId] || []), { role: 'user', content: question }],
    }));
    setInputText('');
    setIsAnsweringQuestion(true);

    try {
      const currentQ = questionQueue[currentQuestionIdx];
      const answer = await answerUserQuestion(question, activePersona, currentQ, subscription.tier);
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [...(prev[activeSessionId] || []), { role: 'ai', content: answer }],
      }));
    } catch (err: any) {
      setChatRecords((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          { role: 'ai', content: `抱歉，回答失败：${err.message || '请重试'}` },
        ],
      }));
    }
    setIsAnsweringQuestion(false);
  };

  // --- 统一文字发送：questioning 阶段作答，其他阶段提问 ---
  const handleSendText = () => {
    if (!inputText.trim() || isEvaluating || isAnsweringQuestion) return;
    if (drillPhase === 'questioning') {
      // 作答
      setDrillPhase('evaluating');
      setIsEvaluating(true);
      setTimeout(() => submitAnswer(inputText.trim()), 100);
    } else {
      // 自由提问
      handleUserQuestion(inputText.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // --- P1: 人设已改为创建会话时选择并锁定，不再支持会话内切换 ---

  // ==========================================
  // 渲染：登录/注册 界面
  // ==========================================
  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#fafafa] font-sans px-4">
        <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" x2="12" y1="19" y2="22"></line>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight mb-1">AI 答辩模拟器</h1>
            <p className="text-sm text-gray-500">
              {isRegisterMode ? '创建您的专属演练账号' : '登录以访问你的演练记录'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authError && (
              <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{authError}</p>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">用户名</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="请输入您的用户名"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">密码</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={isRegisterMode ? '请设置您的密码' : '请输入密码'}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all text-sm"
                required
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-indigo-600 text-white font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
            >
              {authLoading ? (isRegisterMode ? '注册中...' : '登录中...') : (isRegisterMode ? '注册新账号' : '登录系统')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            {isRegisterMode ? '已有账号？' : '还没有账号？'}
            <button
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setUsernameInput('');
                setPasswordInput('');
              }}
              className="ml-1 text-indigo-600 hover:text-indigo-700 font-medium hover:underline transition-all"
            >
              {isRegisterMode ? '立即登录' : '免费注册'}
            </button>
          </div>

          <p className="mt-6 text-[10px] text-gray-400 text-center leading-relaxed border-t border-gray-100 pt-4">
            本系统仅供答辩演练使用，不保证查重与学术原创性
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // 渲染：主业务界面 (已登录)
  // ==========================================
  const isListening = asrStatus === 'listening';

  return (
    <div className="flex h-screen bg-white font-sans text-gray-800 overflow-hidden relative">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 左侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-100 h-full flex flex-col shrink-0 transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        } md:relative md:translate-x-0 md:shadow-none`}
      >
        <div className="p-4 border-b border-gray-100">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" x2="12" y1="5" y2="19"></line>
              <line x1="5" x2="19" y1="12" y2="12"></line>
            </svg>
            新建答辩演练
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 px-2 mt-2">历史记录</div>
          {historyList.map((item) => {
            const mentors = resolveMentorIds(
              item.mentorIds?.length ? item.mentorIds : item.personaId,
            ).map((id) => getMentor(id));
            return (
              <div
                key={item.id}
                className={`group relative flex items-center rounded-lg transition-colors ${
                  activeSessionId === item.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
              >
                <button
                  onClick={() => handleSelectSession(item.id)}
                  className={`flex-1 flex flex-col text-left px-3 py-2 rounded-lg transition-colors min-w-0 ${
                    activeSessionId === item.id ? 'text-indigo-600' : 'text-gray-600'
                  }`}
                >
                  <span className="text-sm font-medium truncate pr-6">{item.title}</span>
                  <span className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    {mentors.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        {mentors.slice(0, 3).map((m) => (
                          <AIAvatar key={m.id} mentorId={m.id} size="xs" title={m.name} />
                        ))}
                        <span>
                          {mentors.length > 1 ? `${mentors.length} 人委员会` : mentors[0].name}
                        </span>
                      </span>
                    )}
                    <span>{item.date}</span>
                    {item.reportCount ? <span className="text-gray-500">·{item.reportCount}份复盘</span> : null}
                  </span>
                </button>
                {/* 删除按钮 */}
                <button
                  onClick={() => handleDeleteHistory(item.id)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                    pendingDeleteId === item.id
                      ? 'bg-red-500 text-white opacity-100'
                      : 'text-gray-400 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100'
                  }`}
                  title={pendingDeleteId === item.id ? '再次点击确认删除' : '删除该记录'}
                >
                  {pendingDeleteId === item.id ? (
                    '确认删除？'
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" x2="10" y1="11" y2="17"></line>
                      <line x1="14" x2="14" y1="11" y2="17"></line>
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3 overflow-hidden">
            <button
              onClick={() => setCurrentView('settings')}
              className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-medium text-xs shrink-0 hover:ring-2 hover:ring-indigo-300 transition-all"
              title="个人设置"
            >
              {currentUser.avatar}
            </button>
            <span className="text-sm font-medium text-gray-700 truncate">{currentUser.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(true)}
                className="text-amber-500 hover:text-amber-600 hover:bg-amber-50 p-1.5 rounded-md transition-colors"
                title="管理员面板"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md transition-colors"
              title="退出登录"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" x2="9" y1="12" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* 主聊天区 */}
      {currentView === 'chat' && (
      <main className="flex flex-col flex-1 h-full min-w-0 bg-white relative">
        <header className="flex items-center justify-between h-12 px-5 bg-white border-b border-gray-100 shrink-0 gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
          <h1 className="text-sm font-medium text-gray-500 mx-auto md:mx-0 truncate px-2 flex-1 text-center md:text-left">
            {historyList.find((h) => h.id === activeSessionId)?.title || 'AI 答辩漏洞扫描器'}
          </h1>

          {/* 答辩委员会徽章 */}
          {activeSessionId && historyList.find((h) => h.id === activeSessionId)?.personaId && (
            <div className="shrink-0 hidden sm:block">
              <MentorPanelBar mentorIds={activeMentorIds} speakingId={currentSpeakerId} />
            </div>
          )}
        </header>

        {/* 动态聊天记录区 */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full max-w-3xl mx-auto space-y-5">
          {currentMessages.length > 0 ? (
            currentMessages.map((message, index) => {
              const isLatestMessage = index === currentMessages.length - 1;
              return (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {/* AI 消息气泡 */}
                  {message.role === 'ai' && (
                    <div className="flex items-start gap-3 w-full">
                      {(() => {
                        // 只有提问/评分类卡片才展示对应性格导师头像，
                        // 其他系统消息统一显示通用 AI 头像
                        const hasMentorCard = message.components?.some(
                          (c) => c.type === 'question_card' || c.type === 'evaluation_card',
                        );
                        const mentorComponent = message.components?.find(
                          (c) => c.type === 'question_card' || c.type === 'evaluation_card',
                        );
                        const speakerId = hasMentorCard
                          ? (mentorComponent?.payload as QuestionCardPayload | EvaluationCardPayload)?.mentorId
                            || message.mentorId
                            || currentSpeakerId
                          : null;
                        if (hasMentorCard && speakerId) {
                          return <AIAvatar mentorId={speakerId} size="sm" className="mt-1" />;
                        }
                        return <GenericAIAvatar size="sm" className="mt-1" />;
                      })()}
                      <div className="flex-1 min-w-0">
                        {message.content && (
                          <div className="bg-white border border-indigo-50 px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap text-gray-700 w-fit max-w-[85%]">
                            {typeof message.content === 'string'
                              ? message.content
                              : `[非文本内容] ${JSON.stringify(message.content)}`}
                          </div>
                        )}
                        {message.components && (
                          <GenUIDispatcher
                            responses={message.components}
                            isAnswering={drillPhase === 'questioning' && asrStatus === 'listening'}
                            isLatest={isLatestMessage}
                            currentVulnerabilityTag={currentVulnerabilityTagRef.current}
                            onChooseQuestionType={handleChooseQuestionType}
                            onTypePick={handleTypePick}
                            showEvaluationActions={evaluationActionPending}
                            onPracticeChoice={handleTemplatePracticeChoice}
                            isThinking={isEvaluating}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* 用户消息气泡 */}
                  {message.role === 'user' && (
                    <div className="flex items-start gap-3 max-w-[85%] flex-row-reverse">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-medium shrink-0 text-xs">
                        {currentUser.avatar}
                      </div>
                      <div className="bg-indigo-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap">
                        {typeof message.content === 'string'
                          ? message.content
                          : `[非文本内容] ${JSON.stringify(message.content)}`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              点击左上角"新建答辩演练"开始
            </div>
          )}

          {/* AI 思考加载动画 */}
          {(isEvaluating || isAnsweringQuestion) && (
            <div className="flex items-start gap-3 w-full">
              <GenericAIAvatar size="sm" className="mt-1" />
              <div className="bg-gray-50 text-gray-400 px-4 py-3 rounded-2xl rounded-tl-sm text-sm flex items-center gap-2 w-fit">
                <span className="flex space-x-1">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                  <span
                    className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0.2s' }}
                  ></span>
                  <span
                    className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0.4s' }}
                  ></span>
                </span>
                {isAnsweringQuestion
                  ? '正在生成回复，请稍后…'
                  : loadingMessage}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 底部输入区 */}
        <footer className="bg-white px-4 pb-4 pt-2 shrink-0 border-t border-gray-100">
          <div className="max-w-3xl mx-auto">
            {/* ASR 实时识别文字展示 */}
            {isListening && (
              <div className="mb-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 flex items-center gap-2">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
                正在聆听：{interimText || '...'}
              </div>
            )}

            {/* ASR 错误提示 */}
            {asrError && (
              <div className="mb-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="flex-1">{asrError}</span>
                <button onClick={dismissASRError} className="text-amber-500 hover:text-amber-700 shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* 退出作答按钮 */}
            {drillPhase === 'questioning' && (
              <div className="mb-2 flex justify-center">
                <button
                  onClick={handleExitAnswer}
                  disabled={isEvaluating || isListening}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  不想回答？退出作答
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* 文件上传按钮 */}
              <label
                className="cursor-pointer p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors flex shrink-0"
                title="上传 PPT / PDF / Word / 扫描件 / 图片（无文字层自动 OCR）"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".ppt,.pptx,.pdf,.doc,.docx,.txt,.md,image/png,image/jpeg,image/jpg,image/bmp,image/tiff,image/webp"
                  onChange={handleFileUpload}
                  disabled={!activeSessionId || drillPhase === 'parsing' || drillPhase === 'evaluating'}
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
              </label>

              {/* 主体：统一文字输入框 + 麦克风 */}
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl flex items-center pl-4 pr-2 py-1 min-h-11 focus-within:ring-1 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 focus-within:bg-white transition-all">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isListening
                      ? '正在识别语音...'
                      : drillPhase === 'questioning'
                        ? '输入回答，或按住麦克风语音作答'
                        : drillPhase === 'parsing'
                          ? '文档解析中...'
                          : drillPhase === 'evaluating'
                            ? 'AI 评估中...'
                            : drillPhase === 'ready'
                              ? '可向 AI 提问，或上传文档后选择题型'
                              : drillPhase === 'reviewing'
                                ? '演练已完成，查看上方综合报告'
                                : '向 AI 提问，如「总结所有相似问题」'
                  }
                  className="flex-1 bg-transparent outline-none resize-none max-h-32 py-2.5 text-sm text-gray-700 placeholder-gray-400"
                  rows={1}
                  disabled={isEvaluating || isAnsweringQuestion || isListening}
                />

                {/* 按住麦克风按钮 */}
                {drillPhase === 'questioning' && (
                  <button
                    onPointerDown={handleMicPointerDown}
                    onPointerUp={handleMicPointerUp}
                    onPointerLeave={handleMicPointerUp}
                    disabled={isEvaluating || isAnsweringQuestion || isListening || !isSupported}
                    className={`p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
                      isListening
                        ? 'text-rose-500 bg-rose-50'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                    title={!isSupported ? '当前浏览器不支持语音识别' : isListening ? '松开结束作答' : '按住说话'}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                      <line x1="12" x2="12" y1="19" y2="22"></line>
                    </svg>
                  </button>
                )}
                {drillPhase === 'questioning' && !isSupported && (
                  <span className="text-xs text-gray-400 shrink-0">
                    当前浏览器不支持语音识别，请直接打字作答
                  </span>
                )}
              </div>

              {/* 发送按钮 */}
              <button
                onClick={handleSendText}
                disabled={!inputText.trim() || isEvaluating || isAnsweringQuestion || isListening}
                className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex shrink-0"
                title={drillPhase === 'questioning' ? '提交作答' : '发送提问'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" x2="11" y1="2" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>

            <p className="mt-2 text-[10px] text-gray-400 text-center">
              本系统仅供答辩演练使用 · 可语音/文字作答 · 单题限时 3 分钟
            </p>
          </div>
        </footer>
      </main>
      )}

      {/* 个人中心页面 */}
      {currentView === 'settings' && (
        <SettingsPage
          username={currentUser.name}
          avatar={currentUser.avatar}
          subscription={subscription}
          monthlyQuestionCount={monthlyQuestionCount}
          onBack={() => setCurrentView('chat')}
          onUpdateProfile={handleUpdateProfile}
          onChangePassword={handleChangePassword}
          onSubscriptionChanged={(info) => {
            setSubscription(info);
          }}
        />
      )}

      {/* 导师 / 答辩委员会选择模态框（新建会话时弹出，选定后锁定） */}
      {showPersonaPicker && (
        <MentorPicker
          onConfirm={(ids) => handleCreateSessionWithPersona(ids)}
          onCancel={() => setShowPersonaPicker(false)}
        />
      )}

      {/* 退出作答对话框 */}
      {showExitDialog && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-sm w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">退出作答</h2>
            <p className="text-sm text-gray-500 mb-5">请选择退出原因：</p>
            <div className="space-y-3">
              <button
                onClick={() => handleExitChoice('dont_know')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-indigo-600 text-sm">不会回答</div>
                  <div className="text-xs text-gray-500">AI 生成标准话术模板供参考</div>
                </div>
              </button>
              <button
                onClick={() => handleExitChoice('quit')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center text-white shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-rose-600 text-sm">直接退出</div>
                  <div className="text-xs text-gray-500">结束本次演练，生成复盘报告</div>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowExitDialog(false)}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 结束演练确认对话框 */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">结束演练</h2>
                <p className="text-sm text-gray-500">
                  结束后将无法继续回答其他问题，并生成当前进度下的综合报告
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                继续演练
              </button>
              <button
                onClick={async () => {
                  setShowEndConfirm(false);
                  cancelAutoFlowRef.current = true;
                  await generateFinalReportWithProgress(
                    typeQuestionCounts,
                    activePanel,
                    drillStartTimeRef.current,
                  );
                  track('drill_exit', { reason: 'end_early' });
                }}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
              >
                确认结束
              </button>
            </div>
          </div>
        </div>
      )}
    {/* 管理员面板 */}
      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}
    </div>
  );
}