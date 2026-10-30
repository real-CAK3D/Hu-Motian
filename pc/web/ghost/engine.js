// Ghost Hunter engine: sensors (fused orientation, GPS), the radar/hardware link, audio,
// and the world model (everything staged lives at a fixed place in the room around you).
'use strict';
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),D2R=Math.PI/180,rand=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
const wrap=a=>((a%360)+540)%360-180;  // -> [-180,180)
const pad=(n,w=2)=>String(n).padStart(w,'0');
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
// World frame: x = east, y = north, z = up, metres, origin at the phone. The floor is CAM_H below it.
const CAM_H=1.4;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len2=v=>Math.hypot(v[0],v[1]);
const headingOf=v=>(Math.atan2(v[0],v[1])/D2R+360)%360;
const atBearing=(b,d,z=0)=>[Math.sin(b*D2R)*d,Math.cos(b*D2R)*d,z];

// ================================================================ settings / session
const CFG={scares:store.get('gh.scares','1')==='1',vol:+store.get('gh.vol','0.8'),radarTrig:store.get('gh.radarTrig','1')==='1',
  voices:store.get('gh.voices','1')==='1',zoom:+store.get('gh.zoom','1'),units:store.get('gh.units','F')};
let MODE=store.get('gh.mode','ghost'),started=false,caps=+store.get('gh.caps','0');
const staged=()=>MODE!=='real';

// ================================================================ evidence log
const LOG=(()=>{try{return JSON.parse(store.get('gh.log','[]'))||[]}catch(e){return[]}})();
function logEv(txt){LOG.unshift({t:Date.now(),m:MODE,txt});if(LOG.length>300)LOG.pop();store.set('gh.log',JSON.stringify(LOG));if(window.renderLog)renderLog()}
function stamp(){const d=new Date();return`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)}

// ================================================================ orientation: gyro (smooth) + compass (true north)
// Chrome on Android sends a gyro-based relative stream ("deviceorientation") and a compass-referenced
// one ("deviceorientationabsolute"); iOS sends the relative one with webkitCompassHeading. Drawing uses
// the smooth relative stream, turned by a slowly-learned offset to north, so things don't swim when
// the compass twitches near metal, and don't drift either.
const O={ok:false,abs:false,h:0,pitch:0,R:[1,0,0],U:[0,0,1],F:[0,1,0],off:null,relB:null,relLast:0,absLast:0,dis:0,drag:0,dragP:0,dragged:false};
function basisFrom(al,be,ga){
  const a=al*D2R,b=be*D2R,g=ga*D2R,cA=Math.cos(a),sA=Math.sin(a),cB=Math.cos(b),sB=Math.sin(b),cG=Math.cos(g),sG=Math.sin(g);
  // columns of the W3C rotation matrix: the device's x (screen right), y (screen up), z (out of the screen) in world axes
  return{R:[cA*cG-sA*sB*sG,cG*sA+cA*sB*sG,-cB*sG],U:[-cB*sA,cA*cB,sB],F:[-(cG*sA*sB+cA*sG),-(sA*sG-cA*cG*sB),-(cB*cG)]};
}
const camHeading=B=>len2(B.F)>.35?headingOf(B.F):headingOf(B.U);
const rotZ=(v,deg)=>{const c=Math.cos(deg*D2R),s=Math.sin(deg*D2R);return[v[0]*c+v[1]*s,-v[0]*s+v[1]*c,v[2]]};
function northSample(hAbs){
  if(!O.relB)return;const tgt=wrap(hAbs-camHeading(O.relB));
  if(O.off==null){O.off=tgt;return}
  const d=wrap(tgt-O.off);
  if(Math.abs(d)>35){if(++O.dis>90){O.off=tgt;O.dis=0}return}  // a magnetic glitch, unless it persists ~1.5 s
  O.dis=0;O.off=wrap(O.off+d*.004);
}
function onRel(e){if(e.alpha==null)return;O.relB=basisFrom(e.alpha,e.beta||0,e.gamma||0);O.relLast=performance.now();if(e.webkitCompassHeading!=null){O.abs=true;northSample(e.webkitCompassHeading)}}
function onAbs(e){
  if(e.alpha==null)return;const B=basisFrom(e.alpha,e.beta||0,e.gamma||0),now=performance.now();O.absLast=now;O.abs=true;
  if(now-O.relLast>600){O.relB=B;O.off=0}  // no gyro stream: use the compass-referenced one directly
  else northSample(camHeading(B));
}
addEventListener('deviceorientation',e=>e.absolute?onAbs(e):onRel(e));
addEventListener('deviceorientationabsolute',onAbs);
function orientStep(){
  const now=performance.now(),live=O.relB&&now-Math.max(O.relLast,O.absLast)<1500;let R,U,F;
  if(live){const o=O.off||0;R=rotZ(O.relB.R,o);U=rotZ(O.relB.U,o);F=rotZ(O.relB.F,o);O.ok=true}
  else{O.ok=false;const h=O.drag*D2R,p=O.dragP*D2R;F=[Math.sin(h)*Math.cos(p),Math.cos(h)*Math.cos(p),Math.sin(p)];R=[Math.cos(h),-Math.sin(h),0];U=[-Math.sin(h)*Math.sin(p),-Math.cos(h)*Math.sin(p),Math.cos(p)]}
  const sa=((screen.orientation&&screen.orientation.angle)||window.orientation||0)*D2R;  // landscape: screen axes turn with the phone
  if(sa){const c=Math.cos(sa),s=Math.sin(sa),R2=R.map((v,i)=>v*c+U[i]*s),U2=R.map((v,i)=>-v*s+U[i]*c);R=R2;U=U2}
  O.R=R;O.U=U;O.F=F;O.h=camHeading({F,U});O.pitch=Math.asin(clamp(F[2],-1,1))/D2R;
}
const sensorsLive=()=>O.ok;

// ================================================================ GPS (Hunt)
const GPS={ok:false,lat:0,lon:0,acc:999,watch:null};
function startGPS(){
  if(GPS.watch!=null||!('geolocation'in navigator))return;
  GPS.watch=navigator.geolocation.watchPosition(p=>{
    const{latitude:la,longitude:lo,accuracy:ac}=p.coords;
    if(!GPS.ok||geoDist(GPS.lat,GPS.lon,la,lo)>Math.max(15,ac*2)){GPS.lat=la;GPS.lon=lo}  // first fix, or a real move: jump
    else{const k=ac<15?.5:.25;GPS.lat+=(la-GPS.lat)*k;GPS.lon+=(lo-GPS.lon)*k}  // otherwise smooth out GPS jitter
    GPS.acc=ac;GPS.ok=true},e=>{GPS.err=e.message||'GPS unavailable'},{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
}
function geoDist(la1,lo1,la2,lo2){const R=6371000,dLa=(la2-la1)*D2R,dLo=(lo2-lo1)*D2R,a=Math.sin(dLa/2)**2+Math.cos(la1*D2R)*Math.cos(la2*D2R)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(a))}
function geoBear(la1,lo1,la2,lo2){const y=Math.sin((lo2-lo1)*D2R)*Math.cos(la2*D2R),x=Math.cos(la1*D2R)*Math.sin(la2*D2R)-Math.sin(la1*D2R)*Math.cos(la2*D2R)*Math.cos((lo2-lo1)*D2R);return(Math.atan2(y,x)/D2R+360)%360}
function geoMove(la,lo,bear,m){const R=6371000,d=m/R,b=bear*D2R,p1=la*D2R,l1=lo*D2R,p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(b));
  return[p2/D2R,(l1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2)))/D2R]}

// ================================================================ link to the ESP32 (USB cable, or the PC hub)
// Reads radar + kit-sensor readings, and sends light/buzzer commands and hardware setup.
const RD={last:0,r:null,ms:-1,blips:[],lastLog:0,st:null,hwc:null,vib:0,vibT:0};
function onReading(r){
  const was=RD.r&&RD.r.s;RD.r=r;RD.last=Date.now();
  if(r.hw&&r.hw.vib){RD.vib+=r.hw.vib;RD.vibT=Date.now();if(MODE==='real')logEv(`Vibration sensor triggered (${r.hw.vib})`)}
  if(r.s&&r.ok!==false){const mv=!!(r.s&1),d=((mv?r.md:r.sd)||r.dd)/100,e=Math.max(mv?r.me:0,r.s&2?r.se:0);
    // anchor the hit in the world where the radar (and camera) pointed when it was detected
    RD.blips.push({p:O.F.map(v=>v*d),d,e,mv,t:Date.now()});
    while(RD.blips.length>900||(RD.blips.length&&Date.now()-RD.blips[0].t>40000))RD.blips.shift();
    if(MODE==='real'&&!was&&Date.now()-RD.lastLog>4000){RD.lastLog=Date.now();logEv(`Radar: ${mv?'moving':'still'} target ${d.toFixed(2)} m at ${Math.round(O.h)}°`)}}
}
const radarLive=()=>Date.now()-RD.last<1500;
const radarTarget=()=>{if(!radarLive()||!RD.r||!RD.r.s)return null;const r=RD.r,mv=!!(r.s&1);return{mv,d:((mv?r.md:r.sd)||r.dd)/100,e:Math.max(mv?r.me:0,r.s&2?r.se:0)}};
const kit=()=>radarLive()&&RD.r&&RD.r.hw||null;  // live kit-sensor values, if any are set up
const USB={on:false,busy:false,dev:null,port:null,close:null,write:null,waiters:[]};
const isAndroid=/Android/i.test(navigator.userAgent),canWebUSB='usb'in navigator,canSerial='serial'in navigator,canUSB=canWebUSB||canSerial;
const useWebUSB=()=>(isAndroid&&canWebUSB)||!canSerial;
function onLine(l){
  if(l[0]!=='{')return;let m;try{m=JSON.parse(l)}catch(e){return}
  if(m.t==='r')onReading(m);
  else if(m.t==='st'){RD.st=m;if(m.hwc)RD.hwc=m.hwc;if(window.renderHW)renderHW()}
  else if(m.t==='ack'){const w=USB.waiters.find(w=>w.c===m.cmd);if(w){USB.waiters.splice(USB.waiters.indexOf(w),1);clearTimeout(w.to);w.res(m)}}
}
function lineSplitter(){let buf='';return c=>{buf+=c;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i).trim();buf=buf.slice(i+1);onLine(l)}if(buf.length>16384)buf=''}}
async function openWebUSB(dev){  // CP210x driver, same as the dashboard's
  dev=dev||await navigator.usb.requestDevice({filters:[{vendorId:0x10C4}]});
  await dev.open();if(!dev.configuration)await dev.selectConfiguration(1);
  const itf=dev.configuration.interfaces[0],n=itf.interfaceNumber;await dev.claimInterface(n);
  const eps=itf.alternate.endpoints,epIn=eps.find(e=>e.direction==='in'&&e.type==='bulk').endpointNumber,epOut=eps.find(e=>e.direction==='out'&&e.type==='bulk').endpointNumber;
  const ctl=(request,value,data)=>dev.controlTransferOut({requestType:'vendor',recipient:'interface',request,value,index:n},data);
  await ctl(0x00,0x0001);await ctl(0x1E,0,new Uint32Array([115200]).buffer);await ctl(0x03,0x0800);await ctl(0x07,0x0300);  // enable, 115200 8N1, DTR/RTS off
  const enc=new TextEncoder(),dec=new TextDecoder(),feed=lineSplitter();USB.dev=dev;USB.on=true;USB.write=s=>dev.transferOut(epOut,enc.encode(s));
  USB.close=async()=>{try{await ctl(0x00,0)}catch(e){}try{await dev.close()}catch(e){}};
  (async()=>{try{while(USB.on){const r=await dev.transferIn(epIn,512);if(r.data&&r.data.byteLength)feed(dec.decode(r.data,{stream:true}))}}catch(e){}usbLost()})();
}
async function openSerial(port){
  port=port||await navigator.serial.requestPort({filters:[0x10C4,0x1A86,0x0403].map(v=>({usbVendorId:v}))});
  await port.open({baudRate:115200});try{await port.setSignals({dataTerminalReady:false,requestToSend:false})}catch(e){}
  const enc=new TextEncoder(),dec=new TextDecoderStream(),closed=port.readable.pipeTo(dec.writable).catch(()=>{}),reader=dec.readable.getReader(),feed=lineSplitter();
  USB.port=port;USB.on=true;USB.write=async s=>{const w=port.writable.getWriter();try{await w.write(enc.encode(s))}finally{w.releaseLock()}};
  USB.close=async()=>{try{await reader.cancel()}catch(e){}await closed;try{await port.close()}catch(e){}};
  (async()=>{try{for(;;){const{value,done}=await reader.read();if(done)break;feed(value)}}catch(e){}usbLost()})();
}
async function usbStart(open){if(USB.on||USB.busy)return;USB.busy=true;try{await open();say('Radar connected.');cmd('status')}catch(e){if(e&&e.name!=='NotFoundError')say('USB: '+(e.message||e),'warn')}finally{USB.busy=false;if(window.usbUI)usbUI()}}
async function usbAuto(){if(USB.on||!canUSB)return;try{
  if(useWebUSB()){const d=(await navigator.usb.getDevices()).find(d=>d.vendorId===0x10C4);if(d)await usbStart(()=>openWebUSB(d))}
  else{const p=(await navigator.serial.getPorts())[0];if(p)await usbStart(()=>openSerial(p))}}catch(e){}}
function usbLost(){if(!USB.on)return;USB.on=false;USB.dev=USB.port=null;USB.write=null;if(USB.close){const c=USB.close;USB.close=null;c()}
  for(const w of USB.waiters.splice(0)){clearTimeout(w.to);w.res({ok:false,msg:'unplugged'})}if(window.usbUI)usbUI();say('Radar unplugged.','warn')}
function usbConnect(){if(USB.on){USB.on=false;const c=USB.close;USB.close=null;USB.write=null;if(c)c();if(window.usbUI)usbUI();return}usbStart(()=>useWebUSB()?openWebUSB():openSerial())}
if(canWebUSB){navigator.usb.addEventListener('connect',()=>setTimeout(usbAuto,600));navigator.usb.addEventListener('disconnect',e=>{if(e.device===USB.dev)usbLost()})}
if(canSerial){navigator.serial.addEventListener('connect',()=>setTimeout(usbAuto,600));navigator.serial.addEventListener('disconnect',e=>{if(e.target===USB.port)usbLost()})}
const BASE=location.pathname.replace(/[^/]*$/,'');
let hubOK=false;
async function pollHub(){  // served by the PC hub (or Tailscale): read its /data like the dashboard does
  if(USB.on)return setTimeout(pollHub,2000);
  try{const j=await(await fetch(BASE+'data',{cache:'no-store'})).json();hubOK=true;if(j.st){RD.st=j.st;if(j.st.hwc)RD.hwc=j.st.hwc}if(j.r&&j.r.ms!==RD.ms){RD.ms=j.r.ms;onReading(j.r)}setTimeout(pollHub,110)}
  catch(e){hubOK=false;setTimeout(pollHub,4000)}
}
const canSend=()=>(USB.on&&USB.write)||hubOK;
// Send a command; resolves with the firmware's ack.
function cmd(c){
  c=c.trim().replace(/"/g,"'").replace(/\\/g,'/').slice(0,120);
  if(USB.on&&USB.write)return new Promise(res=>{const w={c,res};USB.waiters.push(w);w.to=setTimeout(()=>{const i=USB.waiters.indexOf(w);if(i>=0)USB.waiters.splice(i,1);res({ok:false,msg:'no reply'})},4000);USB.write(c+'\n').catch(()=>{})});
  if(hubOK)return fetch(BASE+'cmd?c='+encodeURIComponent(c),{cache:'no-store'}).then(r=>r.json()).catch(()=>({ok:false}));
  return Promise.resolve({ok:false,msg:'radar not connected'});
}
// Live lights/buzzer: fire-and-forget, rate limited, repeats suppressed (the board holds app control for 4 s).
const HWO={last:'',t:0};
function hwOut(c,force){const now=performance.now();if(!canSend())return;if(!force&&(now-HWO.t<180||(c===HWO.last&&now-HWO.t<1500)))return;HWO.last=c;HWO.t=now;
  if(USB.on&&USB.write)USB.write(c+'\n').catch(()=>{});else cmd(c)}

// ================================================================ audio (all synthesized; ghost sounds are positioned in 3D)
const AU={ctx:null};
function auInit(){
  if(AU.ctx)return;const C=new(window.AudioContext||window.webkitAudioContext)();AU.ctx=C;
  AU.master=C.createGain();AU.master.gain.value=CFG.vol;AU.master.connect(C.destination);
  AU.lp=C.createBiquadFilter();AU.lp.type='lowpass';AU.lp.frequency.value=300;AU.lp.Q.value=8;  // low, uneasy room tone
  AU.dg=C.createGain();AU.dg.gain.value=0;AU.lp.connect(AU.dg);AU.dg.connect(AU.master);
  for(const f of[55,55.8,82.6]){const o=C.createOscillator();o.type='sawtooth';o.frequency.value=f;const g=C.createGain();g.gain.value=.33;o.connect(g);g.connect(AU.lp);o.start()}
  const lfo=C.createOscillator(),lg=C.createGain();lfo.frequency.value=.31;lg.gain.value=120;lfo.connect(lg);lg.connect(AU.lp.frequency);lfo.start();
  const n=C.sampleRate*2,buf=C.createBuffer(1,n,C.sampleRate),d=buf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;AU.noise=buf;
}
// world (east, north, up) -> Web Audio (x right, y up, z towards the listener)
const toAudio=p=>[p[0],p[2],-p[1]];
function setAP(param,v,t){if(param)param.setValueAtTime(v,t)}
function listenerStep(){
  if(!AU.ctx)return;const L=AU.ctx.listener,t=AU.ctx.currentTime,f=toAudio(O.F),u=toAudio(O.U);
  if(L.forwardX){setAP(L.forwardX,f[0],t);setAP(L.forwardY,f[1],t);setAP(L.forwardZ,f[2],t);setAP(L.upX,u[0],t);setAP(L.upY,u[1],t);setAP(L.upZ,u[2],t)}
  else if(L.setOrientation)L.setOrientation(f[0],f[1],f[2],u[0],u[1],u[2]);
}
function at(p){  // a panner at a world position; connect a sound into it
  const C=AU.ctx,pn=C.createPanner();pn.panningModel='HRTF';pn.distanceModel='inverse';pn.refDistance=1.2;pn.rolloffFactor=1;const a=toAudio(p);
  if(pn.positionX){pn.positionX.value=a[0];pn.positionY.value=a[1];pn.positionZ.value=a[2]}else pn.setPosition(a[0],a[1],a[2]);
  pn.connect(AU.master);return pn;
}
function noiseHit(dur,gain,type,freq,when,flat,dest){const C=AU.ctx;if(!C)return;const t=when||C.currentTime,s=C.createBufferSource(),f=C.createBiquadFilter(),g=C.createGain();
  s.buffer=AU.noise;s.loop=true;f.type=type;f.frequency.value=freq;
  if(flat){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.005);g.gain.setValueAtTime(gain,t+Math.max(.006,dur-.01));g.gain.linearRampToValueAtTime(0,t+dur)}
  else{g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur)}
  s.connect(f);f.connect(g);g.connect(dest||AU.master);s.start(t,Math.random()*1.5);s.stop(t+dur+.02);return{f,g,t}}
function tone(freq,dur,gain=.2,type='sine',when,dest){const C=AU.ctx;if(!C)return;const t=when||C.currentTime,o=C.createOscillator(),g=C.createGain();o.type=type;o.frequency.value=freq;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.005);g.gain.setValueAtTime(gain,t+dur-.01);g.gain.linearRampToValueAtTime(0,t+dur);o.connect(g);g.connect(dest||AU.master);o.start(t);o.stop(t+dur+.01);return o}
const click=()=>noiseHit(.012,.3,'highpass',2500);
function whoosh(dur=.9,p){const h=noiseHit(dur,.5,'bandpass',300,0,false,p&&AU.ctx?at(p):null);if(h){h.f.frequency.setValueAtTime(250,h.t);h.f.frequency.exponentialRampToValueAtTime(3200,h.t+dur*.6);h.f.Q.value=2}}
function footstep(p,heavy=1){const C=AU.ctx;if(!C)return;const dst=at(p),t=C.currentTime;noiseHit(.09,.9*heavy,'lowpass',260,t,false,dst);noiseHit(.03,.25*heavy,'bandpass',1400,t+.01,false,dst)}
function knock(p,n=3){const C=AU.ctx;if(!C)return;const dst=at(p);for(let i=0;i<n;i++){const t=C.currentTime+i*rand(.28,.42),o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(55,t+.12);
  g.gain.setValueAtTime(1.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g);g.connect(dst);o.start(t);o.stop(t+.2);noiseHit(.05,.6,'lowpass',900,t,false,dst)}}
function whisper(p,dur=rand(.9,1.6)){  // breathy, unintelligible: noise through moving vowel formants
  const C=AU.ctx;if(!C)return;const dst=at(p),t=C.currentTime,s=C.createBufferSource();s.buffer=AU.noise;s.loop=true;const g=C.createGain();g.gain.value=0;
  for(const[q,mul]of[[7,1],[9,.7]]){const f=C.createBiquadFilter();f.type='bandpass';f.Q.value=q;let tt=t;while(tt<t+dur){const F=pick([[300,870],[270,2290],[730,1090],[520,1190],[440,1020]]);f.frequency.setValueAtTime(F[mul===1?0:1],tt);tt+=rand(.12,.25)}s.connect(f);f.connect(g)}
  let tt=t;while(tt<t+dur){const sy=rand(.12,.24);g.gain.setValueAtTime(0,tt);g.gain.linearRampToValueAtTime(rand(.5,1),tt+sy*.4);g.gain.linearRampToValueAtTime(0,tt+sy);tt+=sy+rand(0,.08)}
  g.connect(dst);s.start(t,Math.random());s.stop(t+dur+.1);
}
function growl(p){const C=AU.ctx;if(!C)return;const dst=at(p),t=C.currentTime,o=C.createOscillator(),ws=C.createWaveShaper(),g=C.createGain(),cv=new Float32Array(512);for(let i=0;i<512;i++){const x=i/256-1;cv[i]=Math.tanh(x*8)}ws.curve=cv;
  o.type='sawtooth';o.frequency.setValueAtTime(62,t);o.frequency.linearRampToValueAtTime(48,t+1.2);const l=C.createOscillator(),lg=C.createGain();l.frequency.value=9;lg.gain.value=14;l.connect(lg);lg.connect(o.frequency);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.5,t+.2);g.gain.linearRampToValueAtTime(0,t+1.3);o.connect(ws);ws.connect(g);g.connect(dst);o.start(t);l.start(t);o.stop(t+1.4);l.stop(t+1.4)}
function scream(){const C=AU.ctx;if(!C)return;const t=C.currentTime;
  const b=C.createOscillator(),bg=C.createGain();b.frequency.setValueAtTime(70,t);b.frequency.exponentialRampToValueAtTime(28,t+.7);bg.gain.setValueAtTime(1,t);bg.gain.exponentialRampToValueAtTime(.001,t+.9);b.connect(bg);bg.connect(AU.master);b.start(t);b.stop(t+.95);
  const h=noiseHit(1.4,1,'bandpass',1500,t,true);if(h){h.f.Q.value=7;h.f.frequency.setValueAtTime(900,t);h.f.frequency.exponentialRampToValueAtTime(3400,t+.25);h.f.frequency.exponentialRampToValueAtTime(1200,t+1.3)}
  const ws=C.createWaveShaper(),curve=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/512-1;curve[i]=Math.tanh(x*5)}ws.curve=curve;
  const g=C.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.55,t+.04);g.gain.setValueAtTime(.55,t+.6);g.gain.exponentialRampToValueAtTime(.0001,t+1.4);ws.connect(g);g.connect(AU.master);
  for(const[f0,f1,f2]of[[420,1250,260],[436,1310,250]]){const o=C.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+.2);o.frequency.exponentialRampToValueAtTime(f2,t+1.3);
    const v=C.createOscillator(),vg=C.createGain();v.frequency.value=17;vg.gain.value=f1*.05;v.connect(vg);vg.connect(o.frequency);v.start(t);v.stop(t+1.4);o.connect(ws);o.start(t);o.stop(t+1.4)}
}
function zap(){const C=AU.ctx;if(!C)return;const t=C.currentTime,o=C.createOscillator(),g=C.createGain();o.type='square';
  o.frequency.setValueAtTime(1800,t);o.frequency.exponentialRampToValueAtTime(90,t+1.1);g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.0001,t+1.2);
  o.connect(g);g.connect(AU.master);o.start(t);o.stop(t+1.25);noiseHit(1.1,.35,'highpass',4000)}
const buzz=p=>{try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}};

// ================================================================ world: the staged haunting
// The apparition (G), cold spots, free orbs and shadow passes all have world positions and keep
// moving whether or not you're looking at them.
const WORLD={cold:[],orbs:[],shadows:[],nextOrb:8,nextShadow:rand(30,55)};
const G={state:'idle',wait:3,p:[0,6,0],v:[0,0,0],vis:0,age:0,charge:0,aimT:0,hold:0,trapT:0,scareT:0,cool:0,warned:false,knocked:false,dart:null,coldT:0,stepT:0,whisperT:4,lurkT:0};
const gDist=()=>len2(G.p),gBear=()=>headingOf(G.p);
const active=()=>G.state==='near'||G.state==='charge'||G.state==='lurk';
let inViewFn=()=>false;  // set by the view (depends on the camera's field of view)
let say=()=>{};          // set by the view
function spawnGhost(bear,dist){
  Object.assign(G,{state:'near',p:atBearing(bear,dist),v:[0,0,0],vis:0,age:0,aimT:0,hold:0,warned:false,knocked:false,dart:null,coldT:1,stepT:0,whisperT:rand(4,9)});
  say(MODE==='hunt'?'It\'s here. Look around…':'EMF fluctuation detected… sweep slowly.');logEv(`EMF spike detected at ${Math.round(bear%360+360)%360}°`);
}
function startCharge(why){if(!active()||G.state==='charge')return;G.state='charge';G.charge=0;say(why||'IT\'S COMING!','alert');growl(G.p);whoosh(1.1,G.p);logEv('Apparition approached rapidly')}
const towardMe=(p,s)=>{const d=len2(p)||1;return[-p[0]/d*s,-p[1]/d*s,0]};
function ghostStep(dt,trapDown){
  const d=gDist(),seen=inViewFn([G.p[0],G.p[1],-.4]),sp=Math.hypot(G.v[0],G.v[1]);
  if(G.state==='idle'){G.wait-=dt;if(G.wait<=0&&MODE==='ghost')spawnGhost(O.h+rand(-160,160),rand(6.5,8.5))}
  else if(G.state==='near'||G.state==='lurk'){
    G.age+=dt;
    if(G.dart){  // relocating fast along a real path
      const dx=G.dart[0]-G.p[0],dy=G.dart[1]-G.p[1],dd=Math.hypot(dx,dy);
      if(dd<.2)G.dart=null;else{const s=3.4;G.v=[dx/dd*s,dy/dd*s,0]}
    }else if(G.state==='lurk'){G.v=[0,0,0]}
    else{const u=towardMe(G.p,.12+(seen?.24:0)),w=[-u[1]/(Math.hypot(u[0],u[1])||1),u[0]/(Math.hypot(u[0],u[1])||1)],lat=Math.sin(G.age*.55)*.35;G.v=[u[0]+w[0]*lat,u[1]+w[1]*lat,0]}
    G.p[0]+=G.v[0]*dt;G.p[1]+=G.v[1]*dt;
    if(len2(G.p)<1.3){const k=1.3/len2(G.p);G.p[0]*=k;G.p[1]*=k}
    const tv=seen&&!G.dart?clamp(1.3-d/7,0,1):G.dart?.3:0;G.vis+=(tv-G.vis)*Math.min(1,dt*1.5);
    G.aimT=seen?G.aimT+dt:0;
    G.stepT-=dt;if(sp>.25&&G.stepT<=0){G.stepT=G.dart?.28:.62;footstep([G.p[0],G.p[1],-CAM_H],G.dart?.8:.5)}
    G.coldT-=dt;if(G.coldT<=0&&!G.dart){G.coldT=rand(3,5);WORLD.cold.push({p:[G.p[0],G.p[1],-.5],r:rand(.6,.9),s:1,v:[rand(-.05,.05),rand(-.05,.05),0]});if(WORLD.cold.length>14)WORLD.cold.shift()}
    G.whisperT-=dt;if(G.whisperT<=0&&d<6){G.whisperT=rand(7,13);whisper([G.p[0],G.p[1],.2])}
    if(!G.knocked&&G.age>6&&Math.random()<dt*.15){G.knocked=true;const wall=atBearing(gBear(),d+1.2,-.2);knock(wall,3);say('Did you hear that?','warn');logEv(`Three knocks from ${Math.round(gBear())}°`)}
    if(G.state==='near'){
      if(G.aimT>3.5&&d>2.6&&!G.dart&&Math.random()<dt*.5){G.dart=atBearing(gBear()+(Math.random()<.5?-1:1)*rand(40,80),clamp(d+rand(-.5,1),2.5,8));G.aimT=0;whoosh(.7,G.p);say('It moved. Find it again.','warn');logEv('Apparition relocated')}
      if(d<2.4&&seen)startCharge();
      else if(G.age>50){if(seen)startCharge('Behind you…');else{G.state='lurk';G.lurkT=0;say('…behind you.','warn');whisper([G.p[0],G.p[1],.2],1.8)}}
      else if(CFG.radarTrig&&radarLive()&&RD.r&&RD.r.s&1&&RD.r.md<300&&G.age>4)startCharge('Something moved!');
      if(d<4.2&&!G.warned){G.warned=true;say('Strong readings. It\'s close…','warn');logEv('EMF 5/5, cold spot forming')}
    }else{G.lurkT+=dt;if(seen||G.lurkT>20)startCharge(seen?'THERE!':null)}  // it waits behind you until you turn
  }
  else if(G.state==='charge'){
    G.charge+=dt;const s=1+G.charge*G.charge*14;G.v=towardMe(G.p,s);G.p[0]+=G.v[0]*dt;G.p[1]+=G.v[1]*dt;G.vis=1;
    G.stepT-=dt;if(G.stepT<=0){G.stepT=.16;footstep([G.p[0],G.p[1],-CAM_H],1)}
    if(len2(G.p)<.35||G.charge>3){G.state='gone';G.cool=rand(8,16);G.warned=false;
      if(CFG.scares){G.scareT=.6;scream();buzz([300,60,500,60,250]);if(window.scareFX)scareFX();hwOut('fx scare 1600',true)}
      else whoosh(.8);
      say('…it\'s gone.','warn');logEv('Contact. Readings dropped to zero')}
  }
  else if(G.state==='trapped'){G.trapT+=dt;if(G.trapT>1.3){G.state='gone';G.cool=rand(5,12)}}
  else if(G.state==='gone'){G.cool-=dt;if(G.cool<=0){G.state='idle';G.wait=rand(3,8);if(MODE==='hunt')hunt.respawn=true;if(MODE==='ghost')say('Monitoring… quiet for now.')}}
  if(G.scareT>0)G.scareT-=dt;
  // trap: hold while it's in your sights and close
  const can=(G.state==='near'||G.state==='lurk'||(G.state==='charge'&&G.charge<.5))&&seen&&d<5;
  if(trapDown&&can){G.hold+=dt;if(G.hold>=1.3){G.state='trapped';G.trapT=0;G.hold=0;G.dart=null;caps++;store.set('gh.caps',caps);zap();buzz([60,40,60,40,200]);hwOut('fx pulse 1500 0 140 255',true);say(`Entity contained (${caps} total)`);logEv(`Entity contained (#${caps})`)}}
  else G.hold=Math.max(0,G.hold-dt*2);
}
function worldStep(dt){
  for(const c of WORLD.cold){c.p[0]+=c.v[0]*dt;c.p[1]+=c.v[1]*dt;c.s*=Math.exp(-dt/95)}
  WORLD.cold=WORLD.cold.filter(c=>c.s>.05);
  for(const o of WORLD.orbs){o.p[0]+=o.v[0]*dt;o.p[1]+=o.v[1]*dt;o.p[2]+=o.v[2]*dt;o.age+=dt}
  WORLD.orbs=WORLD.orbs.filter(o=>o.age<o.life);
  WORLD.shadows=WORLD.shadows.filter(s=>performance.now()-s.t0<s.dur*1000+200);
  if(MODE!=='ghost'||G.state==='idle')return;
  WORLD.nextOrb-=dt;if(WORLD.nextOrb<=0){WORLD.nextOrb=rand(7,16);const b=rand(0,360),dd=rand(1.5,4);
    WORLD.orbs.push({p:atBearing(b,dd,rand(-.8,.9)),v:[rand(-.25,.25),rand(-.25,.25),rand(-.06,.08)],age:0,life:rand(5,11),r:rand(.025,.05)})}
  WORLD.nextShadow-=dt;if(WORLD.nextShadow<=0&&G.state==='near'&&!G.dart){WORLD.nextShadow=rand(35,70);const b=rand(0,360),dd=rand(3,5),b2=b+(Math.random()<.5?-1:1)*rand(50,90);
    const s={a:atBearing(b,dd),b:atBearing(b2,dd),t0:performance.now(),dur:rand(1.2,1.8),seen:false};WORLD.shadows.push(s);
    for(let i=0;i<5;i++)setTimeout(()=>{const k=i/5;footstep([s.a[0]+(s.b[0]-s.a[0])*k,s.a[1]+(s.b[1]-s.a[1])*k,-CAM_H],.7)},i*s.dur*200)}
}
const shadowPos=s=>{const k=clamp((performance.now()-s.t0)/(s.dur*1000),0,1);return[s.a[0]+(s.b[0]-s.a[0])*k,s.a[1]+(s.b[1]-s.a[1])*k]};

// ================================================================ hunt (GPS chase outdoors)
const hunt={lat:null,lon:null,dir:0,fleeT:0,fled:false,respawn:true,dist:null,bear:null};
function huntStep(dt){
  if(!GPS.ok){hunt.dist=null;return}
  if(hunt.respawn||hunt.lat==null){
    if(GPS.acc>40)return;
    const b=rand(0,360),m=rand(45,95);[hunt.lat,hunt.lon]=geoMove(GPS.lat,GPS.lon,b,m);hunt.dir=rand(0,360);hunt.fled=false;hunt.fleeT=0;hunt.respawn=false;
    G.state='idle';G.wait=1e9;say(`Faint readings ${Math.round(m)} m away. Follow the arrow.`);logEv(`Hunt: readings ${Math.round(m)} m away`);
  }
  hunt.dist=geoDist(GPS.lat,GPS.lon,hunt.lat,hunt.lon);hunt.bear=geoBear(GPS.lat,GPS.lon,hunt.lat,hunt.lon);
  if(G.state!=='idle')return;
  if(hunt.fleeT>0){hunt.fleeT-=dt;hunt.dir=hunt.bear+rand(-20,20)}
  else{hunt.dir+=rand(-40,40)*dt;if(!hunt.fled&&hunt.dist<28){hunt.fled=true;if(Math.random()<.5){hunt.fleeT=12;say('It\'s moving away! Follow it!','alert');whoosh(1.2);logEv('Hunt: target moving away')}}}
  [hunt.lat,hunt.lon]=geoMove(hunt.lat,hunt.lon,hunt.dir,(hunt.fleeT>0?1.7:.35)*dt);
  if(hunt.dist<9)spawnGhost(hunt.bear,Math.min(7,hunt.dist+2));
}

// ================================================================ readings: EMF level, temperature
const beam=(diff,w)=>.15+.85*Math.exp(-((diff/w)**2));
let L=0;  // smoothed 0-1 field strength the meters show
function targetLevel(){
  if(MODE==='real'){
    const k=kit();if(k&&k.hd!=null)return clamp(Math.abs(k.hd)/120,0,1);  // real magnetic field from the Hall sensor
    const t=radarTarget();if(!t)return .02;return clamp(t.e/100*1.25,0,1)*(.45+.55*clamp(1-t.d/6,0,1));
  }
  if(G.state==='charge')return 1;
  if(G.state==='near'||G.state==='lurk')return clamp(Math.pow(clamp(1-gDist()/9,0,1),.8)*beam(Math.abs(wrap(gBear()-O.h)),38)*1.15,0,1);
  if(MODE==='hunt'&&hunt.dist!=null)return clamp(Math.pow(clamp(1-hunt.dist/130,0,1),1.4)*beam(Math.abs(wrap(hunt.bear-O.h)),55),0,.9);
  return .03;
}
const levelSource=()=>MODE!=='real'?'staged':kit()&&kit().hd!=null?'Hall sensor':'radar return';
const mG=lv=>.1+Math.pow(lv,1.6)*26;
const TEMP={base:rand(20.4,21.8),amb:null};
function tempAt(p){  // staged temperature field: room temperature minus cold spots and the apparition itself
  let t=TEMP.base;for(const c of WORLD.cold){const dx=p[0]-c.p[0],dy=p[1]-c.p[1],dz=p[2]-c.p[2];t-=c.s*7*Math.exp(-(dx*dx+dy*dy+dz*dz)/(c.r*c.r))}
  if(active()){const dx=p[0]-G.p[0],dy=p[1]-G.p[1],dz=p[2]+.4;t-=G.vis*5*Math.exp(-(dx*dx+dy*dy)/.25-dz*dz/1.2)}
  return t;
}
function realTemp(){const k=kit();return k&&k.tc!=null?k.tc:null}
function tempStep(dt){
  if(!staged()){TEMP.amb=realTemp();return}
  TEMP.base+=(Math.random()-.5)*.02*dt;const tgt=tempAt([0,0,0])+(Math.random()-.5)*.06;TEMP.amb=TEMP.amb==null?tgt:TEMP.amb+(tgt-TEMP.amb)*Math.min(1,dt*.8);
}
function spotTemp(){  // what an IR thermometer aimed straight ahead reads: the coldest surface along the line of sight
  if(!staged())return realTemp();let m=99;for(let k=.6;k<=7;k+=.3)m=Math.min(m,tempAt(O.F.map(v=>v*k)));return m;
}
const fmtT=c=>c==null?'--':CFG.units==='F'?(c*9/5+32).toFixed(1)+'°F':c.toFixed(1)+'°C';
