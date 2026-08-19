const raster = document.getElementById('raster');
let currentAudio = null;
let currentTile = null;

const PLAY_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function stopCurrent() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  if (currentTile) currentTile.classList.remove('playing');
  currentAudio = null;
  currentTile = null;
}

function playCell(cell, tile) {
  // Toggle off if the same tile is tapped again.
  if (currentTile === tile) {
    stopCurrent();
    return;
  }
  stopCurrent();
  const audio = new Audio(cell.audioUrl);
  currentAudio = audio;
  currentTile = tile;
  tile.classList.add('playing');
  audio.play().catch(() => stopCurrent());
  audio.addEventListener('ended', stopCurrent);
}

function renderCell(cell) {
  const tile = document.createElement('div');
  tile.className = 'tile';

  const hasImage = !!cell.imageUrl;
  const hasAudio = !!cell.audioUrl;
  const hasContent = hasImage || cell.title || cell.text;

  if (hasImage) tile.classList.add('has-image');

  if (hasImage) {
    const img = document.createElement('img');
    img.src = cell.imageUrl;
    img.alt = cell.title || 'Tile image';
    tile.appendChild(img);
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    tile.appendChild(overlay);
  }

  if (cell.title || cell.text) {
    const wrap = document.createElement('div');
    wrap.className = 'content';
    if (cell.title) {
      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = cell.title;
      wrap.appendChild(t);
    }
    if (cell.text) {
      const p = document.createElement('div');
      p.className = 'text';
      p.textContent = cell.text;
      wrap.appendChild(p);
    }
    tile.appendChild(wrap);
  }

  if (!hasContent) {
    tile.classList.add('empty');
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Empty';
    tile.appendChild(hint);
  }

  if (hasAudio) {
    tile.classList.add('playable');
    const badge = document.createElement('div');
    badge.className = 'play-badge';
    badge.innerHTML = PLAY_ICON;
    tile.appendChild(badge);
    tile.addEventListener('click', () => playCell(cell, tile));
  }

  return tile;
}

async function load() {
  try {
    const res = await fetch('/api/cells');
    const cells = await res.json();
    raster.innerHTML = '';
    const visible = cells.filter((c) => c.imageUrl || c.title || c.text || c.audioUrl);
    if (!visible.length) {
      raster.innerHTML = '<p style="color:#94a3b8;grid-column:1/-1;text-align:center">Nothing here yet. Add tiles from the Admin page.</p>';
      return;
    }
    visible.forEach((cell) => raster.appendChild(renderCell(cell)));
  } catch (err) {
    raster.innerHTML = '<p style="color:#f87171">Failed to load content.</p>';
  }
}

load();
