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
  approvalTypeLabels,
} from '@/utils';
import type { ProjectNode } from '@/types';

export const TaskDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, startNode, completeNode, addDeliverable, addComment } = useProjectStore();
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
  const isOverdueTask = isOverdue(task.dueDate) && task.status !== 'completed';
  const isAssignee = task.assigneeId === currentUser.id;
  const canStartTask = canStart();

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

        <div className="flex items-center gap-8 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Calendar className="w-4 h-4" />
            <span>截止日期: {formatDate(task.dueDate)}</span>
          </div>
          {task.status !== 'completed' && (
            <div className="flex items-center gap-2 text-slate-500">
              <Clock className="w-4 h-4" />
              <span className={daysLeft < 3 ? 'text-red-600 font-medium' : ''}>
                {daysLeft > 0 ? `剩余 ${daysLeft} 天` : daysLeft === 0 ? '今天截止' : `已超期 ${Math.abs(daysLeft)} 天`}
              </span>
            </div>
          )}
          {assignee && (
            <div className="flex items-center gap-2 text-slate-500">
              <User className="w-4 h-4" />
              <span>负责人: {assignee.name}</span>
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

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">任务信息</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">审批方式</label>
                  <p className="text-slate-800">
                    {approvalTypeLabels[template?.nodes.find(n => n.id === task.templateNodeId)?.approvalType || 'none']}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">任务状态</label>
                  <StatusBadge status={task.status} />
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">必填材料</label>
                <div className="space-y-2">
                  {template?.nodes.find(n => n.id === task.templateNodeId)?.requiredMaterials.map((material, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        task.deliverables.length > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                      }`}>
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

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">交付物</h2>
                {isAssignee && (task.status === 'in_progress' || task.status === 'rejected') && (
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

              {(task.status === 'in_progress' || task.status === 'rejected' || task.status === 'delayed') && isAssignee && (
                <>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors mb-3"
                  >
                    <Upload className="w-5 h-5" />
                    上传交付物
                  </button>
                  <button
                    onClick={handleCompleteNode}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors mb-3"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    确认完成
                  </button>
                </>
              )}

              {task.status !== 'completed' && (
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
