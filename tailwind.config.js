/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tertiary: { container: '#b55a4e' },
        primary: {
          fixed: '#8cf6d0',
          container: '#008466',
        },
        tertiary: {
          fixed: { dim: '#ffb4a9' },
          fixed: '#ffdad5',
        },
        inverse: {
          on: { surface: '#edf2ed' },
          surface: '#2c322f',
          primary: '#6fdab5',
        },
        error: {
          container: '#ffdad6',
        },
        on: {
          primary: {
            fixed: { variant: '#00513d' },
            fixed: '#002117',
          },
          tertiary: {
            fixed: '#3f0202',
            fixed: { variant: '#7b2d25' },
            container: '#fffbff',
          },
          surface: '#171d1a',
          secondary: {
            fixed: '#00210c',
            fixed: { variant: '#005228' },
          },
          background: '#171d1a',
          error: { container: '#93000a' },
          primary: { container: '#f5fff8' },
          secondary: { container: '#007239' },
          surface: { variant: '#3e4944' },
        },
        secondary: {
          fixed: { dim: '#61de8a' },
          fixed: '#7efba4',
          container: '#7bf8a1',
        },
        background: '#f5fbf6',
        surface: {
          dim: '#d6dbd7',
          bright: '#f5fbf6',
          container: {
            low: '#f0f5f0',
            high: '#e4e9e5',
            highest: '#dee4df',
          },
          variant: '#dee4df',
          tint: '#006c52',
          container: '#eaefeb',
          lowest: '#ffffff',
        },
        primary: '#006950',
        tertiary: '#964238',
        error: '#ba1a1a',
        secondary: '#006d37',
        outline: { variant: '#bdcac2' },
        on: {
          primary: '#ffffff',
          tertiary: '#ffffff',
          secondary: '#ffffff',
          error: '#ffffff',
        },
        primary: { fixed: { dim: '#6fdab5' } },
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '2rem',
        xl: '3rem',
        full: '9999px',
      },
      spacing: {
        'container-max': '1200px',
        unit: '8px',
        'margin-desktop': '40px',
        'margin-mobile': '20px',
        gutter: '16px',
      },
      fontFamily: {
        headline: ['Manrope'],
        label: ['Manrope'],
        display: ['Manrope'],
        body: ['Manrope'],
      },
      fontSize: {
        'headline-lg-mobile': ['28px', { lineHeight: '36px', fontWeight: '700' }],
        headline: ['24px', { lineHeight: '32px', fontWeight: '600' }],
        label: ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
        display: ['40px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '700' }],
        body: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'label-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
}
