import { useEffect, useState } from 'react';
import { invoke, onNotify } from '../services/ipc';
import { useResourceStore } from '../store/resourceStore';
import type { Container, Image, Machine, Network, Volume } from '../types';

export type ConnectionState = 'connecting' | 'live' | 'disconnected';

interface Snapshot {
  containers: Container[];
  machines: Machine[];
  images: Image[];
  volumes: Volume[];
  networks: Network[];
}

/**
 * Subscribes to the agent's snapshots. It pushes a new one whenever anything
 * changes -- including immediately after an action taken here -- so nothing in
 * the UI polls or refreshes on a timer.
 */
export function useEventStream() {
  const setContainers = useResourceStore((s) => s.setContainers);
  const setMachines = useResourceStore((s) => s.setMachines);
  const setImages = useResourceStore((s) => s.setImages);
  const setVolumes = useResourceStore((s) => s.setVolumes);
  const setNetworks = useResourceStore((s) => s.setNetworks);
  const setError = useResourceStore((s) => s.setError);
  const [connection, setConnection] = useState<ConnectionState>('connecting');

  useEffect(() => {
    const unsubscribe = onNotify((message) => {
      if (message.method !== 'events.snapshot') return;

      const snapshot = message.params as Snapshot;
      setContainers(snapshot.containers ?? []);
      setMachines(snapshot.machines ?? []);
      setImages(snapshot.images ?? []);
      setVolumes(snapshot.volumes ?? []);
      setNetworks(snapshot.networks ?? []);
      setConnection('live');
      setError(null);
    });

    void invoke('events.subscribe')
      .then(() => setConnection((prev) => (prev === 'connecting' ? 'connecting' : prev)))
      .catch((err: unknown) => {
        setConnection('disconnected');
        setError(err instanceof Error ? err.message : 'Could not reach the Dermaga agent');
      });

    return unsubscribe;
  }, [setContainers, setMachines, setImages, setVolumes, setNetworks, setError]);

  return connection;
}
