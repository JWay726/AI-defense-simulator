import { useState, useEffect } from 'react';
import { api } from '../api';

interface User {
  id: number;
  username: string;
  avatar: string;
  isAdmin: boolean;
  createdAt: string;
}

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel = ({ onClose }: AdminPanelProps) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listUsers();
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleDelete = async (userId: number) => {
    if (deleteId === userId) {
      setError('');
      try {
        await api.deleteUser(userId);
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setDeleteId(null);
      } catch (e: any) {
        setError(e.message || '删除失败');
      }
    } else {
      setDeleteId(userId);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">管理员面板</h2>
            <p className="text-xs text-gray-500 mt-0.5">共 {users.length} 个用户</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 用户列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <p className="text-sm text-gray-500 text-center py-8">加载中...</p>
          )}
          {error && (
            <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          {!loading && users.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">暂无用户</p>
          )}
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${
                    user.isAdmin ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}
                >
                  {user.avatar}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                    {user.username}
                    {user.isAdmin && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                        管理员
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{formatDate(user.createdAt)}</div>
                </div>
              </div>
              {!user.isAdmin && (
                <button
                  onClick={() => handleDelete(user.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    deleteId === user.id
                      ? 'bg-rose-500 text-white'
                      : 'text-gray-400 hover:text-rose-500 hover:bg-rose-50'
                  }`}
                >
                  {deleteId === user.id ? '确认删除？' : '删除'}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 底部 */}
        <div className="px-6 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={loadUsers}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            刷新列表
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;