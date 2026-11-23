"""Long presses open an explicit action dialog without mutating favorites."""
import subprocess
from pathlib import Path


def test_image_actions_gestures_explicit_actions_and_stale_reads():
    script = r"""
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let now=0,next=1;const timers=new Map(),globalEvents={},reads=[],sets=[],inserts=[];
function node(id){const events={},classes=new Set();return {id,dataset:{},attributes:{},isConnected:true,disabled:false,
 classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n)},
 addEventListener(n,f){events[n]=f},emit(n,e={}){return events[n]?.call(this,e)},
 setAttribute(n,v){this.attributes[n]=v},removeAttribute(n){delete this.attributes[n]},
 getAttribute(n){return this.attributes[n]},focus(){context.document.activeElement=this},
 closest(s){return s==='.page-img'?this:s==='.scramble-page'?this.pageWrapper:null}
};}
const ids=['imageActions','imageActionPreview','imageActionTitle','imageActionFavorite','imageActionStatus','imageActionClose','imageActionInsert'];
const els=Object.fromEntries(ids.map(id=>[id,node(id)])),rotate=node('rotate');rotate.dataset.rotate='90';
const a=node('a'),b=node('b');a.attributes['data-original']='/image/a';b.attributes['data-original']='/image/b';
a.pageWrapper={dataset:{page:'0'}};b.pageWrapper={dataset:{page:'7'}};
const stream=node('stream');
els.imageActions.querySelectorAll=s=>s==='[data-rotate]'?[rotate]:[els.imageActionClose,els.imageActionFavorite,els.imageActionInsert,rotate].filter(x=>!x.disabled&&!x.hidden);
const context={stream,readerMode:'single',pageClickTimer:null,Date:{now:()=>now},Math,
 document:{getElementById:id=>els[id],activeElement:stream},
 setTimeout(f,delay){const id=next++;timers.set(id,{f,delay});return id},clearTimeout:id=>timers.delete(id),
 addEventListener(n,f){globalEvents[n]=f},
 setImageRotation(i,v){i.dataset.rotate=v},
 insertBlankBeforePage(index){inserts.push(index);return true},
 JmvFavorites:{read(i){return new Promise(resolve=>reads.push({image:i,resolve}))},
 set(i,wanted){sets.push({image:i,wanted});return Promise.resolve(wanted)}}
};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('src/jm_view_server/static/js/reader-image-actions.js','utf8'),context);
const event=(type,id=1)=>({target:a,isPrimary:true,pointerType:type,button:0,pointerId:id,clientX:10,clientY:10});
function tick(){const [id,t]=timers.entries().next().value;timers.delete(id);now+=t.delay;t.f();}
async function flush(){await Promise.resolve();await Promise.resolve();}
(async()=>{
 stream.emit('pointerdown',event('touch'));assert.equal(timers.values().next().value.delay,650);
 globalEvents.pointermove({...event('touch'),target:stream,clientX:30});assert.equal(timers.size,0);
 stream.emit('pointerdown',event('mouse'));assert.equal(timers.values().next().value.delay,520);
 globalEvents.pointerup({...event('mouse'),pointerId:2});assert.equal(timers.size,1);
 globalEvents.pointercancel(event('mouse'));assert.equal(timers.size,0);
 stream.emit('pointerdown',event('touch'));globalEvents.scroll();assert.equal(timers.size,0);
 stream.emit('pointerdown',event('mouse'));tick();
 assert.equal(els.imageActions.classList.contains('show'),true);assert.equal(reads.length,1);assert.equal(sets.length,0);
 assert.equal(els.imageActionInsert.hidden,true);
 els.imageActionInsert.emit('click');assert.deepEqual(inserts,[]);
 let navigationPrevented=0;
 for (const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End']) {
   els.imageActions.emit('keydown',{key,preventDefault(){navigationPrevented++}});
 }
 assert.equal(navigationPrevented,8);
 els.imageActions.emit('keydown',{key:' ',preventDefault(){navigationPrevented++}});
 assert.equal(navigationPrevented,8);
 globalEvents.pointerup(event('mouse'));assert.equal(sets.length,0);
 reads.shift().resolve({favorite:false});await flush();
 assert.equal(els.imageActionFavorite.dataset.favorite,'0');assert.equal(els.imageActionFavorite.disabled,false);
 await els.imageActionFavorite.emit('click');assert.equal(sets.length,1);assert.equal(sets[0].image,a);assert.equal(sets[0].wanted,true);
 await els.imageActionFavorite.emit('click');assert.equal(sets.length,2);assert.equal(sets[1].wanted,false);
 // Delayed read of A must not paint B's dialog or enable its pending button.
 context.openImageActions(a);context.openImageActions(b);
 const readA=reads.shift(),readB=reads.shift();readA.resolve({favorite:true});await flush();
 assert.equal(context.imageActionTarget,b);assert.equal(els.imageActionFavorite.dataset.favorite,'');assert.equal(els.imageActionFavorite.disabled,true);
 readB.resolve({favorite:false});await flush();assert.equal(els.imageActionFavorite.dataset.favorite,'0');
 await els.imageActionFavorite.emit('click');assert.equal(sets.at(-1).image,b);
 rotate.focus();let prevented=false;els.imageActions.emit('keydown',{key:'Tab',preventDefault(){prevented=true}});
 assert.equal(prevented,true);assert.equal(context.document.activeElement,els.imageActionClose);
 rotate.emit('click');assert.equal(b.dataset.rotate,'90');assert.equal(els.imageActions.classList.contains('show'),false);
 assert.equal(els.imageActions.attributes['aria-hidden'],'true');assert.ok('inert' in els.imageActions.attributes);
 // A replaced appended image still uses its original wrapper index, never its order on screen.
 context.readerMode='double';context.openImageActions(b);
 assert.equal(els.imageActionInsert.hidden,false);
 assert.equal(els.imageActionTitle.textContent,'第 8 页 · 图片操作');
 const replacement=node('replacement');replacement.pageWrapper=b.pageWrapper;b.pageWrapper=null;
 globalEvents['jmv:reader-image-replaced']({detail:{previous:b,image:replacement}});
 els.imageActionInsert.focus();context.readerMode='scroll';context.syncImageActionInsert();
 assert.equal(els.imageActionInsert.hidden,true);assert.equal(context.document.activeElement,els.imageActionClose);
 els.imageActionInsert.emit('click');assert.deepEqual(inserts,[]);
 context.readerMode='double';context.syncImageActionInsert();
 els.imageActionInsert.emit('click');assert.deepEqual(inserts,[7]);
 assert.equal(els.imageActions.classList.contains('show'),false);
 reads.shift().resolve({favorite:false});await flush();
 // A double click has no favorite handler in the action layer.
 const before=sets.length;stream.emit('dblclick',{target:a});assert.equal(sets.length,before);
})().catch(e=>{console.error(e);process.exitCode=1});
"""
    subprocess.run(['node', '-e', script], cwd=Path(__file__).resolve().parents[1],
                   check=True, capture_output=True, text=True)
