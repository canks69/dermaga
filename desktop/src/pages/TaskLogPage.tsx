import { useEffect, useRef } from 'react';
import { Ban, Loader2, X } from 'lucide-react';
import { AnsiLine } from '../components/AnsiLine';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { cancelTask, dismissTask } from '../services/tasks';
import { useTaskStore, type Task } from '../store/taskStore';
import { useUIStore } from '../store/uiStore';
import type { Route } from '../types';

/**
 * What a command is printing, while it prints it.
 *
 * A build is minutes of somebody else's output, and until now it was read
 * through a dialog the height of half the window, opened from the title bar
 * after the fact. That is the wrong shape for the one thing anybody does with
 * a build log: scroll it, looking for the line that went wrong. So it is a
 * page -- the whole window's height, the tail following itself while the run
 * is live, and a way back to whatever you were doing when you started it.
 *
 * It holds nothing of its own. The lines are the task store's, which is filled
 * by the stream and outlives this page: leaving does not stop the run, and
 * coming back shows everything printed in the meantime.
 */
export function TaskLogPage({ route }: { route: Extract<Route, { name: 'task' }> }) {
  const back = useUIStore((s) => s.back);
  // Either name. `openTaskLog` translates the agent's name into the window's
  // own, but only if the task list has been filled by then -- and on a launch
  // from a notification the two arrive in no particular order, so the route can
  // hold `build-7` rather than the id everything here is filed under. Matching
  // one of them meant a page reading "nothing is running under that name" about
  // a task sitting in the strip behind it.
  const task = useTaskStore((s) =>
    s.tasks.find((entry) => entry.id === route.id || entry.streamId === route.id)
  );

  const body = useRef<HTMLDivElement>(null);
  // Whether the view is following the end of the output. It stops following
  // the moment somebody scrolls up -- a log that yanks itself back to the
  // bottom while you are reading the middle of it is a log you cannot read --
  // and starts again when they return to the bottom.
  const following = useRef(true);

  const lines = task?.lines.length ?? 0;

  useEffect(() => {
    if (!following.current) return;

    const pane = body.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [lines]);

  const onScroll = () => {
    const pane = body.current;
    if (!pane) return;

    // A few pixels of slack: the tail is never exactly at the bottom while
    // lines are still arriving.
    following.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
  };

  const running = task?.status === 'running';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        onBack={back}
        backTo={cameFrom(route.from)}
        title={task?.label ?? 'Starting…'}
        badges={task && <Status task={task} />}
        subtitle={subtitleOf(task)}
        actions={
          task &&
          (running ? (
            <Button icon={Ban} onClick={() => cancelTask(task.id)}>
              Cancel
            </Button>
          ) : (
            // Dismissing takes the row out of the strip, which takes this page
            // with it -- so it leaves as well, rather than standing on the
            // record it has just thrown away.
            <Button
              icon={X}
              onClick={() => {
                dismissTask(task.id);
                back();
              }}
            >
              Dismiss
            </Button>
          ))
        }
      />

      <div
        ref={body}
        onScroll={onScroll}
        // `ansi`, or the colours a build prints are set to variables nothing
        // has defined and every coloured run comes out as plain text. The
        // theme-following palette rather than the terminal one: this box is
        // the page's own paper, not an inset cut into it.
        className="ansi selectable min-h-0 flex-1 overflow-auto bg-ink-50 px-7 py-5 font-mono text-tiny leading-relaxed dark:bg-ink-950"
      >
        {!task ? (
          <p className="text-ink-500">Nothing is running under that name any more.</p>
        ) : lines === 0 ? (
          <p className="flex items-center gap-2 text-ink-500">
            {running && <Loader2 size={13} className="animate-spin" aria-hidden />}
            {running ? 'Waiting for the first line…' : 'The command produced no output.'}
          </p>
        ) : (
          task.lines.map((line, index) => (
            <p key={index} className="whitespace-pre-wrap break-all">
              <AnsiLine message={line} />
            </p>
          ))
        )}
      </div>
    </div>
  );
}

/** Where it is up to, said in the one line under the name. */
function subtitleOf(task: Task | undefined): string {
  if (!task) return 'It has been dismissed, or the window was reopened since.';
  if (task.status === 'failed') return task.error ?? 'It stopped without saying why.';
  if (task.status === 'done') return 'Finished. Everything it printed is below.';

  return task.step || 'Running…';
}

/** Running, finished, or not -- as a word, beside the name. */
function Status({ task }: { task: Task }) {
  if (task.status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-small text-ink-600 dark:text-ink-400">
        <Loader2 size={13} className="animate-spin" aria-hidden />
        running
        {task.total ? ` ${task.current ?? 0}/${task.total}` : ''}
      </span>
    );
  }

  return (
    <span
      className={`text-small font-medium ${
        task.status === 'failed'
          ? 'text-orange-700 dark:text-orange-500'
          : 'text-emerald-700 dark:text-emerald-500'
      }`}
    >
      {task.status === 'failed' ? 'failed' : 'done'}
    </span>
  );
}

/** What to call the page this was opened from. */
function cameFrom(from: Route | undefined): string {
  switch (from?.name) {
    case 'images':
      return 'Images';
    case 'containers':
      return 'Containers';
    case 'machines':
      return 'Machines';
    case 'container':
      return 'Container';
    case 'image':
      return 'Image';
    default:
      return 'Back';
  }
}
