// The YouTube Library — Win95 File Explorer
// v0.1.0

const state = {
  tree: null,          // Full tree from tree.json
  currentPath: null,   // Currently viewed folder path, null = root
  folderCache: {},     // Cache of loaded folder JSONs
};

const FOLDER_ICON_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="6" width="12" height="4" rx="1" fill="#F5C842" stroke="#C0A000" stroke-width="1"/>
  <rect x="4" y="8" width="26" height="20" rx="2" fill="#FDE074" stroke="#C0A000" stroke-width="1"/>
</svg>`;

const VIDEO_ICON_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="6" width="24" height="20" rx="2" fill="#808080" stroke="#404040" stroke-width="1"/>
  <polygon points="12,10 12,22 24,16" fill="#fff"/>
</svg>`;

const SVG_DATA_PREFIX = 'data:image/svg+xml,';

function svgData(svg) {
  return SVG_DATA_PREFIX + encodeURIComponent(svg);
}

// ---- Bootstrap ----

async function init() {
  try {
    const resp = await fetch('data/tree.json');
    if (!resp.ok) throw new Error('Failed to load tree');
    state.tree = await resp.json();
    navigateTo(null);
  } catch (err) {
    showError('Could not load the library catalog.');
  }
}

// ---- Navigation ----

async function navigateTo(path) {
  state.currentPath = path;
  setLoading(true);

  try {
    if (path) {
      await loadAndRenderFolder(path);
    } else {
      renderRoot();
    }
  } catch (err) {
    showError('This folder appears to be empty or unavailable.');
  }

  setLoading(false);
  updateWindowTitle();
  updateAddressBar();
}

function getNodeByPath(path) {
  // Walk the tree to find the node at the given path
  const parts = path.split('/');
  let node = null;
  let children = Object.values(state.tree.categories);

  for (const part of parts) {
    node = children.find(c => c.name === part.replace(/_/g, ' ')) ||
           children.find(c => c.path === path);
    if (!node) {
      // Search recursively
      const found = findInTree(state.tree.categories, path);
      return found;
    }
    children = node.children || [];
  }

  if (!node || node.path !== path) {
    return findInTree(state.tree.categories, path);
  }

  return node;
}

function findInTree(categories, targetPath) {
  for (const cat of Object.values(categories)) {
    if (cat.path === targetPath) return cat;
    if (cat.children) {
      for (const child of cat.children) {
        const found = findInChildren(child, targetPath);
        if (found) return found;
      }
    }
  }
  return null;
}

function findInChildren(node, targetPath) {
  if (node.path === targetPath) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findInChildren(child, targetPath);
      if (found) return found;
    }
  }
  return null;
}

// ---- Rendering ----

function renderRoot() {
  const pane = document.getElementById('contentsPane');
  pane.innerHTML = '';

  const cats = Object.values(state.tree.categories);
  cats.sort((a, b) => a.name.localeCompare(b.name));

  for (const cat of cats) {
    const icon = createIcon({
      type: 'folder',
      label: cat.name,
      gifUrl: cat.gif_url,
      onClick: () => navigateTo(cat.path),
    });
    pane.appendChild(icon);

    // Show editor's picks as a subfolder at root level
    if (cat.picks_editor) {
      const picksPath = cat.path + "/" + cat.picks_editor + "'s Picks";
      const picksIcon = createIcon({
        type: 'folder',
        label: cat.picks_editor + "'s Picks",
        gifUrl: null,
        onClick: () => navigateTo(picksPath),
      });
      pane.appendChild(picksIcon);
    }
  }

  updateItemCount(cats.length);
}

async function loadAndRenderFolder(path) {
  const pane = document.getElementById('contentsPane');
  pane.innerHTML = '';

  // Get the tree node for subfolder info
  const node = getNodeByPath(path);

  // Fetch the folder's video contents
  let folderData;
  if (state.folderCache[path]) {
    folderData = state.folderCache[path];
  } else {
    const resp = await fetch('data/folders/' + path + '.json');
    if (!resp.ok) throw new Error('Folder not found');
    folderData = await resp.json();
    state.folderCache[path] = folderData;
  }

  const items = [];

  // Subfolders first
  if (node && node.children) {
    const sortedChildren = [...node.children].sort((a, b) => a.name.localeCompare(b.name));
    for (const child of sortedChildren) {
      items.push({
        type: 'folder',
        label: child.name,
        gifUrl: child.gif_url || null,
        path: child.path,
      });
    }
  }

  // Videos second, alphabetical by title
  if (folderData && folderData.videos) {
    const sortedVideos = [...folderData.videos].sort((a, b) => a.title.localeCompare(b.title));
    for (const video of sortedVideos) {
      items.push({
        type: 'video',
        label: video.title,
        gifUrl: video.gif_url || null,
        videoData: video,
      });
    }
  }

  // Render everything
  for (const item of items) {
    const icon = createIcon({
      type: item.type,
      label: item.label,
      gifUrl: item.gifUrl,
      onClick: () => {
        if (item.type === 'folder') {
          navigateTo(item.path);
        } else {
          openVideo(item.videoData);
        }
      },
    });
    pane.appendChild(icon);
  }

  updateItemCount(items.length);
}

function createIcon({ type, label, gifUrl, onClick }) {
  const div = document.createElement('div');
  div.className = 'icon-item';

  const img = document.createElement('img');
  img.className = type === 'folder' ? 'icon-img folder-icon' : 'icon-img video-icon';

  if (gifUrl) {
    img.src = gifUrl;
    img.onerror = () => {
      img.src = type === 'folder' ? svgData(FOLDER_ICON_SVG) : svgData(VIDEO_ICON_SVG);
    };
  } else {
    img.src = type === 'folder' ? svgData(FOLDER_ICON_SVG) : svgData(VIDEO_ICON_SVG);
  }

  const span = document.createElement('span');
  span.className = 'icon-label';
  span.textContent = label;

  div.appendChild(img);
  div.appendChild(span);
  div.addEventListener('click', onClick);

  return div;
}

// ---- Video Popup ----

function openVideo(video) {
  const popup = document.getElementById('videoPopup');
  const title = document.getElementById('videoPopupTitle');
  const container = document.getElementById('videoContainer');

  title.textContent = video.title;

  if (video.embeddable) {
    container.innerHTML = `<iframe
      src="https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0"
      allow="autoplay; encrypted-media"
      allowfullscreen>
    </iframe>`;
  } else {
    container.innerHTML = `<div class="external-link-msg">
      <p>This video cannot be embedded.</p>
      <p><a href="https://youtube.com/watch?v=${video.id}" target="_blank" rel="noopener">
        Open on YouTube
      </a></p>
    </div>`;
  }

  popup.classList.add('visible');
  addOverlay();
}

function closeVideo() {
  const popup = document.getElementById('videoPopup');
  const container = document.getElementById('videoContainer');
  popup.classList.remove('visible');
  container.innerHTML = '';
  removeOverlay();
}

function addOverlay() {
  let overlay = document.getElementById('desktopOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'desktopOverlay';
    overlay.className = 'desktop-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', closeVideo);
  }
  overlay.classList.add('visible');
}

function removeOverlay() {
  const overlay = document.getElementById('desktopOverlay');
  if (overlay) overlay.classList.remove('visible');
}

// Close popup via title bar button
document.getElementById('closeVideo').addEventListener('click', closeVideo);

// ---- Breadcrumb ----

function updateAddressBar() {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = '';

  // Root link
  const rootSeg = document.createElement('span');
  rootSeg.className = 'breadcrumb-seg root';
  rootSeg.textContent = 'Library';
  rootSeg.addEventListener('click', () => navigateTo(null));
  bc.appendChild(rootSeg);

  if (!state.currentPath) return;

  const parts = state.currentPath.split('/');
  let builtPath = '';

  for (let i = 0; i < parts.length; i++) {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = '>';
    bc.appendChild(sep);

    builtPath += (i === 0 ? '' : '/') + parts[i];

    const seg = document.createElement('span');
    seg.className = 'breadcrumb-seg';
    seg.textContent = parts[i].replace(/_/g, ' ');
    const pathAtLevel = builtPath;
    seg.addEventListener('click', () => navigateTo(pathAtLevel));
    bc.appendChild(seg);
  }
}

function updateWindowTitle() {
  const title = document.getElementById('windowTitle');
  if (state.currentPath) {
    const parts = state.currentPath.split('/');
    title.textContent = parts[parts.length - 1].replace(/_/g, ' ');
  } else {
    title.textContent = 'The YouTube Library';
  }
}

function updateItemCount(count) {
  document.getElementById('itemCount').textContent =
    count + ' item' + (count !== 1 ? 's' : '');
}

// ---- Loading & Error ----

function setLoading(on) {
  const indicator = document.getElementById('loadingIndicator');
  if (on) {
    indicator.classList.add('active');
  } else {
    indicator.classList.remove('active');
  }
}

function showError(msg) {
  const pane = document.getElementById('contentsPane');
  pane.innerHTML = `<div style="text-align:center;padding:40px;">
    <p style="font-family:'MS Sans Serif',sans-serif;font-size:12px;">${msg}</p>
  </div>`;
}

// ---- Init ----

init();
