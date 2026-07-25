import React from 'react';

interface BrandLoaderProps {
  size?: number | string;
  style?: React.CSSProperties;
  color?: string; // resting cubes color
  looseColor?: string; // loose cube color
}

export const BrandLoader: React.FC<BrandLoaderProps> = ({
  size = 44,
  style = {},
  color = 'var(--ink)',
  looseColor = 'var(--accent)',
}) => {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 1024 1024"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
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

        {/* Animated Loose Cube Group */}
        <g
          style={{
            transformOrigin: '752px 752px',
            animation: 'loose-cube-bounce 1.5s ease-in-out infinite',
          }}
        >
          <rect x="652" y="652" width="200" height="200" rx="28" fill={looseColor} />
        </g>
      </svg>
    </div>
  );
};
