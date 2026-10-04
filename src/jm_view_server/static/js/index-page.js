var browserConfig = JSON.parse(document.getElementById('browserConfig').textContent);
// ========== 面包屑手输跳转逻辑 ==========
var crumbsNavigating = false;
function enablePathEdit() {
    var crumbsView = document.getElementById('crumbsView');
    var crumbsInput = document.getElementById('crumbsInput');
    if (crumbsView && crumbsInput) {
        crumbsNavigating = false;
        crumbsView.style.display = 'none';
        crumbsInput.style.display = 'block';
        crumbsInput.value = document.getElementById('currentPathText').getAttribute('data-path') || '';
        crumbsInput.focus();
        crumbsInput.select();
    }
}
function disablePathEdit() {
    setTimeout(function() {
        if (crumbsNavigating) return;
        var crumbsView = document.getElementById('crumbsView');
        var crumbsInput = document.getElementById('crumbsInput');
        if (crumbsView && crumbsInput) {
            crumbsView.style.display = 'flex';
            crumbsInput.style.display = 'none';
        }
    }, 150);
}
function handleCrumbsKey(event) {
    if (event.key === 'Enter') {
        var path = event.target.value.trim();
        if (path) {
            crumbsNavigating = true;
            changeDir(path);
        }
    } else if (event.key === 'Escape') {
        disablePathEdit();
    }
}
window.enablePathEdit = enablePathEdit;
window.disablePathEdit = disablePathEdit;
window.handleCrumbsKey = handleCrumbsKey;

// 注入 App Shell（侧栏 + 移动底栏）
renderShell('files');

// 注入图标（内联 SVG，替代 FontAwesome）
document.getElementById('netIco').innerHTML    = icon('network');
document.getElementById('copyIco').innerHTML   = icon('copy');
document.getElementById('backIco').innerHTML   = icon('arrowUp');
document.getElementById('openCurIco').innerHTML = icon('folderOpen');
document.getElementById('homeIco').innerHTML   = icon('home');
document.getElementById('starIco').innerHTML   = icon('folderBookmark');
document.getElementById('uploadIco').innerHTML = icon('upload');
document.getElementById('to-top').innerHTML  = icon('arrowUp');
document.getElementById('drawerStarIco').innerHTML   = icon('folderBookmark');
document.getElementById('bookmarkPlusIco').innerHTML = icon('folderPlus');
document.getElementById('crumbs-home').innerHTML     = icon('folder');
document.getElementById('segList').innerHTML   = icon('list');
document.getElementById('segGrid').innerHTML   = icon('grid');
document.getElementById('segColumn').innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>';
document.getElementById('mkdirIco').innerHTML  = icon('folderPlus');
document.getElementById('selectIco').innerHTML = icon('check');
// 每行“更多操作”按钮的三点图标（class 批量注入）。模板已有 SVG 时保留它，
// 避免刷新期间共享图标库尚未就绪或返回空值时把可见兜底清空。
document.querySelectorAll('.more-ico').forEach(function(el) {
    if (el.querySelector('svg')) return;
    var markup = icon('more');
    if (markup) el.innerHTML = markup;
});
document.getElementById('filterIco').innerHTML = icon('search');
// 最近按钮用内联时钟图标（icon() 库无 clock，风格对齐现有描边 SVG）
document.getElementById('recentIco').innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

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

if ('IntersectionObserver' in window) {
    thumbnailObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(function(entry) {
            if (!entry.isIntersecting) return;
            var img = entry.target;
            if (!img.getAttribute('src')) img.src = img.dataset.thumbSrc;
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
        else img.src = img.dataset.thumbSrc;
    });
}

function applyView(mode) {
    var app = document.getElementById('app');
    var isGrid = (mode === 'grid');
    var isColumn = (mode === 'column');
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
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
    });
    window.addEventListener('mousemove', function(e) {
        if (!drag) return;
        var delta = Math.max(MINW[drag.left] - drag.leftWidth,
            Math.min(drag.rightWidth - MINW[drag.right], e.clientX - drag.startX));
        if (drag.left !== 'name') listView.style.setProperty(VARS[drag.left], (drag.leftWidth + delta) + 'px');
        listView.style.setProperty(VARS[drag.right], (drag.rightWidth - delta) + 'px');
    });
    window.addEventListener('mouseup', function() {
        if (!drag) return;
        suppressSortUntil = Date.now() + 400;
        document.querySelectorAll('.col-resizer.dragging').forEach(function(x){ x.classList.remove('dragging'); });
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        drag = null;
        persist();
    });
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

function removeRecycledItems(paths) {
    recycleItems(paths).forEach(function(item) { item.remove(); });
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
        setRecyclePending(paths, true);
        return requestRecycle(paths, batch).then(function(result) {
            removeRecycledItems(result.succeeded);
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
            setRecyclePending(paths, false);
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

// 小工具：POST 表单，成功 toast + 刷新，失败 toast 报错。
function postAndReload(url, params, okMsg) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
            toast(okMsg, 'success');
            setTimeout(function() { window.location.reload(); }, 600);
        } else {
            var m = '操作失败';
            try { m += '：' + (JSON.parse(xhr.responseText).error || ''); } catch (e) {}
            toast(m, 'error');
        }
    };
    var body = Object.keys(params).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    xhr.send(body);
}

// 打包下载：直接跳转到 zip 流（浏览器触发下载）
function downloadZip(quotedPath) {
    var p = decodeURIComponent(quotedPath);
    var url = '/api/download_zip?path=' + encodeURIComponent(p);
    // 先探测，若后端报错（空目录/无权限/损坏）用 toast 提示，成功才触发浏览器下载，
    // 避免直接 window.location 在出错时跳到一个 JSON 错误页。
    if (window.toast) toast('正在打包…', 'info');
    fetch(url).then(function (resp) {
        if (!resp.ok) {
            return resp.json().catch(function () { return {}; }).then(function (d) {
                if (window.toast) toast(d.error || '打包失败', 'error');
            });
        }
        return resp.blob().then(function (blob) {
            var a = document.createElement('a');
            var dl = URL.createObjectURL(blob);
            a.href = dl;
            a.download = (decodeURIComponent(p).replace(/\/+$/, '').split('/').pop() || 'download') + '.zip';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(dl); }, 1000);
        });
    }).catch(function () {
        if (window.toast) toast('打包下载失败，请重试', 'error');
    });
}
window.downloadZip = downloadZip;

// 重命名：轻量 prompt 取新名，POST /api/rename
function renameItem(quotedPath, oldName) {
    var p = decodeURIComponent(quotedPath);
    var newName = prompt('重命名为：', oldName);
    if (newName === null) return;
    newName = newName.trim();
    if (!newName || newName === oldName) return;
    postAndReload('/api/rename', { path: p, new_name: newName }, '已重命名为 “' + newName + '”');
}
window.renameItem = renameItem;

// 移动到其它目录：弹浮层列出可移入的目标（当前目录下的子文件夹 + 上级目录），
// 目标从页面已渲染的目录项收集（纯前端，不发额外请求），点选即 POST /api/move。
var moveSrcPath = null;   // 待移动项的解码后绝对路径
function moveItem(quotedPath, name, options) {
    options = options || {};
    moveSrcPath = decodeURIComponent(quotedPath);
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
            var row = document.createElement('div');
            row.className = 'move-target';
            row.innerHTML = icon('folder') + '<span class="mt-name"></span>';
            row.querySelector('.mt-name').textContent = t.name;
            row.onclick = function() { doMove(t.path); };
            list.appendChild(row);
        });
    }
    document.getElementById('moveOverlay').classList.add('open');
}
function doMove(dstDir) {
    closeMove();
    postAndReload('/api/move', { src: moveSrcPath, dst_dir: dstDir }, '已移动');
}
function closeMove() {
    document.getElementById('moveOverlay').classList.remove('open');
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

// 更多操作下拉：点击切换本行菜单，同时收起其它已开的；点选项/点外部/Esc 收起。
function toggleMoreMenu(e, btn) {
    e.stopPropagation();
    var menu = btn.closest('.more-menu');
    var isOpen = menu.classList.contains('open');
    document.querySelectorAll('.more-menu.open').forEach(function(m) { m.classList.remove('open'); });
    if (!isOpen) menu.classList.add('open');
}
window.toggleMoreMenu = toggleMoreMenu;
// 点下拉项后收起菜单（选项自身的 onclick 逻辑照常执行）
document.addEventListener('click', function(e) {
    if (e.target.closest('.more-item')) {
        var m = e.target.closest('.more-menu');
        if (m) m.classList.remove('open');
        return;
    }
    if (!e.target.closest('.more-menu')) {
        document.querySelectorAll('.more-menu.open').forEach(function(m) { m.classList.remove('open'); });
    }
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') document.querySelectorAll('.more-menu.open').forEach(function(m) { m.classList.remove('open'); });
});

// 新建文件夹：在当前目录下创建
function createFolder() {
    var name = prompt('新文件夹名：', '新建文件夹');
    if (name === null) return;
    name = name.trim();
    if (!name) return;
    postAndReload('/api/mkdir', { parent: getCurPath(), name: name }, '已创建 “' + name + '”');
}
window.createFolder = createFolder;

// 多选模式：切换复选框显示 + 批量操作栏
var selectMode = false;
function isFileItemAction(target) {
    return Boolean(target.closest('a, button, input, select, textarea, label, .col-resizer'));
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
    document.getElementById('batchBar').style.display = selectMode ? 'flex' : 'none';
    document.getElementById('selectModeBtn').classList.toggle('btn-primary', selectMode);
    document.getElementById('selectModeBtn').setAttribute('aria-pressed', String(selectMode));
    updateBatchCount();
}
window.toggleSelectMode = toggleSelectMode;

function selectedPaths() {
    var out = [];
    document.querySelectorAll('.row-select:checked').forEach(function(cb) {
        var path = decodeURIComponent(cb.dataset.path);
        if (out.indexOf(path) === -1) out.push(path);
    });
    return out;
}

function updateBatchCount() {
    var n = selectedPaths().length;
    var el = document.getElementById('batchCount');
    if (el) el.textContent = '已选 ' + n + ' 项';
}
document.addEventListener('change', function(e) {
    if (e.target && e.target.classList.contains('row-select')) {
        var item = e.target.closest('.file-item');
        if (item) item.classList.toggle('is-selected', e.target.checked);
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

// 批量下载：逐个触发 download_zip（对含图片目录），文件则跳过
function batchDownload() {
    var checked = document.querySelectorAll('.row-select:checked');
    if (!checked.length) { toast('请先勾选项目', 'error'); return; }
    var i = 0;
    checked.forEach(function(cb) {
        var p = decodeURIComponent(cb.dataset.path);
        // 错开触发，避免浏览器合并/拦截多个下载
        setTimeout(function() {
            window.open('/api/download_zip?path=' + encodeURIComponent(p), '_blank');
        }, i * 400);
        i++;
    });
}
window.batchDownload = batchDownload;

/* ========== 首页搜索/过滤 ========== */
// 纯前端过滤当前已渲染的 .file-item（列表 + 网格视图），按文件名子串匹配，
// 大小写不敏感、支持中文；清空恢复全部；无匹配时显示空态。不发请求，不影响排序。
(function () {
    var input = document.getElementById('fileFilter');
    if (!input) return;

    function applyFilter() {
        var kw = input.value.trim().toLowerCase();
        // 列表视图与网格视图各有一套 .file-item，分别统计可见数
        var visibleList = 0, visibleGrid = 0;
        document.querySelectorAll('.file-item').forEach(function (item) {
            var nameEl = item.querySelector('.file-name-col');
            var name = nameEl ? nameEl.innerText.trim().toLowerCase() : '';
            var match = kw === '' || name.indexOf(kw) !== -1;
            item.style.display = match ? '' : 'none';
            if (match) {
                if (item.classList.contains('card-item')) visibleGrid++;
                else visibleList++;
            }
        });
        // 区分目录已空与筛选无匹配，回收最后一项后仍保留空态提示。
        ['List', 'Grid'].forEach(function(view) {
            var hasItems = Boolean(document.querySelector(view === 'List' ? '.list-view .file-item' : '.grid-view .file-item'));
            var empty = document.getElementById('filterEmpty' + view);
            var visible = view === 'List' ? visibleList : visibleGrid;
            empty.textContent = hasItems ? '没有匹配的文件或文件夹' : '当前目录没有文件或文件夹';
            empty.style.display = (!hasItems || (kw !== '' && visible === 0)) ? 'block' : 'none';
        });
    }

    input.addEventListener('input', applyFilter);
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
            toggleRecent();          // 先收起面板
            changeDir(p);            // 复用现有跳转逻辑
        });
        box.appendChild(a);
    });
}

function toggleRecent(event) {
    if (event) event.stopPropagation();
    var panel = document.getElementById('recentPanel');
    if (panel.classList.contains('open')) {
        panel.classList.remove('open');
    } else {
        renderRecent();
        panel.classList.add('open');
    }
}
window.toggleRecent = toggleRecent;

// 点击面板外部关闭
document.addEventListener('click', function (e) {
    var wrap = document.querySelector('.recent-wrap');
    var panel = document.getElementById('recentPanel');
    if (panel.classList.contains('open') && wrap && !wrap.contains(e.target)) {
        panel.classList.remove('open');
    }
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
