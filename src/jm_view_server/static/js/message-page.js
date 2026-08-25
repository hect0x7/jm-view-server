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

// 发送按钮图标
document.getElementById('sendBtn').innerHTML = icon('send');

// 实时分析聊天消息以更新右侧统计面板
(function() {
  const chatMessages = document.getElementById('chatMessages');
  const statTotalMsgs = document.getElementById('statTotalMsgs');
  const statTotalUsers = document.getElementById('statTotalUsers');
  const sideCardRank = document.getElementById('sideCardRank');
  const statRankList = document.getElementById('statRankList');

  if (!chatMessages) return;

  function updateStats() {
    const items = chatMessages.querySelectorAll('.message-item');
    const totalMsgs = items.length;

    // 统计发送者发言频次
    const senders = {};
    items.forEach(item => {
      const senderEl = item.querySelector('.message-sender');
      if (senderEl) {
        const name = senderEl.textContent.trim();
        senders[name] = (senders[name] || 0) + 1;
      }
    });

    const uniqueUsers = Object.keys(senders).length;

    // 更新基础数值
    if (statTotalMsgs) statTotalMsgs.textContent = totalMsgs;
    if (statTotalUsers) statTotalUsers.textContent = uniqueUsers;

    // 生成活跃排行
    if (uniqueUsers > 0) {
      const sorted = Object.entries(senders)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (statRankList) {
        statRankList.innerHTML = sorted.map(([name, count], index) => {
          let medal = '';
          if (index === 0) medal = '🥇 ';
          else if (index === 1) medal = '🥈 ';
          else if (index === 2) medal = '🥉 ';
          return `
            <div class="rank-item">
              <span class="rank-name">${medal}${name}</span>
              <span class="rank-count badge">${count} 条</span>
            </div>
          `;
        }).join('');
      }
      if (sideCardRank) sideCardRank.style.display = 'block';
    } else {
      if (sideCardRank) sideCardRank.style.display = 'none';
    }
  }

  // 观察聊天容器的消息增减变化
  const observer = new MutationObserver(updateStats);
  observer.observe(chatMessages, { childList: true, subtree: true });

  // 载入时初次计算
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

  // 注入图标与内容
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
    card.style.transition = 'opacity 0.2s, transform 0.2s';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      card.style.display = 'none';
      localStorage.setItem('jm_chat_hide_tips', '1');
    }, 200);
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
