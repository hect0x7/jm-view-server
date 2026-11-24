document.addEventListener('DOMContentLoaded', () => {
    // 右侧菜单采用双击显示/隐藏
    const element = document.querySelector('.menu-bolock');
    if (element) {
        document.addEventListener('dblclick', () => {
            if (element.style.display === 'none') {
                element.style.display = 'block';
            } else {
                element.style.display = 'none';
            }
        });
    }

    var hasModernReader = !!document.getElementById('readerConfig');

    // 跳转到底部（现代阅读页由 reader-core.js 统一接管）
    let goBottom = document.getElementById('gobottom');
    if (goBottom != null && !hasModernReader) {
        goBottom
            .addEventListener('click', () => {
                window.scrollTo({ top: document.body.scrollHeight, behavior: (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 'auto' : 'smooth' });
            });
    }

    // 选择页码跳转图片（现代阅读页由 reader-core.js 统一接管）
    let pageSelect = document.getElementById('pageselect');
    if (pageSelect != null && !hasModernReader) {
        pageSelect.addEventListener('change', function () {
            let selectedValue = this.value;
            if (selectedValue !== null) {
                const divid = "page_" + selectedValue;
                let element = document.getElementById(divid);
                if (element) {
                    const topNav = document.getElementById('Comic_Top_Nav');
                    let settop = element.offsetTop - 10 - (topNav ? topNav.offsetHeight : 0);
                    window.scrollTo(0, settop);
                }
                document.getElementById('pageselect').value = selectedValue;
            }
        });
    }

    // 看本页的页码由 reader-core.js 统一维护；非看本页无分节元素时不挂滚动监听
    if (!hasModernReader && pageSelect && document.querySelector('div[id*="page_"]')) {
        window.addEventListener('scroll', function () {
            if (document.body.classList.contains('reader-single') ||
                document.body.classList.contains('reader-double')) return;
            let wsTop = window.scrollY;
            let pageDivs = document.querySelectorAll('div[id*="page_"]');
            let toPage = pageDivs.length - 1;
            if (pageDivs.length > 0) {
                for (let div of pageDivs) {
                    if (div.offsetTop > wsTop) {
                        toPage = parseInt(div.getAttribute("data-page"), 10);
                        break;
                    }
                }
                pageSelect.value = toPage;
            }
        }, { passive: true });
    }

    if (window.JmvImageLoader) {
        JmvImageLoader.scan(document);
        const loadAllBtn = document.getElementById('loadAll');
        if (loadAllBtn) loadAllBtn.addEventListener('click', function () {
            JmvImageLoader.loadAll(document);
        });
    } else {
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                entry.target.src = entry.target.getAttribute('data-src');
                entry.target.classList.remove('lazyload');
                observer.unobserve(entry.target);
            });
        });
        document.querySelectorAll('.lazyload').forEach(function(image) { observer.observe(image); });
        const loadAllBtn = document.getElementById('loadAll');
        if (loadAllBtn) loadAllBtn.addEventListener('click', function() {
            document.querySelectorAll('.lazyload').forEach(function(image) {
                image.src = image.getAttribute('data-src'); image.classList.remove('lazyload'); observer.unobserve(image);
            });
        });
    }

    // ===== 桌面通知与全局消息监听逻辑 =====
    let lastGlobalMsgId = 0;
    const NOTIFY_POLL_ACTIVE_MS = 5000;
    const NOTIFY_POLL_HIDDEN_MS = 30000;
    let pollTimer = null;

    async function checkNewMessages() {
        try {
            const resp = await fetch(`/api/messages?since_id=${lastGlobalMsgId}&limit=1`);
            if (!resp.ok) return;
            const data = await resp.json();

            if (data.messages && data.messages.length > 0) {
                const msg = data.messages[0];
                // 仅在已知有旧 ID 的情况下弹出新进入的消息
                if (lastGlobalMsgId !== 0) {
                    showDesktopNotification(msg);
                }
                lastGlobalMsgId = msg.id;
            }
        } catch (e) {
            // 静默处理错误，不影响其他逻辑
        }
    }

    function scheduleMessagePoll() {
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        const delay = document.hidden ? NOTIFY_POLL_HIDDEN_MS : NOTIFY_POLL_ACTIVE_MS;
        pollTimer = setTimeout(async () => {
            await checkNewMessages();
            scheduleMessagePoll();
        }, delay);
    }

    // 侧边通知函数挂载到全局（复用统一主题 Token、安全 DOM 文本、堆叠容器与悬停暂停）
    window.createSiteNotification = function(msg) {
        let host = document.getElementById('siteNotifyHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'siteNotifyHost';
            host.className = 'jmv-notify-host';
            host.setAttribute('aria-live', 'polite');
            document.body.appendChild(host);
        }
        while (host.children.length >= 3) {
            host.firstElementChild.remove();
        }

        const el = document.createElement('div');
        el.id = 'site-notify-' + Date.now();
        el.className = 'site-notification';
        el.setAttribute('role', 'status');

        const head = document.createElement('div');
        head.className = 'site-notify-head';

        const senderWrap = document.createElement('div');
        senderWrap.className = 'site-notify-sender';
        const dot = document.createElement('span');
        dot.className = 'site-notify-dot';
        const senderName = document.createElement('span');
        senderName.className = 'site-notify-sender-name';
        senderName.textContent = String((msg && msg.sender) || '新消息');
        senderWrap.appendChild(dot);
        senderWrap.appendChild(senderName);

        const meta = document.createElement('div');
        meta.className = 'site-notify-meta';
        const tag = document.createElement('span');
        tag.className = 'site-notify-tag';
        tag.textContent = '新消息';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'site-notify-close';
        closeBtn.setAttribute('aria-label', '关闭通知');
        closeBtn.innerHTML = typeof window.icon === 'function' ? window.icon('x') : '×';
        meta.appendChild(tag);
        meta.appendChild(closeBtn);

        head.appendChild(senderWrap);
        head.appendChild(meta);
        el.appendChild(head);

        const body = document.createElement('div');
        body.className = 'site-notify-body';
        body.textContent = String((msg && msg.content) || '');
        el.appendChild(body);

        if (msg && msg.url) {
            const link = document.createElement('div');
            link.className = 'site-notify-link';
            const linkText = document.createElement('span');
            linkText.textContent = '点击前往查看';
            link.appendChild(linkText);
            if (typeof window.icon === 'function') {
                const arrow = document.createElement('span');
                arrow.setAttribute('aria-hidden', 'true');
                arrow.innerHTML = window.icon('chevronRight');
                link.appendChild(arrow);
            }
            el.appendChild(link);
        }

        let dismissed = false;
        let timer = null;
        let remaining = 6500;
        let startedAt = Date.now();
        const reduced = !!(window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion());

        function dismiss() {
            if (dismissed) return;
            dismissed = true;
            if (timer) { clearTimeout(timer); timer = null; }
            el.classList.remove('is-visible');
            el.classList.add('is-leaving');
            setTimeout(() => el.remove(), reduced ? 0 : 160);
        }
        function schedule() {
            if (dismissed || remaining <= 0) return;
            startedAt = Date.now();
            timer = setTimeout(dismiss, remaining);
        }
        function pause() {
            if (!timer) return;
            clearTimeout(timer);
            timer = null;
            remaining = Math.max(1200, remaining - (Date.now() - startedAt));
        }

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dismiss();
        });
        el.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (msg && msg.url) window.open(msg.url, '_blank');
            dismiss();
        });
        el.addEventListener('mouseenter', pause);
        el.addEventListener('mouseleave', schedule);
        el.addEventListener('focusin', pause);
        el.addEventListener('focusout', schedule);

        host.appendChild(el);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!dismissed) el.classList.add('is-visible');
            });
        });
        schedule();
    };

    function showDesktopNotification(msg) {
        // 如果已在消息页则不通知
        if (window.location.pathname.includes('/message')) return;

        // 后台标签页且已授权时用系统原生通知，避免与前台站内卡片双重打扰
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            const notification = new Notification(`jm-view-server 新消息: ${msg.sender}`, {
                body: msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content,
                icon: '/static/icons/icon-192.png'
            });
            notification.onclick = () => {
                window.open('/message', '_blank');
                window.focus();
            };
            return;
        }

        window.createSiteNotification({
            sender: msg.sender,
            content: msg.content,
            url: '/message'
        });
    }

    // 启动监听（不自动弹出浏览器权限申请框，避免打断非消息场景）
    if (window.location.pathname !== '/login') {
        checkNewMessages().finally(scheduleMessagePoll);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                checkNewMessages().finally(scheduleMessagePoll);
            } else {
                scheduleMessagePoll();
            }
        });
    }
});
