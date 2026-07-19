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

    // 跳转到底部
    let goBottom = document.getElementById('gobottom');
    if (goBottom != null) {
        goBottom
            .addEventListener('click', () => {
                window.scrollTo(0, document.body.scrollHeight);
            });
    }

    // 选择页码跳转图片
    let pageSelect = document.getElementById('pageselect');
    if (pageSelect != null) {
        pageSelect.addEventListener('change', function () {
            let selectedValue = this.value;
            if (selectedValue !== null) {
                const divid = "page_" + selectedValue;
                let element = document.getElementById(divid);
                if (element) {
                    let settop = element.offsetTop - 10 - document.getElementById('Comic_Top_Nav').offsetHeight;
                    window.scrollTo(0, settop);
                }
                document.getElementById('pageselect').value = selectedValue;
            }
        });
    }


    window.addEventListener('scroll', function () {
        if (document.body.classList.contains('reader-single') ||
            document.body.classList.contains('reader-double')) return;
        let wsTop = window.scrollY
        let pageDivs = document.querySelectorAll('div[id*="page_"]');
        let toPage = pageDivs.length - 1;

        if (pageDivs.length > 0) {
            for (let div of pageDivs) {
                let divTop = div.offsetTop;
                if (divTop > wsTop) {
                    toPage = parseInt(div.getAttribute("data-page"));
                    break
                }
            }
            const ps = document.getElementById('pageselect');
            if (ps) ps.value = toPage;
        }
    });

    const lazyImages = document.querySelectorAll(".lazyload");

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.getAttribute("data-src");
                img.classList.remove("lazyload");
                observer.unobserve(img);
            }
        });
    });

    lazyImages.forEach(img => {
        observer.observe(img);
    });
    
    const loadAllBtn = document.getElementById("loadAll");
    if (loadAllBtn) {
        loadAllBtn.addEventListener('click', function () {
            lazyImages.forEach(img => {
                img.src = img.getAttribute("data-src");
                img.classList.remove("lazyload");
            });
        })
    }

    // ===== 桌面通知与全局消息监听逻辑 =====
    let lastGlobalMsgId = 0;
    const NOTIFY_POLL_MS = 5000;

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

    // 侧边通知函数挂载到全局
    window.createSiteNotification = function(msg) {
        const id = 'site-notify-' + Date.now();
        const html = `
            <div id="${id}" class="site-notification" style="
                position: fixed; top: 24px; right: 24px; 
                width: 320px; background: rgba(15, 23, 42, 0.9); 
                backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px; padding: 18px; color: white;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
                z-index: 999999; cursor: pointer; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                transform: translateX(400px);
            ">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 8px; height: 8px; background: #818cf8; border-radius: 50%;"></div>
                        <span style="font-weight: 600; color: #f8fafc; font-size: 14px;">${msg.sender}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 11px; color: #94a3b8; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 10px;">通知</span>
                        <button class="site-notify-close" style="background:none; border:none; color:#94a3b8; font-size:18px; cursor:pointer; padding:0; line-height:1;" aria-label="关闭">×</button>
                    </div>
                </div>
                <div style="font-size: 13.5px; color: #cbd5e1; line-height: 1.6; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
                    ${msg.content}
                </div>
                ${msg.url ? `
                <div style="margin-top: 12px; font-size: 11px; color: #818cf8; display: flex; align-items: center; gap: 4px;">
                    点击前往查看 <i class="fas fa-chevron-right"></i>
                </div>` : ''}
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        const el = document.getElementById(id);
        
        // 入场
        setTimeout(() => el.style.transform = 'translateX(0)', 100);
        
        el.onclick = (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                el.remove();
                return;
            }
            if (msg.url) {
                window.open(msg.url, '_blank');
            }
            el.remove();
        };

        // 7秒自动关闭
        setTimeout(() => {
            if (el && el.parentNode) {
                el.style.transform = 'translateX(400px)';
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 400);
            }
        }, 7000);
    };

    function showDesktopNotification(msg) {
        // 如果已在消息页则不通知
        if (window.location.pathname.includes('/message')) return;

        // 尝试通过浏览器原生通知
        if ("Notification" in window && Notification.permission === "granted") {
            const notification = new Notification(`JM Server 新消息: ${msg.sender}`, {
                body: msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content,
                icon: '/static/img/favicon.ico'
            });
            notification.onclick = () => {
                window.open('/message', '_blank');
                window.focus();
            };
        }

        // 统一致电侧边消息
        window.createSiteNotification({
            sender: msg.sender,
            content: msg.content,
            url: '/message'
        });
    }

    // 启动监听
    if (window.location.pathname !== '/login') {
        if ("Notification" in window && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
        // 初始化获取一次 ID
        checkNewMessages();
        // 开始循环
        setInterval(checkNewMessages, NOTIFY_POLL_MS);
    }
});
