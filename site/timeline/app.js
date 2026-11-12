(()=>{'use strict';let initial=[],stages=[],dose=null,readonly=false,initialized=false,context='',lastSent=null;
const host=document.querySelector('#stages'),status=document.querySelector('#status');
const fmt=t=>t==null?'':`${Math.floor(t/60)}:${String(+(t%60).toFixed(2)).padStart(2,'0')}`;
function parseTime(text){if(!text.trim())return null;const match=text.trim().match(/^(\d+)\s*[:：]\s*([0-5]?\d(?:\.\d+)?)$/);if(match)return +match[1]*60+(+match[2]);if(/^\d+(?:\.\d+)?$/.test(text.trim()))return +text;throw Error('时间请填写 m:ss 或秒数，例如 1:08、68。');}
const names=['第一段','第二段','第三段','第四段','第五段','第六段','第七段','第八段','第九段','第十段'];
function input(cls,key,value,label,placeholder=''){const node=document.createElement('input');node.className=cls;node.dataset.key=key;node.value=value;node.setAttribute('aria-label',label);node.title=label;node.placeholder=placeholder;return node;}
function ratioValue(s){return s.amount==null||!(dose>0)?'':`1:${+(s.amount/dose).toFixed(2)}`;}
function render(){host.replaceChildren();stages.forEach((s,i)=>{
 const row=document.createElement('div');row.className='stage';row.dataset.index=i;
 const title=document.createElement('div');title.className='stage-name';title.textContent=names[i]||`第${i+1}段`;row.append(title);if(!readonly){const del=document.createElement('button');del.className='remove-stage';del.textContent='删除';del.setAttribute('aria-label',`删除第${i+1}段`);del.onclick=()=>{stages.splice(i,1);render();emit()};title.append(del);}
 const track=document.createElement('div');track.className='track';
 const metrics=document.createElement('div');metrics.className='metrics';
 const type=document.createElement('select');type.dataset.key='kind';type.setAttribute('aria-label',`${title.textContent} 注水量或出液量`);for(const k of ['水','液']){const o=document.createElement('option');o.value=k;o.textContent=k;type.append(o)}type.value=s.kind;metrics.append(type,input('amount','amount',s.amount??'',`${title.textContent} ${s.kind==='水'?'注水':'出液'}量`,'—'),document.createTextNode('g'));
 track.append(metrics);
 for(const [key,cls,label] of [['start','start','开始时间'],['pourEnd','join','注水结束时间'],['end','end','本段结束时间']]){track.append(input(`time ${cls}`,key,fmt(s[key]),`${title.textContent} ${label}`,'—:—'));}
 const line=document.createElement('div');line.className='line';line.innerHTML='<span class="pour"></span><span class="wait"></span><span class="tick start"></span><span class="tick join"></span><span class="tick end"></span>';track.append(line);
 const wrap=document.createElement('div');wrap.className='method-wrap';const method=document.createElement('textarea');method.className='method';method.dataset.key='method';method.rows=1;method.value=s.method;method.placeholder='填写手法';method.setAttribute('aria-label',`${title.textContent} 手法`);wrap.append(method);track.append(wrap);row.append(track);
 const ratioWrap=document.createElement('div');ratioWrap.className='ratio-wrap';
 const temperature=document.createElement('label');temperature.className='stage-temperature';temperature.append(input('temperature','temp',s.temp??'',`${title.textContent} 水温`,'—'),document.createTextNode('°C'));
 ratioWrap.append(temperature,input('ratio','ratio',ratioValue(s),`${title.textContent} 比例`,'—'));row.append(ratioWrap);host.append(row);
 });if(readonly){host.querySelectorAll('input,textarea').forEach(e=>{e.readOnly=true;e.tabIndex=-1;e.placeholder=''});host.querySelectorAll('select').forEach(e=>{const text=document.createElement('span');text.textContent=e.value;e.replaceWith(text)});}layout();markChanged();}
function layout(){host.querySelectorAll('.stage').forEach((row,i)=>{const s=stages[i],track=row.querySelector('.track'),complete=[s.start,s.pourEnd,s.end].every(v=>v!=null)&&s.end>s.start;
 const portion=complete?(s.pourEnd-s.start)/(s.end-s.start):1;track.classList.toggle('incomplete',!complete);track.style.setProperty('--portion',`${portion*100}%`);
 const px=track.clientWidth*portion;track.classList.toggle('crowded',complete&&(px<110||track.clientWidth-px<70));
 const metrics=track.querySelector('.metrics'),width=metrics.getBoundingClientRect().width,base=track.getBoundingClientRect().left;
 const desired=(complete?px:track.clientWidth)/2-width/2;
 const occupied=[...track.querySelectorAll('.time')].map(e=>{const r=e.getBoundingClientRect();return [Math.max(0,r.left-base-4),Math.min(track.clientWidth,r.right-base+4)]}).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
 let cursor=0;const gaps=[];for(const [a,b]of occupied){if(a-cursor>=width)gaps.push([cursor,a-width]);cursor=Math.max(cursor,b)}if(track.clientWidth-cursor>=width)gaps.push([cursor,track.clientWidth-width]);
 const candidates=gaps.map(([a,b])=>Math.max(a,Math.min(b,desired))).sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired));
 track.style.setProperty('--label-left',`${candidates[0]??Math.max(0,Math.min(track.clientWidth-width,desired))}px`);
 const method=row.querySelector('.method');const measure=document.createElement('span');measure.className='measure';measure.style.font=getComputedStyle(method).font;measure.textContent=method.value;document.body.append(measure);method.classList.toggle('long',measure.getBoundingClientRect().width+14>px);measure.remove();method.style.height='auto';method.style.height=`${method.scrollHeight+2}px`;
 });}
function commit(el){const row=el.closest('.stage');if(!row)return;const i=+row.dataset.index,s=stages[i],key=el.dataset.key;let value;
 try{if(['start','pourEnd','end'].includes(key)){value=parseTime(el.value);const next={...s,[key]:value};for(const [a,b] of [['start','pourEnd'],['pourEnd','end'],['start','end']])if(next[a]!=null&&next[b]!=null&&next[a]>next[b])throw Error('时间顺序应为：开始 ≤ 注水结束 ≤ 本段结束。');if(next.start!=null&&next.end!=null&&next.start===next.end)throw Error('本段结束时间需要晚于开始时间。');}
 else if(['amount','temp'].includes(key)){value=el.value.trim()===''?null:Number(el.value);if(value!=null&&(!Number.isFinite(value)||value<0||(key==='temp'&&value>100)))throw Error(key==='temp'?'水温请输入 0–100。':'水量请输入非负数。');}
 else if(key==='ratio'){value=el.value.trim()||null;if(value&&!/^\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?$/.test(value))throw Error('比例请输入如 1:4；留空后恢复自动计算。');}
 else value=el.value;
 if(key==='kind'){s[s.kind==='液'?'yield_g':'water_g']=s.amount;s.amount=s[value==='液'?'yield_g':'water_g'];row.querySelector('.amount').value=s.amount??'';}if(key==='ratio'){if(!(dose>0))throw Error('请先填写粉量，再编辑比例');if(value){const [a,b]=value.split(':').map(Number);if(!(a>0))throw Error('比例左侧必须大于 0');s.amount=+(dose*b/a).toFixed(3);row.querySelector('.amount').value=s.amount;}value=null;}s[key]=value;if(key==='amount'||key==='ratio')s[s.kind==='液'?'yield_g':'water_g']=s.amount;if(key==='end'&&stages[i+1])stages[i+1].start=value;if(key==='start'&&i>0)stages[i-1].end=value;el.removeAttribute('aria-invalid');if(['start','pourEnd','end'].includes(key))el.value=fmt(value);if(key==='amount')s.ratio=null;row.querySelector('.ratio').value=ratioValue(s);layout();status.textContent='有未保存修改';markChanged();emit();if(key==='start'||key==='end')render();
 }catch(e){el.setAttribute('aria-invalid','true');status.textContent=e.message;}}
host.addEventListener('change',e=>{if(e.target.dataset.key)commit(e.target)});
host.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();commit(e.target);if(e.target.getAttribute('aria-invalid')!=='true')e.target.blur()}if(e.key==='Escape'){const row=e.target.closest('.stage');if(row){const s=stages[+row.dataset.index],k=e.target.dataset.key;e.target.value=['start','pourEnd','end'].includes(k)?fmt(s[k]):k==='ratio'?ratioValue(s):s[k]??'';e.target.removeAttribute('aria-invalid');e.target.blur()}}});

function markChanged(){host.querySelectorAll('.stage').forEach((row,i)=>{const s=stages[i],old=initial.find(x=>x.uid===s.uid);row.querySelectorAll('[data-key]').forEach(e=>{const k=e.dataset.key;e.classList.toggle('changed',!readonly&&(!old||s[k]!==old[k]));});});}
function emit(){if(readonly)return;lastSent=crypto.randomUUID();parent.postMessage({isStreamlitMessage:true,type:'streamlit:setComponentValue',dataType:'json',value:{eventId:lastSent,stages}},'*');}
document.querySelector('#add').onclick=()=>{stages.push({uid:crypto.randomUUID(),start:stages.at(-1)?.end??null,pourEnd:null,end:null,water_g:null,yield_g:null,kind:'水',amount:null,temp:null,method:'',ratio:null});render();emit()};
function receive(data){document.documentElement.dataset.theme=data.theme||'dark';readonly=!!data.readonly;document.body.classList.toggle('readonly',readonly);document.body.classList.toggle('public-phone',readonly&&!!data.mobile);dose=Number(data.dose)||null;if(!initialized||context!==data.context){initial=structuredClone(data.original||data.stages||[]);stages=structuredClone(data.stages||[]);context=data.context;initialized=true;render();}else{host.querySelectorAll('.ratio').forEach((e,i)=>e.value=ratioValue(stages[i]));layout();}height();}
let previousHeight=0;function height(){const h=Math.ceil(document.body.getBoundingClientRect().height)+4;if(h!==previousHeight){previousHeight=h;parent.postMessage({isStreamlitMessage:true,type:'streamlit:setFrameHeight',height:h},'*');parent.postMessage({type:'timeline:height',height:h},'*')}}
window.addEventListener('message',e=>{if(e.source!==parent)return;if(e.data.type==='streamlit:render')receive(e.data.args.data);if(e.data.type==='timeline:data')receive(e.data.data);if(e.data.type==='timeline:theme'){document.documentElement.dataset.theme=e.data.theme;}});
new ResizeObserver(()=>{if(initialized)layout();height()}).observe(host);new ResizeObserver(height).observe(document.body);document.fonts.ready.then(()=>{if(initialized)layout();height()});
parent.postMessage({isStreamlitMessage:true,type:'streamlit:componentReady',apiVersion:1},'*');parent.postMessage({type:'timeline:ready'},'*');
})();
