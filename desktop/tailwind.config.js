/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand palette: the red of the Indonesian flag. Paired with the white
        // background it gives the app the merah-putih identity.
        brand: {
          50: '#fdf3f4',
          100: '#fadfe3',
          200: '#f4bcc3',
          400: '#e2596a',
          500: '#d92038',
          600: '#ce1126',
          700: '#a60d1e',
          800: '#7d0a17',
          900: '#5c0711',
          950: '#3d040b',
        },
        orange: {
          500: '#eb8b3d',
          600: '#e67e22',
          700: '#c26216',
        },
        emerald: {
          500: '#34d399',
          600: '#10b981',
          700: '#059669',
        },
        amber: {
          500: '#f59e0b',
          600: '#d97706',
        },
        // Neutral greys with a faint warm cast. The previous scale was brown,
        // which turned muddy under the brand red -- especially in dark mode,
        // where a brown ground reads as dirty rather than dark.
        ink: {
          50: '#fafafa',
          100: '#f3f3f4',
          200: '#e6e6e9',
          300: '#d5d5da',
          400: '#a8a8b0',
          500: '#81818b',
          600: '#5f5f69',
          700: '#484852',
          800: '#26262c',
          900: '#1a1a1f',
          950: '#131317',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        tiny: ['11px', '16px'],
      },
      boxShadow: {
        md: '0 4px 12px rgba(0, 0, 0, 0.08)',
        panel: '0 8px 32px rgba(0, 0, 0, 0.16)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
};
