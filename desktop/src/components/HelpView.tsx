import { Boxes, Keyboard, Pencil, Radio, Server, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const SHORTCUTS: [string, string][] = [
  ['⌘K / ⌘F', 'Focus search'],
  ['Esc', 'Clear search'],
  ['⌘,', 'Open settings'],
];

export function HelpView({ version }: { version: string }) {
  return (
    <div className="-mr-5 min-h-0 flex-1 overflow-y-auto pr-5">
      {/* Centred so a wide window reads as a document, not a left-aligned strip. */}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header>
          <h1 className="text-xl font-semibold">Help</h1>
          <p className="text-tiny text-ink-600 dark:text-ink-400">
            Dermaga v{version} · a UI over Apple&rsquo;s{' '}
            <code className="font-mono">container</code> CLI · MIT licensed
          </p>
        </header>

        <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
          <Card icon={Boxes} title="What you can manage">
            <p>
              Containers, the images they run, volumes and networks they attach to, the machines
              hosting them, and the background services themselves. Every action shells out to the
              CLI, so anything you do here is visible to{' '}
              <code className="font-mono">container ls</code> and the other way round.
            </p>
          </Card>

          <Card icon={Radio} title="Everything is live">
            <p>
              No refresh button and no polling. The server holds an event stream open and pushes new
              state the instant anything changes — including changes you make in a terminal. Logs
              and pull progress stream the same way.
            </p>
          </Card>

          <Card icon={Terminal} title="Terminal tab">
            <p>
              Each running container gets a real shell: the server attaches{' '}
              <code className="font-mono">container exec</code> to a pty, so you get a prompt, line
              editing, colours and resize. It prefers <code className="font-mono">bash</code> and
              falls back to <code className="font-mono">sh</code>.
            </p>
          </Card>

          <Card icon={Pencil} title="Editing recreates">
            <p>
              Apple&rsquo;s CLI has no update command, so saving the edit form stops, deletes and
              re-runs the container with the new spec. Named volumes survive; the container
              filesystem does not. A failed change rolls back to the previous container.
            </p>
          </Card>

          <Card icon={Server} title="When nothing works">
            <p>
              Check <strong>System</strong>. If the container services are stopped, nothing can
              start until they are back up — you can start them there, watch their logs, and reclaim
              disk space from unused images, containers and volumes.
            </p>
          </Card>

          <Card icon={Keyboard} title="Keyboard">
            <dl className="flex flex-col gap-1">
              {SHORTCUTS.map(([keys, description]) => (
                <div key={keys} className="row">
                  <dt className="row-key font-mono text-xs">{keys}</dt>
                  <dd className="row-value">{description}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Unboxed group, matching the detail pages: a ruled heading and its content. */
function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 [&_p]:text-xs [&_p]:leading-relaxed [&_p]:text-ink-600 dark:[&_p]:text-ink-400">
      <div className="flex items-center gap-2 border-b border-ink-200 pb-1 dark:border-ink-700">
        <Icon size={12} className="text-brand-600" aria-hidden />
        <h2 className="label-caps">{title}</h2>
      </div>
      {children}
    </section>
  );
}
