import type { Status, ExceptionStatus, NodeType } from '@/types';
import { statusLabels, statusColors, exceptionStatusLabels, exceptionStatusColors, nodeTypeLabels } from '@/utils';

interface StatusBadgeProps {
  status: Status | ExceptionStatus;
  type?: 'status' | 'exception';
  size?: 'sm' | 'md';
}

export const StatusBadge = ({ status, type = 'status', size = 'md' }: StatusBadgeProps) => {
  const isException = type === 'exception';
  const label = isException ? exceptionStatusLabels[status as ExceptionStatus] : statusLabels[status as Status];
  const colorClass = isException ? exceptionStatusColors[status as ExceptionStatus] : statusColors[status as Status];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={`inline-flex items-center rounded-md font-medium ${colorClass} ${sizeClass}`}>
      {label}
    </span>
  );
};

interface NodeTypeBadgeProps {
  type: NodeType;
}

export const NodeTypeBadge = ({ type }: NodeTypeBadgeProps) => {
  const colors: Record<NodeType, string> = {
    quotation: 'bg-blue-100 text-blue-700',
    contract: 'bg-purple-100 text-purple-700',
    material: 'bg-emerald-100 text-emerald-700',
    venue: 'bg-amber-100 text-amber-700',
    rehearsal: 'bg-pink-100 text-pink-700',
    settlement: 'bg-cyan-100 text-cyan-700',
    custom: 'bg-slate-100 text-slate-700',
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium ${colors[type]}`}>
      {nodeTypeLabels[type]}
    </span>
  );
};
