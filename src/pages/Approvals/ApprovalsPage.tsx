import { useState, useMemo, useRef } from 'react';
import {
  FileCheck,
  RefreshCw,
  Search,
  FilterX,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  FileText,
  Check,
  X,
  Link2,
  ChevronRight,
  History,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
} from 'lucide-react';
import { useProjectStore, useUserStore, useTemplateStore } from '@/store';
import { StatusBadge, NodeTypeBadge } from '@/components/StatusBadge';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import {
  formatDateTime,
  approvalTypeLabels,
  approvalDecisionLabels,
  getDateStatus,
} from '@/utils';
import type { ProjectNode, ApprovalType, Status } from '@/types';

type QuickFilter = 'all' | 'pending_me' | 'approved_me' | 'passed' | 'rejected' | 'manager' | 'admin' | 'multi_level';

interface ApprovalNodeWithProject extends ProjectNode {
  projectName: string;
  projectId: string;
  clientName: string;
  templateName: string;
}

const getApprovalStages = (approvalType: ApprovalType) => {
  if (approvalType === 'manager') {
    return [{ order: 1, role: 'manager' as const, label: '项目经理审批' }];
  }
  if (approvalType === 'admin') {
    return [{ order: 1, role: 'admin' as const, label: '管理员终审' }];
  }
  if (approvalType === 'multi_level') {
    return [
      { order: 1, role: 'manager' as const, label: '项目经理审批' },
      { order: 2, role: 'admin' as const, label: '管理员终审' },
    ];
  }
  return [];
};

const getCurrentStageLabel = (node: ProjectNode): string => {
  const stages = getApprovalStages(node.approvalType);
  if (stages.length === 0) return '-';
  if (stages.length === 1) return stages[0].label;
  const rejected = node.approvalHistory.find((r) => r.decision === 'rejected');
  if (rejected) {
    const stage = stages.find((s) => s.order === rejected.stageOrder);
    return stage?.label || stages[0].label;
  }
  const approvedCount = node.approvalHistory.filter((r) => r.decision === 'approved').length;
  if (approvedCount === 0) return stages[0].label;
  if (approvedCount >= stages.length) return stages[stages.length - 1].label;
  return stages[approvedCount].label;
};

const getApprovalRoundText = (node: ProjectNode): string => {
  const stages = node.approvalStages;
  if (!stages || stages.length === 0) return '-';
  const total = stages.length;

  if (total === 1) {
    if (node.status === 'completed') return '✓ 已完成';
    if (node.status === 'rejected') return '✗ 已退回';
    if (node.status === 'pending_approval') return '审批中';
    return '-';
  }

  const approvedStages = stages.filter((s) => s.status === 'approved').length;
  const rejectedStage = stages.find((s) => s.status === 'rejected');

  if (rejectedStage) {
    return `第${rejectedStage.order}/${total}轮 · 已退回`;
  }

  if (node.status === 'completed') {
    return `${total}/${total}轮 · 已完成`;
  }

  if (node.status === 'pending_approval' && node.currentStageOrder > 0) {
    const currentStageLabel = stages.find((s) => s.order === node.currentStageOrder)?.label || '';
    return `第${node.currentStageOrder}/${total}轮 · ${currentStageLabel}`;
  }

  if (node.status === 'rejected') {
    return `${approvedStages}/${total}轮 · 已退回`;
  }

  return `${approvedStages}/${total}轮`;
};

const getPreviousRoundComment = (node: ProjectNode): { text: string; isReject: boolean } | null => {
  if (!node.approvalHistory || node.approvalHistory.length === 0) return null;
  const latest = node.approvalHistory[node.approvalHistory.length - 1];
  return {
    text: latest.comment || (latest.decision === 'approved' ? '通过' : '退回'),
    isReject: latest.decision === 'rejected',
  };
};

const getApprovalPermission = (node: ProjectNode, userRole: 'admin' | 'manager' | 'executor'): { canApprove: boolean; disabledReason: string | null } => {
  if (node.status !== 'pending_approval') {
    return { canApprove: false, disabledReason: '当前节点不在待审批状态' };
  }
  if (!node.approvalStages || node.approvalStages.length === 0) {
    return { canApprove: false, disabledReason: '未配置审批流程' };
  }
  const currentStageIdx = node.approvalStages.findIndex(s => s.order === node.currentStageOrder);
  if (currentStageIdx < 0) {
    return { canApprove: false, disabledReason: '无效的审批阶段' };
  }
  const currentStage = node.approvalStages[currentStageIdx];
  if (currentStage.status !== 'pending') {
    return { canApprove: false, disabledReason: '当前阶段已被处理' };
  }
  if (currentStage.role !== userRole) {
    const roleLabels: Record<string, string> = { manager: '项目经理', admin: '管理员', executor: '执行人' };
    return { canApprove: false, disabledReason: `此阶段需要${roleLabels[currentStage.role] || currentStage.role}审批` };
  }
  return { canApprove: true, disabledReason: null };
};

const canUserApprove = (node: ProjectNode, userRole: 'admin' | 'manager' | 'executor'): boolean => {
  return getApprovalPermission(node, userRole).canApprove;
};

export const ApprovalsPage = () => {
  const { projects, getPendingApprovals, approveNodeMulti, rejectNodeMulti } = useProjectStore();
  const { currentUser, getUserById } = useUserStore();
  const { templates } = useTemplateStore();

  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [approvalTypeFilter, setApprovalTypeFilter] = useState<'all' | ApprovalType>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedNode, setSelectedNode] = useState<ApprovalNodeWithProject | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  };

  const allApprovalNodes = useMemo<ApprovalNodeWithProject[]>(() => {
    const result: ApprovalNodeWithProject[] = [];
    projects.forEach((project) => {
      const template = templates.find((t) => t.id === project.templateId);
      project.nodes.forEach((node) => {
        if (
          node.approvalType !== 'none' &&
          (node.status === 'pending_approval' ||
            node.status === 'completed' ||
            node.status === 'rejected') &&
          node.approvalHistory.length > 0
        ) {
          result.push({
            ...node,
            projectName: project.name,
            projectId: project.id,
            clientName: project.clientName,
            templateName: template?.name || project.templateName || '-',
          });
        } else if (node.status === 'pending_approval') {
          result.push({
            ...node,
            projectName: project.name,
            projectId: project.id,
            clientName: project.clientName,
            templateName: template?.name || project.templateName || '-',
          });
        }
      });
    });
    return result;
  }, [projects, templates]);

  const stats = useMemo(() => {
    const pendingApprovals = getPendingApprovals(currentUser.id);
    const myApproved = allApprovalNodes.filter((n) =>
      n.approvalHistory.some(
        (r) => r.approverId === currentUser.id && r.decision === 'approved'
      )
    );
    const passed = allApprovalNodes.filter((n) => n.status === 'completed');
    const rejected = allApprovalNodes.filter((n) => n.status === 'rejected');
    const managerApprovals = allApprovalNodes.filter((n) => {
      if (n.status !== 'pending_approval') {
        return n.approvalType === 'manager';
      }
      const currentStage = n.approvalStages?.find((s) => s.order === n.currentStageOrder);
      return n.approvalType === 'manager' || (n.approvalType === 'multi_level' && currentStage?.role === 'manager');
    });
    const adminApprovals = allApprovalNodes.filter((n) => {
      if (n.status !== 'pending_approval') {
        return n.approvalType === 'admin';
      }
      const currentStage = n.approvalStages?.find((s) => s.order === n.currentStageOrder);
      return n.approvalType === 'admin' || (n.approvalType === 'multi_level' && currentStage?.role === 'admin');
    });
    const multiLevelApprovals = allApprovalNodes.filter((n) => n.approvalType === 'multi_level');
    return {
      all: allApprovalNodes.length,
      pendingMe: pendingApprovals.length,
      approvedMe: myApproved.length,
      passed: passed.length,
      rejected: rejected.length,
      manager: managerApprovals.length,
      admin: adminApprovals.length,
      multiLevel: multiLevelApprovals.length,
    };
  }, [allApprovalNodes, getPendingApprovals, currentUser.id]);

  const filteredNodes = useMemo(() => {
    let result = [...allApprovalNodes];

    const pendingApprovalIds = getPendingApprovals(currentUser.id).map((n) => n.id);
    switch (quickFilter) {
      case 'pending_me':
        result = result.filter((n) => pendingApprovalIds.includes(n.id));
        break;
      case 'approved_me':
        result = result.filter((n) =>
          n.approvalHistory.some(
            (r) => r.approverId === currentUser.id && r.decision === 'approved'
          )
        );
        break;
      case 'passed':
        result = result.filter((n) => n.status === 'completed');
        break;
      case 'rejected':
        result = result.filter((n) => n.status === 'rejected');
        break;
      case 'manager':
        result = result.filter((n) => {
          if (n.status !== 'pending_approval') {
            return n.approvalType === 'manager';
          }
          const currentStage = n.approvalStages?.find((s) => s.order === n.currentStageOrder);
          return n.approvalType === 'manager' || (n.approvalType === 'multi_level' && currentStage?.role === 'manager');
        });
        break;
      case 'admin':
        result = result.filter((n) => {
          if (n.status !== 'pending_approval') {
            return n.approvalType === 'admin';
          }
          const currentStage = n.approvalStages?.find((s) => s.order === n.currentStageOrder);
          return n.approvalType === 'admin' || (n.approvalType === 'multi_level' && currentStage?.role === 'admin');
        });
        break;
      case 'multi_level':
        result = result.filter((n) => n.approvalType === 'multi_level');
        break;
    }

    if (selectedProjectIds.length > 0) {
      result = result.filter((n) => selectedProjectIds.includes(n.projectId));
    }

    if (selectedTemplateIds.length > 0) {
      const projectIds = projects
        .filter((p) => selectedTemplateIds.includes(p.templateId))
        .map((p) => p.id);
      result = result.filter((n) => projectIds.includes(n.projectId));
    }

    if (approvalTypeFilter !== 'all') {
      result = result.filter((n) => n.approvalType === approvalTypeFilter);
    }

    if (startDate) {
      result = result.filter((n) => n.submittedAt && n.submittedAt >= startDate);
    }
    if (endDate) {
      const endDay = new Date(endDate);
      endDay.setDate(endDay.getDate() + 1);
      result = result.filter(
        (n) => n.submittedAt && n.submittedAt < endDay.toISOString().split('T')[0]
      );
    }

    if (keyword.trim()) {
      const kw = keyword.toLowerCase();
      result = result.filter(
        (n) =>
          n.name.toLowerCase().includes(kw) ||
          n.projectName.toLowerCase().includes(kw) ||
          n.clientName.toLowerCase().includes(kw)
      );
    }

    return result;
  }, [
    allApprovalNodes,
    quickFilter,
    selectedProjectIds,
    selectedTemplateIds,
    approvalTypeFilter,
    startDate,
    endDate,
    keyword,
    currentUser.id,
    getPendingApprovals,
    projects,
  ]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      showToast('success', '数据已刷新');
    }, 500);
  };

  const handleResetFilters = () => {
    setQuickFilter('all');
    setSelectedProjectIds([]);
    setSelectedTemplateIds([]);
    setApprovalTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setKeyword('');
  };

  const toggleProjectId = (id: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTemplateId = (id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const moveToNextPending = (currentNodeId: string, action: 'approve' | 'reject') => {
    const pendingApprovals = getPendingApprovals(currentUser.id);
    const remaining = pendingApprovals.filter(n => n.id !== currentNodeId);
    
    if (remaining.length > 0) {
      const nextNode = remaining[0];
      const project = projects.find(p => p.id === nextNode.projectId);
      const template = templates.find(t => t.id === project?.templateId);
      if (project) {
        setTimeout(() => {
          setSelectedNode({
            ...nextNode,
            projectName: project.name,
            projectId: project.id,
            clientName: project.clientName,
            templateName: template?.name || project.templateName || '-',
          });
          showToast('success', `已完成 1 项，还剩 ${remaining.length} 项待审批`);
          
          setTimeout(() => {
            const row = document.querySelector(`tr[data-node-id="${nextNode.id}"]`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }, 300);
      }
    } else {
      setSelectedNode(null);
      showToast('success', action === 'approve' ? '审批通过成功，所有待办已完成' : '审批已退回，所有待办已完成');
    }
  };

  const handleApprove = () => {
    if (!selectedNode || submitting) return;
    const permission = getApprovalPermission(selectedNode, currentUser.role);
    if (!permission.canApprove) {
      showToast('error', permission.disabledReason || '无权审批此节点');
      return;
    }
    
    setSubmitting(true);
    const currentNodeId = selectedNode.id;
    
    approveNodeMulti(selectedNode.projectId, selectedNode.id, currentUser.id, currentUser.role, approvalComment);
    setApprovalComment('');
    
    setTimeout(() => {
      setSubmitting(false);
      moveToNextPending(currentNodeId, 'approve');
    }, 1500);
  };

  const handleReject = () => {
    if (!selectedNode || submitting) return;
    const permission = getApprovalPermission(selectedNode, currentUser.role);
    if (!permission.canApprove) {
      showToast('error', permission.disabledReason || '无权审批此节点');
      return;
    }
    if (!approvalComment.trim()) {
      showToast('error', '退回时必须填写审批意见');
      return;
    }
    
    setSubmitting(true);
    const currentNodeId = selectedNode.id;
    
    rejectNodeMulti(selectedNode.projectId, selectedNode.id, currentUser.id, currentUser.role, approvalComment);
    setApprovalComment('');
    
    setTimeout(() => {
      setSubmitting(false);
      moveToNextPending(currentNodeId, 'reject');
    }, 1500);
  };

  const quickFilters: { key: QuickFilter; label: string; count: number; colorClass: string; activeClass: string }[] = [
    {
      key: 'all',
      label: '全部',
      count: stats.all,
      colorClass: 'bg-slate-100 text-slate-600',
      activeClass: 'bg-slate-800 text-white',
    },
    {
      key: 'pending_me',
      label: '待我审批',
      count: stats.pendingMe,
      colorClass: 'bg-violet-100 text-violet-600',
      activeClass: 'bg-violet-500 text-white',
    },
    {
      key: 'approved_me',
      label: '我已审批',
      count: stats.approvedMe,
      colorClass: 'bg-slate-100 text-slate-500',
      activeClass: 'bg-slate-500 text-white',
    },
    {
      key: 'passed',
      label: '已通过',
      count: stats.passed,
      colorClass: 'bg-emerald-100 text-emerald-600',
      activeClass: 'bg-emerald-500 text-white',
    },
    {
      key: 'rejected',
      label: '已退回',
      count: stats.rejected,
      colorClass: 'bg-red-100 text-red-600',
      activeClass: 'bg-red-500 text-white',
    },
    {
      key: 'manager',
      label: '经理审批',
      count: stats.manager,
      colorClass: 'bg-cyan-100 text-cyan-600',
      activeClass: 'bg-cyan-500 text-white',
    },
    {
      key: 'admin',
      label: '管理员审批',
      count: stats.admin,
      colorClass: 'bg-purple-100 text-purple-600',
      activeClass: 'bg-purple-500 text-white',
    },
    {
      key: 'multi_level',
      label: '多级审批',
      count: stats.multiLevel,
      colorClass: 'bg-gradient-to-r from-cyan-100 to-purple-100 text-purple-600',
      activeClass: 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white',
    },
  ];

  const renderApprovalSteps = (node: ProjectNode) => {
    const stages = getApprovalStages(node.approvalType);
    if (stages.length === 0) return null;

    const approvedRecords = node.approvalHistory.filter((r) => r.decision === 'approved');
    const rejectedRecord = node.approvalHistory.find((r) => r.decision === 'rejected');
    const maxApprovedOrder = approvedRecords.length > 0
      ? Math.max(...approvedRecords.map((r) => r.stageOrder || 1))
      : 0;
    const currentOrder = rejectedRecord
      ? rejectedRecord.stageOrder
      : node.status === 'pending_approval'
      ? maxApprovedOrder + 1
      : stages.length + 1;

    return (
      <div className="py-4">
        <div className="flex items-start justify-between relative">
          <div className="absolute top-6 left-6 right-6 h-0.5 bg-slate-200" />
          {stages.map((stage, idx) => {
            const approvedInStage = approvedRecords.some(
              (r) => r.stageOrder === stage.order && r.decision === 'approved'
            );
            const rejectedInStage = rejectedRecord?.stageOrder === stage.order;
            const isCurrent = currentOrder === stage.order && node.status === 'pending_approval';
            const approver = approvedInStage
              ? getUserById(approvedRecords.find((r) => r.stageOrder === stage.order)?.approverId || '')
              : rejectedInStage
              ? getUserById(rejectedRecord?.approverId || '')
              : null;
            const recordTime = approvedInStage
              ? approvedRecords.find((r) => r.stageOrder === stage.order)?.createdAt
              : rejectedInStage
              ? rejectedRecord?.createdAt
              : null;
            const recordComment = approvedInStage
              ? approvedRecords.find((r) => r.stageOrder === stage.order)?.comment
              : rejectedInStage
              ? rejectedRecord?.comment
              : '';

            let circleClass = 'bg-slate-200 text-slate-400 border-slate-300';
            let Icon = Clock;
            if (approvedInStage) {
              circleClass = 'bg-emerald-500 text-white border-emerald-600';
              Icon = Check;
            } else if (rejectedInStage) {
              circleClass = 'bg-red-500 text-white border-red-600';
              Icon = X;
            } else if (isCurrent) {
              circleClass = 'bg-violet-500 text-white border-violet-600';
            }

            return (
              <div key={stage.order} className="flex flex-col items-center z-10 relative w-1/2">
                <div
                  className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${
                    circleClass
                  } ${isCurrent ? 'ring-4 ring-violet-200 scale-110' : ''}`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <div className="mt-3 text-center">
                  <p className={`text-sm font-medium ${
                    approvedInStage
                      ? 'text-emerald-600'
                      : rejectedInStage
                      ? 'text-red-600'
                      : isCurrent
                      ? 'text-violet-600'
                      : 'text-slate-600'
                  }`}>
                    {stage.label}
                  </p>
                  {approver && (
                    <p className="text-xs text-slate-500 mt-1">{approver.name}</p>
                  )}
                  {recordTime && (
                    <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(recordTime)}</p>
                  )}
                  {recordComment && (
                    <div className="mt-2 px-2 py-1 bg-slate-50 rounded text-xs text-slate-500 max-w-[180px] line-clamp-2" title={recordComment}>
                      {recordComment}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in flex flex-col h-screen overflow-hidden">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-emerald-500 text-white'
            : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      <div className="bg-white border-b border-slate-200 px-8 py-5 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">待审批工作台</h1>
              <p className="text-slate-500 text-sm">处理您负责的审批事项</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {quickFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                quickFilter === f.key ? f.activeClass + ' shadow-md' : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
              }`}
            >
              {f.label}
              <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-xs font-semibold ${
                quickFilter === f.key ? 'bg-white/20 text-white' : f.colorClass
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[260px] flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto p-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">按项目筛选</h3>
              {selectedProjectIds.length > 0 && (
                <button
                  onClick={() => setSelectedProjectIds([])}
                  className="text-xs text-violet-600 hover:text-violet-700"
                >
                  清除
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {projects.map((project) => (
                <label key={project.id} className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.includes(project.id)}
                    onChange={() => toggleProjectId(project.id)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-800 line-clamp-1">
                    {project.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">按模板筛选</h3>
              {selectedTemplateIds.length > 0 && (
                <button
                  onClick={() => setSelectedTemplateIds([])}
                  className="text-xs text-violet-600 hover:text-violet-700"
                >
                  清除
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {templates.map((t) => (
                <label key={t.id} className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedTemplateIds.includes(t.id)}
                    onChange={() => toggleTemplateId(t.id)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-800 line-clamp-1">
                    {t.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">审批方式</h3>
            <div className="space-y-2">
              {[
                { value: 'all', label: '全部' },
                { value: 'manager', label: '单级审批' },
                { value: 'multi_level', label: '多级审批' },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="approvalType"
                    checked={approvalTypeFilter === opt.value}
                    onChange={() => setApprovalTypeFilter(opt.value as any)}
                    className="w-4 h-4 border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-800">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">提交时间</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">开始日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">关键字搜索</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="节点/项目名..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleResetFilters}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <FilterX className="w-4 h-4" />
            重置筛选
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <div ref={listRef} className="h-full overflow-auto p-6 pr-0">
            {filteredNodes.length === 0 ? (
              <div className="pr-6">
                <EmptyState
                  icon="task"
                  title="暂无审批数据"
                  description={keyword || selectedProjectIds.length > 0 || selectedTemplateIds.length > 0 || approvalTypeFilter !== 'all' || startDate || endDate
                    ? '没有找到符合筛选条件的审批记录'
                    : '当前没有需要处理的审批事项'}
                />
              </div>
            ) : (
              <div className="pr-6">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">项目</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">节点</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">审批方式</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">负责人</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">提交时间</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">当前阶段</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">当前轮次</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">上一轮意见</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredNodes.map((node) => {
                        const assignee = getUserById(node.assigneeId);
                        const canApprove = canUserApprove(node, currentUser.role);
                        const pendingIds = getPendingApprovals(currentUser.id).map((n) => n.id);
                        const isMyApproval = pendingIds.includes(node.id);

                        return (
                          <tr
                            key={node.id}
                            data-node-id={node.id}
                            onClick={() => setSelectedNode(node)}
                            className={`hover:bg-violet-50/50 cursor-pointer transition-colors ${
                              selectedNode?.id === node.id ? 'bg-violet-50/70' : ''
                            }`}
                          >
                            <td className="px-5 py-4">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate max-w-[180px]">
                                  {node.clientName}
                                </p>
                                <p className="text-xs text-slate-500 truncate max-w-[180px]">
                                  {node.projectName}
                                </p>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <NodeTypeBadge type={node.type} />
                                <span className="text-sm text-slate-700 truncate max-w-[120px]">
                                  {node.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-slate-700">
                                  {approvalTypeLabels[node.approvalType]}
                                </span>
                                {node.approvalType === 'multi_level' && (
                                  <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded bg-violet-100 text-violet-600">
                                    串
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {assignee && (
                                <div className="flex items-center gap-2">
                                  <Avatar src={assignee.avatar} alt={assignee.name} size="sm" />
                                  <span className="text-sm text-slate-700">{assignee.name}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-sm text-slate-500 whitespace-nowrap">
                                {node.submittedAt ? formatDateTime(node.submittedAt) : '-'}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`text-sm ${
                                node.status === 'pending_approval'
                                  ? 'text-violet-600 font-medium'
                                  : node.status === 'completed'
                                  ? 'text-emerald-600'
                                  : node.status === 'rejected'
                                  ? 'text-red-600'
                                  : 'text-slate-600'
                              }`}>
                                {getCurrentStageLabel(node)}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-sm text-slate-600">
                                {getApprovalRoundText(node)}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {(() => {
                                const prev = getPreviousRoundComment(node);
                                if (!prev) return <span className="text-sm text-slate-400">-</span>;
                                if (prev.isReject) {
                                  return (
                                    <span className="flex items-center gap-1 text-sm text-red-600 truncate max-w-[150px]" title={prev.text}>
                                      <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                      {prev.text.length > 20 ? prev.text.substring(0, 20) + '...' : prev.text}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="flex items-center gap-1 text-sm text-emerald-600 truncate max-w-[150px]" title={prev.text}>
                                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                                    {prev.text.length > 20 ? prev.text.substring(0, 20) + '...' : prev.text}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={node.status as Status} size="sm" />
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                {canApprove ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedNode(node);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-md transition-colors"
                                  >
                                    <FileCheck className="w-3.5 h-3.5" />
                                    审批
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedNode(node);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-md transition-colors"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                    查看
                                  </button>
                                )}
                                {isMyApproval && !canApprove && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-100 text-violet-600 text-[10px] font-medium">
                                    <FileCheck className="w-3 h-3" />
                                    待审
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {selectedNode && (
            <div className="absolute right-0 top-0 h-full w-[520px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-20 animate-slide-in-right">
              <div className="flex-shrink-0 border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
                      <span className="truncate">{selectedNode.projectName}</span>
                      <ChevronRight className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate font-medium text-slate-700">{selectedNode.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={selectedNode.status as Status} />
                      <NodeTypeBadge type={selectedNode.type} />
                    </div>
                    <p className="text-sm text-slate-600 mt-2">
                      <span className="text-slate-500">当前阶段：</span>
                      <span className={`font-medium ${
                        selectedNode.status === 'pending_approval'
                          ? 'text-violet-600'
                          : selectedNode.status === 'completed'
                          ? 'text-emerald-600'
                          : selectedNode.status === 'rejected'
                          ? 'text-red-600'
                          : 'text-slate-700'
                      }`}>
                        {getCurrentStageLabel(selectedNode)}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors -mr-2 -mt-2"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">审批进度</label>
                  {renderApprovalSteps(selectedNode)}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="bg-slate-50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    基本信息
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">节点类型</label>
                      <NodeTypeBadge type={selectedNode.type} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">审批方式</label>
                      <p className="text-sm text-slate-700">{approvalTypeLabels[selectedNode.approvalType]}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 mb-1">负责人</label>
                      {(() => {
                        const u = getUserById(selectedNode.assigneeId);
                        return u ? (
                          <div className="flex items-center gap-2">
                            <Avatar src={u.avatar} alt={u.name} size="sm" />
                            <span className="text-sm text-slate-700">{u.name}</span>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400">-</p>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">提交时间</label>
                      <p className="text-sm text-slate-700">
                        {selectedNode.submittedAt ? formatDateTime(selectedNode.submittedAt) : '-'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">截止日期</label>
                      <div>
                        <p className="text-sm text-slate-700">{selectedNode.dueDate}</p>
                        <span className={`text-xs ${getDateStatus(selectedNode.dueDate, selectedNode.status).className}`}>
                          {getDateStatus(selectedNode.dueDate, selectedNode.status).label}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <Download className="w-4 h-4 text-slate-500" />
                    交付物列表
                  </h3>
                  {selectedNode.deliverables.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-lg">
                      <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">暂无交付物</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedNode.deliverables.map((d) => {
                        const uploader = getUserById(d.uploadedBy);
                        return (
                          <div
                            key={d.id}
                            className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <div className="w-9 h-9 bg-white rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{d.name}</p>
                              <p className="text-xs text-slate-400">
                                {uploader?.name} · {formatDateTime(d.uploadedAt)}
                              </p>
                            </div>
                            <a
                              href={d.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 hover:bg-white rounded-lg transition-colors flex-shrink-0"
                            >
                              <Link2 className="w-4 h-4 text-slate-400 hover:text-violet-600" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {(() => {
                  const permission = getApprovalPermission(selectedNode, currentUser.role);
                  const isDisabled = !permission.canApprove || submitting;
                  
                  return (
                    <div className={`rounded-xl p-5 border ${
                      permission.canApprove 
                        ? 'bg-violet-50 border-violet-100' 
                        : 'bg-slate-50 border-slate-200'
                    }`}>
                      <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${
                        permission.canApprove ? 'text-violet-700' : 'text-slate-500'
                      }`}>
                        <FileCheck className="w-4 h-4" />
                        审批操作
                      </h3>
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-slate-600 mb-2">审批意见</label>
                        <textarea
                          value={approvalComment}
                          onChange={(e) => setApprovalComment(e.target.value)}
                          placeholder={isDisabled ? '无权限操作' : '请输入审批意见...'}
                          rows={3}
                          disabled={isDisabled}
                          className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all resize-none ${
                            isDisabled 
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' 
                              : 'bg-white border-violet-200'
                          }`}
                          style={{ minHeight: '60px', maxHeight: '200px' }}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1 group">
                          <button
                            onClick={handleApprove}
                            disabled={isDisabled}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                              isDisabled
                                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                            {submitting ? '处理中...' : '审批通过'}
                          </button>
                          {!permission.canApprove && permission.disabledReason && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                              {permission.disabledReason}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                            </div>
                          )}
                        </div>
                        <div className="relative flex-1 group">
                          <button
                            onClick={handleReject}
                            disabled={isDisabled}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                              isDisabled
                                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                : 'bg-red-500 hover:bg-red-600 text-white'
                            }`}
                          >
                            <X className="w-4 h-4" />
                            {submitting ? '处理中...' : '审批退回'}
                          </button>
                          {!permission.canApprove && permission.disabledReason && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                              {permission.disabledReason}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                            </div>
                          )}
                        </div>
                      </div>
                      {!permission.canApprove && permission.disabledReason && (
                        <p className="mt-3 text-xs text-amber-600 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          {permission.disabledReason}
                        </p>
                      )}
                      {permission.canApprove && (
                        <p className="mt-3 text-xs text-red-500 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          退回后节点将返回执行人重新修改
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500" />
                    审批历史
                  </h3>
                  {selectedNode.approvalHistory.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-lg">
                      <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">暂无审批记录</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-200" />
                      <div className="space-y-5">
                        {selectedNode.approvalHistory
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((record, idx) => {
                            const approver = getUserById(record.approverId);
                            const isLast = idx === selectedNode.approvalHistory.length - 1;
                            return (
                              <div key={record.id} className="relative flex gap-4">
                                <div
                                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 ${
                                    record.decision === 'approved'
                                      ? 'bg-emerald-500 border-emerald-600 text-white'
                                      : 'bg-red-500 border-red-600 text-white'
                                  }`}
                                >
                                  {record.decision === 'approved' ? (
                                    <Check className="w-5 h-5" />
                                  ) : (
                                    <X className="w-5 h-5" />
                                  )}
                                </div>
                                <div className="flex-1 pt-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    {approver && (
                                      <div className="flex items-center gap-2">
                                        <Avatar src={approver.avatar} alt={approver.name} size="sm" />
                                        <span className="text-sm font-medium text-slate-700">
                                          {approver.name}
                                        </span>
                                      </div>
                                    )}
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        record.decision === 'approved'
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}
                                    >
                                      {record.decision === 'approved' ? (
                                        <ThumbsUp className="w-3 h-3" />
                                      ) : (
                                        <ThumbsDown className="w-3 h-3" />
                                      )}
                                      {approvalDecisionLabels[record.decision]}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      {record.stageLabel || ''}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-400 mb-2">
                                    {formatDateTime(record.createdAt)}
                                  </p>
                                  {record.comment && (
                                    <blockquote className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border-l-4 border-slate-200 italic">
                                      "{record.comment}"
                                    </blockquote>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s ease-out;
        }
      `}</style>
    </div>
  );
};
