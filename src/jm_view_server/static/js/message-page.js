window.IS_LOCAL_HOST = JSON.parse(document.getElementById('messageConfig').textContent).isLocalHost;

// 注入 App Shell（侧栏 + 移动底栏）
renderShell('message');

// 地址 pill 图标 + 点击复制
document.getElementById('netIco').innerHTML = icon('network');
document.getElementById('copyIco').innerHTML = icon('copy');
(function() {
  const pill = document.getElementById('addrPill');
  const addrText = document.getElementById('addrText').textContent.trim();
  pill.onclick = function() { copyAddr('http://' + addrText); };
})();

// 仅在浏览器支持且未授权时，在消息页通过用户手势按需开启桌面通知
(function() {
  const notifyBtn = document.getElementById('enableNotifyBtn');
  if (!notifyBtn || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    notifyBtn.hidden = false;
    notifyBtn.addEventListener('click', function() {
      Notification.requestPermission().then(function(perm) {
        notifyBtn.hidden = true;
        if (perm === 'granted') toast('已开启后台桌面通知', 'success');
        else if (perm === 'denied') toast('已拒绝桌面通知，可在浏览器设置中更改', 'default');
      }).catch(function() {});
    });
  }
})();

// 发送按钮图标
document.getElementById('sendBtn').innerHTML = icon('send');

// 实时分析聊天消息以更新右侧统计面板（纯 DOM 构建防 XSS）
(function() {
  const chatMessages = document.getElementById('chatMessages');
  const statTotalMsgs = document.getElementById('statTotalMsgs');
  const statTotalUsers = document.getElementById('statTotalUsers');
  const sideCardRank = document.getElementById('sideCardRank');
  const statRankList = document.getElementById('statRankList');

  if (!chatMessages) return;

  function updateStats() {
    const items = chatMessages.querySelectorAll('.message-item:not(.is-pending):not(.is-removing)');
    const totalMsgs = items.length;

    const senders = {};
    items.forEach(item => {
      const senderEl = item.querySelector('.message-sender');
      if (senderEl) {
        const name = senderEl.textContent.trim();
        senders[name] = (senders[name] || 0) + 1;
      }
    });

    const uniqueUsers = Object.keys(senders).length;

    if (statTotalMsgs) statTotalMsgs.textContent = totalMsgs;
    if (statTotalUsers) statTotalUsers.textContent = uniqueUsers;

    if (uniqueUsers > 0) {
      const sorted = Object.entries(senders)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (statRankList) {
        statRankList.replaceChildren();
        sorted.forEach(([name, count], index) => {
          const medal = index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '';
          const row = document.createElement('div');
          row.className = 'rank-item';
          const nameSpan = document.createElement('span');
          nameSpan.className = 'rank-name';
          nameSpan.textContent = medal + name;
          const countSpan = document.createElement('span');
          countSpan.className = 'rank-count badge';
          countSpan.textContent = count + ' 条';
          row.append(nameSpan, countSpan);
          statRankList.appendChild(row);
        });
      }
      if (sideCardRank) sideCardRank.style.display = 'block';
    } else {
      if (sideCardRank) sideCardRank.style.display = 'none';
    }
  }

  const observer = new MutationObserver(updateStats);
  observer.observe(chatMessages, { childList: true, subtree: true });
  setTimeout(updateStats, 200);
})();

// 提示卡片展示与关闭逻辑
(function() {
  const card = document.getElementById('sideCardTips');
  const closeBtn = document.getElementById('btnTipsClose');
  const tipsContent = document.getElementById('tipsContent');
  if (!card || !closeBtn || !tipsContent) return;

  if (localStorage.getItem('jm_chat_hide_tips') === '1') {
    return;
  }

  closeBtn.innerHTML = icon('x');
  const closeSvg = closeBtn.querySelector('svg');
  if (closeSvg) {
    closeSvg.style.width = '12px';
    closeSvg.style.height = '12px';
  }
  tipsContent.innerHTML = `
    <div>✦ <b>双击复制</b>：双击消息气泡即可直接复制内容。</div>
    <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">✦ <b>悬停复制</b>：悬停消息时点击 <span style="display:inline-flex; width:12px; height:12px; color:var(--text-muted);">${icon('copy')}</span> 图标。</div>
    <div>✦ <b>回车发送</b>：输入框中按 <code>Enter</code> 发送，按 <code>Shift+Enter</code> 换行。</div>
  `;
  tipsContent.querySelectorAll('svg').forEach(svg => {
    svg.style.width = '12px';
    svg.style.height = '12px';
    svg.style.display = 'inline-block';
  });

  card.style.display = 'block';

  closeBtn.onclick = function() {
    card.style.transition = 'opacity 0.18s var(--ease-out), transform 0.18s var(--ease-out)';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      card.style.display = 'none';
      localStorage.setItem('jm_chat_hide_tips', '1');
    }, (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 0 : 180);
  };

  closeBtn.onmouseenter = () => {
    closeBtn.style.opacity = '1';
    closeBtn.style.background = 'var(--bg-sunken)';
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.opacity = '0.6';
    closeBtn.style.background = 'none';
  };
})();
