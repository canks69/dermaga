import { useEffect, useState, type ReactNode } from 'react';
import { FolderCog, Monitor, Moon, Radio, Server, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ConnectionState } from '../hooks/useEventStream';
import { useSettingsStore, type Theme } from '../store/settingsStore';
import type { SystemStatus } from '../types';
import { api } from '../services/api';
import { Row } from './DetailRow';
import { SegmentedControl, type Segment } from './SegmentedControl';

const THEMES: Segment<Theme>[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: 'connecting',
  live: 'live — updates are pushed',
  disconnected: 'disconnected',
};

interface SettingsPanelProps {
  system: SystemStatus | null;
  connection: ConnectionState;
}

export function SettingsPanel({ system, connection }: SettingsPanelProps) {
  const settings = useSettingsStore();
  const [configPath, setConfigPath] = useState('~/.dermaga/config.json');

  // The server reports where it actually wrote the file.
  useEffect(() => {
    void api
      .getSettings()
      .then(({ path }) => path && setConfigPath(path))
      .catch(() => {
        // Keep the documented default if the agent cannot be reached.
      });
  }, []);

  return (
    <div className="-mr-5 min-h-0 flex-1 overflow-y-auto pr-5">
      {/* Centred and column-limited: a wide window should not leave the
          settings pinned to the left edge with an ocean of empty space. */}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-tiny text-ink-600 dark:text-ink-400">
            Stored locally on this Mac and applied immediately.
          </p>
        </header>

        <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
          <Card title="Appearance" hint="System follows the macOS light/dark setting.">
            <SegmentedControl
              ariaLabel="Theme"
              segments={THEMES}
              value={settings.theme}
              onChange={settings.setTheme}
            />
          </Card>

          <Card title="Logs" hint="Lines of history requested when a stream opens.">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="number"
                min={10}
                max={2000}
                step={10}
                value={settings.logTail}
                onChange={(e) => settings.setLogTail(Math.max(10, Number(e.target.value) || 10))}
                className="input w-28"
              />
              <span className="text-xs text-ink-600 dark:text-ink-400">lines</span>
            </label>
          </Card>

          <Card title="Behaviour">
            <Toggle
              checked={settings.showStopped}
              onChange={settings.setShowStopped}
              label="Show stopped containers in the list"
            />
            <Toggle
              checked={settings.confirmDestructive}
              onChange={settings.setConfirmDestructive}
              label="Ask before removing a container"
            />
          </Card>

          <Card
            title="Connection"
            icon={Radio}
            hint="The renderer talks to a local agent over IPC; there is no network involved."
          >
            <Row label="Transport" value="JSON-RPC over stdio" />
            <Row label="Updates" value={CONNECTION_LABEL[connection]} />
          </Card>

          <Card title="Runtime" icon={Server}>
            <Row label="Apple Container CLI" value={system?.cliVersion} />
            <Row label="API server" value={system?.apiServerVersion} />
          </Card>

          <Card
            title="Storage"
            icon={FolderCog}
            hint="Preferences are a plain JSON file you can edit or version-control."
          >
            <Row label="Config file" value={configPath} mono copyable />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Unboxed group, matching the detail pages: a ruled heading and its content. */
function Card({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 border-b border-ink-200 pb-1 dark:border-ink-700">
        {Icon && <Icon size={12} className="text-brand-600" aria-hidden />}
        <h2 className="label-caps">{title}</h2>
      </div>
      {hint && <p className="-mt-1 text-tiny text-ink-600 dark:text-ink-400">{hint}</p>}
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand-600"
      />
      {label}
    </label>
  );
}
