/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'zetas-bg': '#0f1020',
        'zetas-surface': '#1a1b2e',
        'zetas-card': '#1e2240',
        'zetas-border': '#2d3461',
        'zetas-primary': '#3b5bdb',
        'zetas-primary-light': '#4c6ef5',
        'zetas-accent': '#5c7cfa',
        'zetas-text': '#e8eaf6',
        'zetas-muted': '#8b92b8',
        'zetas-success': '#2ecc71',
        'zetas-warning': '#f39c12',
        'zetas-danger': '#e74c3c',
        'zetas-wait': '#9b59b6',
      },
    },
  },
  plugins: [],
}
