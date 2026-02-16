/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0a0a0f',
          card: '#1a1a2e',
          border: 'rgba(255,255,255,0.1)',
        },
        accent: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
          light: 'rgba(124,58,237,0.2)',
        },
      },
    },
  },
  plugins: [],
};
