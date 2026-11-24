var browserConfig = JSON.parse(document.getElementById('browserConfig').textContent);
// ========== 面包屑手输跳转逻辑 ==========
var crumbsNavigating = false;
var crumbsBlurTimer = null;
function enablePathEdit() {
    var crumbsView = document.getElementById('crumbsView');
    var crumbsInput = document.getElementById('crumbsInput');
    if (crumbsView && crumbsInput) {
        if (crumbsBlurTimer) { clearTimeout(crumbsBlurTimer); crumbsBlurTimer = null; }
        crumbsNavigating = false;
        crumbsView.style.display = 'none';
        crumbsInput.style.display = 'block';
        crumbsInput.value = document.getElementById('currentPathText').getAttribute('data-path') || '';
        crumbsInput.focus();
        crumbsInput.select();
    }
}
function hidePathEdit(restoreFocus) {
    if (crumbsBlurTimer) { clearTimeout(crumbsBlurTimer); crumbsBlurTimer = null; }
    if (crumbsNavigating) return;
    var crumbsView = document.getElementById('crumbsView');
    var crumbsInput = document.getElementById('crumbsInput');
    if (crumbsView && crumbsInput) {
        crumbsView.style.display = 'flex';
        crumbsInput.style.display = 'none';
        if (restoreFocus && crumbsView.focus) crumbsView.focus({ preventScroll: true });
    }
}
function disablePathEdit() {
    if (crumbsBlurTimer) clearTimeout(crumbsBlurTimer);
    crumbsBlurTimer = setTimeout(function() { hidePathEdit(false); }, 120);
}
function handleCrumbsKey(event) {
    if (event.key === 'Enter') {
        var path = event.target.value.trim();
        if (path) {
            crumbsNavigating = true;
            changeDir(path);
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        hidePathEdit(true);
    }
}
window.enablePathEdit = enablePathEdit;
window.disablePathEdit = disablePathEdit;
window.handleCrumbsKey = handleCrumbsKey;

// 注入 App Shell（侧栏 + 移动底栏）
renderShell('files');

// 注入图标（仅当模板无 SVG 兜底且图标库返回非空时注入，避免刷新异常清空可见图标）
function ensureIcon(id, name, fallbackSvg) {
    var el = document.getElementById(id);
    if (!el || el.querySelector('svg')) return;
    var markup = (name && typeof icon === 'function') ? icon(name) : '';
    if (!markup && fallbackSvg) markup = fallbackSvg;
    if (markup) el.innerHTML = markup;
}
ensureIcon('netIco', 'network');
ensureIcon('copyIco', 'copy');
ensureIcon('backIco', 'arrowUp');
ensureIcon('openCurIco', 'folderOpen');
ensureIcon('homeIco', 'home');
ensureIcon('starIco', 'folderBookmark');
ensureIcon('uploadIco', 'upload');
ensureIcon('to-top', 'arrowUp');
ensureIcon('drawerStarIco', 'folderBookmark');
ensureIcon('bookmarkPlusIco', 'folderPlus');
ensureIcon('crumbs-home', 'folder');
ensureIcon('segList', 'list');
ensureIcon('segGrid', 'grid');
ensureIcon('segColumn', 'columns');
ensureIcon('mkdirIco', 'folderPlus');
ensureIcon('selectIco', 'check');
ensureIcon('filterIco', 'search');
ensureIcon('recentIco', 'history');

// 每行与卡片“更多操作”按钮的三点图标（保留已有 SVG 兜底）
document.querySelectorAll('.more-ico').forEach(function(el) {
    if (el.querySelector('svg')) return;
    var markup = icon('more');
    if (markup) el.innerHTML = markup;
});

// 高亮当前所在驱动器
(function highlightActiveDriver() {
    var cur = (typeof getCurPath === 'function' ? getCurPath() : '').replace(/\\/g, '/').toLowerCase();
    if (!cur) return;
    var best = null, bestLen = -1;
    document.querySelectorAll('.driver-pill').forEach(function(pill) {
        var loc = (pill.getAttribute('location') || '').replace(/\\/g, '/').toLowerCase();
        if (!loc) return;
        var norm = loc.replace(/\/+$/, '');
        var matches = cur === norm || cur === loc || cur.indexOf(norm + '/') === 0 || (norm === '' && cur.indexOf('/') === 0);
        if (matches && loc.length > bestLen) { best = pill; bestLen = loc.length; }
    });
    if (best) best.classList.add('is-active');
})();

// 文件类型由模板写入 data 属性，列表、网格和快捷方式徽标统一初始化。
document.querySelectorAll('[data-browser-icon]').forEach(function(el) {
    var iconName = el.dataset.browserIcon;
    if (iconName === 'auto') iconName = isImageName(el.dataset.fileName || '') ? 'images' : 'file';
    var markup = icon(iconName);
    if (!el.querySelector('svg') && markup) el.innerHTML = markup;
    if (el.classList.contains('grid-icon')) {
        var svg = el.querySelector('svg');
        if (svg) {
            svg.style.width = '13.5px';
            svg.style.height = '13.5px';
            svg.style.strokeWidth = '2';
        }
    }
});

// 视图切换（list / grid / column）——选择记忆到 localStorage['jmv-view']，进入时恢复。
var VIEW_KEY = 'jmv-view';
var thumbnailObserver = null;

function loadThumbWithFade(img) {
    if (!img || img.getAttribute('src')) return;
    img.classList.add('thumb-loading');
    var onDone = function() {
        img.classList.remove('thumb-loading');
        img.classList.add('thumb-loaded');
    };
    img.addEventListener('load', onDone, { once: true });
    img.addEventListener('error', onDone, { once: true });
    img.src = img.dataset.thumbSrc;
    if (img.complete && img.naturalWidth > 0) onDone();
}

if ('IntersectionObserver' in window) {
    thumbnailObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(function(entry) {
            if (!entry.isIntersecting) return;
            var img = entry.target;
            loadThumbWithFade(img);
            observer.unobserve(img);
        });
    }, { rootMargin: '240px 0px' });
}

function activateViewThumbnails(mode) {
    document.querySelectorAll('img[data-thumb-src]').forEach(function(img) {
        var shouldLoad = (mode === 'list' && !!img.closest('.list-view')) ||
            (mode === 'grid' && !!img.closest('.grid-view'));
        if (!shouldLoad || img.getAttribute('src')) return;
        if (thumbnailObserver) thumbnailObserver.observe(img);
        else loadThumbWithFade(img);
    });
}

function applyView(mode) {
    var app = document.getElementById('app');
    var isGrid = (mode === 'grid');
    var isColumn = (mode === 'column');
    if (isColumn && typeof selectMode !== 'undefined' && selectMode && typeof toggleSelectMode === 'function') {
        toggleSelectMode();
    }
    app.classList.toggle('grid-mode', isGrid);
    app.classList.toggle('column-mode', isColumn);
    if (window.JmvColumnView) {
        if (isColumn) window.JmvColumnView.activate();
        else window.JmvColumnView.deactivate();
    }
    document.querySelectorAll('#seg button').forEach(function(x) {
        var selected = x.dataset.v === mode;
        x.classList.toggle('on', selected);
        x.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    activateViewThumbnails(mode);
}
var columnOperationsToggle = document.getElementById('columnOperationsToggle');
function renderColumnOperations(value) {
    var visible = value !== false;
    columnOperationsToggle.setAttribute('aria-checked', visible ? 'true' : 'false');
    if (window.JmvColumnView) window.JmvColumnView.setOperationsVisible(visible);
}
columnOperationsToggle.addEventListener('click', function() {
    var visible = columnOperationsToggle.getAttribute('aria-checked') !== 'true';
    if (window.JmvPrefs) window.JmvPrefs.set('browserOperations', visible);
    else renderColumnOperations(visible);
});
window.addEventListener('jmv:preference-change', function(event) {
    if (event.detail && event.detail.name === 'browserOperations') renderColumnOperations(event.detail.value);
});
window.addEventListener('storage', function(event) {
    if (event.key === 'jmv-browser-operations') renderColumnOperations(event.newValue !== '0' && event.newValue !== 'false');
});
document.getElementById('seg').addEventListener('click', function(e) {
    var b = e.target.closest('button');
    if (!b) return;
    try { localStorage.setItem(VIEW_KEY, b.dataset.v); } catch (e) {}
    applyView(b.dataset.v);
});
// 恢复上次视图（默认 list）
var savedView = (function(){ try { return localStorage.getItem(VIEW_KEY); } catch(e){ return null; } })() || 'list';
applyView(['list', 'grid', 'column'].indexOf(savedView) >= 0 ? savedView : 'list');
renderColumnOperations(window.JmvPrefs ? window.JmvPrefs.get('browserOperations') : true);

// 列边界拖动在相邻两列间分配宽度，表头与所有行共用 CSS 变量。
// 文件名使用剩余空间；固定列宽记入 localStorage['jmv-cols']。
(function() {
    var listView = document.querySelector('.list-view');
    if (!listView) return;
    var COLS_KEY = 'jmv-cols';
    var VARS = { size: '--col-size', date: '--col-date', action: '--col-action', preview: '--col-preview' };
    var MINW = { name: 120, size: 70, date: 110, action: 92, preview: 60 };
    var LEFT = { size: 'name', date: 'size', action: 'date', preview: 'action' };
    var INDEX = { name: 0, size: 1, date: 2, action: 3, preview: 4 };
    // 恢复记忆
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(COLS_KEY)) || {}; } catch (e) {}
    Object.keys(VARS).forEach(function(c) {
        if (saved[c]) listView.style.setProperty(VARS[c], saved[c] + 'px');
    });
    function persist() {
        var out = {};
        Object.keys(VARS).forEach(function(c) {
            var v = listView.style.getPropertyValue(VARS[c]).trim();
            if (v) out[c] = parseInt(v, 10);
        });
        try { localStorage.setItem(COLS_KEY, JSON.stringify(out)); } catch (e) {}
    }
    var drag = null;
    var suppressSortUntil = 0;
    var resizeRaf = 0;
    var pendingX = 0;
    function applyResizeFrame() {
        resizeRaf = 0;
        if (!drag) return;
        var delta = Math.max(MINW[drag.left] - drag.leftWidth,
            Math.min(drag.rightWidth - MINW[drag.right], pendingX - drag.startX));
        if (drag.left !== 'name') listView.style.setProperty(VARS[drag.left], (drag.leftWidth + delta) + 'px');
        listView.style.setProperty(VARS[drag.right], (drag.rightWidth - delta) + 'px');
    }
    function endResize() {
        if (!drag) return;
        if (resizeRaf) {
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(resizeRaf);
            applyResizeFrame();
        }
        suppressSortUntil = Date.now() + 400;
        document.querySelectorAll('.col-resizer.dragging').forEach(function(x){ x.classList.remove('dragging'); });
        if (listView.classList) listView.classList.remove('is-resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        drag = null;
        persist();
    }
    // 浏览器可能将拖动后的 click 发给手柄或它与释放位置的共同表头。
    window.addEventListener('mousedown', function() { suppressSortUntil = 0; }, true);
    window.addEventListener('click', function(e) {
        var onHandle = e.target.closest && e.target.closest('.col-resizer');
        var header = listView.querySelector('.file-list-header');
        var afterDrag = e.detail !== 0 && Date.now() < suppressSortUntil && header.contains(e.target);
        suppressSortUntil = 0;
        if (!onHandle && !afterDrag) return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);
    document.querySelectorAll('.col-resizer').forEach(function(rz) {
        rz.addEventListener('mousedown', function(e) {
            e.preventDefault(); e.stopPropagation();
            suppressSortUntil = 0;
            var right = rz.dataset.col;
            var left = LEFT[right];
            var cells = listView.querySelectorAll('.file-list-header > div');
            drag = {
                left: left, right: right, startX: e.clientX,
                leftWidth: cells[INDEX[left]].getBoundingClientRect().width,
                rightWidth: cells[INDEX[right]].getBoundingClientRect().width
            };
            rz.classList.add('dragging');
            if (listView.classList) listView.classList.add('is-resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
        rz.addEventListener('dblclick', function(e) {
            e.preventDefault(); e.stopPropagation();
            Object.keys(VARS).forEach(function(c) { listView.style.removeProperty(VARS[c]); });
            try { localStorage.removeItem(COLS_KEY); } catch (err) {}
            if (window.toast) toast('已恢复默认列宽', 'success');
        });
    });
    window.addEventListener('mousemove', function(e) {
        if (!drag) return;
        pendingX = e.clientX;
        if (typeof requestAnimationFrame === 'function') {
            if (!resizeRaf) resizeRaf = requestAnimationFrame(applyResizeFrame);
        } else {
            applyResizeFrame();
        }
    });
    window.addEventListener('mouseup', endResize);
    window.addEventListener('blur', endResize);
})();

// 给列表/网格视图的删除按钮注入 trash 图标（用内置 SVG，不依赖 FontAwesome）
document.querySelectorAll('.delete-btn').forEach(function(btn) {
    btn.innerHTML = icon('trash');
});

// 移入回收站：按浏览器偏好决定是否确认，结果用统一 toast() 反馈。
var deleteConfirmState = { resolve: null, lastFocus: null, busy: false };
var recycleInProgress = false;
window.JmvRecyclePending = [];
var deleteConfirmOverlay = document.getElementById('deleteConfirmOverlay');
var deleteConfirmCancel = document.getElementById('deleteConfirmCancel');
var deleteConfirmSubmit = document.getElementById('deleteConfirmSubmit');
document.getElementById('deleteConfirmIcon').innerHTML = icon('trash');

function setDeleteConfirmBusy(busy) {
    deleteConfirmState.busy = busy;
    deleteConfirmOverlay.setAttribute('aria-busy', String(busy));
    deleteConfirmCancel.disabled = busy;
    deleteConfirmSubmit.disabled = busy;
    deleteConfirmSubmit.classList.toggle('is-recycling', busy);
    if (busy) deleteConfirmSubmit.textContent = '正在移入回收站…';
}

function closeDeleteConfirm(confirmed) {
    if (!deleteConfirmOverlay.classList.contains('open') || deleteConfirmState.busy) return;
    var resolve = deleteConfirmState.resolve;
    deleteConfirmState.resolve = null;
    if (confirmed && resolve) {
        setDeleteConfirmBusy(true);
        resolve(true);
        return;
    }
    deleteConfirmOverlay.classList.remove('open');
    deleteConfirmOverlay.setAttribute('aria-hidden', 'true');
    var lastFocus = deleteConfirmState.lastFocus;
    deleteConfirmState.lastFocus = null;
    if (resolve) resolve(false);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

function openDeleteConfirm(options) {
    closeDeleteConfirm(false);
    if (!JmvPrefs.get('confirmRecycle')) return Promise.resolve(true);
    document.getElementById('deleteConfirmTitle').textContent = options.title;
    document.getElementById('deleteConfirmMessage').textContent = options.message;
    deleteConfirmSubmit.hidden = false;
    deleteConfirmSubmit.textContent = options.confirmText || '移入回收站';
    deleteConfirmCancel.textContent = '取消';
    deleteConfirmState.lastFocus = options.trigger || document.activeElement;
    deleteConfirmOverlay.classList.add('open');
    deleteConfirmOverlay.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(function() { deleteConfirmCancel.focus(); });
    return new Promise(function(resolve) { deleteConfirmState.resolve = resolve; });
}

deleteConfirmCancel.addEventListener('click', function() { closeDeleteConfirm(false); });
deleteConfirmSubmit.addEventListener('click', function() { closeDeleteConfirm(true); });
deleteConfirmOverlay.addEventListener('click', function(event) {
    if (event.target === deleteConfirmOverlay) closeDeleteConfirm(false);
});
document.addEventListener('keydown', function(event) {
    if (!deleteConfirmOverlay.classList.contains('open')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeDeleteConfirm(false);
        return;
    }
    if (event.key !== 'Tab') return;
    if (deleteConfirmState.busy) { event.preventDefault(); return; }
    var first = deleteConfirmCancel;
    var last = deleteConfirmSubmit.hidden ? first : deleteConfirmSubmit;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

function setRecycleItemPending(item, busy) {
    item.classList.toggle('is-recycling', busy);
    item.setAttribute('aria-busy', String(busy));
    item.inert = busy;
    var status = item.querySelector('.recycle-status');
    if (busy && !status) {
        status = document.createElement('span');
        status.className = 'recycle-status';
        status.setAttribute('role', 'status');
        status.textContent = '正在移入回收站…';
        item.appendChild(status);
    } else if (!busy && status) status.remove();
}
window.setRecycleItemPending = setRecycleItemPending;

function recycleItems(paths) {
    var items = [];
    document.querySelectorAll('.file-item, .column-entry').forEach(function(item) {
        var checkbox = item.querySelector('.row-select');
        var path = checkbox ? decodeURIComponent(checkbox.dataset.path) : item.dataset.managePath;
        if (paths.indexOf(path) !== -1) items.push(item);
    });
    return items;
}

function setRecyclePending(paths, busy) {
    window.JmvRecyclePending = busy ? paths.slice() : [];
    recycleItems(paths).forEach(function(item) { setRecycleItemPending(item, busy); });
    var button = document.getElementById('batchDeleteButton');
    button.disabled = busy;
    button.classList.toggle('is-recycling', busy);
    button.textContent = busy ? '正在移入回收站…' : '批量移入回收站';
}

function focusAfterRemoval(targets) {
    if (!targets || !targets.length) return;
    var active = document.activeElement;
    var activeLost = !active || targets.some(function(el) { return el === active || (el.contains && el.contains(active)); });
    if (!activeLost) return;
    var removedSet = new Set(targets);
    var first = targets[0];
    var container = first && first.parentElement;
    var nextFocus = null;
    if (container && container.querySelectorAll) {
        var siblings = Array.from(container.querySelectorAll('.file-item'));
        var idx = siblings.indexOf(first);
        for (var i = idx + 1; i < siblings.length; i++) {
            if (!removedSet.has(siblings[i]) && (!siblings[i].style || siblings[i].style.display !== 'none')) {
                nextFocus = siblings[i].querySelector('a.file-link, a.card-name-link, .more-btn');
                if (nextFocus) break;
            }
        }
        if (!nextFocus) {
            for (var j = idx - 1; j >= 0; j--) {
                if (!removedSet.has(siblings[j]) && (!siblings[j].style || siblings[j].style.display !== 'none')) {
                    nextFocus = siblings[j].querySelector('a.file-link, a.card-name-link, .more-btn');
                    if (nextFocus) break;
                }
            }
        }
    }
    var fallback = nextFocus || document.getElementById('fileFilter') || document.getElementById('btn-back');
    if (fallback && fallback.focus) fallback.focus({ preventScroll: true });
}

function removeRecycledItems(paths) {
    var targets = recycleItems(paths);
    var animate = typeof setTimeout === 'function' && typeof window.getComputedStyle === 'function' &&
        !(window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion());
    if (animate && targets.length) {
        focusAfterRemoval(targets);
        targets.forEach(function(item) {
            var cb = item.querySelector('.row-select');
            if (cb) cb.checked = false;
            item.inert = true;
            item.classList.add('is-removing');
        });
        if (window.JmvColumnView) JmvColumnView.removePaths(paths);
        updateBatchCount();
        setTimeout(function() {
            targets.forEach(function(item) { item.remove(); });
            updateBatchCount();
            var filter = document.getElementById('fileFilter');
            if (filter) filter.dispatchEvent(new Event('input'));
        }, 180);
        return;
    }
    focusAfterRemoval(targets);
    targets.forEach(function(item) { item.remove(); });
    if (window.JmvColumnView) JmvColumnView.removePaths(paths);
    updateBatchCount();
    document.getElementById('fileFilter').dispatchEvent(new Event('input'));
}

function requestRecycle(paths, batch) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', batch ? '/api/batch_delete' : '/api/delete', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onload = function() {
            var result;
            try { result = JSON.parse(xhr.responseText); }
            catch (error) { reject(new Error('服务器返回了无法识别的结果，请刷新确认文件状态')); return; }
            if (xhr.status !== 200) { reject(new Error((result && result.error) || '移入回收站失败')); return; }
            if (!result || result.status !== 'ok') {
                reject(new Error('服务器未确认操作成功，请刷新确认文件状态')); return;
            }
            if (batch && (!Array.isArray(result.succeeded) || !Array.isArray(result.failed))) {
                reject(new Error('服务器返回了无法识别的结果，请刷新确认文件状态')); return;
            }
            resolve(batch ? result : { succeeded: paths, failed: [] });
        };
        xhr.onerror = function() { reject(new Error('连接中断，请刷新确认文件状态')); };
        xhr.onabort = function() { reject(new Error('请求中断，请刷新确认文件状态')); };
        xhr.send(batch ? 'paths=' + encodeURIComponent(paths.join('\n')) : 'path=' + encodeURIComponent(paths[0]));
    });
}

function recyclePaths(paths, options, batch) {
    if (recycleInProgress) { toast('已有项目正在处理，请稍候', 'info'); return; }
    recycleInProgress = true;
    openDeleteConfirm(options).then(function(confirmed) {
        if (!confirmed) { recycleInProgress = false; return; }
        var succeededPaths = [];
        setRecyclePending(paths, true);
        return requestRecycle(paths, batch).then(function(result) {
            succeededPaths = result.succeeded || [];
            removeRecycledItems(succeededPaths);
            if (result.failed.length) {
                throw new Error('已移入回收站 ' + result.succeeded.length + ' 项，失败 ' + result.failed.length +
                    ' 项。' + result.failed.map(function(item) { return item.error; }).join('；'));
            }
            setDeleteConfirmBusy(false);
            closeDeleteConfirm(false);
            toast(batch ? '已移入回收站 ' + result.succeeded.length + ' 项' :
                '已移入回收站 “' + options.fileName + '”', 'success');
        }).catch(function(error) {
            setDeleteConfirmBusy(false);
            if (deleteConfirmOverlay.classList.contains('open')) {
                document.getElementById('deleteConfirmTitle').textContent = '移入回收站未全部完成';
                document.getElementById('deleteConfirmMessage').textContent = error.message;
                deleteConfirmSubmit.hidden = true;
                deleteConfirmCancel.textContent = '关闭';
                deleteConfirmCancel.focus();
            }
            toast(error.message, 'error');
        }).finally(function() {
            var remaining = paths.filter(function(p) { return succeededPaths.indexOf(p) === -1; });
            if (remaining.length) setRecyclePending(remaining, false);
            else {
                var button = document.getElementById('batchDeleteButton');
                if (button) {
                    button.classList.remove('is-recycling');
                    button.textContent = '批量移入回收站';
                    button.disabled = selectedPaths().length === 0;
                }
            }
            recycleInProgress = false;
        });
    });
}

function deleteItem(event, quotedPath, fileName) {
    event.stopPropagation();
    event.preventDefault();
    var trigger = event.currentTarget;
    var moreMenu = trigger.closest('.more-menu');
    if (moreMenu) trigger = moreMenu.querySelector('.more-btn') || trigger;
    recyclePaths([decodeURIComponent(quotedPath)], {
        title: '将此项目移入回收站？',
        message: '“' + fileName + '”将移入服务器电脑的回收站。',
        confirmText: '移入回收站',
        fileName: fileName,
        trigger: trigger
    }, false);
}
window.deleteItem = deleteItem;


/* ========== 打包下载 / 文件管理 / 批量 ========== */

// 小工具：POST 表单并返回 Promise，供站内弹窗展示加载态和内联报错
function postFormRequest(url, params) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onload = function() {
            var data = {};
            try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
            if (xhr.status === 200) {
                resolve(data);
            } else {
                reject(new Error((data && data.error) || '操作失败，请重试'));
            }
        };
        xhr.onerror = function() { reject(new Error('网络连接中断，请重试')); };
        var body = Object.keys(params).map(function(k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');
        xhr.send(body);
    });
}

// 小工具：POST 表单，成功 toast + 刷新，失败 toast 报错。
var actionBusy = false;
function postAndReload(url, params, okMsg) {
    if (actionBusy) { toast('正在处理上一项操作，请稍候', 'info'); return Promise.reject(new Error('busy')); }
    actionBusy = true;
    return postFormRequest(url, params).then(function(data) {
        toast(okMsg, 'success');
        setTimeout(function() { window.location.reload(); }, 450);
        return data;
    }).catch(function(err) {
        actionBusy = false;
        toast('操作失败：' + (err && err.message ? err.message : '请重试'), 'error');
        throw err;
    });
}

// 打包下载：单次安全解码并沿用浏览器原生流式下载（避免二次解码 % 报错及大压缩包吃满内存）
function downloadZip(quotedPath) {
    var p;
    try { p = decodeURIComponent(quotedPath); }
    catch (err) { p = String(quotedPath || ''); }
    var url = '/api/download_zip?path=' + encodeURIComponent(p);
    if (window.toast) toast('正在开始打包下载…', 'info');
    var a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return Promise.resolve(true);
}
window.downloadZip = downloadZip;

// 重命名：统一使用站内输入弹窗（自动选中主干名、防重提交、失败保留输入、准确回焦到可见触发按钮）
function renameItem(quotedPath, oldName, opener) {
    var p = decodeURIComponent(quotedPath);
    if (!window.JmvModal) return;
    JmvModal.prompt({
        title: '重命名',
        description: '请输入新的名称',
        defaultValue: oldName,
        placeholder: '输入新名称',
        confirmText: '保存名称',
        busyText: '正在重命名…',
        selectStem: true,
        opener: opener,
        validate: function(val) {
            if (!val) return '名称不能为空';
            if (/[\\/]/.test(val)) return '名称中不能包含斜杠 / 或 \\';
            return '';
        },
        onConfirm: function(newName) {
            if (newName === oldName) return true;
            return postFormRequest('/api/rename', { path: p, new_name: newName }).then(function() {
                toast('已重命名为 “' + newName + '”', 'success');
                setTimeout(function() { window.location.reload(); }, 450);
                return true;
            });
        }
    });
}
window.renameItem = renameItem;

// 移动到其它目录：弹浮层列出可移入的目标（当前目录下的子文件夹 + 上级目录），
// 目标从页面已渲染的目录项收集（纯前端，不发额外请求），点选即 POST /api/move。
var moveSrcPath = null;   // 待移动项的解码后绝对路径
var moveBusy = false;
var moveOpener = null;
function moveItem(quotedPath, name, options) {
    options = options || {};
    moveSrcPath = decodeURIComponent(quotedPath);
    moveBusy = false;
    moveOpener = (options.opener && options.opener.isConnected) ? options.opener : document.activeElement;
    document.getElementById('moveSub').textContent = '把 “' + name + '” 移动到：';

    // 收集目标目录：当前目录下的子文件夹（排除自身），来自已渲染的列表项
    var targets = Array.isArray(options.targets) ? options.targets.slice() : [];
    if (!Array.isArray(options.targets)) {
        document.querySelectorAll('.list-view .file-item[data-type="dir"]').forEach(function(item) {
            var a = item.querySelector('a.file-link');
            if (!a) return;
            var p = decodeURIComponent(a.getAttribute('path') || '');
            var nm = a.getAttribute('dirname') || a.textContent.trim();
            if (p && p !== moveSrcPath) targets.push({ path: p, name: nm });
        });
    }
    // 加“上级目录”作为目标（移出当前目录）
    var cur = options.currentPath || getCurPath();
    var defaultPath = browserConfig.defaultPath.replace(/\\/g, '/');
    var curNorm = cur.replace(/\/+$/, '');
    var defNorm = defaultPath.replace(/\/+$/, '');
    var parent = curNorm.replace(/\/[^\/]+$/, '') || '/';
    if (parent && parent !== curNorm && curNorm !== defNorm) {
        targets.unshift({ path: parent, name: '.. 上级目录 (' + parent + ')', isParent: true });
    }

    var list = document.getElementById('moveList');
    list.innerHTML = '';
    if (!targets.length) {
        list.innerHTML = '<div class="move-empty">当前目录没有可移入的子文件夹</div>';
    } else {
        targets.forEach(function(t) {
            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'move-target';
            row.innerHTML = icon('folder') + '<span class="mt-name"></span>';
            row.querySelector('.mt-name').textContent = t.name;
            row.onclick = function() { doMove(t.path, row); };
            list.appendChild(row);
        });
    }
    var footer = document.querySelector('#moveOverlay .move-footer');
    var statusEl = document.getElementById('moveStatus');
    if (statusEl) statusEl.remove();
    var cancelBtn = footer && footer.querySelector('button');
    if (cancelBtn) cancelBtn.disabled = false;
    var overlay = document.getElementById('moveOverlay');
    overlay.classList.add('open');
    var firstTarget = list.querySelector('.move-target') || cancelBtn;
    if (firstTarget) firstTarget.focus({ preventScroll: true });
}
function doMove(dstDir, triggerBtn) {
    if (moveBusy) return;
    moveBusy = true;
    var overlay = document.getElementById('moveOverlay');
    var buttons = overlay.querySelectorAll('button');
    buttons.forEach(function(b) { b.disabled = true; });
    var footer = overlay.querySelector('.move-footer');
    var statusEl = document.getElementById('moveStatus');
    if (!statusEl && footer) {
        statusEl = document.createElement('span');
        statusEl.id = 'moveStatus';
        statusEl.className = 'move-status';
        footer.insertBefore(statusEl, footer.firstChild);
    }
    if (statusEl) statusEl.textContent = '正在移动…';
    postFormRequest('/api/move', { src: moveSrcPath, dst_dir: dstDir }).then(function() {
        moveBusy = false;
        closeMove();
        toast('已移动到目标目录', 'success');
        setTimeout(function() { window.location.reload(); }, 450);
    }).catch(function(err) {
        moveBusy = false;
        buttons.forEach(function(b) { b.disabled = false; });
        if (statusEl) statusEl.textContent = '';
        toast('移动失败：' + (err && err.message ? err.message : '请重试'), 'error');
        if (triggerBtn && triggerBtn.focus) triggerBtn.focus({ preventScroll: true });
    });
}
function closeMove() {
    if (moveBusy) return;
    var overlay = document.getElementById('moveOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    if (moveOpener && moveOpener.isConnected && moveOpener.focus) moveOpener.focus({ preventScroll: true });
    moveOpener = null;
}
// 点遮罩空白处关闭
document.getElementById('moveOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeMove();
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeMove();
});
window.moveItem = moveItem;
window.closeMove = closeMove;

function closeAllMoreMenus() {
    document.querySelectorAll('.more-menu.open').forEach(function(m) {
        m.classList.remove('open', 'open-up');
        var btn = m.querySelector('.more-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        var card = m.closest('.card-item');
        if (card) card.classList.remove('has-open-menu');
    });
}

// 更多操作下拉：点击切换本行/卡片菜单，同时探测视口底部防裁切；点选项/外部/Esc 收起。
function toggleMoreMenu(e, btn) {
    e.stopPropagation();
    var menu = btn.closest('.more-menu');
    var isOpen = menu.classList.contains('open');
    closeAllMoreMenus();
    if (!isOpen) {
        var rect = btn.getBoundingClientRect();
        var dropdown = menu.querySelector('.more-dropdown');
        var estimatedHeight = dropdown ? Math.max(dropdown.scrollHeight, 180) : 200;
        var spaceBelow = window.innerHeight - rect.bottom - 16;
        if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
            menu.classList.add('open-up');
        }
        menu.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        var card = menu.closest('.card-item');
        if (card) card.classList.add('has-open-menu');
    }
}
window.toggleMoreMenu = toggleMoreMenu;
// 委派处理“更多操作”下拉项（通过 data-* 传参，彻底避免文件名含引号导致的语法断裂或 XSS，并保留可见 .more-btn 作为回焦锚点）
document.addEventListener('click', function(e) {
    var moreItem = e.target.closest('.more-item');
    if (moreItem) {
        var action = moreItem.dataset.moreAction;
        var menu = moreItem.closest('.more-menu');
        var openerBtn = menu ? menu.querySelector('.more-btn') : null;
        if (action) {
            e.preventDefault();
            e.stopPropagation();
            closeAllMoreMenus();
            var path = moreItem.dataset.path || '';
            var managePath = moreItem.dataset.managePath || '';
            var name = moreItem.dataset.name || '';
            if (action === 'download') downloadZip(path);
            else if (action === 'rename') renameItem(managePath, name, openerBtn);
            else if (action === 'move') moveItem(managePath, name, { opener: openerBtn });
            else if (action === 'reveal') openDir(path);
            else if (action === 'delete') {
                deleteItem({
                    stopPropagation: function() {},
                    preventDefault: function() {},
                    currentTarget: openerBtn || moreItem
                }, managePath, name);
            }
            return;
        }
        closeAllMoreMenus();
        return;
    }
    if (!e.target.closest('.more-menu')) {
        closeAllMoreMenus();
    }
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeAllMoreMenus();
});

// 新建文件夹：统一使用站内输入弹窗
function createFolder() {
    if (!window.JmvModal) return;
    JmvModal.prompt({
        title: '新建文件夹',
        description: '将在当前目录中创建文件夹',
        icon: 'folderPlus',
        defaultValue: '新建文件夹',
        placeholder: '输入文件夹名称',
        confirmText: '创建',
        busyText: '正在创建…',
        validate: function(val) {
            if (!val) return '文件夹名称不能为空';
            if (/[\\/]/.test(val)) return '名称中不能包含斜杠 / 或 \\';
            return '';
        },
        onConfirm: function(name) {
            return postFormRequest('/api/mkdir', { parent: getCurPath(), name: name }).then(function() {
                toast('已创建 “' + name + '”', 'success');
                setTimeout(function() { window.location.reload(); }, 450);
                return true;
            });
        }
    });
}
window.createFolder = createFolder;

// 多选模式：切换复选框显示 + 批量操作栏
var selectMode = false;
function isFileItemAction(target) {
    return Boolean(target.closest('a, button, input, select, textarea, label, .col-resizer, .more-menu'));
}

function toggleFileItemSelection(item) {
    var checkbox = item.querySelector('.row-select');
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
}

function handleFileItemClick(event, item) {
    if (isFileItemAction(event.target)) return;
    if (selectMode) {
        event.preventDefault();
        toggleFileItemSelection(item);
        return;
    }
    if (item.classList.contains('card-item')) {
        var cardLink = item.querySelector('.card-name-link');
        if (cardLink) cardLink.click();
    }
}
window.handleFileItemClick = handleFileItemClick;

function toggleSelectMode() {
    selectMode = !selectMode;
    document.querySelectorAll('.row-select').forEach(function(cb) {
        cb.style.display = selectMode ? 'inline-block' : 'none';
        if (!selectMode) {
            cb.checked = false;
            var item = cb.closest('.file-item');
            if (item) item.classList.remove('is-selected');
        }
    });
    var bar = document.getElementById('batchBar');
    if (bar) {
        bar.classList.toggle('open', selectMode);
        bar.setAttribute('aria-hidden', String(!selectMode));
    }
    var btn = document.getElementById('selectModeBtn');
    if (btn) {
        btn.classList.toggle('btn-primary', selectMode);
        btn.setAttribute('aria-pressed', String(selectMode));
    }
    updateBatchCount();
}
window.toggleSelectMode = toggleSelectMode;

function isItemVisible(item) {
    if (!item) return true;
    if (item.style && item.style.display === 'none') return false;
    if (item.classList && item.classList.contains('is-removing')) return false;
    return true;
}

function toggleSelectAll() {
    var isGrid = document.getElementById('app').classList.contains('grid-mode');
    var selector = isGrid ? '.grid-view .file-item' : '.list-view .file-item';
    var visiblePathSet = Object.create(null);
    var visibleCount = 0;
    var checkedVisibleCount = 0;
    document.querySelectorAll(selector).forEach(function(item) {
        if (!isItemVisible(item)) return;
        var cb = item.querySelector('.row-select');
        if (!cb || !cb.dataset.path) return;
        visiblePathSet[cb.dataset.path] = true;
        visibleCount++;
        if (cb.checked) checkedVisibleCount++;
    });
    var targetChecked = !(visibleCount > 0 && checkedVisibleCount === visibleCount);
    document.querySelectorAll('.row-select').forEach(function(cb) {
        var encoded = cb.dataset.path;
        var item = cb.closest('.file-item');
        if (visiblePathSet[encoded]) {
            cb.checked = targetChecked;
            if (item) item.classList.toggle('is-selected', targetChecked);
        } else if (cb.checked) {
            cb.checked = false;
            if (item) item.classList.remove('is-selected');
        }
    });
    updateBatchCount();
}
window.toggleSelectAll = toggleSelectAll;

function syncCheckboxPair(encodedPath, checked) {
    document.querySelectorAll('.row-select').forEach(function(cb) {
        if (cb.dataset.path !== encodedPath) return;
        cb.checked = checked;
        var item = cb.closest('.file-item');
        if (item) item.classList.toggle('is-selected', checked);
    });
}

function selectedPaths() {
    var out = [];
    document.querySelectorAll('.row-select:checked').forEach(function(cb) {
        var item = cb.closest ? cb.closest('.file-item') : null;
        if (item && ((item.style && item.style.display === 'none') || (item.classList && item.classList.contains('is-removing')))) return;
        var path = decodeURIComponent(cb.dataset.path);
        if (out.indexOf(path) === -1) out.push(path);
    });
    return out;
}

var lastBatchCount = -1;
function updateBatchCount() {
    var n = selectedPaths().length;
    var el = document.getElementById('batchCount');
    if (el) {
        el.textContent = '已选 ' + n + ' 项';
        if (lastBatchCount >= 0 && lastBatchCount !== n && typeof setTimeout === 'function') {
            el.classList.add('is-bumped');
            setTimeout(function() { el.classList.remove('is-bumped'); }, 170);
        }
    }
    lastBatchCount = n;
    var dlBtn = document.getElementById('batchDownloadButton');
    var delBtn = document.getElementById('batchDeleteButton');
    var busy = delBtn && delBtn.classList.contains('is-recycling');
    if (dlBtn) dlBtn.disabled = n === 0;
    if (delBtn && !busy) delBtn.disabled = n === 0;
    var allBtn = document.getElementById('batchSelectAll');
    if (allBtn) {
        var appEl = document.getElementById('app');
        var isGrid = appEl && appEl.classList.contains('grid-mode');
        var totalVisible = 0;
        document.querySelectorAll(isGrid ? '.grid-view .file-item' : '.list-view .file-item').forEach(function(item) {
            if (item.style && item.style.display === 'none') return;
            if (item.classList && item.classList.contains('is-removing')) return;
            totalVisible++;
        });
        allBtn.textContent = (totalVisible > 0 && n >= totalVisible) ? '取消全选' : '全选';
    }
}
document.addEventListener('change', function(e) {
    if (e.target && e.target.classList.contains('row-select')) {
        syncCheckboxPair(e.target.dataset.path, e.target.checked);
        updateBatchCount();
    }
});

// 批量删除：复用 /api/batch_delete（换行分隔多路径）
function batchDelete() {
    var paths = selectedPaths();
    if (!paths.length) { toast('请先勾选项目', 'error'); return; }
    recyclePaths(paths, {
        title: '移入回收站 ' + paths.length + ' 个项目？',
        message: '选中的文件和文件夹将移入服务器电脑的回收站。',
        confirmText: '移入回收站 ' + paths.length + ' 项',
        trigger: document.activeElement
    }, true);
}
window.batchDelete = batchDelete;

// 批量下载：按去重可见路径逐个打包含图目录，跳过普通文件并明确提示
function batchDownload() {
    var dirPaths = [];
    var skipped = 0;
    var seen = {};
    document.querySelectorAll('.row-select:checked').forEach(function(cb) {
        var item = cb.closest('.file-item');
        if (!isItemVisible(item)) return;
        var encoded = cb.dataset.path;
        if (!encoded || seen[encoded]) return;
        seen[encoded] = true;
        if (item && item.dataset.type === 'dir') {
            dirPaths.push(encoded);
        } else {
            skipped++;
        }
    });
    if (!dirPaths.length) {
        toast(skipped ? '打包下载仅支持文件夹，已跳过所选文件' : '请先勾选要打包的文件夹', 'error');
        return;
    }
    if (skipped > 0) {
        toast('已跳过 ' + skipped + ' 个非文件夹项目，开始打包 ' + dirPaths.length + ' 个目录', 'info');
    }
    dirPaths.forEach(function(encoded, idx) {
        setTimeout(function() { downloadZip(encoded); }, idx * 280);
    });
}
window.batchDownload = batchDownload;

/* ========== 首页搜索/过滤 ========== */
// 纯前端过滤当前已渲染的 .file-item（列表 + 网格视图），优先读取 data-name 避免重复 innerText 重排；
// 筛选隐藏条目时自动取消其选中态，确保批量操作永远只作用于当前可见条目。
(function () {
    var input = document.getElementById('fileFilter');
    var clearBtn = document.getElementById('filterClear');
    if (!input) return;

    function updateEmptyStates(kw, visibleList, visibleGrid) {
        ['List', 'Grid'].forEach(function(view) {
            var hasItems = Boolean(document.querySelector(view === 'List' ? '.list-view .file-item' : '.grid-view .file-item'));
            var empty = document.getElementById('filterEmpty' + view);
            var visible = view === 'List' ? visibleList : visibleGrid;
            if (!empty) return;
            empty.textContent = hasItems ? '没有匹配的文件或文件夹' : '当前目录没有文件或文件夹';
            empty.style.display = (!hasItems || (kw !== '' && visible === 0)) ? 'block' : 'none';
        });
    }

    function applyFilter(isInitial) {
        var kw = input.value.trim().toLowerCase();
        if (clearBtn) clearBtn.hidden = input.value.length === 0;
        if (isInitial && kw === '') {
            var listCount = document.querySelectorAll('.list-view .file-item').length;
            var gridCount = document.querySelectorAll('.grid-view .file-item').length;
            updateEmptyStates('', listCount, gridCount);
            return;
        }
        var visibleList = 0, visibleGrid = 0;
        var selectionChanged = false;
        document.querySelectorAll('.file-item').forEach(function (item) {
            var lower = item.dataset.filterName;
            if (lower === undefined) {
                var raw = item.dataset.name;
                if (!raw) {
                    var nameEl = item.querySelector('.file-name-col');
                    raw = nameEl ? nameEl.textContent : '';
                }
                lower = String(raw || '').trim().toLowerCase();
                item.dataset.filterName = lower;
            }
            var match = kw === '' || lower.indexOf(kw) !== -1;
            var nextDisplay = match ? '' : 'none';
            if (item.style.display !== nextDisplay) item.style.display = nextDisplay;
            if (!match) {
                var cb = item.querySelector('.row-select');
                if (cb && cb.checked) {
                    cb.checked = false;
                    item.classList.remove('is-selected');
                    selectionChanged = true;
                }
            } else {
                if (item.classList.contains('card-item')) visibleGrid++;
                else visibleList++;
            }
        });
        updateEmptyStates(kw, visibleList, visibleGrid);
        if (selectionChanged || document.body.classList.contains('select-mode')) {
            updateBatchCount();
        }
    }

    input.addEventListener('input', function() { applyFilter(false); });
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && input.value) {
            e.preventDefault();
            input.value = '';
            input.dispatchEvent(new Event('input'));
        }
    });
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            input.value = '';
            input.dispatchEvent(new Event('input'));
            input.focus({ preventScroll: true });
        });
    }
    applyFilter(true);
})();

/* ========== 最近浏览历史 ========== */
// 用 localStorage['jmv-recent'] 存最近访问的目录：去重、最新在前、最多 20 条。
var RECENT_KEY = 'jmv-recent';
var RECENT_MAX = 20;

function getRecent() {
    try {
        var v = JSON.parse(localStorage.getItem(RECENT_KEY));
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}

function pushRecent(path) {
    if (!path) return;
    var list = getRecent().filter(function (p) { return p !== path; });
    list.unshift(path);
    if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function renderRecent() {
    var box = document.getElementById('recentList');
    var list = getRecent();
    box.innerHTML = '';
    if (list.length === 0) {
        box.innerHTML = '<div class="recent-empty">还没有浏览记录</div>';
        return;
    }
    list.forEach(function (p) {
        var a = document.createElement('a');
        a.className = 'recent-entry';
        a.href = 'javascript:';
        a.title = p;

        var iconSpan = document.createElement('span');
        iconSpan.className = 'recent-entry-icon';
        iconSpan.innerHTML = (typeof icon === 'function' && icon('folder')) ? icon('folder') : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';

        var textSpan = document.createElement('span');
        textSpan.className = 'recent-entry-text';
        textSpan.textContent = p;

        a.appendChild(iconSpan);
        a.appendChild(textSpan);

        a.addEventListener('click', function () {
            closeRecentPanel(false);
            changeDir(p);
        });
        box.appendChild(a);
    });
}

function closeRecentPanel(restoreFocus) {
    var panel = document.getElementById('recentPanel');
    var btn = document.getElementById('recentBtn');
    if (!panel || !panel.classList.contains('open')) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        if (restoreFocus) btn.focus({ preventScroll: true });
    }
}

function toggleRecent(event) {
    if (event) event.stopPropagation();
    var panel = document.getElementById('recentPanel');
    var btn = document.getElementById('recentBtn');
    if (panel.classList.contains('open')) {
        closeRecentPanel(false);
    } else {
        renderRecent();
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        if (btn) btn.setAttribute('aria-expanded', 'true');
    }
}
window.toggleRecent = toggleRecent;

// 点击面板外部或按 Esc 关闭
document.addEventListener('click', function (e) {
    var wrap = document.querySelector('.recent-wrap');
    if (wrap && !wrap.contains(e.target)) closeRecentPanel(false);
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeRecentPanel(true);
});

// 页面加载即记录当前目录
pushRecent(getCurPath());

// 看本入口也记录一次当前目录（可选项，进入过的目录都能回访）
(function () {
    var _openJmView = window.openJmView;
    if (typeof _openJmView === 'function') {
        window.openJmView = function () {
            pushRecent(getCurPath());
            return _openJmView.apply(this, arguments);
        };
    }
})();

// 原生首屏图片可能早于 defer 脚本失败；就绪后统一补上有界重试。
document.querySelectorAll('[data-system-thumbnail][data-thumbnail-pending]').forEach(function(img) {
    delete img.dataset.thumbnailPending;
    window.JmvRetrySystemThumbnail(img);
});
