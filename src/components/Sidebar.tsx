import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  GitBranch,
  FolderKanban,
  ListTodo,
  AlertTriangle,
  BarChart3,
  Workflow,
} from 'lucide-react';
import { useUserStore } from '@/store';
import { roleLabels } from '@/utils';
import { Avatar } from './Avatar';
import type { UserRole } from '@/types';

interface NavItem {
  path: string;
  icon: React.ElementType;
  label: string;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  {
    path: '/templates',
    icon: GitBranch,
    label: '流程模板',
    roles: ['admin', 'manager'],
  },
  {
    path: '/projects',
    icon: FolderKanban,
    label: '执行中心',
    roles: ['admin', 'manager'],
  },
  {
    path: '/tasks',
    icon: ListTodo,
    label: '任务中心',
    roles: ['admin', 'manager', 'executor'],
  },
  {
    path: '/exceptions',
    icon: AlertTriangle,
    label: '异常处理',
    roles: ['admin', 'manager', 'executor'],
  },
  {
    path: '/reports',
    icon: BarChart3,
    label: '报表统计',
    roles: ['admin', 'manager'],
  },
];

export const Sidebar = () => {
  const { currentUser } = useUserStore();

  const filteredNavItems = navItems.filter((item) =>
    item.roles.includes(currentUser.role)
  );

  return (
    <div className="flex h-full flex-col bg-slate-800 text-slate-100">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500">
          <Workflow className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold">FlowOrk</h1>
          <p className="text-xs text-slate-400">工作流编排系统</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-slate-700/50">
          <Avatar src={currentUser.avatar} alt={currentUser.name} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{currentUser.name}</p>
            <p className="text-xs text-slate-400">{roleLabels[currentUser.role]}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
