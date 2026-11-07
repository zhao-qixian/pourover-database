'use strict';
let db, manifest, page='brews', selected=0, tab=0;
const state={brews:{q:'',month:'',bean:'',roaster:'',country:'',process_category:'',sort:'brew_date',desc:'1'},beans:{q:'',sort:'roast_date',desc:'1'},terms:{q:'',kind:''}};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=f=>f?.value, coffee=r=>r.coffee||r.result?.coffee||{}, brew=r=>r.result?.brew||{};
const str=v=>v==null?'':typeof v==='boolean'?(v?'是':'否'):Array.isArray(v)?v.map(x=>typeof x==='object'?Object.values(x).filter(y=>y!=null).join(' · '):x).join('、'):String(v);
const number=r=>'B'+String(r.id).padStart(6,'0');
const title=r=>(val(coffee(r).roaster)||'未知烘焙商')+' · '+(val(coffee(r).product_name)||val(coffee(r).farm)||'未命名咖啡豆');
const beanName=r=>title(r)+' · '+(val(r.coffee.roast_date)||'烘焙日期待补')+' · '+number(r);
const labels={bypass_water_g:'Bypass g/1:n',farm:'庄园',process_category:'大类',process_detail:'细节'};
const label=k=>db.presentation?.labels[k]||labels[k]||db.labels[k]||db.stage_labels[k]||k;
const gallerySelections=new Map();
const selections={brews:0,beans:0,terms:0};
let imageSource;
function formatted(f,key,group,display={}){
 const v=val(f);
 if(['auxiliary','personal_flavors','flavors','varieties'].includes(key))return str(v);
 if(display[key]!=null)return display[key]|| (key==='cutoff'?'未填写':'');
 if(key==='grind_parts')return v?.map(x=>x.number+(x.primary?'(主要)':'')).join('+')||str(val(group.grind));
 if(key==='sieve_mesh')return v?.length?v.map(x=>x+'目').join('+'):val(group.sieved)===false?'未筛粉':val(group.sieved)===true?'已筛粉（目数未知）':'';
 if(key==='bypass_water_g')return val(group.bypass_ratio)?(group.bypass_ratio.status==='estimated'?'约':'')+val(group.bypass_ratio):v==null&&val(group.bypass)===true?'有':str(v);
 return str(v)||(key==='cutoff'?'未填写':'');
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
function stages(items){
 const numeric=(s,k,name)=>{const v=val(s[k]);return '<div class="stage-numeric"><span>'+name+'</span><span class="value">'+esc(Number.isInteger(v)?v.toFixed(1):str(v))+'</span></div>'};
 return (items||[]).map((s,i)=>{
  const start=val(s.start_seconds),duration=val(s.pour_seconds),end=start!=null&&duration!=null?start+duration:null;
  return '<section class="stage"><div class="stage-grid"><strong>第'+('一二三四五六七八九十'[i]||i+1)+'段</strong><div class="stage-timing"><span class="value">'+time(start)+'</span><span class="stage-arrow" aria-label="至"><svg viewBox="0 0 32 16" width="28" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8H29M23 2L29 8L23 14"/></svg></span><span class="value">'+time(end)+'</span></div>'+numeric(s,'water_g','注水量 g')+numeric(s,'temperature_c','水温 °C')+'<span></span><span>手法</span><span class="value stage-technique">'+esc(str(val(s.technique)))+'</span>'+numeric(s,'yield_g','出液量 g')+'<span></span><span></span></div></section>';
 }).join('')||'<p class="muted">未记录注水阶段</p>';
}
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
function search(){return '<input data-filter="q" aria-label="搜索" placeholder="'+(page==='beans'?'豆库：编号、豆名、产地…':page==='terms'?'搜索标准名或别名…':'搜索冲煮记录…')+'" value="'+esc(state[page].q)+'">'}
function listText(r,kind=page){return '<p>'+esc(kind==='terms'?r.name:title(r))+'</p>'+(kind==='terms'?'':'<p>'+esc(kind==='beans'?(val(r.coffee.roast_date)||'烘焙日期待补')+' · '+number(r):val(brew(r).brew_date)||r.month)+'</p>')}
function beanOptions(q=''){
 $('#bean-options').innerHTML='<button class="item '+(!state.brews.bean?'active':'')+'" data-bean="">全部咖啡豆</button>'+db.beans.filter(b=>beanName(b).toLocaleLowerCase().includes(q.toLocaleLowerCase())).map(b=>'<button class="item '+(String(b.id)===state.brews.bean?'active':'')+'" data-bean="'+b.id+'">'+listText(b,'beans')+'</button>').join('');
}
function beanPicker(){
 const chosen=db.beans.find(b=>String(b.id)===state.brews.bean);
 return '<div class="popover bean-picker"><button data-popover="bean-panel" aria-expanded="false" aria-controls="bean-panel" aria-label="筛选咖啡豆">'+esc(chosen?title(chosen):'全部咖啡豆')+' <span aria-hidden="true">⌄</span></button><div class="popover-panel" id="bean-panel" hidden><input id="bean-query" aria-label="搜索咖啡豆筛选项" placeholder="搜索烘焙商、豆名或编号…"><div class="bean-options" id="bean-options"></div></div></div>';
}
function renderFilters(){
 let html='';
 if(page==='brews'){
  html=search()+select('month','全部月份',[...new Set(db.brews.map(r=>r.month))].sort().reverse())+beanPicker();
  for(const k of ['roaster','country','process_category'])html+=select(k,'全部'+({roaster:'烘焙商',country:'国家',process_category:'处理法'}[k]),[...new Set(db.brews.map(r=>val(coffee(r)[k])).filter(Boolean))].sort());
 }
 $('#filters').innerHTML=html?'<div class="filters">'+html+'</div>':page==='terms'?'<p class="caption">词条库</p>':'';
 $('#list-controls').innerHTML=page==='terms'?'<div class="term-category"><label>词条类别</label>'+select('kind','全部类别',[...new Set(db.terms.map(t=>t.kind))].sort().map(k=>[k,label(k)]))+'</div>'+search():(page==='beans'?'<div class="search-row"><label>搜索</label>'+search()+'</div>':'')+sortBox();
 if(page==='brews')beanOptions();
}
function filtered(){
 const s=state[page];let rows=db[page].filter(r=>{
  const searchable=JSON.stringify(r).toLocaleLowerCase()+(page==='beans'?beanName(r).toLocaleLowerCase():'');
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
 const rows=filtered();if(!rows.some(r=>r.id===selected))selected=rows[0]?.id||0;
 selections[page]=selected;
 const exportMenu='<div class="popover export-menu"><button data-popover="export-panel" aria-expanded="false" aria-controls="export-panel">导出筛选结果 <span aria-hidden="true">⌄</span></button><div class="popover-panel" id="export-panel" hidden><button id="export-csv">导出筛选结果 CSV</button><button id="export-xlsx">导出筛选结果 Excel</button></div></div>';
 $('#list-results').innerHTML='<div class="count">'+(page==='brews'?'找到 '+rows.length+' 条 · 共 '+db.brews.length+' 条':rows.length+(page==='beans'?' 包咖啡豆':' 个词条'))+'</div>'+(page==='brews'?exportMenu:'')+'<div class="items">'+rows.map(r=>'<a class="item '+(r.id===selected?'active':'')+'" '+(r.id===selected?'aria-current="true"':'')+' href="#/'+page+'/'+r.id+'">'+listText(r)+'</a>').join('')+'</div>';
 renderDetail(rows.find(r=>r.id===selected));
}
function beanFields(c,display={}){
 const names=val(c.varieties)||[],mapping=val(c.varieties_english)||[],translations=Object.fromEntries(mapping.filter(v=>v.english).map(v=>[v.original,v.english]));
 const varieties=names.length?names.map(n=>translations[n]||n).join('、'):mapping.map(v=>v.english||v.original).join('、');
 return '<div class="fields">'+['roaster','product_name','country','region','farm','flavors'].map(k=>field(label(k),formatted(c[k],k,c,display),k)).join('')+field('品种',varieties,'varieties')+'<div class="field" data-field="process"><span class="label">处理法</span><div class="process-values"><span class="value" title="'+esc(str(val(c.process_category)))+'">'+esc(str(val(c.process_category)))+'</span><span class="value" title="'+esc(str(val(c.process_detail)))+'">'+esc(str(val(c.process_detail)))+'</span></div></div>'+['roast_date','price_per_g'].map(k=>field(label(k),formatted(c[k],k,c,display),k)).join('')+'</div>';
}
function renderDetail(r){
 if(!r){$('#detail').innerHTML='<p class="empty">没有匹配记录，请调整筛选条件。</p>';return}
 let html='';
 if(page==='brews'){
  const b=brew(r),c=coffee(r),display=r.display?.brew||{};
  html='<h2>'+esc(title(r))+'</h2><p class="caption">'+esc(r.filename)+'</p>';
  if(!r.result)html+='<p>尚未完成识别</p>'+gallery(r.images,'evidence',r.image_labels);
  else{
   html+='<div class="detail-layout"><div class="detail-body"><p class="caption">B'+String(r.coffee_id).padStart(6,'0')+' · '+esc(val(c.country)||'—')+' · '+esc(val(c.process_category)||'—')+'</p>'+(r.coffee_deleted?'<p class="caption">豆子已归档，保留当时资料</p>':'<a class="button" href="#/beans/'+r.coffee_id+'">查看这包豆</a>')+tabs(['冲煮参数','注水阶段','风味与复盘'])+panel();
   if(tab===0)html+=(db.presentation?.brew_sections||[]).map(([name,rows])=>section(name,b,rows.flatMap(row=>row.length===1?[row[0],null]:row),display)).join('');
   if(tab===1)html+=fields(b,['temperature_c','duration_seconds'],display)+textField(label('recipe'),val(b.recipe),'recipe')+'<hr class="stages-divider">'+stages(val(b.stages));
   if(tab===2)html+='<div class="text-fields">'+textField(label('review'),val(b.review))+textField(label('personal_flavors'),str(val(b.personal_flavors)))+'</div><hr><div class="score"><label>评分</label><span class="value '+(r.score==null?'missing':'')+'">'+(r.score==null?'未评分':r.score.toFixed(1))+'</span></div>';
   html+='</div></div><div class="evidence">'+gallery(r.images,'evidence',r.image_labels)+'</div></div><details class="narrow-photo"><summary>视频截图</summary><div class="details-body">'+gallery(r.images,'evidence',r.image_labels)+'</div></details>';
  }
 }
 if(page==='beans'){
  const c=r.coffee;
  html='<h2>'+esc(beanName(r))+'</h2><p class="caption">关联 '+r.brew_count+' 次冲煮</p><button id="bean-brews">查看这包豆的冲煮</button>'+tabs(['豆子资料','来源与历史'])+panel();
  if(tab===0){
   html+='<div class="bean-layout">'+beanFields(c,r.display)+'<div class="bean-photo">'+gallery(r.photos,'bean')+'</div></div><h3 class="bean-brews-heading">冲煮记录</h3>';
   const linked=db.brews.filter(x=>x.coffee_id===r.id&&x.result),scores=linked.map(x=>x.score).filter(x=>x!=null),best=scores.length?Math.max(...scores):null;
   html+=linked.length?linked.map(x=>'<a class="brew-card '+(x.score!=null&&x.score===best?'best':'')+'" href="#/brews/'+x.id+'"><div class="brew-card-text"><p><strong>'+esc(val(brew(x).brew_date)||'日期未填写')+' · '+(x.score==null?'未评分':x.score.toFixed(1)+' / 5')+(x.score!=null&&x.score===best?' · 最高分':'')+'</strong></p><p>'+esc(val(brew(x).review)||'暂无个人复盘')+'</p></div></a>').join(''):'<p class="caption">这包豆还没有冲煮记录。</p>';
   const recipe=r.recipe||{};
   const filled=['dripper','grind','ratio','other'].some(k=>recipe[k])||recipe.stages?.length;
   html+='<details class="official-recipe" '+(filled?'open':'')+'><summary>官方推荐方案</summary><div class="details-body"><div class="recipe-fields">'+(db.presentation?.recipe_fields||[]).map(([k,name])=>'<div class="stack-field"><label>'+esc(name)+'</label><span class="value">'+esc(str(recipe[k]))+'</span></div>').join('')+'</div>'+(recipe.stages?.length?stages(recipe.stages):'')+textField('其他',str(recipe.other),'recipe-other')+'</div></details><div class="narrow-photo">'+gallery(r.photos,'bean')+'</div>';
  }else html+=(r.sources||[]).map(s=>'<section class="source-entry"><p class="caption">'+esc(s.created_at)+' · UTC</p><div class="source-text">'+esc(s.raw_text)+'</div></section>').join('')+jsonDetails('豆子修改历史',r.history)+jsonDetails('图片与推荐方案历史',r.metadata_history)+jsonDetails('全部字段与来源',c)+jsonDetails('包装原文与来源 · 完整资料',r.sources);
  html+='</div>';
 }
 if(page==='terms')html='<h2>'+esc(r.name)+'</h2><p class="caption">统一标准名称与同义写法；原始字幕和历史资料保留。</p><div class="term-name"><label>标准名称</label><span class="value">'+esc(r.name)+'</span></div><p class="alias-label"><strong>已有别名</strong></p><p>'+esc(r.aliases||'暂无别名')+'</p>';
 $('#detail').innerHTML=html;
 document.querySelectorAll('.bean-photo img').forEach(img=>{const scale=()=>img.closest('.bean-photo').style.setProperty('--image-scale',Math.min(1,(img.naturalWidth||Number(img.getAttribute('width')))/(img.naturalHeight||Number(img.getAttribute('height'))))||1);img.addEventListener('load',scale);scale()});
}
function route(){
 const previous=page,scroll=$('.items')?.scrollTop||0,m=location.hash.match(/^#\/(brews|beans|terms)(?:\/(\d+))?$/);
 if($('#lightbox').open)closeImage();
 page=m?.[1]||'brews';selected=Number(m?.[2]||selections[page]||0);if(previous!==page)tab=0;
 const row=db[page].find(x=>x.id===selected);
 if(row&&m?.[2]&&!filtered().some(x=>x.id===selected)){for(const k of Object.keys(state[page]))if(!['sort','desc'].includes(k))state[page][k]='';}
 document.body.dataset.page=page;document.body.classList.remove('sidebar-mobile-open');
 $('#title').textContent={brews:'冲煮记录',beans:'豆库',terms:'Pour Over Database'}[page];
 document.querySelectorAll('nav a').forEach(a=>a.setAttribute('aria-current',a.dataset.page===page?'page':'false'));
 renderFilters();renderList();if(previous===page&&$('.items'))$('.items').scrollTop=scroll;
}
function exportRows(){const rows=filtered(),keys=[...Object.keys(db.labels).filter(k=>rows.some(r=>r.display?.coffee?.[k]!=null||r.display?.brew?.[k]!=null))];return [['文件名','咖啡豆编号','评分',...keys.map(k=>db.labels[k])],...rows.map(r=>[r.filename,r.coffee_id,r.score,...keys.map(k=>r.display?.coffee?.[k]??r.display?.brew?.[k]??'')])];}
function csv(){const quote=v=>'"'+String(v??'').replace(/^(\s*[=+@-])/ ,"'$1").replace(/"/g,'""')+'"';const url=URL.createObjectURL(new Blob(['\ufeff'+exportRows().map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='冲煮记录.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
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
  if(e.target.matches('[data-gallery]')){const root=e.target.closest('.gallery');gallerySelections.set(root.dataset.galleryKey,e.target.selectedIndex);document.querySelectorAll('.gallery').forEach(g=>{if(g.dataset.galleryKey===root.dataset.galleryKey){const img=g.querySelector('img'),size=db.media_dimensions?.[e.target.value.replace(manifest.media_base||'./','')];if(size){img.width=size.width;img.height=size.height}img.src=e.target.value;const select=g.querySelector('select');if(select)select.selectedIndex=e.target.selectedIndex}})}
 });
 document.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab]');if(t)activateTab(Number(t.dataset.tab),true);
  const img=e.target.closest('.hero-image');if(img)showImage(img);
  if(e.target.closest('#lightbox')){closeImage();return}
  const pop=e.target.closest('[data-popover]');
  if(pop){const open=pop.getAttribute('aria-expanded')!=='true';closePopovers();pop.setAttribute('aria-expanded',String(open));document.getElementById(pop.dataset.popover).hidden=!open;if(open)document.getElementById(pop.dataset.popover).querySelector('input,button')?.focus();}
  else if(!e.target.closest('.popover'))closePopovers();
  const bean=e.target.closest('[data-bean]');if(bean){state.brews.bean=bean.dataset.bean;renderFilters();renderList();$('[data-popover="bean-panel"]').focus();}
  if(e.target.closest('#bean-brews')){for(const k of Object.keys(state.brews))if(!['sort','desc'].includes(k))state.brews[k]='';state.brews.bean=String(selected);location.hash='#/brews';}
  if(e.target.closest('#export-csv'))csv();if(e.target.closest('#export-xlsx'))window.downloadXlsx(exportRows());
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
 let response=await fetch('./publication.json',{cache:'no-store'});if(!response.ok)throw Error('无法读取发布信息');manifest=await response.json();
 if(!/^snapshots\/[a-f0-9]{64}\.json$/.test(manifest.snapshot))throw Error('快照地址无效');
 response=await fetch('./'+manifest.snapshot);if(!response.ok)throw Error('无法读取数据快照');
 const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==manifest.snapshot_sha256)throw Error('数据完整性验证失败，请稍后刷新');
 db=JSON.parse(new TextDecoder().decode(bytes));if(db.schema!==1)throw Error('不支持的数据版本');
 state.terms.kind=[...new Set(db.terms.map(t=>t.kind))].sort()[0]||'';
 $('#updated').textContent='更新于 '+new Date(manifest.published_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）';
 route();
}catch(error){$('#detail').textContent=error.message;$('#detail').classList.add('error')}})();
