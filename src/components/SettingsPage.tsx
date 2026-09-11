import { useState } from 'react';
import { api } from '../api';
import type { SubscriptionInfo } from '../types';

// 可选头像列表
const AVATAR_OPTIONS = [
  '用', '师', '学', '者', '研', '辩', '论', '思',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
];

interface SettingsPageProps {
  username: string;
  avatar: string;
  subscription: SubscriptionInfo;
  monthlyQuestionCount: number;
  onBack: () => void;
  onUpdateProfile: (data: { username?: string; avatar?: string }) => Promise<void>;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  onSubscriptionChanged: (info: SubscriptionInfo) => void;
}

export const SettingsPage = ({
  username,
  avatar,
  subscription,
  monthlyQuestionCount,
  onBack,
  onUpdateProfile,
  onChangePassword,
  onSubscriptionChanged,
}: SettingsPageProps) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'subscription'>('profile');

  // 修改资料
  const [newUsername, setNewUsername] = useState(username);
  const [selectedAvatar, setSelectedAvatar] = useState(avatar);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // 修改密码
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  // 订阅
  const [subLoading, setSubLoading] = useState(false);
  const [subMsg, setSubMsg] = useState('');
  const [subError, setSubError] = useState('');

  const handleSaveProfile = async () => {
    setProfileMsg('');
    setProfileError('');
    if (!newUsername.trim()) {
      setProfileError('用户名不能为空');
      return;
    }
    setProfileLoading(true);
    try {
      await onUpdateProfile({
        username: newUsername.trim() !== username ? newUsername.trim() : undefined,
        avatar: selectedAvatar !== avatar ? selectedAvatar : undefined,
      });
      setProfileMsg('资料修改成功');
    } catch (e: any) {
      setProfileError(e.message || '修改失败');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setPwdMsg('');
    setPwdError('');
    if (!oldPwd || !newPwd || !confirmPwd) {
      setPwdError('请填写所有密码字段');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    if (newPwd.length < 4) {
      setPwdError('新密码长度至少 4 位');
      return;
    }
    setPwdLoading(true);
    try {
      await onChangePassword(oldPwd, newPwd);
      setPwdMsg('密码修改成功');
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (e: any) {
      setPwdError(e.message || '修改失败');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleSubscribe = async (tier: 'monthly' | 'yearly') => {
    setSubMsg('');
    setSubError('');
    setSubLoading(true);
    try {
      const result = await api.subscribe(tier);
      onSubscriptionChanged(result.subscription);
      setSubMsg(tier === 'monthly' ? '已开通包月订阅！' : '已开通包年订阅！');
    } catch (e: any) {
      setSubError(e.message || '订阅失败');
    } finally {
      setSubLoading(false);
    }
  };

  const isSubscribed = subscription.tier !== 'free';
  const tierLabel = subscription.tier === 'monthly' ? '包月会员' : subscription.tier === 'yearly' ? '包年会员' : '免费用户';

  return (
    <div className="h-screen flex flex-col bg-white font-sans">
      {/* 顶部导航 */}
      <header className="flex items-center h-12 px-5 bg-white border-b border-gray-100 shrink-0 gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <h1 className="text-sm font-medium text-gray-700">个人中心</h1>
      </header>

      {/* 用户信息卡片 */}
      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-bold shrink-0">
            {avatar}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{username}</h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                subscription.tier === 'yearly'
                  ? 'bg-amber-100 text-amber-700'
                  : subscription.tier === 'monthly'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500'
              }`}>
                {tierLabel}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isSubscribed
                ? `到期时间：${subscription.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString('zh-CN') : '未知'}`
                : '免费用户，可升级订阅解锁更多功能'}
            </p>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-100 shrink-0">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 text-sm font-medium py-3 text-center transition-colors ${
            activeTab === 'profile'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          修改资料
        </button>
        <button
          onClick={() => setActiveTab('password')}
          className={`flex-1 text-sm font-medium py-3 text-center transition-colors ${
            activeTab === 'password'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          修改密码
        </button>
        <button
          onClick={() => setActiveTab('subscription')}
          className={`flex-1 text-sm font-medium py-3 text-center transition-colors ${
            activeTab === 'subscription'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          订阅管理
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-6 max-w-lg mx-auto w-full">
        {/* 修改资料 */}
        {activeTab === 'profile' && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">选择头像</label>
              <div className="grid grid-cols-8 gap-2">
                {AVATAR_OPTIONS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setSelectedAvatar(a)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      selectedAvatar === a
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 ring-offset-1'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">用户名</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all text-sm"
                placeholder="输入新用户名"
              />
            </div>

            {profileError && (
              <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{profileError}</p>
            )}
            {profileMsg && (
              <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">{profileMsg}</p>
            )}

            <button
              onClick={handleSaveProfile}
              disabled={profileLoading}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {profileLoading ? '保存中...' : '保存修改'}
            </button>
          </div>
        )}

        {/* 修改密码 */}
        {activeTab === 'password' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">旧密码</label>
              <input
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all text-sm"
                placeholder="输入旧密码"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">新密码</label>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all text-sm"
                placeholder="输入新密码（至少4位）"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">确认新密码</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all text-sm"
                placeholder="再次输入新密码"
              />
            </div>

            {pwdError && (
              <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{pwdError}</p>
            )}
            {pwdMsg && (
              <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">{pwdMsg}</p>
            )}

            <button
              onClick={handleChangePassword}
              disabled={pwdLoading}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {pwdLoading ? '修改中...' : '修改密码'}
            </button>
          </div>
        )}

        {/* 订阅管理 */}
        {activeTab === 'subscription' && (
          <div className="space-y-5">
            {/* 当前订阅状态 */}
            <div className={`p-5 rounded-2xl border ${
              isSubscribed
                ? 'bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">当前订阅</h3>
              <p className="text-2xl font-bold text-indigo-600 mb-2">{tierLabel}</p>
              {isSubscribed && subscription.expiresAt && (
                <p className="text-xs text-gray-500">
                  到期时间：{new Date(subscription.expiresAt).toLocaleDateString('zh-CN')}
                </p>
              )}
              <div className="mt-3 pt-3 border-t border-gray-200/50">
                <p className="text-xs text-gray-500">
                  本月已用提问次数：<span className="font-medium text-gray-700">{monthlyQuestionCount}</span>
                  {subscription.tier === 'free'
                    ? ' / 50'
                    : subscription.tier === 'monthly'
                      ? ' / 100'
                      : ' 次（无限制）'}
                </p>
              </div>
            </div>

            {/* 订阅套餐 */}
            {!isSubscribed && (
              <>
                <h3 className="text-sm font-semibold text-gray-900">升级订阅</h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* 包月 */}
                  <button
                    onClick={() => handleSubscribe('monthly')}
                    disabled={subLoading}
                    className="text-left p-4 rounded-xl border border-indigo-200 bg-white hover:shadow-md hover:border-indigo-300 transition-all disabled:opacity-50"
                  >
                    <div className="text-xs text-indigo-500 font-medium mb-1">包月</div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      ￥9.9<span className="text-sm font-normal text-gray-500">/月</span>
                    </div>
                    <ul className="space-y-1 mt-3">
                      <li className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        每种类型 5 题
                      </li>
                      <li className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        每月上限 100 次
                      </li>
                      <li className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        AI 智能追问
                      </li>
                    </ul>
                  </button>

                  {/* 包年 */}
                  <button
                    onClick={() => handleSubscribe('yearly')}
                    disabled={subLoading}
                    className="text-left p-4 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 hover:shadow-md hover:border-amber-300 transition-all disabled:opacity-50 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-medium">
                      推荐
                    </div>
                    <div className="text-xs text-amber-600 font-medium mb-1">包年</div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      ￥99<span className="text-sm font-normal text-gray-500">/年</span>
                    </div>
                    <div className="text-[10px] text-amber-500 mb-1">相当于 ￥8.25/月 · 节省 17%</div>
                    <ul className="space-y-1 mt-2">
                      <li className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        无限提问次数
                      </li>
                      <li className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        AI 智能追问
                      </li>
                      <li className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        全部功能解锁
                      </li>
                    </ul>
                  </button>
                </div>
              </>
            )}

            {subError && (
              <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{subError}</p>
            )}
            {subMsg && (
              <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">{subMsg}</p>
            )}

            {/* 已订阅用户的升级选项 */}
            {isSubscribed && subscription.tier === 'monthly' && (
              <div className="pt-2">
                <button
                  onClick={() => handleSubscribe('yearly')}
                  disabled={subLoading}
                  className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium rounded-xl hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 transition-all"
                >
                  {subLoading ? '处理中...' : '升级到包年 ￥99/年（无限提问）'}
                </button>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-xs font-medium text-gray-500 mb-2">功能对比</h4>
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 font-medium text-gray-600">功能</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-400">免费</th>
                      <th className="text-center px-3 py-2 font-medium text-indigo-600">包月</th>
                      <th className="text-center px-3 py-2 font-medium text-amber-600">包年</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    <tr className="bg-white">
                      <td className="px-3 py-2 text-gray-700">每种类型题目数</td>
                      <td className="text-center px-3 py-2 text-gray-500">3 题</td>
                      <td className="text-center px-3 py-2 text-indigo-600 font-medium">5 题</td>
                      <td className="text-center px-3 py-2 text-amber-600 font-medium">无限</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 text-gray-700">每月总上限</td>
                      <td className="text-center px-3 py-2 text-gray-500">50 次</td>
                      <td className="text-center px-3 py-2 text-indigo-600 font-medium">100 次</td>
                      <td className="text-center px-3 py-2 text-amber-600 font-medium">无限制</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-3 py-2 text-gray-700">AI 智能追问</td>
                      <td className="text-center px-3 py-2 text-gray-400">-</td>
                      <td className="text-center px-3 py-2 text-emerald-500 font-medium">✓</td>
                      <td className="text-center px-3 py-2 text-emerald-500 font-medium">✓</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;