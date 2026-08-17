import { useCallback, useEffect, useState } from 'react';
import { ArrowUpCircle, HardDrive, Play, Square, Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { CommandProgress, useCommandProgress } from '../components/CommandProgress';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LogPane } from '../components/LogPane';
import { Row, Section } from '../components/DetailRow';
import { StatusBadge } from '../components/StatusBadge';
import { DetailGrid, DetailLayout, DetailPane } from '../components/DetailLayout';
import type { TabDefinition } from '../components/Tabs';
import { Checkbox } from '../components/form';
import { api } from '../services/api';
import { useToastStore } from '../store/toastStore';
import type { DiskUsage, SystemStatus, ToolchainStatus, UsageEntry } from '../types';
import { formatMemory } from '../utils/format';
import { Info, ScrollText } from 'lucide-react';

const TABS: TabDefinition[] = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'logs', label: 'Service logs', icon: ScrollText },
];

function bytesToLabel(bytes: number): string {
  return formatMemory(`${Math.round(bytes / (1024 * 1024))}m`);
}

export function SystemPage({
  status,
  onRefresh,
}: {
  status: SystemStatus | null;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState('overview');
  const [usage, setUsage] = useState<DiskUsage | null>(null);
  const [toolchain, setToolchain] = useState<ToolchainStatus | null>(null);
  const update = useCommandProgress('toolchain.update');
  const [pending, setPending] = useState<'start' | 'stop' | 'prune' | null>(null);
  const [installKernel, setInstallKernel] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [confirmingPrune, setConfirmingPrune] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  const running = status?.running ?? false;

  const loadUsage = useCallback(async () => {
    try {
      setUsage((await api.getDiskUsage()) ?? null);
    } catch {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    // Disk usage is only readable while the services run, so it is fetched
    // when that becomes true rather than on every render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (running) void loadUsage();
  }, [running, loadUsage]);

  const loadToolchain = useCallback(async () => {
    try {
      setToolchain(await api.getToolchain());
    } catch {
      setToolchain(null);
    }
  }, []);

  useEffect(() => {
    // Checking for a newer CLI asks Homebrew what it already knows, so it is
    // cheap enough to do whenever this page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadToolchain();
  }, [loadToolchain]);

  const run = async (
    action: 'start' | 'stop' | 'prune',
    work: () => Promise<string | void>,
    message: string
  ) => {
    setPending(action);
    try {
      // Some actions know better than the caller what happened -- a prune can
      // free nothing at all, and saying "reclaimed" then is just wrong.
      const outcome = await work();
      pushToast(outcome || message);
      onRefresh();
      if (action !== 'stop') void loadUsage();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : `Could not ${action}`, 'error');
    } finally {
      setPending(null);
    }
  };

  const reclaimable =
    (usage?.containers.reclaimable ?? 0) +
    (usage?.images.reclaimable ?? 0) +
    (usage?.volumes.reclaimable ?? 0);

  return (
    <DetailLayout
      title="System"
      badges={<StatusBadge status={running ? 'running' : 'stopped'} />}
      subtitle={
        <>
          The launchd services behind the <code className="font-mono">container</code> CLI
        </>
      }
      tabs={TABS}
      activeTab={tab}
      onSelectTab={setTab}
      actions={
        <>
          {!running && (
            <Checkbox
              checked={installKernel}
              onChange={setInstallKernel}
              label="Install default kernel if missing"
            />
          )}
          {running ? (
            <Button
              variant="secondary"
              icon={Square}
              busy={pending === 'stop'}
              busyLabel="Stopping…"
              disabled={pending !== null}
              onClick={() => setConfirmingStop(true)}
            >
              Stop services
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={Play}
              busy={pending === 'start'}
              busyLabel="Starting…"
              disabled={pending !== null}
              onClick={() =>
                void run(
                  'start',
                  () => api.startSystem(installKernel),
                  'Container services started'
                )
              }
            >
              Start services
            </Button>
          )}
        </>
      }
    >
      {tab === 'overview' && (
        <DetailGrid>
          <Section title="Services">
            <Row label="State" value={status?.status ?? 'unknown'} />
            <Row label="API server" value={status?.apiServerVersion} />
            <Row label="Build" value={status?.apiServerBuild} />
          </Section>

          <Section title="Apple Container CLI">
            <Row label="Version" value={toolchain?.version ?? status?.cliVersion} />
            <Row
              label="Installed with"
              value={toolchain?.managedBy === 'homebrew' ? 'Homebrew' : 'manually'}
            />

            {toolchain?.updateAvailable ? (
              <div className="flex flex-col items-start gap-2 pt-1">
                <p className="text-tiny text-ink-600 dark:text-ink-400">
                  Version {toolchain.latestVersion} is available.
                </p>
                <Button
                  icon={ArrowUpCircle}
                  busy={update.state === 'running'}
                  busyLabel="Updating…"
                  onClick={() =>
                    void update.run((failed) => {
                      if (failed) return;
                      pushToast(`Updated to ${toolchain.latestVersion}`);
                      void loadToolchain();
                      onRefresh();
                    })
                  }
                >
                  Update to {toolchain.latestVersion}
                </Button>
                <CommandProgress {...update} />
              </div>
            ) : (
              <p className="pt-1 text-tiny text-ink-600 dark:text-ink-400">
                {toolchain?.checkError
                  ? 'Could not check for updates.'
                  : toolchain?.managedBy === 'homebrew'
                    ? 'Up to date.'
                    : 'Updates are managed outside Dermaga.'}
              </p>
            )}
          </Section>

          <Section title="Paths">
            <Row label="App root" value={status?.appRoot} mono copyable />
            <Row label="Install root" value={status?.installRoot} mono copyable />
            <Row label="Log root" value={status?.logRoot || 'macOS log facility'} mono />
          </Section>

          <Section
            title="Disk usage"
            span
            action={
              running && reclaimable > 0 ? (
                <Button
                  icon={Trash2}
                  busy={pending === 'prune'}
                  busyLabel="Reclaiming…"
                  disabled={pending !== null}
                  onClick={() => setConfirmingPrune(true)}
                >
                  Reclaim {bytesToLabel(reclaimable)}
                </Button>
              ) : null
            }
          >
            {!running ? (
              <p className="text-xs text-ink-600 dark:text-ink-400">
                Start the services to read disk usage.
              </p>
            ) : usage ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UsageCard label="Containers" entry={usage.containers} />
                <UsageCard label="Images" entry={usage.images} />
                <UsageCard label="Volumes" entry={usage.volumes} />
              </div>
            ) : (
              <p className="text-xs text-ink-600 dark:text-ink-400">Disk usage unavailable.</p>
            )}
          </Section>
        </DetailGrid>
      )}

      {tab === 'logs' && (
        <DetailPane>
          <LogPane method="system.logs" params={{ last: '30m' }} />
        </DetailPane>
      )}

      {confirmingPrune && (
        <ConfirmDialog
          title={`Reclaim ${bytesToLabel(reclaimable)}?`}
          body="Every image no container is using is deleted, along with stopped containers and unused volumes and networks. Images have to be pulled again to use them."
          confirmLabel="Reclaim"
          onConfirm={() => {
            setConfirmingPrune(false);
            void run(
              'prune',
              async () => {
                const { freedBytes } = await api.pruneSystem();
                return freedBytes > 0
                  ? `Reclaimed ${bytesToLabel(freedBytes)}`
                  : 'Nothing to reclaim — everything on disk is still in use';
              },
              'Reclaimed unused resources'
            );
          }}
          onCancel={() => setConfirmingPrune(false)}
        />
      )}

      {confirmingStop && (
        <ConfirmDialog
          title="Stop container services?"
          body="Every running container stops with them, and Dermaga cannot manage anything until the services are started again."
          confirmLabel="Stop services"
          onConfirm={() => {
            setConfirmingStop(false);
            void run('stop', () => api.stopSystem(), 'Container services stopped');
          }}
          onCancel={() => setConfirmingStop(false)}
        />
      )}
    </DetailLayout>
  );
}

function UsageCard({ label, entry }: { label: string; entry: UsageEntry }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="label-caps flex items-center gap-1.5">
        <HardDrive size={12} aria-hidden />
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold">{bytesToLabel(entry.sizeInBytes)}</p>
      <p className="text-tiny text-ink-600 dark:text-ink-400">
        {entry.active} of {entry.total} in use
        {entry.reclaimable > 0 && ` · ${bytesToLabel(entry.reclaimable)} reclaimable`}
      </p>
    </div>
  );
}
