import { hasAnsi, parseAnsi, type AnsiStyle } from '../utils/ansi';

/** One log line, with whatever colour the program that wrote it asked for. */
export function AnsiLine({ message }: { message: string }) {
  // Most lines carry none, and every one of them would otherwise pay for a
  // parse and a wrapping span. A boot log is thousands of lines long.
  if (!hasAnsi(message)) return <>{message}</>;

  return (
    <>
      {parseAnsi(message).map((span, index) => (
        <span key={index} style={css(span.style)}>
          {span.text}
        </span>
      ))}
    </>
  );
}

function css(style: AnsiStyle): React.CSSProperties {
  return {
    color: style.fg,
    backgroundColor: style.bg,
    fontWeight: style.bold ? 600 : undefined,
    // Faint, rather than a colour of its own: dim is a shade of whatever is
    // already there, and half the palette has no darker version to reach for.
    opacity: style.dim ? 0.65 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration:
      style.underline && style.strike
        ? 'underline line-through'
        : style.underline
          ? 'underline'
          : style.strike
            ? 'line-through'
            : undefined,
  };
}
