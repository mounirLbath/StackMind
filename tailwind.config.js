/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4285F4',
          600: '#3367D6',
        },
        'cyan-accent': '#7bdff6',
        'purple-accent': '#a78bfa',
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        'pill': '999px',
      },
      boxShadow: {
        'soft': '0 4px 16px rgba(0, 0, 0, 0.10)',
        'glow': '0 8px 24px rgba(66, 133, 244, 0.18)',
      },
      animation: {
        'slide-in': 'slideIn 0.18s ease-out',
        'slide-out': 'slideOut 0.14s ease-out',
        'fade-in': 'fadeIn 0.18s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideOut: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
      },
    },
  },
  plugins: [],
}

