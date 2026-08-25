import { useState } from 'react';
import { Checkbox, Field, Fieldset, FormPage } from '../components/form';
import { Autocomplete } from '../components/Autocomplete';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useResourceStore } from '../store/resourceStore';
import { askBeforeLeaving, useUIStore } from '../store/uiStore';
import { runTask } from '../services/tasks';
import { useValidation } from '../hooks/useValidation';
import {
  containerName,
  count,
  imageReference,
  machineMinimumMiB,
  required,
  size as sizeOf,
} from '../utils/validate';
import { formatBytes, formatMemory } from '../utils/format';
import type { MachineSpec } from '../types';

const HOME_MOUNTS = ['rw', 'ro', 'none'];

/**
 * A new Linux VM for containers to run in.
 *
 * A page rather than a dialog, like everything else here that ends in minutes
 * of work: creating one pulls an image and boots a virtual machine, and what
 * it prints while it does is the point -- so pressing the button lands on that
 * output rather than putting a bar in the corner and a list back in front of
 * you.
 */
export function MachineCreatePage() {
  const back = useUIStore((s) => s.back);
  const openTask = useUIStore((s) => s.openTask);
  const images = useResourceStore((s) => s.images);

  const [name, setName] = useState('');
  // Alpine boots in seconds and is a fraction of the download; it is also what
  // the CLI's own help suggests.
  const [image, setImage] = useState('alpine:3.22');
  const [cpus, setCpus] = useState(2);
  const [memory, setMemory] = useState('2G');
  const [homeMount, setHomeMount] = useState('rw');
  const [setDefault, setSetDefault] = useState(false);
  const [noBoot, setNoBoot] = useState(false);
  const [virtualization, setVirtualization] = useState(false);

  // What the Create button has been pressed on, held while the question about
  // it is up: what the dialog describes and what is made are then the same
  // machine, whatever the fields do underneath.
  const [confirming, setConfirming] = useState<MachineSpec | null>(null);

  const form = useValidation({
    image: required(image, 'An image') ?? imageReference(image),
    name: containerName(name),
    cpus: count(String(cpus), 'CPUs'),
    // A machine is a virtual machine, and the runtime will not boot one in
    // less than a gibibyte. It says so only after fetching and unpacking the
    // image -- the better part of a minute spent to be told a number was too
    // small, and then the dialog is gone and the number with it.
    memory: sizeOf(memory, 'Memory', machineMinimumMiB),
  });

  const buildSpec = (): MachineSpec => ({
    name: name.trim() || undefined,
    image: image.trim(),
    cpus,
    memory: memory.trim() || undefined,
    homeMount,
    setDefault,
    noBoot,
    virtualization,
  });

  /**
   * Ask first.
   *
   * A machine is a download, an unpack and a boot -- a minute of somebody's
   * time before anything can say whether the numbers were right. This is the
   * last place to read them back as a sentence rather than as eight controls,
   * which is where a gibibyte that was meant to be four is actually noticed.
   */
  const ask = () => setConfirming(buildSpec());

  const create = (spec: MachineSpec) => {
    const label = spec.name ?? spec.image;
    const id = `machine:${label}`;

    void runTask({ id, kind: 'machine', label, method: 'machines.create', params: spec });

    // Started, so there is nothing in this form left to lose -- and the page
    // it is about to be replaced by must not be asked about.
    askBeforeLeaving(null);

    // Onto what it is printing. A machine is an image pulled, unpacked and
    // booted -- the better part of a minute the first time -- and the task
    // strip carries it either way, so leaving that page costs nothing.
    openTask(id);
  };

  return (
    <FormPage
      backTo="Machines"
      title="New machine"
      subtitle="Creates a Linux VM for containers to run in. Progress appears in the title bar."
      onClose={back}
      onSubmit={() => form.attempt(ask)}
      footer={
        <>
          <button onClick={back} className="btn-ghost">
            Cancel
          </button>
          <button onClick={() => form.attempt(ask)} className="btn-primary" disabled={!form.valid}>
            Create
          </button>
        </>
      }
    >
      {/* What the machine is, and what it may spend. */}
      <Fieldset legend="Machine" columns={2}>
        <Field
          label="Image"
          hint="For example alpine:3.22 or ubuntu:26.04."
          {...form.field('image')}
        >
          <Autocomplete
            value={image}
            onChange={setImage}
            options={images.map((img) => ({
              value: img.reference,
              hint: formatBytes(img.sizeInBytes),
            }))}
            autoFocus
            mono
          />
        </Field>

        <Field
          label="Name"
          hint="Left blank, the CLI names it after the image."
          {...form.field('name')}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="dev"
            className="input"
          />
        </Field>

        <Field label="CPUs" {...form.field('cpus')}>
          <input
            type="number"
            min={1}
            max={64}
            value={cpus}
            onChange={(e) => setCpus(Number(e.target.value))}
            className="input"
          />
        </Field>

        <Field
          label="Memory"
          hint="At least 1G. Defaults to half the host's memory."
          {...form.field('memory')}
        >
          <input
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
            placeholder="2G"
            className="input"
          />
        </Field>

        <Field label="Home mount" hint="How your macOS home directory is exposed inside the VM.">
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
      </Fieldset>

      {/* The three switches, in a group of their own rather than stacked in
          the last cell of the field grid -- three decisions with no heading,
          taking their alignment from whichever field happened to sit above. */}
      <Fieldset legend="Behaviour" columns={2}>
        <Checkbox checked={setDefault} onChange={setSetDefault} label="Make it the default" />
        <Checkbox checked={noBoot} onChange={setNoBoot} label="Create without booting" />
        <Checkbox
          checked={virtualization}
          onChange={setVirtualization}
          label="Nested virtualization (M3+)"
        />
      </Fieldset>

      {confirming && (
        <ConfirmDialog
          {...asked(confirming)}
          onConfirm={() => {
            const spec = confirming;
            setConfirming(null);
            create(spec);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </FormPage>
  );
}

/**
 * The question the Create button asks.
 *
 * Only what was set. Everything left at its default is left out -- a paragraph
 * that lists eight defaults is a paragraph nobody finishes, and the thing
 * being looked for is hiding in it.
 */
export function asked(spec: MachineSpec): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  const limits = [
    spec.cpus ? `${spec.cpus} CPU${spec.cpus === 1 ? '' : 's'}` : null,
    spec.memory ? formatMemory(spec.memory) : null,
  ].filter(Boolean);

  const sentences = [
    // "boots with" and "is created with" are not the same promise, and the
    // checkbox that decides which is three rows further down the form.
    limits.length > 0
      ? `${spec.image} ${spec.noBoot ? 'is created with' : 'boots with'} ${limits.join(' and ')}.`
      : `${spec.image} ${spec.noBoot ? 'is created' : 'boots'} on the CLI's own defaults.`,
  ];

  if (!spec.name) sentences.push('The CLI will name it after the image, since none was set.');
  if (spec.noBoot) sentences.push('It is not started, so nothing runs in it until you start it.');
  if (spec.setDefault) sentences.push('It becomes the default machine.');

  if (spec.homeMount === 'ro') {
    sentences.push('Your home directory is mounted inside it, read-only.');
  }
  if (spec.homeMount === 'none') sentences.push('Your home directory is not mounted inside it.');

  if (spec.virtualization)
    sentences.push('Nested virtualization is on, which needs an M3 or later.');

  return {
    title: spec.name ? `Create ${spec.name}?` : `Create a machine from ${spec.image}?`,
    body: sentences.join(' '),
    confirmLabel: 'Create',
  };
}
