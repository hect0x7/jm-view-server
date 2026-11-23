"""Reader memory keeps album identity across continuous reading."""
import subprocess
from pathlib import Path


def test_sequence_storage_and_sync_are_scoped_per_album():
    source = (Path(__file__).resolve().parents[1] / 'src/jm_view_server/static/js/reader-preferences.js').read_text(encoding='utf-8')
    function = source[source.index('function saveSequenceState()'):source.index('// 同步主阅读流')]
    script = """
const assert = require('node:assert/strict');
const stored = new Map(), sent = new Map();
const localStorage = {setItem:(k,v)=>stored.set(k,v), removeItem:k=>stored.delete(k)};
const readerConfig = {albumPath:'/comics/first', favorites:false};
const ALBUM_RANGES = [{start:0,end:1,path:'/comics/first'}, {start:2,end:3,path:'/comics/second'}];
const rawPages = [0,1,2,3].map(i=>({querySelector:()=>({path:'/pages/' + i + '.png'})}));
let pageSequence = [{type:'page',pageIndex:1},{type:'blank',id:'blank-first'},{type:'page',pageIndex:0},{type:'page',pageIndex:3},{type:'blank',id:'blank-second'},{type:'page',pageIndex:2}];
let isSequencePersisted = true;
const JmvReaderMemory = {imagePath:image=>image.path, sequence:(path,value)=>sent.set(path,value)};
const window = {JmvReaderMemory};
""" + function + """
saveSequenceState();
assert.deepEqual(sent.get('/comics/first'), [{type:'page',path:'/pages/1.png'},{type:'blank',id:'blank-first'},{type:'page',path:'/pages/0.png'}]);
assert.deepEqual(sent.get('/comics/second'), [{type:'page',path:'/pages/3.png'},{type:'blank',id:'blank-second'},{type:'page',path:'/pages/2.png'}]);
assert.deepEqual(JSON.parse(stored.get('jmv-custom-seq:/comics/second')), [{type:'page',pageIndex:1},{type:'blank',id:'blank-second'},{type:'page',pageIndex:0}]);
isSequencePersisted = false;
saveSequenceState();
assert.equal(sent.get('/comics/first'), null);
assert.equal(sent.get('/comics/second'), null);
assert.equal(stored.has('jmv-custom-seq:/comics/first'), false);
assert.equal(stored.has('jmv-custom-seq:/comics/second'), false);
"""
    subprocess.run(['node', '-e', script], check=True, capture_output=True, text=True)


def test_double_page_navigation_corrects_loading_drift_and_yields_to_input():
    source = (Path(__file__).resolve().parents[1] / 'src/jm_view_server/static/js/reader-modes.js').read_text(encoding='utf-8')
    navigation = source[source.index('var readerPageNavigation ='):source.index('function inEditable(')]
    script = """
const assert = require('node:assert/strict');
let scrollY = 0, documentTop = 1800, active = -1, nextTimer = 1;
const timers = new Map(), events = {};
const window = {innerHeight:800, addEventListener:(name,fn)=>events[name]=fn, scrollBy:(x,y)=>scrollY+=y};
const setTimeout = fn=>{const id=nextTimer++;timers.set(id,fn);return id};
const clearTimeout = id=>timers.delete(id);
const readerMode = 'double';
const pages = [null, {getBoundingClientRect:()=>({top:documentTop-scrollY,height:300})}];
const findDoubleGroupIndex = ()=>0;
const setActiveDoubleGroup = (group,index)=>active=index;
""" + navigation + """
navigateDoublePage(1);
assert.equal(active,1);
assert.equal(documentTop-scrollY+150,400);
documentTop+=700;
const next=timers.values().next().value;
next();
assert.equal(documentTop-scrollY+150,400);
events.pointerdown();
assert.equal(readerPageNavigation,null);
assert.equal(timers.size,0);
const settled=scrollY;
documentTop+=300;
assert.equal(scrollY,settled);
navigateDoublePage(1, 0.8);
assert.equal(documentTop-scrollY+240,400);
"""
    subprocess.run(['node', '-e', script], check=True, capture_output=True, text=True)
