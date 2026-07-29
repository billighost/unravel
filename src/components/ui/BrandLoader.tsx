import React, { useEffect, useState } from 'react';

interface BrandLoaderProps {
  size?: number | string;
  style?: React.CSSProperties;
  color?: string; // resting cubes color
  looseColor?: string; // loose cube color
}

const CUBES = [
  // Row 0
  { id: 0, x: 172, y: 172, r: 0, c: 0, dx: '-180px', dy: '-180px', dxShatter: '-250px', dyShatter: '-250px', delay: 0 },
  { id: 1, x: 412, y: 172, r: 0, c: 1, dx: '0px', dy: '-250px', dxShatter: '0px', dyShatter: '-320px', delay: 0.04 },
  { id: 2, x: 652, y: 172, r: 0, c: 2, dx: '180px', dy: '-180px', dxShatter: 250, dyShatter: '-250px', delay: 0.08 },
  // Row 1
  { id: 3, x: 172, y: 412, r: 1, c: 0, dx: '-250px', dy: '0px', dxShatter: '-320px', dyShatter: '0px', delay: 0.04 },
  { id: 4, x: 412, y: 412, r: 1, c: 1, dx: '0px', dy: '0px', dxShatter: '-50px', dyShatter: '-50px', delay: 0.08 },
  { id: 5, x: 652, y: 412, r: 1, c: 2, dx: '250px', dy: '0px', dxShatter: '320px', dyShatter: '0px', delay: 0.12 },
  // Row 2
  { id: 6, x: 172, y: 652, r: 2, c: 0, dx: '-180px', dy: '180px', dxShatter: '-250px', dyShatter: '250px', delay: 0.08 },
  { id: 7, x: 412, y: 652, r: 2, c: 1, dx: '0px', dy: '250px', dxShatter: '0px', dyShatter: '320px', delay: 0.12 },
  // 8 is the loose cube, rendered separately to manage groups/layers
];

export const BrandLoader: React.FC<BrandLoaderProps> = ({
  size = 44,
  style = {},
  color = 'var(--ink)',
  looseColor = 'var(--accent)',
}) => {
  const [animationType, setAnimationType] = useState<string | null>(null);

  useEffect(() => {
    const types = ['assemble', 'cascade', 'slider', 'flip'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    setAnimationType(randomType);
  }, []);

  // Determine standard grid rendering vs animation rendering
  const activeAnim = animationType || 'legacy';

  // Stagger delays based on layout diagonals for cascade
  const getCascadeDelay = (r: number, c: number) => {
    return (r + c) * 0.15;
  };

  // Stagger delays based on columns for flip
  const getFlipDelay = (c: number) => {
    return c * 0.15;
  };

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
      {/* Dynamic injection of hardware-accelerated loader animations */}
      <style>{`
        /* Global colors mapping for dynamic injection */
        :root {
          --color-ink: ${color};
          --color-accent: ${looseColor};
        }

        /* 1. ASSEMBLE ANIMATION KEYFRAMES */
        @keyframes assemble-cube {
          0% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
          25% { transform: translate(0px, 0px) scale(1.15); opacity: 1; }
          30% { transform: translate(0px, 0px) scale(1); opacity: 1; }
          80% { transform: translate(0px, 0px) scale(1); opacity: 1; }
          85% { transform: translate(var(--dx-shatter), var(--dy-shatter)) scale(0); opacity: 0; }
          100% { transform: translate(var(--dx-shatter), var(--dy-shatter)) scale(0); opacity: 0; }
        }
        @keyframes assemble-loose {
          0% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
          30% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
          48% { transform: translate(46px, 46px) rotate(-25deg) scale(1.2); opacity: 1; }
          54% { transform: translate(46px, 46px) rotate(-10deg) scale(0.95); opacity: 1; }
          60% { transform: translate(46px, 46px) rotate(-15deg) scale(1.05); opacity: 1; }
          65% { transform: translate(46px, 46px) rotate(-14deg) scale(1); opacity: 1; }
          80% { transform: translate(46px, 46px) rotate(-14deg) scale(1); opacity: 1; }
          85% { transform: translate(120px, 120px) rotate(45deg) scale(0); opacity: 0; }
          100% { transform: translate(120px, 120px) rotate(45deg) scale(0); opacity: 0; }
        }

        /* 2. CASCADE ANIMATION KEYFRAMES */
        @keyframes cascade-cube {
          0% { transform: scale(1) rotate(0deg); fill: var(--color-ink); }
          12% { transform: scale(1.25) rotate(12deg); fill: var(--color-accent); }
          24% { transform: scale(1) rotate(0deg); fill: var(--color-ink); }
          100% { transform: scale(1) rotate(0deg); fill: var(--color-ink); }
        }
        @keyframes cascade-loose {
          0% { transform: translate(46px, 46px) rotate(-14deg) scale(1); fill: var(--color-accent); }
          12% { transform: translate(46px, 46px) rotate(166deg) scale(1.3); fill: var(--color-ink); }
          24% { transform: translate(46px, 46px) rotate(346deg) scale(1.05); fill: var(--color-accent); }
          30% { transform: translate(46px, 46px) rotate(346deg) scale(1); fill: var(--color-accent); }
          100% { transform: translate(46px, 46px) rotate(346deg) scale(1); fill: var(--color-accent); }
        }

        /* 3. SLIDER ANIMATION KEYFRAMES */
        @keyframes slider-col0 {
          0% { transform: translateX(-400px); opacity: 0; }
          15% { transform: translateX(20px); opacity: 1; }
          22% { transform: translateX(-5px); }
          28% { transform: translateX(0); }
          80% { transform: translateX(0); opacity: 1; }
          87% { transform: translateX(-400px); opacity: 0; }
          100% { transform: translateX(-400px); opacity: 0; }
        }
        @keyframes slider-col1 {
          0% { transform: translateY(-400px); opacity: 0; }
          18% { transform: translateY(20px); opacity: 1; }
          25% { transform: translateY(-5px); }
          31% { transform: translateY(0); }
          80% { transform: translateY(0); opacity: 1; }
          87% { transform: translateY(-400px); opacity: 0; }
          100% { transform: translateY(-400px); opacity: 0; }
        }
        @keyframes slider-col2 {
          0% { transform: translateX(400px); opacity: 0; }
          21% { transform: translateX(-20px); opacity: 1; }
          28% { transform: translateX(5px); }
          34% { transform: translateX(0); }
          80% { transform: translateX(0); opacity: 1; }
          87% { transform: translateX(400px); opacity: 0; }
          100% { transform: translateX(400px); opacity: 0; }
        }
        @keyframes slider-loose {
          0% { transform: translate(46px, -400px) rotate(45deg); opacity: 0; }
          32% { transform: translate(46px, -400px) rotate(45deg); opacity: 0; }
          48% { transform: translate(46px, 90px) rotate(-30deg); opacity: 1; }
          56% { transform: translate(46px, 35px) rotate(-10deg); }
          64% { transform: translate(46px, 46px) rotate(-14deg); }
          80% { transform: translate(46px, 46px) rotate(-14deg); opacity: 1; }
          87% { transform: translate(46px, 600px) rotate(90deg); opacity: 0; }
          100% { transform: translate(46px, 600px) rotate(90deg); opacity: 0; }
        }

        /* 4. FLIP ANIMATION KEYFRAMES */
        @keyframes flip-cube {
          0% { transform: rotateY(0deg); }
          16% { transform: rotateY(90deg); fill: var(--color-accent); }
          32% { transform: rotateY(180deg); }
          68% { transform: rotateY(180deg); }
          84% { transform: rotateY(270deg); fill: var(--color-accent); }
          100% { transform: rotateY(360deg); }
        }
        @keyframes flip-loose {
          0% { transform: translate(46px, 46px) rotate(-14deg) rotateX(0deg); }
          16% { transform: translate(46px, 46px) rotate(-14deg) rotateX(90deg); fill: var(--color-ink); }
          32% { transform: translate(46px, 46px) rotate(-14deg) rotateX(180deg); }
          68% { transform: translate(46px, 46px) rotate(-14deg) rotateX(180deg); }
          84% { transform: translate(46px, 46px) rotate(-14deg) rotateX(270deg); fill: var(--color-ink); }
          100% { transform: translate(46px, 46px) rotate(-14deg) rotateX(360deg); }
        }

        /* LEGACY BOUNCE BACKUP */
        @keyframes loose-cube-bounce {
          0% { transform: translate(46px, 46px) rotate(-14deg); }
          50% { transform: translate(96px, 96px) rotate(-35deg); }
          100% { transform: translate(46px, 46px) rotate(-14deg); }
        }
      `}</style>

      <svg
        width={size}
        height={size}
        viewBox="0 0 1024 1024"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: 'block',
          perspective: activeAnim === 'flip' ? '800px' : undefined,
          transformStyle: activeAnim === 'flip' ? 'preserve-3d' : undefined,
        }}
      >
        {/* Core Cubes */}
        {CUBES.map((cube) => {
          let styleRule: React.CSSProperties = {};

          if (activeAnim === 'assemble') {
            styleRule = {
              transformOrigin: `${cube.x + 100}px ${cube.y + 100}px`,
              animation: `assemble-cube 3s cubic-bezier(0.25, 1, 0.5, 1) infinite`,
              animationDelay: `${cube.delay}s`,
              // Cast local custom CSS properties for keyframes
              ['--dx' as any]: cube.dx,
              ['--dy' as any]: cube.dy,
              ['--dx-shatter' as any]: `${cube.dxShatter}`,
              ['--dy-shatter' as any]: `${cube.dyShatter}`,
            };
          } else if (activeAnim === 'cascade') {
            styleRule = {
              transformOrigin: `${cube.x + 100}px ${cube.y + 100}px`,
              animation: `cascade-cube 2s ease-in-out infinite`,
              animationDelay: `${getCascadeDelay(cube.r, cube.c)}s`,
            };
          } else if (activeAnim === 'slider') {
            const colClassAnim = cube.c === 0 ? 'slider-col0' : cube.c === 1 ? 'slider-col1' : 'slider-col2';
            styleRule = {
              transformOrigin: `${cube.x + 100}px ${cube.y + 100}px`,
              animation: `${colClassAnim} 2.5s cubic-bezier(0.25, 1, 0.5, 1) infinite`,
            };
          } else if (activeAnim === 'flip') {
            styleRule = {
              transformOrigin: `${cube.x + 100}px ${cube.y + 100}px`,
              animation: `flip-cube 2.6s cubic-bezier(0.37, 0, 0.63, 1) infinite`,
              animationDelay: `${getFlipDelay(cube.c)}s`,
            };
          }

          return (
            <rect
              key={cube.id}
              x={cube.x}
              y={cube.y}
              width="200"
              height="200"
              rx="28"
              fill={color}
              style={styleRule}
            />
          );
        })}

        {/* Dynamic 9th Loose/Accent Cube */}
        {(() => {
          let gStyle: React.CSSProperties = {
            transformOrigin: '752px 752px',
          };

          if (activeAnim === 'assemble') {
            gStyle = {
              ...gStyle,
              animation: 'assemble-loose 3s cubic-bezier(0.25, 1, 0.5, 1) infinite',
              ['--dx' as any]: '220px',
              ['--dy' as any]: '220px',
            };
          } else if (activeAnim === 'cascade') {
            gStyle = {
              ...gStyle,
              animation: 'cascade-loose 2s ease-in-out infinite',
              animationDelay: `${getCascadeDelay(2, 2)}s`,
            };
          } else if (activeAnim === 'slider') {
            gStyle = {
              ...gStyle,
              animation: 'slider-loose 2.5s cubic-bezier(0.25, 1, 0.5, 1) infinite',
            };
          } else if (activeAnim === 'flip') {
            gStyle = {
              ...gStyle,
              animation: 'flip-loose 2.6s cubic-bezier(0.37, 0, 0.63, 1) infinite',
              animationDelay: `${getFlipDelay(2)}s`,
            };
          } else {
            gStyle = {
              ...gStyle,
              animation: 'loose-cube-bounce 1.5s ease-in-out infinite',
            };
          }

          return (
            <g style={gStyle}>
              <rect
                x="652"
                y="652"
                width="200"
                height="200"
                rx="28"
                fill={looseColor}
              />
            </g>
          );
        })()}
      </svg>
    </div>
  );
};
