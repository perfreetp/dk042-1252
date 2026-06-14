import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Save } from 'lucide-react';
import { useExceptionStore, useProjectStore, useUserStore } from '@/store';

export const NewException = () => {
  const navigate = useNavigate();
  const { createException } = useExceptionStore();
  const { projects } = useProjectStore();
  const { currentUser } = useUserStore();
  const [formData, setFormData] = useState({
    projectId: '',
    projectNodeId: '',
    title: '',
    changeReason: '',
    impactScope: '',
    remedyAction: '',
  });

  const selectedProject = projects.find(p => p.id === formData.projectId);

  const handleSubmit = () => {
    if (!formData.projectId || !formData.title.trim() || !formData.changeReason.trim()) {
      return;
    }

    createException({
      projectId: formData.projectId,
      projectNodeId: formData.projectNodeId || undefined,
      title: formData.title,
      changeReason: formData.changeReason,
      impactScope: formData.impactScope,
      remedyAction: formData.remedyAction,
      createdBy: currentUser.id,
    });

    navigate('/exceptions');
  };

  const isFormValid = formData.projectId && formData.title.trim() && formData.changeReason.trim();

  return (
    <div className="animate-fade-in min-h-screen">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/exceptions')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            返回
          </button>
          <div className="h-6 w-px bg-slate-300" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">记录异常</h1>
              <p className="text-slate-500 mt-0.5">记录项目执行过程中遇到的异常情况</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-8">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    关联项目 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.projectId}
                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value, projectNodeId: '' })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all bg-white"
                  >
                    <option value="">请选择项目</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    关联节点
                  </label>
                  <select
                    value={formData.projectNodeId}
                    onChange={(e) => setFormData({ ...formData, projectNodeId: e.target.value })}
                    disabled={!formData.projectId}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    <option value="">请选择节点（可选）</option>
                    {selectedProject?.nodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  异常标题 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="简要描述异常情况"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  变更原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.changeReason}
                  onChange={(e) => setFormData({ ...formData, changeReason: e.target.value })}
                  placeholder="详细说明异常发生的原因和背景"
                  rows={4}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  影响范围
                </label>
                <textarea
                  value={formData.impactScope}
                  onChange={(e) => setFormData({ ...formData, impactScope: e.target.value })}
                  placeholder="说明此异常可能影响的范围，如项目进度、成本、质量等"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  补救动作
                </label>
                <textarea
                  value={formData.remedyAction}
                  onChange={(e) => setFormData({ ...formData, remedyAction: e.target.value })}
                  placeholder="计划采取的补救措施和解决方案"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-200">
              <button
                onClick={() => navigate('/exceptions')}
                className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 font-medium rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isFormValid}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                保存记录
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
