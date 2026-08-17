import type { LucideIcon } from 'lucide-react';

export interface TabDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface TabsProps {
  tabs: TabDefinition[];
  active: string;
  onSelect: (id: string) => void;
}

export function Tabs({ tabs, active, onSelect }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-ink-200 px-4 dark:border-ink-700">
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = id === active;

        return (
          <button
            key={id}
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(id)}
            // The active tab sits on the panel's border, so the underline is
            // pulled down by a pixel to cover it.
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
              selected
                ? 'border-brand-600 font-semibold text-brand-700 dark:text-brand-400'
                : 'border-transparent text-ink-600 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
            }`}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
