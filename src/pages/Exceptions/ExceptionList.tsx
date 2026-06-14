import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, AlertTriangle, Calendar, User, Plus, ChevronRight, Clock, CheckCircle } from 'lucide-react';
import { useExceptionStore, useProjectStore, useUserStore } from '@/store';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { formatDate, exceptionStatusLabels, exceptionStatusColors } from '@/utils';
import type { ExceptionStatus } from '@/types';

const statusFilters: { value: ExceptionStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '待处理' },
  { value: 'in_progress', label: '处理中' },
  { value: 'resolved', label: '已解决' },
];

export const ExceptionList = () => {
  const navigate = useNavigate();
  const { exceptions, updateExceptionStatus } = useExceptionStore();
  const { projects } = useProjectStore();
  const { getUserById, currentUser } = useUserStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExceptionStatus | 'all'>('all');

  const filteredExceptions = exceptions.filter(exception => {
    const project = projects.find(p => p.id === exception.projectId);
    const matchesSearch = exception.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exception.changeReason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project?.name.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === 'all' || exception.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: exceptions.length,
    open: exceptions.filter(e => e.status === 'open').length,
    inProgress: exceptions.filter(e => e.status === 'in_progress').length,
    resolved: exceptions.filter(e => e.status === 'resolved').length,
  };

  const handleStatusChange = (id: string, status: ExceptionStatus) => {
    updateExceptionStatus(id, status);
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">异常处理</h1>
            <p className="text-slate-500 mt-1">记录和管理项目执行过程中的异常情况</p>
          </div>
          <button
            onClick={() => navigate('/exceptions/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            记录异常
          </button>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-slate-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.total}</p>
                <p className="text-sm text-slate-500">全部异常</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.open}</p>
                <p className="text-sm text-slate-500">待处理</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.inProgress}</p>
                <p className="text-sm text-slate-500">处理中</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.resolved}</p>
                <p className="text-sm text-slate-500">已解决</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索异常标题、原因或项目..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {statusFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    statusFilter === filter.value
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredExceptions.length === 0 ? (
          <EmptyState
            icon="alert"
            title="暂无异常记录"
            description={searchQuery || statusFilter !== 'all' ? '没有找到符合条件的异常记录' : '目前还没有任何异常记录，保持良好的项目执行！'}
          />
        ) : (
          <div className="space-y-4">
            {filteredExceptions.map((exception) => {
              const project = projects.find(p => p.id === exception.projectId);
              const createdBy = getUserById(exception.createdBy);
              const node = exception.projectNodeId 
                ? project?.nodes.find(n => n.id === exception.projectNodeId)
                : null;

              return (
                <div
                  key={exception.id}
                  className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-slate-800">{exception.title}</h3>
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium ${exceptionStatusColors[exception.status]}`}>
                          {exceptionStatusLabels[exception.status]}
                        </span>
                      </div>
                      <p className="text-slate-500 mb-4">
                        {project?.name}
                        {node && <span className="text-slate-400"> · 节点: {node.name}</span>}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-slate-400 mb-1">变更原因</p>
                          <p className="text-sm text-slate-600 line-clamp-2">{exception.changeReason}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 mb-1">影响范围</p>
                          <p className="text-sm text-slate-600 line-clamp-2">{exception.impactScope || '暂无'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 mb-1">补救动作</p>
                          <p className="text-sm text-slate-600 line-clamp-2">{exception.remedyAction || '暂无'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(exception.createdAt)}</span>
                        </div>
                        {createdBy && (
                          <div className="flex items-center gap-2 text-slate-500">
                            <User className="w-4 h-4" />
                            <span>{createdBy.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-4">
                      {exception.status !== 'resolved' && (currentUser.role === 'manager' || currentUser.role === 'admin') && (
                        <div className="flex gap-2">
                          {exception.status === 'open' && (
                            <button
                              onClick={() => handleStatusChange(exception.id, 'in_progress')}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium rounded-lg transition-colors"
                            >
                              开始处理
                            </button>
                          )}
                          {exception.status === 'in_progress' && (
                            <button
                              onClick={() => handleStatusChange(exception.id, 'resolved')}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-medium rounded-lg transition-colors"
                            >
                              标记解决
                            </button>
                          )}
                        </div>
                      )}
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
