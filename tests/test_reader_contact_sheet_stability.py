"""Small DOM regressions for image identity during Contact Sheet regrouping."""
import subprocess
from pathlib import Path


def test_regroup_reuses_loaded_images_rows_and_updated_operation_indices():
    script = r"""
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let writes=0,creates=0;const blankUpdates=[];
function node(tag){const events={};return{tag,children:[],dataset:{},attrs:{},className:'',scrollTop:100,isConnected:true,
classList:{contains:n=>n==='show',toggle(){},add(){},remove(){}},
setAttribute(n,v){this.attrs[n]=v},removeAttribute(n){delete this.attrs[n]},addEventListener(n,f){events[n]=f},
emit(n){events[n]({stopPropagation(){}})},
appendChild(x){this.insertBefore(x,null)},insertBefore(x,before){if(x.parent)x.remove();let i=before?this.children.indexOf(before):this.children.length;this.children.splice(i,0,x);x.parent=this;x.isConnected=true},
remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;this.isConnected=false},
get lastElementChild(){return this.children.at(-1)},
querySelector(s){return this.querySelectorAll(s)[0]||null},querySelectorAll(s){let all=[];for(let x of this.children){if(s==='[data-reader-page]'?x.dataset.readerPage!==undefined:x.className.split(' ').includes(s.slice(1)))all.push(x);all.push(...x.querySelectorAll(s))}return all},
getBoundingClientRect(){return{top:0,bottom:100}},getAttribute(n){return this.attrs[n]},
set src(v){this.attrs.src=v;writes++},get src(){return this.attrs.src},
set textContent(v){this.text=v;if(v==='')this.children.forEach(x=>x.parent=null),this.children=[]},get textContent(){return this.text}}
}
let grid=node('div'),overlay=node('div'),groups=[{kind:'cover',slots:[null,0],pages:[0],blankIds:[null,null]},{kind:'pair',slots:[1,2],pages:[1,2],blankIds:[null,null]},{kind:'pair',slots:[3,4],pages:[3,4],blankIds:[null,null]},{kind:'pair',slots:[5,null],pages:[5],blankIds:[null,null]}];
let rawPages=Array.from({length:6},(_,i)=>{let p=node('div'),im=node('img');im.className='page-img';im.attrs['data-src']='/image/'+i;p.appendChild(im);return p});
const ctx={Map,Set,Array,Number,Math,Date,readerMode:'double',rawPages,activePageIndex:0,readingDirection:'ltr',isSequencePersisted:false,
pageSequence:rawPages.map((_,i)=>({type:'page',pageIndex:i})),localStorage:{getItem:()=> '1'},
document:{getElementById:n=>n==='readerGrid'?grid:n==='readerGridOverlay'?overlay:null,createElement:t=>{if(t==='img')creates++;return node(t)}},
window:{},icon:()=>'',buildDoubleGroups:()=>groups,bindCardDragEvents(){},saveSequenceState(){},applySequenceToDOM(options){blankUpdates.push(options.blanksOnly)},updateImagePageType(){},setTimeout(){},clearTimeout(){}};
vm.createContext(ctx);const source=fs.readFileSync('src/jm_view_server/static/js/reader-contact-sheet.js','utf8');
vm.runInContext(source.slice(0,source.indexOf('function moveGridSequenceItem')),ctx);
ctx.rebuildReaderGrid();let cards=Array.from(ctx.readerGridCards.values()),thumbs=cards.map(c=>c.querySelector('.reader-grid-thumb-wrap').children[0]),row=grid.children[2],initialWrites=writes;
ctx.rebuildReaderGrid();assert.equal(creates,6);assert.equal(writes,initialWrites);assert.equal(grid.children[2],row);
groups=[groups[0],{kind:'pair',slots:[1,null],pages:[1],blankIds:[null,null]},{kind:'wide',slots:[2,2],pages:[2],blankIds:[null,null]},groups[2],groups[3]];
ctx.readerGridTypeRefreshPending=true;ctx.flushReaderGridTypeRefresh();assert.equal(grid.children[3],row);
cards.forEach((c,i)=>{assert.equal(ctx.readerGridCards.get('page:'+i),c);assert.equal(c.querySelector('.reader-grid-thumb-wrap').children[0],thumbs[i])});
assert.equal(writes,initialWrites);assert.equal(creates,6);
ctx.isGridDoublePreview=false;ctx.pageSequence.reverse();ctx.rebuildReaderGrid();assert.equal(grid.children[0],cards[5]);
let card=cards[2],before=ctx.pageSequence.findIndex(x=>x.pageIndex===2);card.querySelector('.reader-grid-insert-btn').emit('click');
assert.equal(ctx.pageSequence[before].type,'blank');assert.equal(ctx.pageSequence[before+1].pageIndex,2);
assert.equal(writes,initialWrites);assert.equal(creates,6);
// Leading blanks get their own spread and mirror with RTL without changing the cover gap.
const blanks=Array.from({length:4},(_,i)=>({type:'blank',id:'blank-'+i}));
ctx.pageSequence=[blanks[0],blanks[1],{type:'page',pageIndex:0},blanks[2],blanks[3],{type:'page',pageIndex:1}];
ctx.readingDirection='rtl';
groups=[{kind:'single',slots:[null,null],pages:[],blankIds:['blank-1','blank-0']},
 {kind:'cover',slots:[0,null],pages:[0],blankIds:[null,null]},
 {kind:'single',slots:[null,null],pages:[],blankIds:['blank-3','blank-2']},
 {kind:'single',slots:[null,1],pages:[1],blankIds:[null,null]}];
ctx.isGridDoublePreview=true;ctx.rebuildReaderGrid();
assert.equal(grid.children.length,4);assert.notEqual(grid.children[0],grid.children[2]);
assert.equal(grid.querySelectorAll('.reader-grid-blank').length,4);
for(let n=0;n<4;n++)assert.ok(ctx.readerGridCards.get('blank:blank-'+n).parent);
const firstBlankSpread=grid.children[0],secondBlankSpread=grid.children[2];
const physicalLeft=firstBlankSpread.children[1];
assert.equal(physicalLeft,ctx.readerGridCards.get('blank:blank-1'));
assert.equal(firstBlankSpread.children[2],ctx.readerGridCards.get('blank:blank-0'));
const cover=grid.children[1];
assert.match(cover.children[0].innerHTML,/封面 Cover/);
assert.equal(cover.children[1],cards[0]);
assert.match(cover.children[2].innerHTML,/封面留白/);
ctx.rebuildReaderGrid();
assert.equal(grid.children[0],firstBlankSpread);assert.equal(grid.children[2],secondBlankSpread);
assert.equal(grid.querySelectorAll('.reader-grid-blank').length,4);
// Removing a cached blank follows identity even if its displayed index is stale.
ctx.isGridDoublePreview=false;physicalLeft.dataset.seqIndex='0';
physicalLeft.querySelector('.reader-grid-blank-del').emit('click');
assert.deepEqual(ctx.pageSequence.filter(item=>item.type==='blank').map(item=>item.id),['blank-0','blank-2','blank-3']);
assert.equal(grid.querySelectorAll('.reader-grid-blank').length,3);
assert.deepEqual(blankUpdates,[true,true]);
"""
    result = subprocess.run(['node', '-e', script], cwd=Path(__file__).resolve().parents[1],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
