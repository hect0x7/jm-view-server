// ---------- 阅读模式、点击翻页与键盘快捷键 ----------
var readerPageNavigation = null;
function cancelReaderPageNavigation() {
  if (!readerPageNavigation) return;
  readerPageNavigation.timers.forEach(clearTimeout);
  readerPageNavigation = null;
}
['pointerdown', 'wheel', 'keydown', 'blur', 'pagehide'].forEach(function(name) {
  window.addEventListener(name, cancelReaderPageNavigation, {capture: true, passive: true});
});
function navigateDoublePage(index, position) {
  cancelReaderPageNavigation();
  var pagePosition = typeof position === 'number' ? position : 0.5;
  var navigation = {index: index, timers: []};
  readerPageNavigation = navigation;
  function align() {
    if (readerPageNavigation !== navigation || readerMode !== 'double' || !pages[index]) return;
    setActiveDoubleGroup(findDoubleGroupIndex(index), index, false);
    var rect = pages[index].getBoundingClientRect();
    window.scrollBy(0, rect.top + rect.height * pagePosition - window.innerHeight / 2);
  }
  align();
  [80, 180, 350, 700, 1200, 2000].forEach(function(delay) {
    navigation.timers.push(setTimeout(align, delay));
  });
  navigation.timers.push(setTimeout(function() { if (readerPageNavigation === navigation) cancelReaderPageNavigation(); }, 2100));
}
function inEditable(t) {
  if (!t) return false;
  var tag = t.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable;
}

function ensurePageLoaded(idx) {
  if (idx < 0 || idx >= pages.length) return;
  var img = pages[idx].querySelector('.page-img');
  if (!img) return;
  if (window.JmvImageLoader) { JmvImageLoader.load(img); return; }
  var source = img.getAttribute('data-src');
  if (source && img.classList.contains('lazyload')) {
    img.src = source;
    img.classList.remove('lazyload');
  }
}

function isPagedMode() {
  return readerMode === 'single';
}

function isWidePage(idx) {
  if (idx < 0 || idx >= pages.length) return false;
  var img = pages[idx].querySelector('.page-img');
  if (!img) return false;
  if (img.dataset.readerWide === '1') return true;
  if (img.dataset.readerWide === '0') return false;
  return !!(img.complete && img.naturalHeight && img.naturalWidth / img.naturalHeight >= 1.2);
}

function getAlbumRangesForGrouping() {
  if (typeof ALBUM_RANGES !== 'undefined' && ALBUM_RANGES && ALBUM_RANGES.length) return ALBUM_RANGES;
  return pages.length ? [{ start: 0, end: pages.length - 1 }] : [];
}

function pushDoublePair(groups, first, second, beforePage) {
  var slots = [null, null];
  var blankIds = [null, null];
  var insertedSlots = [];
  var pageList = [];
  [first, second].forEach(function(item, position) {
    if (!item) return;
    var slot = readingDirection === 'rtl' ? 1 - position : position;
    if (item.type === 'page') {
      slots[slot] = item.pageIndex;
      pageList.push(item.pageIndex);
    } else {
      blankIds[slot] = item.id;
      insertedSlots.push(slot);
    }
  });
  groups.push({
    pages: pageList,
    slots: slots,
    anchor: pageList.length ? pageList[0] : 0,
    kind: first === null ? 'cover' : (pageList.length === 2 ? 'pair' : 'single'),
    blankIds: blankIds,
    insertedSlots: insertedSlots,
    beforePage: beforePage
  });
}

function buildDoubleGroups() {
  var groups = [];
  var seq = (typeof pageSequence !== 'undefined' && pageSequence && pageSequence.length) ?
            pageSequence :
            Array.from(pages).map(function(p, i) { return { type: 'page', pageIndex: i }; });
  if (!seq.length) return groups;

  var cursor = 0;
  var end = seq.length - 1;

  // 竖版封面的起始留白独占一个页槽，序列开头的手动插页占用下一个页槽。
  var firstPage = seq.find(function(item) { return item.type === 'page'; });
  if (firstPage && !isWidePage(firstPage.pageIndex)) {
    var beforePage = seq[cursor].type === 'blank' ? firstPage.pageIndex : null;
    pushDoublePair(groups, null, seq[cursor], beforePage);
    cursor += 1;
  }

  var pendingItem = null;

  for (; cursor <= end; cursor++) {
    var item = seq[cursor];

    if (item.type === 'page' && isWidePage(item.pageIndex)) {
      if (pendingItem !== null) {
        pushDoublePair(groups, pendingItem, null, item.pageIndex);
        pendingItem = null;
      }
      groups.push({ pages: [item.pageIndex], slots: [item.pageIndex, item.pageIndex], anchor: item.pageIndex, kind: 'wide', blankIds: [null, null] });
      continue;
    }

    if (pendingItem === null) {
      pendingItem = item;
    } else {
      var nextRealPage = null;
      if (item.type === 'blank') {
        for (var k = cursor + 1; k <= end; k++) {
          if (seq[k].type === 'page') { nextRealPage = seq[k].pageIndex; break; }
        }
      } else if (pendingItem.type === 'blank') {
        nextRealPage = item.pageIndex;
      }

      pushDoublePair(groups, pendingItem, item, nextRealPage);
      pendingItem = null;
    }
  }

  if (pendingItem !== null) {
    pushDoublePair(groups, pendingItem, null, null);
  }

  return groups;
}

function findDoubleGroupIndex(pageIdx) {
  for (var i = 0; i < doubleGroups.length; i++) {
    if (doubleGroups[i].pages.indexOf(pageIdx) !== -1) return i;
  }
  return Math.max(0, Math.min(doubleGroups.length - 1, activeDoubleGroupIndex));
}

function clearDoublePageState(page) {
  page.classList.remove('is-double-active', 'is-double-current', 'is-double-left', 'is-double-right', 'is-double-wide', 'is-double-cover', 'is-wide-page');
  page.removeAttribute('data-double-slot');
  page.removeAttribute('data-double-group');
  page.style.removeProperty('--reader-double-column');
  page.style.removeProperty('--reader-double-row');
  page.style.removeProperty('grid-column');
  page.style.removeProperty('grid-row');
}

function removeDoubleBlankSlots() {
  doubleBlankSlots.forEach(function(slot) {
    if (slot.parentNode) slot.parentNode.removeChild(slot);
  });
  doubleBlankSlots = [];
}

function createDoubleBlankSlot(groupIndex, slot, blankId, beforePage, isEmptySpread) {
  var isInserted = blankId !== null;
  var blankSlot = document.createElement('div');
  blankSlot.className = 'reader-double-blank' + (isInserted ? ' is-inserted' : '');
  if (isEmptySpread) blankSlot.classList.add('is-empty-spread');
  blankSlot.dataset.doubleGroup = String(groupIndex);
  blankSlot.dataset.doubleSlot = slot;
  blankSlot.style.setProperty('--reader-double-column', slot === 'left' ? '1' : '2');
  blankSlot.style.setProperty('--reader-double-row', String(groupIndex + 1));
  blankSlot.style.gridColumn = slot === 'left' ? '1' : '2';
  blankSlot.style.gridRow = String(groupIndex + 1);

  if (isInserted) {
    blankSlot.setAttribute('role', 'region');
    blankSlot.setAttribute('aria-label', '已插入空白页');

    var iconEl = document.createElement('div');
    iconEl.className = 'reader-double-blank-icon';
    iconEl.innerHTML = icon('insertPage') || icon('file');

    var labelEl = document.createElement('div');
    labelEl.className = 'reader-double-blank-label';
    labelEl.textContent = '已插入空白页';

    var subEl = document.createElement('div');
    subEl.className = 'reader-double-blank-sub';
    subEl.textContent = typeof beforePage === 'number' ? ('第 ' + (beforePage + 1) + ' 页前') : '对齐调整';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'reader-double-blank-remove';
    removeBtn.textContent = '✕ 移除插页';
    removeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      removeReaderBlank(blankId);
    });

    var content = document.createElement('div');
    content.className = 'reader-double-blank-content';
    content.appendChild(iconEl);
    content.appendChild(labelEl);
    content.appendChild(subEl);
    content.appendChild(removeBtn);
    blankSlot.appendChild(content);
  } else {
    blankSlot.setAttribute('aria-hidden', 'true');
  }

  stream.appendChild(blankSlot);
  doubleBlankSlots.push(blankSlot);
}

function setDoubleContinuousLayout(enabled) {
  if (enabled) {
    if (!doubleLayoutOriginalStyles) {
      doubleLayoutOriginalStyles = {
        bodyOverflow: document.body.style.overflow,
        streamHeight: stream.style.height,
        streamMinHeight: stream.style.minHeight,
        streamOverflow: stream.style.overflow,
        streamGridTemplateRows: stream.style.gridTemplateRows,
        streamGridAutoRows: stream.style.gridAutoRows,
        streamRowGap: stream.style.rowGap,
        streamDirection: stream.style.direction
      };
    }
    document.body.style.overflow = 'auto';
    stream.style.height = 'auto';
    stream.style.minHeight = '100vh';
    stream.style.overflow = 'visible';
    stream.style.gridTemplateRows = 'none';
    stream.style.gridAutoRows = 'auto';
    stream.style.rowGap = '0px';
    stream.style.direction = 'ltr';
  } else {
    var original = doubleLayoutOriginalStyles || {};
    document.body.style.overflow = original.bodyOverflow || '';
    stream.style.height = original.streamHeight || '';
    stream.style.minHeight = original.streamMinHeight || '';
    stream.style.overflow = original.streamOverflow || '';
    stream.style.gridTemplateRows = original.streamGridTemplateRows || '';
    stream.style.gridAutoRows = original.streamGridAutoRows || '';
    stream.style.rowGap = original.streamRowGap || '';
    stream.style.direction = original.streamDirection || '';
    doubleLayoutOriginalStyles = null;
  }
}

function renderDoubleGroups() {
  removeDoubleBlankSlots();
  pages.forEach(function(page) {
    page.classList.remove('is-active');
    clearDoublePageState(page);
  });

  doubleGroups.forEach(function(group, groupIndex) {
    group.pages.forEach(function(pageIdx) {
      var page = pages[pageIdx];
      if (!page) return;
      page.classList.add('is-double-active');
      page.dataset.doubleGroup = String(groupIndex);
      page.style.setProperty('--reader-double-row', String(groupIndex + 1));
      page.style.gridRow = String(groupIndex + 1);
      if (group.kind === 'wide') {
        page.classList.add('is-double-wide', 'is-wide-page');
        page.style.gridColumn = '1 / -1';
        return;
      }
      if (group.kind === 'cover') page.classList.add('is-double-cover');
      var slot = group.slots[0] === pageIdx ? 'left' : 'right';
      page.dataset.doubleSlot = slot;
      page.style.setProperty('--reader-double-column', slot === 'left' ? '1' : '2');
      page.style.gridColumn = slot === 'left' ? '1' : '2';
      page.classList.add(slot === 'left' ? 'is-double-left' : 'is-double-right');
    });

    if (group.kind !== 'wide') {
      [0, 1].forEach(function(slotIdx) {
        if (group.slots[slotIdx] === null) {
          var side = slotIdx === 0 ? 'left' : 'right';
          createDoubleBlankSlot(groupIndex, side, group.blankIds[slotIdx], group.beforePage, group.pages.length === 0);
        }
      });
    }
  });
}

function preloadDoubleGroups(groupIndex) {
  [groupIndex, groupIndex - 1, groupIndex + 1].forEach(function(idx) {
    var preloadGroup = doubleGroups[idx];
    if (!preloadGroup) return;
    preloadGroup.pages.forEach(ensurePageLoaded);
  });
}

function setActiveDoubleGroup(groupIndex, preferredPageIdx, persist) {
  if (!doubleGroups.length) return;
  activeDoubleGroupIndex = Math.max(0, Math.min(doubleGroups.length - 1, groupIndex));
  var group = doubleGroups[activeDoubleGroupIndex];
  activePageIndex = group.pages.indexOf(preferredPageIdx) !== -1 ? preferredPageIdx : group.anchor;
  pages.forEach(function(page) { page.classList.remove('is-double-current'); });
  group.pages.forEach(function(pageIdx) {
    if (pages[pageIdx]) pages[pageIdx].classList.add('is-double-current');
  });
  preloadDoubleGroups(activeDoubleGroupIndex);
  updateProgress(activePageIndex);
  updateGridCurrentPage();
  updateInsertPageButtonState();
  if (persist !== false) saveCurrentProgress(activePageIndex);
}

function doubleGroupElement(groupIndex) {
  var group = doubleGroups[groupIndex];
  return group && pages[group.pages[0]] ? pages[group.pages[0]] : null;
}

function scrollToDoubleGroup(groupIndex, behavior) {
  var target = doubleGroupElement(groupIndex);
  if (!target) return;
  target.scrollIntoView({ behavior: behavior || 'smooth', block: 'center' });
}

function updateDoubleGroupFromScroll() {
  if (readerMode !== 'double' || !doubleGroups.length) return;
  if (readerPageNavigation) return;
  var viewportCenter = window.innerHeight / 2;
  var bestGroupIndex = activeDoubleGroupIndex;
  var bestDistance = Infinity;
  doubleGroups.forEach(function(group, groupIndex) {
    var element = doubleGroupElement(groupIndex);
    if (!element) return;
    var rect = element.getBoundingClientRect();
    var top = rect.top, bottom = rect.bottom;
    group.pages.forEach(function(index) {
      var other = pages[index].getBoundingClientRect();
      top = Math.min(top, other.top); bottom = Math.max(bottom, other.bottom);
    });
    var distance = Math.max(top - viewportCenter, viewportCenter - bottom, 0);
    if (distance < bestDistance || (distance === bestDistance && groupIndex === activeDoubleGroupIndex)) {
      bestDistance = distance;
      bestGroupIndex = groupIndex;
    }
  });
  if (bestGroupIndex !== activeDoubleGroupIndex) {
    setActiveDoubleGroup(bestGroupIndex, doubleGroups[bestGroupIndex].anchor, false);
  }
}

function rebuildDoubleGroups(preferredPageIdx, options) {
  options = options || {};
  var keepIndex = typeof preferredPageIdx === 'number' ? preferredPageIdx : activePageIndex;
  var anchorElement = readerMode === 'double' ? pages[keepIndex] : null;
  var anchorTop = anchorElement ? anchorElement.getBoundingClientRect().top : null;
  doubleGroups = buildDoubleGroups();
  activeDoubleGroupIndex = findDoubleGroupIndex(keepIndex);
  if (readerMode !== 'double') return;
  setDoubleContinuousLayout(true);
  renderDoubleGroups();
  if (options.navigateToPage) {
    navigateDoublePage(keepIndex, options.pagePosition);
    return;
  }
  setActiveDoubleGroup(activeDoubleGroupIndex, keepIndex, false);
  if (options.scroll !== false) {
    requestAnimationFrame(function() {
      if (readerMode !== 'double' || readerPageNavigation) return;
      scrollToDoubleGroup(findDoubleGroupIndex(keepIndex), options.behavior || 'auto');
    });
  } else if (anchorTop !== null && pages[keepIndex]) {
    requestAnimationFrame(function() {
      if (readerMode !== 'double' || readerPageNavigation) return;
      var newTop = pages[keepIndex].getBoundingClientRect().top;
      window.scrollBy(0, newTop - anchorTop);
    });
  }
}

function cleanupDoubleLayout() {
  removeDoubleBlankSlots();
  setDoubleContinuousLayout(false);
  pages.forEach(function(page) {
    page.classList.remove('is-active');
    clearDoublePageState(page);
  });
}

function applyDoubleGroup(groupIndex, preferredPageIdx) {
  if (!doubleGroups.length) return;
  setActiveDoubleGroup(groupIndex, preferredPageIdx, true);
  navigateDoublePage(activePageIndex);
}

function scheduleDoubleGroupRebuild() {
  // Cached images can finish before the remaining reader modules are available.
  // Initial mode setup consumes their classifications after all controls exist.
  if (!readerInitialized) return;
  clearTimeout(doubleRebuildTimer);
  doubleRebuildTimer = setTimeout(function() {
    rebuildDoubleGroups(activePageIndex, { scroll: false });
  }, 0);
}

function updateImagePageType(img, loadedImage) {
  loadedImage = loadedImage || img;
  if (!img || !loadedImage || !loadedImage.naturalHeight) return;
  var wide = loadedImage.naturalWidth / loadedImage.naturalHeight >= 1.2 ? '1' : '0';
  if (img.dataset.readerWide === wide) return;
  var wasWide = img.dataset.readerWide === '1';
  img.dataset.readerWide = wide;
  scheduleDoubleGroupRebuild();
  if (wasWide !== (wide === '1') && typeof requestReaderGridTypeRefresh === 'function') {
    requestReaderGridTypeRefresh();
  }
}

stream.addEventListener('load', function(e) {
  // A timeout replacement keeps the previous page shape while its GIF is shown.
  if (e.target && e.target.currentSrc && e.target.currentSrc.indexOf('data:image/') === 0) return;
  if (e.target && e.target.classList && e.target.classList.contains('page-img')) {
    if (typeof updateImageRotationFit === 'function') updateImageRotationFit(e.target);
    updateImagePageType(e.target);
  }
}, true);
pages.forEach(function(page) {
  var img = page.querySelector('.page-img');
  if (img && img.complete && img.currentSrc.indexOf('data:image/') !== 0) updateImagePageType(img);
});

function saveCurrentProgress(idx) {
  if (!ALBUM_RANGES) return;
  for (var i = 0; i < ALBUM_RANGES.length; i++) {
    var range = ALBUM_RANGES[i];
    if (idx >= range.start && idx <= range.end) {
      try { localStorage.setItem(range.key, String(idx - range.start)); } catch (e) {}
      if (window.JmvReaderMemory && !readerConfig.favorites && readerHasInteracted) JmvReaderMemory.progress(range.path || readerConfig.albumPath, pages[idx].querySelector('.page-img'));
      return;
    }
  }
}

function showSingleReaderTip() {
  try {
    if (localStorage.getItem('jmv-onboarding-single-v1') === '1') return;
    localStorage.setItem('jmv-onboarding-single-v1', '1');
  } catch (e) {}
  if (window.toast) toast('单页模式：点击图片左右翻页，按方向键翻页，按 ? 查看帮助', 'success');
}

function setReaderMode(mode, options) {
  options = options || {};
  cancelReaderPageNavigation();
  cancelAnimationFrame(viewportRestoreFrame);
  viewportRestoreFrame = null;
  var nextMode = mode === 'single' || mode === 'double' ? mode : 'scroll';
  var keepIndex = currentPageIdx();
  var previousMode = readerMode;
  var switchToDouble = nextMode === 'double' && previousMode !== 'double' && !options.initial && !!pages[keepIndex];
  var pagePosition;
  if (switchToDouble && previousMode === 'scroll') {
    var rect = pages[keepIndex].getBoundingClientRect();
    if (rect.height > 0) pagePosition = Math.max(0, Math.min(1, (window.innerHeight / 2 - rect.top) / rect.height));
  }
  readerMode = nextMode;
  if (typeof cancelJump === 'function') cancelJump();
  activePageIndex = Math.max(0, Math.min(pages.length - 1, keepIndex));
  document.body.classList.toggle('reader-single', readerMode === 'single');
  document.body.classList.toggle('reader-double', readerMode === 'double');
  stream.classList.toggle('reader-single-mode', readerMode === 'single');
  stream.classList.toggle('reader-double-mode', readerMode === 'double');
  syncReaderModeControl();
  syncImageActionInsert();
  if (window.JmvPrefs && readerMode !== 'double') {
    applyImageSize(JmvPrefs.get(readerMode === 'scroll' ? 'scrollImageSize' : 'imageSize'), true);
  }
  applySingleFit(singleFit, false);
  if (previousMode === 'double' && readerMode !== 'double') cleanupDoubleLayout();
  pages.forEach(function(page, idx) {
    page.classList.toggle('is-active', readerMode === 'single' && idx === activePageIndex);
    if (readerMode !== 'double') clearDoublePageState(page);
  });

  if (readerMode === 'single') {
    window.scrollTo(0, 0);
    ensurePageLoaded(activePageIndex);
    ensurePageLoaded(activePageIndex - 1);
    ensurePageLoaded(activePageIndex + 1);
    updateProgress(activePageIndex);
    if (!options.initial) saveCurrentProgress(activePageIndex);
    if (!options.initial) showSingleReaderTip();
  } else if (readerMode === 'double') {
    rebuildDoubleGroups(activePageIndex, {
      behavior: options.initial ? 'auto' : 'smooth',
      navigateToPage: switchToDouble,
      pagePosition: pagePosition
    });
  } else {
    requestAnimationFrame(function() {
      if (readerMode !== 'scroll') return;
      var target = pages[activePageIndex];
      if (target) target.scrollIntoView({ behavior: options.initial ? 'auto' : 'smooth', block: 'start' });
      updateProgress(activePageIndex);
    });
  }

  if (options.persist !== false) {
    if (window.JmvPrefs) JmvPrefs.set('readerMode', readerMode);
    else try { localStorage.setItem('jmv-reader-mode', readerMode); } catch (e) {}
  }
  updateInsertPageButtonState();
  updateDocumentScrollProgress(false);
}

function gotoPage(idx) {
  if (idx >= pages.length) {
    if (isPagedMode() && isAutoNext && NEXT_DIR_PATH) showJumpCountdown();
    else if (isPagedMode() && window.toast) toast('已经是最后一页');
    return;
  }
  idx = Math.max(0, idx);
  if (idx < pages.length - 1 && typeof cancelJump === 'function') cancelJump();
  var target = pages[idx];
  if (!target) return;
  activePageIndex = idx;
  if (readerMode === 'single') {
    pages.forEach(function(page, pageIdx) { page.classList.toggle('is-active', pageIdx === idx); });
    ensurePageLoaded(idx);
    ensurePageLoaded(idx - 1);
    ensurePageLoaded(idx + 1);
    target.scrollTop = 0;
    updateGridCurrentPage();
  } else if (readerMode === 'double') {
    if (!doubleGroups.length) rebuildDoubleGroups(idx);
    applyDoubleGroup(findDoubleGroupIndex(idx), idx);
    return;
  } else {
    ensurePageLoaded(idx);
    target.scrollIntoView({ behavior: (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 'auto' : 'smooth', block: 'start' });
  }
  updateProgress(idx);
  saveCurrentProgress(idx);
}

function scrollActiveSinglePage(direction) {
  if (readerMode !== 'single' || singleFit !== 'custom') return false;
  var page = pages[activePageIndex];
  if (!page || page.scrollHeight <= page.clientHeight + 4) return false;
  var maxScroll = page.scrollHeight - page.clientHeight;
  var behavior = (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 'auto' : 'smooth';
  if (direction > 0 && page.scrollTop < maxScroll - 4) {
    page.scrollBy({ top: Math.max(160, page.clientHeight * .82), behavior: behavior });
    return true;
  }
  if (direction < 0 && page.scrollTop > 4) {
    page.scrollBy({ top: -Math.max(160, page.clientHeight * .82), behavior: behavior });
    return true;
  }
  return false;
}

function applyReadingDirection(direction, persist) {
  readingDirection = direction === 'rtl' ? 'rtl' : 'ltr';
  var changed = stream.dataset.readingDirection !== readingDirection;
  document.body.dataset.readingDirection = readingDirection;
  stream.dataset.readingDirection = readingDirection;
  document.querySelectorAll('[data-reader-direction]').forEach(function(button) {
    var selected = button.dataset.readerDirection === readingDirection;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (changed && readerMode === 'double') rebuildDoubleGroups(activePageIndex, { scroll: false });
  if (changed && readerGridOverlay && readerGridOverlay.classList.contains('show')) rebuildReaderGrid();
  if (persist) {
    if (window.JmvPrefs) JmvPrefs.set('readingDirection', readingDirection);
    else try { localStorage.setItem('jmv-reading-direction', readingDirection); } catch (e) {}
  }
}
