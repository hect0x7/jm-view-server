/* --- Sorting Logic --- */
let currentSort = { column: null, direction: 'asc' };

function parseSize(sizeStr) {
    sizeStr = sizeStr.trim();
    if (sizeStr === '<DIR>') return -1;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const parts = sizeStr.split(' ');
    if (parts.length < 2) return 0;
    const val = parseFloat(parts[0]);
    const unit = parts[1].toUpperCase();
    const power = units.indexOf(unit);
    return power > -1 ? val * Math.pow(1024, power) : 0;
}

function sortTable(col) {
    const listBody = document.querySelector('.file-list-body');
    const rows = Array.from(listBody.querySelectorAll('.file-item'));

    // Toggle direction
    if (currentSort.column === col) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = col;
        currentSort.direction = col === 'date' ? 'desc' : 'asc'; // Default date to desc
    }

    // Update icons
    document.querySelectorAll('.header-col').forEach(el => {
        el.classList.remove('asc', 'desc');
        if (el.dataset.sort === col) {
            el.classList.add(currentSort.direction);
        }
    });

    rows.sort((a, b) => {
        // Always directories on top
        const isDirA = a.dataset.type === 'dir';
        const isDirB = b.dataset.type === 'dir';
        if (isDirA && !isDirB) return -1;
        if (!isDirA && isDirB) return 1;

        if (col === 'name') {
            const valA = a.querySelector('.file-name-col').innerText.trim();
            const valB = b.querySelector('.file-name-col').innerText.trim();
            const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
            return currentSort.direction === 'asc' ? cmp : -cmp;
        }

        let valA, valB;
        if (col === 'size') {
            valA = parseSize(a.querySelector('.size-col').innerText);
            valB = parseSize(b.querySelector('.size-col').innerText);
        } else if (col === 'date') {
            // Replace space with T for better cross-browser compatibility
            const tA = a.querySelector('.date-col').innerText.trim().replace(' ', 'T');
            const tB = b.querySelector('.date-col').innerText.trim().replace(' ', 'T');
            valA = new Date(tA).getTime();
            valB = new Date(tB).getTime();
            if (isNaN(valA)) valA = 0;
            if (isNaN(valB)) valB = 0;
        }

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    rows.forEach(row => listBody.appendChild(row));
}

function openDir(file) {
    file = decodeURIComponent(file);
    fetch(`/open/${encodeURIComponent(file)}`)
        .then(response => response.text())
        .then(data => {
            console.log(data); // Process response
        })
        .catch(error => {
            alert('Error:' + error);
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
                this.classList.add('expanded');
                this.dataset.forceClose = 'false';
            }
        });

        img.addEventListener('mouseenter', function (e) {
            // Only expand if we haven't explicitly force-closed it during this hover session
            if (this.dataset.forceClose !== 'true') {
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
    btn.innerHTML = '<i class="fas fa-check"></i> 已收藏';
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
                    <i class="far fa-clock"></i> ${formatTime(b.timestamp)}
                </div>
            </a>
            <button class="bookmark-delete" onclick="deleteBookmark(${index})" title="删除">
                <i class="fas fa-times"></i>
            </button>
        `;
        list.appendChild(li);
    });
}

// Initial render check? No, only when opened.
