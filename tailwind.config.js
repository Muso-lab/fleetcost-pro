/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f2f9',
          100: '#cce5f3',
          200: '#99cbe7',
          300: '#66b1db',
          400: '#4a9fd8',
          500: '#005A9C',
          600: '#004a80',
          700: '#003a64',
          800: '#002a48',
          900: '#001a2c',
        },
      },
    },
  },
  plugins: [],
}
