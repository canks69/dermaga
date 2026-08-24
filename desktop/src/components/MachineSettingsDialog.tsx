import { useState } from 'react';
import { api } from '../services/api';
import { useToastStore } from '../store/toastStore';
import type { Machine } from '../types';
import { Button } from './Button';
import { Field, Modal } from './form';
import { useValidation } from '../hooks/useValidation';
import { count, machineMinimumMiB, size as sizeOf } from '../utils/validate';

const HOME_MOUNTS = ['rw', 'ro', 'none'];

/** Edits the values `container machine set` accepts; they apply on restart. */
export function MachineSettingsDialog({
  machine,
  onClose,
}: {
  machine: Machine;
  onClose: () => void;
}) {
  const [cpus, setCpus] = useState(machine.cpus);
  const [memory, setMemory] = useState(machine.memoryAllocation);
  const [homeMount, setHomeMount] = useState(machine.homeMount ?? 'rw');
  const [saving, setSaving] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  const settings = useValidation({
    cpus: count(String(cpus), 'CPUs'),
    memory: sizeOf(memory, 'Memory', machineMinimumMiB),
  });

  const submit = async () => {
    setSaving(true);
    try {
      await api.configureMachine(machine.id, {
        cpus: Number(cpus) || undefined,
        memory: memory.trim() || undefined,
        homeMount,
      });
      pushToast(`Saved — restart ${machine.id} to apply`);
      onClose();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not save the settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Configure ${machine.id}`}
      subtitle="New values take effect the next time the machine starts."
      onClose={onClose}
      onSubmit={() => settings.attempt(() => void submit())}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost" disabled={saving}>
            Cancel
          </button>
          <Button
            variant="primary"
            busy={saving}
            busyLabel="Saving…"
            disabled={!settings.valid}
            onClick={() => void submit()}
          >
            Save
          </Button>
        </>
      }
    >
      <Field label="CPUs" {...settings.field('cpus')}>
        <input
          type="number"
          min={1}
          max={64}
          value={cpus}
          onChange={(e) => setCpus(Number(e.target.value))}
          className="input"
        />
      </Field>

      <Field label="Memory" hint="At least 1G, for example 4G." {...settings.field('memory')}>
        <input value={memory} onChange={(e) => setMemory(e.target.value)} className="input" />
      </Field>

      <Field label="Home mount">
        <select
          value={homeMount}
          onChange={(e) => setHomeMount(e.target.value)}
          className="input appearance-none"
        >
          {HOME_MOUNTS.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}
