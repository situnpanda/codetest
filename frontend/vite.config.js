import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

const shim = (p) => fileURLToPath(new URL(`./src/shims/${p}`, import.meta.url))

// Old CRA code keeps JSX inside some .js files; tell esbuild to treat .js as JSX.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    // Replace outdated libraries with modern equivalents via compatible shims.
    // Order matters: more specific paths must come before their base package.
    alias: [
      { find: 'react-datepicker/dist/react-datepicker.css', replacement: shim('empty.css') },
      { find: '@fontsource/roboto/300.css', replacement: shim('empty.css') },
      { find: '@fontsource/roboto/400.css', replacement: shim('empty.css') },
      { find: '@fontsource/roboto/500.css', replacement: shim('empty.css') },
      { find: '@fontsource/roboto/700.css', replacement: shim('empty.css') },
      { find: 'bootstrap/dist/css/bootstrap.min.css', replacement: shim('empty.css') },
      { find: 'bootstrap/dist/js/bootstrap.bundle.min', replacement: shim('empty.js') },
      { find: 'react-multi-carousel/lib/styles.css', replacement: shim('empty.css') },
      { find: 'slick-carousel/slick/slick.css', replacement: shim('empty.css') },
      { find: 'slick-carousel/slick/slick-theme.css', replacement: shim('empty.css') },
      { find: 'react-d3-speedometer/slim', replacement: shim('react-d3-speedometer.jsx') },
      { find: 'react-d3-speedometer', replacement: shim('react-d3-speedometer.jsx') },
      { find: 'react-vis-network-graph', replacement: shim('react-vis-network-graph.jsx') },
      { find: 'react-slick', replacement: shim('react-slick.jsx') },
      { find: 'react-datepicker', replacement: shim('react-datepicker.jsx') },
      { find: 'react-tooltip', replacement: shim('react-tooltip.jsx') },
    ],
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-ui': ['react', 'react-dom', 'react-router-dom', '@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'vendor-mui-x': ['@mui/x-charts', '@mui/x-data-grid', '@mui/x-date-pickers'],
          'vendor-charts': ['recharts'],
          'vendor-flow': ['reactflow'],
          'vendor-maps': ['d3', 'd3-geo', 'react-simple-maps', 'topojson-client'],
          'vendor-msal': ['@azure/msal-browser', '@azure/msal-react'],
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
})
