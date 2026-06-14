import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Calendar, Clock, Users, AlertTriangle, ChevronRight, List, BarChart3 } from 'lucide-react';
import { useProjectStore, useUserStore, useExceptionStore } from '@/store';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { formatDate, daysBetween, getTodayISO } from '@/utils';
import type { Status } from '@/types';
import { GanttView } from './GanttView';

const statusFilters: { value: Status | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待启动' },
  { value: 'in_progress', label: '进行中' },
  { value: 'delayed', label: '已逾期' },
  { value: 'completed', label: '已完成' },
];

export const ProjectList = () => {
  const navigate = useNavigate();
  const { projects, checkAndUpdateOverdue } = useProjectStore();
  const { currentUser, getUserById } = useUserStore();
  const { exceptions } = useExceptionStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  type ViewMode = 'list' | 'gantt';
  const [viewMode, setViewMode] = useState<ViewMode>('list' as ViewMode);

  useEffect(() => {
    checkAndUpdateOverdue();
  }, [checkAndUpdateOverdue]);

  const myProjects = currentUser.role === 'manager'
    ? projects.filter(p => p.managerId === currentUser.id)
    : projects;

  const filteredProjects = myProjects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getProjectProgress = (project: typeof projects[0]) => {
    const total = project.nodes.length;
    const completed = project.nodes.filter(n => n.status === 'completed').length;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  const getDelayedCount = (project: typeof projects[0]) => {
    return project.nodes.filter(n => n.status === 'delayed').length;
  };

  const getExceptionCount = (projectId: string) => {
    return exceptions.filter(e => e.projectId === projectId && e.status !== 'resolved').length;
  };

  const stats = {
    total: myProjects.length,
    inProgress: myProjects.filter(p => p.status === 'in_progress').length,
    delayed: myProjects.filter(p => p.status === 'delayed' || p.nodes.some(n => n.status === 'delayed')).length,
    completed: myProjects.filter(p => p.status === 'completed').length,
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">执行中心</h1>
            <p className="text-slate-500 mt-1">查看和管理所有项目执行进度</p>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-slate-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.total}</p>
                <p className="text-sm text-slate-500">全部项目</p>
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
                <p className="text-sm text-slate-500">进行中</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.delayed}</p>
                <p className="text-sm text-slate-500">有风险</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.completed}</p>
                <p className="text-sm text-slate-500">已完成</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索项目名称或客户..."
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
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 ml-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
              列表
            </button>
            <button
              onClick={() => setViewMode('gantt')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                (viewMode as ViewMode) === 'gantt'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              甘特图
            </button>
          </div>
        </div>

        {viewMode === 'gantt' ? (
          <GanttView onViewChange={setViewMode} />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon="folder"
            title="暂无项目"
            description={searchQuery || statusFilter !== 'all' ? '没有找到符合条件的项目' : '还没有任何项目，去流程模板页面发起一个新项目吧'}
          />
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => {
              const manager = getUserById(project.managerId);
              const progress = getProjectProgress(project);
              const delayedCount = getDelayedCount(project);
              const exceptionCount = getExceptionCount(project.id);
              const today = getTodayISO();
              const daysLeft = daysBetween(today, project.endDate);

              return (
                <div
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-slate-800 group-hover:text-amber-600 transition-colors">
                          {project.name}
                        </h3>
                        <StatusBadge status={project.status} />
                        {delayedCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            {delayedCount} 个节点逾期
                          </span>
                        )}
                        {exceptionCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            {exceptionCount} 个异常
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 mb-4">{project.clientName}</p>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(project.startDate)} - {formatDate(project.endDate)}</span>
                        </div>
                        {project.status !== 'completed' && (
                          <div className="flex items-center gap-2 text-slate-500">
                            <Clock className="w-4 h-4" />
                            <span className={daysLeft < 3 ? 'text-red-600 font-medium' : ''}>
                              {daysLeft > 0 ? `剩余 ${daysLeft} 天` : daysLeft === 0 ? '今天截止' : `已超期 ${Math.abs(daysLeft)} 天`}
                            </span>
                          </div>
                        )}
                        {manager && (
                          <div className="flex items-center gap-2 text-slate-500">
                            <Users className="w-4 h-4" />
                            <span>{manager.name}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="text-slate-500">项目进度</span>
                          <span className="font-medium text-slate-700">{progress}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              progress === 100 ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                          <span>{project.nodes.filter(n => n.status === 'completed').length} / {project.nodes.length} 节点完成</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
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
