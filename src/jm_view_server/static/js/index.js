/* --- Sorting Logic (支持单文件夹维度记忆，默认修改时间倒序) --- */
const FOLDER_SORT_KEY = 'jmv_folder_sort_prefs';
let currentSort = { column: 'date', direction: 'desc' };

function parseSize(sizeStr) {
    sizeStr = (sizeStr || '').trim();
    if (sizeStr === '<DIR>') return -1;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const parts = sizeStr.split(' ');
    if (parts.length < 2) return 0;
    const val = parseFloat(parts[0]);
    const unit = parts[1].toUpperCase();
    const power = units.indexOf(unit);
    return power > -1 ? val * Math.pow(1024, power) : 0;
}

function getNormalizedFolderKey(path) {
    if (!path) return '';
    return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function getFolderSortPreference(path) {
    const key = getNormalizedFolderKey(path);
    if (!key) return null;
    try {
        const map = JSON.parse(localStorage.getItem(FOLDER_SORT_KEY) || '{}');
        return map[key] || null;
    } catch (e) {
        return null;
    }
}

function saveFolderSortPreference(path, sortPref) {
    const key = getNormalizedFolderKey(path);
    if (!key) return;
    try {
        const map = JSON.parse(localStorage.getItem(FOLDER_SORT_KEY) || '{}');
        if (!sortPref || (sortPref.column === 'date' && sortPref.direction === 'desc')) {
            // 默认的时间倒排无需额外记录，清理以节省空间
            delete map[key];
        } else {
            map[key] = { column: sortPref.column, direction: sortPref.direction };
        }
        localStorage.setItem(FOLDER_SORT_KEY, JSON.stringify(map));
    } catch (e) {
        console.error('Failed to save folder sort preference', e);
    }
}

function applySort(col, direction, savePref) {
    currentSort.column = col;
    currentSort.direction = direction;

    // 1. 同步表头高亮图标
    document.querySelectorAll('.header-col').forEach(el => {
        el.classList.remove('asc', 'desc');
        if (el.dataset.sort === col) {
            el.classList.add(direction);
        }
    });

    const comparator = (a, b) => {
        // 文件夹始终置顶
        const isDirA = a.dataset.type === 'dir';
        const isDirB = b.dataset.type === 'dir';
        if (isDirA && !isDirB) return -1;
        if (!isDirA && isDirB) return 1;

        if (col === 'name') {
            const nameA = (a.querySelector('.file-name-col') || a.querySelector('.name') || {}).innerText || '';
            const nameB = (b.querySelector('.file-name-col') || b.querySelector('.name') || {}).innerText || '';
            const cmp = nameA.trim().localeCompare(nameB.trim(), undefined, { numeric: true, sensitivity: 'base' });
            return direction === 'asc' ? cmp : -cmp;
        }

        let valA = 0, valB = 0;
        if (col === 'size') {
            const sizeElA = a.querySelector('.size-col');
            const sizeElB = b.querySelector('.size-col');
            valA = parseSize(sizeElA ? sizeElA.innerText : '');
            valB = parseSize(sizeElB ? sizeElB.innerText : '');
        } else if (col === 'date') {
            const dateElA = a.querySelector('.date-col');
            const dateElB = b.querySelector('.date-col');
            const tA = (dateElA ? dateElA.innerText.trim() : '').replace(' ', 'T');
            const tB = (dateElB ? dateElB.innerText.trim() : '').replace(' ', 'T');
            valA = new Date(tA).getTime();
            valB = new Date(tB).getTime();
            if (isNaN(valA)) valA = 0;
            if (isNaN(valB)) valB = 0;
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    };

    // 2. 排序列表视图
    const listBody = document.querySelector('.file-list-body');
    if (listBody) {
        const rows = Array.from(listBody.querySelectorAll('.file-item'));
        rows.sort(comparator);
        rows.forEach(row => listBody.appendChild(row));
    }

    // 3. 排序网格视图
    const gridView = document.querySelector('.grid-view');
    if (gridView) {
        const cards = Array.from(gridView.querySelectorAll('.card-item'));
        cards.sort(comparator);
        cards.forEach(card => gridView.appendChild(card));
    }

    // 4. 单文件夹偏好记忆
    if (savePref) {
        const curPath = getCurPath();
        if (curPath) {
            saveFolderSortPreference(curPath, currentSort);
        }
    }
}

function sortTable(col) {
    let newDir = 'asc';
    if (currentSort.column === col) {
        newDir = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        newDir = col === 'date' ? 'desc' : 'asc';
    }
    applySort(col, newDir, true);
}

function initFolderSort() {
    const curPath = getCurPath();
    const pref = getFolderSortPreference(curPath);
    if (pref && pref.column && pref.direction) {
        if (pref.column !== 'date' || pref.direction !== 'desc') {
            applySort(pref.column, pref.direction, false);
            return;
        }
    }
    // 默认保持修改时间倒序
    currentSort.column = 'date';
    currentSort.direction = 'desc';
}

function openJmView(filename, _fileType) {
    let curPath = getCurPath();
    const viewDir = decodeURIComponent(filename);

    const jmViewForm = document.querySelector('#jmViewForm input[type="submit"]');
    const path = document.querySelector('#jmViewForm input[name="path"]');
    const openFromDir = document.querySelector('#jmViewForm input[name="openFromDir"]');
    path.value = viewDir;
    openFromDir.value = curPath;
    jmViewForm.click();
}

function getCurPath() {
    const el = document.getElementById('currentPathText');
    if (!el) return '';
    return el.getAttribute('data-path') || el.innerText.trim();
}

function goBack() {
    if (window.JmvColumnView && window.JmvColumnView.isActive()) {
        window.JmvColumnView.goBack();
        return;
    }
    let curPath = getCurPath();
    let backPath = curPath + '/..';
    changeDir(backPath);
}

function changeDir(goPath) {
    const pathFormInput = document.querySelector('#pathForm input[type="text"]');
    const SubmitBtn = document.querySelector('#pathForm input[type="submit"]');
    pathFormInput.value = goPath;
    SubmitBtn.click();
}

window.addEventListener('DOMContentLoaded', function () {
    // 初始化并应用单文件夹维度的排序记忆
    initFolderSort();

    const backToTopBtn = document.getElementById('to-top');
    const driverLinks = document.querySelectorAll('.driver-pill');
    const pathFormInput = document.querySelector('#pathForm input[type="text"]');
    const resultSubmitBtn = document.querySelector('#pathForm input[type="submit"]');
    const dirLinks = document.querySelectorAll('.file-item[data-type="dir"] .file-link');

    // 回到顶部：监听真正滚动容器 .content（兼容回退 window）
    const scrollHost = document.querySelector('.content');
    function updateBackToTop() {
        if (!backToTopBtn) return;
        const offset = scrollHost ? scrollHost.scrollTop : window.pageYOffset;
        backToTopBtn.classList.toggle('visible', offset > 300);
    }
    if (scrollHost) scrollHost.addEventListener('scroll', updateBackToTop, { passive: true });
    window.addEventListener('scroll', updateBackToTop, { passive: true });
    updateBackToTop();

    if (backToTopBtn) {
        backToTopBtn.setAttribute('role', 'button');
        backToTopBtn.setAttribute('aria-label', '回到顶部');
        backToTopBtn.setAttribute('title', '回到顶部');
        backToTopBtn.addEventListener('click', function () {
            const behavior = (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 'auto' : 'smooth';
            if (scrollHost && scrollHost.scrollTop > 0) {
                scrollHost.scrollTo({ top: 0, behavior: behavior });
            } else {
                window.scrollTo({ top: 0, behavior: behavior });
            }
        });
    }

    // Driver Links
    driverLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const location = this.getAttribute('location');
            if (location) {
                pathFormInput.value = location;
                resultSubmitBtn.click();
            }
        });
    });

    // Directory Links
    function whenClickDir(e) {
        e.preventDefault();
        let goPath = this.getAttribute('path');
        if (goPath) {
            changeDir(decodeURIComponent(goPath));
        }
    }

    dirLinks.forEach(link => {
        link.addEventListener('click', whenClickDir);
    });

    // Disable "Back" button if at root
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        if (getCurPath().length <= 3) {
            btnBack.disabled = true;
            btnBack.style.opacity = '0.5';
            btnBack.style.cursor = 'not-allowed';
        }
    }

    // Preview Image Interaction（仅桌面精确指针启用 7.5 倍预览放大，避免触屏误触闪烁）
    const canHoverPreview = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const previewImages = canHoverPreview ? document.querySelectorAll('.preview-img') : [];

    function applyDynamicOrigin(img) {
        const rect = img.getBoundingClientRect();
        const parent = img.closest('.content') || document.body;
        const parentRect = parent.getBoundingClientRect();
        if (rect.top - 208 < parentRect.top) {
            img.style.transformOrigin = 'top right';
        } else if (rect.bottom + 208 > parentRect.bottom) {
            img.style.transformOrigin = 'bottom right';
        } else {
            img.style.transformOrigin = 'center right';
        }
    }

    previewImages.forEach(img => {
        img.addEventListener('click', function (e) {
            e.stopPropagation();
            if (this.classList.contains('expanded')) {
                this.classList.remove('expanded');
                this.dataset.forceClose = 'true';
            } else {
                applyDynamicOrigin(this);
                this.classList.add('expanded');
                this.dataset.forceClose = 'false';
            }
        });

        img.addEventListener('mouseenter', function () {
            if (this.dataset.forceClose !== 'true') {
                applyDynamicOrigin(this);
                this.classList.add('expanded');
            }
        });

        img.addEventListener('mouseleave', function () {
            this.classList.remove('expanded');
            this.dataset.forceClose = 'false';
        });
    });
});

/* --- Bookmarks Logic --- */
const BOOKMARKS_KEY = 'plugin_jm_bookmarks';
let bookmarksOpener = null;
let bookmarkAddTimer = null;

function canonicalBookmarkPath(path) {
    if (window.JmvSync && typeof window.JmvSync.canonicalPath === 'function') {
        return window.JmvSync.canonicalPath(path);
    }
    const value = String(path || '').replace(/\\/g, '/');
    const isWindows = /^[a-z]:\//i.test(value) || /^\/\/[^/]+\/[^/]+/.test(value);
    const drive = /^[a-z]:\//i.test(value) ? value.slice(0, 3) : '';
    const unc = !drive && isWindows ? value.match(/^\/\/[^/]+\/[^/]+/)[0] : '';
    const root = drive || unc || (value.charAt(0) === '/' ? '/' : '');
    const remainder = value.slice(root.length);
    const parts = [];
    remainder.split('/').forEach(part => {
        if (!part || part === '.') return;
        if (part === '..') { if (parts.length) parts.pop(); return; }
        parts.push(part);
    });
    const normalized = root + (unc && (parts.length || remainder) ? '/' : '') + parts.join('/');
    return isWindows ? normalized.toLowerCase() : normalized;
}

function syncBookmarkAddButton() {
    const btn = document.querySelector('.bookmark-add-btn');
    if (!btn) return;
    const path = getCurPath();
    const canon = path ? canonicalBookmarkPath(path) : '';
    const exists = !!canon && getBookmarks().some(b => canonicalBookmarkPath(b.path) === canon);
    btn.classList.toggle('is-saved', exists);
    btn.innerHTML = exists
        ? icon('check') + ' 当前目录已收藏'
        : '<span id="bookmarkPlusIco" aria-hidden="true">' + icon('folderPlus') + '</span> 收藏当前目录';
}

function closeBookmarks(restoreFocus) {
    const backdrop = document.getElementById('bookmarks-backdrop');
    const drawer = document.getElementById('bookmarks-drawer');
    const trigger = document.getElementById('bookmarksBtn');
    if (!drawer || !drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    if (backdrop) backdrop.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && bookmarksOpener && bookmarksOpener.isConnected && bookmarksOpener.focus) {
        bookmarksOpener.focus({ preventScroll: true });
    }
    bookmarksOpener = null;
}

function toggleBookmarks() {
    const backdrop = document.getElementById('bookmarks-backdrop');
    const drawer = document.getElementById('bookmarks-drawer');
    const trigger = document.getElementById('bookmarksBtn');
    if (!drawer) return;

    if (drawer.classList.contains('open')) {
        closeBookmarks(true);
    } else {
        bookmarksOpener = document.activeElement;
        renderBookmarks();
        drawer.inert = false;
        drawer.setAttribute('aria-hidden', 'false');
        drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        const closeBtn = document.getElementById('bookmarksCloseBtn');
        if (closeBtn) closeBtn.focus({ preventScroll: true });
    }
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeBookmarks(true);
});

function getBookmarks() {
    const stored = localStorage.getItem(BOOKMARKS_KEY);
    try {
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Failed to parse bookmarks', e);
        return [];
    }
}

function saveBookmarks(bookmarks) {
    const previous = getBookmarks();
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    renderBookmarks();
    if (window.JmvSync) {
        const keyFor = item => 'bookmark:' + window.JmvSync.canonicalPath(item.path);
        bookmarks.forEach(item => {
            if (!previous.some(old => keyFor(old) === keyFor(item))) window.JmvSync.setRecord(keyFor(item), item);
        });
        previous.forEach(item => {
            if (!bookmarks.some(current => keyFor(current) === keyFor(item))) window.JmvSync.setRecord(keyFor(item), null);
        });
    }
}

function addCurrentBookmark() {
    const path = getCurPath();
    if (!path) return;

    const bookmarks = getBookmarks();
    const canon = canonicalBookmarkPath(path);
    const exists = bookmarks.some(b => canonicalBookmarkPath(b.path) === canon);
    if (exists) {
        if (window.toast) toast('当前目录已在收藏目录中', 'default');
        syncBookmarkAddButton();
        return;
    }

    bookmarks.unshift({
        path: path,
        timestamp: new Date().toISOString()
    });

    saveBookmarks(bookmarks);

    if (window.toast) toast('已添加到收藏目录', 'success');
    const btn = document.querySelector('.bookmark-add-btn');
    if (btn) {
        if (bookmarkAddTimer) clearTimeout(bookmarkAddTimer);
        btn.classList.add('is-saved');
        btn.innerHTML = icon('check') + ' 已收藏';
        bookmarkAddTimer = setTimeout(() => {
            bookmarkAddTimer = null;
            syncBookmarkAddButton();
        }, 1600);
    }
}

function deleteBookmark(index) {
    const bookmarks = getBookmarks();
    if (index < 0 || index >= bookmarks.length) return;
    const removed = bookmarks[index];
    bookmarks.splice(index, 1);
    saveBookmarks(bookmarks);
    if (window.toast) {
        toast('已移除收藏目录', 'default', {
            actionLabel: '撤销',
            onAction: function () {
                const current = getBookmarks();
                const removedCanon = canonicalBookmarkPath(removed.path);
                if (!current.some(b => canonicalBookmarkPath(b.path) === removedCanon)) {
                    current.splice(Math.min(index, current.length), 0, removed);
                    saveBookmarks(current);
                    toast('已恢复收藏目录', 'success');
                }
            }
        });
    }
}

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString();
}

function renderBookmarks() {
    const list = document.getElementById('bookmarks-list');
    const emptyState = document.getElementById('bookmarks-empty');
    const bookmarks = getBookmarks();
    syncBookmarkAddButton();
    if (!list || !emptyState) return;
    list.innerHTML = '';

    if (bookmarks.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    bookmarks.forEach((b, index) => {
        const li = document.createElement('li');
        li.className = 'bookmark-item';
        const link = document.createElement('a');
        link.href = '#'; link.className = 'bookmark-link';
        link.addEventListener('click', event => { event.preventDefault(); changeDir(b.path); });
        const pathLabel = document.createElement('div');
        pathLabel.className = 'bookmark-path'; pathLabel.title = b.path; pathLabel.textContent = b.path;
        const timeLabel = document.createElement('div');
        timeLabel.className = 'bookmark-time'; timeLabel.textContent = formatTime(b.timestamp);
        link.append(pathLabel, timeLabel);
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'bookmark-delete'; removeButton.title = '移除'; removeButton.setAttribute('aria-label', '移除收藏目录');
        removeButton.innerHTML = icon('x'); removeButton.addEventListener('click', () => deleteBookmark(index));
        li.append(link, removeButton);
        list.appendChild(li);
    });
}
