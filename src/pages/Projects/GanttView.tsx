import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, List, BarChart3, ChevronRight, Filter } from 'lucide-react';
import { useProjectStore, useUserStore } from '@/store';
import { Avatar } from '@/components/Avatar';
import { formatDate, daysBetween, getTodayISO, addDays } from '@/utils';
import { statusLabels, statusBorderColors } from '@/utils/status';
import type { Project, ProjectNode, Status } from '@/types';

interface GanttViewProps {
  onViewChange: (view: 'list' | 'gantt') => void;
}

const DAY_WIDTH = 40;
const ROW_HEIGHT = 40;
const LEFT_PANEL_WIDTH = 280;

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

const getWorkloadIndicator = (userId: string, allProjects: Project[]): { emoji: string; label: string } => {
  let count = 0;
  for (const p of allProjects) {
    for (const n of p.nodes) {
      if (n.assigneeId === userId && (n.status === 'in_progress' || n.status === 'delayed' || n.status === 'pending_approval')) {
        count++;
      }
    }
  }
  if (count <= 1) return { emoji: '🟢', label: '空闲' };
  if (count <= 3) return { emoji: '🟡', label: '适中' };
  return { emoji: '🔴', label: '过载' };
};

export const GanttView = ({ onViewChange }: GanttViewProps) => {
  const navigate = useNavigate();
  const { projects, checkAndUpdateOverdue } = useProjectStore();
  const { currentUser, getUserById } = useUserStore();
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
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

  const { flattenedRows, globalStart, globalEnd, criticalPathMap } = useMemo(() => {
    let minDate = '';
    let maxDate = '';
    const rows: FlattenedRow[] = [];
    const critMap = new Map<string, Set<string>>();

    const filteredProjects = myProjects.filter(project => {
      if (dateStart && project.endDate < dateStart) return false;
      if (dateEnd && project.startDate > dateEnd) return false;
      return true;
    });

    for (const project of filteredProjects) {
      critMap.set(project.id, computeCriticalPath(project));
      const hasMatchingNodes = project.nodes.some(node => {
        if (assigneeFilter !== 'all' && node.assigneeId !== assigneeFilter) return false;
        if (statusFilter.length > 0 && !statusFilter.includes(node.status)) return false;
        return true;
      });
      if (!hasMatchingNodes) continue;

      rows.push({ type: 'project', project });
      const projectStart = project.startDate;
      const projectEnd = project.endDate;
      if (!minDate || projectStart < minDate) minDate = projectStart;
      if (!maxDate || projectEnd > maxDate) maxDate = projectEnd;

      for (const node of project.nodes) {
        if (assigneeFilter !== 'all' && node.assigneeId !== assigneeFilter) continue;
        if (statusFilter.length > 0 && !statusFilter.includes(node.status)) continue;
        rows.push({ type: 'node', project, node });
        const ns = getNodeStart(node, projectStart);
        const ne = getNodeEnd(node);
        if (ns < minDate) minDate = ns;
        if (ne > maxDate) maxDate = ne;
      }
    }

    if (minDate) minDate = addDays(minDate, -3);
    if (maxDate) maxDate = addDays(maxDate, 3);

    return {
      flattenedRows: rows,
      globalStart: minDate || getTodayISO(),
      globalEnd: maxDate || addDays(getTodayISO(), 30),
      criticalPathMap: critMap,
    };
  }, [myProjects, assigneeFilter, statusFilter, dateStart, dateEnd]);

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

  const statusOptions: Status[] = ['pending', 'in_progress', 'pending_approval', 'completed', 'delayed', 'rejected'];

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
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
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
      </div>

      <div className="flex-1 overflow-hidden flex bg-white">
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
            flattenedRows.map((row, idx) => {
              if (row.type === 'project') {
                return (
                  <div
                    key={`project-${row.project.id}-${idx}`}
                    className="px-4 flex items-center border-b border-slate-100 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-colors"
                    style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                    onClick={() => navigate(`/projects/${row.project.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="font-semibold text-sm text-slate-800 truncate">
                          {row.project.name}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
              const node = row.node!;
              const assignee = getUserById(node.assigneeId);
              const workload = getWorkloadIndicator(node.assigneeId, projects);
              return (
                <div
                  key={`node-${node.id}-${idx}`}
                  className="px-4 flex items-center border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
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
                      <span title={workload.label} className="text-xs">{workload.emoji}</span>
                      <Avatar src={assignee.avatar} alt={assignee.name} size="sm" />
                    </div>
                  )}
                </div>
              );
            })
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
                  return (
                    <div key={`projline-${rowIdx}`}>
                      <div
                        className="absolute left-0 right-0 border-b border-slate-200/60"
                        style={{ top: rowIdx * ROW_HEIGHT + ROW_HEIGHT }}
                      />
                      <div
                        className="absolute rounded-md bg-slate-200/60 border border-slate-300/60 cursor-pointer hover:bg-slate-200 transition-colors"
                        style={{
                          left: startOffset + 4,
                          top: rowIdx * ROW_HEIGHT + ROW_HEIGHT + 8,
                          width: Math.max(4, width - 8),
                          height: ROW_HEIGHT - 16,
                        }}
                        onClick={() => navigate(`/projects/${row.project.id}`)}
                        title={`${row.project.name} (${formatDate(row.project.startDate)} - ${formatDate(row.project.endDate)})`}
                      />
                    </div>
                  );
                }
                const node = row.node!;
                const nodeStart = getNodeStart(node, row.project.startDate);
                const startOffset = daysBetween(globalStart, nodeStart) * DAY_WIDTH;
                const duration = getNodeDuration(node, row.project.startDate);
                const width = duration * DAY_WIDTH;
                const isCritical = criticalPathMap.get(row.project.id)?.has(node.id);
                const isToday = todayPosition >= startOffset && todayPosition <= startOffset + width;

                const bgClass = statusBorderColors[node.status] || 'bg-slate-50 border-slate-300';
                const borderColors: Record<Status, string> = {
                  pending: 'border-l-slate-400',
                  in_progress: 'border-l-amber-500',
                  pending_approval: 'border-l-violet-500',
                  completed: 'border-l-emerald-500',
                  delayed: 'border-l-red-500',
                  rejected: 'border-l-orange-500',
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
                      } ${isToday ? 'ring-1 ring-red-300' : ''}`}
                      style={{
                        left: startOffset + 2,
                        top: rowIdx * ROW_HEIGHT + ROW_HEIGHT + 6,
                        width: Math.max(8, width - 4),
                        height: ROW_HEIGHT - 12,
                      }}
                      onClick={() => navigate(`/projects/${row.project.id}`)}
                      onMouseEnter={(e) => {
                        setHoveredNode({
                          node,
                          project: row.project,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      onMouseLeave={() => setHoveredNode(null)}
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
          </div>
        </div>
      )}
    </div>
  );
};
