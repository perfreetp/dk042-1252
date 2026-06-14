import { create } from 'zustand';
import type { Project, ProjectNode, Status, Deliverable, Comment, ApprovalRecord, ApprovalDecision } from '@/types';
import { mockProjects } from '@/data/mockData';
import { generateId, getTodayISO, addDays, isOverdue } from '@/utils';
import { useTemplateStore } from './useTemplateStore';
import { useUserStore } from './useUserStore';

interface ProjectState {
  projects: Project[];
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  getProjectById: (id: string) => Project | undefined;
  createProject: (data: {
    templateId: string;
    templateVersionId?: string;
    name: string;
    clientName: string;
    startDate: string;
    managerId: string;
  }) => Project;
  updateProjectStatus: (id: string, status: Status) => void;
  updateNodeStatus: (projectId: string, nodeId: string, status: Status) => void;
  startNode: (projectId: string, nodeId: string) => void;
  submitForApproval: (projectId: string, nodeId: string) => void;
  approveNode: (projectId: string, nodeId: string, approverId: string, comment: string) => void;
  rejectNodeWithApproval: (projectId: string, nodeId: string, approverId: string, comment: string) => void;
  completeNode: (projectId: string, nodeId: string) => void;
  rejectNode: (projectId: string, nodeId: string) => void;
  addDeliverable: (projectId: string, nodeId: string, data: { name: string; url: string; uploadedBy: string }) => void;
  addComment: (projectId: string, nodeId: string, data: { content: string; userId: string }) => void;
  getMyProjects: (userId: string) => Project[];
  getMyTasks: (userId: string) => ProjectNode[];
  getPendingApprovals: (userId: string) => ProjectNode[];
  checkAndUpdateOverdue: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: mockProjects,
  selectedProject: null,
  setSelectedProject: (project) => set({ selectedProject: project }),
  getProjectById: (id) => get().projects.find(p => p.id === id),
  createProject: (data) => {
    const templateState = useTemplateStore.getState();
    let template = templateState.getTemplateById(data.templateId);
    
    if (data.templateVersionId && template) {
      const version = template.versions.find(v => v.id === data.templateVersionId);
      if (version) {
        template = {
          ...template,
          nodes: version.nodes,
          name: version.name,
          description: version.description,
        };
      }
    }
    
    if (!template) throw new Error('Template not found');

    const executorUsers = useUserStore.getState().getUsersByRole('executor');
    const managerUsers = useUserStore.getState().getUsersByRole('manager');

    const nodes: ProjectNode[] = template.nodes.map((node, index) => {
      let assigneeId = data.managerId;
      if (node.assigneeRole === 'executor') {
        assigneeId = executorUsers[index % executorUsers.length].id;
      } else if (node.assigneeRole === 'manager') {
        assigneeId = managerUsers.find(u => u.id === data.managerId)?.id || managerUsers[0].id;
      }

      const prerequisites = node.prerequisites.map(preId => {
        const preNode = template.nodes.find(n => n.id === preId);
        return preNode ? `pnode-${generateId()}-${preId}` : preId;
      });

      return {
        id: `pnode-${generateId()}`,
        projectId: '',
        templateNodeId: node.id,
        name: node.name,
        type: node.type,
        status: index === 0 ? 'pending' : 'pending',
        assigneeId,
        approvalType: node.approvalType,
        dueDate: addDays(data.startDate, index * 5),
        prerequisites,
        requiredMaterials: node.requiredMaterials,
        deliverables: [],
        comments: [],
        approvalHistory: [],
      };
    });

    nodes.forEach((node, index) => {
      const templateNode = template.nodes[index];
      node.prerequisites = templateNode.prerequisites.map(preId => {
        const preIndex = template.nodes.findIndex(n => n.id === preId);
        return nodes[preIndex]?.id || preId;
      });
      let startFrom = data.startDate;
      templateNode.prerequisites.forEach(preId => {
        const preIndex = template.nodes.findIndex(n => n.id === preId);
        if (preIndex >= 0) {
          const preNode = nodes[preIndex];
          if (preNode) {
            startFrom = preNode.dueDate;
          }
        }
      });
      node.dueDate = addDays(startFrom, templateNode.durationDays);
    });

    const newProject: Project = {
      id: generateId(),
      templateId: data.templateId,
      templateVersionId: data.templateVersionId,
      templateVersion: data.templateVersionId
        ? template.versions.find(v => v.id === data.templateVersionId)?.version
        : template.version,
      name: data.name,
      clientName: data.clientName,
      status: 'pending',
      startDate: data.startDate,
      endDate: nodes[nodes.length - 1]?.dueDate || data.startDate,
      managerId: data.managerId,
      nodes: nodes.map(n => ({ ...n, projectId: '' })),
    };

    newProject.nodes.forEach(n => n.projectId = newProject.id);

    set((state) => ({ projects: [...state.projects, newProject] }));
    return newProject;
  },
  updateProjectStatus: (id, status) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, status } : p
      ),
    }));
  },
  updateNodeStatus: (projectId, nodeId, status) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              nodes: p.nodes.map((n) => (n.id === nodeId ? { ...n, status } : n)),
            }
          : p
      ),
    }));
  },
  startNode: (projectId, nodeId) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              status: p.status === 'pending' ? 'in_progress' : p.status,
              nodes: p.nodes.map((n) =>
                n.id === nodeId
                  ? { ...n, status: 'in_progress', actualStartDate: getTodayISO() }
                  : n
              ),
            }
          : p
      ),
    }));
  },
  submitForApproval: (projectId, nodeId) => {
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          nodes: p.nodes.map((n) => {
            if (n.id !== nodeId) return n;
            if (n.approvalType === 'none') {
              return {
                ...n,
                status: 'completed' as Status,
                actualEndDate: getTodayISO(),
                submittedAt: getTodayISO(),
              };
            }
            return {
              ...n,
              status: 'pending_approval' as Status,
              submittedAt: getTodayISO(),
            };
          }),
        };
      });
      
      const project = projects.find(p => p.id === projectId);
      const node = project?.nodes.find(n => n.id === nodeId);
      
      if (node && node.approvalType === 'none') {
        const updatedNodes = project!.nodes;
        const nextNodes = updatedNodes.filter(n =>
          n.status === 'pending' && n.prerequisites.includes(nodeId)
        );

        nextNodes.forEach(nextNode => {
          const allPrereqsMet = nextNode.prerequisites.every(preId =>
            updatedNodes.find(n => n.id === preId)?.status === 'completed'
          );
          if (allPrereqsMet) {
            const idx = updatedNodes.findIndex(n => n.id === nextNode.id);
            if (idx >= 0) {
              updatedNodes[idx] = { ...updatedNodes[idx], status: 'pending' };
            }
          }
        });

        const allCompleted = updatedNodes.every(n => n.status === 'completed');
        const projectIdx = projects.findIndex(p => p.id === projectId);
        if (projectIdx >= 0) {
          projects[projectIdx] = {
            ...projects[projectIdx],
            nodes: updatedNodes,
            status: allCompleted ? 'completed' : projects[projectIdx].status,
            actualEndDate: allCompleted ? getTodayISO() : projects[projectIdx].actualEndDate,
          };
        }
      }
      
      return { projects };
    });
  },
  approveNode: (projectId, nodeId, approverId, comment) => {
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        
        const updatedNodes = p.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          
          const approvalRecord: ApprovalRecord = {
            id: generateId(),
            projectNodeId: nodeId,
            approverId,
            decision: 'approved',
            comment,
            createdAt: getTodayISO(),
          };
          
          return {
            ...n,
            status: 'completed' as Status,
            actualEndDate: getTodayISO(),
            approvalHistory: [...n.approvalHistory, approvalRecord],
          };
        });

        const nextNodes = updatedNodes.filter(n =>
          n.status === 'pending' && n.prerequisites.includes(nodeId)
        );

        nextNodes.forEach(nextNode => {
          const allPrereqsMet = nextNode.prerequisites.every(preId =>
            updatedNodes.find(n => n.id === preId)?.status === 'completed'
          );
          if (allPrereqsMet) {
            const idx = updatedNodes.findIndex(n => n.id === nextNode.id);
            if (idx >= 0) {
              updatedNodes[idx] = { ...updatedNodes[idx], status: 'pending' };
            }
          }
        });

        const allCompleted = updatedNodes.every(n => n.status === 'completed');

        return {
          ...p,
          nodes: updatedNodes,
          status: allCompleted ? 'completed' : p.status,
          actualEndDate: allCompleted ? getTodayISO() : p.actualEndDate,
        };
      });

      return { projects };
    });
  },
  rejectNodeWithApproval: (projectId, nodeId, approverId, comment) => {
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        
        return {
          ...p,
          nodes: p.nodes.map((n) => {
            if (n.id !== nodeId) return n;
            
            const approvalRecord: ApprovalRecord = {
              id: generateId(),
              projectNodeId: nodeId,
              approverId,
              decision: 'rejected',
              comment,
              createdAt: getTodayISO(),
            };
            
            return {
              ...n,
              status: 'rejected' as Status,
              approvalHistory: [...n.approvalHistory, approvalRecord],
            };
          }),
        };
      });

      return { projects };
    });
  },
  completeNode: (projectId, nodeId) => {
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;

        const updatedNodes = p.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, status: 'completed' as Status, actualEndDate: getTodayISO() }
            : n
        );

        const nextNodes = updatedNodes.filter(n =>
          n.status === 'pending' && n.prerequisites.includes(nodeId)
        );

        nextNodes.forEach(nextNode => {
          const allPrereqsMet = nextNode.prerequisites.every(preId =>
            updatedNodes.find(n => n.id === preId)?.status === 'completed'
          );
          if (allPrereqsMet) {
            const idx = updatedNodes.findIndex(n => n.id === nextNode.id);
            if (idx >= 0) {
              updatedNodes[idx] = { ...updatedNodes[idx], status: 'pending' };
            }
          }
        });

        const allCompleted = updatedNodes.every(n => n.status === 'completed');

        return {
          ...p,
          nodes: updatedNodes,
          status: allCompleted ? 'completed' : p.status,
          actualEndDate: allCompleted ? getTodayISO() : p.actualEndDate,
        };
      });

      return { projects };
    });
  },
  rejectNode: (projectId, nodeId) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              nodes: p.nodes.map((n) =>
                n.id === nodeId ? { ...n, status: 'rejected' as Status } : n
              ),
            }
          : p
      ),
    }));
  },
  addDeliverable: (projectId, nodeId, data) => {
    const newDeliverable: Deliverable = {
      id: generateId(),
      projectNodeId: nodeId,
      name: data.name,
      url: data.url,
      uploadedBy: data.uploadedBy,
      uploadedAt: getTodayISO(),
    };
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              nodes: p.nodes.map((n) =>
                n.id === nodeId
                  ? { ...n, deliverables: [...n.deliverables, newDeliverable] }
                  : n
              ),
            }
          : p
      ),
    }));
  },
  addComment: (projectId, nodeId, data) => {
    const newComment: Comment = {
      id: generateId(),
      projectNodeId: nodeId,
      content: data.content,
      userId: data.userId,
      createdAt: getTodayISO(),
    };
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              nodes: p.nodes.map((n) =>
                n.id === nodeId
                  ? { ...n, comments: [...n.comments, newComment] }
                  : n
              ),
            }
          : p
      ),
    }));
  },
  getMyProjects: (userId) => {
    return get().projects.filter(p => p.managerId === userId);
  },
  getMyTasks: (userId) => {
    const tasks: ProjectNode[] = [];
    get().projects.forEach(p => {
      p.nodes.forEach(n => {
        if (n.assigneeId === userId && n.status !== 'completed') {
          tasks.push(n);
        }
      });
    });
    return tasks;
  },
  getPendingApprovals: (userId) => {
    const approvals: ProjectNode[] = [];
    const user = useUserStore.getState().getUserById(userId);
    if (!user) return approvals;
    
    get().projects.forEach(p => {
      p.nodes.forEach(n => {
        if (n.status !== 'pending_approval') return;
        
        if (n.approvalType === 'manager' && user.role === 'manager') {
          approvals.push(n);
        } else if (n.approvalType === 'admin' && user.role === 'admin') {
          approvals.push(n);
        } else if (n.approvalType === 'multi_level' && (user.role === 'manager' || user.role === 'admin')) {
          approvals.push(n);
        }
      });
    });
    return approvals;
  },
  checkAndUpdateOverdue: () => {
    set((state) => ({
      projects: state.projects.map((p) => ({
        ...p,
        nodes: p.nodes.map((n) =>
          (n.status === 'in_progress' || n.status === 'pending') && isOverdue(n.dueDate)
            ? { ...n, status: 'delayed' as Status }
            : n
        ),
      })),
    }));
  },
}));
