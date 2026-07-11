/**
 * 消息页面交互逻辑
 * 支持增量轮询拉取、自动滚动、昵称记忆
 */
document.addEventListener('DOMContentLoaded', () => {
    const messagesContainer = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const nicknameInput = document.getElementById('nicknameInput');
    const newMsgHint = document.getElementById('newMsgHint');
    const toastEl = document.getElementById('toast');

    // 状态管理
    let lastMsgId = 0;
    let isAtBottom = true;
    let polling = true;
    let pollInterval = null;
    const POLL_MS = 2000; // 每 2 秒轮询一次

    // ===== 昵称记忆 =====
    const savedNickname = localStorage.getItem('jm_chat_nickname');
    if (savedNickname && nicknameInput) {
        nicknameInput.value = savedNickname;
    }

    if (nicknameInput) {
        nicknameInput.addEventListener('input', () => {
            localStorage.setItem('jm_chat_nickname', nicknameInput.value.trim());
        });
    }

    // ===== 消息渲染 =====

    /**
     * 复制文本到剪贴板并提示
     */
    function copyText(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                if (typeof toast === 'function') toast('消息已复制', 'success');
                else showToast('消息已复制');
            }).catch(() => {
                if (typeof toast === 'function') toast('复制失败', 'error');
                else showToast('复制失败');
            });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                if (typeof toast === 'function') toast('消息已复制', 'success');
                else showToast('消息已复制');
            } catch (err) {
                if (typeof toast === 'function') toast('复制失败', 'error');
                else showToast('复制失败');
            }
            document.body.removeChild(textarea);
        }
    }

    /**
     * 将消息对象渲染为 DOM 片段
     */
    function renderMessage(msg) {
        const item = document.createElement('div');
        item.className = 'message-item ' + (msg.is_server ? 'is-server' : 'is-user');
        item.dataset.id = msg.id;

        // 消息头部
        const header = document.createElement('div');
        header.className = 'message-header';

        const sender = document.createElement('span');
        sender.className = 'message-sender';
        sender.textContent = msg.sender;

        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = formatTime(msg.time_str);

        header.appendChild(sender);
        header.appendChild(time);

        // 复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-msg-copy';
        copyBtn.title = '复制消息';
        copyBtn.innerHTML = icon('copy');
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            copyText(msg.content);
        };
        header.appendChild(copyBtn);

        // 如果是服务器本机，为每条消息提供删除按钮
        if (window.IS_LOCAL_HOST) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-msg-delete';
            deleteBtn.title = '删除消息';
            deleteBtn.innerHTML = icon('trash');

            let confirmTimer = null;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (deleteBtn.classList.contains('confirming')) {
                    if (confirmTimer) clearTimeout(confirmTimer);
                    deleteMessage(msg.id);
                } else {
                    deleteBtn.classList.add('confirming');
                    deleteBtn.title = '再次点击以确认删除';
                    confirmTimer = setTimeout(() => {
                        deleteBtn.classList.remove('confirming');
                        deleteBtn.title = '删除消息';
                    }, 3000);
                }
            };
            header.appendChild(deleteBtn);
        }

        // IP 标识（可选）
        if (msg.sender_ip && msg.is_server) {
            const ipBadge = document.createElement('span');
            ipBadge.className = 'message-ip-badge';
            ipBadge.textContent = msg.sender_ip;
            header.appendChild(ipBadge);
        }

        // 消息气泡
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = msg.content;
        bubble.title = '双击复制消息';
        bubble.ondblclick = () => copyText(msg.content);

        item.appendChild(header);
        item.appendChild(bubble);

        return item;
    }

    /**
     * 判断是否需要插入日期分隔符
     */
    function shouldInsertDateDivider(prevMsg, currentMsg) {
        if (!prevMsg) return true;
        const prevDate = prevMsg.time_str.split(' ')[0];
        const curDate = currentMsg.time_str.split(' ')[0];
        return prevDate !== curDate;
    }

    /**
     * 创建日期分隔符
     */
    function createDateDivider(dateStr) {
        const div = document.createElement('div');
        div.className = 'date-divider';
        const span = document.createElement('span');
        span.textContent = dateStr;
        div.appendChild(span);
        return div;
    }

    /**
     * 格式化时间（仅取时分）
     */
    function formatTime(timeStr) {
        if (!timeStr) return '';
        const parts = timeStr.split(' ');
        if (parts.length >= 2) {
            return parts[1].substring(0, 5); // HH:MM
        }
        return timeStr;
    }

    // ===== 消息列表管理 =====

    /**
     * 加载历史消息
     */
    async function loadMessages() {
        try {
            const resp = await fetch(`/api/messages?since_id=${lastMsgId}`);
            if (!resp.ok) return;
            const data = await resp.json();

            // 实时同步已删除的消息
            if (data.active_ids) {
                const activeSet = new Set(data.active_ids.map(Number));
                const items = messagesContainer.querySelectorAll('.message-item');
                items.forEach(item => {
                    const id = Number(item.dataset.id);
                    if (id && !activeSet.has(id)) {
                        item.style.transition = 'opacity 0.25s, transform 0.25s';
                        item.style.opacity = '0';
                        item.style.transform = 'translateY(10px)';
                        setTimeout(() => item.remove(), 250);
                    }
                });
            }

            if (data.messages && data.messages.length > 0) {
                appendMessages(data.messages);
            }
        } catch (e) {
            console.error('拉取消息失败:', e);
        }
    }

    /**
     * 向后端发起请求删除指定消息
     */
    async function deleteMessage(msgId) {
        try {
            const resp = await fetch(`/api/messages?id=${msgId}`, {
                method: 'DELETE'
            });
            if (resp.ok) {
                showToast('消息已删除');
                const item = messagesContainer.querySelector(`.message-item[data-id="${msgId}"]`);
                if (item) {
                    item.style.transition = 'opacity 0.2s, transform 0.2s';
                    item.style.opacity = '0';
                    item.style.transform = 'translateY(10px)';
                    setTimeout(() => item.remove(), 200);
                }
            } else {
                const err = await resp.json();
                showToast(err.error || '删除失败');
            }
        } catch (e) {
            showToast('网络异常');
            console.error('删除消息失败:', e);
        }
    }

    /**
     * 追加消息到列表
     */
    function appendMessages(messages) {
        // 清除空状态
        const empty = messagesContainer.querySelector('.empty-state');
        if (empty) empty.remove();

        const wasAtBottom = checkAtBottom();
        let prevMsg = getLastMessageData();

        messages.forEach(msg => {
            if (msg.id <= lastMsgId) return;

            // 日期分隔符
            if (shouldInsertDateDivider(prevMsg, msg)) {
                messagesContainer.appendChild(createDateDivider(msg.time_str.split(' ')[0]));
            }

            messagesContainer.appendChild(renderMessage(msg));
            prevMsg = msg;
            lastMsgId = msg.id;
        });

        // 滚到底部
        if (wasAtBottom) {
            scrollToBottom();
        } else if (messages.length > 0) {
            // 有新消息但用户在上面浏览，显示新消息提示
            showNewMsgHint();
        }
    }

    /**
     * 获取最后一条消息的数据
     */
    function getLastMessageData() {
        const items = messagesContainer.querySelectorAll('.message-item');
        if (items.length === 0) return null;
        const last = items[items.length - 1];
        const header = last.querySelector('.message-header');
        const timeEl = header ? header.querySelector('.message-time') : null;
        // 从日期分隔符中获取完整日期
        const dividers = messagesContainer.querySelectorAll('.date-divider');
        let lastDate = '';
        if (dividers.length > 0) {
            lastDate = dividers[dividers.length - 1].textContent.trim();
        }
        return {
            time_str: lastDate + ' ' + (timeEl ? timeEl.textContent : ''),
        };
    }

    // ===== 发送消息 =====

    async function sendMessage() {
        const content = messageInput.value.trim();
        if (!content) return;

        const nickname = nicknameInput ? nicknameInput.value.trim() : '';
        if (nicknameInput) {
            localStorage.setItem('jm_chat_nickname', nickname);
        }
        sendBtn.disabled = true;

        try {
            const resp = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: content,
                    sender: nickname,
                }),
            });

            if (resp.ok) {
                messageInput.value = '';
                messageInput.style.height = 'auto';
                // 立即拉取最新消息
                await loadMessages();
                scrollToBottom();
            } else {
                showToast('发送失败，请重试');
            }
        } catch (e) {
            showToast('网络异常');
            console.error('发送消息失败:', e);
        } finally {
            sendBtn.disabled = false;
            messageInput.focus();
        }
    }

    // ===== 滚动管理 =====

    function checkAtBottom() {
        const threshold = 60;
        return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        hideNewMsgHint();
    }

    function showNewMsgHint() {
        if (newMsgHint) {
            newMsgHint.style.display = 'block';
        }
    }

    function hideNewMsgHint() {
        if (newMsgHint) {
            newMsgHint.style.display = 'none';
        }
    }

    // ===== Toast 提示 =====

    function showToast(msg) {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 2500);
    }

    // ===== 输入框自适应高度 =====

    function autoResize() {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    }

    // ===== 事件绑定 =====

    // 发送按钮
    sendBtn.addEventListener('click', sendMessage);

    // Enter 发送（Shift+Enter 换行）
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 输入框自适应
    messageInput.addEventListener('input', autoResize);

    // 滚动监听
    messagesContainer.addEventListener('scroll', () => {
        if (checkAtBottom()) {
            hideNewMsgHint();
        }
    });

    // 新消息提示点击
    if (newMsgHint) {
        newMsgHint.addEventListener('click', scrollToBottom);
    }

    // ===== 轮询启动 =====

    // 首次加载
    loadMessages();

    // 定时轮询
    pollInterval = setInterval(() => {
        if (polling) loadMessages();
    }, POLL_MS);

    // 页面不可见时暂停轮询，节省资源
    document.addEventListener('visibilitychange', () => {
        polling = !document.hidden;
    });
});
