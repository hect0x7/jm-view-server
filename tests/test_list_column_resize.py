"""Check width constraints, persistence, and drag clicks isolated from sorting."""

import subprocess
from pathlib import Path


def test_list_boundaries_follow_drag_direction_and_keep_total_width():
    script = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/jm_view_server/static/js/index-page.js', 'utf8');
const start = source.indexOf('// 列边界拖动');
const code = source.slice(source.indexOf('(function()', start), source.indexOf('// 给列表/网格视图', start));
function setup(saved) {
  const names = ['name', 'size', 'date', 'action', 'preview'];
  const initial = [500, 110, 160, 104, 90];
  const styles = new Map();
  const storage = new Map(saved ? [['jmv-cols', saved]] : []);
  const events = {};
  const list = {style: {setProperty: (k,v) => styles.set(k,v), getPropertyValue: k => styles.get(k) || ''},
    querySelector: () => ({contains: target => target.inHeader}),
    querySelectorAll: () => names.map((n,i) => ({getBoundingClientRect: () => ({width: width(n,i)})}))};
  const width = (n,i) => n === 'name' ? 964 - names.slice(1).reduce((sum,key,j) => sum + width(key,j+1), 0)
    : parseFloat(styles.get('--col-' + n) || initial[i]);
  const handles = names.slice(1).map(col => ({dataset: {col}, classList: {add() {}, remove() {}}, addEventListener: (n,f) => events[col + n] = f}));
  const context = {document: {querySelector: () => list, querySelectorAll: () => handles, body: {style: {}}},
    localStorage: {getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v)},
    addEventListener: (n,f) => events[n] = f};
  context.window = context;
  vm.runInNewContext(code, context);
  return {width: n => width(n,names.indexOf(n)), storage,
    click(handle,detail=1) { let blocked=false; events.click({detail, target: {inHeader: true, closest: () => handle}, preventDefault() {}, stopImmediatePropagation() {blocked=true;}}); return blocked; },
    nextMouseDown() {events.mousedown();},
    drag(col,delta) { events[col+'mousedown']({clientX: 100, preventDefault() {}, stopPropagation() {}}); events.mousemove({clientX: 100+delta}); events.mouseup(); }};
}
const names = ['name','size','date','action','preview'];
for (const [i,col] of names.slice(1).entries()) {
  const state = setup();
  const left = names[i], beforeLeft = state.width(left), beforeRight = state.width(col);
  state.drag(col,5);
  assert.equal(state.click(false),true, 'release on a header must not sort');
  assert.equal(state.width(left),beforeLeft+5);
  assert.equal(state.width(col),beforeRight-5);
  state.drag(col,-10);
  assert.equal(state.width(left),beforeLeft-5);
  assert.equal(state.width(col),beforeRight+5);
  const restored = setup(state.storage.get('jmv-cols'));
  assert.equal(restored.width(left),state.width(left));
  assert.equal(restored.width(col),state.width(col));
}
const minimum = setup();
minimum.drag('size',1000);
assert.equal(minimum.width('size'),70);
minimum.drag('size',-1000);
assert.equal(minimum.width('name'),120);
assert.equal(names.reduce((sum,n) => sum+minimum.width(n),0),964);
assert.equal(minimum.click(true),true, 'clicking a handle must never sort');
minimum.drag('date',5);
minimum.nextMouseDown();
assert.equal(minimum.click(false),false, 'the next deliberate header click must sort');
minimum.drag('date',-5);
assert.equal(minimum.click(false,0),false, 'keyboard activation must still sort');
"""
    subprocess.run(['node', '-e', script], cwd=Path(__file__).resolve().parents[1], check=True, capture_output=True, text=True)
