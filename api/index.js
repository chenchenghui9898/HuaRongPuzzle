// Vercel serverless handler for /api/*
// Vercel injects environment variables into process.env automatically.
// dotenv is only needed for local `vercel dev` testing.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
}

const app = require('../app');

module.exports = app;
