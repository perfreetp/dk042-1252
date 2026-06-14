import type { Project, ProjectNode } from '@/types';
import { isOverdue, isAtRisk } from './date';

export function isNodeRisky(node: ProjectNode): boolean {
  if (node.status === 'completed') return false;
  return isAtRisk(node.dueDate);
}

export function isNodeOverdue(node: ProjectNode): boolean {
  if (node.status === 'completed') return false;
  return isOverdue(node.dueDate);
}

export function isProjectAtRisk(project: Project): boolean {
  return project.nodes.some(node => isNodeRisky(node));
}

export function isProjectOverdue(project: Project): boolean {
  if (project.status === 'completed') return false;
  if (project.nodes.some(node => isNodeOverdue(node))) return true;
  return isOverdue(project.endDate);
}

export function getProjectRiskLevel(project: Project): 'danger' | 'warning' | 'normal' {
  if (project.status === 'completed') return 'normal';
  if (isProjectOverdue(project)) return 'danger';
  if (isProjectAtRisk(project)) return 'warning';
  return 'normal';
}

export function countProjectRiskNodes(project: Project): { overdue: number; atRisk: number; total: number } {
  const activeNodes = project.nodes.filter(n => n.status !== 'completed');
  return {
    overdue: activeNodes.filter(n => isNodeOverdue(n)).length,
    atRisk: activeNodes.filter(n => isNodeRisky(n) && !isNodeOverdue(n)).length,
    total: activeNodes.filter(n => isNodeRisky(n)).length,
  };
}

export function countUserRiskTasks(nodes: ProjectNode[]): { overdue: number; atRisk: number; total: number } {
  const activeNodes = nodes.filter(n => n.status !== 'completed');
  return {
    overdue: activeNodes.filter(n => isNodeOverdue(n)).length,
    atRisk: activeNodes.filter(n => isNodeRisky(n) && !isNodeOverdue(n)).length,
    total: activeNodes.filter(n => isNodeRisky(n)).length,
  };
}
