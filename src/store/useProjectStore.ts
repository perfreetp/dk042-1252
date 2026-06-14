import { create } from 'zustand';
import type { Project, ProjectNode, Status, Deliverable, Comment, ApprovalRecord, ApprovalDecision, ApprovalStage, ApprovalType, UserRole } from '@/types';
import { mockProjects } from '@/data/mockData';
import { generateId, getTodayISO, addDays, isOverdue } from '@/utils';
import { useTemplateStore } from './useTemplateStore';
import { useUserStore } from './useUserStore';

function buildApprovalStages(approvalType: ApprovalType): ApprovalStage[] {
  switch (approvalType) {
    case 'none':
      return [];
    case 'manager':
      return [
        {
          id: generateId(),
          order: 1,
          role: 'manager',
          label: '项目经理审批',
          status: 'pending',
        },
      ];
    case 'admin':
      return [
        {
          id: generateId(),
          order: 1,
          role: 'admin',
          label: '管理员审批',
          status: 'pending',
        },
      ];
    case 'multi_level':
      return [
        {
          id: generateId(),
          order: 1,
          role: 'manager',
          label: '项目经理审核',
          status: 'pending',
        },
        {
          id: generateId(),
          order: 2,
          role: 'admin',
          label: '管理员终审',
          status: 'pending',
        },
      ];
    default:
      return [];
  }
}

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
  approveNodeMulti: (projectId: string, nodeId: string, approverId: string, approverRole: UserRole, comment: string) => void;
  rejectNodeMulti: (projectId: string, nodeId: string, approverId: string, approverRole: UserRole, comment: string) => void;
  completeNode: (projectId: string, nodeId: string) => void;
  rejectNode: (projectId: string, nodeId: string) => void;
  addDeliverable: (projectId: string, nodeId: string, data: { name: string; url: string; uploadedBy: string }) => void;
  addComment: (projectId: string, nodeId: string, data: { content: string; userId: string }) => void;
  getMyProjects: (userId: string) => Project[];
  getMyTasks: (userId: string) => ProjectNode[];
  getPendingApprovals: (userId: string) => ProjectNode[];
  getNodeApprovalInfo: (projectId: string, nodeId: string, userId: string) => {
    canApprove: boolean;
    nextApproverRole: UserRole | null;
    currentStageLabel: string;
    completedStages: ApprovalStage[];
    pendingStages: ApprovalStage[];
    currentApprovalRound: number;
    previousRoundComment: string | null;
  };
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
        approvalStages: buildApprovalStages(node.approvalType),
        currentStageOrder: 0,
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
      templateName: template.name,
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
            const stages = [...n.approvalStages];
            let currentStageOrder = n.currentStageOrder;
            if (stages.length > 0) {
              currentStageOrder = 1;
              stages[0] = { ...stages[0], status: 'pending' as const };
            }
            return {
              ...n,
              status: 'pending_approval' as Status,
              submittedAt: getTodayISO(),
              approvalStages: stages,
              currentStageOrder,
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
  approveNodeMulti: (projectId, nodeId, approverId, approverRole, comment) => {
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        
        const updatedNodes = [...p.nodes];
        const nodeIdx = updatedNodes.findIndex(n => n.id === nodeId);
        if (nodeIdx < 0) return p;

        const node = updatedNodes[nodeIdx];
        if (!node || node.status !== 'pending_approval') {
          console.warn('Node not pending approval');
          return p;
        }

        if (!node.approvalStages || node.approvalStages.length === 0) {
          console.warn('No approval stages configured');
          return p;
        }

        const currentStageIdx = node.approvalStages.findIndex(s => s.order === node.currentStageOrder);
        if (currentStageIdx < 0) {
          console.warn('Invalid current stage order');
          return p;
        }
        const currentStage = node.approvalStages[currentStageIdx];
        if (currentStage.status !== 'pending') {
          console.warn('Current stage is not pending, may have been processed already');
          return p;
        }

        if (currentStage.role !== approverRole) {
          console.warn(`Approver role ${approverRole} does not match required role ${currentStage.role}`);
          return p;
        }
        
        const approvalRecord: ApprovalRecord = {
          id: generateId(),
          projectNodeId: nodeId,
          approverId,
          approverRole,
          stageOrder: currentStage.order,
          stageLabel: currentStage.label,
          decision: 'approved',
          comment,
          createdAt: getTodayISO(),
        };
        
        const updatedStages = [...node.approvalStages];
        updatedStages[currentStageIdx] = {
          ...currentStage,
          status: 'approved',
          approverId,
          completedAt: getTodayISO(),
        };
        
        const isLastStage = currentStage.order === node.approvalStages.length;
        
        if (isLastStage) {
          updatedNodes[nodeIdx] = {
            ...node,
            status: 'completed' as Status,
            actualEndDate: getTodayISO(),
            approvalStages: updatedStages,
            currentStageOrder: node.currentStageOrder + 1,
            approvalHistory: [...node.approvalHistory, approvalRecord],
          };
          
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
        } else {
          const nextStageIdx = updatedStages.findIndex(s => s.order === node.currentStageOrder + 1);
          if (nextStageIdx >= 0) {
            updatedStages[nextStageIdx] = {
              ...updatedStages[nextStageIdx],
              status: 'pending',
            };
          }
          
          updatedNodes[nodeIdx] = {
            ...node,
            status: 'pending_approval' as Status,
            approvalStages: updatedStages,
            currentStageOrder: node.currentStageOrder + 1,
            approvalHistory: [...node.approvalHistory, approvalRecord],
          };
          
          return {
            ...p,
            nodes: updatedNodes,
          };
        }
      });

      return { projects };
    });
  },
  rejectNodeMulti: (projectId, nodeId, approverId, approverRole, comment) => {
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        
        const updatedNodes = [...p.nodes];
        const nodeIdx = updatedNodes.findIndex(n => n.id === nodeId);
        if (nodeIdx < 0) return p;

        const node = updatedNodes[nodeIdx];
        if (!node || node.status !== 'pending_approval') {
          console.warn('Node not pending approval');
          return p;
        }

        if (!node.approvalStages || node.approvalStages.length === 0) {
          console.warn('No approval stages configured');
          return p;
        }

        const currentStageIdx = node.approvalStages.findIndex(s => s.order === node.currentStageOrder);
        if (currentStageIdx < 0) {
          console.warn('Invalid current stage order');
          return p;
        }
        const currentStage = node.approvalStages[currentStageIdx];
        if (currentStage.status !== 'pending') {
          console.warn('Current stage is not pending, may have been processed already');
          return p;
        }

        if (currentStage.role !== approverRole) {
          console.warn(`Approver role ${approverRole} does not match required role ${currentStage.role}`);
          return p;
        }

        const approvalRecord: ApprovalRecord = {
          id: generateId(),
          projectNodeId: nodeId,
          approverId,
          approverRole,
          stageOrder: currentStage.order,
          stageLabel: currentStage.label,
          decision: 'rejected',
          comment,
          createdAt: getTodayISO(),
        };
        
        const resetStages = node.approvalStages.map(s => ({
          ...s,
          status: 'pending' as const,
          approverId: undefined,
          completedAt: undefined,
        }));
        
        updatedNodes[nodeIdx] = {
          ...node,
          status: 'rejected' as Status,
          approvalStages: resetStages,
          currentStageOrder: 0,
          approvalHistory: [...node.approvalHistory, approvalRecord],
        };
        
        return {
          ...p,
          nodes: updatedNodes,
        };
      });

      return { projects };
    });
  },
  completeNode: (projectId, nodeId) => {
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;

        const updatedNodes = p.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const stages = n.approvalStages && n.approvalStages.length > 0 
            ? n.approvalStages 
            : buildApprovalStages(n.approvalType);
          return { 
            ...n, 
            status: 'completed' as Status, 
            actualEndDate: getTodayISO(),
            approvalStages: stages,
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
        if (n.currentStageOrder === 0) return;
        if (n.approvalStages.length === 0) return;
        
        const currentStage = n.approvalStages.find(s => s.order === n.currentStageOrder);
        if (!currentStage) return;
        if (currentStage.status !== 'pending') return;
        if (currentStage.role !== user.role) return;
        
        approvals.push(n);
      });
    });
    return approvals;
  },
  getNodeApprovalInfo: (projectId, nodeId, userId) => {
    const emptyResult = {
      canApprove: false,
      nextApproverRole: null as UserRole | null,
      currentStageLabel: '',
      completedStages: [] as ApprovalStage[],
      pendingStages: [] as ApprovalStage[],
      currentApprovalRound: 1,
      previousRoundComment: null as string | null,
    };
    
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return emptyResult;
    
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node) return emptyResult;
    
    const user = useUserStore.getState().getUserById(userId);
    if (!user) return emptyResult;
    
    const stages = node.approvalStages;
    const completedStages = stages.filter(s => s.status === 'approved');
    const pendingStages = stages.filter(s => s.status === 'pending' || s.status === 'rejected');
    
    const approvedCount = completedStages.length;
    const currentApprovalRound = approvedCount + 1;
    
    let previousRoundComment: string | null = null;
    if (node.approvalHistory.length > 0) {
      const lastRecord = [...node.approvalHistory].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      if (lastRecord && lastRecord.comment) {
        previousRoundComment = lastRecord.comment;
      }
    }
    
    let canApprove = false;
    let nextApproverRole: UserRole | null = null;
    let currentStageLabel = '';
    
    if (node.status === 'pending_approval' && node.currentStageOrder > 0) {
      const currentStage = stages.find(s => s.order === node.currentStageOrder);
      if (currentStage) {
        currentStageLabel = currentStage.label;
        nextApproverRole = currentStage.role;
        if (currentStage.status === 'pending' && currentStage.role === user.role) {
          canApprove = true;
        }
      }
    }
    
    return {
      canApprove,
      nextApproverRole,
      currentStageLabel,
      completedStages,
      pendingStages,
      currentApprovalRound,
      previousRoundComment,
    };
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
