import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Play, GitBranch, Calendar, Users } from 'lucide-react';
import { useTemplateStore, useProjectStore, useUserStore } from '@/store';
import { formatDate } from '@/utils';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import type { WorkflowTemplate } from '@/types';

export const TemplateList = () => {
  const navigate = useNavigate();
  const { templates, deleteTemplate, createTemplate } = useTemplateStore();
  const { createProject } = useProjectStore();
  const { currentUser, getUsersByRole } = useUserStore();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '' });
  const [newProject, setNewProject] = useState({ name: '', clientName: '', startDate: '', managerId: '' });

  const handleCreateTemplate = () => {
    if (!newTemplate.name.trim()) return;
    const template = createTemplate(newTemplate);
    setShowCreateModal(false);
    setNewTemplate({ name: '', description: '' });
    navigate(`/templates/${template.id}/edit`);
  };

  const handleDeleteTemplate = () => {
    if (selectedTemplate) {
      deleteTemplate(selectedTemplate.id);
      setShowDeleteModal(false);
      setSelectedTemplate(null);
    }
  };

  const handleStartProject = () => {
    if (!selectedTemplate || !newProject.name.trim() || !newProject.clientName.trim() || !newProject.startDate) return;
    createProject({
      templateId: selectedTemplate.id,
      name: newProject.name,
      clientName: newProject.clientName,
      startDate: newProject.startDate,
      managerId: newProject.managerId || currentUser.id,
    });
    setShowStartModal(false);
    setSelectedTemplate(null);
    setNewProject({ name: '', clientName: '', startDate: '', managerId: '' });
    navigate('/projects');
  };

  const openStartModal = (template: WorkflowTemplate) => {
    setSelectedTemplate(template);
    setNewProject({
      name: '',
      clientName: '',
      startDate: new Date().toISOString().split('T')[0],
      managerId: currentUser.role === 'manager' ? currentUser.id : '',
    });
    setShowStartModal(true);
  };

  const managers = getUsersByRole('manager');

  return (
    <div className="animate-fade-in">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">流程模板</h1>
            <p className="text-slate-500 mt-1">管理和配置活动执行流程模板</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
          >
            <Plus className="w-5 h-5" />
            新建模板
          </button>
        </div>
      </div>

      <div className="p-8">
        {templates.length === 0 ? (
          <EmptyState
            icon="file"
            title="暂无流程模板"
            description="点击上方按钮创建第一个流程模板，定义您的活动执行流程"
            action={
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
              >
                创建模板
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group"
              >
                <div className="h-32 bg-gradient-to-br from-slate-700 to-slate-800 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10">
                    <svg className="w-full h-full">
                      <defs>
                        <pattern id={`grid-${template.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.5" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill={`url(#grid-${template.id})`} />
                    </svg>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
                      <GitBranch className="w-4 h-4" />
                      <span>{template.nodes.length} 个节点</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white truncate">{template.name}</h3>
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-slate-500 text-sm line-clamp-2 mb-4 h-10">
                    {template.description}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-slate-400 mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(template.updatedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{template.nodes.filter(n => n.assigneeRole === 'executor').length} 个执行任务</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openStartModal(template)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium rounded-lg transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      发起项目
                    </button>
                    <button
                      onClick={() => navigate(`/templates/${template.id}/edit`)}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTemplate(template);
                        setShowDeleteModal(true);
                      }}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors text-slate-500 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新建流程模板"
        footer={
          <>
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCreateTemplate}
              disabled={!newTemplate.name.trim()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              创建并设计
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">模板名称</label>
            <input
              type="text"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              placeholder="例如：标准活动执行流程"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">模板描述</label>
            <textarea
              value={newTemplate.description}
              onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
              placeholder="简要描述此流程模板的适用场景..."
              rows={3}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="确认删除"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleDeleteTemplate}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
            >
              确认删除
            </button>
          </>
        }
      >
        <p className="text-slate-600">
          确定要删除模板「<span className="font-semibold text-slate-800">{selectedTemplate?.name}</span>」吗？此操作不可撤销。
        </p>
      </Modal>

      <Modal
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        title="发起新项目"
        footer={
          <>
            <button
              onClick={() => setShowStartModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleStartProject}
              disabled={!newProject.name.trim() || !newProject.clientName.trim() || !newProject.startDate}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              启动项目
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">使用模板</p>
            <p className="font-medium text-slate-800">{selectedTemplate?.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">项目名称</label>
            <input
              type="text"
              value={newProject.name}
              onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              placeholder="例如：2026年度客户答谢晚宴"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">客户名称</label>
            <input
              type="text"
              value={newProject.clientName}
              onChange={(e) => setNewProject({ ...newProject, clientName: e.target.value })}
              placeholder="例如：华盛科技集团"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">开始日期</label>
            <input
              type="date"
              value={newProject.startDate}
              onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          {currentUser.role === 'admin' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">项目经理</label>
              <select
                value={newProject.managerId}
                onChange={(e) => setNewProject({ ...newProject, managerId: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
              >
                <option value="">请选择项目经理</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
