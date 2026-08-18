import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import notices from '../generated/notices.json';
import { fetchLicence } from '../services/ipc';

interface Notice {
  name: string;
  version: string;
  licence: string;
  url?: string;
  text: string;
  /** Read from source when opened, for licences too large to ship. */
  remote?: string;
}

// Electron carries these; their licences run to megabytes, so they are read
// from source when someone actually asks to see one rather than bundled.
const EMBEDDED: Notice[] = [
  {
    name: 'Chromium',
    version: 'via Electron',
    licence: 'BSD-3-Clause',
    url: 'https://chromium.googlesource.com/chromium/src/',
    text: '',
    remote: 'chromium',
  },
  {
    name: 'Node.js',
    version: 'via Electron',
    licence: 'MIT',
    url: 'https://github.com/nodejs/node',
    text: '',
    remote: 'node',
  },
];

/**
 * Every open-source package inside the app, with its licence in full.
 *
 * MIT, ISC and BSD all require their notice to travel with the binary, so this
 * is a condition of shipping rather than a courtesy. The list is generated at
 * build time by scripts/notices.mjs -- a hand-written one drifts, and a drifted
 * licence list misstates what is actually inside.
 */
export function LicenceList() {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const packages = useMemo(
    () => [...(notices as Notice[]), ...EMBEDDED].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const [fetched, setFetched] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  const reveal = (entry: Notice) => {
    const next = open === entry.name ? null : entry.name;
    setOpen(next);

    if (!next || !entry.remote || fetched[entry.name]) return;

    void fetchLicence(entry.remote)
      .then((text) => setFetched((all) => ({ ...all, [entry.name]: text })))
      .catch(() => setFailed((all) => ({ ...all, [entry.name]: true })));
  };

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return packages;

    return packages.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) || entry.licence.toLowerCase().includes(needle)
    );
  }, [packages, filter]);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold">{packages.length} packages</p>

        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter licences"
          className="input w-40"
        />
      </div>

      <p className="text-tiny leading-relaxed text-ink-600 dark:text-ink-400">
        Every licence is reproduced in full, as those licences require.
      </p>

      <p className="text-tiny leading-relaxed text-ink-600 dark:text-ink-400">
        Chromium and Node.js are embedded in Electron; their licences are read from source when
        opened rather than shipped, because between them they run to megabytes.
      </p>

      <ul className="divide-y divide-ink-200 border-y border-ink-200 dark:divide-ink-800 dark:border-ink-800">
        {visible.map((entry) => {
          const expanded = open === entry.name;

          return (
            <li key={entry.name}>
              <button
                onClick={() => reveal(entry)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-900"
              >
                <ChevronDown
                  size={13}
                  aria-hidden
                  className={`shrink-0 text-ink-500 transition-transform ${expanded ? '' : '-rotate-90'}`}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{entry.name}</span>
                <span className="shrink-0 font-mono text-tiny text-ink-500">{entry.version}</span>
                <span className="shrink-0 text-tiny font-semibold text-ink-600 dark:text-ink-400">
                  {entry.licence}
                </span>
              </button>

              {expanded && (
                <div className="pb-3 pl-7">
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-tiny text-brand-700 hover:underline dark:text-brand-400"
                    >
                      {entry.url}
                    </a>
                  )}

                  <pre className="selectable mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3 font-mono text-tiny leading-relaxed dark:bg-ink-950">
                    {entry.text ||
                      fetched[entry.name] ||
                      (failed[entry.name]
                        ? 'Could not read this licence from its source. It is published at the address above.'
                        : 'Reading from source…')}
                  </pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
