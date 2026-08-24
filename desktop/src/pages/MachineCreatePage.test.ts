import { describe, expect, it } from 'vitest';
import { asked } from './MachineCreatePage';
import type { MachineSpec } from '../types';

const machine = (over: Partial<MachineSpec> = {}): MachineSpec => ({
  name: 'dev',
  image: 'alpine:3.22',
  cpus: 2,
  memory: '2G',
  homeMount: 'rw',
  setDefault: false,
  noBoot: false,
  virtualization: false,
  ...over,
});

/**
 * The question the Create button asks.
 *
 * A machine is a download, an unpack and a boot, so this is the last cheap
 * moment to notice that a gibibyte was meant to be four — or that the box
 * saying "create without booting" is still ticked from last time.
 */
describe('the question the machine form asks', () => {
  it('names the machine and what it will run on', () => {
    const question = asked(machine());

    expect(question.title).toBe('Create dev?');
    expect(question.confirmLabel).toBe('Create');
    expect(question.body).toBe('alpine:3.22 boots with 2 CPUs and 2 GB.');
  });

  it('names the image when the machine has no name of its own', () => {
    const question = asked(machine({ name: undefined }));

    expect(question.title).toBe('Create a machine from alpine:3.22?');
    expect(question.body).toContain('The CLI will name it after the image');
  });

  it('does not promise a boot that was switched off', () => {
    const question = asked(machine({ noBoot: true }));

    expect(question.body).toContain('alpine:3.22 is created with 2 CPUs and 2 GB.');
    expect(question.body).not.toContain('boots');
    expect(question.body).toContain('It is not started');
  });

  it('says only the home mount that is not the ordinary one', () => {
    expect(asked(machine()).body).not.toContain('home directory');
    expect(asked(machine({ homeMount: 'ro' })).body).toContain('read-only');
    expect(asked(machine({ homeMount: 'none' })).body).toContain('is not mounted');
  });

  it('says the two switches that change what the machine is', () => {
    const question = asked(machine({ setDefault: true, virtualization: true }));

    expect(question.body).toContain('It becomes the default machine.');
    expect(question.body).toContain('Nested virtualization is on');
  });

  it('does not invent limits that were left unset', () => {
    const question = asked(machine({ cpus: undefined, memory: undefined }));

    expect(question.body).toContain("boots on the CLI's own defaults");
    expect(question.body).not.toContain('CPU');
  });
});
