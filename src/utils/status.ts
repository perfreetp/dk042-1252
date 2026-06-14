import type { Status, ExceptionStatus, NodeType, UserRole, ApprovalType, ApprovalDecision, ApprovalStageStatus } from '@/types';

export const statusLabels: Record<Status, string> = {
  pending: '待处理',
  in_progress: '进行中',
  pending_approval: '待审批',
  completed: '已完成',
  delayed: '已逾期',
  rejected: '已退回',
};

export const statusColors: Record<Status, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-amber-100 text-amber-700',
  pending_approval: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
  delayed: 'bg-red-100 text-red-700',
  rejected: 'bg-orange-100 text-orange-700',
};

export const statusBorderColors: Record<Status, string> = {
  pending: 'border-slate-300 bg-slate-50',
  in_progress: 'border-amber-400 bg-amber-50',
  pending_approval: 'border-violet-400 bg-violet-50',
  completed: 'border-emerald-400 bg-emerald-50',
  delayed: 'border-red-400 bg-red-50',
  rejected: 'border-orange-400 bg-orange-50',
};

export const approvalDecisionLabels: Record<ApprovalDecision, string> = {
  approved: '审批通过',
  rejected: '审批退回',
};

export const approvalDecisionColors: Record<ApprovalDecision, string> = {
  approved: 'text-emerald-600',
  rejected: 'text-red-600',
};

export const approvalStageStatusLabels: Record<ApprovalStageStatus, string> = {
  pending: '待处理',
  approved: '已通过',
  rejected: '已退回',
  skipped: '已跳过',
};

export const approvalStageStatusColors: Record<ApprovalStageStatus, string> = {
  pending: 'bg-slate-200 text-slate-600',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  skipped: 'bg-slate-100 text-slate-500',
};

export const exceptionStatusLabels: Record<ExceptionStatus, string> = {
  open: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
};

export const exceptionStatusColors: Record<ExceptionStatus, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
};

export const nodeTypeLabels: Record<NodeType, string> = {
  quotation: '报价',
  contract: '合同',
  material: '物料',
  venue: '场地',
  rehearsal: '彩排',
  settlement: '结算',
  custom: '自定义',
};

export const nodeTypeColors: Record<NodeType, string> = {
  quotation: 'bg-blue-500',
  contract: 'bg-purple-500',
  material: 'bg-emerald-500',
  venue: 'bg-amber-500',
  rehearsal: 'bg-pink-500',
  settlement: 'bg-cyan-500',
  custom: 'bg-slate-500',
};

export const nodeTypeBgColors: Record<NodeType, string> = {
  quotation: 'bg-blue-50 border-blue-200',
  contract: 'bg-purple-50 border-purple-200',
  material: 'bg-emerald-50 border-emerald-200',
  venue: 'bg-amber-50 border-amber-200',
  rehearsal: 'bg-pink-50 border-pink-200',
  settlement: 'bg-cyan-50 border-cyan-200',
  custom: 'bg-slate-50 border-slate-200',
};

export const roleLabels: Record<UserRole, string> = {
  admin: '系统管理员',
  manager: '项目经理',
  executor: '执行人员',
};

export const approvalTypeLabels: Record<ApprovalType, string> = {
  none: '无需审批',
  manager: '项目经理审批',
  admin: '管理员审批',
  multi_level: '多级审批',
};
