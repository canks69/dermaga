import { create } from 'zustand';
import type { Container, Image, Machine, Network, Volume } from '../types';

interface ResourceState {
  containers: Container[];
  machines: Machine[];
  images: Image[];
  volumes: Volume[];
  networks: Network[];
  /** False only until the first snapshot lands. */
  hasLoaded: boolean;
  error: string | null;
  setContainers: (containers: Container[]) => void;
  setMachines: (machines: Machine[]) => void;
  setImages: (images: Image[]) => void;
  setVolumes: (volumes: Volume[]) => void;
  setNetworks: (networks: Network[]) => void;
  setError: (error: string | null) => void;
}

export const useResourceStore = create<ResourceState>((set) => ({
  containers: [],
  machines: [],
  images: [],
  volumes: [],
  networks: [],
  hasLoaded: false,
  error: null,
  setContainers: (containers) => set({ containers, hasLoaded: true }),
  setMachines: (machines) => set({ machines }),
  setImages: (images) => set({ images }),
  setVolumes: (volumes) => set({ volumes }),
  setNetworks: (networks) => set({ networks }),
  setError: (error) => set({ error }),
}));
