/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#6366F1', // Electric Indigo
        primaryHover: '#4F46E5',
        background: 'var(--bg-base)', 
        surface: 'var(--bg-surface)', 
        surfaceHover: 'var(--bg-surface-hover)', 
        border: 'var(--border)', 
        textPrimary: 'var(--text-primary)', 
        textMuted: 'var(--text-muted)', 
        success: '#10B981', // Neon Emerald
        warning: '#F59E0B',
        danger: '#F43F5E', // Vibrant Rose
      },
      boxShadow: {
        'premium': '0 10px 40px -10px rgba(99,102,241,0.1)',
        'premium-hover': '0 20px 40px -10px rgba(99,102,241,0.15), 0 0 20px 0 rgba(99,102,241,0.05)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Space Grotesk', 'sans-serif'],
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
