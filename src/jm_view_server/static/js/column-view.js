(function () {
    'use strict';

    var state = {
        active: false,
        initialized: false,
        trail: [],
        selectedByPath: {},
        selectedKeyByPath: {},
        cache: {},
        requestVersion: 0,
        historyDepth: 0,
        visibleLimit: 4,
        initialPath: '',
        rootPath: '',
        operationMenu: null,
        operationTrigger: null,
        operationsVisible: true,
        focusAfterHistory: false
    };

    function elements() {
        return {
            view: document.getElementById('columnView'),
            track: document.getElementById('columnTrack'),
            live: document.getElementById('columnLive'),
            back: document.getElementById('columnBack'),
            location: document.getElementById('columnLocation'),
            filter: document.getElementById('fileFilter')
        };
    }

    function basename(path) {
        var cleaned = String(path || '').replace(/[\\/]+$/, '');
        if (!cleaned) return path || '根目录';
        var parts = cleaned.split(/[\\/]/);
        return parts[parts.length - 1] || cleaned;
    }

    function normalized(path) {
        return String(path || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    }

    function samePath(left, right) {
        return normalized(left) === normalized(right);
    }

    function displayPath(path) {
        var value = String(path || '').replace(/\\/g, '/');
        if (/^[a-z]:\/$/i.test(value) || value === '/') return value;
        return value.replace(/\/+$/, '');
    }

    function parentPath(path) {
        var value = displayPath(path);
        if (!value || value === '/' || /^[a-z]:\/$/i.test(value)) return '';
        var index = value.lastIndexOf('/');
        if (index < 0) return '';
        if (index === 2 && /^[a-z]:/i.test(value)) return value.slice(0, 3);
        return value.slice(0, index) || '/';
    }

    function buildInitialTrail(rootPath, activePath) {
        var root = displayPath(rootPath);
        var active = displayPath(activePath);
        if (!active) return [];
        if (samePath(root, active)) return [active];

        var rootNorm = normalized(root);
        var activeNorm = normalized(active);
        var rootPrefix = root === '/' ? '/' : rootNorm + '/';
        if (root && activeNorm.indexOf(rootPrefix) === 0) {
            var trail = [root];
            var current = root;
            active.slice(root.length).replace(/^\/+/, '').split('/').filter(Boolean).forEach(function (part) {
                current = displayPath(current).replace(/\/+$/, '') + '/' + part;
                trail.push(current);
            });
            trail[trail.length - 1] = active;
            return trail;
        }

        var fallback = [active];
        var cursor = active;
        while (fallback.length < 4) {
            cursor = parentPath(cursor);
            if (!cursor) break;
            fallback.unshift(cursor);
        }
        return fallback;
    }

    function restoreTrailSelection() {
        state.selectedByPath = {};
        state.selectedKeyByPath = {};
        state.trail.forEach(function (path, index) {
            if (index < state.trail.length - 1) state.selectedByPath[path] = state.trail[index + 1];
        });
    }

    function isImageName(name) {
        return /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i.test(name || '');
    }

    function itemPath(file) {
        return file.path || decodeURIComponent(file.quoted_path || '');
    }

    function itemKey(file) {
        if (file.is_link && file.manage_quoted_path) return 'link:' + normalized(decodeURIComponent(file.manage_quoted_path));
        return 'path:' + normalized(itemPath(file));
    }

    function selectedItemKey(path, files) {
        if (state.selectedKeyByPath[path]) return state.selectedKeyByPath[path];
        var selectedPath = state.selectedByPath[path];
        if (!selectedPath) return '';
        var matches = files.filter(function (file) { return samePath(itemPath(file), selectedPath); });
        var selected = matches.find(function (file) { return !file.is_link; }) || matches[0];
        if (!selected) return '';
        state.selectedKeyByPath[path] = itemKey(selected);
        return state.selectedKeyByPath[path];
    }

    function setCurrentPath(path) {
        var current = document.getElementById('currentPathText');
        if (current) {
            current.setAttribute('data-path', path);
            current.textContent = String(path || '').replace(/^[\\/]+|[\\/]+$/g, '');
        }
        var controls = elements();
        if (controls.location) controls.location.textContent = path;
        if (controls.back) controls.back.disabled = state.trail.length <= 1;
        document.querySelectorAll('[data-jmv-upload-link]').forEach(function (uploadLink) {
            uploadLink.href = '/upload_file?path=' + encodeURIComponent(path);
        });
        var pageBack = document.getElementById('btn-back');
        if (pageBack && state.active) {
            pageBack.disabled = state.trail.length <= 1;
            pageBack.style.opacity = pageBack.disabled ? '0.5' : '';
            pageBack.style.cursor = pageBack.disabled ? 'not-allowed' : '';
        }
    }

    function announce(message) {
        var live = elements().live;
        if (!live) return;
        live.textContent = '';
        window.setTimeout(function () { live.textContent = message; }, 20);
    }

    function updateHistory(replace) {
        var activePath = getActivePath();
        if (!activePath) return;
        var snapshot = {
            jmvColumn: true,
            trail: state.trail.slice(),
            selectedByPath: Object.assign({}, state.selectedByPath),
            selectedKeyByPath: Object.assign({}, state.selectedKeyByPath),
            historyDepth: state.historyDepth
        };
        var url = new URL(window.location.href);
        url.searchParams.set('path', activePath);
        if (replace) window.history.replaceState(snapshot, '', url.toString());
        else window.history.pushState(snapshot, '', url.toString());
    }

    function visibleTrail() {
        return state.trail.slice(-state.visibleLimit);
    }

    function recalculateVisibleLimit() {
        var view = elements().view;
        if (!view) return;
        var next = window.matchMedia('(max-width: 860px)').matches ? 1 : 4;
        if (next !== state.visibleLimit) {
            state.visibleLimit = next;
            render();
        }
    }

    function ensureDirectory(path) {
        var cached = state.cache[path];
        if (cached && cached.status === 'ready') return Promise.resolve(cached);
        if (cached && cached.promise) return cached.promise;

        var entry = { status: 'loading', files: [], error: '', promise: null };
        state.cache[path] = entry;
        entry.promise = fetch('/api/list_files?path=' + encodeURIComponent(path), {
            headers: { 'Accept': 'application/json' }
        }).then(function (response) {
            if (!response.ok) throw new Error('目录加载失败（' + response.status + '）');
            return response.json();
        }).then(function (data) {
            entry.status = 'ready';
            entry.files = Array.isArray(data.files) ? data.files : [];
            entry.error = '';
            entry.promise = null;
            return entry;
        }).catch(function (error) {
            entry.status = 'error';
            entry.error = error && error.message ? error.message : '目录加载失败';
            entry.promise = null;
            throw error;
        });
        return entry.promise;
    }

    function retryPath(path) {
        delete state.cache[path];
        render();
        ensureDirectory(path).then(function () {
            if (state.active) render();
        }).catch(function () {
            if (state.active) render();
        });
    }

    function makeState(message, path, retry) {
        var box = document.createElement('div');
        box.className = 'column-state';
        var inner = document.createElement('div');
        inner.textContent = message;
        box.appendChild(inner);
        if (retry) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-outline btn-sm';
            button.textContent = '重试';
            button.addEventListener('click', function () { retryPath(path); });
            inner.appendChild(document.createElement('br'));
            inner.appendChild(button);
        }
        return box;
    }

    function selectEntry(path, file, main) {
        state.selectedByPath[path] = itemPath(file);
        state.selectedKeyByPath[path] = itemKey(file);
        render();
        if (main) {
            var target = Array.from(document.querySelectorAll('.column-item-main')).find(function (node) {
                return node.dataset.key === itemKey(file);
            });
            if (target) target.focus({ preventScroll: true });
        }
    }

    function focusSelection(path, selectedKey) {
        var entry = state.cache[path];
        if (!entry || entry.status !== 'ready') return;
        var file = entry.files.find(function (candidate) {
            return itemKey(candidate) === selectedKey;
        });
        if (file) selectEntry(path, file, true);
    }

    function focusSelectedItem(path) {
        var entry = state.cache[path];
        if (!entry || entry.status !== 'ready') return;
        var selectedKey = selectedItemKey(path, entry.files);
        if (!selectedKey) return;
        var target = Array.from(document.querySelectorAll('.finder-column.is-active .column-item-main')).find(function (node) {
            return node.dataset.key === selectedKey;
        });
        if (target) target.focus({ preventScroll: true });
    }

    function openFile(file) {
        if (file && file.href) window.location.href = file.href;
    }

    function closeOperationMenu(returnFocus) {
        if (state.operationMenu) state.operationMenu.remove();
        state.operationMenu = null;
        var trigger = state.operationTrigger;
        state.operationTrigger = null;
        if (returnFocus && trigger && document.contains(trigger)) trigger.focus();
    }

    function moveOptions(path, file) {
        var entry = state.cache[path];
        var targets = entry && entry.status === 'ready' ? entry.files.filter(function (candidate) {
            return candidate.type === 'dir' && !candidate.link_broken && !samePath(itemPath(candidate), itemPath(file));
        }).map(function (candidate) {
            return { path: itemPath(candidate), name: candidate.name };
        }) : [];
        return { currentPath: path, targets: targets };
    }

    function addOperation(menu, label, action, danger) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'column-operation-item' + (danger ? ' is-danger' : '');
        button.textContent = label;
        button.addEventListener('click', function (event) {
            closeOperationMenu(false);
            action(event);
        });
        menu.appendChild(button);
    }

    function openOperationMenu(event, trigger, path, file) {
        event.stopPropagation();
        if (state.operationTrigger === trigger) {
            closeOperationMenu(true);
            return;
        }
        closeOperationMenu(false);

        var menu = document.createElement('div');
        menu.className = 'column-operation-menu';
        menu.setAttribute('role', 'menu');
        if (file.type === 'dir' && !file.link_broken) {
            addOperation(menu, '进入文件夹', function () { navigateInto(path, file); });
        } else if (file.type !== 'dir') {
            addOperation(menu, '下载文件', function () { openFile(file); });
        }
        if (file.jm_view && (file.type === 'dir' || isImageName(file.name))) {
            addOperation(menu, '看本', function () { openJmView(encodeURIComponent(itemPath(file)), file.type); });
        }
        if (file.type === 'dir' && file.jm_view) {
            addOperation(menu, '打包下载', function () { downloadZip(file.quoted_path); });
        }
        addOperation(menu, '重命名', function () { renameItem(file.manage_quoted_path, file.name); });
        addOperation(menu, '移动到…', function () { moveItem(file.manage_quoted_path, file.name, moveOptions(path, file)); });
        if (!file.link_broken) {
            addOperation(menu, '在文件管理器中显示', function () { openDir(encodeURIComponent(itemPath(file))); });
        }
        addOperation(menu, '删除', function (menuEvent) {
            deleteItem({
                stopPropagation: function () {},
                preventDefault: function () {},
                currentTarget: trigger
            }, file.manage_quoted_path, file.name);
        }, true);

        document.body.appendChild(menu);
        state.operationMenu = menu;
        state.operationTrigger = trigger;
        var rect = trigger.getBoundingClientRect();
        var menuRect = menu.getBoundingClientRect();
        var left = Math.min(window.innerWidth - menuRect.width - 8, rect.right - menuRect.width);
        var top = rect.bottom + 4;
        if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 4;
        menu.style.left = Math.max(8, left) + 'px';
        menu.style.top = Math.max(8, top) + 'px';
        var first = menu.querySelector('button');
        if (first) first.focus();
    }

    function closeOperationMenuForScroll() {
        var returnFocus = Boolean(state.operationMenu && state.operationMenu.contains(document.activeElement));
        closeOperationMenu(returnFocus);
    }

    function setOperationsVisible(visible) {
        state.operationsVisible = visible !== false;
        var view = elements().view;
        if (!view) return;
        if (!state.operationsVisible) {
            var activeElement = document.activeElement;
            var shouldMoveFocus = Boolean(activeElement && (
                (state.operationMenu && state.operationMenu.contains(activeElement)) ||
                (activeElement.closest && activeElement.closest('.column-item-actions'))
            ));
            closeOperationMenu(false);
            if (shouldMoveFocus) {
                var toggle = document.getElementById('columnOperationsToggle');
                if (toggle) toggle.focus();
            }
        }
        view.classList.toggle('operations-hidden', !state.operationsVisible);
    }

    function navigateInto(parentPath, file, options) {
        options = options || {};
        if (!file || file.type !== 'dir' || file.link_broken) return;
        var parentIndex = state.trail.findIndex(function (path) { return samePath(path, parentPath); });
        if (parentIndex < 0) return;

        var childPath = itemPath(file);
        var version = ++state.requestVersion;
        state.trail = state.trail.slice(0, parentIndex + 1);
        state.selectedByPath[parentPath] = childPath;
        state.selectedKeyByPath[parentPath] = itemKey(file);
        updateHistory(true);
        state.trail.push(childPath);
        state.historyDepth += 1;
        setCurrentPath(childPath);
        render();
        if (options.history !== false) updateHistory(false);

        ensureDirectory(childPath).then(function (entry) {
            if (version !== state.requestVersion || !samePath(getActivePath(), childPath)) return;
            render();
            if (options.focusFirst) {
                window.requestAnimationFrame(function () {
                    var first = document.querySelector('.finder-column.is-active .column-item-main');
                    if (first) first.focus();
                });
            }
            announce('已打开目录 ' + basename(childPath) + '，共 ' + entry.files.length + ' 项');
        }).catch(function () {
            if (version === state.requestVersion && state.active) render();
        });
    }

    function makeEntry(path, file, isSelected, isTabStop, active) {
        var wrapper = document.createElement('div');
        wrapper.className = 'column-entry' + (isSelected ? ' is-selected' : '');

        var main = document.createElement('button');
        main.type = 'button';
        main.className = 'column-item-main';
        main.setAttribute('role', 'option');
        main.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        main.setAttribute('aria-label', file.name);
        main.title = file.is_link && file.target_path ? file.name + '\n目标：' + file.target_path : file.name;
        main.dataset.path = itemPath(file);
        main.dataset.key = itemKey(file);
        main.dataset.type = file.type;
        main.tabIndex = isTabStop ? 0 : -1;

        var fileIcon = document.createElement('span');
        fileIcon.className = 'column-item-icon';
        if (file.is_link) fileIcon.innerHTML = icon('link');
        else if (file.type === 'dir') fileIcon.innerHTML = icon('folder');
        else fileIcon.innerHTML = isImageName(file.name) ? icon('images') : icon('file');

        var name = document.createElement('span');
        name.className = 'column-item-name';
        name.textContent = file.name;

        var arrow = document.createElement('span');
        arrow.className = 'column-item-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = file.type === 'dir' && !file.link_broken ? '›' : '';

        main.appendChild(fileIcon);
        main.appendChild(name);
        main.appendChild(arrow);
        main.addEventListener('click', function () {
            selectEntry(path, file, file.type !== 'dir');
            if (file.type === 'dir') navigateInto(path, file);
        });
        main.addEventListener('dblclick', function () {
            if (file.type !== 'dir') openFile(file);
        });
        main.addEventListener('keydown', function (event) {
            handleItemKey(event, path, file, main);
        });
        wrapper.appendChild(main);

        var actions = document.createElement('div');
        actions.className = 'column-item-actions';
        var moreButton = document.createElement('button');
        moreButton.type = 'button';
        moreButton.className = 'column-more-button';
        moreButton.textContent = '⋯';
        moreButton.title = '更多操作';
        moreButton.setAttribute('aria-label', file.name + ' 的更多操作');
        moreButton.tabIndex = active ? 0 : -1;
        moreButton.addEventListener('click', function (event) {
            openOperationMenu(event, moreButton, path, file);
        });
        actions.appendChild(moreButton);
        wrapper.appendChild(actions);
        return wrapper;
    }

    function handleItemKey(event, path, file, main) {
        var list = main.closest('.finder-column-list');
        var items = Array.from(list.querySelectorAll('.column-item-main'));
        var index = items.indexOf(main);
        var target = null;
        if (event.key === 'ArrowDown') target = items[Math.min(items.length - 1, index + 1)];
        else if (event.key === 'ArrowUp') target = items[Math.max(0, index - 1)];
        else if (event.key === 'Home') target = items[0];
        else if (event.key === 'End') target = items[items.length - 1];
        else if (event.key === 'ArrowRight' || event.key === 'Enter') {
            event.preventDefault();
            selectEntry(path, file, false);
            if (file.type === 'dir') navigateInto(path, file, { focusFirst: true });
            else if (event.key === 'Enter') openFile(file);
            return;
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goBack(true);
            return;
        } else return;
        event.preventDefault();
        if (target) focusSelection(path, target.dataset.key);
    }

    function renderColumn(path, active) {
        var entry = state.cache[path] || { status: 'loading', files: [] };
        var column = document.createElement('section');
        column.className = 'finder-column' + (active ? ' is-active' : '');
        column.dataset.path = path;
        column.setAttribute('aria-label', '目录 ' + basename(path));

        var head = document.createElement('div');
        head.className = 'finder-column-head';
        var title = document.createElement('div');
        title.className = 'finder-column-title';
        title.title = path;
        title.textContent = basename(path);
        var count = document.createElement('div');
        count.className = 'finder-column-count';
        count.textContent = entry.status === 'ready' ? entry.files.length + ' 项' : '';
        head.appendChild(title);
        head.appendChild(count);
        column.appendChild(head);

        var list = document.createElement('div');
        list.className = 'finder-column-list';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', basename(path) + ' 的内容');
        if (entry.status === 'loading') {
            list.appendChild(makeState('正在加载…', path, false));
        } else if (entry.status === 'error') {
            list.appendChild(makeState(entry.error || '目录加载失败', path, true));
        } else {
            var keyword = active ? String(elements().filter && elements().filter.value || '').trim().toLowerCase() : '';
            var files = entry.files.filter(function (file) {
                return !keyword || String(file.name || '').toLowerCase().indexOf(keyword) >= 0;
            });
            if (!files.length) {
                list.appendChild(makeState(keyword ? '没有匹配的文件或文件夹' : '目录为空', path, false));
            } else {
                var selectedKey = selectedItemKey(path, files);
                var hasVisibleSelection = files.some(function (file) {
                    return selectedKey === itemKey(file);
                });
                files.forEach(function (file, index) {
                    var selected = selectedKey === itemKey(file);
                    var tabStop = active && (selected || (!hasVisibleSelection && index === 0));
                    list.appendChild(makeEntry(path, file, selected, tabStop, active));
                });
            }
        }
        column.appendChild(list);
        return column;
    }

    function renderPlaceholderColumn() {
        var column = document.createElement('section');
        column.className = 'finder-column is-placeholder';
        column.setAttribute('aria-hidden', 'true');
        return column;
    }

    function render() {
        if (!state.active) return;
        var controls = elements();
        if (!controls.track) return;
        var paths = visibleTrail();
        controls.view.style.setProperty('--column-count', String(state.visibleLimit));
        controls.track.innerHTML = '';
        paths.forEach(function (path, index) {
            controls.track.appendChild(renderColumn(path, index === paths.length - 1));
        });
        for (var index = paths.length; index < state.visibleLimit; index++) {
            controls.track.appendChild(renderPlaceholderColumn());
        }
        setCurrentPath(getActivePath());
    }

    function loadVisible() {
        var version = ++state.requestVersion;
        render();
        return Promise.all(visibleTrail().map(function (path) {
            return ensureDirectory(path).catch(function () { return null; });
        })).then(function () {
            if (version === state.requestVersion && state.active) render();
        });
    }

    function restoreHistory(snapshot) {
        if (!snapshot || !snapshot.jmvColumn || !Array.isArray(snapshot.trail) || !snapshot.trail.length) {
            window.location.reload();
            return;
        }
        state.trail = snapshot.trail.slice();
        state.selectedByPath = Object.assign({}, snapshot.selectedByPath || {});
        state.selectedKeyByPath = Object.assign({}, snapshot.selectedKeyByPath || {});
        state.historyDepth = Number(snapshot.historyDepth) || 0;
        setCurrentPath(getActivePath());
        loadVisible().then(function () {
            if (!state.focusAfterHistory) return;
            state.focusAfterHistory = false;
            var activePath = getActivePath();
            var selected = selectedItemKey(activePath, (state.cache[activePath] || {}).files || []);
            if (selected) focusSelection(activePath, selected);
        });
    }

    function goBack(focusSelection) {
        if (state.trail.length <= 1) return false;
        ++state.requestVersion;
        var shouldFocus = Boolean(focusSelection);
        if (state.historyDepth > 0) {
            state.focusAfterHistory = shouldFocus;
            window.history.back();
            return true;
        }
        state.focusAfterHistory = false;
        var childPath = state.trail.pop();
        var parent = getActivePath();
        state.selectedByPath[parent] = childPath;
        setCurrentPath(parent);
        updateHistory(true);
        loadVisible().then(function () {
            if (!shouldFocus || !samePath(getActivePath(), parent)) return;
            window.requestAnimationFrame(function () {
                if (!samePath(getActivePath(), parent)) return;
                focusSelectedItem(parent);
            });
        });
        return true;
    }

    function getActivePath() {
        return state.trail[state.trail.length - 1] || state.initialPath;
    }

    function init() {
        if (state.initialized) return;
        var controls = elements();
        if (!controls.view) return;
        state.initialized = true;
        var savedHistory = window.history.state || {};
        state.initialPath = displayPath(controls.view.dataset.initialPath || getCurPath());
        state.rootPath = displayPath(controls.view.dataset.rootPath || state.initialPath);
        state.historyDepth = Number(savedHistory.historyDepth) || 0;
        state.trail = buildInitialTrail(state.rootPath, state.initialPath);
        restoreTrailSelection();
        if (savedHistory.jmvColumn && Array.isArray(savedHistory.trail) &&
                samePath(savedHistory.trail[savedHistory.trail.length - 1], state.initialPath)) {
            state.selectedByPath = Object.assign(state.selectedByPath, savedHistory.selectedByPath || {});
            state.selectedKeyByPath = Object.assign({}, savedHistory.selectedKeyByPath || {});
        }
        controls.back.addEventListener('click', function () { goBack(true); });
        if (controls.filter) controls.filter.addEventListener('input', function () { if (state.active) render(); });
        controls.track.addEventListener('scroll', closeOperationMenuForScroll, true);
        window.addEventListener('resize', function () {
            closeOperationMenuForScroll();
            recalculateVisibleLimit();
        });
        window.addEventListener('popstate', function (event) {
            if (state.active) restoreHistory(event.state);
        });
        document.addEventListener('click', function (event) {
            if (state.operationMenu && !state.operationMenu.contains(event.target) && event.target !== state.operationTrigger) {
                closeOperationMenu(false);
            }
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && state.operationMenu) closeOperationMenu(true);
        });
    }

    function activate() {
        init();
        var controls = elements();
        if (!controls.view) return;
        state.active = true;
        controls.view.hidden = false;
        setOperationsVisible(state.operationsVisible);
        recalculateVisibleLimit();
        setCurrentPath(getActivePath());
        updateHistory(true);
        loadVisible();
    }

    function deactivate() {
        var controls = elements();
        if (!controls.view) return;
        controls.view.hidden = true;
        if (!state.initialized) return;
        state.active = false;
        var pageBack = document.getElementById('btn-back');
        if (pageBack) {
            pageBack.disabled = state.initialPath.length <= 3;
            pageBack.style.opacity = pageBack.disabled ? '0.5' : '';
            pageBack.style.cursor = pageBack.disabled ? 'not-allowed' : '';
        }
        var activePath = getActivePath();
        if (activePath && !samePath(activePath, state.initialPath)) changeDir(activePath);
    }

    window.JmvColumnView = {
        activate: activate,
        deactivate: deactivate,
        getActivePath: getActivePath,
        goBack: goBack,
        setOperationsVisible: setOperationsVisible,
        isActive: function () { return state.active; },
        retryPath: retryPath
    };
})();
