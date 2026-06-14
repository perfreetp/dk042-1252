export type NodeType = 'quotation' | 'contract' | 'material' | 'venue' | 'rehearsal' | 'settlement' | 'custom';

export type ApprovalType = 'none' | 'manager' | 'admin' | 'multi_level';

export type Status = 'pending' | 'in_progress' | 'pending_approval' | 'completed' | 'delayed' | 'rejected';

export type UserRole = 'admin' | 'manager' | 'executor';

export type ExceptionStatus = 'open' | 'in_progress' | 'resolved';

export type ApprovalDecision = 'approved' | 'rejected';

export type ApprovalStageStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

export interface ApprovalStage {
  id: string;
  order: number;
  role: UserRole;
  label: string;
  status: ApprovalStageStatus;
  approverId?: string;
  completedAt?: string;
}

export interface ApprovalRecord {
  id: string;
  projectNodeId: string;
  approverId: string;
  approverRole: UserRole;
  stageOrder: number;
  stageLabel: string;
  decision: ApprovalDecision;
  comment: string;
  createdAt: string;
}

export interface WorkflowNode {
  id: string;
  templateId: string;
  name: string;
  type: NodeType;
  assigneeRole: UserRole;
  durationDays: number;
  prerequisites: string[];
  requiredMaterials: string[];
  approvalType: ApprovalType;
  positionX: number;
  positionY: number;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  createdAt: string;
  createdBy: string;
  changelog: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  createdAt: string;
  updatedAt: string;
  version: string;
  versions: TemplateVersion[];
  parentTemplateId?: string;
}

export interface Deliverable {
  id: string;
  projectNodeId: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Comment {
  id: string;
  projectNodeId: string;
  content: string;
  userId: string;
  createdAt: string;
}

export interface ProjectNode {
  id: string;
  projectId: string;
  templateNodeId: string;
  name: string;
  type: NodeType;
  status: Status;
  assigneeId: string;
  approvalType: ApprovalType;
  approvalStages: ApprovalStage[];
  currentStageOrder: number;
  dueDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  submittedAt?: string;
  prerequisites: string[];
  requiredMaterials: string[];
  deliverables: Deliverable[];
  comments: Comment[];
  approvalHistory: ApprovalRecord[];
}

export interface Project {
  id: string;
  templateId: string;
  templateVersionId?: string;
  templateVersion?: string;
  templateName?: string;
  name: string;
  clientName: string;
  status: Status;
  startDate: string;
  endDate: string;
  actualEndDate?: string;
  managerId: string;
  nodes: ProjectNode[];
}

export interface Exception {
  id: string;
  projectId: string;
  projectNodeId?: string;
  title: string;
  changeReason: string;
  impactScope: string;
  remedyAction: string;
  status: ExceptionStatus;
  createdBy: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar: string;
  email: string;
}

export interface NodeConnection {
  from: string;
  to: string;
}
