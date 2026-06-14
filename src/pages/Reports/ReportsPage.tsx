import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  Calendar,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
  CheckCircle,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { useProjectStore, useUserStore, useExceptionStore, useTemplateStore } from '@/store';
import { StatusBadge, NodeTypeBadge } from '@/components/StatusBadge';
import { Avatar } from '@/components/Avatar';
import {
  formatDate,
  daysBetween,
  getTodayISO,
  isOverdue,
  nodeTypeLabels,
  statusLabels,
} from '@/utils';
import type { NodeType, Status } from '@/types';

const COLORS = ['#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export const ReportsPage = () => {
  const { projects } = useProjectStore();
  const { users, getUserById } = useUserStore();
  const { exceptions } = useExceptionStore();
  const { templates } = useTemplateStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'delays' | 'workload'>('overview');

  const today = getTodayISO();

  const getProjectDuration = (project: typeof projects[0]) => {
    const endDate = project.actualEndDate || project.endDate;
    return daysBetween(project.startDate, endDate);
  };

  const getPlannedDuration = (project: typeof projects[0]) => {
    return daysBetween(project.startDate, project.endDate);
  };

  const getDelayedNodes = (project: typeof projects[0]) => {
    return project.nodes.filter(n => n.status === 'delayed' || (n.status === 'in_progress' && isOverdue(n.dueDate)));
  };

  const getCompletedDelayedNodes = (project: typeof projects[0]) => {
    return project.nodes.filter(n => {
      if (n.status !== 'completed' || !n.actualEndDate) return false;
      return daysBetween(n.dueDate, n.actualEndDate) < 0;
    });
  };

  const stats = {
    totalProjects: projects.length,
    completedProjects: projects.filter(p => p.status === 'completed').length,
    inProgressProjects: projects.filter(p => p.status === 'in_progress').length,
    delayedProjects: projects.filter(p => getDelayedNodes(p).length > 0).length,
    totalExceptions: exceptions.length,
    resolvedExceptions: exceptions.filter(e => e.status === 'resolved').length,
    avgProjectDuration: projects.length > 0
      ? Math.round(projects.reduce((sum, p) => sum + getProjectDuration(p), 0) / projects.length)
      : 0,
  };

  const projectDurationData = projects.map(project => ({
    name: project.name.length > 8 ? project.name.substring(0, 8) + '...' : project.name,
    计划工期: getPlannedDuration(project),
    实际工期: getProjectDuration(project),
  }));

  const nodeDelayData = (() => {
    const delayCount: Record<NodeType, number> = {
      quotation: 0,
      contract: 0,
      material: 0,
      venue: 0,
      rehearsal: 0,
      settlement: 0,
      custom: 0,
    };
    projects.forEach(project => {
      const delayedNodes = [...getDelayedNodes(project), ...getCompletedDelayedNodes(project)];
      delayedNodes.forEach(node => {
        delayCount[node.type]++;
      });
    });
    return Object.entries(delayCount).map(([type, count]) => ({
      name: nodeTypeLabels[type as NodeType],
      value: count,
    })).filter(d => d.value > 0);
  })();

  const projectStatusData = (() => {
    const statusCount: Record<Status, number> = {
      pending: 0,
      in_progress: 0,
      pending_approval: 0,
      completed: 0,
      delayed: 0,
      rejected: 0,
    };
    projects.forEach(project => {
      statusCount[project.status]++;
    });
    return Object.entries(statusCount)
      .filter(([_, count]) => count > 0)
      .map(([status, count]) => ({
        name: statusLabels[status as Status],
        value: count,
      }));
  })();

  const userWorkloadData = users.map(user => {
    const assignedTasks = projects.reduce((sum, project) =>
      sum + project.nodes.filter(n => n.assigneeId === user.id).length, 0
    );
    const completedTasks = projects.reduce((sum, project) =>
      sum + project.nodes.filter(n => n.assigneeId === user.id && n.status === 'completed').length, 0
    );
    const delayedTasks = projects.reduce((sum, project) =>
      sum + project.nodes.filter(n =>
        n.assigneeId === user.id &&
        (n.status === 'delayed' || (n.status === 'in_progress' && isOverdue(n.dueDate)))
      ).length, 0
    );
    return {
      user,
      assignedTasks,
      completedTasks,
      delayedTasks,
      completionRate: assignedTasks > 0 ? Math.round((completedTasks / assignedTasks) * 100) : 0,
    };
  }).sort((a, b) => b.assignedTasks - a.assignedTasks);

  const monthlyTrendData = [
    { month: '1月', 项目数: 2, 完成数: 1, 异常数: 1 },
    { month: '2月', 项目数: 3, 完成数: 2, 异常数: 2 },
    { month: '3月', 项目数: 2, 完成数: 2, 异常数: 0 },
    { month: '4月', 项目数: 4, 完成数: 3, 异常数: 3 },
    { month: '5月', 项目数: 3, 完成数: 2, 异常数: 1 },
    { month: '6月', 项目数: 4, 完成数: 2, 异常数: 2 },
  ];

  const tabs = [
    { id: 'overview', label: '总览', icon: BarChart3 },
    { id: 'projects', label: '项目耗时', icon: Calendar },
    { id: 'delays', label: '延期分析', icon: AlertTriangle },
    { id: 'workload', label: '人员负载', icon: Users },
  ] as const;

  return (
    <div className="animate-fade-in min-h-screen">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">报表统计</h1>
            <p className="text-slate-500 mt-1">查看项目执行数据和人员绩效统计</p>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-8">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-slate-600" />
                  </div>
                  <span className="text-sm text-emerald-600 font-medium">+12%</span>
                </div>
                <p className="text-3xl font-bold text-slate-800">{stats.totalProjects}</p>
                <p className="text-sm text-slate-500 mt-1">总项目数</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                  </div>
                  <span className="text-sm text-emerald-600 font-medium">+8%</span>
                </div>
                <p className="text-3xl font-bold text-slate-800">{stats.completedProjects}</p>
                <p className="text-sm text-slate-500 mt-1">已完成项目</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-amber-600" />
                  </div>
                  <span className="text-sm text-amber-600 font-medium">{stats.avgProjectDuration}天</span>
                </div>
                <p className="text-3xl font-bold text-slate-800">{stats.inProgressProjects}</p>
                <p className="text-sm text-slate-500 mt-1">进行中项目</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <span className="text-sm text-red-600 font-medium">{stats.resolvedExceptions}/{stats.totalExceptions}</span>
                </div>
                <p className="text-3xl font-bold text-slate-800">{stats.delayedProjects}</p>
                <p className="text-sm text-slate-500 mt-1">有延期项目</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">月度项目趋势</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="项目数" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
                      <Line type="monotone" dataKey="完成数" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                      <Line type="monotone" dataKey="异常数" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">项目状态分布</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={projectStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {projectStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">项目概况</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">项目名称</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">客户</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">状态</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">计划工期</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">实际工期</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">进度</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">延期节点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => {
                      const progress = project.nodes.length > 0
                        ? Math.round((project.nodes.filter(n => n.status === 'completed').length / project.nodes.length) * 100)
                        : 0;
                      const delayedNodes = getDelayedNodes(project);
                      return (
                        <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-sm font-medium text-slate-800">{project.name}</td>
                          <td className="py-3 px-4 text-sm text-slate-600">{project.clientName}</td>
                          <td className="py-3 px-4"><StatusBadge status={project.status} size="sm" /></td>
                          <td className="py-3 px-4 text-sm text-slate-600">{getPlannedDuration(project)} 天</td>
                          <td className="py-3 px-4 text-sm text-slate-600">{getProjectDuration(project)} 天</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-500">{progress}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {delayedNodes.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                {delayedNodes.length} 个
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">项目工期对比</h3>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectDurationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} label={{ value: '天数', angle: -90, position: 'insideLeft' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="计划工期" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="实际工期" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">项目详细耗时</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">项目名称</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">使用模板</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">开始日期</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">计划完成</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">实际完成</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">偏差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => {
                      const template = templates.find(t => t.id === project.templateId);
                      const plannedDays = getPlannedDuration(project);
                      const actualDays = getProjectDuration(project);
                      const deviation = actualDays - plannedDays;
                      return (
                        <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-sm font-medium text-slate-800">{project.name}</td>
                          <td className="py-3 px-4 text-sm text-slate-600">{template?.name || '-'}</td>
                          <td className="py-3 px-4 text-sm text-slate-600">{formatDate(project.startDate)}</td>
                          <td className="py-3 px-4 text-sm text-slate-600">{formatDate(project.endDate)}</td>
                          <td className="py-3 px-4 text-sm text-slate-600">
                            {project.actualEndDate ? formatDate(project.actualEndDate) : '-'}
                          </td>
                          <td className="py-3 px-4">
                            {deviation !== 0 ? (
                              <span className={`text-sm font-medium ${deviation > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {deviation > 0 ? '+' : ''}{deviation} 天
                              </span>
                            ) : (
                              <span className="text-sm text-slate-400">按时</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'delays' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">延期节点类型分布</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={nodeDelayData.length > 0 ? nodeDelayData : [{ name: '暂无数据', value: 1 }]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {nodeDelayData.length > 0
                          ? nodeDelayData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))
                          : <Cell fill="#e2e8f0" />
                        }
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">延期节点统计</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={nodeDelayData.length > 0 ? nodeDelayData : [{ name: '暂无数据', value: 0 }]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} name="延期次数" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">延期节点详情</h3>
              <div className="space-y-4">
                {projects.flatMap(project => {
                  const delayedNodes = [...getDelayedNodes(project), ...getCompletedDelayedNodes(project)];
                  return delayedNodes.map(node => {
                    const assignee = getUserById(node.assigneeId);
                    return { ...node, projectName: project.name, assignee };
                  });
                }).length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-2" />
                    <p className="text-slate-400">太棒了！目前没有延期节点</p>
                  </div>
                ) : (
                  projects.flatMap(project => {
                    const delayedNodes = [...getDelayedNodes(project), ...getCompletedDelayedNodes(project)];
                    return delayedNodes.map(node => {
                      const assignee = getUserById(node.assigneeId);
                      const daysOverdue = node.actualEndDate
                        ? Math.abs(daysBetween(node.dueDate, node.actualEndDate))
                        : Math.abs(daysBetween(today, node.dueDate));
                      return (
                        <div key={`${project.id}-${node.id}`} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                              <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-slate-800">{node.name}</h4>
                                <NodeTypeBadge type={node.type} />
                              </div>
                              <p className="text-sm text-slate-500">{project.name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            {assignee && (
                              <div className="flex items-center gap-2">
                                <Avatar src={assignee.avatar} alt={assignee.name} size="sm" />
                                <span className="text-sm text-slate-600">{assignee.name}</span>
                              </div>
                            )}
                            <div className="text-right">
                              <p className="text-sm font-medium text-red-600">逾期 {daysOverdue} 天</p>
                              <p className="text-xs text-slate-400">截止: {formatDate(node.dueDate)}</p>
                            </div>
                            <StatusBadge status={node.status} size="sm" />
                          </div>
                        </div>
                      );
                    });
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'workload' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">人员任务分布</h3>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={userWorkloadData.map(w => ({
                      name: w.user.name,
                      已分配: w.assignedTasks,
                      已完成: w.completedTasks,
                      已延期: w.delayedTasks,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" fontSize={12} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} width={80} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="已分配" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="已完成" fill="#10b981" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="已延期" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">人员绩效详情</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">人员</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">角色</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">分配任务</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">已完成</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">进行中</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">已延期</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">完成率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userWorkloadData.map(({ user, assignedTasks, completedTasks, delayedTasks, completionRate }) => {
                      const inProgressTasks = assignedTasks - completedTasks - delayedTasks;
                      return (
                        <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Avatar src={user.avatar} alt={user.name} size="sm" />
                              <span className="text-sm font-medium text-slate-800">{user.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600">
                            {user.role === 'admin' ? '管理员' : user.role === 'manager' ? '项目经理' : '执行人员'}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600">{assignedTasks}</td>
                          <td className="py-3 px-4 text-sm text-emerald-600 font-medium">{completedTasks}</td>
                          <td className="py-3 px-4 text-sm text-amber-600">{inProgressTasks}</td>
                          <td className="py-3 px-4">
                            {delayedTasks > 0 ? (
                              <span className="text-sm text-red-600 font-medium">{delayedTasks}</span>
                            ) : (
                              <span className="text-sm text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    completionRate >= 80 ? 'bg-emerald-500' :
                                    completionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${completionRate}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${
                                completionRate >= 80 ? 'text-emerald-600' :
                                completionRate >= 50 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {completionRate}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
