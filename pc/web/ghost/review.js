// Ghost Hunter evidence review: like the shows, go back over the session afterwards. Readings are sampled
// every second; the Review tab charts EMF and temperature with every logged event marked, and you can
// scrub through it to see what happened when.
'use strict';
const REVIEW=(()=>{
  const TR=(()=>{try{return JSON.parse(store.get('gh.trace','[]'))||[]}catch(e){return[]}})();  // [time, level*100, temp*10, mode]
  let acc=0,saveT=0,span=15,cur=null;
  function step(dt){
    if(!started)return;acc+=dt;if(acc<1)return;acc=0;
    TR.push([Date.now(),Math.round(L*100),TEMP.amb==null?null:Math.round(TEMP.amb*10),MODE[0]]);while(TR.length>7200)TR.shift();
    if(Date.now()-saveT>20000){saveT=Date.now();store.set('gh.trace',JSON.stringify(TR))}
  }
  addEventListener('pagehide',()=>store.set('gh.trace',JSON.stringify(TR)));
  const evCol=txt=>/CONTAINED|IDENTIFIED/.test(txt)?'#38ff9c':/attack|Contact|Slimed|SCREAM|screamed/i.test(txt)?'#ff3b30':/Evidence|EVP|Spirit box|Word box/.test(txt)?'#ffd36b':/Knock|bang|thrown|flicker/i.test(txt)?'#ff9a2b':'#9fd0ff';
  function render(el){
    const end=TR.length?TR[TR.length-1][0]:Date.now(),first=(TR.find(p=>p[0]>=end-span*60000)||[end-60000])[0],t0=Math.min(end-30000,first),pts=TR.filter(p=>p[0]>=t0),evs=LOG.filter(e=>e.t>=t0&&e.t<=end+1000);
    el.innerHTML=`<div class="row" style="margin:0 0 6px">${[5,15,60,120].map(m=>`<button data-span="${m}" class="${m===span?'on':''}">${m<60?m+' min':m/60+' h'}</button>`).join('')}<span class="sp"></span><span class="small">${pts.length?`${pts.length} s of readings`:'No readings yet'}</span></div>
      <canvas id="rvC" style="width:100%;height:220px;border:1px solid var(--line);border-radius:10px;background:#030805;touch-action:none"></canvas>
      <div class="small legend"><span style="color:#38ff9c">━</span> EMF level <span style="color:#7fd8ff">━</span> temperature <span style="color:#ffd36b">│</span> events (tap or drag the chart to scrub)</div>
      <div id="rvAt" class="small" style="min-height:3em;margin-top:6px"></div><h3>Events</h3><div id="rvEv">${evs.slice(0,80).map(e=>`<div class="small" data-t="${e.t}" style="cursor:pointer"><span style="color:${evCol(e.txt)}">●</span> ${new Date(e.t).toLocaleTimeString()} · ${esc(e.txt)}</div>`).join('')||'<p class="small">Nothing logged in this window.</p>'}</div>`;
    for(const b of el.querySelectorAll('[data-span]'))b.onclick=()=>{span=+b.dataset.span;cur=null;render(el)};
    const c=el.querySelector('#rvC'),r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;c.width=r.width*dpr;c.height=220*dpr;const x=c.getContext('2d');x.scale(dpr,dpr);const w=r.width,h=220,pad=26;
    const X=t=>pad+(t-t0)/(end-t0||1)*(w-pad-8),temps=pts.filter(p=>p[2]!=null).map(p=>p[2]/10),tmin=Math.min(...temps,18)-1,tmax=Math.max(...temps,23)+1,TY=v=>h-18-(v-tmin)/(tmax-tmin)*(h-40);
    function draw(){x.clearRect(0,0,w,h);x.font='10px ui-monospace,monospace';x.fillStyle='#7d9486';
      for(let i=0;i<=4;i++){const y=12+i*(h-30)/4;x.strokeStyle='rgba(56,255,156,.08)';x.beginPath();x.moveTo(pad,y);x.lineTo(w-8,y);x.stroke()}
      x.fillText(new Date(t0).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),pad,h-4);x.textAlign='right';x.fillText(new Date(end).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),w-8,h-4);x.textAlign='left';
      for(const e of evs){const ex=X(e.t);x.strokeStyle=evCol(e.txt);x.globalAlpha=.55;x.beginPath();x.moveTo(ex,8);x.lineTo(ex,h-18);x.stroke();x.globalAlpha=1}
      // EMF, coloured like the K-II
      for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];if(b[0]-a[0]>5000)continue;const v=b[1]/100;x.strokeStyle=v<.3?'#38ff9c':v<.55?'#a6ff2b':v<.75?'#ffe32b':v<.9?'#ff9a2b':'#ff3b30';x.lineWidth=2;
        x.beginPath();x.moveTo(X(a[0]),h-18-a[1]/100*(h-40));x.lineTo(X(b[0]),h-18-b[1]/100*(h-40));x.stroke()}
      x.strokeStyle='#7fd8ff';x.lineWidth=1.5;x.beginPath();let st=false;for(const p of pts){if(p[2]==null){st=false;continue}const px=X(p[0]),py=TY(p[2]/10);st?x.lineTo(px,py):x.moveTo(px,py);st=true}x.stroke();
      x.fillStyle='#7fd8ff';x.fillText(fmtT(tmax),2,14);x.fillText(fmtT(tmin),2,h-22);
      if(cur!=null){x.strokeStyle='#fff';x.lineWidth=1;x.beginPath();x.moveTo(X(cur),4);x.lineTo(X(cur),h-16);x.stroke()}}
    function at(t){cur=clamp(t,t0,end);const p=pts.reduce((a,b)=>Math.abs(b[0]-cur)<Math.abs(a[0]-cur)?b:a,pts[0]||[cur,0,null]),near=evs.filter(e=>Math.abs(e.t-cur)<Math.max(3000,(end-t0)/80)).slice(0,4);
      el.querySelector('#rvAt').innerHTML=`<b>${new Date(cur).toLocaleTimeString()}</b> · EMF ${mG(p[1]/100).toFixed(1)} mG (${ledCount(p[1]/100)} LEDs) · ${p[2]==null?'temp --':fmtT(p[2]/10)} · ${{g:'Ghost',h:'Hunt',r:'Real',b:'Bust'}[p[3]]||''} mode${near.length?'<br>'+near.map(e=>`<span style="color:${evCol(e.txt)}">●</span> ${esc(e.txt)}`).join('<br>'):''}`;draw()}
    const fromX=e=>{const rr=c.getBoundingClientRect();return t0+(e.clientX-rr.left-pad)/(w-pad-8)*(end-t0)};
    let down=false;c.onpointerdown=e=>{down=true;c.setPointerCapture(e.pointerId);at(fromX(e))};c.onpointermove=e=>{if(down)at(fromX(e))};c.onpointerup=()=>down=false;
    for(const d of el.querySelectorAll('#rvEv [data-t]'))d.onclick=()=>at(+d.dataset.t);
    draw();if(pts.length)at(cur||end);
  }
  return{step,render,_TR:TR};
})();
