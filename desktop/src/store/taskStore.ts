import { create } from 'zustand';

export type TaskKind = 'image' | 'machine' | 'container';
export type TaskStatus = 'running' | 'failed';

export interface Task {
  id: string;
  kind: TaskKind;
  /** What is being created or pulled, shown as the row's name. */
  label: string;
  /** The CLI's current step, e.g. "Fetching image". */
  step: string;
  current?: number;
  total?: number;
  /** Full output, kept for the details dialog when something fails. */
  lines: string[];
  status: TaskStatus;
  error?: string;
}

interface TaskState {
  tasks: Task[];
  start: (task: Pick<Task, 'id' | 'kind' | 'label'> & { step?: string }) => void;
  append: (id: string, line: string) => void;
  fail: (id: string, error: string) => void;
  finish: (id: string) => void;
  dismiss: (id: string) => void;
}

// `[2/6] Unpacking image [4s]` -- the shape every streaming CLI command uses.
const STEP = /^\[(\d+)\/(\d+)\]\s*(.*?)\s*(?:\[\d+m?s\])?$/;

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],

  start: ({ id, kind, label, step = 'Starting…' }) =>
    set((state) => ({
      tasks: [
        ...state.tasks.filter((t) => t.id !== id),
        { id, kind, label, step, lines: [], status: 'running' },
      ],
    })),

  append: (id, line) =>
    set((state) => ({
      tasks: state.tasks.map((task) => {
        if (task.id !== id) return task;

        const lines = [...task.lines, line].slice(-500);
        const match = STEP.exec(line.trim());

        if (!match) {
          // Not a step line; keep it as the status only if nothing better.
          return { ...task, lines, step: line.trim() || task.step };
        }

        return {
          ...task,
          lines,
          current: Number(match[1]),
          total: Number(match[2]),
          step: match[3] || task.step,
        };
      }),
    })),

  fail: (id, error) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, status: 'failed', error } : task
      ),
    })),

  // Success needs no trace: the resource itself appears in the list.
  finish: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
  dismiss: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
}));
