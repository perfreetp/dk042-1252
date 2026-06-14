import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, List, BarChart3, ChevronLeft, ChevronRight, X, Target } from 'lucide-react';
import { useProjectStore, useUserStore, useTemplateStore } from '@/store';
import { Avatar } from '@/components/Avatar';
import { Modal } from '@/components/Modal';
import { formatDate, getTodayISO, addDays, getDateRange, daysBetween } from '@/utils';
import { statusLabels, statusBorderColors, statusColors, roleLabels } from '@/utils/status';
import type { Project, ProjectNode, Status, User, WorkflowTemplate } from '@/types';

interface WorkloadWeekViewProps {
  onViewChange: (view: 'list' | 'gantt' | 'workload') => void;
}

const DAY_WIDTH = 80;
const ROW_HEIGHT = 48;
const LEFT_PANEL_WIDTH = 240;
const BOTTOM_SUMMARY_HEIGHT = 60;
const TOTAL_DAYS = 14;

const getNodeStart = (node: ProjectNode, projectStart: string): string => {
  return node.actualStartDate || projectStart;
};

const getNodeEnd = (node: ProjectNode): string => {
  return node.actualEndDate || node.dueDate;
};

const isNodeInDateRange = (node: ProjectNode, projectStart: string, date: string): boolean => {
  const start = getNodeStart(node, projectStart);
  const end = getNodeEnd(node);
  return date >= start && date <= end;
};

const isNodeActive = (status: Status): boolean => {
  const activeStatuses: Status[] = ['in_progress', 'pending', 'pending_approval', 'delayed', 'rejected'];
  return activeStatuses.includes(status);
};

const getMondayOfWeek = (dateStr: string): string => {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
};

const truncate = (text: string, maxLen: number): string => {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
};

interface PersonWorkload {
  user: User;
  activeTaskCount: number;
  totalTaskCount: number;
  loadLevel: 'idle' | 'moderate' | 'overload';
  dailyTasks: Map<string, { node: ProjectNode; project: Project }[]>;
  continuousBlocks: { start: string; end: string; count: number }[];
}

interface HoveredTask {
  node: ProjectNode;
  project: Project;
  x: number;
  y: number;
}

interface ConflictModalData {
  user: User;
  start: string;
  end: string;
  tasks: { node: ProjectNode; project: Project }[];
}

interface HeatmapTooltip {
  user: User;
  date: string;
  count: number;
  x: number;
  y: number;
}

export const WorkloadWeekView = ({ onViewChange }: WorkloadWeekViewProps) => {
  const navigate = useNavigate();
  const { projects, checkAndUpdateOverdue } = useProjectStore();
  const { currentUser, getUserById, users } = useUserStore();
  const { templates } = useTemplateStore();

  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [templateFilter, setTemplateFilter] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string>(getMondayOfWeek(getTodayISO()));

  const [hoveredTask, setHoveredTask] = useState<HoveredTask | null>(null);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [conflictModal, setConflictModal] = useState<ConflictModalData | null>(null);
  const [heatmapTooltip, setHeatmapTooltip] = useState<HeatmapTooltip | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAndUpdateOverdue();
  }, [checkAndUpdateOverdue]);

  const myProjects = useMemo(() => {
    return currentUser.role === 'manager'
      ? projects.filter(p => p.managerId === currentUser.id)
      : projects;
  }, [projects, currentUser]);

  const allAssignees = useMemo(() => {
    const set = new Set<string>();
    myProjects.forEach(p => p.nodes.forEach(n => set.add(n.assigneeId)));
    return Array.from(set).map(id => getUserById(id)).filter(Boolean) as User[];
  }, [myProjects, getUserById]);

  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    myProjects.forEach(p => {
      if (p.clientName) set.add(p.clientName);
    });
    return Array.from(set).sort();
  }, [myProjects]);

  const weekDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < TOTAL_DAYS; i++) {
      dates.push(addDays(weekStart, i));
    }
    return dates;
  }, [weekStart]);

  const filteredProjects = useMemo(() => {
    return myProjects.filter(project => {
      if (templateFilter.length > 0 && !templateFilter.includes(project.templateId)) return false;
      if (clientFilter.length > 0 && !clientFilter.includes(project.clientName)) return false;
      return true;
    });
  }, [myProjects, templateFilter, clientFilter]);

  const personWorkloads = useMemo<Map<string, PersonWorkload>>(() => {
    const workloads = new Map<string, PersonWorkload>();
    const activeStatuses: Status[] = ['in_progress', 'pending', 'pending_approval', 'delayed', 'rejected'];

    const relevantUsers = selectedUserId
      ? [getUserById(selectedUserId)].filter(Boolean) as User[]
      : assigneeFilter !== 'all'
        ? [getUserById(assigneeFilter)].filter(Boolean) as User[]
        : allAssignees;

    for (const user of relevantUsers) {
      const dailyTasks = new Map<string, { node: ProjectNode; project: Project }[]>();
      let activeTaskCount = 0;
      let totalTaskCount = 0;

      for (const date of weekDates) {
        dailyTasks.set(date, []);
      }

      for (const project of filteredProjects) {
        for (const node of project.nodes) {
          if (node.assigneeId !== user.id) continue;

          totalTaskCount++;
          if (activeStatuses.includes(node.status)) {
            activeTaskCount++;
          }

          for (const date of weekDates) {
            if (isNodeInDateRange(node, project.startDate, date)) {
              const tasks = dailyTasks.get(date) || [];
              tasks.push({ node, project });
              dailyTasks.set(date, tasks);
            }
          }
        }
      }

      const continuousBlocks: { start: string; end: string; count: number }[] = [];
      let blockStart: string | null = null;
      let blockLength = 0;

      for (let i = 0; i < weekDates.length; i++) {
        const date = weekDates[i];
        const dayTasks = dailyTasks.get(date) || [];
        const activeDayTasks = dayTasks.filter(t => isNodeActive(t.node.status));

        if (activeDayTasks.length >= 1) {
          if (blockStart === null) {
            blockStart = date;
          }
          blockLength++;
        } else {
          if (blockStart !== null && blockLength >= 3) {
            continuousBlocks.push({
              start: blockStart,
              end: weekDates[i - 1],
              count: blockLength,
            });
          }
          blockStart = null;
          blockLength = 0;
        }
      }

      if (blockStart !== null && blockLength >= 3) {
        continuousBlocks.push({
          start: blockStart,
          end: weekDates[weekDates.length - 1],
          count: blockLength,
        });
      }

      let loadLevel: 'idle' | 'moderate' | 'overload' = 'idle';
      if (activeTaskCount >= 4) {
        loadLevel = 'overload';
      } else if (activeTaskCount >= 2) {
        loadLevel = 'moderate';
      }

      workloads.set(user.id, {
        user,
        activeTaskCount,
        totalTaskCount,
        loadLevel,
        dailyTasks,
        continuousBlocks,
      });
    }

    return workloads;
  }, [filteredProjects, weekDates, allAssignees, getUserById, assigneeFilter, selectedUserId]);

  const sortedUserIds = useMemo(() => {
    return Array.from(personWorkloads.entries())
      .sort((a, b) => {
        const order = { overload: 0, moderate: 1, idle: 2 };
        return order[a[1].loadLevel] - order[b[1].loadLevel];
      })
      .map(([userId]) => userId);
  }, [personWorkloads]);

  const syncScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
    }
  };

  const syncScrollLeft = (e: React.UIEvent<HTMLDivElement>) => {
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
    }
  };

  const handlePrevWeek = () => {
    setWeekStart(addDays(weekStart, -7));
  };

  const handleNextWeek = () => {
    setWeekStart(addDays(weekStart, 7));
  };

  const handleToday = () => {
    setWeekStart(getMondayOfWeek(getTodayISO()));
  };

  const handlePersonClick = (userId: string) => {
    setSelectedUserId(prev => (prev === userId ? null : userId));
  };

  const toggleClientFilter = (client: string) => {
    setClientFilter(prev =>
      prev.includes(client) ? prev.filter(c => c !== client) : [...prev, client]
    );
  };

  const toggleTemplateFilter = (templateId: string) => {
    setTemplateFilter(prev =>
      prev.includes(templateId) ? prev.filter(t => t !== templateId) : [...prev, templateId]
    );
  };

  const toggleCellExpand = (userId: string, date: string) => {
    const key = `${userId}-${date}`;
    setExpandedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleContinuousBlockClick = (userId: string, block: { start: string; end: string; count: number }) => {
    const workload = personWorkloads.get(userId);
    if (!workload) return;

    const allTasks: { node: ProjectNode; project: Project }[] = [];
    const seenNodes = new Set<string>();

    for (const date of getDateRange(block.start, block.end)) {
      const tasks = workload.dailyTasks.get(date) || [];
      for (const task of tasks) {
        if (!seenNodes.has(task.node.id) && isNodeActive(task.node.status)) {
          seenNodes.add(task.node.id);
          allTasks.push(task);
        }
      }
    }

    setConflictModal({
      user: workload.user,
      start: block.start,
      end: block.end,
      tasks: allTasks,
    });
  };

  const getLoadIndicator = (level: 'idle' | 'moderate' | 'overload'): string => {
    switch (level) {
      case 'overload': return '🔴';
      case 'moderate': return '🟡';
      default: return '🟢';
    }
  };

  const getHeatmapColor = (count: number): string => {
    if (count === 0) return 'bg-slate-100';
    if (count === 1) return 'bg-emerald-200';
    if (count === 2) return 'bg-amber-200';
    if (count === 3) return 'bg-orange-300';
    return 'bg-red-400';
  };

  const getMonthLabel = (date: string): string => {
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  };

  const getWeekdayLabel = (date: string): string => {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const d = new Date(date);
    return weekdays[d.getDay()];
  };

  const isWeekend = (date: string): boolean => {
    const d = new Date(date);
    return d.getDay() === 0 || d.getDay() === 6;
  };

  const isToday = (date: string): boolean => {
    return date === getTodayISO();
  };

  const monthGroups = useMemo(() => {
    const groups: { label: string; startIdx: number; span: number }[] = [];
    let currentMonth = '';
    let startIdx = 0;

    weekDates.forEach((date, idx) => {
      const month = getMonthLabel(date);
      if (month !== currentMonth) {
        if (currentMonth) {
          groups.push({ label: currentMonth, startIdx, span: idx - startIdx });
        }
        currentMonth = month;
        startIdx = idx;
      }
    });
    if (currentMonth) {
      groups.push({ label: currentMonth, startIdx, span: weekDates.length - startIdx });
    }
    return groups;
  }, [weekDates]);

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">执行中心</h1>
            <p className="text-slate-500 mt-1">人员负载周视图 - 查看团队成员未来两周任务安排</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => onViewChange('list')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-slate-500 hover:text-slate-700 transition-colors"
            >
              <List className="w-4 h-4" />
              列表视图
            </button>
            <button
              onClick={() => onViewChange('gantt')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-slate-500 hover:text-slate-700 transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              甘特图视图
            </button>
            <button
              onClick={() => onViewChange('workload')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-white text-slate-800 shadow-sm transition-colors"
            >
              <Target className="w-4 h-4" />
              周负载视图
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
            >
              <option value="all">全部负责人</option>
              {allAssignees.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white hover:border-slate-400 transition-colors">
                <span className="text-slate-500">按客户筛选</span>
                {clientFilter.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full">
                    {clientFilter.length}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400 rotate-90" />
              </button>
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-48 max-h-64 overflow-y-auto hidden group-hover:block">
                <div className="p-2">
                  {uniqueClients.map(client => (
                    <label key={client} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={clientFilter.includes(client)}
                        onChange={() => toggleClientFilter(client)}
                        className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500"
                      />
                      <span className="text-slate-700">{client}</span>
                    </label>
                  ))}
                  {clientFilter.length > 0 && (
                    <button
                      onClick={() => setClientFilter([])}
                      className="w-full text-left px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 border-t border-slate-100 mt-1 pt-2"
                    >
                      清除筛选
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white hover:border-slate-400 transition-colors">
                <span className="text-slate-500">按模板筛选</span>
                {templateFilter.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-violet-500 text-white text-xs font-bold rounded-full">
                    {templateFilter.length}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400 rotate-90" />
              </button>
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-48 max-h-64 overflow-y-auto hidden group-hover:block">
                <div className="p-2">
                  {templates.map((template: WorkflowTemplate) => (
                    <label key={template.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={templateFilter.includes(template.id)}
                        onChange={() => toggleTemplateFilter(template.id)}
                        className="w-4 h-4 text-violet-500 rounded focus:ring-violet-500"
                      />
                      <span className="text-slate-700">{template.name}</span>
                    </label>
                  ))}
                  {templateFilter.length > 0 && (
                    <button
                      onClick={() => setTemplateFilter([])}
                      className="w-full text-left px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 border-t border-slate-100 mt-1 pt-2"
                    >
                      清除筛选
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={handlePrevWeek}
                className="p-1.5 rounded-md hover:bg-white transition-colors"
                title="上一周"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={handleToday}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  weekStart === getMondayOfWeek(getTodayISO())
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                未来两周
              </button>
              <button
                onClick={handleNextWeek}
                className="p-1.5 rounded-md hover:bg-white transition-colors"
                title="下一周"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>{formatDate(weekDates[0])} - {formatDate(weekDates[weekDates.length - 1])}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 overflow-hidden flex">
          <div
            ref={leftPanelRef}
            onScroll={syncScroll}
            className="flex-shrink-0 overflow-y-auto border-r border-slate-200"
            style={{ width: LEFT_PANEL_WIDTH }}
          >
            <div
              className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 px-4 flex items-center font-semibold text-sm text-slate-600"
              style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}
            >
              执行人员
            </div>
            {sortedUserIds.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                暂无符合条件的人员
              </div>
            ) : (
              <div className="relative">
                {sortedUserIds.map((userId) => {
                  const workload = personWorkloads.get(userId)!;
                  const { user, loadLevel, activeTaskCount } = workload;
                  const isSelected = selectedUserId === userId;

                  return (
                    <div
                      key={userId}
                      onClick={() => handlePersonClick(userId)}
                      className={`px-4 flex items-center gap-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-amber-50' : ''
                      }`}
                      style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                    >
                      <Avatar src={user.avatar} alt={user.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800 truncate">
                            {user.name}
                          </span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 flex-shrink-0">
                            {roleLabels[user.role]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs">{getLoadIndicator(loadLevel)}</span>
                          <span className="text-xs text-slate-500">
                            {activeTaskCount} 个任务
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto border-b border-slate-200 flex-shrink-0">
              <div
                className="relative flex"
                style={{
                  minWidth: weekDates.length * DAY_WIDTH,
                }}
              >
                <div className="flex w-full" style={{ height: ROW_HEIGHT / 2 }}>
                  {monthGroups.map((group, idx) => (
                    <div
                      key={`month-${idx}`}
                      className="flex-shrink-0 flex items-center justify-center text-xs text-slate-500 border-r border-slate-100 bg-slate-50"
                      style={{ width: group.span * DAY_WIDTH }}
                    >
                      {group.label}
                    </div>
                  ))}
                </div>
                <div className="flex w-full" style={{ height: ROW_HEIGHT / 2 }}>
                  {weekDates.map((date) => {
                    const d = new Date(date);
                    const day = d.getDate();
                    const weekday = getWeekdayLabel(date);
                    const weekend = isWeekend(date);
                    const today = isToday(date);

                    return (
                      <div
                        key={date}
                        className={`flex-shrink-0 flex flex-col items-center justify-center text-xs border-r border-slate-100 relative ${
                          today ? 'bg-amber-50' : weekend ? 'bg-slate-50' : 'bg-white'
                        }`}
                        style={{ width: DAY_WIDTH, height: ROW_HEIGHT / 2 }}
                      >
                        <span className={`text-slate-400 ${today ? 'text-amber-600 font-semibold' : ''}`}>
                          {weekday}
                        </span>
                        <span className={`font-medium ${today ? 'text-amber-600 font-bold' : 'text-slate-600'}`}>
                          {day}
                        </span>
                        {today && (
                          <div className="absolute top-0 right-1 bg-red-500 text-white text-[10px] px-1 rounded">
                            今天
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {weekDates.some(d => isToday(d)) && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                    style={{ left: weekDates.findIndex(d => isToday(d)) * DAY_WIDTH }}
                  />
                )}
              </div>
            </div>

            <div
              ref={timelineRef}
              onScroll={syncScrollLeft}
              className="flex-1 overflow-auto"
            >
              <div
                className="relative"
                style={{
                  minWidth: weekDates.length * DAY_WIDTH,
                  minHeight: sortedUserIds.length * ROW_HEIGHT + ROW_HEIGHT,
                }}
              >
                {weekDates.map((date, colIdx) => {
                  const weekend = isWeekend(date);
                  const today = isToday(date);
                  return (
                    <div
                      key={`bg-${date}`}
                      className={`absolute top-0 border-r border-slate-100 ${
                        today ? 'bg-amber-50/30' : weekend ? 'bg-slate-50/50' : ''
                      }`}
                      style={{
                        left: colIdx * DAY_WIDTH,
                        width: DAY_WIDTH,
                        height: '100%',
                      }}
                    />
                  );
                })}

                {sortedUserIds.map((userId, rowIdx) => {
                  const workload = personWorkloads.get(userId)!;
                  const isSelected = selectedUserId === userId;

                  return (
                    <div
                      key={`row-${userId}`}
                      className="relative"
                      style={{ top: rowIdx * ROW_HEIGHT, height: ROW_HEIGHT }}
                    >
                      <div className="absolute left-0 right-0 border-b border-slate-100" />

                      {workload.continuousBlocks.map((block, blockIdx) => {
                        const startIdx = weekDates.findIndex(d => d === block.start);
                        const endIdx = weekDates.findIndex(d => d === block.end);
                        if (startIdx === -1 || endIdx === -1) return null;

                        return (
                          <div
                            key={`block-${userId}-${blockIdx}`}
                            className="absolute top-1 bottom-1 bg-orange-100/50 border-b-2 border-dashed border-orange-400 cursor-pointer hover:bg-orange-100/80 transition-colors rounded"
                            style={{
                              left: startIdx * DAY_WIDTH + 2,
                              width: (endIdx - startIdx + 1) * DAY_WIDTH - 4,
                            }}
                            onClick={() => handleContinuousBlockClick(userId, block)}
                            title="点击查看冲突任务"
                          >
                            <div className="absolute top-0 left-0 bg-red-500 text-white text-[9px] font-bold rounded-br px-1 h-3.5">
                              爆
                            </div>
                          </div>
                        );
                      })}

                      {weekDates.map((date, colIdx) => {
                        const tasks = workload.dailyTasks.get(date) || [];
                        const cellKey = `${userId}-${date}`;
                        const isExpanded = expandedCells.has(cellKey);
                        const displayTasks = isExpanded ? tasks : tasks.slice(0, 1);
                        const hasMore = tasks.length > 1;

                        if (tasks.length === 0) return null;

                        return (
                          <div
                            key={`cell-${userId}-${date}`}
                            className={`absolute top-1 bottom-1 px-1 py-0.5 flex flex-col gap-1 ${
                              isSelected ? 'bg-amber-50' : ''
                            }`}
                            style={{
                              left: colIdx * DAY_WIDTH,
                              width: DAY_WIDTH,
                              zIndex: isExpanded ? 10 : 1,
                            }}
                          >
                            {displayTasks.map(({ node, project }, taskIdx) => {
                              const borderColors: Record<Status, string> = {
                                pending: 'border-l-slate-400',
                                in_progress: 'border-l-amber-500',
                                pending_approval: 'border-l-violet-500',
                                completed: 'border-l-emerald-500',
                                delayed: 'border-l-red-500',
                                rejected: 'border-l-orange-500',
                              };

                              return (
                                <div
                                  key={node.id}
                                  className={`text-xs rounded border-l-3 px-1.5 py-1 cursor-pointer truncate border ${
                                    statusBorderColors[node.status]
                                  } ${borderColors[node.status]} hover:shadow-md transition-shadow`}
                                  style={{ borderLeftWidth: '3px' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/projects/${project.id}`);
                                  }}
                                  onMouseEnter={(e) => {
                                    setHoveredTask({
                                      node,
                                      project,
                                      x: e.clientX,
                                      y: e.clientY,
                                    });
                                  }}
                                  onMouseLeave={() => setHoveredTask(null)}
                                >
                                  <div className="font-medium text-slate-700 truncate" title={node.name}>
                                    {truncate(node.name, 6)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate" title={project.name}>
                                    {truncate(project.clientName, 4)}
                                  </div>
                                </div>
                              );
                            })}
                            {hasMore && !isExpanded && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCellExpand(userId, date);
                                }}
                                className="text-[10px] text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded px-1 py-0.5 transition-colors"
                              >
                                +{tasks.length - 1} 更多
                              </button>
                            )}
                            {isExpanded && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCellExpand(userId, date);
                                }}
                                className="text-[10px] text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded px-1 py-0.5 transition-colors"
                              >
                                收起
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {weekDates.some(d => isToday(d)) && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: 0 }}
                  >
                    <div
                      className="border-l-2 border-dashed border-red-500"
                      style={{
                        marginLeft: weekDates.findIndex(d => isToday(d)) * DAY_WIDTH,
                        height: sortedUserIds.length * ROW_HEIGHT + ROW_HEIGHT,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className="border-t border-slate-200 bg-slate-50 px-4 py-3 overflow-x-auto"
          style={{ minHeight: BOTTOM_SUMMARY_HEIGHT }}
        >
          <div className="flex items-start gap-4">
            <span className="text-sm font-semibold text-slate-600 flex-shrink-0 pt-1">
              任务热图
            </span>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {sortedUserIds.map((userId) => {
                const workload = personWorkloads.get(userId)!;
                return (
                  <div key={`heat-${userId}`} className="flex-shrink-0">
                    <div className="text-xs text-slate-600 font-medium mb-1 truncate" style={{ maxWidth: 60 }}>
                      {workload.user.name}
                    </div>
                    <div className="flex gap-0.5">
                      {weekDates.map((date) => {
                        const tasks = workload.dailyTasks.get(date) || [];
                        const activeCount = tasks.filter(t => isNodeActive(t.node.status)).length;

                        return (
                          <div
                            key={`heat-${userId}-${date}`}
                            className={`w-3 h-3 rounded-sm cursor-pointer transition-transform hover:scale-125 ${getHeatmapColor(activeCount)}`}
                            onMouseEnter={(e) => {
                              setHeatmapTooltip({
                                user: workload.user,
                                date,
                                count: activeCount,
                                x: e.clientX,
                                y: e.clientY,
                              });
                            }}
                            onMouseLeave={() => setHeatmapTooltip(null)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <div className="w-3 h-3 rounded-sm bg-slate-100" />
                <span>0</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <div className="w-3 h-3 rounded-sm bg-emerald-200" />
                <span>1</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <div className="w-3 h-3 rounded-sm bg-amber-200" />
                <span>2</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <div className="w-3 h-3 rounded-sm bg-orange-300" />
                <span>3</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <div className="w-3 h-3 rounded-sm bg-red-400" />
                <span>4+</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {hoveredTask && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-800 text-white rounded-lg shadow-xl p-4 max-w-xs"
          style={{
            left: hoveredTask.x + 12,
            top: hoveredTask.y + 12,
          }}
        >
          <div className="font-semibold text-sm mb-2">{hoveredTask.node.name}</div>
          <div className="space-y-1 text-xs text-slate-300">
            <div className="flex justify-between gap-4">
              <span>项目:</span>
              <span className="text-white">{hoveredTask.project.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>客户:</span>
              <span className="text-white">{hoveredTask.project.clientName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>状态:</span>
              <span className={statusColors[hoveredTask.node.status].replace('bg-', 'text-').replace('-100', '-400').replace('-700', '-300')}>
                {statusLabels[hoveredTask.node.status]}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>负责人:</span>
              <span className="text-white">{getUserById(hoveredTask.node.assigneeId)?.name || '-'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>开始:</span>
              <span className="text-white">{formatDate(getNodeStart(hoveredTask.node, hoveredTask.project.startDate))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>结束:</span>
              <span className="text-white">{formatDate(getNodeEnd(hoveredTask.node))}</span>
            </div>
          </div>
        </div>
      )}

      {heatmapTooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-800 text-white rounded-lg shadow-lg px-3 py-2 text-xs"
          style={{
            left: heatmapTooltip.x + 8,
            top: heatmapTooltip.y + 8,
          }}
        >
          {formatDate(heatmapTooltip.date)}，{heatmapTooltip.user.name}，{heatmapTooltip.count}个任务
        </div>
      )}

      <Modal
        isOpen={!!conflictModal}
        onClose={() => setConflictModal(null)}
        title={`任务冲突 - ${conflictModal?.user.name}`}
      >
        {conflictModal && (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-orange-700 font-medium text-sm">
                <Target className="w-4 h-4" />
                <span>连续 {conflictModal.end === conflictModal.start ? 1 : daysBetween(conflictModal.start, conflictModal.end) + 1} 天排满</span>
              </div>
              <div className="text-xs text-orange-600 mt-1">
                {formatDate(conflictModal.start)} - {formatDate(conflictModal.end)}
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {conflictModal.tasks.map(({ node, project }) => (
                <div
                  key={node.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 hover:border-amber-300 hover:bg-amber-50/50 cursor-pointer transition-colors"
                  onClick={() => {
                    navigate(`/projects/${project.id}`);
                    setConflictModal(null);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-slate-800">{node.name}</div>
                      <div className="text-xs text-slate-500 mt-1">{project.name}</div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[node.status]}`}>
                      {statusLabels[node.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(getNodeStart(node, project.startDate))} - {formatDate(getNodeEnd(node))}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      <span>{getUserById(node.assigneeId)?.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConflictModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
