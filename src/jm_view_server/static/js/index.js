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

function openDir(file, reveal) {
    file = decodeURIComponent(file);
    // I-10：reveal=false 时直接进入该目录（顶部“打开当前文件夹”用）；默认 reveal=true 在父目录中选中。
    var qs = (reveal === false) ? '?reveal=0' : '';
    // I-7：解析后端 JSON 状态，失败（目标已删/权限受限/无法打开）时用 toast 明确提示
    fetch(`/open/${encodeURIComponent(file)}${qs}`)
        .then(function (resp) {
            return resp.json().catch(function () { return {}; }).then(function (data) {
                return { ok: resp.ok, data: data };
            });
        })
        .then(function (r) {
            if (r.ok && r.data && r.data.status === 'ok') return;
            var msg = (r.data && r.data.error) || '无法打开该位置';
            if (window.toast) toast(msg, 'error'); else alert(msg);
        })
        .catch(function () {
            if (window.toast) toast('打开失败，请重试', 'error'); else alert('打开失败');
        });
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
    // Prefer data-path attribute which preserves spaces/raw values
    // Fallback to innerText (though innerText collapses spaces)
    return el.getAttribute('data-path') || el.innerText.trim();
}

function goBack() {
    if (window.JmvColumnView && window.JmvColumnView.isActive()) {
        window.JmvColumnView.goBack();
        return;
    }
    let curPath = getCurPath();
    let backPath = curPath + '/..';
    console.log(`go back -> ${backPath}`);
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

    // UI Elements
    const backToTopBtn = document.getElementById('to-top');
    const driverLinks = document.querySelectorAll('.driver-pill');
    const pathFormInput = document.querySelector('#pathForm input[type="text"]');
    const resultSubmitBtn = document.querySelector('#pathForm input[type="submit"]');

    // Select directory links based on the new HTML structure
    // We look for .file-link inside items marked as folders
    const dirLinks = document.querySelectorAll('.file-item[data-type="dir"] .file-link');

    // Scroll Logic for Back-to-Top button
    window.addEventListener('scroll', function () {
        if (window.pageYOffset > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });

    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', function () {
            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
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

    // Disable "Back" button if at root (roughly determined by path length)
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        // Windows root paths are short (e.g., C:\), Linux roots are purely slash /
        // The original logic checked length <= 3. We'll keep that heuristic.
        if (getCurPath().length <= 3) {
            btnBack.disabled = true;
            btnBack.style.opacity = '0.5';
            btnBack.style.cursor = 'not-allowed';
        }
    }

    // Preview Image Interaction
    const previewImages = document.querySelectorAll('.preview-img');
    
    function applyDynamicOrigin(img) {
        const rect = img.getBoundingClientRect();
        const parent = img.closest('.content') || document.body;
        const parentRect = parent.getBoundingClientRect();
        // Image is ~64px height, expanded 7.5x is 480px.
        // Center origin grows ~208px upwards.
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

            // If already expanded, we assume user wants to close/shrink it.
            // We set a 'force-closed' flag to temporarily suppress hover expansion
            // until the mouse leaves.
            if (this.classList.contains('expanded')) {
                this.classList.remove('expanded');
                this.dataset.forceClose = 'true';
            } else {
                applyDynamicOrigin(this);
                this.classList.add('expanded');
                this.dataset.forceClose = 'false';
            }
        });

        img.addEventListener('mouseenter', function (e) {
            // Only expand if we haven't explicitly force-closed it during this hover session
            if (this.dataset.forceClose !== 'true') {
                applyDynamicOrigin(this);
                this.classList.add('expanded');
            }
        });

        img.addEventListener('mouseleave', function (e) {
            // Reset state
            this.classList.remove('expanded');
            this.dataset.forceClose = 'false';
        });
    });
});
/* --- Bookmarks Logic --- */
const BOOKMARKS_KEY = 'plugin_jm_bookmarks';

function toggleBookmarks() {
    const backdrop = document.getElementById('bookmarks-backdrop');
    const drawer = document.getElementById('bookmarks-drawer');

    if (drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        backdrop.classList.remove('open');
    } else {
        renderBookmarks();
        drawer.classList.add('open');
        backdrop.classList.add('open');
    }
}

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
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    renderBookmarks();
}

function addCurrentBookmark() {
    const path = getCurPath();
    if (!path) return;

    const bookmarks = getBookmarks();
    // Check if already exists
    const exists = bookmarks.some(b => b.path === path);
    if (exists) {
        alert('当前目录已在收藏夹中！');
        return;
    }

    bookmarks.unshift({
        path: path,
        timestamp: new Date().toISOString()
    });

    saveBookmarks(bookmarks);

    // Suggestion: show a toast or feedback here
    const btn = document.querySelector('.bookmark-add-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = icon('check') + ' 已收藏';
    setTimeout(() => {
        btn.innerHTML = originalText;
    }, 2000);
}

function deleteBookmark(index) {
    if (!confirm('确定要删除这个收藏吗？')) return;

    const bookmarks = getBookmarks();
    bookmarks.splice(index, 1);
    saveBookmarks(bookmarks);
}

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString();
}

function renderBookmarks() {
    const list = document.getElementById('bookmarks-list');
    const emptyState = document.getElementById('bookmarks-empty');
    const bookmarks = getBookmarks();

    list.innerHTML = '';

    if (bookmarks.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    bookmarks.forEach((b, index) => {
        const li = document.createElement('li');
        li.className = 'bookmark-item';
        li.innerHTML = `
            <a href="javascript:" onclick="changeDir('${b.path.replace(/\\/g, '\\\\')}')" class="bookmark-link">
                <div class="bookmark-path" title="${b.path}">${b.path}</div>
                <div class="bookmark-time">
                    ${formatTime(b.timestamp)}
                </div>
            </a>
            <button class="bookmark-delete" onclick="deleteBookmark(${index})" title="删除">
                ${icon('x')}
            </button>
        `;
        list.appendChild(li);
    });
}

// Initial render check? No, only when opened.
