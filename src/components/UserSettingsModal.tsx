import { useState } from 'react';

// 可选头像列表
const AVATAR_OPTIONS = [
  '用', '师', '学', '者', '研', '辩', '论', '思',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
];

interface UserSettingsModalProps {
  username: string;
  avatar: string;
  onClose: () => void;
  onUpdateProfile: (data: { username?: string; avatar?: string }) => Promise<void>;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
}

export const UserSettingsModal = ({
  username,
  avatar,
  onClose,
  onUpdateProfile,
  onChangePassword,
}: UserSettingsModalProps) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

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

  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-md w-full overflow-hidden">
        {/* 头部 */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">个人设置</h2>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-gray-100">
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
        </div>

        <div className="p-6">
          {activeTab === 'profile' && (
            <div className="space-y-5">
              {/* 头像选择 */}
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

              {/* 用户名修改 */}
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
        </div>

        {/* 关闭 */}
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserSettingsModal;