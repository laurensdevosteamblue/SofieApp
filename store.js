const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  title: 'Sofie · Sound Board',
  subtitle: 'Tap a tile to hear its message.',
};

function newId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

function extFromMime(mime) {
  if (!mime) return '';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return '.m4a';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('webp')) return '.webp';
  return '';
}

// ---------------------------------------------------------------------------
// File backend (local development / hosts with a persistent disk)
// ---------------------------------------------------------------------------
function createFileStore() {
  const DATA_DIR = path.join(__dirname, 'data');
  const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
  const DATA_FILE = path.join(DATA_DIR, 'cells.json');
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

  for (const dir of [DATA_DIR, UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function loadCells() {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(raw)) return [];
      return raw.filter((c) => c && typeof c === 'object').map((c) => ({
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
  function saveCells(cells) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cells, null, 2));
  }
  function loadSettings() {
    try {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      return {
        title: typeof raw.title === 'string' ? raw.title : DEFAULT_SETTINGS.title,
        subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : DEFAULT_SETTINGS.subtitle,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  let cells = loadCells();
  let settings = loadSettings();

  return {
    type: 'file',
    async init() {},
    async getSettings() { return settings; },
    async saveSettings(partial) {
      if (typeof partial.title === 'string') settings.title = partial.title;
      if (typeof partial.subtitle === 'string') settings.subtitle = partial.subtitle;
      saveSettings(settings);
      return settings;
    },
    async getCells() { return cells; },
    async getCell(id) { return cells.find((c) => c.id === id) || null; },
    async createCell() {
      const cell = { id: newId(), title: '', text: '', imageUrl: '', audioUrl: '' };
      cells.push(cell);
      saveCells(cells);
      return cell;
    },
    async updateCell(id, fields) {
      const cell = cells.find((c) => c.id === id);
      if (!cell) return null;
      for (const k of ['title', 'text', 'imageUrl', 'audioUrl']) {
        if (k in fields) cell[k] = fields[k];
      }
      saveCells(cells);
      return cell;
    },
    async deleteCell(id) {
      const idx = cells.findIndex((c) => c.id === id);
      if (idx === -1) return false;
      cells.splice(idx, 1);
      saveCells(cells);
      return true;
    },
    async saveMedia(buffer, mime) {
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${extFromMime(mime)}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
      return '/uploads/' + name;
    },
    async deleteMedia(url) {
      if (!url || !url.startsWith('/uploads/')) return;
      fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
    },
    async getMedia() { return null; }, // served by express.static
  };
}

// ---------------------------------------------------------------------------
// MySQL backend (persists across container rebuilds)
// ---------------------------------------------------------------------------
function createMysqlStore(config) {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
  });

  const mapCell = (r) => ({
    id: r.id,
    title: r.title || '',
    text: r.body || '',
    imageUrl: r.image_url || '',
    audioUrl: r.audio_url || '',
  });

  return {
    type: 'mysql',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id INT PRIMARY KEY,
          title TEXT NOT NULL,
          subtitle TEXT NOT NULL
        ) CHARACTER SET utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS cells (
          id VARCHAR(64) NOT NULL,
          seq BIGINT NOT NULL AUTO_INCREMENT,
          title TEXT,
          body MEDIUMTEXT,
          image_url TEXT,
          audio_url TEXT,
          PRIMARY KEY (id),
          UNIQUE KEY seq_unique (seq)
        ) CHARACTER SET utf8mb4`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS media (
          id VARCHAR(64) PRIMARY KEY,
          mime VARCHAR(128) NOT NULL,
          data LONGBLOB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) CHARACTER SET utf8mb4`);
      const [rows] = await pool.query('SELECT id FROM settings WHERE id = 1');
      if (!rows.length) {
        await pool.query('INSERT INTO settings (id, title, subtitle) VALUES (1, ?, ?)',
          [DEFAULT_SETTINGS.title, DEFAULT_SETTINGS.subtitle]);
      }
    },
    async getSettings() {
      const [rows] = await pool.query('SELECT title, subtitle FROM settings WHERE id = 1');
      return rows.length ? { title: rows[0].title, subtitle: rows[0].subtitle } : { ...DEFAULT_SETTINGS };
    },
    async saveSettings(partial) {
      const current = await this.getSettings();
      const title = typeof partial.title === 'string' ? partial.title : current.title;
      const subtitle = typeof partial.subtitle === 'string' ? partial.subtitle : current.subtitle;
      await pool.query(
        'INSERT INTO settings (id, title, subtitle) VALUES (1, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE title = VALUES(title), subtitle = VALUES(subtitle)',
        [title, subtitle]);
      return { title, subtitle };
    },
    async getCells() {
      const [rows] = await pool.query(
        'SELECT id, title, body, image_url, audio_url FROM cells ORDER BY seq ASC');
      return rows.map(mapCell);
    },
    async getCell(id) {
      const [rows] = await pool.query(
        'SELECT id, title, body, image_url, audio_url FROM cells WHERE id = ?', [id]);
      return rows.length ? mapCell(rows[0]) : null;
    },
    async createCell() {
      const id = newId();
      await pool.query(
        "INSERT INTO cells (id, title, body, image_url, audio_url) VALUES (?, '', '', '', '')", [id]);
      return { id, title: '', text: '', imageUrl: '', audioUrl: '' };
    },
    async updateCell(id, fields) {
      const map = { title: 'title', text: 'body', imageUrl: 'image_url', audioUrl: 'audio_url' };
      const sets = [];
      const vals = [];
      for (const [k, col] of Object.entries(map)) {
        if (k in fields) { sets.push(`${col} = ?`); vals.push(fields[k]); }
      }
      if (sets.length) {
        vals.push(id);
        await pool.query(`UPDATE cells SET ${sets.join(', ')} WHERE id = ?`, vals);
      }
      return this.getCell(id);
    },
    async deleteCell(id) {
      const [rows] = await pool.query('SELECT id FROM cells WHERE id = ?', [id]);
      if (!rows.length) return false;
      await pool.query('DELETE FROM cells WHERE id = ?', [id]);
      return true;
    },
    async saveMedia(buffer, mime) {
      const id = newId();
      await pool.query('INSERT INTO media (id, mime, data) VALUES (?, ?, ?)',
        [id, mime || 'application/octet-stream', buffer]);
      return '/media/' + id;
    },
    async deleteMedia(url) {
      if (!url || !url.startsWith('/media/')) return;
      const id = url.slice('/media/'.length);
      await pool.query('DELETE FROM media WHERE id = ?', [id]);
    },
    async getMedia(id) {
      const [rows] = await pool.query('SELECT mime, data FROM media WHERE id = ?', [id]);
      return rows.length ? { mime: rows[0].mime, data: rows[0].data } : null;
    },
  };
}

function createStore() {
  // Prefer MySQL when configured. Supports either individual DB_* vars
  // (as Combell provides) or a single DATABASE_URL.
  if (process.env.DATABASE_URL) {
    return createMysqlStore({ uri: process.env.DATABASE_URL });
  }
  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) {
    return createMysqlStore({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
    });
  }
  return createFileStore();
}

module.exports = { createStore, extFromMime };
