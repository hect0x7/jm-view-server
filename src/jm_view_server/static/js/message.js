/**
 * 消息页面交互逻辑
 * 支持增量轮询拉取、乐观发送、防 IME 误发、自动滚动与空态恢复
 */
document.addEventListener('DOMContentLoaded', () => {
    const messagesContainer = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const nicknameInput = document.getElementById('nicknameInput');
    const newMsgHint = document.getElementById('newMsgHint');
    const charCount = document.getElementById('charCount');

    let lastMsgId = 0;
    let hasInitialLoad = false;
    let isSending = false;
    let unreadNewCount = 0;
    let polling = true;
    const POLL_MS = 2000;

    // ===== 昵称记忆 =====
    const savedNickname = window.JmvPrefs ? JmvPrefs.get('chatNickname') : localStorage.getItem('jm_chat_nickname');
    if (savedNickname && nicknameInput) {
        nicknameInput.value = savedNickname;
    }

    if (nicknameInput) {
        nicknameInput.addEventListener('input', () => {
            const val = nicknameInput.value.trim();
            if (window.JmvPrefs) JmvPrefs.set('chatNickname', val);
            else localStorage.setItem('jm_chat_nickname', val);
        });
    }

    function notify(msg, type) {
        if (typeof window.toast === 'function') window.toast(msg, type || 'default');
    }

    function copyText(text) {
        const runner = typeof window.jmvCopyText === 'function'
            ? window.jmvCopyText(text)
            : Promise.resolve(false);
        runner.then((ok) => {
            notify(ok ? '消息已复制' : '复制失败，请手动选中复制', ok ? 'success' : 'error');
        });
    }

    function syncComposerState() {
        if (!messageInput || !sendBtn) return;
        const len = messageInput.value.length;
        sendBtn.disabled = isSending || messageInput.value.trim().length === 0;
        if (charCount) {
            if (len >= 4000) {
                charCount.textContent = len + ' / 5000';
                charCount.hidden = false;
            } else {
                charCount.hidden = true;
            }
        }
    }

    function ensureEmptyState() {
        const hasRealItems = messagesContainer.querySelector('.message-item:not(.is-removing)');
        const existingEmpty = messagesContainer.querySelector('.empty-state');
        if (!hasRealItems && !existingEmpty) {
            const empty = document.createElement('div');
            empty.className = 'empty-state rise';
            empty.innerHTML = '<div class="empty-state-icon">💬</div><div class="empty-state-text">还没有消息<br>发送第一条消息开始对话吧</div>';
            messagesContainer.appendChild(empty);
        } else if (hasRealItems && existingEmpty) {
            existingEmpty.remove();
        }
    }

    function pruneOrphanDateDividers() {
        const dividers = Array.from(messagesContainer.querySelectorAll('.date-divider'));
        dividers.forEach(div => {
            let next = div.nextElementSibling;
            let hasMessage = false;
            while (next && !next.classList.contains('date-divider')) {
                if (next.classList.contains('message-item') && !next.classList.contains('is-removing')) {
                    hasMessage = true;
                    break;
                }
                next = next.nextElementSibling;
            }
            if (!hasMessage) div.remove();
        });
    }

    function renderMessage(msg, isNew) {
        const item = document.createElement('div');
        item.className = 'message-item ' + (msg.is_server ? 'is-server' : 'is-user') + (isNew ? ' is-new' : '');
        item.dataset.id = msg.id;

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

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-msg-copy';
        copyBtn.title = '复制消息';
        copyBtn.setAttribute('aria-label', '复制消息');
        copyBtn.innerHTML = icon('copy');
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            copyText(msg.content);
        };
        header.appendChild(copyBtn);

        if (window.IS_LOCAL_HOST) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn-msg-delete';
            deleteBtn.title = '删除消息';
            deleteBtn.setAttribute('aria-label', '删除消息');
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
                    deleteBtn.setAttribute('aria-label', '再次点击以确认删除');
                    confirmTimer = setTimeout(() => {
                        deleteBtn.classList.remove('confirming');
                        deleteBtn.title = '删除消息';
                        deleteBtn.setAttribute('aria-label', '删除消息');
                    }, 3000);
                }
            };
            header.appendChild(deleteBtn);
        }

        if (msg.sender_ip && msg.is_server) {
            const ipBadge = document.createElement('span');
            ipBadge.className = 'message-ip-badge';
            ipBadge.textContent = msg.sender_ip;
            header.appendChild(ipBadge);
        }

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = msg.content;
        bubble.title = '双击复制消息';
        bubble.ondblclick = () => copyText(msg.content);

        item.appendChild(header);
        item.appendChild(bubble);
        return item;
    }

    function createPendingBubble(content, senderName) {
        const item = document.createElement('div');
        item.className = 'message-item ' + (window.IS_LOCAL_HOST ? 'is-server' : 'is-user') + ' is-new is-pending';
        const header = document.createElement('div');
        header.className = 'message-header';
        const sender = document.createElement('span');
        sender.className = 'message-sender';
        sender.textContent = senderName || (window.IS_LOCAL_HOST ? '服务器本机' : '我');
        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = '发送中…';
        header.append(sender, time);

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = content;
        item.append(header, bubble);
        return item;
    }

    function shouldInsertDateDivider(prevMsg, currentMsg) {
        if (!prevMsg) return true;
        const prevDate = (prevMsg.time_str || '').split(' ')[0];
        const curDate = (currentMsg.time_str || '').split(' ')[0];
        return prevDate !== curDate;
    }

    function createDateDivider(dateStr) {
        const div = document.createElement('div');
        div.className = 'date-divider';
        const span = document.createElement('span');
        span.textContent = dateStr;
        div.appendChild(span);
        return div;
    }

    function formatTime(timeStr) {
        if (!timeStr) return '';
        const parts = timeStr.split(' ');
        if (parts.length >= 2) return parts[1].substring(0, 5);
        return timeStr;
    }

    function removeMessageElement(item) {
        if (!item || item.classList.contains('is-removing')) return;
        item.classList.add('is-removing');
        const delay = (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 0 : 200;
        setTimeout(() => {
            item.remove();
            pruneOrphanDateDividers();
            ensureEmptyState();
        }, delay);
    }

    let pollSeq = 0;
    let pollInFlight = false;
    let pollQueued = false;

    async function loadMessages() {
        if (pollInFlight) {
            pollQueued = true;
            return;
        }
        pollInFlight = true;
        const seq = ++pollSeq;
        try {
            const resp = await fetch(`/api/messages?since_id=${lastMsgId}`);
            if (!resp.ok || seq !== pollSeq) return;
            const data = await resp.json();
            if (seq !== pollSeq) return;

            if (data.active_ids) {
                const activeSet = new Set(data.active_ids.map(Number));
                const items = messagesContainer.querySelectorAll('.message-item:not(.is-pending)');
                items.forEach(item => {
                    const id = Number(item.dataset.id);
                    if (id && !activeSet.has(id)) removeMessageElement(item);
                });
            }

            if (data.messages && data.messages.length > 0) {
                appendMessages(data.messages, hasInitialLoad);
            }
            hasInitialLoad = true;
            ensureEmptyState();
        } catch (e) {
            console.error('拉取消息失败:', e);
        } finally {
            pollInFlight = false;
            if (pollQueued) {
                pollQueued = false;
                loadMessages();
            }
        }
    }

    async function deleteMessage(msgId) {
        try {
            const resp = await fetch(`/api/messages?id=${msgId}`, { method: 'DELETE' });
            if (resp.ok) {
                notify('消息已删除', 'success');
                const item = messagesContainer.querySelector(`.message-item[data-id="${msgId}"]`);
                if (item) removeMessageElement(item);
            } else {
                const err = await resp.json().catch(() => ({}));
                notify(err.error || '删除失败', 'error');
            }
        } catch (e) {
            notify('网络异常，删除失败', 'error');
            console.error('删除消息失败:', e);
        }
    }

    function appendMessages(messages, animateNew) {
        const empty = messagesContainer.querySelector('.empty-state');
        if (empty) empty.remove();

        const wasAtBottom = !hasInitialLoad || checkAtBottom();
        let prevMsg = getLastMessageData();
        let addedCount = 0;

        messages.forEach(msg => {
            if (msg.id <= lastMsgId) return;
            if (shouldInsertDateDivider(prevMsg, msg)) {
                messagesContainer.appendChild(createDateDivider((msg.time_str || '').split(' ')[0]));
            }
            const msgEl = renderMessage(msg, !!animateNew);
            if (animateNew) {
                msgEl.addEventListener('animationend', () => msgEl.classList.remove('is-new'), { once: true });
            }
            messagesContainer.appendChild(msgEl);
            prevMsg = msg;
            lastMsgId = msg.id;
            addedCount++;
        });

        if (addedCount > 0) {
            if (wasAtBottom) {
                scrollToBottom(!animateNew);
            } else {
                unreadNewCount += addedCount;
                showNewMsgHint();
            }
        }
    }

    function getLastMessageData() {
        const items = messagesContainer.querySelectorAll('.message-item:not(.is-pending):not(.is-removing)');
        if (items.length === 0) return null;
        const last = items[items.length - 1];
        const header = last.querySelector('.message-header');
        const timeEl = header ? header.querySelector('.message-time') : null;
        const dividers = messagesContainer.querySelectorAll('.date-divider');
        const lastDate = dividers.length > 0 ? dividers[dividers.length - 1].textContent.trim() : '';
        return { time_str: lastDate + ' ' + (timeEl ? timeEl.textContent : '') };
    }

    async function submitPayload(content, nickname, existingPending) {
        if (isSending) return;
        isSending = true;
        syncComposerState();

        const empty = messagesContainer.querySelector('.empty-state');
        if (empty) empty.remove();

        const pendingEl = existingPending || createPendingBubble(content, nickname);
        if (!existingPending) {
            pendingEl.addEventListener('animationend', () => pendingEl.classList.remove('is-new'), { once: true });
            messagesContainer.appendChild(pendingEl);
            scrollToBottom(false);
        } else {
            const failBar = pendingEl.querySelector('.message-fail-actions');
            if (failBar) failBar.remove();
            const timeEl = pendingEl.querySelector('.message-time');
            if (timeEl) timeEl.textContent = '重试中…';
        }

        try {
            const resp = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: content, sender: nickname }),
            });

            if (resp.ok) {
                pendingEl.remove();
                await loadMessages();
                scrollToBottom(false);
            } else {
                throw new Error('发送失败，请重试');
            }
        } catch (e) {
            const timeEl = pendingEl.querySelector('.message-time');
            if (timeEl) timeEl.textContent = '发送失败';
            if (messageInput && !messageInput.value.trim()) {
                messageInput.value = content;
                autoResize();
            }
            let failBar = pendingEl.querySelector('.message-fail-actions');
            if (!failBar) {
                failBar = document.createElement('div');
                failBar.className = 'message-fail-actions';
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'message-edit-btn';
                editBtn.textContent = '填回编辑';
                editBtn.onclick = () => {
                    if (messageInput) {
                        messageInput.value = content;
                        autoResize();
                        messageInput.focus({ preventScroll: true });
                    }
                    pendingEl.remove();
                    ensureEmptyState();
                };
                const retryBtn = document.createElement('button');
                retryBtn.type = 'button';
                retryBtn.className = 'message-retry-btn';
                retryBtn.textContent = '重新发送';
                retryBtn.onclick = () => submitPayload(content, nickname, pendingEl);
                failBar.append(editBtn, retryBtn);
                pendingEl.appendChild(failBar);
            }
            notify('消息发送失败，原文已保留，可重试或修改', 'error');
            console.error('发送消息失败:', e);
        } finally {
            isSending = false;
            syncComposerState();
            if (messageInput) messageInput.focus({ preventScroll: true });
        }
    }

    function sendMessage() {
        if (isSending) return;
        const content = messageInput.value.trim();
        if (!content) return;

        const nickname = nicknameInput ? nicknameInput.value.trim() : '';
        if (nicknameInput) {
            if (window.JmvPrefs) JmvPrefs.set('chatNickname', nickname);
            else localStorage.setItem('jm_chat_nickname', nickname);
        }

        messageInput.value = '';
        messageInput.style.height = 'auto';
        syncComposerState();
        submitPayload(content, nickname, null);
    }

    function checkAtBottom() {
        const threshold = 64;
        return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
    }

    function scrollToBottom(instant) {
        const reduced = !!(window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion());
        if (instant || reduced || !messagesContainer.scrollTo) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
        }
        hideNewMsgHint();
    }

    function showNewMsgHint() {
        if (!newMsgHint) return;
        newMsgHint.textContent = unreadNewCount > 1 ? `有 ${unreadNewCount} 条新消息 ↓` : '有新消息 ↓';
        newMsgHint.classList.add('is-visible');
    }

    function hideNewMsgHint() {
        unreadNewCount = 0;
        if (newMsgHint) newMsgHint.classList.remove('is-visible');
    }

    function autoResize() {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        syncComposerState();
    }

    sendBtn.addEventListener('click', sendMessage);

    // 拦截 IME 输入法合成态回车，彻底避免中文选词误发
    messageInput.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', autoResize);
    syncComposerState();

    messagesContainer.addEventListener('scroll', () => {
        if (checkAtBottom()) hideNewMsgHint();
    }, { passive: true });

    if (newMsgHint) {
        newMsgHint.addEventListener('click', () => scrollToBottom(false));
    }

    loadMessages();
    setInterval(() => {
        if (polling) loadMessages();
    }, POLL_MS);

    document.addEventListener('visibilitychange', () => {
        polling = !document.hidden;
        if (polling) loadMessages();
    });
});
