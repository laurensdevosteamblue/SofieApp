const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const MAX_CELLS = 500;

// --- Paths & storage setup ---
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'cells.json');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function newId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

function loadCells() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c) => c && typeof c === 'object')
      .map((c) => ({
        id: typeof c.id === 'string' && c.id ? c.id : newId(),
        title: typeof c.title === 'string' ? c.title : '',
        text: typeof c.text === 'string' ? c.text : '',
        imageUrl: typeof c.imageUrl === 'string' ? c.imageUrl : '',
        audioUrl: typeof c.audioUrl === 'string' ? c.audioUrl : '',
      }));
  } catch {
    return [];
  }
}

function findCell(id) {
  return cells.find((c) => c.id === id);
}

function saveCells(cells) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(cells, null, 2));
}

let cells = loadCells();

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

// --- File uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || guessExt(file.mimetype);
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, name);
  },
});

function guessExt(mime) {
  if (!mime) return '';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('webp')) return '.webp';
  return '';
}

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

function deleteUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(url));
  fs.unlink(filePath, () => {});
}

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

app.get('/api/cells', (req, res) => {
  res.json(cells);
});

// Create a new empty tile (admin).
app.post('/api/cells', requireAdmin, (req, res) => {
  if (cells.length >= MAX_CELLS) {
    return res.status(400).json({ error: `Tile limit reached (${MAX_CELLS} max).` });
  }
  const cell = { id: newId(), title: '', text: '', imageUrl: '', audioUrl: '' };
  cells.push(cell);
  saveCells(cells);
  res.status(201).json(cell);
});

// Delete a tile (admin).
app.delete('/api/cells/:id', requireAdmin, (req, res) => {
  const idx = cells.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tile not found.' });
  deleteUpload(cells[idx].imageUrl);
  deleteUpload(cells[idx].audioUrl);
  cells.splice(idx, 1);
  saveCells(cells);
  res.json({ ok: true });
});

// Update a cell: text/title/imageUrl as fields, plus optional image & audio files.
app.post(
  '/api/cells/:id',
  requireAdmin,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  (req, res) => {
    const cell = findCell(req.params.id);
    if (!cell) {
      return res.status(404).json({ error: 'Tile not found.' });
    }
    const body = req.body || {};

    if (typeof body.title === 'string') cell.title = body.title;
    if (typeof body.text === 'string') cell.text = body.text;

    // Image: uploaded file takes priority, else explicit URL, else clear flag.
    if (req.files && req.files.image && req.files.image[0]) {
      deleteUpload(cell.imageUrl);
      cell.imageUrl = '/uploads/' + req.files.image[0].filename;
    } else if (typeof body.imageUrl === 'string') {
      if (body.imageUrl !== cell.imageUrl) deleteUpload(cell.imageUrl);
      cell.imageUrl = body.imageUrl;
    }
    if (body.clearImage === 'true') {
      deleteUpload(cell.imageUrl);
      cell.imageUrl = '';
    }

    // Audio: uploaded/recorded file replaces existing.
    if (req.files && req.files.audio && req.files.audio[0]) {
      deleteUpload(cell.audioUrl);
      cell.audioUrl = '/uploads/' + req.files.audio[0].filename;
    }
    if (body.clearAudio === 'true') {
      deleteUpload(cell.audioUrl);
      cell.audioUrl = '';
    }

    saveCells(cells);
    res.json(cell);
  }
);

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin login at http://localhost:${PORT}/admin.html (password: ${ADMIN_PASSWORD})`);
});
