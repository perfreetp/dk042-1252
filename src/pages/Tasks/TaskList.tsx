import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Calendar, Clock, AlertTriangle, CheckCircle, ChevronRight, ListTodo, FileCheck } from 'lucide-react';
import { useProjectStore, useUserStore } from '@/store';
import { StatusBadge, NodeTypeBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { formatDate, daysBetween, getTodayISO, isOverdue, getOverdueDays, getDaysUntilDue, isAtRisk } from '@/utils';
import type { Status, ProjectNode } from '@/types';

const statusFilters: { value: Status | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'in_progress', label: '进行中' },
  { value: 'pending_approval', label: '待审批' },
  { value: 'delayed', label: '已逾期' },
  { value: 'rejected', label: '已退回' },
];

interface TaskWithProject extends ProjectNode {
  projectName: string;
  clientName: string;
}

export const TaskList = () => {
  const navigate = useNavigate();
  const { projects, checkAndUpdateOverdue, getPendingApprovals } = useProjectStore();
  const { currentUser, getUserById } = useUserStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');

  useEffect(() => {
    checkAndUpdateOverdue();
  }, [checkAndUpdateOverdue]);

  const myTasks: TaskWithProject[] = [];
  projects.forEach(project => {
    project.nodes.forEach(node => {
      if (node.assigneeId === currentUser.id && node.status !== 'completed') {
        myTasks.push({
          ...node,
          projectName: project.name,
          clientName: project.clientName,
        });
      }
    });
  });

  const myApprovals: TaskWithProject[] = [];
  const pendingApprovals = getPendingApprovals(currentUser.id);
  pendingApprovals.forEach(node => {
    const project = projects.find(p => p.id === node.projectId);
    if (project && !myTasks.find(t => t.id === node.id)) {
      myApprovals.push({
        ...node,
        projectName: project.name,
        clientName: project.clientName,
      });
    }
  });

  const allTasks = [...myTasks, ...myApprovals];

  const filteredTasks = allTasks.filter(task => {
    const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: allTasks.length,
    pending: allTasks.filter(t => t.status === 'pending').length,
    inProgress: allTasks.filter(t => t.status === 'in_progress').length,
    pendingApproval: allTasks.filter(t => t.status === 'pending_approval').length,
    delayed: allTasks.filter(t => t.status === 'delayed' || (t.status === 'in_progress' && isOverdue(t.dueDate))).length,
  };

  const getPrerequisiteStatus = (task: TaskWithProject) => {
    const project = projects.find(p => p.id === task.projectId);
    if (!project) return 'ready';
    
    const pendingPrereqs = task.prerequisites.filter(preId => {
      const preNode = project.nodes.find(n => n.id === preId);
      return preNode && preNode.status !== 'completed';
    });
    
    return pendingPrereqs.length > 0 ? 'blocked' : 'ready';
  };

  const getDueDateDisplay = (task: TaskWithProject) => {
    if (task.status === 'completed') return null;
    const overdueDays = getOverdueDays(task.dueDate);
    const daysUntilDue = getDaysUntilDue(task.dueDate);
    const isOverdueTask = isOverdue(task.dueDate);
    
    if (isOverdueTask) {
      return (
        <span className="inline-flex items-center gap-1 text-red-600 font-bold">
          <AlertTriangle className="w-4 h-4" />
          已超期 {overdueDays} 天
        </span>
      );
    }
    if (isAtRisk(task.dueDate)) {
      return (
        <span className="inline-flex items-center gap-1 text-orange-600 font-medium">
          <Clock className="w-4 h-4" />
          还剩 {daysUntilDue} 天
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <Clock className="w-4 h-4" />
        还剩 {daysUntilDue} 天
      </span>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">任务中心</h1>
            <p className="text-slate-500 mt-1">查看和处理您负责的所有任务</p>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <ListTodo className="w-6 h-6 text-slate-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.total}</p>
                <p className="text-sm text-slate-500">全部任务</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-slate-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.pending}</p>
                <p className="text-sm text-slate-500">待处理</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.inProgress}</p>
                <p className="text-sm text-slate-500">进行中</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                <FileCheck className="w-6 h-6 text-violet-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-800">{stats.pendingApproval}</p>
                <p className="text-sm text-slate-500">待审批</p>
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
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索任务名称、项目或客户..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 flex-wrap">
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

        {filteredTasks.length === 0 ? (
          <EmptyState
            icon="check"
            title="暂无待办任务"
            description={searchQuery || statusFilter !== 'all' ? '没有找到符合条件的任务' : '太棒了！您目前没有待处理的任务'}
          />
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => {
              const assignee = getUserById(task.assigneeId);
              const today = getTodayISO();
              const daysLeft = daysBetween(today, task.dueDate);
              const prereqStatus = getPrerequisiteStatus(task);
              const isOverdueTask = isOverdue(task.dueDate) && task.status !== 'completed';
              const dueDateDisplay = getDueDateDisplay(task);
              const isApprovalTask = task.assigneeId !== currentUser.id;

              return (
                <div
                  key={task.id}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-slate-800 group-hover:text-amber-600 transition-colors">
                          {task.name}
                        </h3>
                        <NodeTypeBadge type={task.type} />
                        <StatusBadge status={task.status} />
                        {isApprovalTask && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">
                            <FileCheck className="w-3 h-3" />
                            待您审批
                          </span>
                        )}
                        {isOverdueTask && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            已逾期
                          </span>
                        )}
                        {prereqStatus === 'blocked' && !isOverdueTask && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                            <Clock className="w-3 h-3" />
                            等待前置任务
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 mb-4">{task.projectName} · {task.clientName}</p>

                      <div className="flex items-center gap-6 text-sm flex-wrap">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Calendar className="w-4 h-4" />
                          <span>截止日期: {formatDate(task.dueDate)}</span>
                        </div>
                        {task.status !== 'completed' && dueDateDisplay && (
                          <div className="flex items-center gap-2">
                            {dueDateDisplay}
                          </div>
                        )}
                        {assignee && (
                          <div className="flex items-center gap-2 text-slate-500">
                            <span>负责人: {assignee.name}</span>
                          </div>
                        )}
                      </div>

                      {task.requiredMaterials && task.requiredMaterials.length > 0 && (
                        <div className="mt-4">
                          <p className="text-sm text-slate-500 mb-2">必填材料:</p>
                          <div className="flex flex-wrap gap-2">
                            {task.requiredMaterials.map((material, idx) => (
                              <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs">
                                {material}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
                        <span>{task.deliverables.length} 个交付物</span>
                        <span>{task.comments.length} 条留言</span>
                        {task.approvalHistory.length > 0 && (
                          <span>{task.approvalHistory.length} 次审批</span>
                        )}
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
