export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const addDays = (date: string, days: number): string => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

export const daysBetween = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const getOverdueDays = (dueDate: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - due.getTime();
  if (diffTime <= 0) return 0;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const getDaysUntilDue = (dueDate: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const isOverdue = (dueDate: string): boolean => {
  return getOverdueDays(dueDate) > 0;
};

export const isAtRisk = (dueDate: string): boolean => {
  if (isOverdue(dueDate)) return true;
  const days = getDaysUntilDue(dueDate);
  return days >= 0 && days <= 3;
};

export const getDateStatus = (dueDate: string, status?: string): {
  level: 'normal' | 'warning' | 'danger' | 'completed';
  label: string;
  className: string;
} => {
  if (status === 'completed') {
    return { level: 'completed', label: '已完成', className: 'text-emerald-600' };
  }
  const overdueDays = getOverdueDays(dueDate);
  if (overdueDays > 0) {
    return {
      level: 'danger',
      label: overdueDays === 1 ? '已超期 1 天' : `已超期 ${overdueDays} 天`,
      className: 'text-red-600 font-semibold',
    };
  }
  const daysLeft = getDaysUntilDue(dueDate);
  if (daysLeft <= 3) {
    if (daysLeft === 0) {
      return { level: 'warning', label: '今天截止', className: 'text-orange-600 font-semibold' };
    }
    if (daysLeft === 1) {
      return { level: 'warning', label: '还剩 1 天', className: 'text-orange-600' };
    }
    if (daysLeft === 2) {
      return { level: 'warning', label: '还剩 2 天', className: 'text-orange-500' };
    }
    return { level: 'warning', label: '还剩 3 天', className: 'text-amber-500' };
  }
  if (daysLeft <= 7) {
    return { level: 'normal', label: `还剩 ${daysLeft} 天`, className: 'text-slate-500' };
  }
  return { level: 'normal', label: `还剩 ${daysLeft} 天`, className: 'text-slate-400' };
};

export const formatDurationText = (start: string, end: string): string => {
  const days = daysBetween(start, end);
  if (days === 0) return '当天';
  if (days === 1) return '1 天';
  return `${days} 天`;
};

export const getTodayISO = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const getDateRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
};
