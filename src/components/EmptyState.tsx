import { FileText, FolderOpen, AlertCircle, ListTodo, BarChart3, CheckCircle2 } from 'lucide-react';

interface EmptyStateProps {
  icon?: 'file' | 'folder' | 'alert' | 'task' | 'chart' | 'check';
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const icons = {
  file: FileText,
  folder: FolderOpen,
  alert: AlertCircle,
  task: ListTodo,
  chart: BarChart3,
  check: CheckCircle2,
};

export const EmptyState = ({ icon = 'folder', title, description, action }: EmptyStateProps) => {
  const Icon = icons[icon];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-slate-100 p-6 mb-4">
        <Icon className="w-12 h-12 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
      {description && (
        <p className="text-slate-500 text-center max-w-sm mb-6">{description}</p>
      )}
      {action}
    </div>
  );
};
