// The YouTube Library — Win95 File Explorer
// v0.4.0

window.DEBUG = {};

var state = {
  tree: null,
  currentPath: null,
  folderCache: {},
  videoWindows: [],
};

window.DEBUG.state = state;

var navHistory = [];
var navPosition = -1;

var BASE = location.pathname.replace(/\/[^/]*$/, '');

// Period-accurate Win98-style pixel folder icon (manila folder with tab)
var FOLDER_ICON_SVG = '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">'
  + '<rect x="1" y="5" width="13" height="5" rx="1" fill="#F5D67B" stroke="#808080" stroke-width="1"/>'
  + '<rect x="2" y="9" width="28" height="20" rx="1" fill="#FCE994" stroke="#808080" stroke-width="1"/>'
  + '<rect x="2" y="9" width="28" height="3" fill="#FDEAB0"/>'
  + '</svg>';

var VIDEO_ICON_SVG = '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">'
  + '<rect x="4" y="6" width="24" height="20" rx="2" fill="#808080" stroke="#404040" stroke-width="1"/>'
  + '<polygon points="12,10 12,22 24,16" fill="#fff"/>'
  + '</svg>';

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

function navigateTo(path, opts) {
  opts = opts || {};
  state.currentPath = path;
  setLoading(true);

  if (opts.pushHistory !== false) {
    // Truncate forward history when branching off mid-history
    if (navPosition < navHistory.length - 1) {
      navHistory = navHistory.slice(0, navPosition + 1);
    }
    // Don't push the same path twice in a row
    if (navHistory.length === 0 || navHistory[navPosition] !== path) {
      navHistory.push(path);
      navPosition = navHistory.length - 1;
    }
  }

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
    updateNavButtons();
  });
}

function goBack() {
  if (navPosition <= 0) return;
  navPosition--;
  navigateTo(navHistory[navPosition], {pushHistory: false});
}

function goForward() {
  if (navPosition >= navHistory.length - 1) return;
  navPosition++;
  navigateTo(navHistory[navPosition], {pushHistory: false});
}

function updateNavButtons() {
  var backBtn = document.getElementById('navBack');
  var fwdBtn = document.getElementById('navForward');
  if (backBtn) backBtn.disabled = navPosition <= 0;
  if (fwdBtn) fwdBtn.disabled = navPosition >= navHistory.length - 1;
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
              openVideoWindow(it.videoData);
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
  img.className = 'icon-img';
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

// ---- Video Windows (multi-window, draggable) ----

function openVideoWindow(video) {
  var win = document.createElement('div');
  win.className = 'window video-window visible';

  var offsetX = 30 + state.videoWindows.length * 25;
  var offsetY = 40 + state.videoWindows.length * 25;
  win.style.left = offsetX + 'px';
  win.style.top = offsetY + 'px';
  win.style.position = 'fixed';
  win.style.zIndex = getTopZIndex() + 1;

  win.innerHTML =
    '<div class="title-bar video-title-bar">' +
      '<div class="title-bar-text">' + escapeHTML(video.title) + '</div>' +
      '<div class="title-bar-controls">' +
        '<button aria-label="Minimize"></button>' +
        '<button aria-label="Maximize"></button>' +
        '<button aria-label="Close"></button>' +
      '</div>' +
    '</div>' +
    '<div class="window-body video-window-body">' +
      (video.embeddable
        ? '<div class="video-container"><iframe src="https://www.youtube.com/embed/' + video.id + '?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>'
        : '<div class="external-link-msg"><p>This video cannot be embedded.</p><p><a href="https://youtube.com/watch?v=' + video.id + '" target="_blank" rel="noopener">Open on YouTube</a></p></div>'
      ) +
    '</div>';

  addResizeHandles(win);
  document.body.appendChild(win);
  makeDraggable(win);
  makeResizable(win);

  // Close button
  var closeBtn = win.querySelector('button[aria-label="Close"]');
  closeBtn.addEventListener('click', function() {
    closeVideoWindow(win);
  });

  // Maximize button
  var maxBtn = win.querySelector('button[aria-label="Maximize"]');
  maxBtn.addEventListener('click', function() {
    win.classList.toggle('maximized');
    if (win.classList.contains('maximized')) {
      win._prevRect = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
      win.style.left = '0';
      win.style.top = '0';
      win.style.width = '100vw';
      win.style.height = 'calc(100vh - 34px)';
    } else if (win._prevRect) {
      win.style.left = win._prevRect.left;
      win.style.top = win._prevRect.top;
      win.style.width = win._prevRect.width;
      win.style.height = win._prevRect.height;
    }
    win._resized = true;
  });

  state.videoWindows.push(win);
  win._videoData = video;
}

function closeVideoWindow(win) {
  win.classList.remove('visible');
  var idx = state.videoWindows.indexOf(win);
  if (idx >= 0) state.videoWindows.splice(idx, 1);
  if (win.parentNode) win.parentNode.removeChild(win);
}

function escapeHTML(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Window Dragging ----

function makeDraggable(win) {
  var titleBar = win.querySelector('.title-bar');
  if (!titleBar) return;

  titleBar.addEventListener('mousedown', function(e) {
    if (e.target.tagName === 'BUTTON') return; // Don't drag on button clicks
    e.preventDefault();

    var rect = win.getBoundingClientRect();
    var offsetX = e.clientX - rect.left;
    var offsetY = e.clientY - rect.top;

    win.style.position = 'fixed';
    win.style.left = rect.left + 'px';
    win.style.top = rect.top + 'px';
    win.style.margin = '0';
    win.style.zIndex = getTopZIndex() + 1;

    function onMove(e) {
      win.style.left = (e.clientX - offsetX) + 'px';
      win.style.top = (e.clientY - offsetY) + 'px';
      win._dragged = true;
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ---- Window Resizing ----

function addResizeHandles(win) {
  var directions = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
  for (var i = 0; i < directions.length; i++) {
    var handle = document.createElement('div');
    handle.className = 'resize-handle ' + directions[i];
    win.appendChild(handle);
  }
}

function makeResizable(win) {
  var handles = win.querySelectorAll('.resize-handle');
  for (var i = 0; i < handles.length; i++) {
    handles[i].addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();

      var direction = e.target.className.replace('resize-handle ', '').trim();
      var startX = e.clientX;
      var startY = e.clientY;
      var rect = win.getBoundingClientRect();

      function onMove(e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;

        if (direction.indexOf('e') >= 0) {
          win.style.width = Math.max(320, rect.width + dx) + 'px';
        }
        if (direction.indexOf('w') >= 0) {
          win.style.width = Math.max(320, rect.width - dx) + 'px';
          win.style.left = (rect.left + dx) + 'px';
        }
        if (direction.indexOf('s') >= 0) {
          win.style.height = Math.max(240, rect.height + dy) + 'px';
        }
        if (direction.indexOf('n') >= 0) {
          win.style.height = Math.max(240, rect.height - dy) + 'px';
          win.style.top = (rect.top + dy) + 'px';
        }
        win._resized = true;
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

function getTopZIndex() {
  var max = 100;
  var windows = document.querySelectorAll('.video-window, #explorer');
  for (var i = 0; i < windows.length; i++) {
    var z = parseInt(windows[i].style.zIndex || getComputedStyle(windows[i]).zIndex || '0');
    if (z > max) max = z;
  }
  return max;
}

// ---- Title Bar Buttons ----

function setupTitleBarButtons() {
  var closeBtn = document.querySelector('#explorer .title-bar-controls button[aria-label="Close"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      navigateTo(null);
    });
  }

  var maximizeBtn = document.querySelector('#explorer .title-bar-controls button[aria-label="Maximize"]');
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', function() {
      var explorer = document.getElementById('explorer');
      if (explorer.classList.contains('maximized')) {
        // Restore
        explorer.classList.remove('maximized');
        explorer.style.position = '';
        explorer.style.top = '';
        explorer.style.left = '';
        explorer.style.width = '';
        explorer.style.height = '';
        explorer.style.margin = '';
        explorer.style.zIndex = '';
      } else {
        // Maximize
        var rect = explorer.getBoundingClientRect();
        explorer._prevRect = { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' };
        explorer.classList.add('maximized');
        explorer.style.position = 'fixed';
        explorer.style.top = '0';
        explorer.style.left = '0';
        explorer.style.width = '100vw';
        explorer.style.height = '100vh';
        explorer.style.margin = '0';
        explorer.style.zIndex = getTopZIndex() + 1;
        explorer._resized = true;
      }
    });
  }
}

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
  pane.innerHTML = '<div style="text-align:center;padding:40px;font-size:12px;">' + msg + '</div>';
}

// ---- Theme Toggle ----

var THEME_KEY = 'youtube_library_theme';
var win95Link = document.getElementById('themeWin95');
var xpLink = document.getElementById('themeXP');

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'win95';
}

function setTheme(theme) {
  if (theme === 'xp') {
    win95Link.disabled = true;
    xpLink.disabled = false;
    document.body.classList.add('theme-xp');
    document.body.classList.remove('theme-win95');
  } else {
    win95Link.disabled = false;
    xpLink.disabled = true;
    document.body.classList.add('theme-win95');
    document.body.classList.remove('theme-xp');
  }
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  setTheme(getTheme() === 'win95' ? 'xp' : 'win95');
}

function initTheme() {
  setTheme(getTheme());
}

// ---- Init ----

initTheme();
setupTitleBarButtons();
makeDraggable(document.getElementById('explorer'));
makeResizable(document.getElementById('explorer'));
addResizeHandles(document.getElementById('explorer'));

document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('navBack').addEventListener('click', goBack);
document.getElementById('navForward').addEventListener('click', goForward);

// Click-to-front: bring any window to the top when clicked
document.addEventListener('mousedown', function(e) {
  var win = e.target.closest('.window');
  if (win) {
    win.style.zIndex = getTopZIndex() + 1;
  }
});

init();
