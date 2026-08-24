import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface Suggestion {
  value: string;
  /** A word about it, set in grey beside the value — a size, an address. */
  hint?: string;
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** What can be picked. Typing is never restricted to it. */
  options: Suggestion[];
  placeholder?: string;
  /** Layout classes for the field as a whole — a width, a flex share. */
  className?: string;
  /** For values that are read character by character: images, paths, ports. */
  mono?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  inputMode?: 'text' | 'numeric';
  'aria-label'?: string;
}

/**
 * A field that suggests, without insisting.
 *
 * This replaces `<input list>` and a `<datalist>`, which is the same idea and
 * two problems. The first is that WebKit barely implements it: in the webview
 * this app is drawn in, the list either never appears or appears as something
 * the rest of the window does not resemble -- no theme, no dark mode, nothing
 * to say a field has anything to offer at all. The second is that what it
 * offered could not be described: a datalist option can carry a label, and
 * WebKit ignores it, so an address or a size beside a name was written and
 * never shown.
 *
 * So the list is drawn here, from the same panel every other menu in this app
 * is drawn from, in a portal: the field lives inside a scrolling form, and
 * anything drawn inside that box is cut off by its edge -- and inside a page
 * laid out against its own width, `fixed` means the page rather than the
 * window. Body is the one place that is neither.
 *
 * Suggesting, not insisting: what is typed is the value, always. Nothing is
 * highlighted until the arrow keys ask for it, so Return still means what it
 * means everywhere else in these forms -- add a row, confirm the dialog --
 * right up until somebody has actually walked into the list.
 */
export function Autocomplete({
  value,
  onChange,
  options,
  placeholder,
  className,
  mono = false,
  autoFocus = false,
  disabled = false,
  inputMode,
  'aria-label': ariaLabel,
}: AutocompleteProps) {
  const listId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // Which one the keys are on. -1 is none, which is where it starts and where
  // it goes back to on every keystroke: the list narrows as you type, so a
  // remembered position is a position pointing at something else.
  const [active, setActive] = useState(-1);
  // Where the field was when the list opened, so the panel can be put under
  // it. Read once per opening rather than every render: the panel is not in
  // the layout, and asking the layout for a rectangle during one is how a
  // render loop starts.
  const [at, setAt] = useState<DOMRect | null>(null);

  const needle = value.trim().toLowerCase();
  const matches = needle
    ? options.filter((option) => option.value.toLowerCase().includes(needle))
    : options;
  const showing = open && matches.length > 0;

  const show = () => {
    if (disabled || options.length === 0) return;

    setAt(fieldRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const take = (option: Suggestion) => {
    onChange(option.value);
    close();
    inputRef.current?.focus();
  };

  // Anything that would move the field out from under its own list closes it,
  // the panel included: a menu left hanging where the thing it belongs to used
  // to be is worse than no menu.
  useEffect(() => {
    if (!showing) return;

    const away = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-suggestions="${listId}"]`)) return;
      if (fieldRef.current?.contains(target ?? null)) return;

      close();
    };

    window.addEventListener('mousedown', away);
    // Captured: what scrolls is the form inside the page, and a scroll there
    // does not bubble to the window.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);

    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [showing, listId]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      if (!showing) {
        show();
        setActive(event.key === 'ArrowDown' ? 0 : matches.length - 1);
        return;
      }

      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + matches.length) % matches.length);
      return;
    }

    // Only once somebody has walked into the list. Otherwise Return is left
    // alone, because in these forms it already means something: another row in
    // the group, or the dialog's own button.
    if (event.key === 'Enter' && showing && active >= 0) {
      event.preventDefault();
      event.stopPropagation();
      take(matches[active]);
      return;
    }

    // The list first, the dialog second. Escape closes whatever is nearest,
    // and a form thrown away because somebody dismissed a menu is not a form
    // anybody types into twice.
    if (event.key === 'Escape' && showing) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    if (event.key === 'Tab') close();
  };

  return (
    <div ref={fieldRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
          show();
        }}
        onClick={show}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        inputMode={inputMode}
        spellCheck={false}
        // The browser's own suggestions would be a second list over this one,
        // drawn by something with no idea what is in it.
        autoComplete="off"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        className={`input w-full ${options.length > 0 ? 'pr-7' : ''} ${mono ? 'font-mono' : ''}`}
      />

      {/* Not a button. The field is the trigger -- clicking anywhere in it
          opens the list -- and a control inside a <label> is a second thing
          for the same click to do. This only says the field has something to
          offer, which is the one thing a datalist never managed to say. */}
      {options.length > 0 && (
        <ChevronDown
          size={14}
          aria-hidden
          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 transition-transform ${
            showing ? 'rotate-180' : ''
          }`}
        />
      )}

      {showing && at && (
        <Suggestions
          id={listId}
          at={at}
          items={matches}
          active={active}
          needle={needle}
          mono={mono}
          onTake={take}
        />
      )}
    </div>
  );
}

/**
 * The list itself, over the form rather than in it.
 *
 * It flips above the field when there is no room below, and is as wide as the
 * field it belongs to: a menu narrower than its own input reads as a tooltip,
 * and one wider reads as a dialog that has opened by mistake.
 */
function Suggestions({
  id,
  at,
  items,
  active,
  needle,
  mono,
  onTake,
}: {
  id: string;
  at: DOMRect;
  items: Suggestion[];
  active: number;
  needle: string;
  mono: boolean;
  onTake: (option: Suggestion) => void;
}) {
  const current = useRef<HTMLButtonElement>(null);

  // Arrowing past the bottom of a scrolling menu should scroll it, not leave
  // the selection somewhere nobody can see.
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const maxHeight = 240;
  const below = window.innerHeight - at.bottom > maxHeight + 16;

  return createPortal(
    <div
      data-suggestions={id}
      id={id}
      role="listbox"
      style={{
        position: 'fixed',
        left: at.left,
        width: at.width,
        ...(below ? { top: at.bottom + 4 } : { bottom: window.innerHeight - at.top + 4 }),
        maxHeight,
      }}
      className="z-50 overflow-y-auto overscroll-contain rounded-xl border border-ink-200 bg-white p-1 shadow-panel dark:border-ink-700 dark:bg-ink-900"
    >
      {items.map((item, index) => (
        <button
          key={item.value}
          ref={index === active ? current : undefined}
          id={`${id}-${index}`}
          type="button"
          role="option"
          aria-selected={index === active}
          // Down rather than click, and the default stopped with it: a click
          // begins by taking focus away from the field, and a field that has
          // lost focus has closed this list before the click lands in it.
          onMouseDown={(event) => {
            event.preventDefault();
            onTake(item);
          }}
          className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
            index === active
              ? 'bg-ink-100 dark:bg-ink-800'
              : 'hover:bg-ink-100 dark:hover:bg-ink-800'
          }`}
        >
          <span
            className={`min-w-0 truncate text-code text-ink-800 dark:text-ink-200 ${mono ? 'font-mono' : ''}`}
          >
            <Matched value={item.value} needle={needle} />
          </span>
          {item.hint && <span className="shrink-0 text-tiny text-ink-500">{item.hint}</span>}
        </button>
      ))}
    </div>,
    document.body
  );
}

/**
 * The typed part of a suggestion, picked out of the rest of it.
 *
 * A list of twenty references that all begin `docker.io/library/` is twenty
 * lines the eye has to read to the middle of before they differ. Marking what
 * was matched says why each line is in the list, which is the same thing as
 * saying where to look.
 */
function Matched({ value, needle }: { value: string; needle: string }) {
  const at = needle ? value.toLowerCase().indexOf(needle) : -1;
  if (at === -1) return <>{value}</>;

  return (
    <>
      {value.slice(0, at)}
      <span className="font-semibold text-ink-900 dark:text-ink-100">
        {value.slice(at, at + needle.length)}
      </span>
      {value.slice(at + needle.length)}
    </>
  );
}
