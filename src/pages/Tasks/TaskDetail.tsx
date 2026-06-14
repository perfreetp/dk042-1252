import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  FileText,
  MessageSquare,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Send,
  Play,
  Link2,
  ThumbsUp,
  ThumbsDown,
  History,
  XCircle,
} from 'lucide-react';
import { useProjectStore, useUserStore, useExceptionStore, useTemplateStore } from '@/store';
import { StatusBadge, NodeTypeBadge } from '@/components/StatusBadge';
import { Avatar } from '@/components/Avatar';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import {
  formatDate,
  formatDateTime,
  daysBetween,
  getTodayISO,
  isOverdue,
  getOverdueDays,
  getDaysUntilDue,
  isAtRisk,
  getDateStatus,
  approvalTypeLabels,
  approvalDecisionLabels,
  approvalDecisionColors,
  roleLabels,
} from '@/utils';
import type { ProjectNode } from '@/types';

export const TaskDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, startNode, completeNode, addDeliverable, addComment, submitForApproval, approveNodeMulti, rejectNodeMulti, getNodeApprovalInfo, getPendingApprovals } = useProjectStore();
  const { getUserById, currentUser } = useUserStore();
  const { getTemplateById } = useTemplateStore();
  const { createException } = useExceptionStore();
  const [task, setTask] = useState<ProjectNode | null>(null);
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [newDeliverable, setNewDeliverable] = useState({ name: '', url: '' });
  const [newComment, setNewComment] = useState('');
  const [newException, setNewException] = useState({
    title: '',
    changeReason: '',
    impactScope: '',
    remedyAction: '',
  });
  const [approvalComment, setApprovalComment] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [showPendingLink, setShowPendingLink] = useState(false);

  useEffect(() => {
    if (id) {
      let foundTask: ProjectNode | null = null;
      let foundProjectName = '';
      let foundClientName = '';
      
      for (const project of projects) {
        const node = project.nodes.find(n => n.id === id);
        if (node) {
          foundTask = node;
          foundProjectName = project.name;
          foundClientName = project.clientName;
          break;
        }
      }
      
      setTask(foundTask);
      setProjectName(foundProjectName);
      setClientName(foundClientName);
    }
  }, [id, projects]);

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState icon="folder" title="任务不存在" description="请返回任务列表查看其他任务" />
      </div>
    );
  }

  const project = projects.find(p => p.id === task.projectId);
  const template = project ? getTemplateById(project.templateId) : null;
  const assignee = getUserById(task.assigneeId);

  const getProject = () => projects.find(p => p.id === task?.projectId);

  const canStart = () => {
    if (!task || task.status !== 'pending') return false;
    const proj = getProject();
    if (!proj) return false;
    const allPrereqsMet = task.prerequisites.every(preId =>
      proj.nodes.find(n => n.id === preId)?.status === 'completed'
    );
    return allPrereqsMet;
  };

  const isApprover = () => {
    if (!task || !project) return false;
    const info = getNodeApprovalInfo(project.id, task.id, currentUser.id);
    return info.canApprove;
  };

  const stepCircleLabels = ['①', '②', '③', '④', '⑤'];

  const getCurrentApprovalInfo = (node: ProjectNode) => {
    if (node.status !== 'pending_approval' || !node.approvalStages || node.currentStageOrder <= 0) {
      return null;
    }
    const currentStage = node.approvalStages.find(s => s.order === node.currentStageOrder);
    if (!currentStage) return null;

    const totalStages = node.approvalStages.length;
    const completedStages = node.approvalStages.filter(s => s.status === 'approved');
    const previousComment = node.approvalHistory.length > 0
      ? node.approvalHistory[node.approvalHistory.length - 1]
      : null;

    return {
      currentRound: currentStage.order,
      totalRounds: totalStages,
      currentRole: currentStage.role,
      currentLabel: currentStage.label,
      isMultiLevel: totalStages > 1,
      completedStages,
      previousComment,
      canCurrentUserApprove: currentStage.status === 'pending' && currentStage.role === currentUser?.role,
    };
  };

  const refreshTask = () => {
    if (id) {
      let foundTask: ProjectNode | null = null;
      for (const project of projects) {
        const node = project.nodes.find(n => n.id === id);
        if (node) {
          foundTask = node;
          break;
        }
      }
      setTask(foundTask);
    }
  };

  const handleStartNode = () => {
    if (!task || !project) return;
    startNode(project.id, task.id);
    refreshTask();
  };

  const handleCompleteNode = () => {
    if (!task || !project) return;
    completeNode(project.id, task.id);
    navigate('/tasks');
  };

  const handleSubmitForApproval = () => {
    if (!task || !project) return;
    submitForApproval(project.id, task.id);
    refreshTask();
  };

  const handleApproveNode = () => {
    if (!task || !project || isSubmittingApproval) return;
    setIsSubmittingApproval(true);
    approveNodeMulti(project.id, task.id, currentUser.id, currentUser.role, approvalComment);
    refreshTask();
    setApprovalComment('');
    setTimeout(() => {
      setIsSubmittingApproval(false);
      const pendingCount = getPendingApprovals(currentUser.id).length;
      if (pendingCount > 0) {
        setShowPendingLink(true);
      }
    }, 1500);
  };

  const handleRejectNodeWithApproval = () => {
    if (!task || !project || !approvalComment.trim() || isSubmittingApproval) return;
    setIsSubmittingApproval(true);
    rejectNodeMulti(project.id, task.id, currentUser.id, currentUser.role, approvalComment);
    refreshTask();
    setApprovalComment('');
    setTimeout(() => {
      setIsSubmittingApproval(false);
      const pendingCount = getPendingApprovals(currentUser.id).length;
      if (pendingCount > 0) {
        setShowPendingLink(true);
      }
    }, 1500);
  };

  const handleUploadDeliverable = () => {
    if (!task || !project || !newDeliverable.name.trim() || !newDeliverable.url.trim()) return;
    addDeliverable(project.id, task.id, {
      name: newDeliverable.name,
      url: newDeliverable.url,
      uploadedBy: currentUser.id,
    });
    refreshTask();
    setShowUploadModal(false);
    setNewDeliverable({ name: '', url: '' });
  };

  const handleAddComment = () => {
    if (!task || !project || !newComment.trim()) return;
    addComment(project.id, task.id, {
      content: newComment,
      userId: currentUser.id,
    });
    refreshTask();
    setNewComment('');
  };

  const handleCreateException = () => {
    if (!project || !newException.title.trim() || !newException.changeReason.trim()) return;
    createException({
      projectId: project.id,
      projectNodeId: task.id,
      title: newException.title,
      changeReason: newException.changeReason,
      impactScope: newException.impactScope,
      remedyAction: newException.remedyAction,
      createdBy: currentUser.id,
    });
    setShowExceptionModal(false);
    setNewException({ title: '', changeReason: '', impactScope: '', remedyAction: '' });
  };

  const today = getTodayISO();
  const daysLeft = daysBetween(today, task.dueDate);
  const dateStatus = getDateStatus(task.dueDate, task.status);
  const isOverdueTask = dateStatus.level === 'danger';
  const isAssignee = task.assigneeId === currentUser.id;
  const canStartTask = canStart();
  const canApprove = isApprover();
  const templateNode = template?.nodes.find(n => n.id === task.templateNodeId);
  const taskApprovalType = templateNode?.approvalType || task.approvalType || 'none';

  const getDueDateDisplay = () => {
    if (dateStatus.level === 'completed') return null;
    const Icon = dateStatus.level === 'danger' ? AlertTriangle : Clock;
    return (
      <span className={`inline-flex items-center gap-1 ${dateStatus.className}`}>
        <Icon className="w-4 h-4" />
        {dateStatus.label}
      </span>
    );
  };

  const dueDateDisplay = getDueDateDisplay();

  return (
    <div className="animate-fade-in min-h-screen">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate('/tasks')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            返回
          </button>
          <div className="h-6 w-px bg-slate-300" />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">{task.name}</h1>
              <NodeTypeBadge type={task.type} />
              <StatusBadge status={isOverdueTask ? 'delayed' : task.status} />
              {isOverdueTask && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  已逾期
                </span>
              )}
            </div>
            <p className="text-slate-500 mt-1">{projectName} · {clientName}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-8 text-sm flex-wrap">
          <div className="flex items-center gap-8 flex-wrap">
            <div className="flex items-center gap-2 text-slate-500">
              <Calendar className="w-4 h-4" />
              <span>截止日期: {formatDate(task.dueDate)}</span>
            </div>
            {assignee && (
              <div className="flex items-center gap-2 text-slate-500">
                <User className="w-4 h-4" />
                <span>负责人: {assignee.name}</span>
              </div>
            )}
          </div>
          {dueDateDisplay && (
            <div className="flex items-center gap-2 ml-auto">
              {dueDateDisplay}
            </div>
          )}
          <div className="flex items-center gap-8 flex-wrap">
            {task.submittedAt && (
              <div className="flex items-center gap-2 text-slate-500">
                <Send className="w-4 h-4" />
                <span>提交时间: {formatDateTime(task.submittedAt)}</span>
              </div>
            )}
            {task.actualStartDate && (
              <div className="flex items-center gap-2 text-slate-500">
                <Play className="w-4 h-4" />
                <span>开始时间: {formatDate(task.actualStartDate)}</span>
              </div>
            )}
            {task.actualEndDate && (
              <div className="flex items-center gap-2 text-slate-500">
                <CheckCircle2 className="w-4 h-4" />
                <span>完成时间: {formatDate(task.actualEndDate)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">任务信息</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">审批方式</label>
                  <p className="text-slate-800">
                    {approvalTypeLabels[taskApprovalType]}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">任务状态</label>
                  <StatusBadge status={task.status} />
                </div>
              </div>

              {task.status !== 'completed' && (
                <div className="mt-6 p-4 rounded-lg border bg-slate-50 border-slate-200">
                  <label className="block text-sm font-medium text-slate-700 mb-2">进度提示</label>
                  {dueDateDisplay}
                </div>
              )}

              <div className="mt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">必填材料</label>
                <div className="space-y-2">
                  {templateNode?.requiredMaterials.map((material, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${task.deliverables.length > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {task.deliverables.length > 0 ? <CheckCircle2 className="w-3 h-3" /> : <span className="text-xs">{idx + 1}</span>}
                      </div>
                      {material}
                    </div>
                  ))}
                </div>
              </div>

              {task.prerequisites.length > 0 && project && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">前置任务</label>
                  <div className="space-y-2">
                    {task.prerequisites.map(preId => {
                      const preNode = project.nodes.find(n => n.id === preId);
                      return preNode ? (
                        <div key={preId} className="flex items-center gap-2 text-sm text-slate-600">
                          <StatusBadge status={preNode.status} size="sm" />
                          <span>{preNode.name}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>

            {(task.status === 'pending_approval' || task.approvalHistory.length > 0) && task.approvalStages.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-5 flex items-center gap-2">
                  <History className="w-5 h-5 text-violet-600" />
                  审批进度
                </h2>
                <div className="flex items-start justify-between mb-6">
                  {task.approvalStages.map((stage, idx) => {
                    const isCompleted = stage.status === 'approved';
                    const isCurrent = task.status === 'pending_approval' && stage.order === task.currentStageOrder && stage.status === 'pending';
                    const isPending = stage.status === 'pending' && !isCurrent;
                    const stageApprover = stage.approverId ? getUserById(stage.approverId) : null;
                    const relatedRecord = task.approvalHistory.find(r => r.stageOrder === stage.order && r.decision === 'approved');
                    return (
                      <div key={stage.id} className="flex-1 flex flex-col items-center relative">
                        {idx < task.approvalStages.length - 1 && (
                          <div
                            className={`absolute top-6 left-1/2 w-full h-1 rounded-full ${isCompleted ? 'bg-emerald-400' : 'bg-slate-200'}`}
                          />
                        )}
                        <div
                          className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-md ${isCompleted ? 'bg-emerald-500 text-white' : ''} ${isCurrent ? 'bg-violet-500 text-white ring-4 ring-violet-200 animate-pulse' : ''} ${isPending ? 'bg-slate-200 text-slate-500' : ''} ${stage.status === 'rejected' ? 'bg-red-500 text-white' : ''}`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-6 h-6" />
                          ) : (
                            <span>{stepCircleLabels[idx]}</span>
                          )}
                        </div>
                        <div className="mt-3 text-center w-full px-2">
                          <div className={`text-sm font-semibold mb-1 ${isCurrent ? 'text-violet-700' : isCompleted ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {stage.label}
                          </div>
                          {stageApprover && (
                            <div className="flex items-center justify-center gap-1 text-xs text-slate-500 mb-1">
                              <Avatar src={stageApprover.avatar} alt={stageApprover.name} size="sm" />
                              <span>{stageApprover.name}</span>
                            </div>
                          )}
                          {isCurrent && !stageApprover && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium mt-1">
                              <Clock className="w-3 h-3" />
                              待处理
                            </div>
                          )}
                          {relatedRecord?.comment && (
                            <div className="text-xs text-slate-500 mt-1 bg-slate-50 rounded-lg p-2 border border-slate-100">
                              意见：{relatedRecord.comment.length > 20 ? relatedRecord.comment.slice(0, 20) + '...' : relatedRecord.comment}
                            </div>
                          )}
                          {stage.completedAt && (
                            <div className="text-xs text-slate-400 mt-1">
                              {formatDate(stage.completedAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {task.status === 'pending_approval' && task.currentStageOrder > 0 && (
                  <div className="mt-4 p-4 bg-violet-50 rounded-xl border border-violet-100">
                    <div className="flex items-center gap-4">
                      {(() => {
                        const currentStage = task.approvalStages.find(s => s.order === task.currentStageOrder);
                        const approverInfo = currentStage?.approverId ? getUserById(currentStage.approverId) : null;
                        return (
                          <>
                            {approverInfo ? (
                              <Avatar src={approverInfo.avatar} alt={approverInfo.name} size="lg" />
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-violet-200 flex items-center justify-center text-violet-700 font-bold text-lg">
                                {roleLabels[currentStage?.role || 'manager'].charAt(0)}
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-slate-800">
                                  {approverInfo?.name || roleLabels[currentStage?.role || 'manager']}
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">
                                  <Clock className="w-3 h-3" />
                                  待处理
                                </span>
                              </div>
                              <div className="text-sm text-slate-500">
                                {currentStage?.label}
                                {task.approvalStages.length > 1 && `（第 ${task.currentStageOrder} / ${task.approvalStages.length} 级审批）`}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">交付物</h2>
                {isAssignee && (task.status === 'in_progress' || task.status === 'rejected' || task.status === 'delayed') && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    上传交付物
                  </button>
                )}
              </div>
              {task.deliverables.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">暂无交付物</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {task.deliverables.map((deliverable) => {
                    const uploader = getUserById(deliverable.uploadedBy);
                    return (
                      <div key={deliverable.id} className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                        <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{deliverable.name}</p>
                          <p className="text-xs text-slate-400">
                            {uploader?.name} · {formatDateTime(deliverable.uploadedAt)}
                          </p>
                        </div>
                        <a
                          href={deliverable.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-white rounded-lg transition-colors"
                        >
                          <Link2 className="w-4 h-4 text-slate-400 hover:text-amber-500" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-800">审批历史</h2>
              </div>
              {task.approvalHistory.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg">
                  <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">暂无审批记录</p>
                </div>
              ) : (
                <div className="relative pl-2">
                  {task.approvalHistory.map((record, idx) => {
                    const approver = getUserById(record.approverId);
                    const isLast = idx === task.approvalHistory.length - 1;
                    return (
                      <div key={record.id} className="relative flex gap-4 pb-6">
                        {!isLast && (
                          <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-slate-200" />
                        )}
                        <div className="relative z-10 flex-shrink-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${record.decision === 'approved' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
                          >
                            {stepCircleLabels[(record.stageOrder || idx + 1) - 1] || stepCircleLabels[idx] || '①'}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`rounded-xl border p-4 ${record.decision === 'approved' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                            <div className="text-sm mb-2">
                              <span className="text-slate-500">{record.stageLabel || '审批'}：</span>
                              <span className={record.decision === 'approved' ? 'text-emerald-600' : 'text-red-600'}>
                                {record.comment || (record.decision === 'approved' ? '通过' : '退回')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {approver && <Avatar src={approver.avatar} alt={approver.name} size="sm" />}
                              <span className="text-sm font-medium text-slate-700">{approver?.name || '未知审批人'}</span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${record.decision === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {record.decision === 'approved' ? (
                                  <ThumbsUp className="w-3 h-3 mr-1" />
                                ) : (
                                  <ThumbsDown className="w-3 h-3 mr-1" />
                                )}
                                {approvalDecisionLabels[record.decision]}
                              </span>
                              <span className="text-xs text-slate-400">{formatDateTime(record.createdAt)}</span>
                            </div>
                            {record.decision === 'rejected' && (
                              <div className="mt-3 pt-3 border-t border-slate-200/60">
                                <div className="text-xs text-orange-600 bg-orange-50 rounded-lg p-2">
                                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                                  重新提交将从头开始审批
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">留言沟通</h2>
              {task.comments.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg mb-4">
                  <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">暂无留言</p>
                </div>
              ) : (
                <div className="space-y-4 mb-4 max-h-80 overflow-y-auto">
                  {task.comments.map((comment) => {
                    const commenter = getUserById(comment.userId);
                    return (
                      <div key={comment.id} className="flex gap-3">
                        {commenter && <Avatar src={commenter.avatar} alt={commenter.name} size="md" />}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-slate-700">{commenter?.name}</span>
                            <span className="text-xs text-slate-400">{formatDateTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{comment.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="输入留言..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-lg transition-colors font-medium"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">操作</h2>
              
              {task.status === 'pending' && canStartTask && isAssignee && (
                <button
                  onClick={handleStartNode}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors mb-3"
                >
                  <Play className="w-5 h-5" />
                  开始处理
                </button>
              )}

              {task.status === 'pending' && !canStartTask && (
                <div className="p-4 bg-slate-50 rounded-lg text-center">
                  <Clock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">等待前置任务完成</p>
                </div>
              )}

              {(task.status === 'in_progress' || task.status === 'delayed') && isAssignee && (
                <>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors mb-3"
                  >
                    <Upload className="w-5 h-5" />
                    上传交付物
                  </button>
                  {taskApprovalType === 'none' ? (
                    <button
                      onClick={handleCompleteNode}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors mb-3"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      确认完成
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmitForApproval}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-500 hover:bg-violet-600 text-white font-medium rounded-lg transition-colors mb-3"
                    >
                      <Send className="w-5 h-5" />
                      提交审批
                    </button>
                  )}
                </>
              )}

              {task.status === 'rejected' && isAssignee && (
                <>
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg mb-3">
                    <p className="text-xs text-orange-700">
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      此任务已被退回，请修正内容后重新提交
                    </p>
                  </div>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors mb-3"
                  >
                    <Upload className="w-5 h-5" />
                    上传交付物
                  </button>
                  <button
                    onClick={handleSubmitForApproval}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg transition-all mb-3 shadow-md"
                  >
                    <Send className="w-5 h-5" />
                    修正内容后重新提交
                  </button>
                </>
              )}

              {(() => {
                if (!project || !task) return null;
                const approvalInfo = getNodeApprovalInfo(project.id, task.id, currentUser.id);
                const currentStage = task.approvalStages.find(s => s.order === task.currentStageOrder);
                const canApproveNow = approvalInfo.canApprove && !isSubmittingApproval;
                const pendingCount = getPendingApprovals(currentUser.id).length;
                const currentApprovalInfo = getCurrentApprovalInfo(task);

                if (showPendingLink && pendingCount > 0) {
                  return (
                    <div className="p-4 bg-violet-50 rounded-xl mb-3 border border-violet-100">
                      <button
                        onClick={() => navigate('/approvals')}
                        className="w-full flex items-center justify-center gap-2 text-violet-600 hover:text-violet-700 font-medium text-sm"
                      >
                        还有 {pendingCount} 条待您审批 →
                      </button>
                    </div>
                  );
                }

                if (task.status !== 'pending_approval') {
                  return (
                    <div className="p-4 bg-slate-50 rounded-lg text-center mb-3 border border-slate-200">
                      <Clock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 font-medium">当前状态无法审批</p>
                    </div>
                  );
                }

                if (!currentStage) {
                  return null;
                }

                if (currentStage.status !== 'pending') {
                  return (
                    <div className="p-4 bg-slate-50 rounded-lg text-center mb-3 border border-slate-200">
                      <Clock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 font-medium">已处理，请等待下一阶段</p>
                    </div>
                  );
                }

                if (currentStage.role !== currentUser.role) {
                  const stageApprover = currentStage.approverId ? getUserById(currentStage.approverId) : null;
                  const totalStages = task.approvalStages.length;
                  const approvalRoundInfo = totalStages > 1
                    ? `当前：第 ${task.currentStageOrder}/${totalStages} 轮 · ${currentStage.label}`
                    : currentStage.label;
                  return (
                    <div className="p-4 bg-slate-50 rounded-lg text-center mb-3 border border-slate-200">
                      <Clock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 font-medium mb-1">{approvalRoundInfo}</p>
                      <p className="text-sm text-slate-400">
                        等待 {stageApprover?.name || roleLabels[currentStage.role as keyof typeof roleLabels]} 审批
                      </p>
                    </div>
                  );
                }

                return (
                  <>
                    {task.approvalStages.length > 1 && task.currentStageOrder > 0 && (
                      <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg mb-3">
                        <p className="text-xs text-violet-700">
                          这是第 {task.currentStageOrder} / {task.approvalStages.length} 级审批
                          （{currentStage.label || ''}）
                          {task.currentStageOrder < task.approvalStages.length &&
                            `，通过后将进入${task.approvalStages.find(s => s.order === task.currentStageOrder + 1)?.label || '管理员终审'}`
                          }
                        </p>
                      </div>
                    )}
                    {currentApprovalInfo?.previousComment && currentApprovalInfo.isMultiLevel && (() => {
                      const prevApprover = getUserById(currentApprovalInfo.previousComment.approverId);
                      return (
                        <div className="bg-slate-50 rounded-lg p-3 mb-3 text-sm">
                          <div className="text-slate-500 mb-1">
                            上一轮审批（{currentApprovalInfo.previousComment.stageLabel}）
                          </div>
                          <div className="flex items-center gap-2">
                            {prevApprover && <Avatar src={prevApprover.avatar} alt={prevApprover.name} size="sm" />}
                            <span>{prevApprover?.name}</span>
                            <span className={currentApprovalInfo.previousComment.decision === 'approved' ? 'text-emerald-600' : 'text-red-600'}>
                              {currentApprovalInfo.previousComment.decision === 'approved' ? '通过' : '退回'}
                            </span>
                            {currentApprovalInfo.previousComment.comment && (
                              <span className="text-slate-500">- {currentApprovalInfo.previousComment.comment}</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">审批意见（选填）</label>
                      <textarea
                        value={approvalComment}
                        onChange={(e) => setApprovalComment(e.target.value)}
                        placeholder="请输入审批意见..."
                        rows={3}
                        disabled={isSubmittingApproval}
                        className="w-full px-4 py-2.5 border border-violet-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all resize-none bg-white disabled:opacity-50"
                      />
                    </div>
                    <button
                      onClick={handleApproveNode}
                      disabled={!canApproveNow}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors mb-3"
                    >
                      <ThumbsUp className="w-5 h-5" />
                      审批通过
                    </button>
                    <button
                      onClick={handleRejectNodeWithApproval}
                      disabled={!canApproveNow || !approvalComment.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors mb-3"
                    >
                      <ThumbsDown className="w-5 h-5" />
                      审批退回
                    </button>
                  </>
                );
              })()}

              {task.status !== 'completed' && task.status !== 'pending_approval' && (
                <button
                  onClick={() => setShowExceptionModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors"
                >
                  <AlertTriangle className="w-5 h-5" />
                  记录异常
                </button>
              )}

              {task.status === 'completed' && (
                <div className="p-4 bg-emerald-50 rounded-lg text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm text-emerald-600 font-medium">任务已完成</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">负责人</h2>
              {assignee && (
                <div className="flex items-center gap-3">
                  <Avatar src={assignee.avatar} alt={assignee.name} size="lg" />
                  <div>
                    <p className="font-medium text-slate-800">{assignee.name}</p>
                    <p className="text-sm text-slate-500">{assignee.email}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="上传交付物"
        size="md"
        footer={
          <>
            <button
              onClick={() => setShowUploadModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleUploadDeliverable}
              disabled={!newDeliverable.name.trim() || !newDeliverable.url.trim()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              上传
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">文件名称</label>
            <input
              type="text"
              value={newDeliverable.name}
              onChange={(e) => setNewDeliverable({ ...newDeliverable, name: e.target.value })}
              placeholder="例如：报价方案v1.pdf"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">文件链接</label>
            <input
              type="text"
              value={newDeliverable.url}
              onChange={(e) => setNewDeliverable({ ...newDeliverable, url: e.target.value })}
              placeholder="请输入文件下载链接"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showExceptionModal}
        onClose={() => setShowExceptionModal(false)}
        title="记录异常"
        size="lg"
        footer={
          <>
            <button
              onClick={() => setShowExceptionModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCreateException}
              disabled={!newException.title.trim() || !newException.changeReason.trim()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              提交记录
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">异常标题 *</label>
            <input
              type="text"
              value={newException.title}
              onChange={(e) => setNewException({ ...newException, title: e.target.value })}
              placeholder="简要描述异常情况"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">变更原因 *</label>
            <textarea
              value={newException.changeReason}
              onChange={(e) => setNewException({ ...newException, changeReason: e.target.value })}
              placeholder="详细说明异常发生的原因"
              rows={3}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">影响范围</label>
            <textarea
              value={newException.impactScope}
              onChange={(e) => setNewException({ ...newException, impactScope: e.target.value })}
              placeholder="说明此异常可能影响的范围"
              rows={2}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">补救动作</label>
            <textarea
              value={newException.remedyAction}
              onChange={(e) => setNewException({ ...newException, remedyAction: e.target.value })}
              placeholder="计划采取的补救措施"
              rows={2}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
