/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#2563EB', // Royal Sapphire Blue (upgraded from #3B82F6)
        primaryHover: '#1D4ED8', // Cobalt Blue (upgraded from #2563EB)
        background: 'var(--bg-base)', 
        surface: 'var(--bg-surface)', 
        surfaceHover: 'var(--bg-surface-hover)', 
        border: 'var(--border)', 
        textPrimary: 'var(--text-primary)', 
        textSecondary: 'var(--text-secondary, #334155)',
        textMuted: 'var(--text-muted)', 
        success: '#059669', // Rich Emerald (upgraded from #10B981)
        warning: '#D97706', // Warm Amber (upgraded from #F59E0B)
        danger: '#DC2626', // Ruby Crimson (upgraded from #F43F5E)
        accentTeal: '#38E1C6',
        accentBlue: '#2563EB',
        accentAmber: '#F5B942',
      },
      boxShadow: {
        'premium': '0 10px 40px -10px rgba(99,102,241,0.1)',
        'premium-hover': '0 20px 40px -10px rgba(99,102,241,0.15), 0 0 20px 0 rgba(99,102,241,0.05)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
        display: ['"Outfit"', '"Space Grotesk"', 'sans-serif'],
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'flash-green': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
        },
        'flash-red': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        }
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'flash-green': 'flash-green 1s ease-out',
        'flash-red': 'flash-red 1s ease-out',
        'float': 'float 3s ease-in-out infinite',
      }
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
      })
    },
  ],
}
