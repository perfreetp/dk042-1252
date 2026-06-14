import { create } from 'zustand';
import type { WorkflowTemplate, WorkflowNode, NodeType, UserRole, ApprovalType } from '@/types';
import { mockTemplates } from '@/data/mockData';
import { generateId, getTodayISO } from '@/utils';

interface TemplateState {
  templates: WorkflowTemplate[];
  selectedTemplate: WorkflowTemplate | null;
  setSelectedTemplate: (template: WorkflowTemplate | null) => void;
  getTemplateById: (id: string) => WorkflowTemplate | undefined;
  createTemplate: (data: { name: string; description: string }) => WorkflowTemplate;
  updateTemplate: (id: string, data: Partial<WorkflowTemplate>) => void;
  deleteTemplate: (id: string) => void;
  addNode: (templateId: string, node: Omit<WorkflowNode, 'id' | 'templateId'>) => void;
  updateNode: (templateId: string, nodeId: string, data: Partial<WorkflowNode>) => void;
  deleteNode: (templateId: string, nodeId: string) => void;
}

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
              nodes: t.nodes.filter((n) => n.id !== nodeId),
              updatedAt: getTodayISO(),
            }
          : t
      ),
    }));
  },
}));
