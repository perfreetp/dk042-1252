import { create } from 'zustand';
import type { WorkflowTemplate, WorkflowNode, NodeType, UserRole, ApprovalType, TemplateVersion } from '@/types';
import { mockTemplates } from '@/data/mockData';
import { generateId, getTodayISO } from '@/utils';

interface TemplateDiff {
  type: 'added' | 'removed' | 'modified';
  field?: string;
  nodeName?: string;
  oldValue?: string | number | string[];
  newValue?: string | number | string[];
}

interface TemplateState {
  templates: WorkflowTemplate[];
  selectedTemplate: WorkflowTemplate | null;
  setSelectedTemplate: (template: WorkflowTemplate | null) => void;
  getTemplateById: (id: string) => WorkflowTemplate | undefined;
  createTemplate: (data: { name: string; description: string }) => WorkflowTemplate;
  updateTemplate: (id: string, data: Partial<WorkflowTemplate>) => void;
  deleteTemplate: (id: string) => void;
  copyTemplate: (id: string, newName: string) => WorkflowTemplate;
  createVersion: (id: string, data: { changelog: string; createdBy: string }) => TemplateVersion | undefined;
  getVersionById: (templateId: string, versionId: string) => TemplateVersion | undefined;
  compareVersions: (templateId: string, version1Id: string, version2Id?: string) => TemplateDiff[];
  addNode: (templateId: string, node: Omit<WorkflowNode, 'id' | 'templateId'>) => void;
  updateNode: (templateId: string, nodeId: string, data: Partial<WorkflowNode>) => void;
  deleteNode: (templateId: string, nodeId: string) => void;
}

const deepCopyNodes = (nodes: WorkflowNode[], newTemplateId: string): WorkflowNode[] => {
  const idMap: Record<string, string> = {};
  const newNodes = nodes.map(node => {
    const newId = generateId();
    idMap[node.id] = newId;
    return {
      ...node,
      id: newId,
      templateId: newTemplateId,
    };
  });
  return newNodes.map(node => ({
    ...node,
    prerequisites: node.prerequisites.map(preId => idMap[preId] || preId),
  }));
};

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: mockTemplates,
  selectedTemplate: null,
  setSelectedTemplate: (template) => set({ selectedTemplate: template }),
  getTemplateById: (id) => get().templates.find(t => t.id === id),
  createTemplate: (data) => {
    const newTemplate: WorkflowTemplate = {
      id: generateId(),
      name: data.name,
      description: data.description,
      nodes: [],
      createdAt: getTodayISO(),
      updatedAt: getTodayISO(),
      version: '1.0',
      versions: [],
    };
    set((state) => ({ templates: [...state.templates, newTemplate] }));
    return newTemplate;
  },
  updateTemplate: (id, data) => {
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id ? { ...t, ...data, updatedAt: getTodayISO() } : t
      ),
    }));
  },
  deleteTemplate: (id) => {
    set((state) => ({
      templates: state.templates.filter((t) => t.id !== id),
    }));
  },
  copyTemplate: (id, newName) => {
    const template = get().getTemplateById(id);
    if (!template) throw new Error('Template not found');
    
    const newTemplateId = generateId();
    const newTemplate: WorkflowTemplate = {
      id: newTemplateId,
      name: newName,
      description: template.description + ' (副本)',
      nodes: deepCopyNodes(template.nodes, newTemplateId),
      createdAt: getTodayISO(),
      updatedAt: getTodayISO(),
      version: '1.0',
      versions: [],
      parentTemplateId: template.id,
    };
    
    set((state) => ({ templates: [...state.templates, newTemplate] }));
    return newTemplate;
  },
  createVersion: (id, data) => {
    const template = get().getTemplateById(id);
    if (!template) return undefined;
    
    const versionParts = template.version.split('.').map(v => parseInt(v, 10) || 0);
    versionParts[versionParts.length - 1] = (versionParts[versionParts.length - 1] || 0) + 1;
    const newVersion = versionParts.join('.');
    
    const newVersionRecord: TemplateVersion = {
      id: generateId(),
      templateId: template.id,
      version: newVersion,
      name: template.name,
      description: template.description,
      nodes: JSON.parse(JSON.stringify(template.nodes)),
      createdAt: getTodayISO(),
      createdBy: data.createdBy,
      changelog: data.changelog,
    };
    
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id
          ? {
              ...t,
              version: newVersion,
              versions: [...t.versions, newVersionRecord],
              updatedAt: getTodayISO(),
            }
          : t
      ),
    }));
    
    return newVersionRecord;
  },
  getVersionById: (templateId, versionId) => {
    const template = get().getTemplateById(templateId);
    return template?.versions.find(v => v.id === versionId);
  },
  compareVersions: (templateId, version1Id, version2Id) => {
    const template = get().getTemplateById(templateId);
    if (!template) return [];
    
    const v1 = template.versions.find(v => v.id === version1Id);
    const v2Nodes = version2Id
      ? template.versions.find(v => v.id === version2Id)?.nodes
      : template.nodes;
    
    if (!v1 || !v2Nodes) return [];
    
    const diffs: TemplateDiff[] = [];
    const v1Nodes = v1.nodes;
    
    const v1NodeMap = new Map(v1Nodes.map(n => [n.id, n]));
    const v2NodeMap = new Map(v2Nodes.map(n => [n.id, n]));
    
    v2Nodes.forEach(node => {
      const oldNode = v1NodeMap.get(node.id);
      if (!oldNode) {
        diffs.push({ type: 'added', nodeName: node.name, field: '节点' });
      } else {
        (['name', 'type', 'assigneeRole', 'durationDays', 'approvalType'] as const).forEach(field => {
          if (String(oldNode[field]) !== String(node[field])) {
            diffs.push({
              type: 'modified',
              nodeName: node.name,
              field,
              oldValue: String(oldNode[field]),
              newValue: String(node[field]),
            });
          }
        });
        if (JSON.stringify(oldNode.requiredMaterials) !== JSON.stringify(node.requiredMaterials)) {
          diffs.push({
            type: 'modified',
            nodeName: node.name,
            field: 'requiredMaterials',
            oldValue: oldNode.requiredMaterials,
            newValue: node.requiredMaterials,
          });
        }
      }
    });
    
    v1Nodes.forEach(node => {
      if (!v2NodeMap.has(node.id)) {
        diffs.push({ type: 'removed', nodeName: node.name, field: '节点' });
      }
    });
    
    return diffs;
  },
  addNode: (templateId, node) => {
    const newNode: WorkflowNode = {
      ...node,
      id: generateId(),
      templateId,
    };
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === templateId
          ? { ...t, nodes: [...t.nodes, newNode], updatedAt: getTodayISO() }
          : t
      ),
    }));
  },
  updateNode: (templateId, nodeId, data) => {
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === templateId
          ? {
              ...t,
              nodes: t.nodes.map((n) => (n.id === nodeId ? { ...n, ...data } : n)),
              updatedAt: getTodayISO(),
            }
          : t
      ),
    }));
  },
  deleteNode: (templateId, nodeId) => {
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === templateId
          ? {
              ...t,
              nodes: t.nodes.filter((n) => n.id !== nodeId).map(n => ({
                ...n,
                prerequisites: n.prerequisites.filter(p => p !== nodeId),
              })),
              updatedAt: getTodayISO(),
            }
          : t
      ),
    }));
  },
}));

export type { TemplateDiff };
