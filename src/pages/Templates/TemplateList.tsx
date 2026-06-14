import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Play, GitBranch, Calendar, Users, Copy, Tag, Clock, MoreVertical, Check, X } from 'lucide-react';
import { useTemplateStore, useProjectStore, useUserStore } from '@/store';
import type { TemplateDiff } from '@/store/useTemplateStore';
import { formatDate } from '@/utils';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import type { WorkflowTemplate, TemplateVersion } from '@/types';

export const TemplateList = () => {
  const navigate = useNavigate();
  const { templates, deleteTemplate, createTemplate, copyTemplate, createVersion, compareVersions, getTemplateById } = useTemplateStore();
  const { createProject } = useProjectStore();
  const { currentUser, getUsersByRole, getUserById } = useUserStore();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '' });
  const [newProject, setNewProject] = useState({ name: '', clientName: '', startDate: '', managerId: '', templateVersionId: '' });
  const [copyName, setCopyName] = useState('');
  const [versionChangelog, setVersionChangelog] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionDiffs, setVersionDiffs] = useState<TemplateDiff[]>([]);

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
      templateVersionId: newProject.templateVersionId || undefined,
      name: newProject.name,
      clientName: newProject.clientName,
      startDate: newProject.startDate,
      managerId: newProject.managerId || currentUser.id,
    });
    setShowStartModal(false);
    setSelectedTemplate(null);
    setNewProject({ name: '', clientName: '', startDate: '', managerId: '', templateVersionId: '' });
    navigate('/projects');
  };

  const openStartModal = (template: WorkflowTemplate) => {
    setSelectedTemplate(template);
    setNewProject({
      name: '',
      clientName: '',
      startDate: new Date().toISOString().split('T')[0],
      managerId: currentUser.role === 'manager' ? currentUser.id : '',
      templateVersionId: '',
    });
    setShowStartModal(true);
  };

  const openCopyModal = (template: WorkflowTemplate) => {
    setSelectedTemplate(template);
    setCopyName(`${template.name} - 副本`);
    setOpenDropdownId(null);
    setShowCopyModal(true);
  };

  const handleCopyTemplate = () => {
    if (!selectedTemplate || !copyName.trim()) return;
    copyTemplate(selectedTemplate.id, copyName.trim());
    setShowCopyModal(false);
    setSelectedTemplate(null);
    setCopyName('');
  };

  const openVersionModal = (template: WorkflowTemplate) => {
    setSelectedTemplate(template);
    setVersionChangelog('');
    setOpenDropdownId(null);
    setShowVersionModal(true);
  };

  const handleCreateVersion = () => {
    if (!selectedTemplate || !versionChangelog.trim()) return;
    createVersion(selectedTemplate.id, { changelog: versionChangelog.trim(), createdBy: currentUser.id });
    setShowVersionModal(false);
    setSelectedTemplate(null);
    setVersionChangelog('');
  };

  const openHistoryModal = (template: WorkflowTemplate) => {
    setSelectedTemplate(template);
    setSelectedVersionId(null);
    setVersionDiffs([]);
    setOpenDropdownId(null);
    setShowHistoryModal(true);
  };

  const handleSelectVersion = (versionId: string) => {
    if (!selectedTemplate) return;
    setSelectedVersionId(versionId);
    const diffs = compareVersions(selectedTemplate.id, versionId);
    setVersionDiffs(diffs);
  };

  const getParentTemplateName = (parentId?: string) => {
    if (!parentId) return '';
    const parent = getTemplateById(parentId);
    return parent?.name || '';
  };

  const toggleDropdown = (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDropdownId(openDropdownId === templateId ? null : templateId);
  };

  const closeDropdown = () => {
    setOpenDropdownId(null);
  };

  const managers = getUsersByRole('manager');

  const getVersionOptions = (template: WorkflowTemplate) => {
    const options: { id: string; label: string }[] = [
      { id: '', label: `v${template.version} (最新版本) - ${formatDate(template.updatedAt)}` },
    ];
    [...template.versions].reverse().forEach((v) => {
      options.push({ id: v.id, label: `v${v.version} - ${formatDate(v.createdAt)}` });
    });
    return options;
  };

  const getDiffColorClass = (type: string) => {
    switch (type) {
      case 'added':
        return 'bg-emerald-50 border-emerald-200';
      case 'removed':
        return 'bg-red-50 border-red-200';
      case 'modified':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  const getDiffIcon = (type: string) => {
    switch (type) {
      case 'added':
        return <Plus className="w-4 h-4 text-emerald-600" />;
      case 'removed':
        return <X className="w-4 h-4 text-red-600" />;
      case 'modified':
        return <Edit2 className="w-4 h-4 text-amber-600" />;
      default:
        return null;
    }
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      name: '节点名称',
      type: '节点类型',
      assigneeRole: '负责人角色',
      durationDays: '工期(天)',
      approvalType: '审批类型',
      requiredMaterials: '所需材料',
      节点: '节点',
    };
    return labels[field] || field;
  };

  return (
    <div className="animate-fade-in" onClick={closeDropdown}>
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
                className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group relative"
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
                      <span className="mx-1">·</span>
                      <Tag className="w-4 h-4" />
                      <span>v{template.version}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white truncate">{template.name}</h3>
                  </div>
                </div>
                <div className="p-5">
                  {template.parentTemplateId && (
                    <div className="mb-3 px-3 py-2 bg-sky-50 rounded-lg text-sm text-sky-700 flex items-center gap-1.5">
                      <Copy className="w-4 h-4" />
                      <span className="truncate">复制自：{getParentTemplateName(template.parentTemplateId)}</span>
                    </div>
                  )}
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
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-4 px-3 py-2 bg-slate-50 rounded-lg">
                    <Tag className="w-3.5 h-3.5" />
                    <span>当前版本：v{template.version}</span>
                    <span className="mx-1">·</span>
                    <Clock className="w-3.5 h-3.5" />
                    <span>历史版本：{template.versions.length} 个</span>
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
                    <div className="relative">
                      <button
                        onClick={(e) => toggleDropdown(template.id, e)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700"
                        title="更多操作"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openDropdownId === template.id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => openCopyModal(template)}
                            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            复制模板
                          </button>
                          <button
                            onClick={() => openVersionModal(template)}
                            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Tag className="w-4 h-4" />
                            创建版本
                          </button>
                          <button
                            onClick={() => openHistoryModal(template)}
                            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Clock className="w-4 h-4" />
                            历史版本
                          </button>
                          <div className="border-t border-slate-100 my-1"></div>
                          <button
                            onClick={() => {
                              setSelectedTemplate(template);
                              setShowDeleteModal(true);
                              setOpenDropdownId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            删除模板
                          </button>
                        </div>
                      )}
                    </div>
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
          {selectedTemplate && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">选择版本</label>
              <select
                value={newProject.templateVersionId}
                onChange={(e) => setNewProject({ ...newProject, templateVersionId: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
              >
                {getVersionOptions(selectedTemplate).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
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

      <Modal
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        title="复制模板"
        footer={
          <>
            <button
              onClick={() => setShowCopyModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCopyTemplate}
              disabled={!copyName.trim()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              确认复制
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">原模板</p>
            <p className="font-medium text-slate-800">{selectedTemplate?.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">新模板名称</label>
            <input
              type="text"
              value={copyName}
              onChange={(e) => setCopyName(e.target.value)}
              placeholder="请输入新模板名称"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
            />
          </div>
          <p className="text-sm text-slate-500">
            将创建一个包含原模板所有节点和配置的新模板，您可以在此基础上进行修改。
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={showVersionModal}
        onClose={() => setShowVersionModal(false)}
        title="创建新版本"
        footer={
          <>
            <button
              onClick={() => setShowVersionModal(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCreateVersion}
              disabled={!versionChangelog.trim()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              创建版本
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">模板</p>
                <p className="font-medium text-slate-800">{selectedTemplate?.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">新版本号</p>
                <p className="font-semibold text-amber-600">
                  v{selectedTemplate ? (() => {
                    const parts = selectedTemplate.version.split('.').map(v => parseInt(v, 10) || 0);
                    parts[parts.length - 1] = (parts[parts.length - 1] || 0) + 1;
                    return parts.join('.');
                  })() : '1.0'}
                </p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">版本更新说明</label>
            <textarea
              value={versionChangelog}
              onChange={(e) => setVersionChangelog(e.target.value)}
              placeholder="请详细描述本次版本的变更内容，例如：新增审批节点、调整工期、修改负责人角色等..."
              rows={5}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
            />
          </div>
          <p className="text-sm text-slate-500">
            创建版本后，当前模板的状态将被保存。后续可以查看历史版本差异并在发起项目时选择指定版本。
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="历史版本"
        size="lg"
        footer={
          <button
            onClick={() => setShowHistoryModal(false)}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            关闭
          </button>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">模板</p>
            <p className="font-medium text-slate-800">{selectedTemplate?.name}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">版本列表（点击查看与当前版本的差异）</h4>
            {selectedTemplate?.versions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                暂无历史版本
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {[...(selectedTemplate?.versions || [])].reverse().map((version: TemplateVersion) => (
                  <div
                    key={version.id}
                    onClick={() => handleSelectVersion(version.id)}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedVersionId === version.id
                        ? 'bg-amber-50 border-l-4 border-amber-500'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-sm font-medium text-slate-700">
                          v{version.version}
                        </span>
                        {selectedVersionId === version.id && (
                          <Check className="w-4 h-4 text-amber-600" />
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(version.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-1">
                      创建人：{getUserById(version.createdBy)?.name || '未知用户'}
                    </p>
                    <p className="text-sm text-slate-500 line-clamp-2">{version.changelog}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedVersionId && versionDiffs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">差异对比（与当前最新版本）</h4>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {versionDiffs.map((diff, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${getDiffColorClass(diff.type)}`}
                  >
                    <div className="flex items-start gap-2">
                      {getDiffIcon(diff.type)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            diff.type === 'added'
                              ? 'bg-emerald-100 text-emerald-700'
                              : diff.type === 'removed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {diff.type === 'added' ? '新增' : diff.type === 'removed' ? '删除' : '修改'}
                          </span>
                          <span className="text-sm font-medium text-slate-800">
                            节点：{diff.nodeName}
                          </span>
                        </div>
                        {diff.type === 'modified' && diff.field && (
                          <div className="text-sm text-slate-600">
                            <span className="font-medium">{getFieldLabel(diff.field)}：</span>
                            <span className="line-through text-red-600 mr-2">
                              {Array.isArray(diff.oldValue) ? diff.oldValue.join(', ') : diff.oldValue}
                            </span>
                            <span className="text-emerald-600">
                              → {Array.isArray(diff.newValue) ? diff.newValue.join(', ') : diff.newValue}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedVersionId && versionDiffs.length === 0 && (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
              该版本与当前版本无差异
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
