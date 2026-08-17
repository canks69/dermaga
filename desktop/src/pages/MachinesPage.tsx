import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CreateMachineDialog } from '../components/MachineForm';
import { TaskRows } from '../components/TaskRows';
import { Badge, DataTable, Muted, NameCell, type Column } from '../components/DataTable';
import { StatusDot } from '../components/StatusBadge';
import { useResourceStore } from '../store/resourceStore';
import { PageHeader } from '../components/PageHeader';
import { useUIStore } from '../store/uiStore';
import { formatBytes, formatDuration, formatMemory } from '../utils/format';

const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: 'minmax(140px,1.2fr)' },
  { key: 'state', label: 'State', width: '96px' },
  { key: 'ip', label: 'IP address', width: '136px' },
  { key: 'cpus', label: 'CPUs', width: '72px', align: 'right' },
  { key: 'memory', label: 'Memory', width: '96px', align: 'right' },
  { key: 'disk', label: 'Disk', width: '88px', align: 'right' },
  { key: 'up', label: 'Up', width: '72px', align: 'right' },
];

export function MachinesPage({ runtimeMissing }: { runtimeMissing: boolean }) {
  const machines = useResourceStore((s) => s.machines);
  const hasLoaded = useResourceStore((s) => s.hasLoaded);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const openMachine = useUIStore((s) => s.openMachine);
  const [creating, setCreating] = useState(false);

  const needle = searchQuery.trim().toLowerCase();
  const visible = machines.filter(
    (machine) => !needle || machine.id.toLowerCase().includes(needle)
  );

  const emptyMessage = !hasLoaded
    ? 'Connecting to the Dermaga server…'
    : runtimeMissing
      ? 'The Apple Container CLI was not found on this Mac.'
      : machines.length === 0
        ? 'No container machines yet. Use “New machine” to create one.'
        : 'No machines match your search.';

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <PageHeader
        title="Machines"
        subtitle="The Linux VMs your containers run inside"
        search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search machines…' }}
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={13} aria-hidden />
            New machine
          </button>
        }
      />

      <TaskRows kind="machine" />

      <DataTable
        columns={COLUMNS}
        rows={visible}
        rowKey={(machine) => machine.id}
        onOpen={(machine) => openMachine(machine.id)}
        empty={emptyMessage}
        cells={(machine) => [
          <NameCell key="name">
            <StatusDot status={machine.status} />
            <span className="truncate text-sm font-semibold">{machine.id}</span>
            {machine.default && <Badge tone="brand">default</Badge>}
          </NameCell>,
          <Muted key="state">{machine.status}</Muted>,
          <Muted key="ip" mono>
            {machine.ipAddress || '—'}
          </Muted>,
          <Muted key="cpus">{machine.cpus}</Muted>,
          <Muted key="memory">{formatMemory(machine.memoryAllocation)}</Muted>,
          <Muted key="disk">{formatBytes(machine.diskSizeBytes)}</Muted>,
          <Muted key="up">
            {machine.status === 'running' ? formatDuration(machine.startedAt) : '—'}
          </Muted>,
        ]}
      />

      {creating && <CreateMachineDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
