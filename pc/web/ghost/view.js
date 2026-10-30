// Ghost Hunter view: camera + lenses, world-anchored rendering, the devices, HUD, UI and main loop.
'use strict';
const cv=$('#view'),cx=cv.getContext('2d');let W=0,H=0,DPR=1;
const DEVICES=[
  {id:'nv',name:'Night vision',kind:'cam'},{id:'thermal',name:'Thermal',kind:'cam'},{id:'sls',name:'SLS camera',kind:'cam'},{id:'laser',name:'Laser grid',kind:'cam'},
  {id:'k2',name:'K-II meter',kind:'hand'},{id:'mel',name:'EMF/temp meter',kind:'hand'},{id:'rem',name:'REM pod',kind:'hand'},{id:'box',name:'Spirit box',kind:'hand'},
  {id:'ovilus',name:'Word box',kind:'hand'},{id:'evp',name:'EVP recorder',kind:'hand'},{id:'radar',name:'Radar',kind:'scope'}];
let DEV=store.get('gh.dev','nv');if(!DEVICES.find(d=>d.id===DEV))DEV='nv';
const devKind=()=>DEVICES.find(d=>d.id===DEV).kind;

// ================================================================ camera
const cam={ok:false,stream:null,torch:false,torchOn:false};
async function startCam(){
  if(cam.stream||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return;
  try{cam.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    const v=$('#cam');v.srcObject=cam.stream;await v.play().catch(()=>{});cam.ok=true;
    const tr=cam.stream.getVideoTracks()[0];cam.torch=!!(tr.getCapabilities&&tr.getCapabilities().torch)}
  catch(e){cam.ok=false;say('Camera not available.','warn')}
  buildCtl();
}
async function setTorch(on){try{await cam.stream.getVideoTracks()[0].applyConstraints({advanced:[{torch:on}]});cam.torchOn=on}catch(e){}buildCtl()}
// Focal length in screen pixels, so world points land where the real camera image shows them.
function FPX(){
  const v=$('#cam');let f;
  if(cam.ok&&v.videoWidth){const s=Math.max(W/v.videoWidth,H/v.videoHeight),long=Math.max(v.videoWidth,v.videoHeight);f=long/2/Math.tan(33*D2R)*s}  // ~66° across the sensor's long side
  else f=(W/2)/Math.tan(25*D2R);
  return f*CFG.zoom;
}
let fpx=500;
function proj(p){const z=dot(p,O.F);if(z<.08)return null;const x=dot(p,O.R),y=dot(p,O.U);return{x:W/2+x/z*fpx,y:H/2-y/z*fpx,z,s:fpx/z}}
inViewFn=p=>{const q=proj(p);return!!q&&q.x>-20&&q.x<W+20&&q.y>-40&&q.y<H+40};
function resize(){DPR=devicePixelRatio||1;const r=cv.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*DPR;cv.height=H*DPR;cx.setTransform(DPR,0,0,DPR,0,0)}
addEventListener('resize',resize);

// ================================================================ lenses
const camC=document.createElement('canvas'),camX=camC.getContext('2d',{willReadFrequently:true});
const IRON=(()=>{const st=[[0,[4,2,18]],[.18,[38,12,110]],[.38,[132,22,140]],[.56,[218,58,52]],[.74,[255,150,10]],[.9,[255,224,90]],[1,[255,255,230]]],lut=new Uint8Array(256*3);
  for(let i=0;i<256;i++){const v=i/255;let k=0;while(k<st.length-2&&v>st[k+1][0])k++;const[a,ca]=st[k],[b,cb]=st[k+1],f=(v-a)/(b-a);for(let c=0;c<3;c++)lut[i*3+c]=ca[c]+(cb[c]-ca[c])*f}return lut})();
const GRAIN=[0,1,2].map(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),d=x.createImageData(128,128);
  for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}x.putImageData(d,0,0);return c});
const DOTS=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#fff';for(let i=0;i<900;i++){x.globalAlpha=rand(.15,.6);x.fillRect(Math.random()*256,Math.random()*256,1.3,1.3)}return c})();
let freezeUntil=0,thermRange=[18,24];
function lensOf(){return{nv:'nv',thermal:'thermal',sls:'sls',laser:'nv'}[DEV]||'color'}
function updateCamFrame(lens){
  if(performance.now()<freezeUntil)return;
  const v=$('#cam'),has=cam.ok&&v.readyState>=2&&v.videoWidth,therm=lens==='thermal',sc=therm?110/Math.min(W,H):.5;
  const w=Math.max(4,Math.round(W*sc)),h=Math.max(4,Math.round(H*sc));if(camC.width!==w||camC.height!==h){camC.width=w;camC.height=h}
  if(has){const s=Math.max(w/v.videoWidth,h/v.videoHeight),sw=w/s,sh=h/s;
    camX.filter={nv:'grayscale(1) brightness(1.8) contrast(1.4)',thermal:'grayscale(1) blur(1.5px)',sls:'grayscale(1) brightness(.75) contrast(1.6)',color:'saturate(.75) contrast(1.08)'}[lens];
    camX.drawImage(v,(v.videoWidth-sw)/2,(v.videoHeight-sh)/2,sw,sh,0,0,w,h);camX.filter='none'}
  else{const g=camX.createLinearGradient(0,0,0,h);g.addColorStop(0,'#141414');g.addColorStop(1,'#050505');camX.fillStyle=g;camX.fillRect(0,0,w,h)}
  if(therm)thermalize(w,h,sc);
  else if(lens==='nv'){camX.globalCompositeOperation='multiply';camX.fillStyle='#5bff8f';camX.fillRect(0,0,w,h);camX.globalCompositeOperation='source-over'}
  else if(lens==='sls'){camX.globalCompositeOperation='multiply';camX.fillStyle='#8fb7ff';camX.fillRect(0,0,w,h);camX.globalCompositeOperation='source-over'}
}
function blobLum(lum,w,h,cxp,cyp,rx,ry,k){for(let y=Math.max(0,Math.floor(cyp-ry*2));y<Math.min(h,cyp+ry*2);y++)for(let x=Math.max(0,Math.floor(cxp-rx*2));x<Math.min(w,cxp+rx*2);x++){const dx=(x-cxp)/rx,dy=(y-cyp)/ry;lum[y*w+x]+=k*Math.exp(-(dx*dx+dy*dy)*1.4)}}
function thermalize(w,h,sc){
  const img=camX.getImageData(0,0,w,h),p=img.data,n=w*h,lum=new Float32Array(n);let mn=1,mx=0;
  for(let i=0;i<n;i++){const v=(p[i*4]*.3+p[i*4+1]*.59+p[i*4+2]*.11)/255;lum[i]=v;if(v<mn)mn=v;if(v>mx)mx=v}
  const span=Math.max(.15,mx-mn);for(let i=0;i<n;i++)lum[i]=.12+.78*(lum[i]-mn)/span;
  if(staged()){
    for(const c of WORLD.cold){const q=proj(c.p);if(q)blobLum(lum,w,h,q.x*sc,q.y*sc,Math.max(1.5,c.r*q.s*sc*.8),Math.max(1.5,c.r*q.s*sc*.8),-.55*c.s)}
    if(active()&&G.vis>.02){const f=figRect();if(f)blobLum(lum,w,h,f.x*sc,(f.top+f.h*.45)*sc,Math.max(2,f.h*.2*sc),Math.max(3,f.h*.55*sc),-.75*G.vis)}
    for(const s of WORLD.shadows){const sp=shadowPos(s),f=figRect([sp[0],sp[1]]);if(f)blobLum(lum,w,h,f.x*sc,(f.top+f.h*.45)*sc,Math.max(2,f.h*.2*sc),Math.max(3,f.h*.55*sc),-.4)}
  }else{const t=radarTarget();if(t){const q=proj(O.F.map(v=>v*t.d)),f=q&&figRect([O.F[0]*t.d,O.F[1]*t.d]);if(f)blobLum(lum,w,h,f.x*sc,(f.top+f.h*.45)*sc,Math.max(2,f.h*.18*sc),Math.max(3,f.h*.5*sc),clamp(t.e/160,.18,.45))}}
  for(let i=0;i<n;i++){const j=clamp(Math.round(lum[i]*255),0,255)*3;p[i*4]=IRON[j];p[i*4+1]=IRON[j+1];p[i*4+2]=IRON[j+2]}
  camX.putImageData(img,0,0);
  // the scale bar shows plausible temperatures around the room reading
  const base=staged()?TEMP.base:(realTemp()??21);thermRange=[base-4.5,base+3.5];
}

// ================================================================ world-anchored drawing
// A person-sized figure standing on the floor at ground point g=[x,y]: head/foot projected, so it tilts with the phone.
function figRect(g){
  g=g||G.p;const foot=proj([g[0],g[1],-CAM_H]),head=proj([g[0],g[1],1.72-CAM_H]);if(!foot||!head)return null;
  const h=Math.hypot(foot.x-head.x,foot.y-head.y);return{x:foot.x,y:foot.y,top:head.y,h,ang:Math.atan2(foot.x-head.x,foot.y-head.y),hx:head.x,hy:head.y};
}
function figurePath(h,t){
  const w=h*.27,sway=Math.sin(t*.9)*h*.012,x=0,top=-h;cx.beginPath();
  cx.ellipse(x+sway,top+h*.07,h*.062,h*.075,0,0,7);
  cx.moveTo(x-w*.18+sway,top+h*.14);cx.quadraticCurveTo(x-w*.55,top+h*.16,x-w*.55,top+h*.24);
  cx.lineTo(x-w*.5,top+h*.52);cx.lineTo(x-w*.32,top+h*.55);cx.lineTo(x-w*.3,0);cx.lineTo(x-w*.06,0);cx.lineTo(x,top+h*.58);
  cx.lineTo(x+w*.06,0);cx.lineTo(x+w*.3,0);cx.lineTo(x+w*.32,top+h*.55);cx.lineTo(x+w*.5,top+h*.52);cx.lineTo(x+w*.55,top+h*.24);
  cx.quadraticCurveTo(x+w*.55,top+h*.16,x+w*.18+sway,top+h*.14);cx.closePath();
}
function drawFigure(f,t,alpha,lens,eyes){
  if(!f||alpha<=.02||f.x<-f.h||f.x>W+f.h)return;
  const flick=Math.random()<.07?.15:.75+.25*Math.sin(t*9)*Math.sin(t*2.3);
  cx.save();cx.translate(f.x,f.y);cx.rotate(-f.ang);cx.filter=`blur(${Math.max(1.5,f.h*.018)}px)`;
  if(lens==='thermal'){cx.globalAlpha=alpha*.22*flick;cx.fillStyle='#1a0640'}
  else if(lens==='sls'){cx.globalAlpha=alpha*.25*flick;cx.fillStyle='#000'}
  else{cx.globalAlpha=alpha*.8*flick;cx.fillStyle=lens==='nv'?'#000a02':'#050507'}
  figurePath(f.h,t);cx.fill();
  if(eyes&&lens!=='thermal'){cx.filter='none';cx.globalAlpha=alpha*flick;cx.fillStyle='rgba(240,250,245,.9)';for(const s of[-1,1]){cx.beginPath();cx.arc(s*f.h*.022,-f.h*.935,Math.max(1,f.h*.008),0,7);cx.fill()}}
  cx.restore();
}
function orbAt(p,r,a){const q=proj(p);if(!q||a<.03)return;const rr=clamp(r*q.s,2,40);cx.save();cx.globalCompositeOperation='lighter';
  const g=cx.createRadialGradient(q.x,q.y,0,q.x,q.y,rr*3);g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(.35,`rgba(220,255,235,${a*.5})`);g.addColorStop(1,'rgba(0,0,0,0)');
  cx.fillStyle=g;cx.beginPath();cx.arc(q.x,q.y,rr*3,0,7);cx.fill();cx.restore()}
// skeleton for the SLS camera, joints as [sideways, height above floor] in metres
const JOINTS={head:[0,1.62],neck:[0,1.46],shL:[-.2,1.41],shR:[.2,1.41],elL:[-.27,1.12],elR:[.27,1.12],haL:[-.3,.84],haR:[.3,.84],hip:[0,.98],hiL:[-.12,.95],hiR:[.12,.95],knL:[-.13,.52],knR:[.13,.52],ftL:[-.15,.05],ftR:[.15,.05]};
const BONES=[['head','neck'],['neck','shL'],['neck','shR'],['shL','elL'],['elL','haL'],['shR','elR'],['elR','haR'],['neck','hip'],['hip','hiL'],['hip','hiR'],['hiL','knL'],['knL','ftL'],['hiR','knR'],['knR','ftR']];
function drawSkeleton(g,t,alpha,col,glitch,label){
  const lat=[O.R[0],O.R[1]],ln=Math.hypot(lat[0],lat[1])||1,P={};
  for(const[k,[s,z]]of Object.entries(JOINTS)){const sw=k.startsWith('ha')||k.startsWith('el')?Math.sin(t*1.3+(k.endsWith('L')?0:2))*.04:0;
    const jit=glitch?[rand(-.05,.05),rand(-.05,.05)]:[0,0];P[k]=proj([g[0]+lat[0]/ln*(s+sw+jit[0]),g[1]+lat[1]/ln*(s+sw+jit[0]),z-CAM_H+jit[1]])}
  if(!P.head||!P.ftL)return;cx.save();cx.globalAlpha=alpha;cx.strokeStyle=col;cx.fillStyle=col;cx.shadowColor=col;cx.shadowBlur=10;cx.lineWidth=3;
  for(const[a,b]of BONES){if(glitch&&Math.random()<.12)continue;const A=P[a],B=P[b];if(!A||!B)continue;cx.beginPath();cx.moveTo(A.x,A.y);cx.lineTo(B.x,B.y);cx.stroke()}
  for(const k in P){const p=P[k];if(!p)continue;cx.beginPath();cx.arc(p.x,p.y,k==='head'?Math.max(4,.1*p.s):3.5,0,7);k==='head'?cx.stroke():cx.fill()}
  if(label){cx.shadowBlur=0;cx.font='12px ui-monospace,monospace';cx.textAlign='center';cx.fillText(label,P.head.x,P.head.y-Math.max(10,.14*P.head.s))}
  cx.restore();
}
// laser grid: a projector on a tripod where you stand, so the dots stay put on the "walls" as you turn
const GRID=(()=>{const a=[];for(let az=0;az<360;az+=3)for(let el=-30;el<=40;el+=3){const c=Math.cos(el*D2R);a.push([Math.sin(az*D2R)*c,Math.cos(az*D2R)*c,Math.sin(el*D2R)])}return a})();
function drawGrid(t,occluders){
  const cosLim=Math.cos(55*D2R);cx.save();cx.fillStyle='#e6ffe6';cx.shadowColor='#2bff3a';cx.shadowBlur=8;
  for(const d of GRID){if(dot(d,O.F)<cosLim)continue;const dist=4.2,q=proj([d[0]*dist,d[1]*dist,d[2]*dist]);if(!q||q.x<0||q.x>W||q.y<0||q.y>H)continue;
    let hidden=false,warp=0;for(const o of occluders){const dx=(q.x-o.x)/o.rx,dy=(q.y-o.y)/o.ry,r=dx*dx+dy*dy;if(r<1){hidden=Math.random()<o.k;warp=o.k*3}}
    if(hidden)continue;cx.beginPath();cx.arc(q.x+(warp?rand(-warp,warp):0),q.y,2,0,7);cx.fill()}
  cx.restore();
}
function edgeArrow(p,col,label){
  const q=proj(p);if(q&&q.x>0&&q.x<W&&q.y>0&&q.y<H)return;
  const left=dot(p,O.R)<0,x=left?24:W-24,y=H*.5;cx.save();cx.fillStyle=col;cx.globalAlpha=.6+.4*Math.sin(performance.now()/180);
  cx.beginPath();if(left){cx.moveTo(x-12,y);cx.lineTo(x+6,y-12);cx.lineTo(x+6,y+12)}else{cx.moveTo(x+12,y);cx.lineTo(x-6,y-12);cx.lineTo(x-6,y+12)}cx.fill();
  if(label){cx.globalAlpha=1;cx.font='12px ui-monospace,monospace';cx.textAlign=left?'left':'right';cx.fillText(label,left?x+10:x-10,y+28)}cx.restore()}
const FACE=(()=>{const c=document.createElement('canvas');c.width=320;c.height=400;const x=c.getContext('2d');
  const g=x.createRadialGradient(160,180,20,160,200,190);g.addColorStop(0,'rgba(232,238,232,1)');g.addColorStop(.55,'rgba(170,180,172,.95)');g.addColorStop(.8,'rgba(60,66,62,.6)');g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.beginPath();x.ellipse(160,200,125,175,0,0,7);x.fill();
  x.filter='blur(7px)';x.fillStyle='#050505';for(const s of[-1,1]){x.beginPath();x.ellipse(160+s*48,165,30,38,s*.15,0,7);x.fill()}
  x.beginPath();x.ellipse(160,292,34,62,0,0,7);x.fill();x.filter='blur(3px)';x.fillStyle='rgba(20,20,20,.7)';x.beginPath();x.ellipse(160,225,10,22,0,0,7);x.fill();
  x.filter='none';x.fillStyle='rgba(255,255,255,.9)';for(const s of[-1,1]){x.beginPath();x.arc(160+s*48,170,3,0,7);x.fill()}
  x.strokeStyle='rgba(10,10,10,.6)';x.lineWidth=5;x.filter='blur(2px)';for(let i=0;i<14;i++){x.beginPath();const sx=60+i*15;x.moveTo(sx,40);x.quadraticCurveTo(sx+rand(-20,20),140,sx+rand(-30,30),rand(180,300));x.stroke()}
  return c})();
function drawFace(scale,alpha,lens){
  const h=H*scale,w=h*.8,x=W/2-w/2,y=H*.5-h*.5;cx.save();cx.globalAlpha=alpha;
  cx.filter=lens==='nv'?'grayscale(1) brightness(1.4)':lens==='thermal'?'invert(1) hue-rotate(200deg) saturate(3)':'none';
  cx.drawImage(FACE,x,y,w,h);cx.globalAlpha=alpha*.35;cx.drawImage(FACE,x+h*.02,y,w,h);cx.drawImage(FACE,x-h*.02,y,w,h);cx.restore();
  if(lens==='nv'){cx.save();cx.globalCompositeOperation='multiply';cx.fillStyle='#5bff8f';cx.globalAlpha=alpha;cx.fillRect(x,y,w,h);cx.restore()}
}

// the scene through the camera, with everything in the world drawn where it is
function drawScene(t,level,lens){
  updateCamFrame(lens);cx.imageSmoothingEnabled=true;cx.drawImage(camC,0,0,W,H);
  if(lens==='nv'||lens==='sls'){cx.save();cx.globalAlpha=lens==='sls'?.5:.16;cx.globalCompositeOperation=lens==='sls'?'screen':'overlay';cx.translate(rand(-64,0),rand(-64,0));cx.fillStyle=cx.createPattern(lens==='sls'?DOTS:GRAIN[(t*24|0)%3],'repeat');cx.fillRect(0,0,W+64,H+64);cx.restore()}
  const occ=[];
  if(MODE==='real'){
    const now=Date.now();cx.save();cx.globalCompositeOperation='lighter';
    let lastT=0;for(const b of RD.blips){const age=(now-b.t)/1000;if(age>25||b.t-lastT<500)continue;lastT=b.t;const q=proj(b.p);if(!q)continue;const a=(1-age/25)*clamp(b.e/80,.15,1)*.16,r=clamp(.3*q.s,8,60);
      const g=cx.createRadialGradient(q.x,q.y,0,q.x,q.y,r);g.addColorStop(0,b.mv?`rgba(255,140,60,${a})`:`rgba(80,170,255,${a})`);g.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=g;cx.fillRect(q.x-r,q.y-r,r*2,r*2)}
    cx.restore();
    const tg=radarTarget();
    if(tg){const g=[O.F[0]*tg.d,O.F[1]*tg.d],f=figRect(g);
      if(lens==='sls')drawSkeleton(g,t,.9,'#7dff6a',false,`FIGURE ${tg.d.toFixed(1)} m`);
      else if(f&&lens!=='thermal'){cx.save();cx.strokeStyle=tg.mv?'#ff8c3c':'#50aaff';cx.lineWidth=2;cx.strokeRect(f.x-f.h*.17,f.top,f.h*.34,f.h);cx.fillStyle=cx.strokeStyle;cx.font='13px ui-monospace,monospace';cx.textAlign='center';cx.fillText(`${tg.d.toFixed(2)} m · ${tg.mv?'MOVING':'STILL'}`,f.x,f.top-8);cx.restore()}
      if(f)occ.push({x:f.x,y:f.top+f.h*.5,rx:f.h*.16,ry:f.h*.5,k:.9})}
    else if(!radarLive()){cx.save();cx.textAlign='center';cx.font='14px ui-monospace,monospace';cx.fillStyle='#ffb627';cx.shadowColor='#000';cx.shadowBlur=4;cx.fillText(canUSB?'Radar not connected: tap USB':'Radar not connected',W/2,H*.5+60);cx.restore()}
  }else{
    // free orbs and the ones that hang around the apparition
    for(const o of WORLD.orbs)orbAt(o.p,o.r,(.35+.4*Math.max(0,Math.sin(t*1.7+o.r*90)))*clamp(Math.min(o.age,o.life-o.age),0,1));
    if(MODE==='hunt'&&G.state==='idle'&&hunt.dist!=null){const p=atBearing(hunt.bear,Math.min(hunt.dist,40),0),q=proj(p);
      if(q&&q.x>0&&q.x<W){orbAt(p,.25,.3+.25*Math.sin(t*2.4));cx.fillStyle='#bfffd9';cx.font='12px ui-monospace,monospace';cx.textAlign='center';cx.fillText(Math.round(hunt.dist)+' m',q.x,q.y+22)}
      else edgeArrow(p,'#bfffd9',Math.round(hunt.dist)+' m')}
    for(const s of WORLD.shadows){const sp=shadowPos(s),f=figRect(sp);if(f&&f.x>0&&f.x<W){if(!s.seen){s.seen=true;logEv('Shadow figure crossed the room')}
      if(lens==='sls')drawSkeleton(sp,t,.7,'#7dff6a',true,'');else drawFigure(f,t,.75,lens,false);occ.push({x:f.x,y:f.top+f.h*.5,rx:f.h*.16,ry:f.h*.5,k:.8})}}
    if(active()){
      const d=gDist(),far=clamp((d-4.2)/1.5,0,1),f=figRect();
      for(let i=0;i<3;i++){const a=G.vis*(G.state==='charge'?.3:Math.max(.25,far));orbAt([G.p[0]+Math.sin(t*.35+i*2.1)*.5,G.p[1]+Math.cos(t*.3+i*1.7)*.5,-.2+i*.35+Math.sin(t*.6+i)*.2],.04,a*(.45+.55*Math.max(0,Math.sin(t*1.7+i*1.9))))}
      if(G.state==='charge'&&d<.9)drawFace(clamp(1.1/d,.6,4),clamp((1-d)/.6,0,1),lens);
      else if(lens==='sls')drawSkeleton([G.p[0],G.p[1]],t,G.vis*(1-far*.7),'#7dff6a',true,G.vis>.4?'FIGURE DETECTED':'');
      else drawFigure(f,t,G.vis*(1-far*.85),lens,G.state==='charge');
      if(f)occ.push({x:f.x,y:f.top+f.h*.5,rx:f.h*.16,ry:f.h*.5,k:clamp(G.vis*1.2,0,1)});
      if(G.state!=='charge'&&level>.25)edgeArrow([G.p[0],G.p[1],0],'#ffb627','');
    }
    if(G.state==='trapped'){const k=G.trapT/1.3,f=figRect();if(f){cx.save();cx.strokeStyle='rgba(255,210,120,.85)';cx.lineWidth=2.5;cx.globalCompositeOperation='lighter';
      for(let i=0;i<5;i++){cx.beginPath();cx.moveTo(W/2+rand(-30,30),H+10);cx.quadraticCurveTo(rand(0,W),rand(0,H),f.x+(W/2-f.x)*k,f.top+f.h*.4+(H-f.top-f.h*.4)*k);cx.stroke()}cx.restore();drawFigure(f,t,1-k,lens,false)}}
  }
  if(DEV==='laser')drawGrid(t,occ);
}

// ================================================================ interference + HUD (drawn into the canvas so recordings include it)
function interference(level,t){
  const k=clamp((level-.3)/.7,0,1);if(k<=0)return;
  cx.save();cx.globalAlpha=k*.22;cx.globalCompositeOperation='screen';cx.translate(rand(-64,0),rand(-64,0));cx.fillStyle=cx.createPattern(GRAIN[(t*30|0)%3],'repeat');cx.fillRect(0,0,W+64,H+64);cx.restore();
  const bands=Math.floor(k*5+Math.random()*k*3);for(let i=0;i<bands;i++){const y=rand(0,H),hh=rand(2,10+k*30);cx.drawImage(cv,0,y*DPR,W*DPR,hh*DPR,rand(-30,30)*k,y,W,hh)}
  if(Math.random()<k*.08){cx.fillStyle=`rgba(255,255,255,${k*.12})`;cx.fillRect(0,rand(0,H),W,rand(1,3))}
  if(k>.5&&Math.random()<.02)freezeUntil=performance.now()+rand(60,180);
}
let BAT=null;if(navigator.getBattery)navigator.getBattery().then(b=>BAT=b).catch(()=>{});
const MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const TK={msg:'',cls:'',until:0};
say=(msg,cls)=>{TK.msg=msg;TK.cls=cls||'';TK.until=performance.now()+(cls==='alert'?2500:5000)};
function statusText(){
  const p=[`${pad(Math.round(O.h),3)}°${O.ok?(O.abs?'':' REL'):O.dragged?' DRAG':' NO GYRO'}`];
  if(MODE==='real')p.push(radarLive()?'RADAR LIVE':'RADAR OFF');else if(radarLive())p.push('RADAR ✓');
  if(MODE==='hunt')p.push(GPS.ok?`GPS ±${Math.round(GPS.acc)}m`:GPS.err?'GPS ERR':'GPS …');
  p.push(`CONTAINED ${caps}`);return p.join(' · ');
}
function drawHUD(t,level,full){
  const top=54,d=new Date(),m=10;cx.save();cx.font='13px ui-monospace,Menlo,monospace';cx.textBaseline='top';cx.shadowColor='#000';cx.shadowBlur=4;cx.fillStyle='#fff';
  if(full){cx.strokeStyle='rgba(255,255,255,.55)';cx.lineWidth=2;const l=22;for(const[x,y,sx,sy]of[[m,top,1,1],[W-m,top,-1,1],[m,H-48,1,-1],[W-m,H-48,-1,-1]]){cx.beginPath();cx.moveTo(x,y+sy*l);cx.lineTo(x,y);cx.lineTo(x+sx*l,y);cx.stroke()}}
  if(REC.mr){if((t*2|0)%2===0){cx.fillStyle='#ff3b30';cx.beginPath();cx.arc(m+24,top+15,6,0,7);cx.fill()}cx.fillStyle='#fff';const s=(performance.now()-REC.t0)/1000|0;cx.fillText(`REC ${pad(s/3600|0)}:${pad(s/60%60|0)}:${pad(s%60)}`,m+36,top+8)}
  else cx.fillText('STBY',m+14,top+8);
  cx.fillText(`${MON[d.getMonth()]} ${pad(d.getDate())} ${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,m+14,top+26);
  if(full){cx.textAlign='right';
    cx.fillText({nv:'IR ◉  NIGHTSHOT',thermal:'THERMAL·SIM',sls:'SLS · DEPTH',laser:'IR ◉  GRID'}[DEV]||'',W-m-14,top+8);
    cx.fillText(BAT?`BAT ${Math.round(BAT.level*100)}%`:'',W-m-14,top+26);
    cx.fillText(TEMP.amb!=null?fmtT(TEMP.amb):'TEMP --',W-m-14,top+44);
    if(staged()&&TEMP.amb!=null&&TEMP.amb<TEMP.base-3){cx.fillStyle='#7fd8ff';cx.fillText('COLD SPOT',W-m-14,top+62)}
    const lv=ledCount(level);for(let i=0;i<5;i++){cx.fillStyle=i<lv?LEDC[i]:'rgba(255,255,255,.15)';cx.beginPath();cx.arc(W-m-14-(4-i)*14,top+86,5,0,7);cx.fill()}}
  cx.textAlign='center';cx.font='15px ui-monospace,Menlo,monospace';
  if(TK.msg&&performance.now()<TK.until){cx.fillStyle=TK.cls==='alert'?((t*6|0)%2?'#ff3b30':'#ff9a8f'):TK.cls==='warn'?'#ffb627':'#bfffd9';
    const words=TK.msg.split(' '),lines=[''];for(const w of words){const tl=(lines[lines.length-1]+' '+w).trim();if(cx.measureText(tl).width>W-40&&lines[lines.length-1])lines.push(w);else lines[lines.length-1]=tl}
    const y0=full?H-74:H*.36;lines.slice(-2).forEach((l,i,a)=>cx.fillText(l,W/2,y0-(a.length-1-i)*19))}
  cx.font='11px ui-monospace,Menlo,monospace';cx.fillStyle='rgba(255,255,255,.7)';cx.textAlign='left';cx.fillText(statusText(),m+14,full?H-40:top+44);
  cx.restore();
}
function drawTape(){
  const y=H-14,f=fpx;cx.save();cx.font='10px ui-monospace,monospace';cx.textAlign='center';
  for(let a=Math.ceil((O.h-60)/5)*5;a<=O.h+60;a+=5){const x=W/2+Math.tan(wrap(a-O.h)*D2R)*f;if(x<0||x>W)continue;const n=((a%360)+360)%360,big=n%45===0;
    cx.strokeStyle=big?'rgba(255,255,255,.8)':'rgba(255,255,255,.3)';cx.beginPath();cx.moveTo(x,y-(big?9:4));cx.lineTo(x,y);cx.stroke();
    if(big){cx.fillStyle='#fff';cx.fillText({0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'}[n],x,y-20)}}
  cx.fillStyle='#ffb627';cx.beginPath();cx.moveTo(W/2,y-10);cx.lineTo(W/2-4,y-16);cx.lineTo(W/2+4,y-16);cx.fill();cx.restore();
}
function crosshair(spot){cx.save();cx.strokeStyle='rgba(255,255,255,.6)';cx.lineWidth=1;const x=W/2,y=H*.5;cx.beginPath();cx.moveTo(x-14,y);cx.lineTo(x-4,y);cx.moveTo(x+4,y);cx.lineTo(x+14,y);cx.moveTo(x,y-14);cx.lineTo(x,y-4);cx.moveTo(x,y+4);cx.lineTo(x,y+14);cx.stroke();
  if(spot!==undefined){cx.font='bold 14px ui-monospace,monospace';cx.fillStyle='#fff';cx.shadowColor='#000';cx.shadowBlur=4;cx.fillText(spot==null?'--':fmtT(spot),x+18,y-8)}cx.restore()}
function thermalScale(){const x=W-26,y0=H*.3,h=H*.36;cx.save();for(let i=0;i<h;i++){const j=Math.round((1-i/h)*255)*3;cx.fillStyle=`rgb(${IRON[j]},${IRON[j+1]},${IRON[j+2]})`;cx.fillRect(x,y0+i,10,1)}
  cx.font='10px ui-monospace,monospace';cx.fillStyle='#fff';cx.textAlign='right';cx.shadowColor='#000';cx.shadowBlur=3;cx.fillText(fmtT(thermRange[1]),x-3,y0+8);cx.fillText(fmtT(thermRange[0]),x-3,y0+h);cx.restore()}

// ================================================================ handheld devices
const LEDC=['#2bff5e','#a6ff2b','#ffe32b','#ff9a2b','#ff2b2b'],LEDTH=[0,1.5,5,10,20];
const ledCount=lv=>{const v=mG(lv);let n=0;for(const th of LEDTH)if(v>=th)n++;return n};
function rr(x,y,w,h,r){cx.beginPath();cx.moveTo(x+r,y);cx.arcTo(x+w,y,x+w,y+h,r);cx.arcTo(x+w,y+h,x,y+h,r);cx.arcTo(x,y+h,x,y,r);cx.arcTo(x,y,x+w,y,r);cx.closePath()}
function body(x,y,w,h,r,c1,c2){cx.save();cx.shadowColor='rgba(0,0,0,.8)';cx.shadowBlur=24;cx.shadowOffsetY=8;const g=cx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,c1);g.addColorStop(1,c2);cx.fillStyle=g;rr(x,y,w,h,r);cx.fill();cx.restore();
  cx.save();cx.strokeStyle='rgba(255,255,255,.12)';cx.lineWidth=1.5;rr(x+2,y+2,w-4,h-4,r-2);cx.stroke();cx.restore()}
function led(x,y,r,col,on,k=1){cx.save();const g=cx.createRadialGradient(x-r*.3,y-r*.3,r*.1,x,y,r);
  if(on){cx.shadowColor=col;cx.shadowBlur=r*2.2*k;g.addColorStop(0,'#fff');g.addColorStop(.35,col);g.addColorStop(1,col)}else{g.addColorStop(0,'rgba(255,255,255,.35)');g.addColorStop(.4,shade(col,.22));g.addColorStop(1,shade(col,.12))}
  cx.fillStyle=g;cx.beginPath();cx.arc(x,y,r,0,7);cx.fill();cx.restore();if(on){cx.save();cx.globalCompositeOperation='lighter';cx.globalAlpha=.25*k;const h=cx.createRadialGradient(x,y,0,x,y,r*4);h.addColorStop(0,col);h.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=h;cx.fillRect(x-r*4,y-r*4,r*8,r*8);cx.restore()}}
function shade(hex,k){const n=parseInt(hex.slice(1),16);return`rgb(${(n>>16&255)*k|0},${(n>>8&255)*k|0},${(n&255)*k|0})`}
function lcd(x,y,w,h,bg,glow){cx.save();const g=cx.createLinearGradient(x,y,x,y+h);g.addColorStop(0,bg[0]);g.addColorStop(1,bg[1]);cx.fillStyle=g;cx.shadowColor=glow||'transparent';cx.shadowBlur=glow?18:0;rr(x,y,w,h,6);cx.fill();cx.restore();
  cx.save();cx.strokeStyle='rgba(0,0,0,.6)';cx.lineWidth=3;rr(x,y,w,h,6);cx.stroke();cx.restore()}
const devBox=(wf=.9,hf=.5)=>{const w=Math.min(W-28,380)*wf,h=Math.min(H*hf,w*1.5);return{x:(W-w)/2,y:H-h-14,w,h}};
const DS={k2n:0,melBeep:0,melLight:false,remN:0,remT:0,boxStepT:0,boxLed:0,ovWords:[],ovT:0,ovE:null,ovE0:0};

function devK2(t,level){
  const b=devBox(.62,.55),{x,y,w,h}=b;body(x,y,w,h,22,'#3b3b3b','#141414');
  cx.fillStyle='#0b0b0b';rr(x+12,y+14,w-24,h*.3,12);cx.fill();
  const n=ledCount(level),r=Math.min((w-48)/12,16);DS.k2n=n;
  for(let i=0;i<5;i++)led(x+24+r+i*((w-48-r*2)/4),y+14+h*.15,r,LEDC[i],i<n,1.2);
  cx.font='10px ui-monospace,monospace';cx.fillStyle='#9a9a9a';cx.textAlign='center';['0.5','1.5','5','10','20+'].forEach((s,i)=>cx.fillText(s,x+24+r+i*((w-48-r*2)/4),y+14+h*.3+14));
  cx.font='bold 18px ui-sans-serif,system-ui';cx.fillStyle='#d8d8d8';cx.fillText('EMF  5-LED',x+w/2,y+h*.55);cx.font='11px ui-monospace,monospace';cx.fillStyle='#8a8a8a';cx.fillText('milligauss',x+w/2,y+h*.55+18);
  cx.fillStyle='#1d1d1d';rr(x+w/2-22,y+h*.72,44,h*.14,8);cx.fill();cx.fillStyle='#585858';rr(x+w/2-12,y+h*.74,24,h*.06,4);cx.fill();
  cx.font='10px ui-monospace,monospace';cx.fillStyle='#777';cx.fillText('SOURCE: '+levelSource().toUpperCase(),x+w/2,y+h-12);
}
function devMel(t,level){
  const b=devBox(.7,.58),{x,y,w,h}=b;body(x,y,w,h,18,'#2a2a2a','#0d0d0d');cx.fillStyle='#d9761e';rr(x+8,y+8,w-16,10,4);cx.fill();
  const v=mG(level),k=kit(),realHall=MODE==='real'&&k&&k.hd!=null,lx=x+18,ly=y+30,lw=w-36,lh=h*.42,on=DS.melLight;
  lcd(lx,ly,lw,lh,['#b9d3a4','#93b07e'],null);cx.fillStyle='#1d2a16';cx.textAlign='left';
  cx.font='11px ui-monospace,monospace';cx.fillText(realHall?'MAG (raw)':'EMF',lx+10,ly+16);cx.fillText('TEMP',lx+10,ly+lh*.55+4);
  cx.font=`bold ${Math.round(lh*.26)}px ui-monospace,monospace`;cx.textAlign='right';
  cx.fillText(realHall?String(Math.abs(k.hd)):MODE==='real'&&!realHall?(radarTarget()?v.toFixed(1):'0.0'):v.toFixed(1),lx+lw-46,ly+lh*.42);cx.font='12px ui-monospace,monospace';cx.fillText(realHall?'ADC':'mG',lx+lw-10,ly+lh*.42);
  const tc=TEMP.amb;cx.font=`bold ${Math.round(lh*.26)}px ui-monospace,monospace`;cx.fillText(tc==null?'--.-':(CFG.units==='F'?tc*9/5+32:tc).toFixed(1),lx+lw-46,ly+lh*.92);cx.font='12px ui-monospace,monospace';cx.fillText('°'+CFG.units,lx+lw-10,ly+lh*.92);
  const alarm=v>=2&&!realHall||realHall&&Math.abs(k.hd)>25;
  cx.textAlign='left';cx.font='10px ui-monospace,monospace';cx.fillStyle=alarm&&(t*4|0)%2?'#1d2a16':'rgba(29,42,22,.25)';cx.fillText('▲ RT-EMF ALARM',lx+10,ly+lh*.5-6);
  led(x+w-30,y+h*.62+10,7,'#ff2020',on);cx.fillStyle='#999';cx.font='10px ui-monospace,monospace';cx.textAlign='right';cx.fillText('RED LIGHT',x+w-44,y+h*.62+14);
  cx.textAlign='center';cx.fillStyle='#ccc';cx.font='bold 15px ui-sans-serif,system-ui';cx.fillText('EMF · TEMP',x+w/2,y+h*.82);cx.font='10px ui-monospace,monospace';cx.fillStyle='#777';cx.fillText(staged()?'source: staged':'source: '+(realHall?'Hall sensor':'radar')+(realTemp()!=null?' + thermistor':''),x+w/2,y+h-12);
  if(alarm&&AU.ctx&&t-DS.melBeep>Math.max(.12,.9-level)){DS.melBeep=t;tone(2900,.05,.12,'square')}
}
function devRem(t,level,dt){
  const b=devBox(.55,.6),{x,y,w,h}=b,cyl=y+h*.38;
  // antenna + dome
  cx.save();cx.strokeStyle='#aaa';cx.lineWidth=3;cx.beginPath();cx.moveTo(x+w/2,cyl-h*.05);cx.lineTo(x+w/2,y-h*.25);cx.stroke();cx.fillStyle='#ccc';cx.beginPath();cx.arc(x+w/2,y-h*.25,4,0,7);cx.fill();cx.restore();
  let n=0;
  if(MODE==='real'){const tg=radarTarget();if(tg&&tg.d<2.5)n=Math.ceil((2.5-tg.d)/.5);if(Date.now()-RD.vibT<2500)n=4}
  else if(active()){const d=gDist();if(d<3)n=Math.ceil((3-d)/.6)}
  n=clamp(n,0,4);DS.remN=n;
  const dome=cx.createRadialGradient(x+w/2-10,cyl-h*.08,4,x+w/2,cyl,w*.45);dome.addColorStop(0,'rgba(120,120,140,.9)');dome.addColorStop(1,'rgba(15,15,20,.95)');cx.fillStyle=dome;cx.beginPath();cx.ellipse(x+w/2,cyl,w*.42,h*.16,0,Math.PI,0);cx.fill();
  const cols=['#ff2b2b','#ffe32b','#2bff5e','#2b7bff'];
  cols.forEach((c,i)=>{const a=Math.PI*(1.15+i*.23);led(x+w/2+Math.cos(a)*w*.3,cyl+Math.sin(a)*h*.11,9,c,i<n,1.4)});
  body(x,cyl,w,h*.62,14,'#222','#080808');
  cx.fillStyle='#ccc';cx.font='bold 16px ui-sans-serif,system-ui';cx.textAlign='center';cx.fillText('REM · POD',x+w/2,cyl+h*.2);
  const tc=TEMP.amb,dev=tc!=null&&staged()?tc-TEMP.base:0;led(x+w/2-22,cyl+h*.32,7,'#2b9bff',dev<-2.5);led(x+w/2+22,cyl+h*.32,7,'#ff2b2b',dev>2.5);
  cx.font='10px ui-monospace,monospace';cx.fillStyle='#888';cx.fillText('COLD     TEMP     WARM',x+w/2,cyl+h*.32+22);cx.fillText(MODE==='real'?'source: radar proximity + vibration':'source: staged',x+w/2,y+h-12);
  if(n>0&&AU.ctx&&t-DS.remT>.26-n*.03){DS.remT=t;tone([0,820,1050,1350,1750][n],.12,.16,'square')}
}
function devBox_(t,level){
  const b=devBox(.75,.55),{x,y,w,h}=b;body(x,y,w,h,14,'#1e1e1e','#050505');
  for(let i=0;i<9;i++)for(let j=0;j<5;j++){cx.fillStyle='#000';cx.beginPath();cx.arc(x+w*.15+i*(w*.7/8),y+h*.62+j*12,3,0,7);cx.fill()}
  const lx=x+16,ly=y+16,lw=w-32,lh=h*.38;lcd(lx,ly,lw,lh,['#3a2306','#1f1303'],BOX.on?'rgba(255,170,40,.35)':null);
  cx.textAlign='center';cx.fillStyle=BOX.on?'#ffb43a':'#5a3a10';cx.font=`bold ${Math.round(lh*.38)}px ui-monospace,monospace`;
  const w0=$('#boxWord').textContent;cx.fillText(w0&&BOX.on?'‹ '+w0.toUpperCase()+' ›':'FM '+BOX.freq.toFixed(1),x+w/2,ly+lh*.58);
  cx.font='11px ui-monospace,monospace';cx.fillText(BOX.on?`SWEEP ${$('#boxRate').value} ms  ▶`:'STOPPED',x+w/2,ly+lh*.88);
  led(x+w-28,y+h*.5,6,'#ff2020',BOX.on&&(t*1000/ +$('#boxRate').value|0)%2===0);
  cx.fillStyle='#bbb';cx.font='bold 14px ui-sans-serif,system-ui';cx.fillText('SPIRIT BOX',x+w/2,y+h*.53);
  cx.font='10px ui-monospace,monospace';cx.fillStyle='#777';cx.fillText(BOX.on?(staged()?'ask a question, then listen':'real mode: radio static only'):'tap Sweep',x+w/2,y+h-10);
}
function devOvilus(t,level,dt){
  const b=devBox(.72,.56),{x,y,w,h}=b;body(x,y,w,h,20,'#2b2f38','#0b0d12');
  const lx=x+16,ly=y+18,lw=w-32,lh=h*.5;lcd(lx,ly,lw,lh,['#0b1f3a','#06101f'],'rgba(60,140,255,.25)');
  cx.textAlign='center';cx.fillStyle='#9fd0ff';cx.shadowColor='#4aa0ff';cx.shadowBlur=8;cx.font=`bold ${Math.round(lh*.24)}px ui-monospace,monospace`;
  const cur=DS.ovWords[0];cx.fillText(cur&&t-cur.t<4?cur.w.toUpperCase():'· · ·',x+w/2,ly+lh*.45);cx.shadowBlur=0;
  cx.font='11px ui-monospace,monospace';cx.fillStyle='rgba(159,208,255,.55)';cx.fillText(DS.ovWords.slice(1,5).map(o=>o.w).join('  ·  '),x+w/2,ly+lh*.78);
  const e=DS.ovBar||0;cx.fillStyle='#111';rr(x+20,y+h*.62+8,w-40,10,5);cx.fill();cx.fillStyle='#4aa0ff';rr(x+20,y+h*.62+8,(w-40)*clamp(e,0,1),10,5);cx.fill();
  cx.fillStyle='#bbb';cx.font='bold 14px ui-sans-serif,system-ui';cx.fillText('WORD BOX',x+w/2,y+h*.82);cx.font='10px ui-monospace,monospace';cx.fillStyle='#777';
  cx.fillText(MODE==='real'?'words picked from real sensor changes':'source: staged',x+w/2,y+h-12);
}
function devEVP(t){
  const b=devBox(.62,.6),{x,y,w,h}=b;body(x,y,w,h,24,'#c9ccd1','#7c8088');
  const lx=x+16,ly=y+18,lw=w-32,lh=h*.38;lcd(lx,ly,lw,lh,['#c4d6c8','#9db3a3'],null);
  drawEVPWave(cx,lx+6,ly+20,lw-12,lh-28,'#1c2a20');
  cx.fillStyle='#1c2a20';cx.font='11px ui-monospace,monospace';cx.textAlign='left';cx.fillText(EVP.live?'● REC':EVP.src?'▶ PLAY':'STOP',lx+8,ly+14);
  cx.textAlign='right';cx.fillText(EVP.live?((performance.now()-EVP.t0)/1000).toFixed(1)+' s':EVP.buf?EVP.buf.duration.toFixed(1)+' s':'00.0 s',lx+lw-8,ly+14);
  led(x+w-26,y+h*.5,6,'#ff2020',EVP.live&&(t*2|0)%2===0);
  for(let i=0;i<14;i++){cx.fillStyle='rgba(0,0,0,.35)';cx.fillRect(x+w*.2,y+h*.62+i*6,w*.6,2)}
  cx.fillStyle='#2b2e33';cx.font='bold 13px ui-sans-serif,system-ui';cx.textAlign='center';cx.fillText('EVP RECORDER',x+w/2,y+h*.56);
  cx.font='10px ui-monospace,monospace';cx.fillStyle='#333';cx.fillText($('#evpTxt').textContent.slice(0,46),x+w/2,y+h-12);
}

// Word box: like the real devices, words are picked by sensor changes; staged mode adds context
const OV_WORDS=['here','cold','leave','help','dark','stay','who','yes','no','home','mother','child','pain','hurt','fire','water','door','stairs','basement','attic','behind','closer','watching','alone','lost','name','why','now','soon','night','blood','grave','light','gone','hide','run','listen','sorry','free','trapped','below','above','mine','ours','left','right','wait','old','music','bell','window','cross','pray','dog','sister','brother','father','work','sleep','wake','hungry','cold hands','see you','go away'];
function ovStep(t,dt){
  const near=(G.state==='near'&&gDist()<4)||G.state==='charge'||G.state==='lurk';
  if(MODE==='real'){
    const tg=radarTarget(),k=kit()||{},e=(tg?tg.e:0)+(k.hd?Math.abs(k.hd)/3:0)+(k.snd||0)/40+(k.vib||0)*20;
    if(DS.ovE==null)DS.ovE=e;const de=Math.abs(e-DS.ovE);DS.ovE+=(e-DS.ovE)*Math.min(1,dt*2);DS.ovBar=clamp(de/30,0,1);
    if(de>12&&t-DS.ovT>5){DS.ovT=t;const i=((Math.round(e*31+de*17)%OV_WORDS.length)+OV_WORDS.length)%OV_WORDS.length;ovSay(OV_WORDS[i],'sensor-driven')}
  }else{DS.ovBar=L;if(L>.3&&t-DS.ovT>4&&Math.random()<(.15+L*.5)*dt){DS.ovT=t;ovSay(near?pick(['behind','closer','here','now','see you','run','cold']):pick(OV_WORDS),'staged')}}
}
function ovSay(w,src){DS.ovWords.unshift({w,t:performance.now()/1000});DS.ovWords.length=Math.min(DS.ovWords.length,8);logEv(`Word box: "${w.toUpperCase()}"`);hwOut('fx pulse 900 60 140 255');
  if(CFG.voices&&'speechSynthesis'in window){const u=new SpeechSynthesisUtterance(w);u.rate=rand(.75,.95);u.pitch=rand(.3,.6);u.volume=clamp(CFG.vol,0,1);speechSynthesis.speak(u)}}

// ================================================================ spirit box
const WORDS=['here','leave','cold','who','behind','hello','help','dark','stay','go','yes','no','watching','closer','get out','with you','below','now','mine','listen','don\'t','run'];
const BOX={on:false,freq:87.5,next:0,lastWord:0};
function boxToggle(){auInit();BOX.on=!BOX.on;BOX.next=AU.ctx.currentTime+.05;if(BOX.on)logEv('Spirit box sweep started');buildCtl()}
function boxStep(when,rate){
  const C=AU.ctx,dur=rate/1000*.8;noiseHit(dur,.32,'bandpass',rand(900,2200),when,true);  // AM static burst; the gaps between steps make the chop
  if(Math.random()<.32){const o=C.createOscillator(),f=C.createBiquadFilter(),g=C.createGain();o.type='sawtooth';o.frequency.setValueAtTime(rand(100,230),when);o.frequency.linearRampToValueAtTime(rand(100,260),when+dur*.6);
    f.type='bandpass';f.frequency.value=rand(500,1500);f.Q.value=5;g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(.18,when+.01);g.gain.linearRampToValueAtTime(0,when+dur*.6);
    o.connect(f);f.connect(g);g.connect(AU.master);o.start(when);o.stop(when+dur*.6+.02)}
}
function boxUpdate(){
  if(!BOX.on||!AU.ctx)return;const C=AU.ctx,rate=+$('#boxRate').value;
  while(BOX.next<C.currentTime+.12){boxStep(BOX.next,rate);BOX.next+=rate/1000;BOX.freq=BOX.freq>=107.9?87.5:+(BOX.freq+.2).toFixed(1)}
  if(staged()&&CFG.voices&&performance.now()-BOX.lastWord>3500&&Math.random()<(.003+L*.035)){BOX.lastWord=performance.now();
    const near=(G.state==='near'&&gDist()<4)||G.state==='charge'||G.state==='lurk';speak(near?pick(['behind','closer','here','now','behind you','run']):pick(WORDS))}
}
function speak(w){
  $('#boxWord').textContent=w;setTimeout(()=>{if($('#boxWord').textContent===w)$('#boxWord').textContent=''},2500);logEv(`Spirit box: "${w.toUpperCase()}"`);hwOut('fx flicker 700 255 160 40');
  if('speechSynthesis'in window){const u=new SpeechSynthesisUtterance(w);u.rate=rand(.62,.95);u.pitch=rand(.05,.45);u.volume=clamp(CFG.vol*.9,0,1);speechSynthesis.speak(u)}
}

// ================================================================ EVP recorder
const EVP={mr:null,stream:null,an:null,buf:null,rev:null,plant:null,anoms:[],src:null,playT0:0,playRate:1,playRev:false,live:false,t0:0};
async function evpRecord(){
  if(EVP.mr){EVP.mr.stop();return}
  auInit();
  try{EVP.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})}catch(e){$('#evpTxt').textContent='Microphone not available';return}
  EVP.an=AU.ctx.createAnalyser();EVP.an.fftSize=1024;AU.ctx.createMediaStreamSource(EVP.stream).connect(EVP.an);
  const chunks=[];EVP.mr=new MediaRecorder(EVP.stream);EVP.mr.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  EVP.mr.onstop=async()=>{EVP.live=false;EVP.mr=null;for(const t of EVP.stream.getTracks())t.stop();buildCtl();
    try{const ab=await new Blob(chunks).arrayBuffer();EVP.buf=await AU.ctx.decodeAudioData(ab);
      EVP.plant=staged()?plantWhisper(EVP.buf):null;EVP.rev=null;EVP.anoms=findAnomalies(EVP.buf);
      $('#evpTxt').textContent=EVP.anoms.length?`${EVP.anoms.length} anomal${EVP.anoms.length>1?'ies':'y'}: ${EVP.anoms.map(a=>a.t.toFixed(1)+'s').join(' ')}`:'No anomalies. Try again.';
      logEv(`EVP session ${EVP.buf.duration.toFixed(0)} s: ${EVP.anoms.length} anomal${EVP.anoms.length===1?'y':'ies'}`)}
    catch(e){$('#evpTxt').textContent='Could not decode the recording'}buildCtl()};
  EVP.mr.start();EVP.live=true;EVP.t0=performance.now();$('#evpTxt').textContent='Ask a question, then stay silent.';buildCtl();
  setTimeout(()=>{if(EVP.mr&&EVP.mr.state==='recording')EVP.mr.stop()},15000);
}
// Staged modes: mix an unintelligible whisper (noise through vowel formants) into the recording, the way real EVPs sound.
function plantWhisper(buf){
  const sr=buf.sampleRate,data=buf.getChannelData(0),dur=rand(.8,1.3),len=Math.floor(sr*dur);if(buf.duration<4)return null;
  const start=Math.floor(sr*rand(2.5,buf.duration-dur-.5));let rms=0;for(let i=0;i<data.length;i+=64)rms+=data[i]*data[i];rms=Math.sqrt(rms/(data.length/64));
  const amp=clamp(rms*4,.015,.25),syl=Math.random()<.5?2:3,F=[[300,870],[270,2290],[730,1090],[520,1190],[440,1020],[660,1720]];
  const bp=(f,q)=>{const w=2*Math.PI*f/sr,al=Math.sin(w)/(2*q),a0=1+al;return{b0:al/a0,b2:-al/a0,a1:-2*Math.cos(w)/a0,a2:(1-al)/a0,x1:0,x2:0,y1:0,y2:0}};
  const run=(s,x)=>{const y=s.b0*x+s.b2*s.x2-s.a1*s.y1-s.a2*s.y2;s.x2=s.x1;s.x1=x;s.y2=s.y1;s.y1=y;return y};
  const out=new Float32Array(len);
  for(let k=0;k<syl;k++){const[f1,f2]=pick(F),a=bp(f1,6),b=bp(f2,8),s0=Math.floor(k*len/syl),s1=Math.floor((k+1)*len/syl);
    for(let i=s0;i<s1;i++){const x=Math.random()*2-1,env=Math.sin(Math.PI*(i-s0)/(s1-s0))**2;out[i]+=(run(a,x)+run(b,x)*.7)*env}}
  let pk=0;for(const v of out)pk=Math.max(pk,Math.abs(v));
  for(let c=0;c<buf.numberOfChannels;c++){const ch=buf.getChannelData(c);for(let i=0;i<len;i++)ch[start+i]+=out[i]/pk*amp}
  return{t:start/sr,dur};
}
function findAnomalies(buf){  // real analysis for any recording: 50 ms windows much louder than the session's median
  const d=buf.getChannelData(0),sr=buf.sampleRate,w=Math.floor(sr*.05),rms=[];
  for(let i=0;i+w<=d.length;i+=w){let s=0;for(let j=i;j<i+w;j++)s+=d[j]*d[j];rms.push(Math.sqrt(s/w))}
  const med=rms.slice().sort((a,b)=>a-b)[Math.floor(rms.length/2)]||0,th=Math.max(med*3.2,.012),out=[];
  for(let i=4;i<rms.length;i++)if(rms[i]>th&&(!out.length||i*.05-out[out.length-1].t>1.2))out.push({t:i*.05,v:rms[i]});
  return out.slice(0,6);
}
function evpPlay(rev,rate){
  if(!EVP.buf)return;auInit();if(EVP.src){try{EVP.src.stop()}catch(e){}}
  let b=EVP.buf;if(rev){if(!EVP.rev){const r=AU.ctx.createBuffer(b.numberOfChannels,b.length,b.sampleRate);for(let c=0;c<b.numberOfChannels;c++){const s=b.getChannelData(c),o=r.getChannelData(c);for(let i=0;i<s.length;i++)o[i]=s[s.length-1-i]}EVP.rev=r}b=EVP.rev}
  const s=AU.ctx.createBufferSource();s.buffer=b;s.playbackRate.value=rate;s.connect(AU.master);s.start();EVP.src=s;EVP.playT0=AU.ctx.currentTime;EVP.playRate=rate;EVP.playRev=rev;s.onended=()=>{if(EVP.src===s)EVP.src=null};
}
function evpSave(){
  const b=EVP.buf;if(!b)return;const d=b.getChannelData(0),n=d.length,ab=new ArrayBuffer(44+n*2),v=new DataView(ab),ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  ws(0,'RIFF');v.setUint32(4,36+n*2,true);ws(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,b.sampleRate,true);v.setUint32(28,b.sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,clamp(d[i],-1,1)*32767,true);download(new Blob([ab],{type:'audio/wav'}),`evp-${stamp()}.wav`);
}
function drawEVPWave(x,X,Y,w,h,col){
  x.save();x.strokeStyle=col;x.lineWidth=1;
  if(EVP.live&&EVP.an){const a=new Float32Array(EVP.an.fftSize);EVP.an.getFloatTimeDomainData(a);x.beginPath();for(let i=0;i<a.length;i+=2){const xx=X+i/a.length*w,yy=Y+h/2+clamp(a[i]*h*2,-h/2,h/2);i?x.lineTo(xx,yy):x.moveTo(xx,yy)}x.stroke()}
  else if(EVP.buf){const d=EVP.buf.getChannelData(0),step=Math.ceil(d.length/w),dur=EVP.buf.duration;
    for(const a of EVP.anoms){x.fillStyle='rgba(180,90,0,.35)';x.fillRect(X+a.t/dur*w-3,Y,8,h)}
    x.beginPath();for(let i=0;i<w;i++){let mn=1,mx=-1;for(let j=i*step;j<Math.min(d.length,(i+1)*step);j+=4){const v=d[j];if(v<mn)mn=v;if(v>mx)mx=v}x.moveTo(X+i+.5,Y+h/2+mn*h*.5);x.lineTo(X+i+.5,Y+h/2+mx*h*.5)}x.stroke();
    if(EVP.src){let p=(AU.ctx.currentTime-EVP.playT0)*EVP.playRate/dur;if(EVP.playRev)p=1-p;x.fillStyle=col;x.fillRect(X+clamp(p,0,1)*w,Y,1.5,h)}}
  else{x.beginPath();x.moveTo(X,Y+h/2);x.lineTo(X+w,Y+h/2);x.stroke()}
  x.restore();
}

// ================================================================ radar scope
const scope=document.createElement('canvas'),sx=scope.getContext('2d');let sweep=0;
function drawScope(t,dt,level){
  cx.fillStyle='#000';cx.fillRect(0,0,W,H);
  const R=Math.min(W,H*.8)/2-18,X=W/2,Y=H*.5,range=MODE==='real'?6:MODE==='hunt'&&G.state==='idle'?120:9;
  if(scope.width!==Math.round(W)||scope.height!==Math.round(H)){scope.width=W;scope.height=H}
  sx.fillStyle='rgba(0,8,4,.12)';sx.fillRect(0,0,W,H);
  const prev=sweep;sweep=(sweep+dt*140)%360;if(prev>sweep&&AU.ctx)tone(1500,.04,.05);
  const plot=(p,col,size)=>{const rel=wrap(headingOf(p)-O.h),dist=len2(p),a=(rel-90)*D2R,rr=clamp(dist/range,0,1)*R;sx.fillStyle=col;sx.shadowColor=col;sx.shadowBlur=12;sx.beginPath();sx.arc(X+Math.cos(a)*rr,Y+Math.sin(a)*rr,size,0,7);sx.fill();sx.shadowBlur=0};
  const crossed=p=>{const r=(wrap(headingOf(p)-O.h)+360)%360;return prev<=sweep?r>=prev&&r<sweep:r>=prev||r<sweep};
  if(MODE==='real'){const now=Date.now();for(const b of RD.blips)if(now-b.t<25000&&crossed(b.p))plot(b.p,b.mv?'#ff8c3c':'#50aaff',3+b.e/30);
    const tg=radarTarget();if(tg){const p=O.F.map(v=>v*tg.d);if(crossed(p))plot(p,'#fff',6)}}
  else{if(active()&&crossed(G.p)&&level>.12)plot(G.p,G.state==='charge'?'#ff3b30':'#38ff9c',4+level*6);
    for(const s of WORLD.shadows){const p=shadowPos(s);if(crossed(p))plot(p,'#38ff9c',4)}
    if(MODE==='hunt'&&G.state==='idle'&&hunt.dist!=null){const p=atBearing(hunt.bear,hunt.dist);if(crossed(p))plot(p,'#38ff9c',6)}}
  cx.drawImage(scope,0,0,W,H);
  cx.save();cx.strokeStyle='rgba(56,255,156,.35)';cx.fillStyle='rgba(56,255,156,.6)';cx.font='10px ui-monospace,monospace';
  for(let i=1;i<=4;i++){cx.beginPath();cx.arc(X,Y,R*i/4,0,7);cx.stroke();cx.fillText((range*i/4).toFixed(range>20?0:1)+' m',X+4,Y-R*i/4+12)}
  cx.beginPath();cx.moveTo(X-R,Y);cx.lineTo(X+R,Y);cx.moveTo(X,Y-R);cx.lineTo(X,Y+R);cx.stroke();
  const fov=(MODE==='real'?60:Math.atan(W/2/fpx)/D2R)*D2R;cx.fillStyle='rgba(56,255,156,.07)';cx.beginPath();cx.moveTo(X,Y);cx.arc(X,Y,R,-Math.PI/2-fov,-Math.PI/2+fov);cx.fill();
  const sa=(sweep-90)*D2R,sg=cx.createLinearGradient(X,Y,X+Math.cos(sa)*R,Y+Math.sin(sa)*R);sg.addColorStop(0,'rgba(56,255,156,0)');sg.addColorStop(1,'rgba(56,255,156,.9)');
  cx.strokeStyle=sg;cx.lineWidth=2;cx.beginPath();cx.moveTo(X,Y);cx.lineTo(X+Math.cos(sa)*R,Y+Math.sin(sa)*R);cx.stroke();
  const na=(wrap(0-O.h)-90)*D2R;cx.fillStyle='#ffb627';cx.font='bold 12px ui-monospace,monospace';cx.textAlign='center';cx.fillText('N',X+Math.cos(na)*(R+10),Y+Math.sin(na)*(R+10)+4);
  cx.restore();
  if(MODE==='hunt'&&G.state==='idle'&&hunt.dist!=null){const a=(wrap(hunt.bear-O.h)-90)*D2R;cx.save();cx.translate(X,Y);cx.rotate(a+Math.PI/2);cx.fillStyle='rgba(255,182,39,.85)';
    cx.beginPath();cx.moveTo(0,-R*.55);cx.lineTo(16,-R*.3);cx.lineTo(5,-R*.3);cx.lineTo(5,0);cx.lineTo(-5,0);cx.lineTo(-5,-R*.3);cx.lineTo(-16,-R*.3);cx.fill();cx.restore()}
}

// ================================================================ the kit's lights follow what the app shows
function hwStep(level){
  if(!canSend()||!started)return;
  if(G.scareT>0)return;  // the scare effect is already running on the board
  if(G.state==='charge')return hwOut('fx strobe 600 255 255 255');
  if(G.state==='trapped')return;
  if(DEV==='rem'&&DS.remN>0)return hwOut('fx alarm 700');
  if(MODE==='real'&&DEV!=='k2'&&DEV!=='mel')return;  // real mode: the board shows the radar on its own
  if(staged()&&L>.62&&devKind()==='cam')return hwOut('fx flicker 900 255 190 140');
  const n=ledCount(level),c=[[0,40,0],[0,255,0],[180,255,0],[255,200,0],[255,90,0],[255,0,0]][n];
  hwOut(`led ${c[0]} ${c[1]} ${c[2]}`);
}

// ================================================================ evidence video
const REC={mr:null,t0:0,chunks:[],mic:null};
async function recToggle(){
  if(REC.mr){REC.mr.stop();return}
  if(!cv.captureStream||!window.MediaRecorder){say('Recording isn\'t supported in this browser.','warn');return}
  auInit();if(!AU.recDest){AU.recDest=AU.ctx.createMediaStreamDestination();AU.master.connect(AU.recDest)}
  if(!REC.mic){try{REC.mic=await navigator.mediaDevices.getUserMedia({audio:true});AU.ctx.createMediaStreamSource(REC.mic).connect(AU.recDest)}catch(e){}}  // room sound, recording only
  const tracks=[...cv.captureStream(30).getVideoTracks(),...AU.recDest.stream.getAudioTracks()];
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
  REC.chunks=[];REC.mr=new MediaRecorder(new MediaStream(tracks),mime?{mimeType:mime,videoBitsPerSecond:4e6}:{});
  REC.mr.ondataavailable=e=>e.data.size&&REC.chunks.push(e.data);
  REC.mr.onstop=()=>{const type=REC.mr.mimeType||'video/webm',blob=new Blob(REC.chunks,{type});REC.mr=null;$('#recBtn').classList.remove('on');$('#recBtn').textContent='● REC';
    download(blob,`ghost-evidence-${stamp()}.${type.includes('mp4')?'mp4':'webm'}`);logEv('Evidence video saved')};
  REC.mr.start(1000);REC.t0=performance.now();$('#recBtn').classList.add('on');$('#recBtn').textContent='■ STOP';logEv('Evidence recording started');
}
window.scareFX=()=>{$('#flash').classList.remove('go');void $('#flash').offsetWidth;$('#flash').classList.add('go');$('#app').classList.remove('shake');void $('#app').offsetWidth;$('#app').classList.add('shake')};

// ================================================================ UI
function buildDock(){$('#dock').innerHTML=DEVICES.map(d=>`<button data-dev="${d.id}" class="${d.id===DEV?'on':''}">${d.name}</button>`).join('');
  for(const b of document.querySelectorAll('#dock button'))b.onclick=()=>{DEV=b.dataset.dev;store.set('gh.dev',DEV);buildDock();buildCtl();logEv(`Switched to ${DEVICES.find(d=>d.id===DEV).name}`)};
  const on=$('#dock .on');if(on)on.scrollIntoView({inline:'center',block:'nearest'})}
function buildCtl(){  // controls for the selected device
  const c=$('#devctl');let h='';
  if(DEV==='box')h=`<button id="cBox" class="${BOX.on?'on':''}">${BOX.on?'Stop':'Sweep'}</button>`;
  if(DEV==='evp')h=`<button id="cRec" class="${EVP.live?'on':''}">${EVP.live?'■ Stop':'● Rec 15 s'}</button><button id="cPlay" ${EVP.buf?'':'disabled'}>▶</button><button id="cRev" ${EVP.buf?'':'disabled'}>◀ Rev</button><button id="cSlow" ${EVP.buf?'':'disabled'}>Slow</button><button id="cSave" ${EVP.buf?'':'disabled'}>Save</button>`;
  if(DEV==='mel')h=`<button id="cLight" class="${DS.melLight?'on':''}">Red light</button><button id="cUnits">°${CFG.units==='F'?'C':'F'}</button>`;
  if(devKind()==='cam'&&cam.torch)h+=`<button id="cTorch" class="${cam.torchOn?'on':''}">IR light</button>`;
  $('#ctlDyn').innerHTML=h;$('#boxRate').hidden=DEV!=='box';c.hidden=!h&&DEV!=='box';
  const on=(id,f)=>{const e=$('#'+id);if(e)e.onclick=f};
  on('cBox',boxToggle);on('cRec',evpRecord);on('cPlay',()=>evpPlay(false,1));on('cRev',()=>evpPlay(true,1));on('cSlow',()=>evpPlay(false,.6));on('cSave',evpSave);
  on('cLight',()=>{DS.melLight=!DS.melLight;buildCtl()});on('cUnits',()=>{CFG.units=CFG.units==='F'?'C':'F';store.set('gh.units',CFG.units);buildCtl()});on('cTorch',()=>setTorch(!cam.torchOn));
}
window.usbUI=()=>{const b=$('#usbBtn');b.hidden=!canUSB&&!hubOK;b.classList.toggle('on',USB.on||radarLive());b.textContent=USB.on||radarLive()?'Radar ✓':'USB'};
$('#usbBtn').onclick=usbConnect;
function uiSync(){for(const b of document.querySelectorAll('#tabs button'))b.classList.toggle('on',b.dataset.mode===MODE);$('#trap').hidden=MODE==='real';usbUI()}
function setMode(m){
  MODE=m;store.set('gh.mode',m);Object.assign(G,{state:'idle',wait:m==='ghost'?rand(3,7):1e9,scareT:0,dart:null});hunt.respawn=true;WORLD.cold=[];WORLD.orbs=[];WORLD.shadows=[];
  if(m==='hunt'){startGPS();if(started&&!O.abs&&O.ok)say('No compass on this device; direction to the target may be off.','warn')}
  if(m==='real')say(radarLive()?'Real sensors only. Turn slowly to map what\'s around you.':'Real mode needs the radar. Plug it in and tap USB.',radarLive()?'':'warn');
  if(m==='ghost')say('Baseline readings… monitoring.');
  uiSync();
}
for(const b of document.querySelectorAll('#tabs button'))b.onclick=()=>setMode(b.dataset.mode);
$('#recBtn').onclick=recToggle;
let trapDown=false;
$('#trap').addEventListener('pointerdown',e=>{e.preventDefault();trapDown=true;$('#trap').classList.add('hold');if(!active())say('Nothing in range.','warn')});
for(const ev of['pointerup','pointercancel','pointerleave'])$('#trap').addEventListener(ev,()=>{trapDown=false;$('#trap').classList.remove('hold')});
// desktop / no gyro: drag to look around
{let px=null,py=null;cv.addEventListener('pointerdown',e=>{px=e.clientX;py=e.clientY;cv.setPointerCapture(e.pointerId)});
  cv.addEventListener('pointermove',e=>{if(px==null||sensorsLive())return;O.drag=(O.drag-(e.clientX-px)*.2+360)%360;O.dragP=clamp(O.dragP+(e.clientY-py)*.2,-60,60);px=e.clientX;py=e.clientY;O.dragged=true});
  cv.addEventListener('pointerup',()=>px=null);
  addEventListener('keydown',e=>{if(sensorsLive())return;if(e.key==='ArrowLeft')O.drag=(O.drag-5+360)%360;if(e.key==='ArrowRight')O.drag=(O.drag+5)%360})}
// log
window.renderLog=()=>{$('#logList').innerHTML=LOG.length?LOG.slice(0,150).map(e=>{const d=new Date(e.t);return`<li>${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} <b>${e.txt.replace(/</g,'&lt;')}</b></li>`}).join(''):'<li>No evidence yet.</li>'};
$('#logExport').onclick=()=>{const txt=LOG.slice().reverse().map(e=>`${new Date(e.t).toLocaleString()}  [${e.m}]  ${e.txt}`).join('\n');download(new Blob([`Hu-Motian ghost hunt log\n(Ghost/Hunt entries are staged by the app; Real entries are actual sensor readings.)\n\n${txt}\n`],{type:'text/plain'}),`ghost-log-${stamp()}.txt`)};
$('#logClear').onclick=()=>{if(confirm('Clear the evidence log?')){LOG.length=0;store.set('gh.log','[]');renderLog()}};
// settings
$('#gear').onclick=()=>{$('#go').textContent='RESUME';$('#start').hidden=false;cmd('status')};
$('#oScare').checked=CFG.scares;$('#oVol').value=CFG.vol;$('#oRadar').checked=CFG.radarTrig;$('#oVoices').checked=CFG.voices;$('#oZoom').value=CFG.zoom;
$('#oScare').onchange=e=>{CFG.scares=e.target.checked;store.set('gh.scares',CFG.scares?'1':'0')};
$('#oVol').oninput=e=>{CFG.vol=+e.target.value;store.set('gh.vol',CFG.vol)};
$('#oRadar').onchange=e=>{CFG.radarTrig=e.target.checked;store.set('gh.radarTrig',CFG.radarTrig?'1':'0')};
$('#oVoices').onchange=e=>{CFG.voices=e.target.checked;store.set('gh.voices',CFG.voices?'1':'0')};
$('#oZoom').oninput=e=>{CFG.zoom=+e.target.value;store.set('gh.zoom',CFG.zoom)};
// hardware setup (kit modules on the ESP32)
const HWMODS=[
  {k:'rgb',name:'RGB LED (3-colour)',hint:'KY-016 / KY-009. R, G, B pins; "−" to GND',pins:[['R',32],['G',33],['B',27]],anode:true,test:'fx strobe 1200 255 60 255'},
  {k:'led2',name:'2-colour LED',hint:'KY-011 / KY-029. Red and green pins; "−" to GND',pins:[['Red',22],['Green',23]],test:'fx flicker 1200'},
  {k:'flash',name:'7-colour flash LED',hint:'KY-034. Signal pin; "−" to GND. It cycles colours by itself',pins:[['S',19]],test:'flash 1'},
  {k:'buzz',name:'Buzzer',hint:'Built in on GPIO25 (active or passive buzzer module: S to GPIO25, "−" to GND)',pins:[],fixed:true,test:'beep 1800 250'},
  {k:'hall',name:'Hall magnetic sensor',hint:'KY-035 / KY-024 analog out (AO). Power it from 3V3, not 5 V',pins:[['AO',34]],sensor:'hd'},
  {k:'temp',name:'Thermistor (temperature)',hint:'KY-013. Power from 3V3. Tick "reads backwards" if it gets colder when you warm it',pins:[['S',35]],inv:true,sensor:'tc'},
  {k:'sound',name:'Sound sensor',hint:'KY-037 / KY-038 analog out (AO). Power from 3V3',pins:[['AO',39]],sensor:'snd'},
  {k:'vib',name:'Vibration / knock / tilt',hint:'KY-002 / KY-031 / KY-020 signal pin',pins:[['S',18]],sensor:'vib'}];
function hwState(m){const c=RD.hwc;if(!c)return null;const v=c[m.k==='buzz'?'':m.k];if(m.fixed)return'GPIO25';if(v==null)return null;
  const pins=Array.isArray(v)?(m.k==='rgb'?v.slice(0,3):m.k==='temp'?v.slice(0,1):v):[v];return pins.some(p=>p<0)?null:'GPIO'+pins.join(', ')}
window.renderHW=()=>{
  const el=$('#hwList');if(!el)return;const ok=canSend();
  $('#hwNote').textContent=ok?(RD.hwc?'Connected. Set the pins you wired, then Enable. Settings are saved on the board.':'Connected, but this firmware doesn\'t report kit modules yet. Re-flash it with the latest version.'):'Connect the radar (USB button) to set up kit modules.';
  if(el.dataset.built!==String(!!RD.hwc)){el.dataset.built=String(!!RD.hwc);el.innerHTML=HWMODS.map(m=>`<div class="hw" data-k="${m.k}"><div class="hwh"><b>${m.name}</b><span class="hwst"></span></div><div class="small">${m.hint}</div>
    <div class="row">${m.pins.map(([l,p])=>`<label>${l}<input type="number" min="0" max="39" value="${p}" data-pin></label>`).join('')}${m.anode?'<label><input type="checkbox" data-anode> common +</label>':''}${m.inv?'<label><input type="checkbox" data-inv> reads backwards</label>':''}
    ${m.fixed?'':'<button data-en>Enable</button><button data-off>Off</button>'}${m.test?'<button data-test>Test</button>':''}<span class="hwv"></span></div><div class="small hwmsg"></div></div>`).join('');
    for(const d of el.querySelectorAll('.hw')){const m=HWMODS.find(x=>x.k===d.dataset.k),msg=t=>d.querySelector('.hwmsg').textContent=t;
      const en=d.querySelector('[data-en]'),off=d.querySelector('[data-off]'),te=d.querySelector('[data-test]');
      if(en)en.onclick=async()=>{const pins=[...d.querySelectorAll('[data-pin]')].map(i=>+i.value),extra=m.anode?(d.querySelector('[data-anode]').checked?' 1':' 0'):m.inv?(d.querySelector('[data-inv]').checked?' 1':' 0'):'';
        const a=await cmd(`hw ${m.k} ${pins.join(' ')}${extra}`);msg(a.ok?'Saved.':'✗ '+(a.msg||'failed'));cmd('status')};
      if(off)off.onclick=async()=>{const a=await cmd(`hw off ${m.k}`);msg(a.ok?'Off.':'✗ '+(a.msg||'failed'));cmd('status')};
      if(te)te.onclick=async()=>{const a=await cmd(m.test);msg(a.ok?'Sent. Watch / listen to the board.':'✗ '+(a.msg||'failed'));if(m.k==='flash')setTimeout(()=>cmd('flash 0'),1500)}}}
  for(const d of el.querySelectorAll('.hw')){const m=HWMODS.find(x=>x.k===d.dataset.k),s=hwState(m);d.querySelector('.hwst').textContent=s?'● '+s:'○ off';d.querySelector('.hwst').style.color=s?'#38ff9c':'#7d9486';
    const k=kit();d.querySelector('.hwv').textContent=m.sensor&&k&&k[m.sensor]!=null?`now: ${m.sensor==='tc'?fmtT(k.tc):k[m.sensor]}`:'';
    for(const b of d.querySelectorAll('button'))b.disabled=!ok}
};
let wake=null;async function keepAwake(){try{if('wakeLock'in navigator&&!wake){wake=await navigator.wakeLock.request('screen');wake.addEventListener('release',()=>wake=null)}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&started)keepAwake()});
$('#go').onclick=async()=>{
  $('#start').hidden=true;auInit();if(AU.ctx.state==='suspended')AU.ctx.resume();
  if(typeof DeviceOrientationEvent!=='undefined'&&DeviceOrientationEvent.requestPermission){try{await DeviceOrientationEvent.requestPermission()}catch(e){}}  // iOS
  if(!started){started=true;await startCam();setMode(MODE);usbAuto();logEv(`Session started (${MODE})`)}
  keepAwake();uiSync();
};

// ================================================================ main loop
let lastT=performance.now();
function frame(ts){
  const dt=Math.min(.1,(ts-lastT)/1000),t=ts/1000;lastT=ts;
  orientStep();fpx=FPX();listenerStep();
  if(started){if(MODE==='hunt')huntStep(dt);if(staged())ghostStep(dt,trapDown);worldStep(dt);tempStep(dt);if(DEV==='ovilus')ovStep(t,dt)}
  const Lt=started?targetLevel():0,jitter=Lt>.05?(Math.random()-.5)*.08*Lt:0;L+=(Lt-L)*Math.min(1,dt*6);const level=clamp(L+jitter,0,1);
  if(AU.ctx){const C=AU.ctx;AU.master.gain.setTargetAtTime(CFG.vol,C.currentTime,.1);AU.dg.gain.setTargetAtTime(staged()?level*.2:0,C.currentTime,.15);AU.lp.frequency.setTargetAtTime(180+level*1300,C.currentTime,.2);
    if(devKind()==='cam'&&staged()&&Math.random()<(.2+level*level*30)*dt)click()}
  boxUpdate();
  const kind=devKind(),lens=lensOf();
  if(kind==='scope'){drawScope(t,dt,level);drawHUD(t,level,false)}
  else if(kind==='cam'){drawScene(t,level,lens);interference(level,t);crosshair(lens==='thermal'?spotTemp():undefined);if(lens==='thermal')thermalScale();
    if(G.scareT>0)drawFace(1.25+(.6-G.scareT)*1.2,clamp(G.scareT/.6,0,1),lens);drawHUD(t,level,true);drawTape()}
  else{drawScene(t,level,'color');cx.fillStyle='rgba(0,0,0,.35)';cx.fillRect(0,0,W,H);if(DS.melLight&&DEV==='mel'){cx.save();cx.globalCompositeOperation='multiply';cx.fillStyle='#ff3030';cx.fillRect(0,0,W,H);cx.restore()}
    interference(level*.7,t);
    ({k2:devK2,mel:devMel,rem:devRem,box:devBox_,ovilus:devOvilus,evp:devEVP}[DEV])(t,level,dt);
    if(G.scareT>0)drawFace(1.25+(.6-G.scareT)*1.2,clamp(G.scareT/.6,0,1),'color');drawHUD(t,level,false)}
  hwStep(level);
  if(ts-(frame.u||0)>1000){frame.u=ts;usbUI();if(!$('#start').hidden)renderHW()}
  requestAnimationFrame(frame);
}
resize();buildDock();buildCtl();uiSync();renderLog();pollHub();usbAuto();requestAnimationFrame(frame);
if('serviceWorker'in navigator&&location.protocol==='https:'&&/\.github\.io$/.test(location.hostname))navigator.serviceWorker.register('sw.js').catch(()=>{});
