import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
  /** Swaps the icon for a spinner and blocks further clicks. */
  busy?: boolean;
  /** Shown in place of the label while busy, e.g. "Starting…". */
  busyLabel?: string;
  children?: ReactNode;
}

/**
 * A button that shows its work. Disabling alone leaves people wondering whether
 * the click registered, so anything that waits on the CLI spins instead.
 */
export function Button({
  variant = 'ghost',
  icon: Icon,
  busy = false,
  busyLabel,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${VARIANTS[variant]} ${className}`}
    >
      {busy ? (
        <Loader2 size={13} className="animate-spin" aria-hidden />
      ) : (
        Icon && <Icon size={13} aria-hidden />
      )}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  busy?: boolean;
  /** Applied to the icon, e.g. a spin for restart. */
  iconClassName?: string;
}

export function IconButton({
  icon: Icon,
  busy = false,
  disabled,
  className = '',
  iconClassName = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`btn-icon ${className}`}
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" aria-hidden />
      ) : (
        <Icon size={14} className={iconClassName} aria-hidden />
      )}
    </button>
  );
}
