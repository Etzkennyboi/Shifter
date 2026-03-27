import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-orbitron)', 'sans-serif'],
        sans: ['var(--font-rajdhani)', 'sans-serif'],
      },
      colors: {
        neon: {
          blue: '#00F0FF',
          pink: '#FF003C',
          green: '#00FF66',
          purple: '#B026FF',
          dark: '#030014'
        }
      },
      backgroundImage: {
        'hud-grid': "radial-gradient(ellipse at center, rgba(0,240,255,0.15) 0%, transparent 70%), linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8))",
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite alternate',
        'flicker': 'flicker 0.15s infinite alternate',
        'hud-scan': 'hud-scan 8s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%': { textShadow: '0 0 10px rgba(0,240,255,0.5)' },
          '100%': { textShadow: '0 0 20px rgba(0,240,255,1), 0 0 40px rgba(0,240,255,0.8)' }
        },
        'flicker': {
          '0%': { opacity: '0.9' },
          '100%': { opacity: '1' }
        },
        'hud-scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' }
        }
      }
    },
  },
  plugins: [],
}
export default config
