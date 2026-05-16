// The YouTube Library — Win95 File Explorer
// v0.2.0

window.DEBUG = {};

var state = {
  tree: null,
  currentPath: null,
  folderCache: {},
};

window.DEBUG.state = state;

var BASE = location.pathname.replace(/\/[^/]*$/, '');

var FOLDER_ICON_SVG = '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="6" width="12" height="4" rx="1" fill="#F5C842" stroke="#C0A000" stroke-width="1"/><rect x="4" y="8" width="26" height="20" rx="2" fill="#FDE074" stroke="#C0A000" stroke-width="1"/></svg>';

var VIDEO_ICON_SVG = '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="6" width="24" height="20" rx="2" fill="#808080" stroke="#404040" stroke-width="1"/><polygon points="12,10 12,22 24,16" fill="#fff"/></svg>';

var FOLDER_ICON_URL = 'data:image/svg+xml;base64,' + btoa(FOLDER_ICON_SVG);
var VIDEO_ICON_URL = 'data:image/svg+xml;base64,' + btoa(VIDEO_ICON_SVG);

// ---- Bootstrap ----

function init() {
  var url = BASE + '/data/tree.json';
  fetch(url)
    .then(function(resp) {
      if (!resp.ok) throw new Error('Failed to load tree: ' + resp.status);
      return resp.json();
    })
    .then(function(tree) {
      state.tree = tree;
      navigateTo(null);
    })
    .catch(function(err) {
      console.error('Init failed:', err);
      showError('Could not load the library catalog.');
    });
}

// ---- Navigation ----

function navigateTo(path) {
  state.currentPath = path;
  setLoading(true);

  var promise;
  if (path) {
    promise = loadAndRenderFolder(path);
  } else {
    promise = Promise.resolve(renderRoot());
  }

  promise.catch(function(err) {
    console.error('Navigate failed:', err);
    showError('This folder appears to be empty or unavailable.');
  }).then(function() {
    setLoading(false);
    updateWindowTitle();
    updateAddressBar();
  });
}

function getNodeByPath(path) {
  return findInTree(state.tree.categories, path);
}

function findInTree(categories, targetPath) {
  var keys = Object.keys(categories);
  for (var i = 0; i < keys.length; i++) {
    var cat = categories[keys[i]];
    if (cat.path === targetPath) return cat;
    if (cat.children && cat.children.length) {
      var found = findInChildren(cat.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function findInChildren(children, targetPath) {
  for (var i = 0; i < children.length; i++) {
    if (children[i].path === targetPath) return children[i];
    if (children[i].children && children[i].children.length) {
      var found = findInChildren(children[i].children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

// ---- Rendering ----

function renderRoot() {
  var pane = document.getElementById('contentsPane');
  pane.innerHTML = '';

  var cats = Object.values(state.tree.categories);
  cats.sort(function(a, b) { return a.name.localeCompare(b.name); });

  for (var i = 0; i < cats.length; i++) {
    var cat = cats[i];
    var icon = createIcon({
      type: 'folder',
      label: cat.name,
      gifUrl: cat.gif_url,
      onClick: (function(p) { return function() { navigateTo(p); }; })(cat.path),
    });
    pane.appendChild(icon);
  }

  updateItemCount(cats.length);
}

function loadAndRenderFolder(path) {
  var pane = document.getElementById('contentsPane');
  pane.innerHTML = '';

  var node = getNodeByPath(path);

  return fetchFolderData(path).then(function(folderData) {
    var items = [];

    // Editor's Picks first — only in Level 1 folders that have an editor
    if (node && node.level === 1 && node.picks_editor) {
      var picksPath = path + '/' + node.picks_editor + "'s Picks";
      items.push({
        type: 'folder',
        label: node.picks_editor + "'s Picks",
        gifUrl: null,
        path: picksPath,
      });
    }

    // Subfolders
    if (node && node.children && node.children.length) {
      var sortedChildren = node.children.slice().sort(function(a, b) {
        return a.name.localeCompare(b.name);
      });
      for (var i = 0; i < sortedChildren.length; i++) {
        items.push({
          type: 'folder',
          label: sortedChildren[i].name,
          gifUrl: sortedChildren[i].gif_url || null,
          path: sortedChildren[i].path,
        });
      }
    }

    // Videos
    if (folderData && folderData.videos && folderData.videos.length) {
      var sortedVideos = folderData.videos.slice().sort(function(a, b) {
        return a.title.localeCompare(b.title);
      });
      for (var j = 0; j < sortedVideos.length; j++) {
        items.push({
          type: 'video',
          label: sortedVideos[j].title,
          gifUrl: sortedVideos[j].gif_url || null,
          videoData: sortedVideos[j],
        });
      }
    }

    for (var k = 0; k < items.length; k++) {
      var item = items[k];
      var icon = createIcon({
        type: item.type,
        label: item.label,
        gifUrl: item.gifUrl,
        onClick: (function(it) {
          return function() {
            if (it.type === 'folder') {
              navigateTo(it.path);
            } else {
              openVideo(it.videoData);
            }
          };
        })(item),
      });
      pane.appendChild(icon);
    }

    updateItemCount(items.length);
  });
}

function fetchFolderData(path) {
  if (state.folderCache[path]) {
    return Promise.resolve(state.folderCache[path]);
  }
  var url = BASE + '/data/folders/' + path + '.json';
  return fetch(url).then(function(resp) {
    if (!resp.ok) throw new Error('Folder fetch failed: ' + resp.status);
    return resp.json();
  }).then(function(data) {
    state.folderCache[path] = data;
    return data;
  });
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

// ---- Title Bar Buttons ----

function setupTitleBarButtons() {
  // Close button — navigate to root (Library home)
  var closeBtn = document.querySelector('#explorer .title-bar-controls button[aria-label="Close"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      navigateTo(null);
    });
  }

  // Maximize button — toggle full-width
  var maximizeBtn = document.querySelector('#explorer .title-bar-controls button[aria-label="Maximize"]');
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', function() {
      var explorer = document.getElementById('explorer');
      explorer.classList.toggle('maximized');
    });
  }
}

// Close popup via its title bar button
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
    count + ' object' + (count !== 1 ? 's' : '');
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
  pane.innerHTML = '<p class="status-bar-field" style="padding:40px;text-align:center;">' + msg + '</p>';
}

// ---- Init ----

setupTitleBarButtons();
init();
