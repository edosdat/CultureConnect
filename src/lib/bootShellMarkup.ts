import {
  BOOT_CATALOGUE_URL,
  BOOT_SHELL_CREAM,
  BOOT_SHELL_FADE_MS,
  BOOT_SHELL_HINT,
  BOOT_SHELL_ID,
  BOOT_SHELL_MAX_MS,
} from './bootShell';

/**
 * Critical CSS for the first HTML paint. No external fetch.
 * Theater (C, morph, hint) is standalone-only. Desktop browsers keep the
 * cream ground and do not show the morph.
 */
export const BOOT_SHELL_CSS = `
html,body{background-color:${BOOT_SHELL_CREAM}}
#${BOOT_SHELL_ID}{display:none;position:fixed;inset:0;z-index:300;box-sizing:border-box;margin:0;padding:24px;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:${BOOT_SHELL_CREAM};color:#1A0B1E;font:500 15px/1.35 ui-sans-serif,system-ui,sans-serif;opacity:1;transition:opacity ${BOOT_SHELL_FADE_MS}ms linear}
@media (display-mode:standalone){#${BOOT_SHELL_ID}{display:flex}}
html[data-cc-boot=on] #${BOOT_SHELL_ID}{display:flex}
html[data-app-ready] #${BOOT_SHELL_ID}{opacity:0;pointer-events:none}
.cc-boot-mark{position:relative;width:88px;height:88px}
.cc-boot-c,.cc-boot-agenda{position:absolute;inset:0;width:88px;height:88px}
.cc-boot-c{animation:cc-c 1.8s ease-in-out infinite}
.cc-boot-agenda{opacity:0;animation:cc-a 1.8s ease-in-out infinite}
#cc-boot-hint{margin:0;text-align:center}
.cc-boot-rails{display:flex;flex-direction:column;gap:7px;width:104px}
.cc-boot-rails i{display:block;height:6px;border-radius:99px;background:#C4A882;animation:cc-r 1.4s ease-in-out infinite}
.cc-boot-rails i:nth-child(2){width:82%;animation-delay:.15s}
.cc-boot-rails i:nth-child(3){width:64%;animation-delay:.3s}
@keyframes cc-c{0%,100%{opacity:1;transform:scale(1)}45%{opacity:.5;transform:scale(.94)}}
@keyframes cc-a{0%,28%{opacity:0;transform:scale(.9)}58%,82%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.96)}}
@keyframes cc-r{0%,100%{opacity:.35;transform:scaleX(.8)}50%{opacity:1;transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.cc-boot-c,.cc-boot-agenda,.cc-boot-rails i{animation:none}.cc-boot-agenda,.cc-boot-rails{display:none}}
`.trim();

/** Centered violet C, agenda morph, hint. No Top 3 titles, no remote assets. */
export const BOOT_SHELL_MARKUP = `<div id="${BOOT_SHELL_ID}" role="status" aria-busy="true" aria-labelledby="cc-boot-hint"><div class="cc-boot-mark" aria-hidden="true"><svg class="cc-boot-c" viewBox="0 0 64 64"><g transform="skewX(-12) translate(8 0)"><path d="M48 16a18 18 0 1 0 0 32" fill="none" stroke="#AF7DDE" stroke-width="7" stroke-linecap="round"/></g></svg><svg class="cc-boot-agenda" viewBox="0 0 64 64"><rect x="16" y="14" width="32" height="40" rx="5" fill="${BOOT_SHELL_CREAM}" stroke="#AF7DDE" stroke-width="2.4"/><path d="M16 24h32M24 10v8M40 10v8" fill="none" stroke="#AF7DDE" stroke-width="2.4" stroke-linecap="round"/><path d="M24 34h18M24 42h14M24 48h10" fill="none" stroke="#C4A882" stroke-width="2.4" stroke-linecap="round"/></svg></div><p id="cc-boot-hint">${BOOT_SHELL_HINT}</p><div class="cc-boot-rails" aria-hidden="true"><i></i><i></i><i></i></div></div>`;

/**
 * Arms the cap and the standalone gate before the app bundle.
 * Does not remove the node (hydration owns the markup). A kill stylesheet
 * keeps a recreated shell hidden. Removal happens once the client has hydrated.
 */
export const BOOT_SHELL_SCRIPT = `(function(){var MAX=${BOOT_SHELL_MAX_MS},FADE=${BOOT_SHELL_FADE_MS},ID="${BOOT_SHELL_ID}",URL="${BOOT_CATALOGUE_URL}";var root=document.documentElement;var state=0;var started=Date.now();var appReady=false;var catalogueSettled=false;function home(){var p=location.pathname||"/";return p==="/"||p==="";}function standalone(){try{return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;}catch(e){return false;}}function node(){return document.getElementById(ID);}function killStyle(){if(document.getElementById("cc-boot-kill"))return;var s=document.createElement("style");s.id="cc-boot-kill";s.textContent="#"+ID+"{display:none!important}";document.head.appendChild(s);}function mark(){root.setAttribute("data-app-ready","1");if(document.body)document.body.setAttribute("data-app-ready","1");}function finish(){state=2;killStyle();var n=node();if(!n)return;n.setAttribute("aria-busy","false");n.setAttribute("hidden","");try{n.inert=true;}catch(e){}if(window.__ccBootHydrated)n.remove();}function hide(){if(state===2){finish();return;}if(state===1)return;state=1;window.__ccBootDismissed=1;mark();var n=node();if(!n){finish();return;}n.setAttribute("aria-busy","false");n.addEventListener("transitionend",finish);setTimeout(finish,FADE+70);}function maybeHide(){if(state!==0||!standalone()||!appReady)return;if(!catalogueSettled&&(Date.now()-started)<MAX)return;hide();}try{if(home()&&!window.__ccHomeWindowPrefetch){window.__ccHomeWindowPrefetch=fetch(URL).then(function(res){return res.ok?res.json():null;}).then(function(data){window.__ccHomeWindowData=data;catalogueSettled=true;maybeHide();return data;},function(){window.__ccHomeWindowData=null;catalogueSettled=true;maybeHide();return null;});}else{catalogueSettled=true;}}catch(e){catalogueSettled=true;}window.__ccHideBootShell=function(){window.__ccBootHydrated=1;appReady=true;if(!standalone()){hide();return;}maybeHide();};if(!standalone()){window.__ccBootDismissed=1;mark();finish();return;}root.setAttribute("data-cc-boot","on");setTimeout(hide,MAX);window.addEventListener("pageshow",function(e){if(e.persisted)hide();});})();`;
