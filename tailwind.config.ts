import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'p1': '#007BFF',
        'n0': '#FFFFFF',
        'n05': '#F9FAFB',
      },
      fontFamily: {
        'poppins': ['Poppins', 'sans-serif'],
        'museo': ['MuseoModerno', 'cursive'],
      },
    },
  },
  plugins: [],
}

export default config
