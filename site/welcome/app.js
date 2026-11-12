(()=>{
 const local=typeof window.__podLocalTheme==='string';
 if(window.__podWelcomeInitialized){if(local){try{localStorage.setItem('pour-over-theme',window.__podLocalTheme)}catch{}document.querySelector('#welcome')?.setAttribute('data-theme',window.__podLocalTheme);}return;}
 window.__podWelcomeInitialized=true;
 let theme=local?window.__podLocalTheme:document.documentElement.dataset.theme||'dark';
 try{theme=localStorage.getItem('pour-over-theme')||theme}catch{}
 const overlay=document.createElement('section');overlay.id='welcome';overlay.className='one';overlay.dataset.theme=theme;
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','欢迎来到 Pour Over Database');overlay.tabIndex=-1;
 const copy=document.createElement('div');copy.className='welcome-copy';
 const title=document.createElement('h2');title.className='welcome-title';title.setAttribute('role','img');title.setAttribute('aria-label','Pour Over Database');
 const signature=document.createElement('span');signature.className='welcome-signature';signature.setAttribute('role','img');signature.setAttribute('aria-label','弦！的手写签名');copy.append(title,signature);
 const skip=document.createElement('span');skip.className='skip-intro';skip.textContent='点击任意位置进入';overlay.append(copy,skip);
 document.body.append(overlay);document.documentElement.classList.remove('pod-welcome-boot');clearTimeout(window.__podBootFallback);const previous=document.activeElement;overlay.focus({preventScroll:true});let timer,closed=false;
 function close(){if(closed)return;closed=true;clearTimeout(timer);overlay.classList.add('leaving');setTimeout(()=>{overlay.remove();previous?.focus({preventScroll:true})},matchMedia('(prefers-reduced-motion: reduce)').matches?0:400)}
 overlay.addEventListener('click',close);overlay.addEventListener('keydown',e=>{if(['Escape','Enter',' '].includes(e.key)){e.preventDefault();close()}if(e.key==='Tab')e.preventDefault()});
 async function readyImage(element){
  const style=getComputedStyle(element),mask=style.maskImage||style.webkitMaskImage;
  const url=mask?.match(/^url\(["']?(.*?)["']?\)$/)?.[1];if(!url)return;
  const image=new Image();image.fetchPriority='high';image.src=url;await image.decode();
 }
 // Wait for the actual title/signature pixels, never for unrelated page fonts.
 Promise.allSettled([readyImage(title),readyImage(signature)]).then(()=>{
  if(closed)return;overlay.classList.add('assets-ready');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!closed)timer=setTimeout(close,1800)}));
 });
 if(local){
  // Restore the remembered palette through the existing toggle, once per load.
  let done=false;const restore=()=>{const toggle=document.querySelector('.st-key-theme_switch input');if(!toggle||done)return;done=true;if(toggle.checked!==(theme==='light'))toggle.click();observer.disconnect()};
  const observer=new MutationObserver(restore);observer.observe(document.body,{childList:true,subtree:true});restore();setTimeout(()=>observer.disconnect(),10000);
 }else new MutationObserver(()=>{overlay.dataset.theme=document.documentElement.dataset.theme||'dark'}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
})();
