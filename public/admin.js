const loginView = document.getElementById('login-view');
const editorView = document.getElementById('editor-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const adminGrid = document.getElementById('admin-grid');
const toastEl = document.getElementById('toast');
const addTileBtn = document.getElementById('add-tile-btn');
const tileCountEl = document.getElementById('tile-count');
const emptyAdminEl = document.getElementById('empty-admin');

const MAX_CELLS = 500;

let toastTimer = null;
function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

async function checkSession() {
  const res = await fetch('/api/session');
  const { isAdmin } = await res.json();
  if (isAdmin) showEditor();
  else showLogin();
}

function showLogin() {
  loginView.style.display = '';
  editorView.style.display = 'none';
}

async function showEditor() {
  loginView.style.display = 'none';
  editorView.style.display = '';
  await loadCells();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const password = document.getElementById('password').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.ok) {
    document.getElementById('password').value = '';
    showEditor();
  } else {
    const data = await res.json().catch(() => ({}));
    loginError.textContent = data.error || 'Login failed.';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  showLogin();
});

async function loadCells() {
  const res = await fetch('/api/cells');
  const cells = await res.json();
  adminGrid.innerHTML = '';
  cells.forEach((cell, i) => adminGrid.appendChild(buildEditor(cell, i)));
  updateCount(cells.length);
}

function updateCount(n) {
  tileCountEl.textContent = `${n} / ${MAX_CELLS} tiles`;
  emptyAdminEl.style.display = n === 0 ? '' : 'none';
  addTileBtn.disabled = n >= MAX_CELLS;
}

addTileBtn.addEventListener('click', async () => {
  addTileBtn.disabled = true;
  try {
    const res = await fetch('/api/cells', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not add tile');
    }
    await loadCells();
    toast('Tile added');
    adminGrid.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    toast(err.message, true);
  } finally {
    addTileBtn.disabled = false;
  }
});

function buildEditor(cell, index) {
  const card = document.createElement('div');
  card.className = 'editor-card';

  card.innerHTML = `
    <h3><span class="cell-index">${index + 1}</span> Tile ${index + 1}</h3>

    <label class="field-label">Title</label>
    <input type="text" class="f-title" placeholder="Short title" value="${escapeAttr(cell.title)}">

    <label class="field-label">Text</label>
    <textarea class="f-text" placeholder="Caption / description">${escapeHtml(cell.text)}</textarea>

    <label class="field-label">Image URL</label>
    <input type="text" class="f-imageUrl" placeholder="https://... (optional)" value="${escapeAttr(cell.imageUrl)}">

    <label class="field-label">Or upload image</label>
    <input type="file" class="file-input f-imageFile" accept="image/*">

    <div class="media-preview f-imgPreview"></div>

    <label class="field-label">Audio message</label>
    <input type="file" class="file-input f-audioFile" accept="audio/*">

    <div class="record-row">
      <button type="button" class="btn small f-recBtn">● Record</button>
      <span class="rec-status f-recStatus"></span>
    </div>

    <audio class="f-audioPreview" controls style="display:none"></audio>

    <div class="card-actions">
      <button type="button" class="btn small f-save">Save</button>
      <button type="button" class="btn ghost small f-clearAudio">Remove audio</button>
      <button type="button" class="btn danger small f-delete" style="margin-left:auto">Delete</button>
    </div>
  `;

  const imgPreview = card.querySelector('.f-imgPreview');
  const imageUrlInput = card.querySelector('.f-imageUrl');
  const imageFileInput = card.querySelector('.f-imageFile');
  const audioFileInput = card.querySelector('.f-audioFile');
  const audioPreview = card.querySelector('.f-audioPreview');
  const recBtn = card.querySelector('.f-recBtn');
  const recStatus = card.querySelector('.f-recStatus');
  const saveBtn = card.querySelector('.f-save');
  const clearAudioBtn = card.querySelector('.f-clearAudio');
  const deleteBtn = card.querySelector('.f-delete');

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Delete tile ${index + 1}? This cannot be undone.`)) return;
    deleteBtn.disabled = true;
    try {
      const res = await fetch(`/api/cells/${cell.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      await loadCells();
      toast('Tile deleted');
    } catch (err) {
      toast(err.message, true);
      deleteBtn.disabled = false;
    }
  });

  // State for this card
  let recordedBlob = null;      // recorded audio blob (takes priority)
  let clearAudio = false;

  // Image preview
  function updateImgPreview() {
    if (imageFileInput.files && imageFileInput.files[0]) {
      imgPreview.innerHTML = '';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(imageFileInput.files[0]);
      imgPreview.appendChild(img);
    } else if (imageUrlInput.value.trim()) {
      imgPreview.innerHTML = `<img src="${escapeAttr(imageUrlInput.value.trim())}" onerror="this.parentNode.textContent='Image failed to load'">`;
    } else {
      imgPreview.textContent = 'No image';
    }
  }
  imageUrlInput.addEventListener('input', updateImgPreview);
  imageFileInput.addEventListener('change', updateImgPreview);
  updateImgPreview();

  // Existing audio preview
  if (cell.audioUrl) {
    audioPreview.src = cell.audioUrl;
    audioPreview.style.display = '';
  }

  // Uploaded audio file -> preview + cancels recording
  audioFileInput.addEventListener('change', () => {
    if (audioFileInput.files && audioFileInput.files[0]) {
      recordedBlob = null;
      clearAudio = false;
      audioPreview.src = URL.createObjectURL(audioFileInput.files[0]);
      audioPreview.style.display = '';
    }
  });

  // --- Recording ---
  let mediaRecorder = null;
  let chunks = [];
  recBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Recording not supported in this browser.', true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recordedBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        audioFileInput.value = '';
        clearAudio = false;
        audioPreview.src = URL.createObjectURL(recordedBlob);
        audioPreview.style.display = '';
        recBtn.textContent = '● Record';
        recBtn.classList.remove('danger');
        recStatus.textContent = 'Recorded ✓';
        recStatus.classList.remove('recording');
      };
      mediaRecorder.start();
      recBtn.textContent = '■ Stop';
      recBtn.classList.add('danger');
      recStatus.textContent = 'Recording…';
      recStatus.classList.add('recording');
    } catch (err) {
      toast('Microphone access denied.', true);
    }
  });

  clearAudioBtn.addEventListener('click', () => {
    recordedBlob = null;
    clearAudio = true;
    audioFileInput.value = '';
    audioPreview.removeAttribute('src');
    audioPreview.style.display = 'none';
    recStatus.textContent = 'Audio will be removed on save';
  });

  // --- Save ---
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const fd = new FormData();
      fd.append('title', card.querySelector('.f-title').value);
      fd.append('text', card.querySelector('.f-text').value);
      fd.append('imageUrl', imageUrlInput.value);
      if (imageFileInput.files && imageFileInput.files[0]) {
        fd.append('image', imageFileInput.files[0]);
      }
      if (recordedBlob) {
        const ext = (recordedBlob.type.includes('ogg')) ? 'ogg' : 'webm';
        fd.append('audio', recordedBlob, `recording.${ext}`);
      } else if (audioFileInput.files && audioFileInput.files[0]) {
        fd.append('audio', audioFileInput.files[0]);
      }
      if (clearAudio) fd.append('clearAudio', 'true');

      const res = await fetch(`/api/cells/${cell.id}`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      toast(`Tile ${index + 1} saved`);
      recordedBlob = null;
      clearAudio = false;
    } catch (err) {
      toast(err.message, true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  return card;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}

checkSession();
