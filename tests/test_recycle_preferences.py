"""Regression coverage for asynchronous recycle feedback and partial results."""

import subprocess
from pathlib import Path


def test_recycle_feedback_keeps_modal_pending_and_updates_successful_rows():
    root = Path(__file__).resolve().parents[1]
    script = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map(), requests = [], items = [], listeners = new Map();
let confirm = false;
function makeElement() {
  const classes = new Set(), attrs = new Map(), children = [];
  return {
    dataset: {}, style: {}, disabled: false, hidden: false, removed: false, checked: false,
    classList: {add: x=>classes.add(x), remove: x=>classes.delete(x), contains: x=>classes.has(x),
      toggle(x, value) { if(value) classes.add(x); else classes.delete(x); }},
    setAttribute(k,v) {attrs.set(k,v);}, getAttribute: k=>attrs.get(k),
    addEventListener(k,v) {this[k] = v;}, focus() {}, closest() {return null;},
    appendChild(child) {children.push(child);},
    querySelector(selector) {
      if(selector === '.row-select') return this.checkbox || null;
      if(selector === '.recycle-status') return children.find(c=>c.className==='recycle-status'&&!c.removed)||null;
      if(selector === '.file-item') return items.find(c=>!c.removed);
      return null;
    },
    remove() {this.removed=true;},
    dispatchEvent() {}
  };
}
function element(id) {if(!elements.has(id)) elements.set(id,makeElement()); return elements.get(id);}
function addItem(path) {
 const item=makeElement();
 item.checkbox=makeElement(); item.checkbox.dataset.path=encodeURIComponent(path); item.checkbox.checked=true;
 items.push(item); return item;
}
const one=addItem('first.txt'), oneGrid=addItem('first.txt'), two=addItem('second.txt');
const context = {
 document: {
  getElementById: element, createElement: makeElement, activeElement: element('trigger'),
  contains: e=>!e.removed, addEventListener: (k,v)=>listeners.set(k,v),
  querySelectorAll: selector=>selector==='.row-select:checked'?
    items.filter(i=>!i.removed&&i.checkbox.checked).map(i=>i.checkbox):items.filter(i=>!i.removed),
  querySelector: ()=>makeElement()
 },
 Promise, Event: function() {}, icon:()=>'', toast() {},
 JmvPrefs: {get:()=>confirm}, requestAnimationFrame: fn=>fn(),
 JmvColumnView: {removePaths(paths) {this.removed=paths;}},
 XMLHttpRequest: function() {
  this.open=(method,url)=>{this.url=url;}; this.setRequestHeader=()=>{};
  this.send=body=>{this.body=body; requests.push(this);};
 }
};
context.window=context;
vm.createContext(context);
const code=fs.readFileSync('src/jm_view_server/static/js/index-page.js','utf8');
vm.runInContext(code.slice(code.indexOf('var deleteConfirmState'),code.indexOf('/* ========== 打包下载 / 文件管理 / 批量')),context);
for(const [start,end] of [['function selectedPaths()', 'document.addEventListener(\'change\''],
 ['function batchDelete()', 'window.batchDelete']]) {
 vm.runInContext(code.slice(code.indexOf(start),code.indexOf(end,code.indexOf(start))),context);
}
const event={stopPropagation(){},preventDefault(){},currentTarget:element('trigger')};
const tick=async()=>{for(let i=0;i<8;i++) await Promise.resolve();};
function respond(request,result,status=200) {
 request.status=status; request.responseText=typeof result==='string'?result:JSON.stringify(result); request.onload();
}
(async()=>{
 // Default direct recycle stays asynchronous and prevents duplicate submissions.
 context.deleteItem(event,'first.txt','first.txt'); await tick();
 assert.equal(requests.length,1); assert.equal(requests[0].url,'/api/delete');
 assert.equal(element('deleteConfirmOverlay').classList.contains('open'),false);
 assert.equal(one.inert,true); assert.equal(oneGrid.inert,true);
 assert.equal(element('batchDeleteButton').disabled,true);
 context.deleteItem(event,'first.txt','first.txt'); context.batchDelete(); await tick();
 assert.equal(requests.length,1);
 respond(requests[0],{status:'ok'}); await tick();
 assert.equal(one.removed,true); assert.equal(oneGrid.removed,true); assert.equal(two.removed,false);
 assert.equal(element('batchDeleteButton').disabled,false);

 // Confirmation cancellation sends nothing; accept keeps the modal busy until success.
 confirm=true;
 context.deleteItem(event,'second.txt','second.txt'); context.closeDeleteConfirm(false); await tick();
 assert.equal(requests.length,1);
 context.deleteItem(event,'second.txt','second.txt'); await tick();
 context.closeDeleteConfirm(true); await tick();
 assert.equal(requests.length,2); assert.equal(element('deleteConfirmOverlay').classList.contains('open'),true);
 assert.equal(element('deleteConfirmSubmit').disabled,true);
 context.closeDeleteConfirm(false);
 listeners.get('keydown')({key:'Escape',preventDefault(){}}); await tick();
 assert.equal(element('deleteConfirmOverlay').classList.contains('open'),true);
 context.closeDeleteConfirm(true); await tick(); assert.equal(requests.length,2);
 respond(requests[1],{error:'simulated failure'},500); await tick();
 assert.equal(two.removed,false); assert.equal(two.inert,false);
 assert.equal(element('deleteConfirmOverlay').classList.contains('open'),true);
 assert.equal(element('deleteConfirmCancel').disabled,false);
 assert.equal(element('deleteConfirmSubmit').hidden,true);
 assert.match(element('deleteConfirmMessage').textContent,/simulated failure/);
 context.closeDeleteConfirm(false);

 // List and grid selection is deduplicated; partial failures retain only failed rows.
 const third=addItem('third.txt'), thirdGrid=addItem('third.txt');
 confirm=false;
 context.batchDelete(); await tick();
 assert.equal(requests.length,3);
 assert.equal(new URLSearchParams(requests[2].body).get('paths'),'second.txt\nthird.txt');
 respond(requests[2],{status:'ok',succeeded:['third.txt'],failed:[{path:'second.txt',error:'denied'}]}); await tick();
 assert.equal(third.removed,true); assert.equal(thirdGrid.removed,true); assert.equal(two.removed,false);
 assert.equal(two.checkbox.checked,true); assert.equal(two.inert,false);
 assert.equal(element('batchCount').textContent,'已选 1 项');

 // Network, invalid JSON, and abort unlock the controls without claiming success.
 for(const fail of [r=>r.onerror(),r=>respond(r,'invalid'),r=>respond(r,'null'),r=>r.onabort()]) {
  context.deleteItem(event,'second.txt','second.txt'); await tick();
  fail(requests.at(-1)); await tick();
  assert.equal(two.removed,false); assert.equal(two.inert,false);
  assert.equal(element('batchDeleteButton').disabled,false);
 }
 confirm=true;
 context.deleteItem(event,'second.txt','second.txt'); await tick(); context.closeDeleteConfirm(true); await tick();
 respond(requests.at(-1),{status:'ok'}); await tick();
 assert.equal(two.removed,true); assert.equal(element('deleteConfirmOverlay').classList.contains('open'),false);
 assert.equal(context.recycleInProgress,false);
 // Reload must never be used by the recycle flow.
 assert.equal(code.slice(code.indexOf('var deleteConfirmState'),code.indexOf('/* ========== 打包下载 / 文件管理 / 批量')).includes('location.reload'),false);
})().catch(error=>{console.error(error);process.exitCode=1;});
"""
    result = subprocess.run(['node', '-e', script], cwd=root, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_legacy_recycle_uses_shared_confirmation_preference():
    root = Path(__file__).resolve().parents[1]
    script = r"""
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const storage=new Map();
let handler, confirmations=0, sent=0, approved=false;
const context={document:{},CustomEvent:function(){},dispatchEvent(){},
 localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 $:selector=>selector==='#ctxDeletePath'?{click:fn=>handler=fn}:{data:k=>k==='target-path'?'fixture.txt':'fixture.txt'},
 confirm:()=>{confirmations++;return approved;},hideContextMenu(){}};
context.window=context; context.$.ajax=()=>sent++;
vm.createContext(context);
const app=fs.readFileSync('src/jm_view_server/static/js/app.js','utf8');
vm.runInContext(app.slice(app.indexOf('var JMV_PREF_DEFS'),app.indexOf('window.JMV_READER_SHORTCUTS')),context);
const legacy=fs.readFileSync('src/jm_view_server/static/js/index_spa.js','utf8');
const start=legacy.indexOf("$('#ctxDeletePath').click");
vm.runInContext(legacy.slice(start,legacy.indexOf('\n        });',start)+'\n        });'.length),context);
assert.equal(context.JmvPrefs.get('confirmRecycle'),false);
handler();assert.equal(sent,1);assert.equal(confirmations,0);
context.JmvPrefs.set('confirmRecycle',true);
handler();assert.equal(sent,1);assert.equal(confirmations,1);
approved=true;handler();assert.equal(sent,2);
context.JmvPrefs.remove('confirmRecycle');handler();assert.equal(sent,3);
context.localStorage.getItem=()=>{throw new Error('Storage unavailable');};
handler();assert.equal(sent,4);
"""
    result = subprocess.run(['node', '-e', script], cwd=root, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_column_recycle_removes_managed_entry_without_deleting_shortcut_target():
    root = Path(__file__).resolve().parents[1]
    script = r"""
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={document:{getElementById:()=>null,querySelectorAll:()=>[]},URL,
 location:{href:'http://example.com/'},history:{replaceState(){},pushState(){}}};
context.window=context;vm.createContext(context);
let code=fs.readFileSync('src/jm_view_server/static/js/column-view.js','utf8');
code=code.replace('window.JmvColumnView = {','window.testColumnState = state; window.JmvColumnView = {');
vm.runInContext(code,context);
const state=context.testColumnState;
const target={path:'/comics/book',quoted_path:encodeURIComponent('/comics/book'),manage_quoted_path:encodeURIComponent('/comics/book')};
const link={...target,is_link:true,manage_quoted_path:encodeURIComponent('/comics/shortcut.lnk')};
state.trail=['/comics','/comics/book'];
state.selectedByPath['/comics']='/comics/book';
state.selectedKeyByPath['/comics']='link:/comics/shortcut.lnk';
state.cache={'/comics':{status:'ready',files:[target,link]},'/comics/book':{status:'ready',files:[]},
 '/comics/book/sub':{status:'ready',files:[]}};
context.JmvColumnView.removePaths(['/comics/shortcut.lnk']);
assert.equal(state.cache['/comics'].files.length,1);
assert.equal(state.cache['/comics'].files[0].path,'/comics/book');
assert.equal(state.trail.length,2);
assert.equal(state.selectedKeyByPath['/comics'],undefined);
context.JmvColumnView.removePaths(['/comics/book']);
assert.equal(state.cache['/comics'].files.length,0);
assert.equal(state.cache['/comics/book'],undefined);
assert.equal(state.cache['/comics/book/sub'],undefined);
assert.equal(state.trail.length,1);
"""
    result = subprocess.run(['node', '-e', script], cwd=root, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
