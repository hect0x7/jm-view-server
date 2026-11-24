var readerGridOverlay = document.getElementById('readerGridOverlay');
var readerGrid = document.getElementById('readerGrid');
var readerGridClose = document.getElementById('readerGridClose');
var readerGridDoublePreview = document.getElementById('readerGridDoublePreview');
var readerGridReverse = document.getElementById('readerGridReverse');
var readerGridReset = document.getElementById('readerGridReset');
var readerGridPersist = document.getElementById('readerGridPersist');
var isGridDoublePreview = (function() {
  try { return localStorage.getItem('jmv-grid-double-preview') === '1'; } catch(e) { return false; }
})();
var draggedSeqIndex = null;
var pointerDragState = null;
var readerGridTypeRefreshPending = false;
var readerGridTypeRefreshTimer = null;
var readerGridCards = new Map();
var readerGridSpreads = new Map();

function flushReaderGridTypeRefresh() {
  if (!readerGridTypeRefreshPending || pointerDragState || draggedSeqIndex !== null) return;
  readerGridTypeRefreshPending = false;
  if (!isGridDoublePreview || !readerGridOverlay || !readerGridOverlay.classList.contains('show')) return;
  var scrollTop = readerGrid.scrollTop;
  var anchor = null, anchorTop = 0;
  if (readerGrid.getBoundingClientRect) {
    var gridTop = readerGrid.getBoundingClientRect().top;
    Array.from(readerGrid.querySelectorAll('[data-reader-page]')).some(function(card) {
      var rect = card.getBoundingClientRect();
      if (rect.bottom > gridTop) { anchor = card; anchorTop = rect.top; return true; }
      return false;
    });
  }
  rebuildReaderGrid();
  readerGrid.scrollTop = anchor && anchor.isConnected ? readerGrid.scrollTop + anchor.getBoundingClientRect().top - anchorTop : scrollTop;
}

function requestReaderGridTypeRefresh() {
  readerGridTypeRefreshPending = true;
  clearTimeout(readerGridTypeRefreshTimer);
  readerGridTypeRefreshTimer = setTimeout(flushReaderGridTypeRefresh, 0);
}

function clearAllDropIndicators() {
  if (!readerGrid) return;
  readerGrid.querySelectorAll('.drop-before, .drop-after, .is-dragging').forEach(function(el) {
    el.classList.remove('drop-before', 'drop-after', 'is-dragging');
  });
}

function updateGridStats() {
  var statsEl = document.getElementById('readerGridStats');
  if (!statsEl) return;
  var pageCount = pageSequence.filter(function(x) { return x.type === 'page'; }).length;
  var blankCount = pageSequence.filter(function(x) { return x.type === 'blank'; }).length;
  statsEl.textContent = '共 ' + pageCount + ' 页' + (blankCount > 0 ? ' · 已插入 ' + blankCount + ' 个空白页' : '');
}

function updateGridCurrentPage() {
  if (!readerGrid) return;
  readerGrid.querySelectorAll('[data-reader-page]').forEach(function(item) {
    var current = parseInt(item.dataset.readerPage, 10) === activePageIndex;
    item.classList.toggle('is-current', current);
    if (current) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
    var badge = item.querySelector('.reader-grid-current-badge');
    if (current && !badge) {
      badge = document.createElement('span'); badge.className = 'reader-grid-current-badge'; badge.textContent = '当前';
      item.querySelector('.reader-grid-thumb-wrap').appendChild(badge);
    } else if (!current && badge) badge.remove();
  });
}

function insertBlankBeforePage(pageIndex) {
  var index = pageSequence.findIndex(function(item) { return item.type === 'page' && item.pageIndex === pageIndex; });
  if (index === -1) return false;
  var blank = { type: 'blank', id: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) };
  pageSequence.splice(index, 0, blank);
  saveSequenceState();
  applySequenceToDOM({ blanksOnly: true });
  if (readerGridOverlay && readerGridOverlay.classList.contains('show')) rebuildReaderGrid();
  if (window.toast) toast('已在第 ' + (pageIndex + 1) + ' 页前插入空白页', 'success');
  return true;
}

function removeReaderBlank(blankId) {
  var index = pageSequence.findIndex(function(item) { return item.type === 'blank' && item.id === blankId; });
  if (index === -1) return false;
  pageSequence.splice(index, 1);
  saveSequenceState();
  applySequenceToDOM({ blanksOnly: true });
  if (readerGridOverlay && readerGridOverlay.classList.contains('show')) rebuildReaderGrid();
  if (window.toast) toast('已移除空白页', 'info');
  return true;
}

function createGridPageCard(pageIdx, seqIdx) {
  var pageEl = rawPages[pageIdx];
  if (!pageEl) return null;
  var sourceImage = pageEl.querySelector('.page-img');
  if (!sourceImage) return null;

  var key = 'page:' + pageIdx;
  var existing = readerGridCards.get(key);
  if (existing) { existing.dataset.seqIndex = String(seqIdx); return existing; }
  var card = document.createElement('div');
  readerGridCards.set(key, card);
  card.className = 'reader-grid-item' + (pageIdx === activePageIndex ? ' is-current' : '');
  card.draggable = true;
  card.dataset.seqIndex = String(seqIdx);
  card.dataset.readerPage = String(pageIdx);
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', '第 ' + (pageIdx + 1) + ' 页，点击跳转，按住拖动调序');

  var thumbWrap = document.createElement('div');
  thumbWrap.className = 'reader-grid-thumb-wrap';

  var thumbImg = document.createElement('img');
  thumbImg.loading = 'lazy';
  thumbImg.decoding = 'async';
  thumbImg.alt = '';
  thumbImg.addEventListener('load', function() {
    updateImagePageType(pageEl.querySelector('.page-img'), thumbImg);
  });
  thumbImg.src = sourceImage.getAttribute('data-src') || sourceImage.getAttribute('data-original') || sourceImage.src;

  var pageBadge = document.createElement('span');
  pageBadge.className = 'reader-grid-badge';
  pageBadge.textContent = '#' + (pageIdx + 1);

  thumbWrap.appendChild(thumbImg);
  thumbWrap.appendChild(pageBadge);

  if (pageIdx === activePageIndex) {
    var curBadge = document.createElement('span');
    curBadge.className = 'reader-grid-current-badge';
    curBadge.textContent = '当前';
    thumbWrap.appendChild(curBadge);
  }

  var insertBtn = document.createElement('button');
  insertBtn.type = 'button';
  insertBtn.className = 'reader-grid-insert-btn';
  insertBtn.title = '在此页前插入空白页';
  insertBtn.innerHTML = (icon('plus') || '') + '<span>在此插页</span>';
  insertBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    insertBlankBeforePage(pageIdx);
  });
  thumbWrap.appendChild(insertBtn);

  thumbWrap.addEventListener('click', function() {
    closeReaderGrid({ afterClose: function() { gotoPage(pageIdx); } });
  });

  var metaEl = document.createElement('div');
  metaEl.className = 'reader-grid-item-meta';
  var pageLabel = document.createElement('span');
  pageLabel.textContent = '第 ' + (pageIdx + 1) + ' 页';
  var dragHandle = createGridDragHandle();
  metaEl.appendChild(pageLabel);
  metaEl.appendChild(dragHandle);

  card.appendChild(thumbWrap);
  card.appendChild(metaEl);

  bindCardDragEvents(card, seqIdx, dragHandle);
  return card;
}

function createGridBlankCard(blankItem, seqIdx) {
  var key = 'blank:' + blankItem.id;
  var existing = readerGridCards.get(key);
  if (existing) { existing.dataset.seqIndex = String(seqIdx); return existing; }
  var blankCard = document.createElement('div');
  readerGridCards.set(key, blankCard);
  blankCard.className = 'reader-grid-blank';
  blankCard.draggable = true;
  blankCard.dataset.seqIndex = String(seqIdx);
  blankCard.setAttribute('role', 'listitem');
  blankCard.setAttribute('aria-label', '空白插页，按住可拖动调序');

  var badgeTag = document.createElement('span');
  badgeTag.className = 'reader-grid-blank-badge-tag';
  badgeTag.textContent = '插页';

  var delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'reader-grid-blank-del';
  delBtn.title = '移除此空白页';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    removeReaderBlank(blankItem.id);
  });

  var iconEl = document.createElement('div');
  iconEl.className = 'reader-grid-blank-icon';
  iconEl.innerHTML = icon('insertPage') || icon('file');

  var titleEl = document.createElement('div');
  titleEl.className = 'reader-grid-blank-title';
  titleEl.textContent = '空白插页';

  var descEl = document.createElement('div');
  descEl.className = 'reader-grid-blank-desc';
  descEl.textContent = '双页对齐调整';

  var dragTip = document.createElement('div');
  dragTip.className = 'reader-grid-blank-drag-tip reader-grid-drag-handle';
  dragTip.textContent = '⋮⋮ 按住拖拽调序';
  dragTip.setAttribute('role', 'button');
  dragTip.setAttribute('aria-label', '拖动空白插页调序');

  blankCard.appendChild(badgeTag);
  blankCard.appendChild(delBtn);
  blankCard.appendChild(iconEl);
  blankCard.appendChild(titleEl);
  blankCard.appendChild(descEl);
  blankCard.appendChild(dragTip);

  bindCardDragEvents(blankCard, seqIdx, dragTip);
  return blankCard;
}

function createGridPlaceholderCard(text) {
  var ph = document.createElement('div');
  ph.className = 'reader-grid-placeholder-card';
  ph.innerHTML = '<div>' + (text || '留白占位') + '</div><span>双页留白</span>';
  return ph;
}

function rebuildReaderGrid() {
  if (!readerGrid) return;
  readerGridTypeRefreshPending = false;
  var desired = [];
  var usedSpreads = new Set();
  updateGridStats();

  if (readerGridPersist) {
    readerGridPersist.checked = !!isSequencePersisted;
  }

  if (readerGridDoublePreview) {
    readerGridDoublePreview.classList.toggle('active', !!isGridDoublePreview);
    readerGridDoublePreview.setAttribute('aria-pressed', isGridDoublePreview ? 'true' : 'false');
  }
  readerGrid.classList.toggle('is-double-preview', !!isGridDoublePreview);

  var currentPurePages = pageSequence.filter(function(x) { return x.type === 'page'; }).map(function(x) { return x.pageIndex; });
  var isPureReversed = currentPurePages.length > 1 && currentPurePages[0] === rawPages.length - 1 && currentPurePages[currentPurePages.length - 1] === 0;
  if (readerGridReverse) {
    readerGridReverse.classList.toggle('active', isPureReversed);
  }

  if (!isGridDoublePreview) {
    pageSequence.forEach(function(item, seqIdx) {
      if (item.type === 'blank') {
        var blankCard = createGridBlankCard(item, seqIdx);
        if (blankCard) desired.push(blankCard);
      } else {
        var pageCard = createGridPageCard(item.pageIndex, seqIdx);
        if (pageCard) desired.push(pageCard);
      }
    });
  } else {
    var previewGroups = buildDoubleGroups();
    var blankIndices = new Map();
    pageSequence.forEach(function(item, seqIdx) {
      if (item.type === 'blank') blankIndices.set(item.id, seqIdx);
    });

    previewGroups.forEach(function(group, gIdx) {
      var spreadKey = JSON.stringify([group.kind, group.slots, group.blankIds]);
      usedSpreads.add(spreadKey);
      var spreadRow = readerGridSpreads.get(spreadKey);
      if (!spreadRow) { spreadRow = document.createElement('div'); readerGridSpreads.set(spreadKey, spreadRow); }
      var spreadChildren = [];
      spreadRow.className = 'reader-grid-spread-row' + (group.kind === 'wide' ? ' is-wide-spread' : '');

      var badgeEl = spreadRow.querySelector('.reader-grid-spread-badge') || document.createElement('span');
      badgeEl.className = 'reader-grid-spread-badge';
      var spreadLabel = group.kind === 'cover' ? '封面 Cover' : ('折页 ' + (gIdx + 1));
      badgeEl.innerHTML = spreadLabel + ' <b>[' + (readingDirection === 'rtl' ? '右←左' : '左→右') + ']</b>';
      spreadChildren.push(badgeEl);

      if (group.kind === 'wide') {
        var pageIdx = group.pages[0];
        var seqIdx = pageSequence.findIndex(function(x) { return x.type === 'page' && x.pageIndex === pageIdx; });
        var card = createGridPageCard(pageIdx, seqIdx >= 0 ? seqIdx : 0);
        if (card) spreadChildren.push(card);
      } else {
        group.slots.forEach(function(slot, sIdx) {
          if (slot !== null) {
            var seqIdx = pageSequence.findIndex(function(x) { return x.type === 'page' && x.pageIndex === slot; });
            var card = createGridPageCard(slot, seqIdx >= 0 ? seqIdx : 0);
            if (card) spreadChildren.push(card);
          } else {
            var blankId = group.blankIds[sIdx];
            if (blankId !== null) {
              var blankSeqIdx = blankIndices.get(blankId);
              spreadChildren.push(createGridBlankCard(pageSequence[blankSeqIdx], blankSeqIdx));
            } else {
              spreadChildren.push(spreadRow.children[spreadChildren.length] || createGridPlaceholderCard(group.kind === 'cover' ? '封面留白' : '对开留白'));
            }
          }
        });
      }
      reconcileReaderGridChildren(spreadRow, spreadChildren);
      desired.push(spreadRow);
    });
  }
  reconcileReaderGridChildren(readerGrid, desired);
  readerGridSpreads.forEach(function(row, key) { if (!usedSpreads.has(key)) readerGridSpreads.delete(key); });
  var usedCards = new Set(pageSequence.map(function(item) { return item.type === 'blank' ? 'blank:' + item.id : 'page:' + item.pageIndex; }));
  readerGridCards.forEach(function(card, key) { if (!usedCards.has(key)) readerGridCards.delete(key); });
  updateGridCurrentPage();
}

function reconcileReaderGridChildren(parent, desired) {
  desired.forEach(function(child, index) {
    if (parent.children[index] !== child) parent.insertBefore(child, parent.children[index] || null);
  });
  while (parent.children.length > desired.length) parent.lastElementChild.remove();
}

function createGridDragHandle() {
  var handle = document.createElement('span');
  handle.className = 'reader-grid-drag-handle';
  handle.textContent = '⋮⋮ 拖动';
  handle.setAttribute('role', 'button');
  handle.setAttribute('aria-label', '拖动页面调序');
  return handle;
}

function moveGridSequenceItem(sourceIdx, targetSeqIdx, isAfter) {
  if (sourceIdx === null || sourceIdx < 0 || sourceIdx >= pageSequence.length) return false;
  if (targetSeqIdx < 0 || targetSeqIdx >= pageSequence.length) return false;

  var targetIdx = isAfter ? targetSeqIdx + 1 : targetSeqIdx;
  var movedItem = pageSequence.splice(sourceIdx, 1)[0];
  if (sourceIdx < targetIdx) targetIdx--;
  if (targetIdx === sourceIdx) {
    pageSequence.splice(sourceIdx, 0, movedItem);
    return false;
  }
  pageSequence.splice(targetIdx, 0, movedItem);
  return true;
}

function commitGridSequenceMove(sourceIdx, targetSeqIdx, isAfter) {
  draggedSeqIndex = null;
  clearAllDropIndicators();
  if (!moveGridSequenceItem(sourceIdx, targetSeqIdx, isAfter)) return;
  saveSequenceState();
  applySequenceToDOM();
  rebuildReaderGrid();
  if (window.toast) toast('已调整页面顺序', 'info');
}

function updatePointerDropTarget(clientX, clientY) {
  if (!pointerDragState) return;
  clearAllDropIndicators();
  var target = document.elementFromPoint(clientX, clientY);
  var targetCard = target && target.closest ? target.closest('.reader-grid-item, .reader-grid-blank') : null;
  if (!targetCard || !readerGrid.contains(targetCard)) {
    pointerDragState.targetSeqIndex = null;
    return;
  }

  var targetSeqIndex = parseInt(targetCard.dataset.seqIndex, 10);
  if (!Number.isFinite(targetSeqIndex) || targetSeqIndex === pointerDragState.sourceSeqIndex) {
    pointerDragState.targetSeqIndex = null;
    pointerDragState.card.classList.add('is-dragging');
    return;
  }
  var rect = targetCard.getBoundingClientRect();
  var isAfter = (clientX - rect.left) > (rect.width / 2);
  pointerDragState.targetSeqIndex = targetSeqIndex;
  pointerDragState.isAfter = isAfter;
  pointerDragState.card.classList.add('is-dragging');
  targetCard.classList.toggle('drop-after', isAfter);
  targetCard.classList.toggle('drop-before', !isAfter);
}

function finishPointerGridDrag(pointerId, commit) {
  if (!pointerDragState || pointerDragState.pointerId !== pointerId) return;
  var state = pointerDragState;
  pointerDragState = null;
  clearAllDropIndicators();
  if (state.handle.hasPointerCapture && state.handle.hasPointerCapture(pointerId)) {
    state.handle.releasePointerCapture(pointerId);
  }
  if (commit && state.targetSeqIndex !== null) {
    commitGridSequenceMove(state.sourceSeqIndex, state.targetSeqIndex, state.isAfter);
  }
  flushReaderGridTypeRefresh();
}

function bindCardDragEvents(card, seqIdx, pointerHandle) {
  card.addEventListener('dragstart', function(e) {
    var seqIdx = Number(card.dataset.seqIndex);
    draggedSeqIndex = seqIdx;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(seqIdx));
    requestAnimationFrame(function() { card.classList.add('is-dragging'); });
  });

  card.addEventListener('dragend', function() {
    draggedSeqIndex = null;
    clearAllDropIndicators();
    flushReaderGridTypeRefresh();
  });

  card.addEventListener('dragover', function(e) {
    var seqIdx = Number(card.dataset.seqIndex);
    if (draggedSeqIndex === null || draggedSeqIndex === seqIdx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var rect = card.getBoundingClientRect();
    var isAfter = (e.clientX - rect.left) > (rect.width / 2);
    card.classList.toggle('drop-after', isAfter);
    card.classList.toggle('drop-before', !isAfter);
  });

  card.addEventListener('dragleave', function() {
    card.classList.remove('drop-before', 'drop-after');
  });

  card.addEventListener('drop', function(e) {
    var seqIdx = Number(card.dataset.seqIndex);
    e.preventDefault();
    e.stopPropagation();
    if (draggedSeqIndex === null || draggedSeqIndex === seqIdx) {
      clearAllDropIndicators();
      return;
    }
    var rect = card.getBoundingClientRect();
    var isAfter = (e.clientX - rect.left) > (rect.width / 2);
    commitGridSequenceMove(draggedSeqIndex, seqIdx, isAfter);
  });

  if (!pointerHandle) return;
  pointerHandle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
  });
  pointerHandle.addEventListener('pointerdown', function(e) {
    var seqIdx = Number(card.dataset.seqIndex);
    if (e.pointerType === 'mouse' || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    pointerDragState = {
      pointerId: e.pointerId,
      sourceSeqIndex: seqIdx,
      targetSeqIndex: null,
      isAfter: false,
      card: card,
      handle: pointerHandle
    };
    pointerHandle.setPointerCapture(e.pointerId);
    card.classList.add('is-dragging');
  });
  pointerHandle.addEventListener('pointermove', function(e) {
    if (!pointerDragState || pointerDragState.pointerId !== e.pointerId) return;
    e.preventDefault();
    updatePointerDropTarget(e.clientX, e.clientY);
  });
  pointerHandle.addEventListener('pointerup', function(e) {
    if (!pointerDragState || pointerDragState.pointerId !== e.pointerId) return;
    e.preventDefault();
    finishPointerGridDrag(e.pointerId, true);
  });
  pointerHandle.addEventListener('pointercancel', function(e) {
    finishPointerGridDrag(e.pointerId, false);
  });
}

var readerGridOpener = null;
var readerGridHistoryActive = false;
var readerGridClosingViaHistory = false;
var readerGridAfterPopCallback = null;
var readerGridPopFallbackTimer = null;
if (readerGridOverlay) readerGridOverlay.inert = true;

function flushReaderGridAfterPop() {
  if (readerGridPopFallbackTimer) {
    clearTimeout(readerGridPopFallbackTimer);
    readerGridPopFallbackTimer = null;
  }
  var cb = readerGridAfterPopCallback;
  readerGridAfterPopCallback = null;
  if (typeof cb === 'function') cb();
}

function pushReaderGridHistory() {
  if (readerGridHistoryActive || !window.history || typeof window.history.pushState !== 'function') return;
  try {
    var nextState = Object.assign({}, (window.history.state && typeof window.history.state === 'object') ? window.history.state : {}, { jmvReaderGrid: true });
    window.history.pushState(nextState, '');
    readerGridHistoryActive = true;
  } catch (err) {}
}

function openReaderGrid() {
  closeReaderModePop();
  if (!readerGridOverlay || !readerGrid) return;
  if (readerGridOverlay.classList.contains('show')) return;
  readerGridOpener = document.activeElement;
  rebuildReaderGrid();
  readerGridOverlay.inert = false;
  readerGridOverlay.classList.add('show');
  readerGridOverlay.setAttribute('aria-hidden', 'false');
  if (tGridButton) tGridButton.classList.add('active');
  if (!readerGridClosingViaHistory) pushReaderGridHistory();
  if (readerGridClose) readerGridClose.focus({ preventScroll: true });
  var current = readerGrid.querySelector('.is-current');
  if (current) requestAnimationFrame(function() { current.scrollIntoView({ block: 'center' }); });
}

function closeReaderGrid(options) {
  var opts = (options && typeof options === 'object' && !('target' in options)) ? options : {};
  if (!readerGridOverlay || !readerGridOverlay.classList.contains('show')) {
    if (typeof opts.afterClose === 'function') opts.afterClose();
    return;
  }
  clearTimeout(readerGridTypeRefreshTimer);
  readerGridTypeRefreshPending = false;
  readerGridOverlay.classList.remove('show');
  readerGridOverlay.setAttribute('aria-hidden', 'true');
  readerGridOverlay.inert = true;
  if (tGridButton) tGridButton.classList.remove('active');
  if (readerGridOpener && readerGridOpener.isConnected && readerGridOpener.focus) {
    readerGridOpener.focus({ preventScroll: true });
  }
  readerGridOpener = null;

  if (opts.fromPopstate) {
    readerGridHistoryActive = false;
    readerGridClosingViaHistory = false;
    if (typeof opts.afterClose === 'function') opts.afterClose();
    return;
  }
  if (readerGridHistoryActive && window.history && typeof window.history.back === 'function') {
    readerGridHistoryActive = false;
    readerGridClosingViaHistory = true;
    if (typeof opts.afterClose === 'function') {
      readerGridAfterPopCallback = opts.afterClose;
      readerGridPopFallbackTimer = setTimeout(function() {
        readerGridClosingViaHistory = false;
        flushReaderGridAfterPop();
      }, 100);
    }
    try { window.history.back(); }
    catch (err) {
      readerGridClosingViaHistory = false;
      flushReaderGridAfterPop();
    }
    return;
  }
  if (typeof opts.afterClose === 'function') opts.afterClose();
}

window.addEventListener('popstate', function() {
  if (readerGridClosingViaHistory) {
    readerGridClosingViaHistory = false;
    flushReaderGridAfterPop();
    if (readerGridOverlay && readerGridOverlay.classList.contains('show')) {
      pushReaderGridHistory();
    }
    return;
  }
  if (readerGridOverlay && readerGridOverlay.classList.contains('show')) {
    closeReaderGrid({ fromPopstate: true });
    return;
  }
  if (readerGridAfterPopCallback) {
    flushReaderGridAfterPop();
  }
});

if (tGridButton) tGridButton.addEventListener('click', function(e) {
  e.preventDefault();
  e.stopPropagation();
  if (readerGridOverlay && readerGridOverlay.classList.contains('show')) closeReaderGrid();
  else openReaderGrid();
});
if (readerGridClose) readerGridClose.addEventListener('click', closeReaderGrid);
if (readerGridOverlay) {
  readerGridOverlay.addEventListener('click', function(e) {
    if (e.target === readerGridOverlay) closeReaderGrid();
  });
  readerGridOverlay.addEventListener('keydown', function(e) {
    if (typeof trapOverlayTab === 'function') trapOverlayTab(readerGridOverlay, e);
  });
}

if (readerGridDoublePreview) {
  readerGridDoublePreview.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    isGridDoublePreview = !isGridDoublePreview;
    try { localStorage.setItem('jmv-grid-double-preview', isGridDoublePreview ? '1' : '0'); } catch(e) {}
    rebuildReaderGrid();
    if (window.toast) toast(isGridDoublePreview ? '已开启缩略图双页对开预览' : '已切换为标准网格缩略图');
  });
}

if (readerGridReverse) {
  readerGridReverse.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    pageSequence.reverse();
    saveSequenceState();
    applySequenceToDOM();
    rebuildReaderGrid();
    if (window.toast) toast('已调转页面顺序', 'info');
  });
}
if (readerGridReset) {
  readerGridReset.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var isOriginal = pageSequence.length === originalSequence.length && pageSequence.every(function(item, idx) {
      return item.type === 'page' && item.pageIndex === originalSequence[idx].pageIndex;
    });
    if (isOriginal) {
      if (window.toast) toast('当前已是原始顺序', 'default');
      return;
    }
    var previousSequence = cloneSequence(pageSequence);
    pageSequence = cloneSequence(originalSequence);
    saveSequenceState();
    var expectedRevision = typeof pageSequenceRevision === 'number' ? pageSequenceRevision : 0;
    applySequenceToDOM();
    rebuildReaderGrid();
    if (window.toast) {
      toast('已恢复原始顺序并清空插页', 'success', {
        actionLabel: '撤销',
        onAction: function() {
          if (typeof pageSequenceRevision === 'number' && pageSequenceRevision !== expectedRevision) {
            toast('页面序列已更新，无法撤销旧的重置', 'info');
            return;
          }
          pageSequence = previousSequence;
          saveSequenceState();
          applySequenceToDOM();
          rebuildReaderGrid();
          toast('已恢复先前的排序与插页', 'success');
        }
      });
    }
  });
}

if (readerGridPersist) {
  readerGridPersist.addEventListener('change', function() {
    isSequencePersisted = !!this.checked;
    saveSequenceState();
    if (isSequencePersisted) {
      if (window.toast) toast('已开启顺序与插页记忆', 'success');
    } else {
      if (window.toast) toast('已关闭记忆（刷新后重置）', 'info');
    }
  });
}

window.addEventListener('jmv:preference-change', function(e) {
  if (!readerInitialized) return;
  if (!e.detail) return;
  if (e.detail.name === 'readingDirection') applyReadingDirection(e.detail.value, false);
  if (e.detail.name === 'doubleWidthScale') applyDoubleWidthScale(e.detail.value, false);
  if (e.detail.name === 'readerMode' && e.detail.value !== readerMode) setReaderMode(e.detail.value, { persist: false });
});
