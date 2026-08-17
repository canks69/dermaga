import { useEffect, useState } from 'react';
import { Download, Play, PlugZap } from 'lucide-react';
import { Button } from '../components/Button';
import { CommandProgress, useCommandProgress } from '../components/CommandProgress';
import { Checkbox } from '../components/form';
import { api } from '../services/api';
import { useToastStore } from '../store/toastStore';
import type { ToolchainStatus } from '../types';

/**
 * Takes over the whole page when the container services are down. Every other
 * screen would be empty or broken without them, so the only thing offered is
 * the way out.
 */
export function ServicesOffline({
  cliMissing,
  onStarted,
}: {
  cliMissing: boolean;
  onStarted: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [installKernel, setInstallKernel] = useState(false);
  const [toolchain, setToolchain] = useState<ToolchainStatus | null>(null);
  const install = useCommandProgress('toolchain.install');
  const pushToast = useToastStore((s) => s.push);

  // Only asked for when the CLI is missing, since that is the only case where
  // the answer changes what this screen offers.
  useEffect(() => {
    if (!cliMissing) return;

    void api
      .getToolchain()
      .then(setToolchain)
      .catch(() => {
        // Leave the manual instructions as the fallback.
      });
  }, [cliMissing]);

  const start = async () => {
    setStarting(true);
    try {
      await api.startSystem(installKernel);
      pushToast('Container services started');
      onStarted();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not start the services', 'error');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600/10">
        <PlugZap size={20} className="text-brand-600 dark:text-brand-400" aria-hidden />
      </div>

      <div className="max-w-sm">
        <h1 className="text-base font-semibold">
          {cliMissing ? 'Apple Container CLI not found' : 'Container services are not running'}
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-400">
          {cliMissing ? (
            toolchain?.brewAvailable ? (
              <>
                Dermaga drives the <code className="font-mono">container</code> command. It can be
                installed with Homebrew
                {toolchain.latestVersion ? ` (${toolchain.latestVersion})` : ''} right here.
              </>
            ) : (
              <>
                Dermaga drives the <code className="font-mono">container</code> command. Install it
                with <code className="font-mono">brew install container</code>, or from
                Apple&rsquo;s container releases, then reopen Dermaga.
              </>
            )
          ) : (
            <>
              Nothing can run until the background services are up. Starting them is the same as{' '}
              <code className="font-mono">container system start</code>.
            </>
          )}
        </p>
      </div>

      {cliMissing && toolchain?.brewAvailable && (
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="primary"
            icon={Download}
            busy={install.state === 'running'}
            busyLabel="Installing…"
            onClick={() =>
              void install.run((failed) => {
                if (!failed) {
                  pushToast('Apple Container CLI installed');
                  onStarted();
                }
              })
            }
          >
            Install with Homebrew
          </Button>

          <CommandProgress {...install} />
        </div>
      )}

      {!cliMissing && (
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="primary"
            icon={Play}
            busy={starting}
            busyLabel="Starting…"
            onClick={() => void start()}
          >
            Start services
          </Button>

          <Checkbox
            checked={installKernel}
            onChange={setInstallKernel}
            label="Install the default kernel if it is missing"
          />
        </div>
      )}
    </div>
  );
}
