"""Regression coverage for migration and mode-specific reader sizing."""

import subprocess
from pathlib import Path


def test_reader_sizing_is_independent_and_legacy_width_is_preserved():
    root = Path(__file__).resolve().parents[1]
    script = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync('src/jm_view_server/static/js/' + name, 'utf8');
const store = new Map([['jmv-img-custom-size', '1050']]);
const context = {
  localStorage: {getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k)},
  CustomEvent: function() {}, dispatchEvent() {},
  readerMode: 'scroll', singleFit: 'contain', doubleWidthScale: 98,
  stream: {style: {setProperty() {}}, classList: {toggle() {}}},
  sizePop: {classList: {toggle() {}}}, sizeRange: {}, sizeVal: {},
  sizeRangeControl: {}, doubleWidthScaleControl: {}, doubleWidthScaleRange: {}, doubleWidthScaleValue: {},
  captureReaderViewport: () => null, restoreReaderViewport() {}
};
context.window = context;
vm.createContext(context);
const app = read('app.js');
const prefs = app.slice(app.indexOf('var JMV_PREF_DEFS'), app.indexOf('window.JMV_READER_SHORTCUTS'));
vm.runInContext(prefs, context);
assert.equal(context.JmvPrefs.get('scrollImageSize'), 1050);
assert.equal(context.JmvPrefs.get('scrollFit'), 'custom');
context.JmvPrefs.set('scrollImageSize', 1200);
vm.runInContext(prefs, context);
assert.equal(context.JmvPrefs.get('scrollImageSize'), 1200);
assert.equal(context.JmvPrefs.get('imageSize'), 1050);
const reader = read('reader-preferences.js');
vm.runInContext(reader.slice(reader.indexOf('function syncSizeControls()'), reader.indexOf('if (tSize && sizePop)')), context);
context.JmvPrefs.set('scrollFit', 'window');
context.applyImageSize(1200, true);
assert.equal(context.stream.style.maxWidth, 'none');
context.applyImageSize(1300, false);
assert.equal(context.stream.style.maxWidth, '1300px');
assert.equal(context.JmvPrefs.get('scrollImageSize'), 1300);
assert.equal(context.JmvPrefs.get('scrollFit'), 'custom');
assert.equal(context.JmvPrefs.get('imageSize'), 1050);
assert.equal(context.JmvPrefs.get('singleFit'), 'contain');
context.readerMode = 'single';
context.applyImageSize(context.JmvPrefs.get('imageSize'), true);
assert.equal(context.stream.style.maxWidth, '1050px');
context.applyImageSize(900, false);
assert.equal(context.JmvPrefs.get('singleFit'), 'custom');
assert.equal(context.JmvPrefs.get('imageSize'), 900);
assert.equal(context.JmvPrefs.get('scrollImageSize'), 1300);
context.readerMode = 'double';
context.applyImageSize(800, true);
assert.equal(context.JmvPrefs.get('imageSize'), 900);
assert.equal(context.JmvPrefs.get('scrollImageSize'), 1300);
context.JmvPrefs.resetPreferences();
vm.runInContext(prefs, context);
assert.equal(context.JmvPrefs.get('scrollFit'), 'window');
assert.equal(context.JmvPrefs.get('scrollImageSize'), 800);
assert.equal(context.JmvPrefs.get('singleFit'), 'contain');
assert.equal(context.JmvPrefs.get('imageSize'), 800);
// A fresh install must not later mistake a newly saved single width for legacy data.
store.clear();
vm.runInContext(prefs, context);
context.JmvPrefs.set('imageSize', 1100);
vm.runInContext(prefs, context);
assert.equal(context.JmvPrefs.get('scrollFit'), 'window');
assert.equal(context.JmvPrefs.get('scrollImageSize'), 800);
assert.equal(context.JmvPrefs.get('imageSize'), 1100);
"""
    subprocess.run(['node', '-e', script], cwd=root, check=True, capture_output=True, text=True)
