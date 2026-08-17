import { useCallback, useEffect, useState } from 'react';
import { updates, type UpdateCheck } from '../services/ipc';

type Stage = 'idle' | 'available' | 'downloading' | 'opening' | 'failed';

/**
 * Checks GitHub once on launch, and runs the update when asked: download the
 * DMG, open it, and close Dermaga so the user can drop the new build in.
 *
 * Deliberately not silent-and-automatic. Ad-hoc signed builds cannot be swapped
 * underneath a running app, so the honest flow is to hand over the installer.
 */
export function useUpdate() {
  const [found, setFound] = useState<UpdateCheck | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // A failed check is not worth reporting: the app works either way, and the
    // usual cause is simply being offline.
    void updates
      .check()
      .then((result) => {
        if (cancelled || !result.available) return;
        setFound(result);
        setStage('available');
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return updates.onProgress(({ received, total }) => {
      setPercent(total > 0 ? Math.round((received / total) * 100) : 0);
    });
  }, []);

  const run = useCallback(async () => {
    if (!found?.assetUrl || !found.version) return;

    setStage('downloading');
    setPercent(0);
    setError(null);

    try {
      const file = await updates.download(found.assetUrl, found.version);
      setStage('opening');
      await updates.install(file);
    } catch (err) {
      setStage('failed');
      setError(err instanceof Error ? err.message : 'The update could not be downloaded');
    }
  }, [found]);

  return { update: found, stage, percent, error, run };
}
