import { create } from 'zustand';
import type { ContainerTab, MachineTab, Route } from '../types';

interface UIState {
  route: Route;
  searchQuery: string;
  navigate: (route: Route) => void;
  openContainer: (id: string, tab?: ContainerTab) => void;
  openMachine: (id: string, tab?: MachineTab) => void;
  openImage: (reference: string) => void;
  /** Switches tabs within the current detail route; ignored elsewhere. */
  setTab: (tab: string) => void;
  back: () => void;
  setSearchQuery: (query: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  route: { name: 'containers' },
  searchQuery: '',
  navigate: (route) => set({ route }),
  openContainer: (id, tab = 'overview') => set({ route: { name: 'container', id, tab } }),
  openMachine: (id, tab = 'overview') => set({ route: { name: 'machine', id, tab } }),
  openImage: (reference) => set({ route: { name: 'image', reference } }),
  setTab: (tab) =>
    set((state) => {
      if (state.route.name === 'container') {
        return { route: { ...state.route, tab: tab as ContainerTab } };
      }
      if (state.route.name === 'machine') {
        return { route: { ...state.route, tab: tab as MachineTab } };
      }
      return state;
    }),
  back: () =>
    set((state) => {
      if (state.route.name === 'container') return { route: { name: 'containers' } };
      if (state.route.name === 'machine') return { route: { name: 'machines' } };
      if (state.route.name === 'image') return { route: { name: 'images' } };
      return state;
    }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
