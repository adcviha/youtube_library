// The YouTube Library — Win95 File Explorer
// v0.1.1

window.DEBUG = {};

const state = {
  tree: null,
  currentPath: null,
  folderCache: {},
};

window.DEBUG.state = state;

const BASE = location.pathname.replace(/\/[^/]*$/, '');

const FOLDER_ICON_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="6" width="12" height="4" rx="1" fill="#F5C842" stroke="#C0A000" stroke-width="1"/>
  <rect x="4" y="8" width="26" height="20" rx="2" fill="#FDE074" stroke="#C0A000" stroke-width="1"/>
</svg>`;

const VIDEO_ICON_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="6" width="24" height="20" rx="2" fill="#808080" stroke="#404040" stroke-width="1"/>
  <polygon points="12,10 12,22 24,16" fill="#fff"/>
</svg>`;

function svgData(svg) {
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

const FOLDER_ICON_URL = svgData(FOLDER_ICON_SVG);
const VIDEO_ICON_URL = svgData(VIDEO_ICON_SVG);

// ---- Bootstrap ----

async function init() {
  try {
    const url = BASE + '/data/tree.json';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to load tree: ' + resp.status);
    state.tree = await resp.json();
    navigateTo(null);
  } catch (err) {
    console.error('Init failed:', err);
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
    console.error('Navigate failed:', err);
    showError('This folder appears to be empty or unavailable.');
  }

  setLoading(false);
  updateWindowTitle();
  updateAddressBar();
}

function getNodeByPath(path) {
  // Search the flat all_paths + recursive tree for the given path
  const found = findInTree(state.tree.categories, path);
  return found;
}

function findInTree(categories, targetPath) {
  for (const key of Object.keys(categories)) {
    const cat = categories[key];
    if (cat.path === targetPath) return cat;
    if (cat.children && cat.children.length) {
      const found = findInChildren(cat.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function findInChildren(children, targetPath) {
  for (const child of children) {
    if (child.path === targetPath) return child;
    if (child.children && child.children.length) {
      const found = findInChildren(child.children, targetPath);
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

  let count = 0;
  for (const cat of cats) {
    const icon = createIcon({
      type: 'folder',
      label: cat.name,
      gifUrl: cat.gif_url,
      onClick: function() { navigateTo(cat.path); },
    });
    pane.appendChild(icon);
    count++;

    // Virtual editor's picks folder
    if (cat.picks_editor) {
      const picksPath = cat.path + '/' + cat.picks_editor + "'s Picks";
      const picksIcon = createIcon({
        type: 'folder',
        label: cat.picks_editor + "'s Picks",
        gifUrl: null,
        onClick: function() { navigateTo(picksPath); },
      });
      pane.appendChild(picksIcon);
      count++;
    }
  }

  updateItemCount(count);
}

async function loadAndRenderFolder(path) {
  const pane = document.getElementById('contentsPane');
  pane.innerHTML = '';

  const node = getNodeByPath(path);

  // Fetch folder video contents
  let folderData;
  if (state.folderCache[path]) {
    folderData = state.folderCache[path];
  } else {
    const url = BASE + '/data/folders/' + path + '.json';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Folder fetch failed: ' + resp.status);
    folderData = await resp.json();
    state.folderCache[path] = folderData;
  }

  const items = [];

  // Subfolders first
  if (node && node.children && node.children.length) {
    const sorted = [...node.children].sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
    for (var i = 0; i < sorted.length; i++) {
      items.push({
        type: 'folder',
        label: sorted[i].name,
        gifUrl: sorted[i].gif_url || null,
        path: sorted[i].path,
      });
    }
  }

  // Videos second
  if (folderData && folderData.videos && folderData.videos.length) {
    const sorted = [...folderData.videos].sort(function(a, b) {
      return a.title.localeCompare(b.title);
    });
    for (var j = 0; j < sorted.length; j++) {
      items.push({
        type: 'video',
        label: sorted[j].title,
        gifUrl: sorted[j].gif_url || null,
        videoData: sorted[j],
      });
    }
  }

  for (var k = 0; k < items.length; k++) {
    var item = items[k];
    var icon = createIcon({
      type: item.type,
      label: item.label,
      gifUrl: item.gifUrl,
      onClick: (function(item) {
        return function() {
          if (item.type === 'folder') {
            navigateTo(item.path);
          } else {
            openVideo(item.videoData);
          }
        };
      })(item),
    });
    pane.appendChild(icon);
  }

  updateItemCount(items.length);
}

function createIcon(opts) {
  var type = opts.type;
  var label = opts.label;
  var gifUrl = opts.gifUrl;
  var onClick = opts.onClick;

  var div = document.createElement('div');
  div.className = 'icon-item';
  div.tabIndex = 0;

  var img = document.createElement('img');
  img.className = 'icon-img ' + (type === 'folder' ? 'folder-icon' : 'video-icon');
  img.draggable = false;

  if (gifUrl) {
    img.src = gifUrl;
    img.onerror = function() {
      img.src = type === 'folder' ? FOLDER_ICON_URL : VIDEO_ICON_URL;
    };
  } else {
    img.src = type === 'folder' ? FOLDER_ICON_URL : VIDEO_ICON_URL;
  }

  var span = document.createElement('span');
  span.className = 'icon-label';
  span.textContent = label;

  div.appendChild(img);
  div.appendChild(span);
  div.addEventListener('click', onClick);

  return div;
}

// ---- Video Popup ----

function openVideo(video) {
  var popup = document.getElementById('videoPopup');
  var title = document.getElementById('videoPopupTitle');
  var container = document.getElementById('videoContainer');

  title.textContent = video.title;

  if (video.embeddable) {
    container.innerHTML = '<iframe src="https://www.youtube.com/embed/' + video.id + '?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
  } else {
    container.innerHTML = '<div class="external-link-msg"><p>This video cannot be embedded.</p><p><a href="https://youtube.com/watch?v=' + video.id + '" target="_blank" rel="noopener">Open on YouTube</a></p></div>';
  }

  popup.classList.add('visible');
  addOverlay();
}

function closeVideo() {
  var popup = document.getElementById('videoPopup');
  var container = document.getElementById('videoContainer');
  popup.classList.remove('visible');
  container.innerHTML = '';
  removeOverlay();
}

function addOverlay() {
  var overlay = document.getElementById('desktopOverlay');
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
  var overlay = document.getElementById('desktopOverlay');
  if (overlay) overlay.classList.remove('visible');
}

document.getElementById('closeVideo').addEventListener('click', closeVideo);

// ---- Breadcrumb ----

function updateAddressBar() {
  var bc = document.getElementById('breadcrumb');
  bc.innerHTML = '';

  var rootSeg = document.createElement('span');
  rootSeg.className = 'breadcrumb-seg root';
  rootSeg.textContent = 'Library';
  rootSeg.addEventListener('click', function() { navigateTo(null); });
  bc.appendChild(rootSeg);

  if (!state.currentPath) return;

  var parts = state.currentPath.split('/');
  var built = '';

  for (var i = 0; i < parts.length; i++) {
    var sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = ' > ';
    bc.appendChild(sep);

    built += (i === 0 ? '' : '/') + parts[i];

    var seg = document.createElement('span');
    seg.className = 'breadcrumb-seg';
    seg.textContent = parts[i].replace(/_/g, ' ');
    (function(p) {
      seg.addEventListener('click', function() { navigateTo(p); });
    })(built);
    bc.appendChild(seg);
  }
}

function updateWindowTitle() {
  var title = document.getElementById('windowTitle');
  if (state.currentPath) {
    var parts = state.currentPath.split('/');
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
  var indicator = document.getElementById('loadingIndicator');
  if (indicator) {
    indicator.classList.toggle('active', on);
  }
}

function showError(msg) {
  var pane = document.getElementById('contentsPane');
  pane.innerHTML = '<div style="text-align:center;padding:40px;font-family:\'MS Sans Serif\',sans-serif;font-size:12px;">' + msg + '</div>';
}

// ---- Init ----

init();
