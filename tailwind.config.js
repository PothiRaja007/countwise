/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light mode
        paper: '#F7F5F0',
        surface: '#FFFFFF',
        line: '#E7E2D8',
        ink: '#221F1A',
        muted: '#8A8478',
        // Dark mode
        charcoal: '#15171B',
        charcoalSurface: '#1C1F24',
        lineDark: '#2B2E34',
        offwhite: '#ECEDEF',
        mutedDark: '#8D9199',
        // Brand (from logo)
        gold: '#C89D4B',
        brown: '#4A3720',
        // Semantic
        good: '#3D8F5F',
        bad: '#C24A42',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
