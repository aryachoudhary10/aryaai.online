// Self-contained bookmarklet source. Kept as a template string rather than a
// served file because many sites' CSP blocks injecting an external script,
// while a javascript: URL executing inline generally still runs.
//
// __ORIGIN__ is substituted at render time with the deployment's own origin.
// Written in ES5-ish style and deliberately terse -- it ships as a URL.

const SOURCE = `(function(){
if(window.__rp)return;window.__rp=1;
var O='__ORIGIN__',T='__TONE__',D=document,W=window;
function done(){window.__rp=0}
var el=D.activeElement,tgt=null,txt='',ed=false;
var isF=el&&(el.tagName=='TEXTAREA'||(el.tagName=='INPUT'&&/^(text|search|url|email|tel|)$/i.test(el.type)));
if(isF){var s=el.selectionStart,e=el.selectionEnd,w=s==e;
  tgt={el:el,s:w?0:s,e:w?el.value.length:e};txt=w?el.value:el.value.slice(s,e);ed=true}
else{var sl=W.getSelection();txt=sl?String(sl):'';
  if(el&&el.isContentEditable&&sl&&sl.rangeCount){tgt={el:el,r:sl.getRangeAt(0).cloneRange()};ed=true}}
txt=(txt||'').trim();
if(!txt){alert('Select some text first, or tap into a text box.');return done()}
if(txt.length>2000){alert('Too long: '+txt.length+' of 2000 characters.');return done()}
function put(v){
  if(!tgt){return false}
  if(tgt.r){tgt.el.focus();var s2=W.getSelection();s2.removeAllRanges();s2.addRange(tgt.r);
    if(!D.execCommand('insertText',false,v)){tgt.r.deleteContents();tgt.r.insertNode(D.createTextNode(v))}return true}
  var el2=tgt.el;el2.focus();
  var P=el2.tagName=='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;
  var st=Object.getOwnPropertyDescriptor(P.prototype,'value').set;
  var nv=el2.value.slice(0,tgt.s)+v+el2.value.slice(tgt.e);
  st?st.call(el2,nv):el2.value=nv;
  el2.setSelectionRange(tgt.s,tgt.s+v.length);
  el2.dispatchEvent(new Event('input',{bubbles:true}));
  el2.dispatchEvent(new Event('change',{bubbles:true}));return true}
var box=D.createElement('div');
box.style.cssText='all:initial;position:fixed;z-index:2147483647;left:50%;bottom:16px;transform:translateX(-50%);width:min(560px,calc(100vw - 20px));background:#fff;color:#11171b;border:1px solid #d9e2e7;border-radius:12px;box-shadow:0 12px 40px -12px rgba(0,0,0,.4);font:14px/1.5 system-ui,-apple-system,sans-serif;overflow:hidden';
function shut(){box.remove();done()}
function msg(t){box.innerHTML='';var p=D.createElement('div');p.style.cssText='padding:14px';p.textContent=t;box.appendChild(p)}
msg('Rewriting\\u2026');D.body.appendChild(box);
fetch(O+'/api/rephrase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:txt,tone:T})})
.then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
.then(function(x){
  if(!x.ok){msg(x.j.error||'Failed.');setTimeout(shut,2600);return}
  var vs=x.j.variants||[];if(!vs.length){msg('Nothing came back.');setTimeout(shut,2600);return}
  box.innerHTML='';
  var h=D.createElement('div');
  h.style.cssText='display:flex;padding:9px 14px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#8494a0;border-bottom:1px solid #d9e2e7';
  h.textContent='Rephrase';
  var x2=D.createElement('button');x2.textContent='\\u00d7';
  x2.style.cssText='margin-left:auto;border:0;background:none;font-size:17px;line-height:1;cursor:pointer;color:inherit';
  x2.onclick=shut;h.appendChild(x2);box.appendChild(h);
  vs.forEach(function(v,i){var b=D.createElement('button');
    b.style.cssText='display:block;width:100%;text-align:left;border:0;'+(i?'border-top:1px solid #eceff1;':'')+'background:none;color:inherit;padding:12px 14px;font:inherit;cursor:pointer';
    b.textContent=v;
    b.onmouseover=function(){b.style.background='#f4f7f8'};
    b.onmouseout=function(){b.style.background='none'};
    b.onclick=function(){
      if(ed&&put(v)){shut()}
      else{(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){msg('Copied');setTimeout(shut,1200)},function(){msg('Copy it manually');})}};
    box.appendChild(b)});
  var f=D.createElement('div');f.style.cssText='padding:8px 14px 11px;font-size:11.5px;color:#8494a0';
  f.textContent=ed?'Tap one to replace the text.':'Tap one to copy it.';box.appendChild(f)})
.catch(function(){msg('Can\\u2019t reach '+O);setTimeout(shut,2600)});
})()`;

export function bookmarklet(origin, tone = "natural") {
  const code = SOURCE.replace(/__ORIGIN__/g, origin).replace(/__TONE__/g, tone)
    // Collapse the newlines used for readability above; the URL must be one line.
    .split("\n").map((l) => l.trim()).join("");
  return "javascript:" + encodeURIComponent(code);
}
