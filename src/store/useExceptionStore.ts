import { create } from 'zustand';
import type { Exception, ExceptionStatus } from '@/types';
import { mockExceptions } from '@/data/mockData';
import { generateId, getTodayISO } from '@/utils';

interface ExceptionState {
  exceptions: Exception[];
  getExceptionsByProject: (projectId: string) => Exception[];
  getExceptionById: (id: string) => Exception | undefined;
  createException: (data: {
    projectId: string;
    projectNodeId?: string;
    title: string;
    changeReason: string;
    impactScope: string;
    remedyAction: string;
    createdBy: string;
  }) => Exception;
  updateExceptionStatus: (id: string, status: ExceptionStatus) => void;
  updateException: (id: string, data: Partial<Exception>) => void;
}

export const useExceptionStore = create<ExceptionState>((set, get) => ({
  exceptions: mockExceptions,
  getExceptionsByProject: (projectId) => get().exceptions.filter(e => e.projectId === projectId),
  getExceptionById: (id) => get().exceptions.find(e => e.id === id),
  createException: (data) => {
    const newException: Exception = {
      id: generateId(),
      projectId: data.projectId,
      projectNodeId: data.projectNodeId,
      title: data.title,
      changeReason: data.changeReason,
      impactScope: data.impactScope,
      remedyAction: data.remedyAction,
      status: 'open',
      createdBy: data.createdBy,
      createdAt: getTodayISO(),
    };
    set((state) => ({ exceptions: [...state.exceptions, newException] }));
    return newException;
  },
  updateExceptionStatus: (id, status) => {
    set((state) => ({
      exceptions: state.exceptions.map((e) =>
        e.id === id ? { ...e, status } : e
      ),
    }));
  },
  updateException: (id, data) => {
    set((state) => ({
      exceptions: state.exceptions.map((e) =>
        e.id === id ? { ...e, ...data } : e
      ),
    }));
  },
}));
