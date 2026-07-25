import React from 'react';

interface BrandIconProps {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  color?: string; // Color of the 8 resting cubes (defaults to var(--ink))
  looseColor?: string; // Color of the loose cube (defaults to var(--accent))
}

export const BrandIcon: React.FC<BrandIconProps> = ({
  size = 48,
  className = '',
  style = {},
  color = 'var(--ink)',
  looseColor = 'var(--accent)',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Row 0 */}
      <rect x="172" y="172" width="200" height="200" rx="28" fill={color} />
      <rect x="412" y="172" width="200" height="200" rx="28" fill={color} />
      <rect x="652" y="172" width="200" height="200" rx="28" fill={color} />

      {/* Row 1 */}
      <rect x="172" y="412" width="200" height="200" rx="28" fill={color} />
      <rect x="412" y="412" width="200" height="200" rx="28" fill={color} />
      <rect x="652" y="412" width="200" height="200" rx="28" fill={color} />

      {/* Row 2 */}
      <rect x="172" y="652" width="200" height="200" rx="28" fill={color} />
      <rect x="412" y="652" width="200" height="200" rx="28" fill={color} />

      {/* Loose, offset and rotated cube */}
      <g transform="translate(46, 46) rotate(-14, 752, 752)">
        <rect x="652" y="652" width="200" height="200" rx="28" fill={looseColor} />
      </g>
    </svg>
  );
};
