import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, List, BarChart3, ChevronRight, Filter, Layers, Building2, Zap, AlertTriangle } from 'lucide-react';
import { useProjectStore, useUserStore, useTemplateStore } from '@/store';
import { Avatar } from '@/components/Avatar';
import { formatDate, daysBetween, getTodayISO, addDays, getDateRange, getProjectRiskLevel, isNodeRisky, isNodeOverdue } from '@/utils';
import { statusLabels, statusBorderColors } from '@/utils/status';
import type { Project, ProjectNode, Status, User } from '@/types';

interface GanttViewProps {
  onViewChange: (view: 'list' | 'gantt' | 'workload') => void;
}

const DAY_WIDTH = 40;
const ROW_HEIGHT = 40;
const LEFT_PANEL_WIDTH = 280;
const BOTTOM_SUMMARY_HEIGHT = 48;
const RISK_INDICATOR_WIDTH = 2;

type RiskLevel = 'normal' | 'warning' | 'danger';

const getNodeStart = (node: ProjectNode, projectStart: string): string => {
  return node.actualStartDate || projectStart;
};

const getNodeEnd = (node: ProjectNode): string => {
  return node.actualEndDate || node.dueDate;
};

const getNodeDuration = (node: ProjectNode, projectStart: string): number => {
  const start = getNodeStart(node, projectStart);
  const end = getNodeEnd(node);
  return Math.max(1, daysBetween(start, end));
};

interface FlattenedRow {
  type: 'project' | 'node';
  project: Project;
  node?: ProjectNode;
}

const computeCriticalPath = (project: Project): Set<string> => {
  const criticalPaths = new Set<string>();
  const nodeMap = new Map(project.nodes.map(n => [n.id, n]));
  const memo = new Map<string, { path: string[]; duration: number }>();

  const dfs = (nodeId: string): { path: string[]; duration: number } => {
    if (memo.has(nodeId)) return memo.get(nodeId)!;
    const node = nodeMap.get(nodeId);
    if (!node) return { path: [], duration: 0 };

    const prereqs = node.prerequisites.filter(preId => nodeMap.has(preId));
    if (prereqs.length === 0) {
      const duration = getNodeDuration(node, project.startDate);
      const result = { path: [nodeId], duration };
      memo.set(nodeId, result);
      return result;
    }

    let best: { path: string[]; duration: number } = { path: [], duration: 0 };
    for (const preId of prereqs) {
      const preResult = dfs(preId);
      if (preResult.duration > best.duration) {
        best = preResult;
      }
    }

    const duration = best.duration + getNodeDuration(node, project.startDate);
    const result = { path: [...best.path, nodeId], duration };
    memo.set(nodeId, result);
    return result;
  };

  let bestPath: string[] = [];
  let maxDuration = 0;
  for (const node of project.nodes) {
    const result = dfs(node.id);
    if (result.duration > maxDuration) {
      maxDuration = result.duration;
      bestPath = result.path;
    }
  }

  bestPath.forEach(id => criticalPaths.add(id));
  return criticalPaths;
};

interface PersonLoad {
  ratio: number;
  taskCount: number;
  isOverloaded: boolean;
  activeTaskCount: number;
}

const getPersonLoad = (userId: string, projects: Project[], totalDays: number): PersonLoad => {
  let assignedDays = 0;
  let activeTaskCount = 0;
  const activeStatuses: Status[] = ['in_progress', 'pending', 'pending_approval', 'delayed', 'rejected'];

  for (const p of projects) {
    for (const n of p.nodes) {
      if (n.assigneeId === userId) {
        const duration = getNodeDuration(n, p.startDate);
        assignedDays += duration;
        if (activeStatuses.includes(n.status)) {
          activeTaskCount++;
        }
      }
    }
  }

  return {
    ratio: totalDays > 0 ? Math.min(1, assignedDays / totalDays) : 0,
    taskCount: assignedDays,
    isOverloaded: activeTaskCount >= 4,
    activeTaskCount,
  };
};



const isOnCriticalPath = (project: Project, nodeId: string, criticalPathMap: Map<string, Set<string>>): boolean => {
  return criticalPathMap.get(project.id)?.has(nodeId) || false;
};

const checkContinuousOverload = (userId: string, projects: Project[]): boolean => {
  const intervals: { start: string; end: string }[] = [];

  for (const p of projects) {
    for (const n of p.nodes) {
      if (n.assigneeId === userId && n.status !== 'completed') {
        intervals.push({
          start: getNodeStart(n, p.startDate),
          end: getNodeEnd(n),
        });
      }
    }
  }

  if (intervals.length < 2) return false;

  const allDates: string[] = [];
  for (const interval of intervals) {
    allDates.push(...getDateRange(interval.start, interval.end));
  }

  const uniqueDates = Array.from(new Set(allDates)).sort();
  for (let i = 0; i <= uniqueDates.length - 3; i++) {
    const windowDates = uniqueDates.slice(i, i + 3);
    const overlappingTasks = windowDates.filter(date => {
      let count = 0;
      for (const interval of intervals) {
        if (date >= interval.start && date <= interval.end) count++;
        if (count >= 2) return true;
      }
      return count >= 2;
    });
    if (overlappingTasks.length >= 3) return true;
  }

  return false;
};

const isNodeInContinuousOverload = (node: ProjectNode, projectStart: string, userId: string, projects: Project[]): boolean => {
  if (!checkContinuousOverload(userId, projects)) return false;

  const nodeDates = getDateRange(getNodeStart(node, projectStart), getNodeEnd(node));
  const intervals: { start: string; end: string }[] = [];

  for (const p of projects) {
    for (const n of p.nodes) {
      if (n.assigneeId === userId && n.status !== 'completed' && n.id !== node.id) {
        intervals.push({
          start: getNodeStart(n, p.startDate),
          end: getNodeEnd(n),
        });
      }
    }
  }

  for (const date of nodeDates) {
    let overlapCount = 1;
    for (const interval of intervals) {
      if (date >= interval.start && date <= interval.end) overlapCount++;
    }
    if (overlapCount >= 2) return true;
  }

  return false;
};

interface PersonSummary {
  user: User;
  load: PersonLoad;
  continuousOverload: boolean;
}

export const GanttView = ({ onViewChange }: GanttViewProps) => {
  const navigate = useNavigate();
  const { projects, checkAndUpdateOverdue } = useProjectStore();
  const { currentUser, getUserById, users } = useUserStore();
  const { templates } = useTemplateStore();

  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [criticalPathOnly, setCriticalPathOnly] = useState<boolean>(false);
  const [overloadedOnly, setOverloadedOnly] = useState<boolean>(false);

  const [hoveredNode, setHoveredNode] = useState<{ node: ProjectNode; project: Project; x: number; y: number } | null>(null);
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
    return Array.from(set).map(id => getUserById(id)).filter(Boolean);
  }, [myProjects, getUserById]);

  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    myProjects.forEach(p => {
      if (p.clientName) set.add(p.clientName);
    });
    return Array.from(set).sort();
  }, [myProjects]);

  const totalTimeframeDays = useMemo(() => {
    let minDate = '';
    let maxDate = '';
    for (const p of myProjects) {
      if (!minDate || p.startDate < minDate) minDate = p.startDate;
      if (!maxDate || p.endDate > maxDate) maxDate = p.endDate;
      for (const n of p.nodes) {
        const ns = getNodeStart(n, p.startDate);
        const ne = getNodeEnd(n);
        if (ns < minDate) minDate = ns;
        if (ne > maxDate) maxDate = ne;
      }
    }
    if (!minDate || !maxDate) return 30;
    return daysBetween(minDate, maxDate) + 1;
  }, [myProjects]);

  const overloadedUsers = useMemo(() => {
    const set = new Set<string>();
    const activeStatuses: Status[] = ['in_progress', 'pending', 'pending_approval', 'delayed', 'rejected'];
    const countMap = new Map<string, number>();
    for (const p of myProjects) {
      for (const n of p.nodes) {
        if (activeStatuses.includes(n.status)) {
          countMap.set(n.assigneeId, (countMap.get(n.assigneeId) || 0) + 1);
        }
      }
    }
    countMap.forEach((count, userId) => {
      if (count >= 4) set.add(userId);
    });
    return set;
  }, [myProjects]);

  const continuousOverloadUsers = useMemo(() => {
    const set = new Set<string>();
    for (const user of users) {
      if (checkContinuousOverload(user.id, myProjects)) {
        set.add(user.id);
      }
    }
    return set;
  }, [users, myProjects]);

  const { flattenedRows, globalStart, globalEnd, criticalPathMap, projectRiskMap, projectRowSpanMap } = useMemo(() => {
    let minDate = '';
    let maxDate = '';
    const rows: FlattenedRow[] = [];
    const critMap = new Map<string, Set<string>>();
    const riskMap = new Map<string, RiskLevel>();
    const rowSpanMap = new Map<string, number>();

    const filteredProjects = myProjects.filter(project => {
      if (templateFilter !== 'all' && project.templateId !== templateFilter) return false;
      if (clientFilter !== 'all' && project.clientName !== clientFilter) return false;
      if (dateStart && project.endDate < dateStart) return false;
      if (dateEnd && project.startDate > dateEnd) return false;
      return true;
    });

    for (const project of filteredProjects) {
      critMap.set(project.id, computeCriticalPath(project));
      riskMap.set(project.id, getProjectRiskLevel(project));

      const matchingNodes = project.nodes.filter(node => {
        if (assigneeFilter !== 'all' && node.assigneeId !== assigneeFilter) return false;
        if (statusFilter.length > 0 && !statusFilter.includes(node.status)) return false;
        if (criticalPathOnly && !isOnCriticalPath(project, node.id, critMap)) return false;
        if (overloadedOnly && !overloadedUsers.has(node.assigneeId)) return false;
        return true;
      });

      if (matchingNodes.length === 0) continue;

      const projectRowIndex = rows.length;
      rows.push({ type: 'project', project });
      const projectStart = project.startDate;
      const projectEnd = project.endDate;
      if (!minDate || projectStart < minDate) minDate = projectStart;
      if (!maxDate || projectEnd > maxDate) maxDate = projectEnd;

      for (const node of matchingNodes) {
        rows.push({ type: 'node', project, node });
        const ns = getNodeStart(node, projectStart);
        const ne = getNodeEnd(node);
        if (ns < minDate) minDate = ns;
        if (ne > maxDate) maxDate = ne;
      }

      rowSpanMap.set(project.id, rows.length - projectRowIndex);
    }

    if (minDate) minDate = addDays(minDate, -3);
    if (maxDate) maxDate = addDays(maxDate, 3);

    return {
      flattenedRows: rows,
      globalStart: minDate || getTodayISO(),
      globalEnd: maxDate || addDays(getTodayISO(), 30),
      criticalPathMap: critMap,
      projectRiskMap: riskMap,
      projectRowSpanMap: rowSpanMap,
    };
  }, [myProjects, assigneeFilter, statusFilter, dateStart, dateEnd, templateFilter, clientFilter, criticalPathOnly, overloadedOnly, overloadedUsers]);

  const dateList = useMemo(() => {
    const dates: string[] = [];
    const totalDays = daysBetween(globalStart, globalEnd) + 1;
    for (let i = 0; i < totalDays; i++) {
      dates.push(addDays(globalStart, i));
    }
    return dates;
  }, [globalStart, globalEnd]);

  const todayPosition = useMemo(() => {
    const today = getTodayISO();
    if (today < globalStart || today > globalEnd) return -1;
    return daysBetween(globalStart, today) * DAY_WIDTH;
  }, [globalStart, globalEnd]);

  const personSummaries = useMemo<PersonSummary[]>(() => {
    const assigneeIds = new Set<string>();
    myProjects.forEach(p => p.nodes.forEach(n => assigneeIds.add(n.assigneeId)));
    return Array.from(assigneeIds)
      .map(id => {
        const user = getUserById(id);
        if (!user) return null;
        return {
          user,
          load: getPersonLoad(id, myProjects, totalTimeframeDays),
          continuousOverload: continuousOverloadUsers.has(id),
        };
      })
      .filter((s): s is PersonSummary => s !== null);
  }, [myProjects, getUserById, totalTimeframeDays, continuousOverloadUsers]);

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

  const toggleStatusFilter = (status: Status) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const handlePersonClick = (userId: string) => {
    setAssigneeFilter(prev => (prev === userId ? 'all' : userId));
  };

  const statusOptions: Status[] = ['pending', 'in_progress', 'pending_approval', 'completed', 'delayed', 'rejected'];

  const getRiskLabel = (level: RiskLevel): { text: string; bg: string; textColor: string; border: string; indicator: string } => {
    switch (level) {
      case 'danger':
        return { text: '快压线！', bg: 'bg-red-500', textColor: 'text-white', border: 'border-red-500', indicator: 'bg-red-500' };
      case 'warning':
        return { text: '临近截止', bg: 'bg-orange-500', textColor: 'text-white', border: 'border-orange-500', indicator: 'bg-orange-500' };
      default:
        return { text: '进度正常', bg: 'bg-emerald-400/80', textColor: 'text-emerald-900', border: 'border-emerald-400', indicator: 'bg-emerald-400' };
    }
  };

  const getLoadColorClass = (ratio: number): string => {
    if (ratio < 0.6) return 'bg-emerald-500';
    if (ratio <= 0.85) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">执行中心</h1>
            <p className="text-slate-500 mt-1">甘特图视图 - 查看和管理所有项目执行进度</p>
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
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-white text-slate-800 shadow-sm transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              甘特图视图
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-white"
            >
              <option value="all">全部模板</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-white"
            >
              <option value="all">全部客户</option>
              {uniqueClients.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
            >
              <option value="all">全部负责人</option>
              {allAssignees.map(user => user && (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  onClick={() => toggleStatusFilter(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:ring-2 focus:ring-amber-500 focus:outline-none ${
                    statusFilter.includes(status)
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  title={statusLabels[status]}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                    status === 'pending' ? 'bg-slate-400' :
                    status === 'in_progress' ? 'bg-amber-500' :
                    status === 'pending_approval' ? 'bg-violet-500' :
                    status === 'completed' ? 'bg-emerald-500' :
                    status === 'delayed' ? 'bg-red-500' :
                    'bg-orange-500'
                  }`} />
                  {statusLabels[status]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
            <span className="text-slate-400">至</span>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
            {(dateStart || dateEnd) && (
              <button
                onClick={() => { setDateStart(''); setDateEnd(''); }}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded"
              >
                清除
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => setCriticalPathOnly(!criticalPathOnly)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all focus:ring-2 focus:ring-violet-500 focus:outline-none ${
              criticalPathOnly
                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
            }`}
          >
            <Zap className={`w-4 h-4 ${criticalPathOnly ? 'text-amber-300' : 'text-slate-400'}`} />
            只看关键路径
          </button>

          <button
            onClick={() => setOverloadedOnly(!overloadedOnly)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all focus:ring-2 focus:ring-violet-500 focus:outline-none ${
              overloadedOnly
                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 ${overloadedOnly ? 'text-red-300' : 'text-slate-400'}`} />
            只看过载人员
          </button>
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
              项目 / 任务
            </div>
            {flattenedRows.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                暂无符合条件的数据
              </div>
            ) : (
              <div className="relative">
                {flattenedRows.map((row, idx) => {
                  if (row.type === 'project') {
                    const riskLevel = projectRiskMap.get(row.project.id) || 'normal';
                    const riskStyle = getRiskLabel(riskLevel);
                    const rowSpan = projectRowSpanMap.get(row.project.id) || 1;
                    return (
                      <div
                        key={`project-${row.project.id}-${idx}`}
                        className="px-4 flex items-center border-b border-slate-100 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-colors relative"
                        style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                        onClick={() => navigate(`/projects/${row.project.id}`)}
                      >
                        <div
                          className={`absolute left-0 top-0 ${riskStyle.indicator}`}
                          style={{
                            width: RISK_INDICATOR_WIDTH,
                            height: rowSpan * ROW_HEIGHT,
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="font-semibold text-sm text-slate-800 truncate">
                              {row.project.name}
                            </span>
                            {riskLevel !== 'normal' && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${riskStyle.bg} ${riskStyle.textColor} flex-shrink-0`}>
                                {riskStyle.text}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const node = row.node!;
                  const assignee = getUserById(node.assigneeId);
                  const isCritical = isOnCriticalPath(row.project, node.id, criticalPathMap);
                  const dimmed = criticalPathOnly && !isCritical;
                  const isOverloadedRow = overloadedUsers.has(node.assigneeId);
                  const hasContinuousOverload = assignee && continuousOverloadUsers.has(assignee.id);

                  return (
                    <div
                      key={`node-${node.id}-${idx}`}
                      className={`px-4 flex items-center border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors relative ${
                        isOverloadedRow && !overloadedOnly ? 'bg-red-50/60' : ''
                      } ${dimmed ? 'opacity-50' : ''}`}
                      style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                      onClick={() => navigate(`/projects/${row.project.id}`)}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2 pl-6">
                        <span className="text-xs text-slate-600 truncate flex-1" title={node.name}>
                          {node.name}
                        </span>
                      </div>
                      {assignee && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {hasContinuousOverload && (
                            <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded px-1 h-4" title="连续3天排满">
                              爆
                            </span>
                          )}
                          <Avatar src={assignee.avatar} alt={assignee.name} size="sm" />
                        </div>
                      )}
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
                  minWidth: dateList.length * DAY_WIDTH,
                  height: ROW_HEIGHT,
                }}
              >
                {dateList.map((date, idx) => {
                  const d = new Date(date);
                  const day = d.getDate();
                  const month = d.getMonth() + 1;
                  const isToday = date === getTodayISO();
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={date}
                      className={`flex-shrink-0 flex flex-col items-center justify-center text-xs border-r border-slate-100 ${
                        isToday ? 'bg-amber-50' : isWeekend ? 'bg-slate-50' : 'bg-white'
                      }`}
                      style={{ width: DAY_WIDTH, height: ROW_HEIGHT }}
                    >
                      <span className={`text-slate-400 ${isToday ? 'text-amber-600 font-semibold' : ''}`}>
                        {month}月
                      </span>
                      <span className={`font-medium ${isToday ? 'text-amber-600 font-bold' : 'text-slate-600'}`}>
                        {day}
                      </span>
                    </div>
                  );
                })}
                {todayPosition >= 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                    style={{ left: todayPosition }}
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
                  minWidth: dateList.length * DAY_WIDTH,
                  minHeight: flattenedRows.length * ROW_HEIGHT + ROW_HEIGHT,
                }}
              >
                {dateList.map((date, colIdx) => {
                  const d = new Date(date);
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = date === getTodayISO();
                  return (
                    <div
                      key={`bg-${date}`}
                      className={`absolute top-0 border-r border-slate-100 ${
                        isToday ? 'bg-amber-50/30' : isWeekend ? 'bg-slate-50/50' : ''
                      }`}
                      style={{
                        left: colIdx * DAY_WIDTH,
                        width: DAY_WIDTH,
                        height: '100%',
                      }}
                    />
                  );
                })}

                {flattenedRows.map((row, rowIdx) => {
                  if (row.type === 'project') {
                    const startOffset = daysBetween(globalStart, row.project.startDate) * DAY_WIDTH;
                    const duration = Math.max(1, daysBetween(row.project.startDate, row.project.endDate));
                    const width = duration * DAY_WIDTH;
                    const riskLevel = projectRiskMap.get(row.project.id) || 'normal';
                    const riskStyle = getRiskLabel(riskLevel);

                    return (
                      <div key={`projline-${rowIdx}`}>
                        <div
                          className="absolute left-0 right-0 border-b border-slate-200/60"
                          style={{ top: rowIdx * ROW_HEIGHT + ROW_HEIGHT }}
                        />
                        <div
                          className={`absolute rounded-md border cursor-pointer hover:opacity-90 transition-opacity ${riskStyle.border} bg-slate-200/60`}
                          style={{
                            left: startOffset + 4,
                            top: rowIdx * ROW_HEIGHT + ROW_HEIGHT + 8,
                            width: Math.max(4, width - 8),
                            height: ROW_HEIGHT - 16,
                          }}
                          onClick={() => navigate(`/projects/${row.project.id}`)}
                          title={`${row.project.name} (${formatDate(row.project.startDate)} - ${formatDate(row.project.endDate)})`}
                        />
                        <div
                          className={`absolute z-20 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${riskStyle.bg} ${riskStyle.textColor}`}
                          style={{
                            left: startOffset + 4,
                            top: rowIdx * ROW_HEIGHT + ROW_HEIGHT - 14,
                          }}
                        >
                          {riskLevel === 'danger' ? '🔴 ' : riskLevel === 'warning' ? '🟠 ' : '🟢 '}
                          {riskStyle.text}
                        </div>
                      </div>
                    );
                  }
                  const node = row.node!;
                  const nodeStart = getNodeStart(node, row.project.startDate);
                  const startOffset = daysBetween(globalStart, nodeStart) * DAY_WIDTH;
                  const duration = getNodeDuration(node, row.project.startDate);
                  const width = duration * DAY_WIDTH;
                  const isCritical = isOnCriticalPath(row.project, node.id, criticalPathMap);
                  const dimmed = criticalPathOnly && !isCritical;
                  const isToday = todayPosition >= startOffset && todayPosition <= startOffset + width;
                  const hasContinuousOverload = isNodeInContinuousOverload(node, row.project.startDate, node.assigneeId, myProjects);
                  const isRisky = node.status !== 'completed' && isNodeRisky(node);
                  const isOverdue = node.status !== 'completed' && isNodeOverdue(node);

                  const bgClass = statusBorderColors[node.status] || 'bg-slate-50 border-slate-300';
                  const borderColors: Record<Status, string> = {
                    pending: 'border-l-slate-400',
                    in_progress: 'border-l-amber-500',
                    pending_approval: 'border-l-violet-500',
                    completed: 'border-l-emerald-500',
                    delayed: 'border-l-red-500',
                    rejected: 'border-l-orange-500',
                  };

                  const dashedBgStyle = hasContinuousOverload ? {
                    backgroundImage: `repeating-linear-gradient(
                      90deg,
                      transparent,
                      transparent 3px,
                      rgba(239, 68, 68, 0.3) 3px,
                      rgba(239, 68, 68, 0.3) 6px
                    )`,
                  } : {};

                  const getRiskBorderClass = () => {
                    if (node.status === 'completed') return '';
                    if (isOverdue) return 'ring-2 ring-red-500 ring-offset-1';
                    if (isRisky) return 'ring-2 ring-orange-400 ring-offset-1';
                    return '';
                  };

                  return (
                    <div key={`nodeline-${rowIdx}-${node.id}`}>
                      <div
                        className="absolute left-0 right-0 border-b border-slate-100"
                        style={{ top: rowIdx * ROW_HEIGHT + ROW_HEIGHT }}
                      />
                      <div
                        className={`absolute rounded-md cursor-pointer border-l-4 transition-all hover:shadow-md ${bgClass} ${borderColors[node.status]} ${
                          isCritical ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                        } ${isToday ? 'ring-1 ring-red-300' : ''} ${dimmed ? 'opacity-50' : ''} ${getRiskBorderClass()} focus:outline-none focus:ring-4 ${isOverdue ? 'focus:ring-red-300' : isRisky ? 'focus:ring-orange-300' : 'focus:ring-amber-300'}`}
                        style={{
                          left: startOffset + 2,
                          top: rowIdx * ROW_HEIGHT + ROW_HEIGHT + 6,
                          width: Math.max(8, width - 4),
                          height: ROW_HEIGHT - 12,
                          ...dashedBgStyle,
                        }}
                        onClick={() => navigate(`/projects/${row.project.id}?nodeId=${node.id}`)}
                        onMouseEnter={(e) => {
                          setHoveredNode({
                            node,
                            project: row.project,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }}
                        onMouseLeave={() => setHoveredNode(null)}
                        tabIndex={0}
                      >
                        {width > 100 && (
                          <div className="px-2 h-full flex items-center">
                            <span className="text-xs font-medium text-slate-700 truncate">
                              {node.name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {todayPosition >= 0 && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: 0 }}
                  >
                    <div
                      className="border-l-2 border-dashed border-red-500"
                      style={{
                        marginLeft: todayPosition,
                        height: flattenedRows.length * ROW_HEIGHT + ROW_HEIGHT,
                      }}
                    >
                      <div className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-r-md -translate-y-0 whitespace-nowrap">
                        今天
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className="border-t border-slate-200 bg-slate-50 px-4 flex items-center gap-4 overflow-x-auto"
          style={{ height: BOTTOM_SUMMARY_HEIGHT, minHeight: BOTTOM_SUMMARY_HEIGHT }}
        >
          <span className="text-sm font-semibold text-slate-600 flex-shrink-0">
            人员负载汇总
          </span>
          <div className="flex items-center gap-4 flex-1 overflow-x-auto pb-1">
            {personSummaries.map(({ user, load, continuousOverload }) => (
              <div
                key={user.id}
                className={`flex items-center gap-2 flex-shrink-0 px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                  assigneeFilter === user.id
                    ? 'bg-violet-100 ring-1 ring-violet-400'
                    : 'hover:bg-white'
                }`}
                onClick={() => handlePersonClick(user.id)}
                title={`点击筛选: ${user.name}`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar src={user.avatar} alt={user.name} size="sm" />
                  {load.isOverloaded && (
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-slate-700">{user.name}</span>
                    {continuousOverload && (
                      <span className="bg-red-500 text-white text-[9px] font-bold rounded px-1 h-3 inline-flex items-center">
                        爆
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getLoadColorClass(load.ratio)}`}
                        style={{ width: `${Math.max(4, load.ratio * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {load.activeTaskCount}个任务
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hoveredNode && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-800 text-white rounded-lg shadow-xl p-4 max-w-xs"
          style={{
            left: hoveredNode.x + 12,
            top: hoveredNode.y + 12,
          }}
        >
          <div className="font-semibold text-sm mb-2">{hoveredNode.node.name}</div>
          <div className="space-y-1 text-xs text-slate-300">
            <div className="flex justify-between gap-4">
              <span>项目:</span>
              <span className="text-white">{hoveredNode.project.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>客户:</span>
              <span className="text-white">{hoveredNode.project.clientName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>状态:</span>
              <span>{statusLabels[hoveredNode.node.status]}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>负责人:</span>
              <span>{getUserById(hoveredNode.node.assigneeId)?.name || '-'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>开始:</span>
              <span>{formatDate(getNodeStart(hoveredNode.node, hoveredNode.project.startDate))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>结束:</span>
              <span>{formatDate(getNodeEnd(hoveredNode.node))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>工期:</span>
              <span>{getNodeDuration(hoveredNode.node, hoveredNode.project.startDate)} 天</span>
            </div>
            {criticalPathMap.get(hoveredNode.project.id)?.has(hoveredNode.node.id) && (
              <div className="text-amber-400 pt-1 border-t border-slate-600 mt-2">
                ⚡ 关键路径节点
              </div>
            )}
            {isNodeInContinuousOverload(
              hoveredNode.node,
              hoveredNode.project.startDate,
              hoveredNode.node.assigneeId,
              myProjects
            ) && (
              <div className="text-red-400 pt-1 border-t border-slate-600 mt-2">
                ⚠️ 人员连续 3 天排满
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
