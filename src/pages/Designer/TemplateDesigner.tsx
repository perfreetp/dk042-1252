import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  FileText,
  FileSignature,
  Package,
  MapPin,
  Mic2,
  Receipt,
  Puzzle,
  Settings,
  Clock,
  Users,
  CheckSquare,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useTemplateStore, useUserStore } from '@/store';
import type { WorkflowNode, WorkflowTemplate, NodeType, UserRole, ApprovalType } from '@/types';
import { nodeTypeLabels, nodeTypeColors, roleLabels, approvalTypeLabels } from '@/utils';

const nodeTypeConfig: { type: NodeType; icon: React.ElementType; label: string; color: string }[] = [
  { type: 'quotation', icon: FileText, label: '报价', color: 'bg-blue-500' },
  { type: 'contract', icon: FileSignature, label: '合同', color: 'bg-purple-500' },
  { type: 'material', icon: Package, label: '物料', color: 'bg-emerald-500' },
  { type: 'venue', icon: MapPin, label: '场地', color: 'bg-amber-500' },
  { type: 'rehearsal', icon: Mic2, label: '彩排', color: 'bg-pink-500' },
  { type: 'settlement', icon: Receipt, label: '结算', color: 'bg-cyan-500' },
  { type: 'custom', icon: Puzzle, label: '自定义', color: 'bg-slate-500' },
];

const approvalOptions: { value: ApprovalType; label: string }[] = [
  { value: 'none', label: '无需审批' },
  { value: 'manager', label: '项目经理审批' },
  { value: 'admin', label: '管理员审批' },
  { value: 'multi_level', label: '多级审批' },
];

interface Connection {
  from: string;
  to: string;
}

export const TemplateDesigner = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const { templates, getTemplateById, addNode, updateNode, deleteNode, updateTemplate } = useTemplateStore();
  const { currentUser } = useUserStore();
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [editingNode, setEditingNode] = useState<WorkflowNode | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dragging, setDragging] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const canvasPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (id) {
      const found = getTemplateById(id);
      if (found) {
        setTemplate(found);
        const conns: Connection[] = [];
        found.nodes.forEach(node => {
          node.prerequisites.forEach(preId => {
            conns.push({ from: preId, to: node.id });
          });
        });
        setConnections(conns);
      }
    }
  }, [id, getTemplateById]);

  const handleAddNode = useCallback((type: NodeType) => {
    if (!template) return;

    const existingNodes = templates.find(t => t.id === template.id)?.nodes || [];
    const positionX = 150 + existingNodes.length * 180;
    const positionY = 150;

    const newNode: Omit<WorkflowNode, 'id' | 'templateId'> = {
      name: nodeTypeLabels[type],
      type,
      assigneeRole: type === 'quotation' || type === 'contract' || type === 'settlement' ? 'manager' : 'executor',
      durationDays: 3,
      prerequisites: [],
      requiredMaterials: [],
      approvalType: 'manager',
      positionX,
      positionY,
    };

    addNode(template.id, newNode);
    
    const updated = getTemplateById(template.id);
    if (updated) {
      setTemplate(updated);
    }
  }, [template, addNode, getTemplateById]);

  const handleUpdateNode = useCallback((nodeId: string, data: Partial<WorkflowNode>) => {
    if (!template) return;
    updateNode(template.id, nodeId, data);
    const updated = getTemplateById(template.id);
    if (updated) {
      setTemplate(updated);
      setSelectedNode(updated.nodes.find(n => n.id === nodeId) || null);
    }
  }, [template, updateNode, getTemplateById]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (!template) return;
    deleteNode(template.id, nodeId);
    
    const updated = getTemplateById(template.id);
    if (updated) {
      setTemplate(updated);
      setSelectedNode(null);
      setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    }
  }, [template, deleteNode, getTemplateById]);

  const handleSave = () => {
    if (template && templates.find(t => t.id === template.id)?.nodes) {
      updateTemplate(template.id, {});
    }
    navigate('/templates');
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (!template) return;
    e.stopPropagation();
    const node = template.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDragging({
      nodeId,
      offsetX: e.clientX - rect.left - node.positionX,
      offsetY: e.clientY - rect.top - node.positionY,
    });
    setSelectedNode(node);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !template) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const newX = Math.max(20, e.clientX - rect.left - dragging.offsetX);
    const newY = Math.max(20, e.clientY - rect.top - dragging.offsetY);

    handleUpdateNode(dragging.nodeId, {
      positionX: newX,
      positionY: newY,
    });
  }, [dragging, handleUpdateNode]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  const handleCanvasClick = () => {
    setSelectedNode(null);
    setConnectingFrom(null);
  };

  const handleStartConnection = (nodeId: string) => {
    if (connectingFrom === null) {
      setConnectingFrom(nodeId);
    } else if (connectingFrom !== nodeId) {
      setConnectingFrom(null);
    } else {
      const fromNode = template?.nodes.find(n => n.id === connectingFrom);
      const toNode = template?.nodes.find(n => n.id === nodeId);
      
      if (fromNode && toNode) {
        const newPrerequisites = [...toNode.prerequisites];
        if (!newPrerequisites.includes(connectingFrom)) {
          newPrerequisites.push(connectingFrom);
          handleUpdateNode(nodeId, { prerequisites: newPrerequisites });
          setConnections(prev => [...prev, { from: connectingFrom, to: nodeId }]);
        }
      }
      setConnectingFrom(null);
    }
  };

  const handleRemoveConnection = (from: string, to: string) => {
    if (!template) return;
    const toNode = template.nodes.find(n => n.id === to);
    if (toNode) {
      handleUpdateNode(to, {
        prerequisites: toNode.prerequisites.filter(p => p !== from),
      });
      setConnections(prev => prev.filter(c => !(c.from === from && c.to === to)));
    }
  };

  const renderConnections = () => {
    if (!template) return null;

    return connections.map((conn, idx) => {
      const fromNode = template.nodes.find(n => n.id === conn.from);
      const toNode = template.nodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return null;

      const fromX = fromNode.positionX + 120;
      const fromY = fromNode.positionY + 40;
      const toX = toNode.positionX;
      const toY = toNode.positionY + 40;

      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;

      return (
        <g key={idx}>
          <path
            d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
            fill="none"
            stroke="#64748b"
            strokeWidth="2"
            className="transition-colors"
          />
          <polygon
            points={`${toX},${toY} ${toX-8},${toY-4} ${toX-8},${toY+4}`}
            fill="#64748b"
          />
          <circle
            cx={midX}
            cy={midY}
            r={10}
            fill="white"
            stroke="#ef4444"
            strokeWidth="2"
            className="cursor-pointer hover:fill-red-50 transition-all opacity-0 group-hover:opacity-100"
            onClick={() => handleRemoveConnection(conn.from, conn.to)}
          />
          <X
            x={midX - 4}
            y={midY - 4}
            size={8}
            className="pointer-events-none text-red-500 opacity-0 group-hover:opacity-100"
          />
        </g>
      );
    });
  };

  if (!template) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/templates')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            返回
          </button>
          <div className="h-6 w-px bg-slate-300" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">{template.name}</h1>
            <p className="text-sm text-slate-500">{template.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors shadow-lg shadow-amber-500/20"
          >
            <Save className="h-4 w-4" />
            保存模板
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex h-full">
          <div className="w-64 border-r border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">节点库</h3>
            <div className="space-y-2">
              {nodeTypeConfig.map((config) => (
                <button
                  key={config.type}
                  onClick={() => handleAddNode(config.type)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all group"
                >
                  <div className={['w-8 h-8 rounded-md flex items-center justify-center text-white', config.color].join(' ')}>
                    <config.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">{config.label}</span>
                  <Plus className="h-4 w-4 text-slate-400 ml-auto" />
                </button>
              ))}
            </div>

            {connectingFrom && (
              <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700 font-medium">连线模式</p>
                <p className="text-xs text-amber-600 mt-1">点击目标节点完成连线</p>
                <button
                  onClick={() => setConnectingFrom(null)}
                  className="mt-2 text-xs text-amber-600 hover:text-amber-800 underline"
                >
                  取消
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 relative overflow-auto bg-slate-100">
            <div
              ref={canvasRef}
              className="relative w-full h-full min-w-[1200px] min-h-[800px]"
              onClick={handleCanvasClick}
              style={{
                backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {renderConnections()}
              </svg>

              {template.nodes.map((node) => {
                const config = nodeTypeConfig.find(c => c.type === node.type);
                const isSelected = selectedNode?.id === node.id;
                const isConnecting = connectingFrom === node.id;

                return (
                  <div
                    key={node.id}
                    className={[
                      'absolute w-56 rounded-xl border-2 bg-white shadow-lg cursor-move transition-all group',
                      isSelected ? 'border-amber-500 shadow-amber-500/20' : 'border-slate-200 hover:border-slate-300',
                      isConnecting ? 'ring-2 ring-amber-400 ring-offset-2' : '',
                      connectingFrom && connectingFrom !== node.id ? 'ring-2 ring-emerald-400 ring-offset-2 cursor-pointer' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      left: node.positionX,
                      top: node.positionY,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, node.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom && connectingFrom !== node.id) {
                        handleStartConnection(node.id);
                      } else {
                        setSelectedNode(node);
                      }
                    }}
                  >
                    <div className={['h-2 rounded-t-lg', config?.color || 'bg-slate-500'].join(' ')} />
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={['w-8 h-8 rounded-md flex items-center justify-center text-white', config?.color || 'bg-slate-500'].join(' ')}>
                          {config?.icon && <config.icon className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-800 truncate">{node.name}</h4>
                          <p className="text-xs text-slate-500">{roleLabels[node.assigneeRole]}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        <span>{node.durationDays} 天</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartConnection(node.id);
                          }}
                          className="flex-1 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          连接
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingNode(node);
                          }}
                          className="flex-1 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedNode && (
            <div className="w-80 border-l border-slate-200 bg-white p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-800">节点属性</h3>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1.5 hover:bg-slate-100 rounded transition-colors"
                >
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">节点名称</label>
                  <input
                    type="text"
                    value={selectedNode.name}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">节点类型</label>
                  <div className="px-3 py-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-600">{nodeTypeLabels[selectedNode.type]}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">负责人角色</label>
                  <select
                    value={selectedNode.assigneeRole}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { assigneeRole: e.target.value as UserRole })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                  >
                    <option value="manager">项目经理</option>
                    <option value="executor">执行人员</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">工期（天）</label>
                  <input
                    type="number"
                    min="1"
                    value={selectedNode.durationDays}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { durationDays: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">审批方式</label>
                  <select
                    value={selectedNode.approvalType}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { approvalType: e.target.value as ApprovalType })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                  >
                    {approvalOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">前置条件</label>
                  <div className="space-y-2">
                    {template.nodes
                      .filter(n => n.id !== selectedNode.id)
                      .map((node) => {
                        const isSelected = selectedNode.prerequisites.includes(node.id);
                        return (
                          <label key={node.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const newPres = isSelected
                                  ? selectedNode.prerequisites.filter(p => p !== node.id)
                                  : [...selectedNode.prerequisites, node.id];
                                handleUpdateNode(selectedNode.id, { prerequisites: newPres });
                                setConnections(prev => {
                                  if (isSelected) {
                                    return prev.filter(c => !(c.from === node.id && c.to === selectedNode.id));
                                  } else {
                                    return [...prev, { from: node.id, to: selectedNode.id }];
                                  }
                                });
                              }}
                              className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500"
                            />
                            <span className="text-sm text-slate-700">{node.name}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">必填材料</label>
                  <div className="space-y-2">
                    {selectedNode.requiredMaterials.map((material, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <CheckSquare className="h-4 w-4 text-slate-400" />
                        <span className="flex-1 text-sm text-slate-600">{material}</span>
                        <button
                          onClick={() => {
                            const newMaterials = selectedNode.requiredMaterials.filter((_, i) => i !== idx);
                            handleUpdateNode(selectedNode.id, { requiredMaterials: newMaterials });
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="添加必填材料..."
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            const value = e.currentTarget.value.trim();
                            if (value && !selectedNode.requiredMaterials.includes(value)) {
                              handleUpdateNode(selectedNode.id, {
                                requiredMaterials: [...selectedNode.requiredMaterials, value] });
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <button
                    onClick={() => handleDeleteNode(selectedNode.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除节点
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
