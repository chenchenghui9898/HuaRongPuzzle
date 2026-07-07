require('dotenv').config();

const path = require('path');
const cron = require('node-cron');
const app = require('./app');
const { cleanupStalePuzzles } = require('./app');

const PORT = process.env.PORT || 3000;

// --- Local-dev only: serve static files & SPA fallback ---
app.use(require('express').static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Startup ---
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// --- Local cron: daily 3:00 AM Beijing time ---
cron.schedule('0 3 * * *', async () => {
  await cleanupStalePuzzles();
}, { timezone: 'Asia/Shanghai' });

console.log('[cleanup] Scheduled daily 03:00 Asia/Shanghai (30-day threshold, local cron)');
