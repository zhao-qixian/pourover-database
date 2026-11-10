/* Shared local/public palette. No network dependencies, animation, or write API in read-only mode. */
(() => {
 'use strict';
 const embedded=window.parent!==window;
 const publicEmbed=window.PUBLIC_FLAVOR_EMBED===true;
 const publicMessage=message=>{if(publicEmbed&&embedded)window.parent.postMessage(message,location.origin);};
 const app=document.querySelector('#app');
 const state={mode:'view',query:'',scope:'all',showPending:!embedded?false:true,radius:19,region:null,showSca:false,viewBrightness:1,newPick:{h:35,s:.55,v:.85},refQuery:'',newName:'',newPrompt:'',newRefs:[],newIndex:0,newDraftId:null,pendingAdd:null,lastFocus:null,
  selected:null,recordKind:'beans',pairQuery:'',pairStatus:'pending',pairScope:'used',pairId:null,pick:null,message:'',invalidHex:false,nameDrafts:{},promptDrafts:{},promptWeights:{},promptExpanded:{},initialExpanded:{},promptLatest:{},pendingGeneration:null,pendingMerge:null,mergeTargets:{},mergeQueries:{},mergeDirections:{}};
 let data, canvasCache=new Map(), sending=false, lastPayload=null, lastHeight=null;
 const $=s=>app.querySelector(s);
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const statusLabel={sca_pending:'SCA待确认',pending:'待确认',approved:'已配色',uncolored:'不配色'};
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 function toHSV(hex){const [r,g,b]=rgb(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;
  if(d)h=(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60;
  return {h,s:max?d/max:0,v:max};}
 function toHex({h,s,v}){h=((h%360)+360)%360;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const a=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+a.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();}
 function point(hex){const p=toHSV(hex),a=(180-p.h)*Math.PI/180;return {x:300+270*p.s*Math.cos(a),y:300-270*p.s*Math.sin(a)};}
 function fromPoint(x,y,v=1){const dx=x-300,dy=300-y;return {h:((180-Math.atan2(dy,dx)*180/Math.PI)%360+360)%360,s:Math.min(1,Math.hypot(dx,dy)/270),v};}
 function lab(hex){const a=rgb(hex).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const xyz=[(a[0]*.4124564+a[1]*.3575761+a[2]*.1804375)/.95047,a[0]*.2126729+a[1]*.7151522+a[2]*.0721750,(a[0]*.0193339+a[1]*.1191920+a[2]*.9503041)/1.08883].map(t=>t>.008856?Math.cbrt(t):7.787*t+16/116);
  return [116*xyz[1]-16,500*(xyz[0]-xyz[1]),200*(xyz[1]-xyz[2])];}
 // A simple CIELAB distance is labelled explicitly; this is not CIEDE2000.
 function distance(a,b){const x=lab(a),y=lab(b);return Math.hypot(...x.map((v,i)=>v-y[i]));}
 const reviewStatus=f=>f.status==='pending'&&f.is_reference?'sca_pending':f.status;
 const statusText=f=>statusLabel[reviewStatus(f)];
 const actual=f=>f.status==='approved'?f.hex:null;
 const displayed=f=>actual(f)||(state.showPending&&f.status==='pending'?f.candidate_hex:null);
 const currentPair=()=>data.flavors.find(f=>f.id===state.pairId);
 const currentFlavor=()=>data.flavors.find(f=>f.id===state.selected);
 const matches=(f,q)=>[f.name,f.english,f.category,...(f.aliases||[])].some(s=>(s||'').toLowerCase().includes(q.trim().toLowerCase()));
 const used=f=>f.beanIds.length||f.brewIds.length;
 function send(event){if(!embedded||data.readonly)return;const value={...event,eventId:crypto.randomUUID()};window.parent.postMessage({isStreamlitMessage:true,type:'streamlit:setComponentValue',value,dataType:'json'},'*');return value.eventId;}
 function height(){const h=Math.ceil(app.getBoundingClientRect().height)+16;if(embedded&&h!==lastHeight){lastHeight=h;if(publicEmbed)publicMessage({type:'public-flavors:height',height:h});else window.parent.postMessage({isStreamlitMessage:true,type:'streamlit:setFrameHeight',height:h},'*');}}
 function swatch(color,extra=''){return `<span class="swatch ${color?'':'none'} ${extra}" ${color?`style="background:${escape(color)}"`:''} aria-hidden="true"></span>`;}
 function row(f,pair=false){const col=pair?(actual(f)||(f.status==='pending'?f.candidate_hex:null)):displayed(f);return `<button class="flavor-row ${(pair?state.pairId:state.selected)===f.id?'selected':''}" data-${pair?'pair':'flavor'}="${f.id}">${swatch(col)}<span class="row-text"><strong>${escape(f.name)}</strong><small>${escape(f.english||f.category||'尚无分类')}</small></span><span class="row-meta">${pair?statusText(f):`${f.beanIds.length} 包 · ${f.brewIds.length} 杯`}<br>${escape(col||'未配色')}</span></button>`;}
 function candidates(){return data.flavors.filter(f=>matches(f,state.query)&&(state.showSca||reviewStatus(f)!=='sca_pending')&&(state.scope==='all'||state.scope==='used'&&used(f)||state.scope===reviewStatus(f)));}
 function pickedFlavors(){const fs=candidates();if(!state.region)return fs;
  return fs.filter(f=>{const col=displayed(f);if(!col)return false;const p=point(col);return Math.hypot(p.x-state.region.x,p.y-state.region.y)<=state.radius;});}
 function paletteMarkup(picker=false){return `<div class="palette-wrap" id="palette-wrap"><canvas id="palette" width="600" height="600" aria-hidden="true"></canvas><svg id="points" viewBox="${state.mode==='view'?'24 24 552 552':'0 0 600 600'}" role="group" aria-label="${picker?'选择色相和饱和度':'风味色盘：点击标记或附近区域选择风味'}"><circle class="wheel-ring" cx="300" cy="300" r="272"/><g id="markers"></g><circle id="radius-halo" class="selection-halo" r="${state.radius}" hidden/><circle id="radius" class="selection" r="${state.radius}" hidden/><circle id="pick-halo" class="picked-halo" r="9" hidden/><circle id="pick" class="picked" r="9" hidden/></svg><div id="tooltip" class="tooltip" hidden></div></div>`;}
 function header(){const approved=data.flavors.filter(f=>f.status==='approved').length,uncolored=data.flavors.filter(f=>f.status==='uncolored').length,sca=data.flavors.filter(f=>reviewStatus(f)==='sca_pending').length;
  return `${!embedded?'<header class="standalone-brand"><div class="eyebrow">POUR OVER DATABASE</div><h2>风味色盘 · 只读预览</h2></header>':''}<div class="top"><div class="tabs"><button class="tab ${state.mode==='view'?'active':''}" data-mode="view">风味色盘</button>${!data.readonly?`<button class="tab ${state.mode==='pair'?'active':''}" data-mode="pair">配色确认</button><button class="tab ${state.mode==='add'?'active':''}" data-mode="add">添加风味</button>`:''}</div><div class="stats"><span><strong>${data.flavors.length}</strong>风味词</span><span><strong>${approved}</strong>已配色</span><span><strong>${uncolored}</strong>不配色</span><span><strong>${data.flavors.length-approved-uncolored-sca}</strong>待确认</span><span><strong>${sca}</strong>SCA待确认</span></div></div>`;
 }
 function viewer(){return `<div class="toolbar"><input class="search" id="query" type="search" placeholder="搜索风味、中英文名或分类…" aria-label="搜索风味" value="${escape(state.query)}"><select id="scope" aria-label="风味范围"><option value="all">全部风味</option><option value="used">我的记录中出现</option><option value="approved">已配色</option><option value="uncolored">不配色</option><option value="pending">待确认</option><option value="sca_pending">SCA待确认</option></select>${(!data.readonly||data.previewCandidates)?`<label><input id="pending" type="checkbox" ${state.showPending?'checked':''}>候选预览</label><label><input id="sca-pending" type="checkbox" ${state.showSca?'checked':''}>显示SCA待确认风味</label>`:''}<span class="note">位置忽略明暗 · 色点保留真实颜色</span></div><div class="layout"><section class="panel viewer-wheel-panel"><div class="panel-head"><h2>用颜色寻找风味</h2><button class="view-clear" id="clear">清除区域选择</button></div><p class="hint">悬停查看附近风味，点击选中；色点保留真实颜色。</p>${paletteMarkup()}<div class="viewer-sliders"><div><label for="view-brightness">明度（HSV V）<span id="view-brightness-value">${(state.viewBrightness*100).toFixed(1)}%</span></label><input id="view-brightness" type="range" min="0" max="100" step="0.1" value="${state.viewBrightness*100}"></div><div><label for="radius-control">选取半径<span id="radius-value">${state.radius}</span></label><input id="radius-control" type="range" min="8" max="42" value="${state.radius}" aria-label="选取半径"></div></div><div class="legend viewer-legend"><span><i></i>已确认</span>${(!data.readonly||data.previewCandidates)?'<span title="虚线仅为候选预览，须逐项确认后才保存。"><i class="dashed"></i>候选色 · 待确认</span>':''}<span title="相同色相和饱和度的深浅色可能重叠；点击附近区域可一起选中。灰阶集中在中心，不配色的词条保留在列表中。">位置忽略明暗 · 可选中附近多个风味</span></div></section><section class="panel"><div class="panel-head"><h2 id="list-title">风味列表</h2><span id="list-count" class="badge"></span></div><div class="list" id="flavor-list"></div><div id="detail"></div></section></div>`;}
 function pairEditor(){return `<div class="toolbar"><p class="hint">每一项配色都由你确认。也可以明确选择「不配色」，原始风味描述不变。</p></div><div class="pair-layout"><section class="panel pair-list-panel"><label class="search-label" for="pair-query">查找待处理风味</label><input id="pair-query" type="search" placeholder="搜索风味…" value="${escape(state.pairQuery)}"><div class="toolbar"><select id="pair-status" aria-label="配色状态"><option value="pending">待确认</option><option value="sca_pending">SCA待确认</option><option value="approved">已配色</option><option value="uncolored">不配色</option><option value="all">全部状态</option></select><select id="pair-scope" aria-label="配色词条来源"><option value="used">我的风味</option><option value="all">全部（含 SCA 参考）</option></select></div><div class="list pair-list" id="pair-list"></div></section><section class="panel"><div class="panel-head"><h2>选择颜色</h2><span class="badge">仅预览，确认后保存</span></div><p class="hint">点击色盘选色，再调整明度；也可直接输入 HEX。</p>${paletteMarkup(true)}<label class="slider-label" for="brightness">明度（HSV V）<span id="brightness-value"></span></label><input type="range" id="brightness" min="0" max="100" step="0.1" aria-label="颜色明度"><div class="hex-row"><input id="native-color" type="color" aria-label="系统取色器"><input id="hex" type="text" maxlength="7" aria-label="HEX 色号" placeholder="#RRGGBB"></div><div id="pair-controls"></div><p class="scope-note">色盘标记仍展示其他词条的真实颜色，位置不随明度变化。</p></section><section class="panel" id="pair-detail"></section></div>`;}
 function referenceSummary(){return '已选：'+(state.newRefs.map(id=>data.flavors.find(f=>f.id===id)?.name).filter(Boolean).join('、')||'无');}
 function updateAddPicker(){
  const color=toHex(state.newPick);app.querySelectorAll('[data-new-color]').forEach(b=>b.classList.toggle('selected',data.new_flavor_draft?.colors[Number(b.dataset.newColor)]?.hex===color));$('#new-hex').value=color;$('#new-brightness').value=state.newPick.v*100;$('#new-brightness-value').textContent=(state.newPick.v*100).toFixed(1)+'%';
  const template=document.createElement('template');template.innerHTML=addEditor();
  for(const selector of ['#new-color-preview','.add-layout .nearest']){const old=$(selector),next=template.content.querySelector(selector);if(old&&next)old.replaceWith(next);}
  drawPalette();height();
 }
 function fitViewer(){
  if(state.mode!=='view')return;
  const panel=$('.layout>.panel'),wheel=$('#palette-wrap');if(!panel||!wheel)return;
  if(publicEmbed&&innerWidth<=800){wheel.style.maxWidth='100%';height();return;}
  let viewport=window.innerHeight,offset=0;
  try{if(embedded){viewport=window.parent.innerHeight;offset=window.frameElement.getBoundingClientRect().top;}}catch{}
  const extra=panel.getBoundingClientRect().height-wheel.getBoundingClientRect().height;
  const available=viewport-Math.max(0,offset+panel.getBoundingClientRect().top)-extra-18;
  wheel.style.maxWidth=Math.max(120,Math.floor(available))+'px';height();
 }
 window.addEventListener('resize',()=>requestAnimationFrame(fitViewer));
 try{if(embedded)window.parent.addEventListener('resize',()=>requestAnimationFrame(fitViewer));}catch{}
 document.fonts.ready.then(()=>requestAnimationFrame(fitViewer));
 function addEditor(){
  const draft=data.new_flavor_draft;
  if(draft&&state.newDraftId!==draft.id){state.newDraftId=draft.id;state.newIndex=0;state.newPick=toHSV(draft.colors[0].hex);state.newName=draft.name;state.newPrompt=draft.prompt;state.newRefs=[...draft.reference_ids];}
  const color=toHex(state.newPick);
  const nearest=color?data.flavors.filter(f=>actual(f)).map(f=>({...f,delta:distance(color,f.hex)})).sort((a,b)=>a.delta-b.delta).slice(0,5):[];
  return `<p class="hint">先生成三个推荐色，核对相近风味后再添加。推荐不会自动保存或确认。</p><div class="add-layout"><section class="panel"><h2>新风味</h2><form id="new-flavor-form"><label for="new-name">风味名称</label><input id="new-name" required maxlength="200" value="${escape(state.newName)}" ${sending?'disabled':''}><label for="new-prompt">提示词（可选）</label><textarea id="new-prompt" rows="2" maxlength="500" placeholder="例如：清新、偏青绿、柔和一点" ${sending?'disabled':''}>${escape(state.newPrompt)}</textarea><label for="new-ref-search">搜索参考风味</label><input id="new-ref-search" type="search" value="${escape(state.refQuery)}" placeholder="搜索名称、旧名称或英文名…" ${sending?'disabled':''}><label for="new-refs">参考已有风味（可选，最多 10 个）</label><select id="new-refs" multiple size="9" ${sending?'disabled':''}>${data.flavors.filter(f=>matches(f,state.refQuery)).sort((a,b)=>pinyinOrder.compare(a.name,b.name)).map(f=>`<option value="${f.id}" ${state.newRefs.includes(f.id)?'selected':''}>${escape(f.name)}</option>`).join('')}</select><small>按住 Ctrl 可多选；不选也可以生成。</small><small id="new-ref-summary">${referenceSummary()}</small><button class="primary" type="submit" ${sending?'disabled':''}>${sending?'正在处理…':'生成三个推荐色'}</button></form>${state.message?`<p class="message">${escape(state.message)}</p>`:''}</section><section class="panel"><h2>选择颜色与核对风味</h2>${paletteMarkup(true)}<label class="slider-label" for="new-brightness">明度（HSV V）<span id="new-brightness-value">${(state.newPick.v*100).toFixed(1)}%</span></label><input id="new-brightness" type="range" min="0" max="100" step="0.1" value="${state.newPick.v*100}"><div class="hex-row"><input id="new-hex" aria-label="新风味 HEX 色号" value="${color}" maxlength="7"></div>${draft?`<p class="hint">当前预览：${escape(draft.name)}</p><div class="color-preview" id="new-color-preview" style="background:${color};color:${lab(color)[0]>60?'#241919':'#FFF9EF'}">${escape(draft.name)} · ${color}</div><div class="nearest"><h3>与已确认颜色比较 · ΔE76</h3>${nearest.length?nearest.map(f=>`<div class="nearest-row">${swatch(f.hex)}<span>${escape(f.name)}</span><span>${f.delta.toFixed(1)}</span></div>`).join(''):'<p class="plain-note">尚无已确认颜色。</p>'}<p class="plain-note">列出最接近的五项；数值越小，颜色越接近。颜色接近不代表含义相同。</p></div><div class="semantic-neighbors"><h3>意思或品类相近</h3>${draft.similar.length?draft.similar.map(f=>`<p><strong>${escape(f.name)}</strong><small>${escape(f.reason)}</small></p>`).join(''):'<p class="plain-note">未找到明显相近的已有风味。</p>'}<p class="plain-note">AI 语义建议，仅供核对，不会自动合并。</p></div>`:'<p class="empty">生成后显示颜色距离和语义相近词。</p>'}</section><section class="panel"><h2>三个推荐色</h2>${draft?`<p class="hint">为「${escape(draft.name)}」生成，选择一个颜色查看比较。</p><div class="recommendation-options">${draft.colors.map((c,i)=>`<button class="recommendation ${color===c.hex?'selected':''}" data-new-color="${i}" ${sending?'disabled':''}>${swatch(c.hex)}<span><strong>建议 ${i+1} · ${c.hex}</strong><small>${escape(c.reason)}</small></span></button>`).join('')}</div>${draft.warnings.map(w=>`<p class="plain-note">${escape(w)}</p>`).join('')}<div class="actions"><button class="primary" data-add-status="approved" ${sending?'disabled':''}>确认配色并添加</button><button data-add-status="pending" ${sending?'disabled':''}>添加为待确认</button><button data-add-status="uncolored" ${sending?'disabled':''}>添加为不配色</button></div><p class="plain-note">保存名称：${escape(draft.name)}。修改左侧输入后，请重新生成再保存。</p>`:'<p class="empty">填写名称即可生成，不需要提示词或参考风味。</p>'}</section></div>`;
 }
 function bindAdd(){
  $('#new-name').oninput=e=>{state.newName=e.target.value;};
  $('#new-prompt').oninput=e=>{state.newPrompt=e.target.value;};
  $('#new-refs').onchange=e=>{const visible=[...e.target.options].map(o=>o.value);state.newRefs=[...new Set([...state.newRefs.filter(id=>!visible.includes(id)),...[...e.target.selectedOptions].map(o=>o.value)])];$('#new-ref-summary').textContent=referenceSummary();drawMarkers();};
  $('#new-ref-search').oninput=e=>{state.refQuery=e.target.value;const template=document.createElement('template');template.innerHTML=addEditor();$('#new-refs').innerHTML=template.content.querySelector('#new-refs').innerHTML;};
  $('#new-brightness').oninput=e=>{state.newPick.v=Number(e.target.value)/100;updateAddPicker();};
  $('#new-hex').onchange=e=>{if(/^#[a-f\d]{6}$/i.test(e.target.value)){state.newPick=toHSV(e.target.value);updateAddPicker();}else e.target.value=toHex(state.newPick);};
  $('#new-flavor-form').onsubmit=e=>{e.preventDefault();if(state.newRefs.length>10){state.message='最多选择 10 个参考风味';render();return;}sending=true;state.message='正在生成推荐色和相近风味…';state.pendingAdd=send({type:'generate_new_flavor',name:state.newName,prompt:state.newPrompt,referenceIds:state.newRefs});render();};
  app.querySelectorAll('[data-new-color]').forEach(b=>b.onclick=()=>{state.newIndex=Number(b.dataset.newColor);state.newPick=toHSV(data.new_flavor_draft.colors[state.newIndex].hex);render();});
  app.querySelectorAll('[data-add-status]').forEach(b=>b.onclick=()=>{
   const draft=data.new_flavor_draft;
   if(state.newName.trim()!==draft.name||state.newPrompt.trim()!==draft.prompt||JSON.stringify(state.newRefs)!==JSON.stringify(draft.reference_ids)){state.message='输入已修改，请重新生成后再添加';render();return;}
   sending=true;state.pendingAdd=send({type:'save_new_flavor',draftId:draft.id,index:state.newIndex,hex:toHex(state.newPick),status:b.dataset.addStatus});render();
  });
 }
 function render(){if(!data)return;app.innerHTML=`<div class="shell">${header()}${state.mode==='view'?viewer():state.mode==='add'?addEditor():pairEditor()}</div>`;
  if(state.mode==='pair'){const layout=$('.pair-layout');layout.append(layout.firstElementChild);layout.insertBefore($('#pair-detail'),layout.firstElementChild);}
  app.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;state.message='';render();});
  if(state.mode==='view')bindViewer();else if(state.mode==='add')bindAdd();else bindPair();
  drawPalette();bindPalette();height();requestAnimationFrame(fitViewer);
 }
 function bindViewer(){ $('#scope').value=state.scope;
  $('#view-brightness').oninput=e=>{state.viewBrightness=Number(e.target.value)/100;$('#view-brightness-value').textContent=(state.viewBrightness*100).toFixed(1)+'%';drawPalette();};
  $('#query').oninput=e=>{state.query=e.target.value;state.region=null;updateView();drawMarkers();};
  $('#scope').onchange=e=>{state.scope=e.target.value;if(state.scope==='sca_pending'){state.showSca=true;if($('#sca-pending'))$('#sca-pending').checked=true;}state.region=null;updateView();drawMarkers();};
  if($('#sca-pending'))$('#sca-pending').onchange=e=>{state.showSca=e.target.checked;state.region=null;updateView();drawMarkers();};
  if($('#pending'))$('#pending').onchange=e=>{state.showPending=e.target.checked;render();};
  $('#radius-control').oninput=e=>{state.radius=Number(e.target.value);$('#radius-value').textContent=state.radius;updateView();selection(state.region);};
  $('#clear').onclick=()=>{state.region=null;selection(null);updateView();};updateView();
 }
 function updateView(){const fs=pickedFlavors();if(!fs.some(f=>f.id===state.selected))state.selected=null;$('#list-title').textContent=state.region?'附近的风味':'风味列表';$('#list-count').textContent=`${fs.length} 个`;
  $('#flavor-list').innerHTML=fs.length?fs.map(f=>row(f)).join(''):'<p class="empty">这里暂时没有匹配的风味。试试其他区域或更大的选取半径。</p>';
  $('#flavor-list').querySelectorAll('[data-flavor]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.flavor;publicMessage({type:'public-flavors:select',id:state.selected});updateView();drawMarkers();});renderDetail();height();
 }
 function renderDetail(){const f=currentFlavor();if(!f){$('#detail').innerHTML='<div class="detail"><p class="muted">选择一个风味，查看官方标注的豆子与实际记录它的冲煮。</p></div>';return;}
  const col=displayed(f);$('#detail').innerHTML=`<div class="detail"><div class="detail-title">${swatch(col)}<div><h3>${escape(f.name)}</h3><small>${escape(col||'未配色')} · ${statusText(f)}</small></div>${!data.readonly?'<button id="detail-pair" '+(sending?'disabled':'')+'>配色</button>':''}</div><div class="record-tabs"><button data-record-kind="beans" class="${state.recordKind==='beans'?'active':''}">官方标注 · ${f.beanIds.length} 包豆</button><button data-record-kind="brews" class="${state.recordKind==='brews'?'active':''}">实际喝到 · ${f.brewIds.length} 杯</button></div><div class="records" id="records"></div><p class="source-note">官方标注不自动算作实际喝到。这里只统计各记录已关联的风味卡。</p></div>`;
  if($('#detail-pair'))$('#detail-pair').onclick=()=>{state.mode='pair';state.pairId=f.id;state.pairQuery='';state.pairStatus='all';state.pairScope='all';state.pick=toHSV(actual(f)||f.candidate_hex||'#D8A165');state.message='';render();$('#pair-list .selected')?.scrollIntoView({block:'nearest'});$('.top').scrollIntoView({block:'start'});};
  $('#detail').querySelectorAll('[data-record-kind]').forEach(b=>b.onclick=()=>{state.recordKind=b.dataset.recordKind;renderDetail();height();});
  const bean=state.recordKind==='beans',ids=bean?f.beanIds:f.brewIds;
  $('#records').innerHTML=ids.length?ids.map(id=>{const r=(bean?data.beans:data.brews)[id];return `<button class="record" data-open="${id}" data-kind="${bean?'bean':'brew'}">${escape(r.name||'未命名')}<small>${escape(r.date||'日期未填写')} ${bean?' · '+r.number:''} ↗</small></button>`;}).join(''):`<p class="empty">尚无${bean?'官方标注此风味的豆子':'明确记录此风味的冲煮'}。</p>`;
  $('#records').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openRecord(b.dataset.kind,b.dataset.open));
 }
 function openRecord(kind,id){if(publicEmbed){publicMessage({type:'public-flavors:open',kind,id});return;}if(!data.readonly){send({type:'open_'+kind,id});return;}
  const r=(kind==='bean'?data.beans:data.brews)[id],modal=document.createElement('div');modal.className='record-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','记录详情');
  modal.innerHTML=`<article><header><h2>${escape(r.name)}</h2><button id="close-record" aria-label="关闭记录">×</button></header><p class="muted">${escape(r.date||'日期未填写')} ${escape(r.number||'')}</p>${kind==='brew'?`<p>${escape(r.review||'暂无个人复盘')}</p>`:`<p>官方风味：${data.flavors.filter(f=>f.beanIds.includes(String(id))).map(f=>escape(f.name)).join('、')}</p>`}</article>`;
  document.body.append(modal);modal.onclick=e=>{if(e.target===modal||e.target.closest('#close-record'))modal.remove();};modal.onkeydown=e=>{if(e.key==='Escape')modal.remove();};modal.querySelector('button').focus();
 }
 function pairCandidates(){return data.flavors.filter(f=>matches(f,state.pairQuery)&&(state.pairStatus==='all'||reviewStatus(f)===state.pairStatus)&&(state.pairScope==='all'||used(f)));}
 function selectPair(id){state.pairId=id;const f=currentPair();state.pick=toHSV(actual(f)||f.candidate_hex||'#D8A165');state.message='';updatePairList();drawPalette();updatePicker();}
 function bindPair(){ $('#pair-status').value=state.pairStatus;$('#pair-scope').value=state.pairScope;
  $('#pair-query').oninput=e=>{state.pairQuery=e.target.value;updatePairList();};
  $('#pair-status').onchange=e=>{state.pairStatus=e.target.value;if(state.pairStatus==='sca_pending'){state.pairScope='all';$('#pair-scope').value='all';}updatePairList();};
  $('#pair-scope').onchange=e=>{state.pairScope=e.target.value;updatePairList();};
  if(!currentPair()){state.pairId=null;state.pick=null;const first=pairCandidates()[0];if(first){state.pairId=first.id;state.pick=toHSV(actual(first)||first.candidate_hex||'#D8A165');}}
  $('#brightness').oninput=e=>{state.pick.v=Number(e.target.value)/100;drawPalette();updatePicker();};
  $('#hex').onchange=e=>{if(/^#[a-f\d]{6}$/i.test(e.target.value)){state.pick=toHSV(e.target.value);state.message='';drawPalette();updatePicker();}else{state.invalidHex=true;state.message='请输入六位 HEX 色号，例如 #D8A165';renderPairDetail();}};
  $('#native-color').oninput=e=>{state.pick=toHSV(e.target.value);drawPalette();updatePicker();};
  updatePairList();updatePicker();if(!currentPair()){renderPairDetail();$('#brightness').disabled=true;$('#hex').disabled=true;$('#native-color').disabled=true;}
 }
 function updatePairList(){const fs=pairCandidates();$('#pair-list').innerHTML=fs.length?fs.map(f=>row(f,true)).join(''):'<p class="empty">当前范围没有词条。</p>';
  $('#pair-list').querySelectorAll('[data-pair]').forEach(b=>b.onclick=()=>selectPair(b.dataset.pair));height();}
 function updatePicker(){if(!state.pick)return;if(state.invalidHex)state.message='';state.invalidHex=false;const hex=toHex(state.pick);$('#brightness').value=state.pick.v*100;$('#brightness-value').textContent=`${(state.pick.v*100).toFixed(1)}%`;$('#hex').value=hex;$('#native-color').value=hex;renderPairDetail();drawMarkers();height();}
 function rgbBreakdown(hex){
  const channels=rgb(hex).map(n=>Math.round(n*255)),total=channels.reduce((a,b)=>a+b,0);
  return `<div class="rgb-breakdown" aria-label="RGB 占比"><div class="rgb-channels">${channels.map((v,i)=>`<div><span>${['红 R','绿 G','蓝 B'][i]}</span><strong>${total?(100*v/total).toFixed(1)+'%':'—'}</strong><small>${v} / 255</small></div>`).join('')}</div><p class="plain-note">${total?'占比 = 通道值 ÷ (R + G + B)；四舍五入可能有误差。':'黑色的 R、G、B 均为 0，无法计算占比。'}</p></div>`;
 }
 function recommendedColors(f,hex){
  if(!f.recommendations?.length)return '';
  return `<details class="recommendations" id="initial-recommendations" ${(state.initialExpanded[f.id]??!f.prompt_history?.length)?'open':''}><summary>初始推荐色</summary><p class="plain-note">${escape(f.recommendation_note)}</p><div class="recommendation-options">${f.recommendations.map(c=>`<button class="recommendation ${c.hex===hex?'selected':''}" data-recommendation="${escape(c.hex)}" ${sending?'disabled':''}>${swatch(c.hex)}<span><strong>${escape(c.label)} <small>${escape(c.hex)}</small></strong><small>${escape(c.reason)}</small></span></button>`).join('')}</div></details>`;
 }
 function promptInput(f){
  const draft=state.promptDrafts[f.id]??f.prompt_history?.[0]?.prompt??'';
  const weight=state.promptWeights[f.id]??f.prompt_history?.[0]?.prompt_weight??35;
  return `<section class="prompt-input"><form id="prompt-form"><label class="search-label" for="color-prompt">选色提示词（可选）</label><textarea id="color-prompt" maxlength="500" rows="3" placeholder="留空则仅按风味名称生成；例如：更清新、稍浅一点" ${sending?'disabled':''}>${escape(draft)}</textarea><button type="submit" id="generate-colors" ${sending?'disabled':''}>${state.pendingGeneration?'正在生成…':'生成三个推荐色'}</button><label class="prompt-weight-label" for="prompt-weight">提示词权重 <output id="prompt-weight-value">${weight}%</output></label><input id="prompt-weight" type="range" min="0" max="100" step="1" value="${weight}" ${sending?'disabled':''}><div class="prompt-weight-ends"><span>仅原风味</span><span>仅提示词</span></div></form><p class="plain-note">提示词留空时仅按风味名称生成，权重不生效。有提示词时，权重越高越偏向提示词；0% 忽略提示词，100% 忽略原风味联想。原有推荐色和历史提示词都会保留。</p></section>`;
 }
 function promptHistory(f,hex){
  const history=f.prompt_history||[];
  if(!history.length)return '';
  return `<section class="prompt-recommendations"><h3>提示词生成的推荐色</h3><div class="prompt-history">${history.map((batch,i)=>`<details data-prompt-batch="${batch.id}" ${(state.promptExpanded[batch.id]??i===0)?'open':''}><summary>第 ${history.length-i} 组 · ${escape(batch.prompt.slice(0,35)||'按风味名称生成')}${batch.prompt.length>35?'…':''}${batch.prompt_weight!=null?` · 提示词 ${batch.prompt_weight}%`:''}</summary><p class="saved-prompt">${escape(batch.prompt)}</p><div class="recommendation-options">${batch.options.map(c=>`<button class="recommendation ${c.hex===hex?'selected':''}" data-recommendation="${escape(c.hex)}" ${sending?'disabled':''}>${swatch(c.hex)}<span><strong>${escape(c.label)} <small>${escape(c.hex)}</small></strong><small>${escape(c.reason)}</small>${c.anchor_hex?`<small>原风味基准 ${escape(c.anchor_hex)}</small>`:''}</span></button>`).join('')}</div>${batch.warnings.map(w=>`<p class="plain-note">${escape(w)}</p>`).join('')}</details>`).join('')}</div></section>`;
 }
 function renameControl(f){return `<form id="rename-form" class="rename-flavor"><label class="search-label" for="flavor-name">风味名称</label><div><input id="flavor-name" type="text" maxlength="200" required value="${escape(state.nameDrafts[f.id]??f.name)}" ${sending?'disabled':''}><button id="rename-flavor" type="submit" ${sending?'disabled':''}>保存名称</button></div><small>保留配色与记录关联，原始描述不变；旧名称仍可搜索。</small></form>`;}
 const pinyinOrder=new Intl.Collator('zh-Hans-CN-u-co-pinyin',{sensitivity:'base',numeric:true});
 function mergeChoices(f){
  const query=(state.mergeQueries[f.id]||'').normalize('NFKC').trim().toLocaleLowerCase();
  return data.flavors.filter(x=>x.id!==f.id&&[x.name,x.english,...(x.aliases||[])].some(n=>(n||'').normalize('NFKC').toLocaleLowerCase().includes(query))).sort((a,b)=>pinyinOrder.compare(a.name,b.name));
 }
 function mergePair(f){
  const other=data.flavors.find(x=>x.id===state.mergeTargets[f.id]&&x.id!==f.id);
  if(!other)return null;
  return state.mergeDirections[f.id]==='outgoing'?{source:f,target:other}:{source:other,target:f};
 }
 function mergeColorPreview(f){
  const selected=data.flavors.find(x=>x.id===state.mergeTargets[f.id]&&x.id!==f.id);
  if(!selected)return '<p class="plain-note">选择风味后显示颜色预览</p>';
  const color=actual(selected)||(selected.status==='pending'?selected.candidate_hex:null);
  const label=actual(selected)?'已确认配色':color?'候选色 · 待确认':selected.status==='uncolored'?'不配色':'尚未配色';
  return `<div class="merge-color-card">${color?`<span class="merge-color-swatch" style="background:${escape(color)}" aria-label="所选风味颜色 ${escape(color)}"></span>`:'<span class="merge-color-swatch no-color" aria-label="无配色">—</span>'}<span><strong>${escape(selected.name)}</strong><small>${label}${color?' · '+escape(color):''}</small></span></div>`;
 }
 function mergeControl(f){
  const pair=mergePair(f),choices=mergeChoices(f),direction=state.mergeDirections[f.id]||'incoming';
  return `<section class="merge-flavors"><h3>合并风味</h3><div class="merge-choice-row"><div><label class="search-label" for="merge-search">搜索要合并的风味</label><input id="merge-search" type="search" placeholder="搜索名称、旧名称或英文名…" value="${escape(state.mergeQueries[f.id]||'')}" ${sending?'disabled':''}></div><div><label class="search-label" for="merge-target">选择风味 · 按拼音排序</label><select id="merge-target" ${sending?'disabled':''}><option value="">${choices.length?'选择另一个风味…':'没有匹配的风味'}</option>${choices.map(x=>`<option value="${x.id}" ${state.mergeTargets[f.id]===x.id?'selected':''}>${escape(x.name)}</option>`).join('')}</select></div></div><div id="merge-color-preview">${mergeColorPreview(f)}</div><label class="search-label" for="merge-direction">合并方向</label><select id="merge-direction" ${sending?'disabled':''}><option value="incoming" ${direction==='incoming'?'selected':''}>所选风味 → 当前风味（保留当前）</option><option value="outgoing" ${direction==='outgoing'?'selected':''}>当前风味 → 所选风味（保留所选）</option></select><div id="merge-preview">${pair?`<p class="plain-note">「${escape(pair.source.name)}」 → 「${escape(pair.target.name)}」<br>保留「${escape(pair.target.name)}」 · ${statusText(pair.target)} ${escape(actual(pair.target)||'')}<br>合并后关联 ${new Set([...pair.source.beanIds,...pair.target.beanIds]).size} 包豆、${new Set([...pair.source.brewIds,...pair.target.brewIds]).size} 条个人风味冲煮。两边的旧名称、提示词历史均保留；重复关联只计一次。</p>`:''}</div><button id="merge-flavors" ${sending||!pair?'disabled':''}>${pair?`合并到「${escape(pair.target.name)}」`:'请选择要合并的风味'}</button></section>`;
 }
 function renderPairDetail(){const f=currentPair();if(!f){$('#pair-detail').innerHTML='<p class="empty">暂无风味</p>';$('#pair-controls').innerHTML='';return;}
  const hex=toHex(state.pick),contrast=lab(hex)[0]>60?'#241919':'#FFF9EF';
  const neighbors=data.flavors.filter(x=>x.id!==f.id&&x.status==='approved').map(x=>({...x,delta:distance(hex,x.hex)})).sort((a,b)=>a.delta-b.delta).slice(0,3);
  $('#pair-detail').innerHTML=`<span class="badge ${f.status}">${statusText(f)}</span><div class="pair-flavor-heading"><h2>${escape(f.name)}</h2><small class="pair-usage" title="豆子统计官方风味；冲煮统计明确填写的个人风味，同一记录只计一次。">${f.beanIds.length} 包豆 · ${f.brewIds.length} 次冲煮</small></div>${renameControl(f)}${promptInput(f)}<div class="message" ${state.message?'':'hidden'}>${escape(state.message)}</div><p class="muted">${escape(f.english)}</p><div class="color-preview" style="background:${hex};color:${contrast}">${escape(f.name)}</div>${rgbBreakdown(hex)}${recommendedColors(f,hex)}${promptHistory(f,hex)}<p class="plain-note">${escape(f.source||'没有参考色；当前为选色起点，不会自动保存。')}</p>${f.reference_name?`<p class="plain-note">参考词：${escape(f.reference_name)} · ${escape(f.candidate_hex)}</p>`:''}<p class="plain-note">${escape(f.definition||'保留原词；配色不会修改风味名称或描述。')}</p>`;
  $('#pair-controls').innerHTML=`<div class="nearest"><span>与已确认颜色比较 · ΔE76</span>${neighbors.length?neighbors.map(n=>`<div class="nearest-row">${swatch(n.hex)}<span>${escape(n.name)}</span><span>${n.delta.toFixed(1)}</span></div>`).join(''):'<p class="plain-note">尚无已确认配色。候选预览不代表批准。</p>'}<p class="plain-note">仅供选色参考；不是 CIEDE2000，不自动限制颜色。相同颜色可对应多个风味。</p></div><div class="actions"><button class="primary" id="approve" ${sending||state.invalidHex?'disabled':''}>确认此配色 ${hex}</button><button id="no-color" ${sending?'disabled':''}>不配色</button>${f.candidate_hex?'<button id="use-reference">使用参考色（待确认）</button>':''}${f.status!=='pending'?'<button id="reset-pending">改为待确认</button>':''}</div>${mergeControl(f)}<div class="delete-flavor"><button id="delete-flavor" ${sending?'disabled':''}>删除风味词</button><p class="plain-note">从色盘与风味词库移除，保留豆子与冲煮的原始描述。同步时不会自动重新加入。</p></div>`;
  function decide(status){sending=true;state.message='正在保存…';send({type:'decide',flavorId:f.id,status,hex,revision:f.revision});renderPairDetail();}
  $('#pair-detail').querySelectorAll('[data-recommendation]').forEach(b=>b.onclick=()=>{state.pick=toHSV(b.dataset.recommendation);drawPalette();updatePicker();});
  $('#color-prompt').oninput=e=>{state.promptDrafts[f.id]=e.target.value;};
  $('#prompt-weight').oninput=e=>{state.promptWeights[f.id]=Number(e.target.value);$('#prompt-weight-value').textContent=e.target.value+'%';};
  $('#prompt-form').onsubmit=e=>{e.preventDefault();const prompt=$('#color-prompt').value.trim(),promptWeight=Number($('#prompt-weight').value);state.promptDrafts[f.id]=prompt;sending=true;state.message='正在生成，请稍候…';state.pendingGeneration=send({type:'prompt_colors',flavorId:f.id,prompt,promptWeight,revision:f.revision});renderPairDetail();height();};
  if($('#initial-recommendations'))$('#initial-recommendations').ontoggle=e=>{if(e.target.isConnected){state.initialExpanded[f.id]=e.target.open;height();}};
  $('#pair-detail').querySelectorAll('[data-prompt-batch]').forEach(d=>d.ontoggle=()=>{if(d.isConnected)state.promptExpanded[d.dataset.promptBatch]=d.open;});
  $('#flavor-name').oninput=e=>{state.nameDrafts[f.id]=e.target.value;};
  $('#rename-form').onsubmit=e=>{e.preventDefault();const name=$('#flavor-name').value.trim();if(!name){state.message='请输入风味名称';renderPairDetail();return;}sending=true;state.message='正在保存名称…';send({type:'rename_flavor',flavorId:f.id,name,revision:f.revision});renderPairDetail();};
  $('#merge-target').onchange=e=>{state.mergeTargets[f.id]=e.target.value;renderPairDetail();height();};
  // Keep the input node alive: replacing it interrupts Chinese IME composition.
  const mergeSearch=$('#merge-search');let composing=false;
  function updateMergeSearch(){
   state.mergeQueries[f.id]=mergeSearch.value;
   if(!mergeChoices(f).some(x=>x.id===state.mergeTargets[f.id]))delete state.mergeTargets[f.id];
   const next=document.createElement('template');next.innerHTML=mergeControl(f);
   for(const id of ['merge-target','merge-color-preview','merge-preview','merge-flavors']){
    const current=$('#'+id),updated=next.content.querySelector('#'+id);
    current.innerHTML=updated.innerHTML;
    if('disabled' in current)current.disabled=updated.disabled;
   }
   height();
  }
  mergeSearch.addEventListener('compositionstart',()=>{composing=true;});
  mergeSearch.addEventListener('compositionend',()=>{composing=false;updateMergeSearch();});
  mergeSearch.oninput=e=>{if(!composing&&!e.isComposing)updateMergeSearch();};
  $('#merge-direction').onchange=e=>{state.mergeDirections[f.id]=e.target.value;renderPairDetail();height();};
  $('#merge-flavors').onclick=()=>{const pair=mergePair(f);if(!pair)return;const {source,target}=pair;sending=true;state.message='正在合并风味…';state.pendingMerge=send({type:'merge_flavors',flavorId:source.id,targetId:target.id,revision:source.revision,targetRevision:target.revision});renderPairDetail();};
  $('#delete-flavor').onclick=()=>{sending=true;state.message='正在删除…';send({type:'delete_flavor',flavorId:f.id,revision:f.revision});renderPairDetail();};
  $('#approve').onclick=()=>decide('approved');$('#no-color').onclick=()=>decide('uncolored');
  if($('#use-reference'))$('#use-reference').onclick=()=>{state.pick=toHSV(f.candidate_hex);drawPalette();updatePicker();};
  if($('#reset-pending'))$('#reset-pending').onclick=()=>decide('pending');
 }
 function drawPalette(){const canvas=$('#palette');if(!canvas)return;const v=state.mode==='pair'?(state.pick?.v??1):state.mode==='add'?state.newPick.v:state.viewBrightness;
  const key=v.toFixed(3);let image=canvasCache.get(key);const ctx=canvas.getContext('2d');
  if(!image){image=ctx.createImageData(600,600);for(let y=30;y<570;y++)for(let x=30;x<570;x++){
    const dx=x-300,dy=300-y;if(dx*dx+dy*dy>270*270)continue;const p=fromPoint(x,y,v),h=p.h,c=p.v*p.s,m=p.v-c,t=c*(1-Math.abs((h/60)%2-1));
    const a=h<60?[c,t,0]:h<120?[t,c,0]:h<180?[0,c,t]:h<240?[0,t,c]:h<300?[t,0,c]:[c,0,t],i=(y*600+x)*4;
    image.data[i]=Math.round((a[0]+m)*255);image.data[i+1]=Math.round((a[1]+m)*255);image.data[i+2]=Math.round((a[2]+m)*255);image.data[i+3]=255;
   }canvasCache.clear();canvasCache.set(key,image);}
  ctx.putImageData(image,0,0);drawMarkers();
 }
 function drawMarkers(){const g=$('#markers');if(!g)return;
  const refs=data.flavors.filter(f=>state.newRefs.includes(f.id)&&(actual(f)||(f.status==='pending'&&f.candidate_hex)));
  const recommendations=(data.new_flavor_draft?.colors||[]).map((c,i)=>({id:'recommendation-'+i,name:'建议 '+(i+1),status:'pending',candidate_hex:c.hex,recommendationIndex:i}));
  const fs=state.mode==='add'?[...refs,...recommendations]:state.mode==='pair'?data.flavors.filter(f=>actual(f)||(f.status==='pending'&&f.candidate_hex)):candidates().filter(f=>displayed(f));
  g.innerHTML=fs.map(f=>{const hex=state.mode!=='view'?(actual(f)||f.candidate_hex):displayed(f),p=point(hex);
   return `<g data-marker="${f.id}" tabindex="0" role="button" aria-label="${escape(f.name)}，${hex}，${f.recommendationIndex!==undefined?'推荐色':statusText(f)}"><title>${escape(f.name)} · ${hex}</title><circle class="marker-hit" cx="${p.x}" cy="${p.y}" r="10"/><circle class="marker ${f.status==='pending'?'pending':''}" cx="${p.x}" cy="${p.y}" r="${state.selected===f.id?6.5:4.5}" fill="${escape(hex)}"/></g>`;}).join('');
  g.querySelectorAll('[data-marker]').forEach(el=>{
   const activate=()=>{const f=fs.find(f=>f.id===el.dataset.marker);if(state.mode==='view'){state.region=point(displayed(f));state.selected=f.id;selection(state.region);updateView();}else if(state.mode==='add'){if(f.recommendationIndex!==undefined)state.newIndex=f.recommendationIndex;state.newPick=toHSV(actual(f)||f.candidate_hex);updateAddPicker();}else{state.pick=toHSV(actual(f)||f.candidate_hex);drawPalette();updatePicker();}};
   el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}};
   if(state.mode==='add')el.onclick=e=>{e.stopPropagation();activate();};
  });
  if(state.mode!=='view'){const p=point(toHex(state.mode==='add'?state.newPick:state.pick||{h:0,s:0,v:1}));for(const id of ['pick','pick-halo']){const c=$('#'+id);c.removeAttribute('hidden');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);}}
  if(state.mode==='view')selection(state.region);
 }
 function selection(p){for(const id of ['radius','radius-halo']){const c=$('#'+id);if(!c)continue;c.toggleAttribute('hidden',!p);if(p){c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',state.radius);}}}
 function bindPalette(){const svg=$('#points'),wrap=$('#palette-wrap');
  const coords=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  svg.onpointermove=e=>{if(state.mode!=='view')return;const p=coords(e);if(Math.hypot(p.x-300,p.y-300)>270){selection(state.region);$('#tooltip').hidden=true;return;}
   selection(p);const found=candidates().filter(f=>{const hex=displayed(f);if(!hex)return false;const q=point(hex);return Math.hypot(p.x-q.x,p.y-q.y)<=state.radius;});
   const tip=$('#tooltip');tip.hidden=false;tip.textContent=found.length?`${found.length} 个风味 · ${found.slice(0,7).map(f=>f.name).join('、')}${found.length>7?'…':''}`:'附近暂无风味';
   const box=wrap.getBoundingClientRect();tip.style.left=Math.min(e.clientX-box.left+14,Math.max(0,box.width-240))+'px';tip.style.top=Math.max(0,e.clientY-box.top-60)+'px';
  };
  svg.onpointerleave=()=>{selection(state.mode==='view'?state.region:null);$('#tooltip').hidden=true;};
  svg.onclick=e=>{const p=coords(e);if(Math.hypot(p.x-300,p.y-300)>270)return;
   if(state.mode==='add'){state.newPick=fromPoint(p.x,p.y,state.newPick.v);updateAddPicker();}
   else if(state.mode==='pair'){if(!currentPair())return;state.pick=fromPoint(p.x,p.y,state.pick?.v??1);state.message='';updatePicker();}
   else{state.region=p;const nearby=pickedFlavors();state.selected=nearby[0]?.id||null;publicMessage({type:'public-flavors:select',id:state.selected});$('#tooltip').hidden=true;selection(p);updateView();drawMarkers();}
  };
 }
 function compactSidebar(){
  if(!embedded||data.readonly)return;
  try{
   const host=window.parent,key='flavor-sample-compact-sidebar-v1';
   if(host.sessionStorage.getItem(key))return;
   const handle=host.document.querySelector('[data-testid="stSidebarResizeHandle"]');
   if(handle){handle.dispatchEvent(new host.MouseEvent('dblclick',{bubbles:true}));host.sessionStorage.setItem(key,'1');}
  }catch{/* A separately hosted viewer never needs access to its embedding page. */}
 }
 function receive(next){const serialized=JSON.stringify(next);if(serialized===lastPayload)return;lastPayload=serialized;data=next;compactSidebar();for(const f of data.flavors){const latest=f.prompt_history?.[0]?.id??null;if(state.promptLatest[f.id]!==latest){state.promptLatest[f.id]=latest;state.initialExpanded[f.id]=latest===null;for(const batch of f.prompt_history||[])state.promptExpanded[batch.id]=batch.id===latest;}if(state.nameDrafts[f.id]?.trim()===f.name)delete state.nameDrafts[f.id];}if(state.pendingGeneration||state.pendingMerge||state.pendingAdd){if(data.action_result?.eventId===(state.pendingGeneration||state.pendingMerge||state.pendingAdd)){state.message=data.action_result.error||'';state.pendingGeneration=null;state.pendingMerge=null;state.pendingAdd=null;sending=false;if(data.action_result.createdFlavor){state.mode='pair';state.pairId=data.action_result.createdFlavor;state.pairStatus='all';state.pairScope='all';state.pairQuery='';state.pick=null;state.newName='';state.newPrompt='';state.newRefs=[];}if(data.action_result.mergedTarget){state.pairId=data.action_result.mergedTarget;state.pairStatus='all';state.pick=null;}}else sending=true;}else{if(sending)state.message='';sending=false;}if(data.focus_flavor&&state.lastFocus!==data.focus_flavor.nonce){const target=data.flavors.find(f=>f.id===data.focus_flavor.id);if(target){state.lastFocus=data.focus_flavor.nonce;state.mode='view';state.query='';state.scope='all';state.radius=19;if(reviewStatus(target)==='sca_pending')state.showSca=true;state.showPending=true;state.selected=target.id;const color=actual(target)||(target.status==='pending'?target.candidate_hex:null);state.region=color?point(color):null;state.viewBrightness=color?toHSV(color).v:1;}}
 if(data.readonly){state.mode='view';if(!data.previewCandidates)state.showPending=false;}if(state.mode==='pair'&&currentPair()&&state.pick==null)state.pick=toHSV(actual(currentPair())||currentPair().candidate_hex||'#D8A165');render();}
 new ResizeObserver(()=>height()).observe(app);
 if(publicEmbed){window.addEventListener('message',event=>{if(event.source!==window.parent||event.origin!==location.origin)return;const message=event.data;if(message?.type==='public-flavors:render'){document.documentElement.dataset.theme=message.theme==='light'?'light':'dark';receive({...message.data,readonly:true});requestAnimationFrame(fitViewer);}if(message?.type==='public-flavors:theme')document.documentElement.dataset.theme=message.theme==='light'?'light':'dark';});publicMessage({type:'public-flavors:ready'});}
 else if(embedded){window.addEventListener('message',event=>{if(event.source===window.parent&&event.data.type==='streamlit:render')receive(event.data.args.data);});window.parent.postMessage({isStreamlitMessage:true,type:'streamlit:componentReady',apiVersion:1},'*');}
 else{document.body.classList.add('standalone');const script=document.createElement('script');script.src='flavor-data.js';script.onload=()=>receive(window.FLAVOR_DATA);script.onerror=()=>{app.innerHTML='<p class="empty">请先在样例编辑器导出只读预览。</p>';};document.head.append(script);}
 // Pure geometry available for deterministic browser validation, with no persistence access.
 window.PaletteGeometry={toHSV,toHex,point,fromPoint};
})();
