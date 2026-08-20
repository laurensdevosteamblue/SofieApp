const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { createStore } = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const MAX_CELLS = 500;

const store = createStore();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authorized. Please log in as admin.' });
}

// Uploads are held in memory so they can be stored in the database (or on disk).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// Wrap async handlers so rejected promises become 500s instead of crashing.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- API routes ---
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Incorrect password.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

app.get('/api/cells', wrap(async (req, res) => {
  res.json(await store.getCells());
}));

// Site settings (title + subtitle shown on the public page).
app.get('/api/settings', wrap(async (req, res) => {
  res.json(await store.getSettings());
}));

app.post('/api/settings', requireAdmin, wrap(async (req, res) => {
  const body = req.body || {};
  res.json(await store.saveSettings({ title: body.title, subtitle: body.subtitle }));
}));

// Create a new empty tile (admin).
app.post('/api/cells', requireAdmin, wrap(async (req, res) => {
  const cells = await store.getCells();
  if (cells.length >= MAX_CELLS) {
    return res.status(400).json({ error: `Tile limit reached (${MAX_CELLS} max).` });
  }
  res.status(201).json(await store.createCell());
}));

// Delete a tile (admin).
app.delete('/api/cells/:id', requireAdmin, wrap(async (req, res) => {
  const cell = await store.getCell(req.params.id);
  if (!cell) return res.status(404).json({ error: 'Tile not found.' });
  await store.deleteMedia(cell.imageUrl);
  await store.deleteMedia(cell.audioUrl);
  await store.deleteCell(req.params.id);
  res.json({ ok: true });
}));

// Update a cell: text/title/imageUrl as fields, plus optional image & audio files.
app.post(
  '/api/cells/:id',
  requireAdmin,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  wrap(async (req, res) => {
    const cell = await store.getCell(req.params.id);
    if (!cell) return res.status(404).json({ error: 'Tile not found.' });

    const body = req.body || {};
    const fields = {};

    if (typeof body.title === 'string') fields.title = body.title;
    if (typeof body.text === 'string') fields.text = body.text;

    // Image: uploaded file takes priority, else explicit URL, else clear flag.
    const imageFile = req.files && req.files.image && req.files.image[0];
    if (imageFile) {
      await store.deleteMedia(cell.imageUrl);
      fields.imageUrl = await store.saveMedia(imageFile.buffer, imageFile.mimetype);
    } else if (typeof body.imageUrl === 'string') {
      if (body.imageUrl !== cell.imageUrl) await store.deleteMedia(cell.imageUrl);
      fields.imageUrl = body.imageUrl;
    }
    if (body.clearImage === 'true') {
      await store.deleteMedia(fields.imageUrl != null ? fields.imageUrl : cell.imageUrl);
      fields.imageUrl = '';
    }

    // Audio: uploaded/recorded file replaces existing.
    const audioFile = req.files && req.files.audio && req.files.audio[0];
    if (audioFile) {
      await store.deleteMedia(cell.audioUrl);
      fields.audioUrl = await store.saveMedia(audioFile.buffer, audioFile.mimetype);
    }
    if (body.clearAudio === 'true') {
      await store.deleteMedia(fields.audioUrl != null ? fields.audioUrl : cell.audioUrl);
      fields.audioUrl = '';
    }

    res.json(await store.updateCell(req.params.id, fields));
  })
);

// Serve media stored in the database.
app.get('/media/:id', wrap(async (req, res) => {
  const media = await store.getMedia(req.params.id);
  if (!media) return res.status(404).send('Not found');
  res.set('Content-Type', media.mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(media.data);
}));

app.use(express.static(path.join(__dirname, 'public')));

async function start() {
  await store.init();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT} (storage: ${store.type})`);
    console.log(`Admin login at http://localhost:${PORT}/admin.html`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
