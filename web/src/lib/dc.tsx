import React from 'react';

/**
 * Parse a CSS declaration string (e.g. "display:flex; gap:10px;") into a React
 * style object. Lets us port the design's literal inline styles nearly verbatim.
 */
export function css(text: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    const val = decl.slice(i + 1).trim();
    const camel = prop.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[camel] = val;
  }
  return out as React.CSSProperties;
}

type HoverProps = {
  as?: keyof JSX.IntrinsicElements;
  style?: React.CSSProperties;
  hover?: React.CSSProperties;
  children?: React.ReactNode;
} & Record<string, any>;

/**
 * Element that merges in `hover` styles while the pointer is over it — the React
 * equivalent of the design's `style-hover` attribute.
 */
export function Hover({ as = 'div', style, hover, children, ...rest }: HoverProps) {
  const [on, setOn] = React.useState(false);
  const Tag = as as any;
  return (
    <Tag
      style={{ ...style, ...(on && hover ? hover : {}) }}
      onMouseEnter={() => setOn(true)}
      onMouseLeave={() => setOn(false)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
