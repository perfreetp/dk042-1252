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
  XCircle,
  Bell,
  AlertTriangle,
  Plus,
  Send,
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
  nodeTypeLabels,
  nodeTypeBgColors,
  statusColors,
  approvalTypeLabels,
  approvalDecisionLabels,
  approvalDecisionColors,
} from '@/utils';
import type { ProjectNode, ApprovalDecision } from '@/types';

export const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getProjectById, startNode, completeNode, rejectNode, addDeliverable, addComment, submitForApproval, approveNode, rejectNodeWithApproval, getPendingApprovals } = useProjectStore();
  const { getUserById, currentUser } = useUserStore();
  const { getTemplateById } = useTemplateStore();
  const { getExceptionsByProject, createException } = useExceptionStore();
  const [project, setProject] = useState(getProjectById(id || ''));
  const [selectedNode, setSelectedNode] = useState<ProjectNode | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectApprovalModal, setShowRejectApprovalModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectApprovalComment, setRejectApprovalComment] = useState('');
  const [newDeliverable, setNewDeliverable] = useState({ name: '', url: '' });
  const [newComment, setNewComment] = useState('');
  const [detailTab, setDetailTab] = useState<'info' | 'approval'>('info');
  const [newException, setNewException] = useState({
    title: '',
    changeReason: '',
    impactScope: '',
    remedyAction: '',
  });

  useEffect(() => {
    if (id) {
      const updated = getProjectById(id);
      if (updated) {
        setProject(updated);
        if (selectedNode) {
          const updatedNode = updated.nodes.find(n => n.id === selectedNode.id);
          if (updatedNode) {
            setSelectedNode(updatedNode);
          }
        }
      }
    }
  }, [id, getProjectById, selectedNode]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState icon="folder" title="项目不存在" description="请返回项目列表查看其他项目" />
      </div>
    );
  }

  const template = getTemplateById(project.templateId);
  const manager = getUserById(project.managerId);
  const exceptions = getExceptionsByProject(project.id);

  const getProjectProgress = () => {
    const total = project.nodes.length;
    const completed = project.nodes.filter(n => n.status === 'completed').length;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  const canStartNode = (node: ProjectNode) => {
    if (node.status !== 'pending') return false;
    const allPrereqsMet = node.prerequisites.every(preId =>
      project.nodes.find(n => n.id === preId)?.status === 'completed'
    );
    return allPrereqsMet;
  };

  const handleStartNode = (nodeId: string) => {
    startNode(project.id, nodeId);
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      const node = updated.nodes.find(n => n.id === nodeId);
      if (node) setSelectedNode(node);
    }
  };

  const handleCompleteNode = (nodeId: string) => {
    completeNode(project.id, nodeId);
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      setSelectedNode(null);
    }
  };

  const handleRejectNode = () => {
    if (!selectedNode || !rejectReason.trim()) return;
    
    addComment(project.id, selectedNode.id, {
      content: `【退回原因】${rejectReason}`,
      userId: currentUser.id,
    });
    rejectNode(project.id, selectedNode.id);
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      setSelectedNode(null);
    }
    setShowRejectModal(false);
    setRejectReason('');
  };

  const handleUploadDeliverable = () => {
    if (!selectedNode || !newDeliverable.name.trim() || !newDeliverable.url.trim()) return;
    addDeliverable(project.id, selectedNode.id, {
      name: newDeliverable.name,
      url: newDeliverable.url,
      uploadedBy: currentUser.id,
    });
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      const node = updated.nodes.find(n => n.id === selectedNode.id);
      if (node) setSelectedNode(node);
    }
    setShowUploadModal(false);
    setNewDeliverable({ name: '', url: '' });
  };

  const handleAddComment = () => {
    if (!selectedNode || !newComment.trim()) return;
    addComment(project.id, selectedNode.id, {
      content: newComment,
      userId: currentUser.id,
    });
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      const node = updated.nodes.find(n => n.id === selectedNode.id);
      if (node) setSelectedNode(node);
    }
    setNewComment('');
  };

  const handleCreateException = () => {
    if (!newException.title.trim() || !newException.changeReason.trim()) return;
    createException({
      projectId: project.id,
      projectNodeId: selectedNode?.id,
      title: newException.title,
      changeReason: newException.changeReason,
      impactScope: newException.impactScope,
      remedyAction: newException.remedyAction,
      createdBy: currentUser.id,
    });
    setShowExceptionModal(false);
    setNewException({ title: '', changeReason: '', impactScope: '', remedyAction: '' });
  };

  const handleUrge = (node: ProjectNode) => {
    addComment(project.id, node.id, {
      content: `【催办】请尽快处理此任务，截止日期为 ${formatDate(node.dueDate)}`,
      userId: currentUser.id,
    });
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      const updatedNode = updated.nodes.find(n => n.id === node.id);
      if (updatedNode) setSelectedNode(updatedNode);
    }
  };

  const handleSubmitForApproval = (nodeId: string) => {
    submitForApproval(project.id, nodeId);
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      const node = updated.nodes.find(n => n.id === nodeId);
      if (node) setSelectedNode(node);
    }
  };

  const handleApproveNode = () => {
    if (!selectedNode) return;
    approveNode(project.id, selectedNode.id, currentUser.id, approvalComment);
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      const node = updated.nodes.find(n => n.id === selectedNode.id);
      if (node) setSelectedNode(node);
    }
    setShowApprovalModal(false);
    setApprovalComment('');
  };

  const handleRejectNodeWithApproval = () => {
    if (!selectedNode || !rejectApprovalComment.trim()) return;
    rejectNodeWithApproval(project.id, selectedNode.id, currentUser.id, rejectApprovalComment);
    addComment(project.id, selectedNode.id, {
      content: `【审批退回】${rejectApprovalComment}`,
      userId: currentUser.id,
    });
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      const node = updated.nodes.find(n => n.id === selectedNode.id);
      if (node) setSelectedNode(node);
    }
    setShowRejectApprovalModal(false);
    setRejectApprovalComment('');
  };

  const handleManagerRejectNode = () => {
    if (!selectedNode || !rejectReason.trim()) return;
    rejectNodeWithApproval(project.id, selectedNode.id, currentUser.id, rejectReason);
    addComment(project.id, selectedNode.id, {
      content: `【退回修改】${rejectReason}`,
      userId: currentUser.id,
    });
    const updated = getProjectById(project.id);
    if (updated) {
      setProject(updated);
      const node = updated.nodes.find(n => n.id === selectedNode.id);
      if (node) setSelectedNode(node);
    }
    setShowRejectModal(false);
    setRejectReason('');
  };

  const isApprover = (node: ProjectNode) => {
    if (node.status !== 'pending_approval') return false;
    if (node.approvalType === 'manager' && currentUser.role === 'manager') return true;
    if (node.approvalType === 'admin' && currentUser.role === 'admin') return true;
    if (node.approvalType === 'multi_level' && (currentUser.role === 'manager' || currentUser.role === 'admin')) return true;
    return false;
  };

  const isManagerOrAdmin = () => {
    return currentUser.role === 'manager' || currentUser.role === 'admin';
  };

  const today = getTodayISO();
  const daysLeft = daysBetween(today, project.endDate);
  const progress = getProjectProgress();

  return (
    <div className="animate-fade-in min-h-screen">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            返回
          </button>
          <div className="h-6 w-px bg-slate-300" />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
              <StatusBadge status={project.status} />
              {exceptions.filter(e => e.status !== 'resolved').length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  {exceptions.filter(e => e.status !== 'resolved').length} 个异常
                </span>
              )}
            </div>
            <p className="text-slate-500 mt-1">{project.clientName}</p>
          </div>
        </div>

        <div className="flex items-center gap-8 text-sm">
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
              <User className="w-4 h-4" />
              <span>项目经理：{manager.name}</span>
            </div>
          )}
          {template && (
            <div className="flex items-center gap-2 text-slate-500">
              <FileText className="w-4 h-4" />
              <span>模板：{template.name}</span>
            </div>
          )}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-500">项目进度</span>
            <span className="font-medium text-slate-700">{progress}%</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                progress === 100 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="flex gap-6">
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-slate-200 p-6 overflow-x-auto">
              <h2 className="text-lg font-semibold text-slate-800 mb-6">流程进度</h2>
              <div className="relative min-w-[800px] min-h-[500px]" style={{ 
                backgroundImage: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}>
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {project.nodes.map((node) =>
                    node.prerequisites.map((preId) => {
                      const fromNode = project.nodes.find(n => n.id === preId);
                      if (!fromNode) return null;
                      const fromX = (fromNode.prerequisites.length === 0 ? 50 : 150 + project.nodes.indexOf(fromNode) * 180) + 100;
                      const fromY = 80 + project.nodes.indexOf(fromNode) * 100 + 30;
                      const toX = 50 + project.nodes.indexOf(node) * 180 + 100;
                      const toY = 80 + project.nodes.indexOf(node) * 100 + 30;
                      const midX = (fromX + toX) / 2;
                      return (
                        <path
                          key={`${preId}-${node.id}`}
                          d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                          fill="none"
                          stroke="#cbd5e1"
                          strokeWidth="2"
                        />
                      );
                    })
                  )}
                </svg>

                {project.nodes.map((node, idx) => {
                  const assignee = getUserById(node.assigneeId);
                  const canStart = canStartNode(node);
                  const isOverdueNode = isOverdue(node.dueDate) && node.status === 'in_progress';

                  return (
                    <div
                      key={node.id}
                      className={`absolute w-56 rounded-xl border-2 bg-white shadow-lg cursor-pointer transition-all hover:shadow-xl
                        ${node.status === 'completed' ? 'border-emerald-400 bg-emerald-50' : ''}
                        ${node.status === 'in_progress' ? 'border-amber-400' : ''}
                        ${node.status === 'delayed' ? 'border-red-400 bg-red-50' : ''}
                        ${node.status === 'rejected' ? 'border-orange-400 bg-orange-50' : ''}
                        ${node.status === 'pending' && canStart ? 'border-slate-300 hover:border-amber-400' : ''}
                        ${node.status === 'pending' && !canStart ? 'border-slate-200 opacity-60' : ''}
                        ${selectedNode?.id === node.id ? 'ring-2 ring-amber-500 ring-offset-2' : ''}
                      `}
                      style={{
                        left: 50 + idx * 180,
                        top: 80 + idx * 100,
                      }}
                      onClick={() => setSelectedNode(node)}
                    >
                      <div className={`h-2 rounded-t-lg ${nodeTypeBgColors[node.type].split(' ')[1]?.replace('border-', 'bg-') || 'bg-slate-500'}`} />
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <NodeTypeBadge type={node.type} />
                          <StatusBadge status={isOverdueNode ? 'delayed' : node.status} size="sm" />
                        </div>
                        <h4 className="font-semibold text-slate-800 mb-2">{node.name}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                          {assignee && <Avatar src={assignee.avatar} alt={assignee.name} size="sm" />}
                          <span>{assignee?.name}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          截止：{formatDate(node.dueDate)}
                        </div>
                        {canStart && node.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartNode(node.id);
                            }}
                            className="w-full mt-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            开始处理
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {selectedNode && (
            <div className="w-96 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800">节点详情</h3>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="p-1.5 hover:bg-slate-100 rounded transition-colors"
                  >
                    X
                  </button>
                </div>
              </div>
              <div className="p-6 max-h-[calc(100vh-300px)] overflow-y-auto">
                <div className="flex border-b border-slate-200 mb-6">
                  <button
                    onClick={() => setDetailTab('info')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      detailTab === 'info'
                        ? 'border-amber-500 text-amber-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    基本信息
                  </button>
                  <button
                    onClick={() => setDetailTab('approval')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      detailTab === 'approval'
                        ? 'border-amber-500 text-amber-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    审批历史
                    {selectedNode.approvalHistory.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full">
                        {selectedNode.approvalHistory.length}
                      </span>
                    )}
                  </button>
                </div>

                {detailTab === 'info' ? (
                  <>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">节点名称</label>
                    <p className="text-slate-800">{selectedNode.name}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
                      <NodeTypeBadge type={selectedNode.type} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                      <StatusBadge status={selectedNode.status} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">负责人</label>
                    {(() => {
                      const assignee = getUserById(selectedNode.assigneeId);
                      return assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar src={assignee.avatar} alt={assignee.name} size="sm" />
                          <span className="text-slate-800">{assignee.name}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">截止日期</label>
                    <div className="flex flex-col gap-1">
                      <p className={`${isOverdue(selectedNode.dueDate) && selectedNode.status !== 'completed' ? 'text-red-600 font-medium' : 'text-slate-800'}`}>
                        {formatDate(selectedNode.dueDate)}
                      </p>
                      {selectedNode.status !== 'completed' && (
                        <>
                          {getOverdueDays(selectedNode.dueDate) > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <AlertTriangle className="w-3 h-3" />
                              已超期 {getOverdueDays(selectedNode.dueDate)} 天
                            </span>
                          )}
                          {getOverdueDays(selectedNode.dueDate) === 0 && isAtRisk(selectedNode.dueDate) && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600">
                              <Clock className="w-3 h-3" />
                              还剩 {getDaysUntilDue(selectedNode.dueDate)} 天
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">审批方式</label>
                    <p className="text-slate-800">{approvalTypeLabels[template?.nodes.find(n => n.id === selectedNode.templateNodeId)?.approvalType || 'none']}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">必填材料</label>
                    <div className="space-y-1">
                      {template?.nodes.find(n => n.id === selectedNode.templateNodeId)?.requiredMaterials.map((material, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedNode.deliverables.length > idx ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          {material}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {isManagerOrAdmin() && selectedNode.status !== 'completed' && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => handleUrge(selectedNode)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium rounded-lg transition-colors text-sm"
                    >
                      <Bell className="w-4 h-4" />
                      催办
                    </button>
                    <button
                      onClick={() => setShowExceptionModal(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg transition-colors text-sm"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      记录异常
                    </button>
                  </div>
                )}

                {isApprover(selectedNode) && selectedNode.status === 'pending_approval' && (
                  <div className="p-4 bg-violet-50 rounded-xl mb-6 border border-violet-100">
                    <h4 className="font-semibold text-violet-800 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      待您审批
                    </h4>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-violet-700 mb-1.5">审批意见</label>
                      <textarea
                        value={approvalComment}
                        onChange={(e) => setApprovalComment(e.target.value)}
                        placeholder="请输入审批意见（选填）"
                        rows={3}
                        className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all resize-none bg-white"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowRejectApprovalModal(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        审批退回
                      </button>
                      <button
                        onClick={handleApproveNode}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors text-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        审批通过
                      </button>
                    </div>
                  </div>
                )}

                {isManagerOrAdmin() && (selectedNode.status === 'pending_approval' || selectedNode.status === 'in_progress') && (
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => handleCompleteNode(selectedNode.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      通过
                    </button>
                    <button
                      onClick={() => setShowRejectModal(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      退回修改
                    </button>
                  </div>
                )}

                {selectedNode.status === 'pending' && canStartNode(selectedNode) && selectedNode.assigneeId === currentUser.id && (
                  <div className="mb-6">
                    <button
                      onClick={() => handleStartNode(selectedNode.id)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      开始处理
                    </button>
                  </div>
                )}

                {(selectedNode.status === 'in_progress' || selectedNode.status === 'delayed' || selectedNode.status === 'rejected') && selectedNode.assigneeId === currentUser.id && (
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      上传交付物
                    </button>
                    <button
                      onClick={() => handleSubmitForApproval(selectedNode.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {selectedNode.approvalType === 'none' ? '确认完成' : '提交审批'}
                    </button>
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-slate-800">交付物</h4>
                  </div>
                  {selectedNode.deliverables.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-lg">
                      <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">暂无交付物</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedNode.deliverables.map((deliverable) => {
                        const uploader = getUserById(deliverable.uploadedBy);
                        return (
                          <div key={deliverable.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                            <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{deliverable.name}</p>
                              <p className="text-xs text-slate-400">
                                {uploader?.name} · {formatDate(deliverable.uploadedAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-slate-800 mb-3">留言沟通</h4>
                  {selectedNode.comments.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-lg mb-3">
                      <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">暂无留言</p>
                    </div>
                  ) : (
                    <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
                      {selectedNode.comments.map((comment) => {
                        const commenter = getUserById(comment.userId);
                        return (
                          <div key={comment.id} className="flex gap-3">
                            {commenter && <Avatar src={commenter.avatar} alt={commenter.name} size="sm" />}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-slate-700">{commenter?.name}</span>
                                <span className="text-xs text-slate-400">{formatDateTime(comment.createdAt)}</span>
                              </div>
                              <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg">{comment.content}</p>
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
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim()}
                      className="p-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                  </>
                ) : (
                  <div>
                    {selectedNode.approvalHistory.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-lg">
                        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-500 font-medium mb-1">暂无审批记录</p>
                        <p className="text-xs text-slate-400">节点提交审批后，审批记录将在此展示</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedNode.approvalHistory.map((record) => {
                          const approver = getUserById(record.approverId);
                          return (
                            <div
                              key={record.id}
                              className={`p-4 rounded-xl border ${
                                record.decision === 'approved'
                                  ? 'bg-emerald-50 border-emerald-100'
                                  : 'bg-red-50 border-red-100'
                              }`}
                            >
                              <div className="flex items-start gap-3 mb-3">
                                {approver && (
                                  <Avatar src={approver.avatar} alt={approver.name} size="md" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-sm font-medium text-slate-800">
                                      {approver?.name || '未知审批人'}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                        record.decision === 'approved'
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}
                                    >
                                      {record.decision === 'approved' ? (
                                        <CheckCircle2 className="w-3 h-3" />
                                      ) : (
                                        <XCircle className="w-3 h-3" />
                                      )}
                                      {approvalDecisionLabels[record.decision]}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {formatDateTime(record.createdAt)}
                                  </div>
                                </div>
                              </div>
                              {record.comment && (
                                <div className="mt-2 pt-3 border-t border-slate-200/60">
                                  <div className="text-xs text-slate-500 mb-1">审批意见</div>
                                  <p className="text-sm text-slate-700">{record.comment}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="退回修改"
        size="md"
        footer={
          <>
            <button
              onClick={() => setShowRejectModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleManagerRejectNode}
              disabled={!rejectReason.trim()}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              确认退回
            </button>
          </>
        }
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">退回原因</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="请详细说明退回修改的原因..."
            rows={4}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none"
          />
        </div>
      </Modal>

      <Modal
        isOpen={showRejectApprovalModal}
        onClose={() => setShowRejectApprovalModal(false)}
        title="审批退回"
        size="md"
        footer={
          <>
            <button
              onClick={() => setShowRejectApprovalModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleRejectNodeWithApproval}
              disabled={!rejectApprovalComment.trim()}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              确认退回
            </button>
          </>
        }
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">退回意见 *</label>
          <textarea
            value={rejectApprovalComment}
            onChange={(e) => setRejectApprovalComment(e.target.value)}
            placeholder="请详细说明审批退回的意见..."
            rows={4}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none"
          />
        </div>
      </Modal>

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
