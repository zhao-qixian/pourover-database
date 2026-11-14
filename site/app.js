'use strict';
let db, manifest, page='brews', selected=0, tab=0;
const state={brews:{q:'',month:'',bean:'',roaster:'',country:'',process_category:'',sort:'brew_date',desc:'1'},beans:{q:'',sort:'roast_date',desc:'1'},terms:{q:'',kind:''}};
const $=s=>document.querySelector(s);
function setTheme(light){
 document.documentElement.dataset.theme=light?'light':'dark';
 $('#theme-switch').setAttribute('aria-checked',String(light));
 $('meta[name="theme-color"]').content=light?'#EFE3D3':'#241919';
 try{localStorage.setItem('pour-over-theme',light?'light':'dark')}catch{}
 const frame=document.querySelector('#flavor-frame');
 frame?.contentWindow?.postMessage({type:'public-flavors:theme',theme:light?'light':'dark'},location.origin);
}
let savedTheme='dark';try{savedTheme=localStorage.getItem('pour-over-theme')||'dark'}catch{}
setTheme(savedTheme==='light');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=f=>f?.value, coffee=r=>r.coffee||r.result?.coffee||{}, brew=r=>r.result?.brew||{};
const str=v=>v==null?'':typeof v==='boolean'?(v?'是':'否'):Array.isArray(v)?v.map(x=>typeof x==='object'?Object.values(x).filter(y=>y!=null).join(' · '):x).join('、'):String(v);
const number=r=>'B'+String(r.id).padStart(6,'0');
const title=r=>(val(coffee(r).roaster)||'未知烘焙商')+' · '+(val(coffee(r).product_name)||val(coffee(r).farm)||'未命名咖啡豆');
const beanName=r=>title(r)+' · '+(val(r.coffee.roast_date)||'烘焙日期待补')+' · '+number(r);
const labels={bypass_water_g:'Bypass g/1:n',farm:'庄园',duration_seconds:'总时间',process_category:'大类',process_detail:'细节'};
const label=k=>k==='water_g'?'注水 g':k==='yield_g'?'出液 g':k==='duration_seconds'?'总时间':db.presentation?.labels[k]||labels[k]||db.labels[k]||db.stage_labels[k]||k;
const gallerySelections=new Map();
const detailLoads=new Map();
let searchLoad=null,searchReady=false;
function loadSearch(){
 if(searchReady||!db.search_ref)return Promise.resolve();
 if(!searchLoad)searchLoad=verifiedJson(db.search_ref).then(index=>{for(const kind of ['brews','beans'])for(const row of db[kind])row.search_text=index[kind][row.id];searchReady=true}).catch(error=>{searchLoad=null;throw error});
 return searchLoad;
}
async function verifiedJson(path){
 if(!/^(snapshots|details)\/[a-f0-9]{64}\.json$/.test(path))throw Error('数据地址无效');
 let response=await fetch('./'+path,{cache:'force-cache'});
 if(!response.ok&&/^https:\/\/raw\.githubusercontent\.com\/zhao-qixian\/pourover-database\/[a-f0-9]{40}\/site\/$/.test(manifest.media_base||''))response=await fetch(manifest.media_base+path);
 if(!response.ok)throw Error('无法读取资料，请稍后重试');
 const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==path.split('/')[1].slice(0,-5))throw Error('数据完整性验证失败，请稍后刷新');
 return JSON.parse(new TextDecoder().decode(bytes));
}
function loadDetail(row){
 if(!row?.detail_ref||row.detailLoaded)return Promise.resolve(row);
 if(!detailLoads.has(row.detail_ref))detailLoads.set(row.detail_ref,verifiedJson(row.detail_ref).then(full=>{if(full.id!==row.id)throw Error('记录编号不一致');Object.assign(row,full,{detailLoaded:true});return row}).catch(error=>{detailLoads.delete(row.detail_ref);throw error}));
 return detailLoads.get(row.detail_ref);
}
const selections={brews:0,beans:0,terms:0};
const flavorLinks={beans:new Map(),brews:new Map()};
let flavorFocus=null;
function indexFlavors(){
 for(const f of db.flavor_data?.flavors||[])for(const [kind,key] of [['beans','beanIds'],['brews','brewIds']]){
  for(const id of f[key]){const links=flavorLinks[kind];if(!links.has(String(id)))links.set(String(id),[]);links.get(String(id)).push(f);}
 }
}
function flavorCards(flavors,description){
 return '<div class="flavor-cards" aria-label="'+esc(description)+'">'+flavors.map(f=>{
  const color=f.status==='approved'&&/^#[0-9a-f]{6}$/i.test(f.hex)?f.hex:null;
  const rgb=color?.slice(1).match(/../g).map(n=>parseInt(n,16));
  const text=rgb&&rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>150?'#241919':'#FFF9EF';
  const status=f.status==='pending'?(f.is_reference?'SCA待确认':'待确认'):f.status==='uncolored'?'不配色':'已配色';
  return '<a class="flavor-card '+(f.status==='pending'?'pending':'')+'" href="#/flavors/'+encodeURIComponent(f.id)+'" data-flavor-id="'+esc(f.id)+'" '+(color?'style="background:'+color+';color:'+text+'"':'')+' title="'+esc('打开风味盘 · '+status+(color?' · '+color:''))+'">'+esc(f.name)+'</a>';
 }).join('')+(flavors.length?'':'<span class="caption">暂无关联风味</span>')+'</div>';
}
function beanFlavorFields(r){
 const linked=db.brews.filter(b=>b.coffee_id===r.id&&b.result),tasted=new Map();
 for(const b of linked)for(const f of flavorLinks.brews.get(String(b.id))||[])tasted.set(f.id,f);
 const text=[...new Set(linked.flatMap(b=>val(brew(b).personal_flavors)||[]))].join('、');
 return '<div class="bean-flavor-fields">'+field('官方风味',str(val(r.coffee.flavors)),'flavors')+flavorCards(flavorLinks.beans.get(String(r.id))||[],'官方风味卡')+field('喝到的风味',text,'tasted_flavors')+flavorCards([...tasted.values()],'喝到的风味卡')+'</div>';
}
function sendFlavorData(){
 if(page!=='flavors')return;
 const frame=$('#flavor-frame');if(!frame)return;
 frame.contentWindow.postMessage({type:'public-flavors:render',theme:document.documentElement.dataset.theme,
  data:{...(db.flavor_data||{flavors:[],beans:{},brews:{}}),readonly:true,previewCandidates:true,focus_flavor:flavorFocus}},location.origin);
}
function renderFlavors(id){
 flavorFocus=id?{id,nonce:crypto.randomUUID()}:null;
 if(!$('#flavor-frame')){
  const frame=document.createElement('iframe');frame.id='flavor-frame';frame.title='风味色盘';
  frame.src='./flavors/index.html?v='+encodeURIComponent(manifest.version);
  $('#flavor-workspace').append(frame);
 }
 sendFlavorData();
}
window.addEventListener('message',event=>{
 const frame=$('#flavor-frame');if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;
 const message=event.data;if(!message||typeof message!=='object')return;
 if(message.type==='public-flavors:ready')sendFlavorData();
 if(message.type==='public-flavors:height'&&Number.isFinite(message.height))frame.style.height=Math.max(420,Math.min(20000,message.height))+'px';
 if(message.type==='public-flavors:select'&&page==='flavors'&&db.flavor_data?.flavors.some(f=>f.id===message.id)){
  history.replaceState(null,'','#/flavors/'+encodeURIComponent(message.id));
 }
 if(message.type==='public-flavors:open'){
  const kind=message.kind==='bean'?'beans':message.kind==='brew'?'brews':null;
  if(kind&&db[kind].some(r=>String(r.id)===String(message.id)))location.hash='#/'+kind+'/'+message.id+(kind==='brews'?'?tab=flavors':'');
 }
});
let imageSource;
let reviewFrame=0;
const reviewResize=new ResizeObserver(scheduleReviewLayout);
function scheduleReviewLayout(){
 if(!reviewFrame)reviewFrame=requestAnimationFrame(alignReviewLayout);
}
function alignReviewLayout(){
 reviewFrame=0;
 const field=$('.review-field'),list=$('#list .items'),rating=$('.rating-row');
 if(page!=='brews'||tab!==1||!field||!list||!rating)return;
 const box=field.getBoundingClientRect(),left=list.getBoundingClientRect();
 const sideBySide=innerWidth>1200&&box.left>=left.right;
 // Use document coordinates so scrolling cannot change the review's height.
 // Public pages have no save toolbar: keep the complete guide inside the viewport.
 const bottom=Math.min(left.bottom+scrollY-64,innerHeight-136);
 const height=sideBySide?Math.max(100,Math.min(480,box.height+bottom-rating.getBoundingClientRect().bottom-scrollY)):224;
 const previous=parseFloat(field.style.getPropertyValue('--review-height'));
 if(!Number.isFinite(previous)||Math.abs(previous-height)>.5){
  field.style.setProperty('--review-height',height+'px');
  field.parentElement.style.setProperty('--review-height',height+'px');
 }
}
window.addEventListener('resize',scheduleReviewLayout);
document.fonts?.ready.then(scheduleReviewLayout);
// Native select popups ignore page fonts on Windows. Keep select values as the
// data source, and render accessible, consistently themed menus above them.
let selectSequence=0,openSelect=null;
function closeSelect(){
 if(!openSelect)return;
 openSelect.button.setAttribute('aria-expanded','false');
 openSelect.button.removeAttribute('aria-activedescendant');
 openSelect.menu.remove();openSelect=null;
}
function enhanceSelects(){
 document.querySelectorAll('select').forEach(select=>{
  if(select.dataset.enhanced)return;
  select.dataset.enhanced='true';select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const wrapper=document.createElement('div');wrapper.className='select-control';
  if(select.dataset.filter)wrapper.dataset.filter=select.dataset.filter;
  select.before(wrapper);wrapper.append(select);
  const button=document.createElement('button');button.type='button';button.className='select-trigger';
  button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
  const label=select.getAttribute('aria-label')||'选择';button.setAttribute('aria-label',label);
  const id='select-menu-'+(++selectSequence);button.setAttribute('aria-controls',id);
  wrapper.append(button);
  const sync=()=>{button.textContent=select.selectedOptions[0]?.textContent||''};sync();select.addEventListener('change',sync);
  let active=0,query='',typedAt=0;
  const choose=index=>{
   select.selectedIndex=index;sync();closeSelect();button.focus({preventScroll:true});
   select.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const highlight=index=>{
   if(openSelect?.button!==button)return;
   const options=[...openSelect.menu.children];active=Math.max(0,Math.min(index,options.length-1));
   options.forEach((option,i)=>option.classList.toggle('highlighted',i===active));
   if(options[active]){button.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'})}
  };
  const open=()=>{
   closeSelect();closePopovers();
   const menu=document.createElement('div');menu.id=id;menu.className='select-menu';menu.setAttribute('role','listbox');menu.setAttribute('aria-label',label);
   [...select.options].forEach((option,i)=>{
    const row=document.createElement('div');row.id=id+'-'+i;row.className='select-option';row.setAttribute('role','option');row.setAttribute('aria-selected',String(i===select.selectedIndex));row.textContent=option.textContent;
    row.addEventListener('mousedown',e=>e.preventDefault());row.addEventListener('click',()=>choose(i));row.addEventListener('mousemove',()=>highlight(i));menu.append(row);
   });
   document.body.append(menu);openSelect={button,menu};button.setAttribute('aria-expanded','true');
   const r=button.getBoundingClientRect(),width=Math.min(Math.max(r.width,140),innerWidth-16),below=innerHeight-r.bottom-12,above=r.top-12;
   const upwards=below<180&&above>below,available=upwards?above:below;
   menu.style.width=width+'px';menu.style.left=Math.max(8,Math.min(r.left,innerWidth-width-8))+'px';menu.style.maxHeight=Math.max(44,Math.min(352,available))+'px';
   if(upwards)menu.style.bottom=(innerHeight-r.top+4)+'px';else menu.style.top=(r.bottom+4)+'px';
   highlight(select.selectedIndex<0?0:select.selectedIndex);
  };
  button.addEventListener('click',()=>openSelect?.button===button?closeSelect():open());
  button.addEventListener('keydown',e=>{
   const opened=openSelect?.button===button;
   if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
    e.preventDefault();if(!opened)open();
    highlight(e.key==='Home'?0:e.key==='End'?select.options.length-1:active+(e.key==='ArrowDown'?1:-1));
   }else if(['Enter',' '].includes(e.key)){e.preventDefault();if(opened)choose(active);else open()}
   else if(e.key==='Escape'){e.preventDefault();closeSelect()}
   else if(e.key==='Tab')closeSelect();
   else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    e.preventDefault();if(!opened)open();const now=Date.now();query=(now-typedAt<700?query:'')+e.key.toLocaleLowerCase();typedAt=now;
    const index=[...select.options].findIndex(o=>o.textContent.toLocaleLowerCase().startsWith(query));if(index>=0)highlight(index);
   }
  });
 });
}
document.addEventListener('pointerdown',e=>{if(openSelect&&!openSelect.menu.contains(e.target)&&!openSelect.button.contains(e.target))closeSelect()});
document.addEventListener('scroll',e=>{if(openSelect&&!openSelect.menu.contains(e.target))closeSelect()},true);
window.addEventListener('resize',closeSelect);

function formatted(f,key,group,display={}){
 const v=val(f);
 if(key==='duration_seconds')return time(display[key]?Number(display[key]):v);
 if(['auxiliary','personal_flavors','flavors','varieties'].includes(key))return str(v);
 if(display[key]!=null)return display[key]|| (key==='cutoff'?'未填写':'');
 if(key==='grind_parts')return v?.map(x=>x.number+(x.primary?'(主要)':'')).join('+')||str(val(group.grind));
 if(key==='sieve_mesh')return v?.length?v.map(x=>x+'目').join('+'):val(group.sieved)===false?'未筛粉':val(group.sieved)===true?'已筛粉（目数未知）':'';
 if(key==='bypass_water_g')return val(group.bypass_ratio)?(group.bypass_ratio.status==='estimated'?'约':'')+val(group.bypass_ratio):v==null&&val(group.bypass)===true?'有':str(v);
 return str(v);
}
function field(name,text,key=''){
 return '<div class="field"'+(key?' data-field="'+esc(key)+'"':'')+'><span class="label">'+esc(name)+'</span><span class="value" title="'+esc(text)+'">'+esc(text)+'</span></div>';
}
function fields(group,keys,display={}){
 return '<div class="fields">'+keys.map(k=>k?field(label(k),formatted(group[k],k,group,display),k):'<div class="field-empty" aria-hidden="true"></div>').join('')+'</div>';
}
function section(name,g,keys,display){return '<section class="parameter-section"><h4>'+name+'</h4>'+fields(g,keys,display)+'</section>'}
function textField(name,text,extra=''){return '<div class="text-field '+extra+'"><label>'+esc(name)+'</label><div class="text-value">'+esc(text)+'</div></div>'}
function time(n){return n==null?'':Math.floor(n/60)+' : '+String(Math.round((n%60)*100)/100).padStart(2,'0')}
const timelinePayloads=new Map();
const timelinePhone=matchMedia('(max-width:640px)');
timelinePhone.addEventListener('change',()=>{for(const [id,data] of timelinePayloads){data.mobile=timelinePhone.matches;document.getElementById(id)?.contentWindow?.postMessage({type:'timeline:data',data},location.origin);}});
function stages(items,dose,displays=[]){
 const list=items||[];if(!list.length)return '<p class="caption">未记录注水阶段</p>';
 const id='timeline-'+crypto.randomUUID();
 const total=page==='brews'?val(brew(db.brews.find(r=>r.id===selected)).duration_seconds):null;
 const data=list.map((s,i)=>{const start=val(s.start_seconds),duration=val(s.pour_seconds),wait=val(s.wait_seconds),stop=start!=null&&duration!=null?start+duration:null,water=val(s.water_g),output=val(s.yield_g);return {uid:String(i),start,pourEnd:stop,end:stop!=null&&wait!=null?stop+wait:(i+1<list.length?val(list[i+1].start_seconds):total),water_g:water,yield_g:output,kind:output!=null?'液':'水',amount:output??water,temp:val(s.temperature_c),method:val(s.technique)||'',ratio:null};});
 for(const key of timelinePayloads.keys())if(!document.getElementById(key))timelinePayloads.delete(key);
 timelinePayloads.set(id,{stages:data,dose,readonly:true,mobile:timelinePhone.matches,context:id,theme:document.documentElement.dataset.theme});
 return '<iframe class="timeline-frame" id="'+id+'" title="分段冲煮方案" src="./timeline/index.html?v=436c9699f3c332e0" style="width:100%;height:'+Math.max(140,list.length*125)+'px;border:0;display:block"></iframe>';
}
window.addEventListener('message',e=>{if(e.origin!==location.origin)return;const frame=[...document.querySelectorAll('.timeline-frame')].find(f=>f.contentWindow===e.source);if(!frame)return;if(e.data?.type==='timeline:ready')e.source.postMessage({type:'timeline:data',data:timelinePayloads.get(frame.id)},location.origin);if(e.data?.type==='timeline:height'&&Number.isFinite(e.data.height))frame.style.height=Math.max(60,Math.min(20000,e.data.height))+'px';});
new MutationObserver(()=>{document.querySelectorAll('.timeline-frame').forEach(f=>f.contentWindow?.postMessage({type:'timeline:theme',theme:document.documentElement.dataset.theme},location.origin));}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
function gallery(paths,kind='evidence',names=[]){
 const images=paths.map(p=>(manifest.media_base||'./')+p);
 const key=page+'/'+selected+'/'+kind,index=Math.min(gallerySelections.get(key)||0,Math.max(0,images.length-1)),size=db.media_dimensions?.[paths[index]];
 const options=images.length>1?'<select data-gallery aria-label="'+(kind==='bean'?'包装/豆卡':'视频截图')+'">'+images.map((p,i)=>'<option value="'+esc(p)+'" '+(i===index?'selected':'')+'>'+esc(names[i]||(kind==='bean'?'包装/豆卡 ':'视频截图 ')+(i+1))+'</option>').join('')+'</select>':'';
 const photo=images.length?'<img class="hero-image" src="'+esc(images[index])+'" '+(size?'width="'+size.width+'" height="'+size.height+'"':'')+' alt="'+(kind==='bean'?'包装/豆卡':'视频截图')+'" tabindex="0" role="button" aria-label="放大'+(kind==='bean'?'包装/豆卡':'视频截图')+'" loading="lazy">':'<div class="photo-placeholder">'+(kind==='bean'?'包装/豆卡':'暂无截图')+'</div>';
 return '<div class="gallery" data-gallery-key="'+key+'">'+options+photo+'</div>';
}
function jsonDetails(name,data){return data&&(!Array.isArray(data)||data.length)?'<details><summary>'+esc(name)+'</summary><div class="details-body"><pre>'+esc(JSON.stringify(data,null,2))+'</pre></div></details>':''}
function tabs(names){return '<div class="tabs" role="tablist">'+names.map((n,i)=>'<button role="tab" id="tab-'+i+'" aria-controls="tab-content" data-tab="'+i+'" tabindex="'+(i===tab?0:-1)+'" aria-selected="'+(i===tab)+'">'+n+'</button>').join('')+'</div>'}
const panel=()=>'<div class="tab-panel" id="tab-content" role="tabpanel" aria-labelledby="tab-'+tab+'">';
function select(key,name,values,placeholder=true){
 return '<select data-filter="'+key+'" aria-label="'+name+'">'+(placeholder?'<option value="">'+name+'</option>':'')+values.map(v=>{const [id,text]=Array.isArray(v)?v:[v,v];return '<option value="'+esc(id)+'" '+(String(state[page][key])===String(id)?'selected':'')+'>'+esc(text)+'</option>'}).join('')+'</select>';
}
function sortBox(){
 const attrs=[['roast_date','烘焙日期'],['roaster','烘焙商'],['country','国家'],['region','地区'],['farm','庄园'],['product_name','商品名称'],['id','编号']];
 if(page==='brews')attrs.unshift(['brew_date','冲煮日期']);
 return '<div class="sort">'+select('sort','排序依据',attrs.map(([id,name])=>[id,'按'+name+'排序']),false)+select('desc','排序方向',[['1','降序'],['','升序']],false)+'</div>';
}
function search(){
 const input='<input data-filter="q" aria-label="搜索" placeholder="'+(page==='beans'?'豆库：编号、豆名、产地…':page==='terms'?'搜索标准名或别名…':'搜索冲煮记录…')+'" value="'+esc(state[page].q)+'">';
 return page==='terms'?input:'<div class="search-controls">'+input+'<button type="button" id="clear-search" aria-label="清空搜索" title="清空搜索">×</button></div>';
}
function listText(r,kind=page){
 if(kind==='terms')return '<p>'+esc(r.name)+'</p>';
 if(kind==='beans')return '<div class="list-entry bean-entry"><p class="entry-title">'+esc(title(r))+'</p><p class="entry-summary">'+esc(val(r.coffee.roast_level)||'待核对')+'</p><p class="entry-date">'+esc((val(r.coffee.roast_date)||'烘焙日期待补')+' · '+number(r))+'</p></div>';
 return '<div class="list-entry brew-entry"><p class="entry-title">'+esc(title(r))+'</p><p class="entry-score">'+(r.score==null?'':esc(r.score.toFixed(1)))+'</p><p class="entry-summary">'+esc(r.summary||'')+'</p><p class="entry-date">'+esc(val(brew(r).brew_date)||r.month)+'</p></div>';
}
function beanOptions(q=''){
 $('#bean-options').innerHTML='<button class="item '+(!state.brews.bean?'active':'')+'" data-bean="">全部咖啡豆</button>'+db.beans.filter(b=>beanName(b).toLocaleLowerCase().includes(q.toLocaleLowerCase())).map(b=>'<button class="item '+(String(b.id)===state.brews.bean?'active':'')+'" data-bean="'+b.id+'">'+listText(b,'beans')+'</button>').join('');
}
function beanPicker(){
 const chosen=db.beans.find(b=>String(b.id)===state.brews.bean);
 return '<div class="popover bean-picker"><button data-popover="bean-panel" aria-expanded="false" aria-controls="bean-panel" aria-label="筛选咖啡豆">'+esc(chosen?title(chosen):'全部咖啡豆')+' <span aria-hidden="true">⌄</span></button><div class="popover-panel" id="bean-panel" hidden><input id="bean-query" aria-label="搜索咖啡豆筛选项" placeholder="搜索烘焙商、豆名或编号…"><div class="bean-options" id="bean-options"></div></div></div>';
}
function renderFilters(){
 closeSelect();
 let html='';
 if(page==='brews'){
  html=search()+select('month','全部月份',[...new Set(db.brews.map(r=>r.month))].sort().reverse());
  for(const k of ['roaster','country','process_category'])html+=select(k,'全部'+({roaster:'烘焙商',country:'国家',process_category:'处理法'}[k]),[...new Set(db.brews.map(r=>val(coffee(r)[k])).filter(Boolean))].sort());
 }
 if(page==='brews')html+='<button type="button" id="reset-filters">重置筛选</button>';
 $('#filters').innerHTML=html?'<div class="filters">'+html+'</div>':page==='terms'?'<p class="caption">词条库</p>':'';
 $('#list-controls').innerHTML=page==='terms'?'<div class="term-category"><label>词条类别</label>'+select('kind','全部类别',[...new Set(db.terms.map(t=>t.kind))].sort().map(k=>[k,label(k)]))+'</div>'+search():(page==='beans'?'<div class="search-row"><label>搜索</label>'+search()+'</div>':page==='brews'?beanPicker():'')+sortBox();
 if(page==='brews')beanOptions();
 enhanceSelects();
}
function filtered(){
 const s=state[page];let rows=db[page].filter(r=>{
  const searchable=(r.search_text||JSON.stringify(r)).toLocaleLowerCase()+(page==='beans'?beanName(r).toLocaleLowerCase():'');
  if(s.q&&!searchable.includes(s.q.toLocaleLowerCase()))return false;
  if(page==='terms')return !s.kind||r.kind===s.kind;
  if(page==='brews'){
   if(s.month&&r.month!==s.month)return false;
   if(s.bean&&String(r.coffee_id)!==s.bean)return false;
   for(const k of ['roaster','country','process_category'])if(s[k]&&val(coffee(r)[k])!==s[k])return false;
  }return true;
 });
 if(page!=='terms'){
  const get=r=>s.sort==='id'?r.id:s.sort==='brew_date'?val(brew(r).brew_date):val(coffee(r)[s.sort]);
  rows.sort((a,b)=>{let x=get(a),y=get(b);if(x==null||x==='')return y==null||y===''?a.id-b.id:1;if(y==null||y==='')return -1;if(typeof x!=='number'){x=String(x).toLocaleLowerCase();y=String(y).toLocaleLowerCase()}const c=x===y?0:x<y?-1:1;return c?(s.desc?-c:c):a.id-b.id});
 }return rows;
}
function renderList(){
 if(state[page].q&&db.search_ref&&!searchReady){const requestedPage=page;loadSearch().then(()=>{if(page===requestedPage)renderList()}).catch(error=>{$('#detail').textContent=error.message});return;}
 const rows=filtered();if(!rows.some(r=>r.id===selected))selected=rows[0]?.id||0;
 selections[page]=selected;
 const exportMenu='<div class="popover export-menu"><button data-popover="export-panel" aria-expanded="false" aria-controls="export-panel">导出筛选结果 <span aria-hidden="true">⌄</span></button><div class="popover-panel" id="export-panel" hidden><button id="export-csv">导出筛选结果 CSV</button><button id="export-xlsx">导出筛选结果 Excel</button></div></div>';
 $('#list-results').innerHTML='<div class="count">'+(page==='brews'?'找到 '+rows.length+' 条 · 共 '+db.brews.length+' 条':rows.length+(page==='beans'?' 包咖啡豆':' 个词条'))+'</div>'+(page==='brews'?exportMenu:'')+'<div class="items">'+rows.map(r=>'<a class="item '+(r.id===selected?'active':'')+'" '+(r.id===selected?'aria-current="true"':'')+' href="#/'+page+'/'+r.id+'">'+listText(r)+'</a>').join('')+'</div>';
 renderDetail(rows.find(r=>r.id===selected));
}
function beanFields(c,display={}){
 const names=val(c.varieties)||[],mapping=val(c.varieties_english)||[],translations=Object.fromEntries(mapping.filter(v=>v.english).map(v=>[v.original,v.english]));
 const varieties=names.length?names.map(n=>translations[n]||n).join('、'):mapping.map(v=>v.english||v.original).join('、');
 return '<div class="fields">'+['roaster','product_name','country','region','farm'].map(k=>field(label(k),formatted(c[k],k,c,display),k)).join('')+'<div class="field-empty"></div>'+field('品种',varieties,'varieties')+'<div class="field" data-field="process"><span class="label">处理法</span><div class="process-values"><span class="value" title="'+esc(str(val(c.process_category)))+'">'+esc(str(val(c.process_category)))+'</span><span class="value" title="'+esc(str(val(c.process_detail)))+'">'+esc(str(val(c.process_detail)))+'</span></div></div>'+'<div class="field" data-field="roast"><span class="label">烘焙</span><div class="roast-values"><span class="value" data-field="roast_date" title="'+esc(str(val(c.roast_date)))+'">'+esc(str(val(c.roast_date)))+'</span><span class="value" data-field="roast_level">'+esc(val(c.roast_level)||'待核对')+'</span></div></div>'+field(label('price_per_g'),formatted(c.price_per_g,'price_per_g',c,display),'price_per_g')+'</div>';
}
function ratingGuide(){
 const lines=[
  '0 - 0.9 完全不能喝，直接倒掉',
  '1 - 1.9 明显过萃了，没什么正面风味，但还能喝进去',
  '2 - 2.9 没有明显的过萃，有一部分不愉悦，但也可能有亮点，风味能展现一部分',
  '3 - 3.9 没有负面味道，好喝的一杯咖啡，风味、平衡度、口感都可以，但是不算特别',
  '4 - 4.5 豆子各方面都展现的很好，感官愉悦，让人能够不由自主地“哇”出来',
  '4.6 - 5 惊为天人，一生中少有的几次完美咖啡体验'
 ];
 return '<section class="rating-guide" aria-labelledby="rating-guide-title"><h4 id="rating-guide-title">评分标准：</h4><ul>'+lines.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul></section>';
}
function renderDetail(r){
 if(!r){$('#detail').innerHTML='<p class="empty">没有匹配记录，请调整筛选条件。</p>';return}
 if(r.detail_ref&&!r.detailLoaded){
  const requestedPage=page;$('#detail').innerHTML='<p class="caption">正在读取已发布资料…</p>';
  loadDetail(r).then(()=>{if(page===requestedPage&&selected===r.id)renderDetail(r)}).catch(error=>{if(page===requestedPage&&selected===r.id)$('#detail').textContent=error.message});return;
 }
 let html='';
 if(page==='brews'){
  const b=brew(r),c=coffee(r),display=r.display?.brew||{};
  html='<div class="brew-title-row"><h2>'+esc(title(r))+'</h2><span class="value brew-date" aria-label="冲煮日期">'+esc(val(b.brew_date)||'')+'</span></div><p class="caption">'+esc(r.filename)+'</p>';
  if(!r.result)html+='<p>尚未完成识别</p>'+gallery(r.images,'evidence',r.image_labels);
  else{
   html+='<div class="detail-layout"><div class="detail-body"><p class="caption">B'+String(r.coffee_id).padStart(6,'0')+' · '+esc(val(c.country)||'—')+' · '+esc(val(c.process_category)||'—')+'</p>'+(r.coffee_deleted?'<p class="caption">豆子已归档，保留当时资料</p>':'<a class="button" href="#/beans/'+r.coffee_id+'">查看这包豆</a>')+tabs(['冲煮数据','风味与复盘'])+panel();
   if(tab===0){
    const bare=keys=>'<div class="bare-fields bare-'+keys.length+'">'+keys.map(k=>'<span class="value" aria-label="'+esc(label(k))+'">'+esc(val(b[k])==null&&!(k==='sieve_mesh'&&val(b.sieved)!=null)?'':formatted(b[k],k,b,display))+'</span>').join('')+'</div>';
    html+='<div class="brew-data-sections"><div class="brew-parameters"><h4>设备</h4>'+bare(['grinder','grind_parts','sieve_mesh'])+bare(['dripper','paper','auxiliary','water'])+section('粉量与比例',b,['dose_g',null,...[['ratio','water_g'],['yield_ratio','yield_g'],['ice_ratio','ice_g']].filter(row=>row.some(k=>String(formatted(b[k],k,b,display)).trim()!=='')).flat(),'cutoff','bypass_water_g'],display)+'</div><section class="brew-recipe-section"><h4>冲煮方案</h4>'+fields(b,['temperature_c','duration_seconds'],display)+'<div class="text-value recipe">'+esc(val(b.recipe))+'</div></section></div>'+stages(val(b.stages),val(b.dose_g),r.stage_display);
   }
   if(tab===1)html+='<div class="text-fields">'+textField(label('review'),val(b.review),'review-field')+'<div class="personal-flavors">'+textField(label('personal_flavors'),str(val(b.personal_flavors)),'flavor-field')+flavorCards(flavorLinks.brews.get(String(r.id))||[],'个人风味卡')+'</div>'+'</div><hr><div class="rating-row"><div class="score"><label>评分</label><span class="value '+(r.score==null?'missing':'')+'">'+(r.score==null?'未评分':r.score.toFixed(1))+'</span></div>'+ratingGuide()+'</div>';
   html+='</div></div><div class="evidence">'+gallery(r.images,'evidence',r.image_labels)+'</div></div><details class="narrow-photo"><summary>视频截图</summary><div class="details-body">'+gallery(r.images,'evidence',r.image_labels)+'</div></details>';
  }
 }
 if(page==='beans'){
  const c=r.coffee;
  html='<h2>'+esc(beanName(r))+'</h2><p class="caption">关联 '+r.brew_count+' 次冲煮</p><button id="bean-brews">查看这包豆的冲煮</button>'+tabs(['豆子资料','来源资料'])+panel();
  if(tab===0){
   html+='<div class="bean-layout"><div class="bean-information">'+beanFields(c,r.display)+beanFlavorFields(r)+'</div><div class="bean-photo">'+gallery(r.photos,'bean')+'</div></div><h3 class="bean-brews-heading">冲煮记录</h3>';
   const linked=db.brews.filter(x=>x.coffee_id===r.id&&x.result),scores=linked.map(x=>x.score).filter(x=>x!=null),best=scores.length?Math.max(...scores):null;
   html+=linked.length?linked.map(x=>'<a class="brew-card '+(x.score!=null&&x.score===best?'best':'')+'" href="#/brews/'+x.id+'"><div class="brew-card-text"><p><strong>'+esc(val(brew(x).brew_date)||'日期未填写')+' · '+(x.score==null?'未评分':x.score.toFixed(1)+' / 5')+(x.score!=null&&x.score===best?' · 最高分':'')+'</strong></p><p>'+esc(val(brew(x).review)||'暂无个人复盘')+'</p></div></a>').join(''):'<p class="caption">这包豆还没有冲煮记录。</p>';
   const recipe=r.recipe||{};
   html+='<details class="official-recipe"><summary>官方推荐方案</summary><div class="details-body"><div class="recipe-fields">'+(db.presentation?.recipe_fields||[]).map(([k,name])=>'<div class="stack-field"><label>'+esc(name)+'</label><span class="value">'+esc(str(recipe[k]))+'</span></div>').join('')+'</div>'+(recipe.stages?.length?stages(recipe.stages,null,r.recipe_stage_display):'')+textField('其他',str(recipe.other),'recipe-other')+'</div></details><div class="narrow-photo">'+gallery(r.photos,'bean')+'</div>';
  }else html+=(r.sources||[]).map(s=>'<section class="source-entry"><p class="caption">'+esc(s.created_at)+' · UTC</p><div class="source-text">'+esc(s.raw_text)+'</div></section>').join('')+jsonDetails('全部字段与来源',c)+jsonDetails('包装原文与来源 · 完整资料',r.sources);
  html+='</div>';
 }
 if(page==='terms')html='<h2>'+esc(r.name)+'</h2><p class="caption">统一标准名称与同义写法；原始字幕和历史资料保留。</p><div class="term-name"><label>标准名称</label><span class="value">'+esc(r.name)+'</span></div><p class="alias-label"><strong>已有别名</strong></p><p>'+esc(r.aliases||'暂无别名')+'</p>';
 if(openSelect&&!openSelect.button.isConnected)closeSelect();
 $('#detail').innerHTML=html;
 enhanceSelects();
 reviewResize.disconnect();
 [$('#detail'),$('#list .items'),$('.rating-row')].filter(Boolean).forEach(node=>reviewResize.observe(node));
 scheduleReviewLayout();
 document.querySelectorAll('.bean-photo img').forEach(img=>{const scale=()=>img.closest('.bean-photo').style.setProperty('--image-scale',Math.min(1,(img.naturalWidth||Number(img.getAttribute('width')))/(img.naturalHeight||Number(img.getAttribute('height'))))||1);img.addEventListener('load',scale);scale()});
}
function route(){
 closeSelect();
 const previous=page,scroll=$('.items')?.scrollTop||0,m=location.hash.match(/^#\/(brews|beans|terms|flavors)(?:\/([\w-]+))?(?:\?tab=(flavors))?$/);
 if($('#lightbox').open)closeImage();
 page=m?.[1]||'brews';selected=Number(m?.[2]||selections[page]||0);if(previous!==page)tab=0;
 document.body.dataset.page=page;document.body.classList.remove('sidebar-mobile-open');
 document.querySelectorAll('nav a').forEach(a=>a.setAttribute('aria-current',a.dataset.page===page?'page':'false'));
 $('.workspace').hidden=page==='flavors';$('#filters').hidden=page==='flavors';$('#flavor-workspace').hidden=page!=='flavors';
 if(page==='flavors'){$('#title').textContent='风味盘';reviewResize.disconnect();renderFlavors(m?.[2]);return;}
 if(m?.[3]==='flavors'&&page==='brews')tab=1;
 const row=db[page].find(x=>x.id===selected);
 if(row&&m?.[2]&&!filtered().some(x=>x.id===selected)){for(const k of Object.keys(state[page]))if(!['sort','desc'].includes(k))state[page][k]='';}
 document.body.dataset.page=page;document.body.classList.remove('sidebar-mobile-open');
 $('#title').textContent={brews:'冲煮记录',beans:'豆库',terms:'Pour Over Database'}[page];
 document.querySelectorAll('nav a').forEach(a=>a.setAttribute('aria-current',a.dataset.page===page?'page':'false'));
 renderFilters();renderList();if(previous===page&&$('.items'))$('.items').scrollTop=scroll;
}
function exportRows(rows=filtered()){const keys=[...Object.keys(db.labels).filter(k=>rows.some(r=>r.display?.coffee?.[k]!=null||r.display?.brew?.[k]!=null))];return [['文件名','咖啡豆编号','评分',...keys.map(k=>db.labels[k])],...rows.map(r=>[r.filename,r.coffee_id,r.score,...keys.map(k=>r.display?.coffee?.[k]??r.display?.brew?.[k]??'')])];}
function csv(rows){const quote=v=>'"'+String(v??'').replace(/^(\s*[=+@-])/ ,"'$1").replace(/"/g,'""')+'"';const url=URL.createObjectURL(new Blob(['\ufeff'+exportRows(rows).map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='冲煮记录.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function closePopovers(){document.querySelectorAll('[data-popover]').forEach(b=>{b.setAttribute('aria-expanded','false');document.getElementById(b.dataset.popover).hidden=true})}
function showImage(img){imageSource=img;$('#lightbox img').src=img.src;$('#lightbox').setAttribute('aria-label',img.alt+'预览，点击任意位置关闭');$('#lightbox').showModal()}
function closeImage(){$('#lightbox').close();if(imageSource?.isConnected)imageSource.focus({preventScroll:true});imageSource=null}
function activateTab(index,focus=false){tab=index;renderDetail(db[page].find(x=>x.id===selected));if(focus)$('#tab-'+index).focus()}
function sidebar(open){document.body.classList.toggle('sidebar-closed',!open);document.body.classList.toggle('sidebar-mobile-open',open);$('#sidebar-open').setAttribute('aria-expanded',String(open));}
 document.addEventListener('input',e=>{
  if(e.target.matches('input[data-filter]')){state[page][e.target.dataset.filter]=e.target.value;renderList();}
  if(e.target.id==='bean-query')beanOptions(e.target.value);
 });
 document.addEventListener('change',e=>{
  if(e.target.matches('select[data-filter]')){state[page][e.target.dataset.filter]=e.target.value;renderList();}
  if(e.target.matches('[data-gallery]')){const root=e.target.closest('.gallery');gallerySelections.set(root.dataset.galleryKey,e.target.selectedIndex);document.querySelectorAll('.gallery').forEach(g=>{if(g.dataset.galleryKey===root.dataset.galleryKey){const img=g.querySelector('img'),size=db.media_dimensions?.[e.target.value.replace(manifest.media_base||'./','')];if(size){img.width=size.width;img.height=size.height}img.src=e.target.value;const select=g.querySelector('select');if(select){select.selectedIndex=e.target.selectedIndex;const trigger=select.parentElement.querySelector('.select-trigger');if(trigger)trigger.textContent=select.selectedOptions[0]?.textContent||''}}})}
 });
 document.addEventListener('click',e=>{
  if(e.target.closest('#theme-switch'))setTheme(document.documentElement.dataset.theme!=='light');
  if(e.target.closest('#clear-search')){state[page].q='';const input=$('input[data-filter="q"]');input.value='';renderList();input.focus();}
  if(e.target.closest('#reset-filters')){for(const k of ['q','month','bean','roaster','country','process_category'])state.brews[k]='';renderFilters();renderList();$('#reset-filters').focus();}
  const t=e.target.closest('[data-tab]');if(t)activateTab(Number(t.dataset.tab),true);
  const img=e.target.closest('.hero-image');if(img)showImage(img);
  if(e.target.closest('#lightbox')){closeImage();return}
  const pop=e.target.closest('[data-popover]');
  if(pop){const open=pop.getAttribute('aria-expanded')!=='true';closePopovers();pop.setAttribute('aria-expanded',String(open));document.getElementById(pop.dataset.popover).hidden=!open;if(open)document.getElementById(pop.dataset.popover).querySelector('input,button')?.focus();}
  else if(!e.target.closest('.popover'))closePopovers();
  const bean=e.target.closest('[data-bean]');if(bean){state.brews.bean=bean.dataset.bean;renderFilters();renderList();$('[data-popover="bean-panel"]').focus();}
  if(e.target.closest('#bean-brews')){for(const k of Object.keys(state.brews))if(!['sort','desc'].includes(k))state.brews[k]='';state.brews.bean=String(selected);location.hash='#/brews';}
  if(e.target.closest('#export-csv,#export-xlsx')){const xlsx=!!e.target.closest('#export-xlsx');loadSearch().then(async()=>{const rows=filtered();await Promise.all(rows.map(loadDetail));if(xlsx)window.downloadXlsx(exportRows(rows));else csv(rows)}).catch(error=>alert(error.message));}
  if(e.target.closest('#sidebar-close'))sidebar(false);if(e.target.closest('#sidebar-open'))sidebar(true);
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closePopovers();
  if(e.target.matches('.hero-image')&&['Enter',' '].includes(e.key)){e.preventDefault();showImage(e.target);}
  if(e.target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
   e.preventDefault();const length=document.querySelectorAll('[role="tab"]').length;
   activateTab(e.key==='Home'?0:e.key==='End'?length-1:(tab+(e.key==='ArrowRight'?1:-1)+length)%length,true);
  }
 });
window.addEventListener('hashchange',()=>{if(db)route()});
$('#lightbox').addEventListener('cancel',e=>{e.preventDefault();closeImage()});
(async()=>{try{
 let response=await fetch('./publication.json',{cache:'no-cache'});if(!response.ok)throw Error('无法读取发布信息');manifest=await response.json();
 db=await verifiedJson(manifest.index_snapshot||manifest.snapshot);if(db.schema!==1)throw Error('不支持的数据版本');
 indexFlavors();
 state.terms.kind=[...new Set(db.terms.map(t=>t.kind))].sort()[0]||'';
 $('#updated').textContent='更新于 '+new Date(manifest.published_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）';
 route();
}catch(error){$('#detail').textContent=error.message;$('#detail').classList.add('error')}})();
