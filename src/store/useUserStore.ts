import { create } from 'zustand';
import type { User, UserRole } from '@/types';
import { mockUsers, getCurrentUser as getMockCurrentUser } from '@/data/mockData';

interface UserState {
  users: User[];
  currentUser: User;
  setCurrentUser: (user: User) => void;
  getUsersByRole: (role: UserRole) => User[];
  getUserById: (id: string) => User | undefined;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: mockUsers,
  currentUser: getMockCurrentUser(),
  setCurrentUser: (user: User) => set({ currentUser: user }),
  getUsersByRole: (role: UserRole) => get().users.filter(u => u.role === role),
  getUserById: (id: string) => get().users.find(u => u.id === id),
}));
