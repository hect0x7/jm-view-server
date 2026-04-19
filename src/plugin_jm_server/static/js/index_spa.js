$(document).ready(function () {
    // State
    let currentPath = INITIAL_PATH || DEFAULT_PATH;
    const BOOKMARKS_KEY = 'plugin_jm_bookmarks';

    console.log('JM View SPA v2.6 (Rich List & Hover Preview)');

    // Init
    initContextMenu();
    initResizer();
    loadDirectory(currentPath, false);
    renderBookmarks(); // Pre-render if using sidebar

    if ($('#hoverPreview').length === 0) {
        $('body').append('<div id="hoverPreview" class="hover-preview"></div>');
    }
    // updateBookmarkIconState will be called by loadDirectory success, so we are good.

    // Event Listeners
    window.onpopstate = function (event) {
        if (event.state && event.state.path) {
            loadDirectory(event.state.path, false);
        } else {
            loadDirectory(DEFAULT_PATH, false);
        }
    };

    $('#btn-refresh').click(() => loadDirectory(currentPath, true));
    $('#btn-parent-dir').click(() => goParentDir());
    $('#btn-home').click(() => loadDirectory(DEFAULT_PATH));
    $('#btn-view-album').click(() => loadAlbum(currentPath));
    $('#btn-back-legacy').click(() => {
        window.location.href = '/?path=' + encodeURIComponent(currentPath);
    });

    // Path Input Navigation & Autocomplete
    const $pathInput = $('#currentPathDisplay');
    const $suggestions = $('#pathSuggestions');
    let suggestionDebounce;
    let cachedDir = null;
    let cachedFiles = [];

    $pathInput.on('keydown', function (e) {
        const $items = $suggestions.find('li');
        let activeIdx = $items.index($items.filter('.active'));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if ($items.length > 0) {
                if (activeIdx < $items.length - 1) activeIdx++;
                else activeIdx = 0; // Cycle to top

                $items.removeClass('active');
                const $active = $items.eq(activeIdx).addClass('active');
                // Scroll into view if needed
                if ($active.length) {
                    $active[0].scrollIntoView({ block: 'nearest' });
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if ($items.length > 0) {
                if (activeIdx > 0) activeIdx--;
                else activeIdx = $items.length - 1; // Cycle to bottom

                $items.removeClass('active');
                const $active = $items.eq(activeIdx).addClass('active');
                if ($active.length) {
                    $active[0].scrollIntoView({ block: 'nearest' });
                }
            }
        } else if (e.key === 'Enter') {
            // Check if an item is active
            if (activeIdx !== -1) {
                e.preventDefault();
                // Trigger click on the ACTIVE item
                $items.eq(activeIdx).trigger('click');
                return;
            }

            const path = $(this).val();
            if (path) {
                $suggestions.hide();
                $(this).blur();
                loadDirectory(path);
            }
        }
    });

    $pathInput.on('input focus', function () {
        const val = $(this).val();
        clearTimeout(suggestionDebounce);

        suggestionDebounce = setTimeout(() => {
            handleAutocomplete(val);
        }, 300);
    });

    // Hide when clicking outside
    $(document).on('click', function (e) {
        if (!$.contains($('.path-input-wrapper')[0], e.target)) {
            $suggestions.hide();
        }
    });

    function handleAutocomplete(inputVal) {
        if (!inputVal) {
            $suggestions.hide();
            return;
        }

        // Determine parent dir and query
        // Handle Windows and Unix separators
        const sep = inputVal.includes('/') ? '/' : '\\';
        let parentDir, query;

        // E.g. "D:\Downloads\Ani"
        const lastSepIndex = Math.max(inputVal.lastIndexOf('/'), inputVal.lastIndexOf('\\'));

        if (lastSepIndex === -1) {
            // Treat specific drive letters like 'C:'
            if (inputVal.endsWith(':')) {
                parentDir = inputVal + '\\';
                query = '';
            } else {
                // No separator? Maybe root or just typing name?
                // Assume relative to nothing? Hard to say. 
                // Let's assume we need to list drives or fail.
                // For safety, if length > 1 and looks like drive:
                if (/^[a-zA-Z]:$/.test(inputVal)) {
                    parentDir = inputVal + '\\';
                    query = '';
                } else {
                    $suggestions.hide();
                    return;
                }
            }
        } else {
            parentDir = inputVal.substring(0, lastSepIndex);
            // Handle root case "D:\" -> parent is "D:" which is weird in some APIs, 
            // but usually "D:\" is better.
            if (parentDir.endsWith(':')) parentDir += sep;

            // If input is exactly "D:\" then query is empty
            if (lastSepIndex === inputVal.length - 1) {
                query = '';
                // Fix parentDir to include the slash if it was stripped?
                // Actually substring(0, index) excludes slash.
                // So for "D:\" -> parent "D:", query ""
                parentDir = inputVal.substring(0, lastSepIndex + 1);
            } else {
                query = inputVal.substring(lastSepIndex + 1).toLowerCase();
                parentDir = inputVal.substring(0, lastSepIndex + 1);
            }
        }

        // Fetch if needed
        if (cachedDir !== parentDir) {
            $.ajax({
                url: '/api/list_files',
                data: { path: parentDir },
                method: 'GET',
                success: function (res) {
                    cachedDir = parentDir;
                    // Filter only dirs
                    cachedFiles = (res.files || []).filter(f => f.type === 'dir' || f.type === 'jm');
                    renderSuggestions(cachedFiles, query, parentDir);
                },
                error: function () {
                    // Fail silently or clear
                    cachedFiles = [];
                    cachedDir = null;
                }
            });
        } else {
            renderSuggestions(cachedFiles, query, parentDir);
        }
    }

    function renderSuggestions(files, query, parentPath) {
        // Files are children of parentPath. 
        // If the user has typed a valid path that equals parentPath (so query is empty), we should offer a way to "Confirm/Go" to parentPath.
        // OR if the user is typing, we show children.

        const matches = files.filter(f => f.name.toLowerCase().startsWith(query));

        $suggestions.empty();

        // 1. Confirm Option (Only if we are likely at a valid path or user wants to submit current input)
        // logic: if query is empty, it means input ends with slash (likely a dir). 
        // We can add a "Go to <parentPath>" item.
        if (query === '' && parentPath) {
            // Only show confirm if the path in input is NOT different from currentPath (meaning user hasn't moved yet)
            const inputVal = $pathInput.val();

            // Utility to decode HTML entities (e.g. for paths with special chars)
            const decodeHtml = (html) => {
                const txt = document.createElement("textarea");
                txt.innerHTML = html;
                return txt.value;
            };

            // Normalize slashes for comparison
            const normInput = inputVal.replace(/[\\/]+$/, '').replace(/\\/g, '/');
            // Decode currentPath 
            const decodedCurrent = decodeHtml(currentPath);
            const normCurrent = decodedCurrent.replace(/[\\/]+$/, '').replace(/\\/g, '/');

            // console.log(normInput, normCurrent); 

            if (normInput !== normCurrent) {
                const $start = $(`
                    <li class="autocomplete-item confirm-item" data-path="${parentPath}">
                        <i class="fas fa-check-circle" style="color: #10b981;"></i>
                        <span>确认</span>
                    </li>
                `);
                $start.on('mousedown click', function (e) {
                    e.preventDefault();
                    if ($pathInput) $pathInput.blur(); // Focus away
                    loadDirectory(parentPath);
                    $suggestions.hide();
                });
                $suggestions.append($start);
            }
        }

        // Always show ".." to go up, if we are not at root (logic could be refined but always showing is safe enough)
        // Only show if query doesn't conflict with it significantly? 
        // Actually best to show it if matches is empty OR if query is empty or starts with '.'
        // Let's just prepend it if parentPath has a parent.

        let parentOfParent = null;
        if (parentPath) {
            const sep = parentPath.includes('/') ? '/' : '\\';
            // parentPath usually ends with slash due to handleAutocomplete logic
            let clean = parentPath;
            if (clean.endsWith(sep)) clean = clean.slice(0, -1);

            const lastSep = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
            if (lastSep > 0) {
                parentOfParent = clean.substring(0, lastSep + 1);
            } else if (clean.endsWith(':')) {
                // Root drive, no parent usually
            }
        }

        if (parentOfParent && (query === '' || '..'.startsWith(query))) {
            const $li = $(`
                <li class="autocomplete-item">
                    <i class="fas fa-level-up-alt" style="color: #6b7280;"></i>
                    <span>..</span>
                </li>
            `);
            $li.click(function () {
                $pathInput.val(parentOfParent);
                $pathInput.focus();
                $suggestions.hide();
                handleAutocomplete(parentOfParent);
            });
            $suggestions.append($li);
        }

        if (matches.length === 0 && $suggestions.children().length === 0) {
            $suggestions.hide();
            return;
        }

        matches.slice(0, 10).forEach(f => {
            const $li = $(`
                <li class="autocomplete-item">
                    <i class="fas fa-folder"></i>
                    <span>${f.name}</span>
                </li>
            `);

            $li.click(function () {
                let newVal = f.path;

                // Direct navigation as requested
                $pathInput.val(newVal);
                if ($pathInput) $pathInput.blur(); // Focus away
                $suggestions.hide();
                loadDirectory(newVal);
            });
            $suggestions.append($li);
        });

        $suggestions.show();
    }

    // Bookmark Events
    $('#btn-add-bookmark').click(() => toggleCurrentBookmark());
    $('#btn-show-bookmarks').click(() => showBookmarksDrawer());
    $('#btnCloseBookmarks, #bookmarksOverlay').click(() => hideBookmarksDrawer());


    /**
     * Load Directory Content
     * @param {string} path 
     * @param {boolean} pushState 
     */
    function loadDirectory(path, pushState = true) {
        // If empty path, use default
        if (!path) path = DEFAULT_PATH;

        $.ajax({
            url: '/api/list_files',
            data: { path: path },
            method: 'GET',
            success: function (res) {
                currentPath = res.currentPath;
                updateBreadcrumb(currentPath);
                renderFileList(res.files);
                updateBookmarkIconState();

                // Reset Viewer when changing directory
                // resetViewer(); // Disabled per user request: maintain viewer state when switching folders

                if (pushState) {
                    history.pushState({ path: currentPath }, '', '/spa?path=' + encodeURIComponent(currentPath));
                }
            },
            error: function (err) {
                alert('Failed to load directory: ' + path);
                console.error(err);
            }
        });
    }

    /**
     * Render the File List in Sidebar
     * @param {Array} files 
     */
    function renderFileList(files) {
        const $list = $('#fileList');
        $list.empty();
        $('#hoverPreview').hide().empty();

        if (files.length === 0) {
            $list.append('<li class="file-item">Empty Directory</li>');
            return;
        }

        files.forEach(file => {
            // Determine Icon and Click Action
            let iconClass = 'fa-file';
            let clickAction, typeStr;

            // Priority 1: Directories (Navigate)
            if (file.type.includes('dir')) {
                iconClass = 'fa-folder';
                typeStr = 'dir';
                clickAction = () => loadDirectory(file.path);
            }
            // Priority 2: Files (Check extension)
            else {
                typeStr = 'file';
                if (isImageFile(file.name)) {
                    iconClass = 'fa-image'; // Use image icon
                    // Image: View in right pane
                    clickAction = () => loadSingleImage(file.path, file.name);

                    // For single image files, use themselves as reference for thumbnail
                    if (!file.first_img_url) {
                        file.first_img_url = file.path;
                    }
                } else {
                    // Other: Open/Download
                    clickAction = () => window.open(file.href, '_blank');
                }
            }

            // Thumbnail Logic
            let thumbHtml = `<i class="fas ${iconClass}"></i>`;
            if (file.first_img_url) {
                // Determine source for thumbnail
                let thumbSrc;
                if (typeof file.first_img_url === 'object' && file.first_img_url.data_original) {
                    thumbSrc = file.first_img_url.data_original;
                } else if (typeof file.first_img_url === 'string') {
                    thumbSrc = `/view_file?path=${encodeURIComponent(file.first_img_url)}`;
                }

                if (thumbSrc) {
                    thumbHtml = `<img src="${thumbSrc}" alt="thumb" loading="lazy" />`;
                }
            }

            const $li = $(`
                <li class="file-item" data-type="${typeStr}" title="${file.name}" data-path="${file.path}">
                    <div class="file-thumb">
                        ${thumbHtml}
                    </div>
                    <div class="file-info">
                        <div class="file-name">${file.name}</div>
                        <div class="file-meta">
                             <span>${file.size || ''}</span>
                             ${file.ctime ? `<span>• ${file.ctime}</span>` : ''}
                        </div>
                    </div>
                </li>
            `);

            // Left Click Handler
            $li.click(function () {
                $('.file-item').removeClass('active');
                $(this).addClass('active');
                $('#hoverPreview').hide().empty();
                clickAction();
            });

            // Right Click (Context Menu) Handler
            $li.on('contextmenu', function (e) {
                e.preventDefault();
                $('.file-item').removeClass('active');
                $(this).addClass('active');

                if (typeStr === 'dir' || typeStr === 'jm') {
                    showContextMenu(e.pageX, e.pageY, file.path, file.name);
                } else {
                    showContextMenu(e.pageX, e.pageY, currentPath, "Current Folder");
                }
            });

            // Hover Preview Logic (Folders Only)
            if ((typeStr === 'dir' || typeStr === 'jm') && file.first_img_url) {
                let hoverTimeout;
                const $preview = $('#hoverPreview');

                $li.hover(
                    function (e) {
                        // Mouse Enter
                        hoverTimeout = setTimeout(() => {
                            let src;
                            if (typeof file.first_img_url === 'object' && file.first_img_url.data_original) {
                                src = file.first_img_url.data_original;
                            } else {
                                const stringPath = typeof file.first_img_url === 'string' ? file.first_img_url : file.path;
                                src = `/view_file?path=${encodeURIComponent(stringPath)}`;
                            }

                            $preview.empty().append(`<img src="${src}" />`);

                            // Calculate position: to the right of sidebar
                            const rect = this.getBoundingClientRect();
                            const top = Math.min(rect.top, window.innerHeight - 300); // Prevent overflow bottom

                            $preview.css({
                                top: top + 'px',
                                left: (rect.right + 10) + 'px',
                                display: 'block'
                            });
                        }, 500); // 500ms delay
                    },
                    function () {
                        // Mouse Leave
                        clearTimeout(hoverTimeout);
                        $preview.hide().empty();
                    }
                );
            }

            $list.append($li);
        });
    }

    /**
     * Context Menu Logic
     */
    function initContextMenu() {
        // Remove existing if any (cleanup)
        $('#ctxBackdrop, #ctxMenu').remove();

        $('body').append(`
            <div class="context-menu-backdrop" id="ctxBackdrop"></div>
            <div class="context-menu" id="ctxMenu" style="display:none;">
                <div class="context-menu-item" id="ctxOpenAlbum">
                    <i class="fas fa-book-open"></i> 以本子模式打开
                </div>
            </div>
        `);

        $('#ctxBackdrop').click(function () {
            hideContextMenu();
        });

        $('#ctxOpenAlbum').click(function () {
            const path = $('#ctxMenu').data('target-path');
            if (path) {
                loadAlbum(path);
                hideContextMenu();
            }
        });
    }

    function showContextMenu(x, y, path, name) {
        // Boundary check logic could be added here
        $('#ctxMenu').data('target-path', path).css({
            top: y + 'px',
            left: x + 'px'
        }).show();
        $('#ctxBackdrop').show();
    }

    function hideContextMenu() {
        $('#ctxMenu').hide();
        $('#ctxBackdrop').hide();
    }

    /**
     * Resizer Logic
     */
    function initResizer() {
        const resizer = document.getElementById('dragMe');
        const leftSide = document.getElementById('fileSidebar');

        if (!resizer || !leftSide) return;

        let x = 0;
        let leftWidth = 0;

        const mouseDownHandler = function (e) {
            x = e.clientX;
            leftWidth = leftSide.getBoundingClientRect().width;

            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
            resizer.classList.add('resizing');
            $('body').css('cursor', 'col-resize');
        };

        const mouseMoveHandler = function (e) {
            const dx = e.clientX - x;
            const newLeftWidth = leftWidth + dx;

            if (newLeftWidth > 150 && newLeftWidth < window.innerWidth * 0.6) {
                leftSide.style.width = `${newLeftWidth}px`;
            }
        };

        const mouseUpHandler = function () {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            resizer.classList.remove('resizing');
            $('body').css('cursor', '');
        };

        resizer.addEventListener('mousedown', mouseDownHandler);
    }

    function isImageFile(filename) {
        if (!filename) return false;
        const ext = filename.split('.').pop().toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'jfif'].includes(ext);
    }

    /**
     * Load Single Image
     */
    function loadSingleImage(path, name) {
        // Construct a fake image object
        const imgObj = {
            filename: name,
            data_original: `/view_file?path=${encodeURIComponent(path)}`
        };
        renderImages([imgObj]);
    }

    /**
     * Load Album Images into Main Viewer
     * @param {string} path 
     */
    function loadAlbum(path) {
        // Show loading state
        $('#imageContainer').hide().empty();
        $('.viewer-placeholder').html('<i class="fas fa-spinner fa-spin"></i><p>Loading Album...</p>').show();

        $.ajax({
            url: '/api/album_images',
            data: { path: path },
            method: 'GET',
            success: function (res) {
                renderImages(res.images);
            },
            error: function (err) {
                $('.viewer-placeholder').html('<i class="fas fa-exclamation-triangle"></i><p>Error loading album</p>').show();
            }
        });
    }

    /**
     * Render Images
     * @param {Array} images 
     */
    function renderImages(images) {
        $('.viewer-placeholder').hide();
        const $container = $('#imageContainer');
        $container.empty().show();

        if (!images || images.length === 0) {
            $container.html('<div style="color:white;text-align:center;padding:2rem;">No images found</div>');
            return;
        }

        // Lazy Load Observer
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    if (src) {
                        img.src = src;
                        img.removeAttribute('data-src');
                    }
                    obs.unobserve(img);
                }
            });
        }, {
            rootMargin: '500px 0px', // Preload more aggressively
            threshold: 0.01
        });

        images.forEach(img => {
            const $img = $(`
                <img class="comic-page" data-src="${img.data_original}" alt="${img.filename}" loading="lazy" />
            `);
            $container.append($img);
            observer.observe($img[0]);
        });

        // Scroll to top
        $('#mainViewer').scrollTop(0);

        // Inject Menu
        injectFloatingMenu(images);
    }

    /**
     * Floating Menu Logic
     */
    function injectFloatingMenu(images) {
        // Remove existing
        $('.menu-bolock').remove();

        const menuHtml = `
        <div class="menu-bolock" style="display:block;">
            <ul style="list-style:none; padding:0;">
                <li>
                    <a href="javascript:void(0)" id="menuToggle"><i class="fas fa-sort-down"></i><span>双击隐藏</span></a>
                </li>
            </ul>
            <ul class="menu-bolock-ul" style="list-style:none; padding:0;">
                 <li style="margin-top: 15px;">
                    <a href="javascript:void(0)" id="menuLoadAll"><i class="fas fa-download"></i><span>加载全部</span></a>
                </li>
                <li>
                    <a href="javascript:void(0)" id="menuOpenExplorer"><i class="fas fa-folder-open"></i><span>打开文件夹</span></a>
                </li>
                <li>
                    <a href="javascript:void(0)" id="menuTop"><i class="far fa-caret-square-up"></i><span>回到顶端</span></a>
                </li>
                <li>
                    <a href="javascript:void(0)" id="menuBottom"><i class="far fa-caret-square-down"></i><span>跳到最后</span></a>
                </li>
                <div>
                     <select id="pageselect">
                        ${images.map((img, idx) => `<option value="${idx}">${idx + 1}/${images.length}</option>`).join('')}
                    </select>
                </div>
            </ul>
        </div>
        `;

        $('#mainViewer').append(menuHtml);

        const $menu = $('.menu-bolock');

        // Double Click to Toggle
        $('#mainViewer').off('dblclick').on('dblclick', function (e) {
            if ($(e.target).closest('.menu-bolock').length) return;
            $menu.toggle();
        });

        // Menu Handlers
        $('#menuToggle').click(() => $menu.hide());

        $('#menuOpenExplorer').click(() => {
            $.ajax({
                url: '/api/open_file',
                data: { path: currentPath },
                method: 'GET',
                success: function (res) {
                    // Feedback?
                    // console.log('Opened');
                },
                error: function (err) {
                    console.error('Failed to open explorer', err);
                }
            });
        });

        $('#menuLoadAll').click(() => {
            // Load all remaining images
            $('#imageContainer img').each(function () {
                const src = $(this).attr('data-src');
                if (src) {
                    $(this).attr('src', src).removeAttr('data-src');
                }
            });

        });

        $('#menuTop').click(() => {
            $('#mainViewer').animate({ scrollTop: 0 }, 300);
        });

        $('#menuBottom').click(() => {
            const d = document.getElementById('mainViewer');
            $(d).animate({ scrollTop: d.scrollHeight }, 300);
        });

        // Page Select
        $('#pageselect').change(function () {
            const idx = $(this).val();
            const $img = $('#imageContainer img').eq(idx);
            if ($img.length) {
                $img[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        // Sync Page Select on Scroll
        const $viewer = $('#mainViewer');
        let scrollTimeout;
        $viewer.off('scroll.menu').on('scroll.menu', function () {
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const viewerTop = $viewer.scrollTop();
                const viewerHeight = $viewer.height();

                let found = -1;
                // Optimization: Binary search would be better, but linear is ok for <1000 items usually
                // Or just sample.
                $('#imageContainer img').each(function (index) {
                    // offsetTop is relative to the container usually?
                    // Verify context
                    const imgTop = this.offsetTop;
                    // We want image that is roughly at scrollTop.
                    if (imgTop >= viewerTop - viewerHeight / 2) {
                        found = index;
                        return false;
                    }
                });

                if (found !== -1) {
                    $('#pageselect').val(found);
                }
            }, 100); // Debounce 100ms
        });
    }

    /* Utils */
    function updateBreadcrumb(path) {
        // Decode entities just in case backend returned them encoded
        const decodeHtml = (html) => {
            const txt = document.createElement("textarea");
            txt.innerHTML = html;
            return txt.value;
        };

        $('#currentPathDisplay').val(decodeHtml(path));
    }

    function resetViewer() {
        $('#imageContainer').hide().empty();
        $('.viewer-placeholder').html(`
             <i class="fas fa-book-open"></i>
             <p>请在左侧选择一个相册(本子)进行阅读，或点击单个图片预览</p>
        `).show();
        $('.menu-bolock').remove();
    }

    function goParentDir() {
        let path = currentPath;
        if (path.endsWith('/') || path.endsWith('\\')) path = path.slice(0, -1);
        const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        if (lastSlash > 0) {
            const parent = path.substring(0, lastSlash);
            loadDirectory(parent);
        } else {
            loadDirectory(path);
        }
    }

    /* Bookmarks Logic */
    function getBookmarks() {
        try {
            const stored = localStorage.getItem(BOOKMARKS_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) { return []; }
    }

    function saveBookmarks(bookmarks) {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
        renderBookmarks();
    }

    function toggleCurrentBookmark() {
        if (!currentPath) return;
        const bookmarks = getBookmarks();
        const idx = bookmarks.findIndex(b => b.path === currentPath);

        if (idx !== -1) {
            // Exists -> Remove
            bookmarks.splice(idx, 1);
            saveBookmarks(bookmarks);
            // Feedback
            /* updateBookmarkIconState(false); - handled by updateBookmarkIconState logic if called */
            $('#btn-add-bookmark').html('<i class="far fa-star"></i>');
        } else {
            // Not Exists -> Add
            bookmarks.unshift({ path: currentPath, timestamp: new Date().toISOString() });
            saveBookmarks(bookmarks);
            // Feedback
            $('#btn-add-bookmark').html('<i class="fas fa-star" style="color: #f59e0b;"></i>');
        }
    }

    function updateBookmarkIconState() {
        const bookmarks = getBookmarks();
        const exists = bookmarks.some(b => b.path === currentPath);
        if (exists) {
            $('#btn-add-bookmark').html('<i class="fas fa-star" style="color: #f59e0b;"></i>').attr('title', '取消收藏');
        } else {
            $('#btn-add-bookmark').html('<i class="far fa-star"></i>').attr('title', '收藏当前目录');
        }
    }

    function deleteBookmark(idx) {
        if (!confirm('确认删除此收藏?')) return;
        const bookmarks = getBookmarks();
        bookmarks.splice(idx, 1);
        saveBookmarks(bookmarks);
    }

    function renderBookmarks() {
        const bookmarks = getBookmarks();
        const $list = $('#bookmarksList');
        $list.empty();

        if (bookmarks.length === 0) {
            $list.html('<li style="padding:1rem;text-align:center;color:#999">暂无收藏</li>');
            return;
        }

        bookmarks.forEach((b, i) => {
            const timeStr = new Date(b.timestamp).toLocaleString();
            const $li = $(`
                <li class="bookmark-item">
                    <div class="bookmark-link" title="${b.path}">
                        <div class="bookmark-path">${b.path}</div>
                        <div class="bookmark-time">${timeStr}</div>
                    </div>
                    <button class="bookmark-delete" title="删除"><i class="fas fa-times"></i></button>
                </li>
            `);

            $li.find('.bookmark-link').click(() => {
                loadDirectory(b.path);
                hideBookmarksDrawer();
            });

            $li.find('.bookmark-delete').click((e) => {
                e.stopPropagation();
                deleteBookmark(i);
            });

            $list.append($li);
        });
    }

    function showBookmarksDrawer() {
        renderBookmarks();
        $('#bookmarksOverlay').fadeIn(200);
        $('#bookmarksDrawer').addClass('open');
    }

    function hideBookmarksDrawer() {
        $('#bookmarksOverlay').fadeOut(200);
        $('#bookmarksDrawer').removeClass('open');
    }

    window.navigateTo = function (path) {
        loadDirectory(path);
    }
});
