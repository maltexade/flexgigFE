const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'frontend')));

// Proxy /api requests to your real backend
app.use('/api', createProxyMiddleware({
    target: 'https://api.flexgig.com.ng', // real API
    changeOrigin: true,
    secure: true,
    pathRewrite: {
        '^/api': '/api', // keep the same path
    }
}));

// Start the local server
const PORT = 3000;
app.listen(PORT, () => console.log(`Local dashboard server running at http://localhost:${PORT}`));
