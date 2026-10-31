// Ghost Hunter "Bust" mode: be a paranormal exterminator. Wrangle ghosts with a particle-thrower beam,
// weaken them, drag them over a trap you've slid onto the floor, and get paid. Also: the ghost meter,
// slime trails, scorch marks, getting slimed, callout jobs on the map, rank, and the kit's lights/buzzer.
'use strict';
const BUST=(()=>{
  const B={fire:false,lock:false,heat:0,vent:0,hp:1,spec:null,thrT:0,thr:0,scorch:[],scorchT:0,trap:null,slime:0,slimeDrops:[],spits:[],spitT:rand(8,14),
    beamAu:null,pkeAu:null,meterT:0,hwT:0,vibT:0,lastAim:null,slimed:0,lastDrop:null,beepT:0};
  const BS=(()=>{const d=DB.bust=DB.bust||{};d.cash=d.cash||0;d.jobs=d.jobs||[];d.damage=d.damage||0;d.paid=d.paid||[];d.haul=d.haul||0;return d})();
  const RANKS=[[0,'Trainee'],[1,'Rookie'],[5,'Buster'],[15,'Senior Buster'],[30,'Spook Specialist'],[60,'Chief of Containment']];
  const bustCaps=()=>DB.ghosts.filter(g=>g.state==='captured'&&g.bust).length;
  const rank=()=>{const n=bustCaps();let r=RANKS[0],next=null;for(const x of RANKS){if(n>=x[0])r=x;else{next=x;break}}return{name:r[1],n,next}};
  const money=n=>'$'+Math.round(n).toLocaleString();
  const on=()=>MODE==='bust'&&started;
  const ghostTop=()=>{const T=T_();return[G.p[0],G.p[1],-CAM_H+G.lift+(T.look.h||1.7)*.6]};
  const angTo=p=>{const n=Math.hypot(p[0],p[1],p[2])||1;return Math.acos(clamp(dot(p,O.F)/n,-1,1))/D2R};
  // where the aim ray meets the floor (if you're pointing down at it)
  function aimFloor(){if(O.F[2]>-.12)return null;const k=CAM_H/-O.F[2],x=O.F[0]*k,y=O.F[1]*k,d=Math.hypot(x,y);if(d<.5||d>7)return null;return[x,y]}

  // ---------------------------------------------------------------- sound
  function beamSound(onNow){
    if(!AU.ctx)return;const C=AU.ctx;
    if(onNow&&!B.beamAu){const g=C.createGain();g.gain.value=0;g.connect(AU.master);
      const n=C.createBufferSource();n.buffer=AU.noise;n.loop=true;const bp=C.createBiquadFilter();bp.type='bandpass';bp.frequency.value=900;bp.Q.value=.9;n.connect(bp);bp.connect(g);
      const ws=C.createWaveShaper(),cv=new Float32Array(512);for(let i=0;i<512;i++){const x=i/256-1;cv[i]=Math.tanh(x*6)}ws.curve=cv;const og=C.createGain();og.gain.value=.25;ws.connect(og);og.connect(g);
      const os=[110,166,55.5].map(f=>{const o=C.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(ws);o.start();return o});n.start();
      g.gain.setTargetAtTime(.55,C.currentTime,.05);B.beamAu={g,n,os,bp,og};tone(1800,.12,.25,'square')}
    if(!onNow&&B.beamAu){const a=B.beamAu;B.beamAu=null;a.g.gain.setTargetAtTime(0,C.currentTime,.06);setTimeout(()=>{a.n.stop();a.os.forEach(o=>o.stop());a.g.disconnect()},400);noiseHit(.35,.3,'highpass',2500)}
    if(B.beamAu){const a=B.beamAu,t=C.currentTime;a.bp.frequency.setTargetAtTime(600+Math.random()*1400+B.heat*900,t,.02);a.og.gain.setTargetAtTime(.15+Math.random()*.25,t,.01);a.os[0].frequency.setTargetAtTime(110+B.heat*60+(B.lock?rand(-15,15):0),t,.03)}
  }
  function pkeSound(level,onNow){
    if(!AU.ctx)return;const C=AU.ctx;
    if(!B.pkeAu){const o=C.createOscillator(),g=C.createGain(),l=C.createOscillator(),lg=C.createGain();o.type='triangle';g.gain.value=0;l.frequency.value=7;lg.gain.value=30;l.connect(lg);lg.connect(o.frequency);o.connect(g);g.connect(AU.master);o.start();l.start();B.pkeAu={o,g,l}}
    const t=C.currentTime;B.pkeAu.g.gain.setTargetAtTime(onNow?.03+level*.12:0,t,.08);B.pkeAu.o.frequency.setTargetAtTime(300+level*level*1700,t,.08);B.pkeAu.l.frequency.setTargetAtTime(4+level*14,t,.1);
  }
  function powerUp(){if(!AU.ctx)return;const C=AU.ctx,t=C.currentTime,o=C.createOscillator(),g=C.createGain();o.type='sawtooth';o.frequency.setValueAtTime(90,t);o.frequency.exponentialRampToValueAtTime(1600,t+1.4);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.18,t+.3);g.gain.linearRampToValueAtTime(0,t+1.6);o.connect(g);g.connect(AU.master);o.start(t);o.stop(t+1.7);for(let i=0;i<3;i++)tone(900+i*300,.07,.15,'square',t+1.45+i*.09)}
  const splat=()=>{noiseHit(.25,.9,'lowpass',500);noiseHit(.5,.35,'bandpass',300)};
  const clank=()=>{bang([O.F[0],O.F[1],-1]);tone(320,.15,.2,'square');tone(180,.25,.15,'square',AU.ctx&&AU.ctx.currentTime+.05)};

  // ---------------------------------------------------------------- per frame
  function step(dt,fireDown){
    pkeSound(L,started&&DEV==='pke');
    if(!on()){if(B.fire)stopFire();B.lock=false;return}
    if(G.spec!==B.spec){B.spec=G.spec;B.hp=1;B.lock=false}
    // the pack: heat while you fire, vents when it overheats
    if(B.vent>0){B.vent-=dt;if(B.vent<=0){B.heat=0;say('Pack ready.')}}
    const want=fireDown&&B.vent<=0;
    if(want&&!B.fire){B.fire=true;auInit();logEv('Particle thrower fired')}else if(!want&&B.fire)stopFire();
    beamSound(B.fire);
    if(B.fire){B.heat=Math.min(1,B.heat+dt/(B.lock&&B.hp<=0?16:7.5));if(B.heat>=1)overheat();else if(B.heat>.8&&AU.ctx&&AU.ctx.currentTime-B.beepT>.25){B.beepT=AU.ctx.currentTime;tone(2400,.06,.15,'square')}}
    else B.heat=Math.max(0,B.heat-dt/(B.vent>0?1.5:4));
    // locking on: the beam has to be on it, and stay on it while it thrashes
    if(active()&&G.spec){
      const a=angTo([G.p[0],G.p[1],ghostTop()[2]]),d=gDist(),lim=B.lock&&B.hp<=0?181:Math.max(5,Math.atan(.45/d)/D2R)*(B.lock?2:1);  // a weakened ghost is on a leash
      if(B.fire&&a<lim&&G.state==='active'){if(!B.lock){B.lock=true;say(B.hp>0?'LOCKED ON! Keep it in the stream!':'Got it. Drag it over the trap.','alert');whoosh(.5,G.p);logEv(`Beam locked on ${nm()}`)}}
      else if(B.lock){B.lock=false;if(B.fire&&a>=lim){say('It broke the stream!','alert');G.anger=Math.min(100,G.anger+6);logEv(`${nm()} broke free of the beam`)}}
    }else B.lock=false;
    if(B.lock){G.vis=Math.max(G.vis,.85);B.hp=Math.max(0,B.hp-dt/(3+G.spec.level*.7+G.anger*.02));
      if(B.hp<=0&&!B.weakSaid){B.weakSaid=true;say(B.trap?'WEAKENED! Drag it over the trap!':'WEAKENED! Throw the trap!','alert');tone(660,.15,.3,'square');tone(990,.2,.3,'square',AU.ctx.currentTime+.15)}
      if(performance.now()-B.vibT>140){B.vibT=performance.now();buzz(B.hp>0?35:15)}}
    else if(B.spec&&B.hp<1&&!B.fire)B.hp=Math.min(1,B.hp+dt/30);
    if(B.hp>0)B.weakSaid=false;
    // misses scorch the walls
    if(B.fire&&!B.lock){B.scorchT-=dt;if(B.scorchT<=0){B.scorchT=.12;const p=O.F.map(v=>v*3.4+rand(-.05,.05)),near=B.scorch.find(s=>Math.hypot(s.p[0]-p[0],s.p[1]-p[1],s.p[2]-p[2])<.4);
      if(!near){B.scorch.push({p,t:performance.now(),r:rand(.18,.3)});if(B.scorch.length>80)B.scorch.shift();BS.damage+=25;B.sessDmg=(B.sessDmg||0)+25;saveDB()}else near.t=performance.now()}}
    trapStep(dt);slimeStep(dt);
  }
  function stopFire(){B.fire=false;B.lock=false;beamSound(false)}
  function overheat(){stopFire();B.vent=3;say('OVERHEAT! Venting…','alert');noiseHit(2.2,.5,'highpass',1800);logEv('Particle thrower overheated');hwOut('fx strobe 900 255 80 0',true)}
  // the ghost while it's held in the beam: it thrashes about, and once weakened you can drag it
  function wrangle(dt){
    const d=gDist(),spec=G.spec;G.v=[0,0,0];G.pose=B.hp>0?'scream':'float';
    if(B.hp>0){B.thrT-=dt;if(B.thrT<=0){B.thrT=rand(.35,1);B.thr=(Math.random()<.5?-1:1)*rand(10,24+spec.level*4)*(1+G.anger/150);
        if(Math.random()<.12+G.anger/600){B.thr*=2.6;whoosh(.4,G.p)}}
      const a=B.thr*dt*D2R,c=Math.cos(a),s=Math.sin(a),x=G.p[0]*c-G.p[1]*s,y=G.p[0]*s+G.p[1]*c,nd=clamp(d+rand(-.6,.6)*dt*3,1.6,7),k=nd/Math.hypot(x,y);G.p=[x*k,y*k,0];
      G.lift+=(rand(.1,.6)-G.lift)*dt;G.anger=Math.min(100,G.anger+dt*2)}
    else{  // weakened: it goes where the beam points
      const f=aimFloor(),tg=f||[O.F[0]/Math.hypot(O.F[0],O.F[1])*d,O.F[1]/Math.hypot(O.F[0],O.F[1])*d],dx=tg[0]-G.p[0],dy=tg[1]-G.p[1],m=Math.hypot(dx,dy);
      if(m>.02){const v=Math.min(m,2.2*dt)/m;G.p[0]+=dx*v;G.p[1]+=dy*v}G.lift+=(.25-G.lift)*dt*2;
      if(B.trap&&B.trap.st==='set'&&Math.hypot(G.p[0]-B.trap.p[0],G.p[1]-B.trap.p[1])<.7)openTrap()}
  }

  // ---------------------------------------------------------------- the trap
  function throwTrap(){
    auInit();
    if(B.trap&&(B.trap.st==='full'||B.trap.st==='set')){if(B.trap.st==='full'){BS.haul++;say('Trap emptied into containment.');logEv('Trap emptied into containment')}else say('Trap picked up.');B.trap=null;clank();ui();return}
    if(B.trap)return;const f=aimFloor(),dir=Math.hypot(O.F[0],O.F[1])>.1?[O.F[0]/Math.hypot(O.F[0],O.F[1]),O.F[1]/Math.hypot(O.F[0],O.F[1])]:[0,1],to=f||[dir[0]*1.8,dir[1]*1.8];
    B.trap={st:'slide',p:[dir[0]*.3,dir[1]*.3],from:[dir[0]*.3,dir[1]*.3],to,t:0,yaw:Math.atan2(-to[0],-to[1])};noiseHit(.6,.4,'lowpass',700);say('Trap out. Weaken it, then drag it over the trap.');ui();
  }
  function openTrap(){const T=B.trap;T.st='open';T.t=0;stopFire();zap();whoosh(1,[T.p[0],T.p[1],-CAM_H]);hwOut('fx strobe 1400 255 255 255',true);
    const spec=G.spec;capture();spec.bust=true;pay(spec);B.lock=false}
  function trapStep(dt){
    const T=B.trap;if(!T)return;T.t+=dt;
    if(T.st==='slide'){const k=Math.min(1,T.t/.55),e=1-(1-k)*(1-k);T.p=[T.from[0]+(T.to[0]-T.from[0])*e,T.from[1]+(T.to[1]-T.from[1])*e];if(k>=1){T.st='set';T.t=0;clank()}}
    else if(T.st==='open'&&T.t>1.5){T.st='full';T.t=0;clank();buzz([100,60,100]);hwOut('fx alarm 1200',true)}
    else if(T.st==='full'&&AU.ctx&&T.t%1.2<dt)tone(1500,.05,.08,'square');
  }
  function trapPoint(){const T=B.trap;return T&&on()&&(T.st==='open'||T.st==='set')?[T.p[0],T.p[1],-CAM_H+.15]:null}
  function pay(spec){
    const job=BS.jobs.find(j=>j.id===G.job&&!j.done),base=Math.round((200+spec.level*120)*(1+spec.anger/120)),bonus=job?job.pay:0,dmg=B.sessDmg||0;
    const total=Math.max(50,base+bonus-dmg);BS.cash+=total;BS.paid.unshift({t:Date.now(),name:spec.name,type:spec.type,amt:total,job:job?job.client:null,dmg});BS.paid.length=Math.min(BS.paid.length,40);
    if(job){job.done=true;stat('jobsDone')}B.sessDmg=0;saveDB();
    setTimeout(()=>say(`${money(total)} paid${job?` by ${job.client}`:''}${dmg?` (less ${money(dmg)} damage)`:''}. Rank: ${rank().name}`),1600);
  }

  // ---------------------------------------------------------------- slime
  function slimeStep(dt){
    if(!staged())return;
    // a ghost leaves a slime trail where it goes
    if(active()&&T_().look.kind!=='orbs'&&G.lift<.5){const p=[G.p[0],G.p[1]];if(!B.lastDrop||Math.hypot(p[0]-B.lastDrop[0],p[1]-B.lastDrop[1])>.55){B.lastDrop=p;B.slimeDrops.push({p,t:performance.now(),r:rand(.08,.18)*(MODE==='bust'?1.3:1)});if(B.slimeDrops.length>90)B.slimeDrops.shift()}}
    B.slime=Math.max(0,B.slime-dt/6);
    // angry ghosts spit at you
    if(on()&&active()&&G.state==='active'&&!B.lock&&G.anger>35&&G.seen){B.spitT-=dt;if(B.spitT<=0){B.spitT=rand(7,15)*(1.4-G.anger/100);const s=ghostTop();B.spits.push({p:s.slice(),v:s.map(v=>-v/0.9),t:0});whoosh(.5,G.p);growl(G.p)}}
    for(const s of B.spits){s.t+=dt;for(let i=0;i<3;i++)s.p[i]+=s.v[i]*dt}
    for(const s of B.spits)if(s.t>.9){s.dead=true;const a=angTo(s.p.map(v=>-v));if(Math.abs(wrap(headingOf(s.v.map(v=>-v))-O.h))<70)slimed(.6);}
    B.spits=B.spits.filter(s=>!s.dead);
  }
  function slimed(k=1){B.slime=Math.min(1.4,B.slime+k);B.slimed++;splat();buzz([200,50,300]);say(pick(['You got slimed!','Ugh. Slimed.','SLIMED!']),'alert');logEv('Slimed');stat('slimed');hwOut('fx flicker 900 0 255 40',true)}
  // the ghost touches you: in Bust mode most of them slime you instead of the scare
  function contact(){const T=T_();if(['inhuman','hatman','revenant','wraith','banshee'].includes(T.id)&&CFG.scares)return false;slimed(1);return true}

  // ---------------------------------------------------------------- jobs (callouts near you, on the map)
  const CLIENTS=['Mrs. Calloway','The Ashby Hotel','Pike Street Library','Dunmore Funeral Home','Mr. Whitlock','St. Agnes School','The Mercer Diner','Holloway Apartments','Old Fenwick Mill','Crane & Sons Hardware','The Thorne Theatre','Graves Family'];
  const PLACES=['basement','attic','kitchen','back stairwell','boiler room','third floor','garage','storage room','ballroom','projection booth'];
  function jobsStep(){
    if(!GPS.ok||GPS.acc>60||!on())return;BS.jobs=BS.jobs.filter(j=>!j.done||Date.now()-j.ts<864e5).slice(-30);
    const open=BS.jobs.filter(j=>!j.done&&geoDist(GPS.lat,GPS.lon,j.lat,j.lon)<1500);
    if(open.length<3){const b=rand(0,360),m=rand(60,400),[la,lo]=geoMove(GPS.lat,GPS.lon,b,m),T=pickType(),lv=rand(T.lv[0],T.lv[1])|0;
      BS.jobs.push({id:'J'+Date.now().toString(36)+(Math.random()*1e3|0),lat:la,lon:lo,client:pick(CLIENTS),place:pick(PLACES),type:T.id,pay:Math.round((150+lv*90)/10)*10,ts:Date.now(),done:false});saveDB()}
    // arrive at a job: its ghost is there
    if(G.state==='idle')for(const j of open)if(geoDist(GPS.lat,GPS.lon,j.lat,j.lon)<20){summon(makeGhost(j.type),O.h+rand(-120,120),rand(5,7),false);G.job=j.id;say(`${j.client}'s ${j.place}. It's in here somewhere…`,'warn');logEv(`Callout: ${j.client}, ${j.place}`);break}
  }
  function nearestJob(){if(!GPS.ok)return null;return BS.jobs.filter(j=>!j.done).map(j=>({j,d:geoDist(GPS.lat,GPS.lon,j.lat,j.lon),b:geoBear(GPS.lat,GPS.lon,j.lat,j.lon)})).sort((a,b)=>a.d-b.d)[0]||null}
  setInterval(jobsStep,3000);

  // ---------------------------------------------------------------- drawing in the world
  function floorBlob(p,r,fill){const pts=[];for(let i=0;i<10;i++){const a=i/10*Math.PI*2,q=proj([p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r*.85,-CAM_H]);if(!q||q.z<.4)return;pts.push(q)}  // right under you: skip
    cx.beginPath();pts.forEach((q,i)=>i?cx.lineTo(q.x,q.y):cx.moveTo(q.x,q.y));cx.closePath();cx.fillStyle=fill;cx.fill()}
  function drawWorld(t,lens){
    if(!staged())return;const now=performance.now(),th=lens==='thermal';
    // slime trail
    cx.save();for(const s of B.slimeDrops){const age=(now-s.t)/1000;if(age>180)continue;const a=clamp(1-age/180,0,1)*(th?.3:.75);
      floorBlob(s.p,s.r,th?`rgba(40,10,120,${a})`:lens==='nv'?`rgba(200,255,200,${a*.6})`:`rgba(90,230,60,${a})`);
      const q=proj([s.p[0],s.p[1],-CAM_H]);if(q&&!th){cx.fillStyle=`rgba(230,255,220,${a*.6})`;cx.beginPath();cx.ellipse(q.x-s.r*q.s*.25,q.y-s.r*q.s*.08,Math.max(1,s.r*q.s*.18),Math.max(.6,s.r*q.s*.05),0,0,7);cx.fill()}}
    B.slimeDrops=B.slimeDrops.filter(s=>now-s.t<180000);cx.restore();
    if(!on())return;
    // scorch marks on the walls
    cx.save();for(const s of B.scorch){const q=proj(s.p);if(!q)continue;const r=s.r*q.s,age=(now-s.t)/1000,g=cx.createRadialGradient(q.x,q.y,0,q.x,q.y,r);
      g.addColorStop(0,'rgba(10,6,4,.85)');g.addColorStop(.6,'rgba(30,18,10,.5)');g.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=g;cx.beginPath();cx.arc(q.x,q.y,r,0,7);cx.fill();
      if(age<4){cx.globalCompositeOperation='lighter';const e=cx.createRadialGradient(q.x,q.y,0,q.x,q.y,r*.6);e.addColorStop(0,`rgba(255,140,40,${.7*(1-age/4)})`);e.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=e;cx.fillRect(q.x-r,q.y-r,r*2,r*2);cx.globalCompositeOperation='source-over'}}
    cx.restore();
    drawTrap(t,lens);
    // slime spit in flight
    for(const s of B.spits){const q=proj(s.p);if(!q)continue;const r=clamp(.09*q.s,3,200);const g=cx.createRadialGradient(q.x-r*.3,q.y-r*.3,0,q.x,q.y,r);g.addColorStop(0,'#eaffd0');g.addColorStop(.3,'#6cf040');g.addColorStop(1,'rgba(40,140,20,.2)');cx.fillStyle=g;cx.beginPath();cx.arc(q.x,q.y,r,0,7);cx.fill()}
    // a job to go to
    const nj=G.state==='idle'&&nearestJob();if(nj){const p=atBearing(nj.b,Math.min(nj.d,40),0),lab=`JOB ${Math.round(nj.d)} m · ${nj.j.client}`,q=proj(p);
      if(q&&q.x>0&&q.x<W){orbAt(p,.25,.35+.25*Math.sin(t*2.4));cx.save();cx.fillStyle='#d6b3ff';cx.font='12px ui-monospace,monospace';cx.textAlign='center';cx.fillText(lab,q.x,q.y+22);cx.restore()}else edgeArrow(p,'#d6b3ff',lab)}
  }
  function drawTrap(t,lens){
    const T=B.trap;if(!T)return;const c=Math.cos(T.yaw),s=Math.sin(T.yaw),P=(x,y,z)=>proj([T.p[0]+x*c+y*s,T.p[1]-x*s+y*c,-CAM_H+z]);
    const w=.17,dd=.12,h=.1,shake=T.st==='full'&&Math.random()<.3?rand(-.006,.006):0,poly=(pts,fill)=>{if(pts.some(q=>!q))return;cx.beginPath();pts.forEach((q,i)=>i?cx.lineTo(q.x+shake*q.s,q.y):cx.moveTo(q.x+shake*q.s,q.y));cx.closePath();cx.fillStyle=fill;cx.fill()};
    cx.save();
    floorBlob(T.p,.2,'rgba(0,0,0,.35)');
    poly([P(-w,-dd,0),P(w,-dd,0),P(w,-dd,h),P(-w,-dd,h)],'#2c2f33');  // the side facing you
    poly([P(w,-dd,0),P(w,dd,0),P(w,dd,h),P(w,-dd,h)],'#1b1d20');poly([P(-w,-dd,0),P(-w,dd,0),P(-w,dd,h),P(-w,-dd,h)],'#1b1d20');
    for(let i=0;i<6;i++){const x0=-w+i*2*w/6;poly([P(x0,-dd-.001,.015),P(x0+w/6,-dd-.001,.015),P(x0+w/6+.015,-dd-.001,.045),P(x0+.015,-dd-.001,.045)],i%2?'#111':'#e8c21a')}
    const open=T.st==='open'?Math.min(1,T.t/.25)*(T.t>1.2?Math.max(0,1-(T.t-1.2)/.2):1):0,ang=open*1.2;
    for(const sd of[-1,1]){const hx=sd*w,ex=sd*w*(1-Math.cos(ang)),ez=h+w*Math.sin(ang);poly([P(hx,-dd,h),P(hx,dd,h),P(ex,dd,ez),P(ex,-dd,ez)],sd<0?'#3a3e44':'#33373c')}
    const lq=P(w*.75,-dd-.002,h*.75);if(lq){const lit=T.st==='full'?(t*3|0)%2===0:T.st==='set';cx.fillStyle=T.st==='full'?(lit?'#ff2a14':'#401010'):lit?'#3cff6a':'#103010';cx.shadowColor=cx.fillStyle;cx.shadowBlur=lit?10:0;cx.beginPath();cx.arc(lq.x,lq.y,Math.max(1.5,.012*lq.s),0,7);cx.fill();cx.shadowBlur=0}
    if(open>0&&lens!=='thermal'){const b=P(0,0,h),tp=P(0,0,2.4);if(b&&tp){cx.globalCompositeOperation='lighter';const bw=w*b.s*.9,tw=.9*tp.s,g=cx.createLinearGradient(b.x,b.y,tp.x,tp.y);g.addColorStop(0,`rgba(255,255,255,${.85*open})`);g.addColorStop(.3,`rgba(170,210,255,${.45*open})`);g.addColorStop(1,'rgba(120,160,255,0)');
      cx.fillStyle=g;cx.beginPath();cx.moveTo(b.x-bw,b.y);cx.lineTo(b.x+bw,b.y);cx.lineTo(tp.x+tw,tp.y);cx.lineTo(tp.x-tw,tp.y);cx.closePath();cx.fill();cx.globalCompositeOperation='source-over'}}
    if(T.st==='full'&&lens!=='thermal'){const b=P(0,0,h);if(b)for(let i=0;i<5;i++){const k=((t*.5+i/5)%1),r=(.04+k*.12)*b.s;cx.fillStyle=`rgba(200,200,200,${.25*(1-k)})`;cx.beginPath();cx.arc(b.x+Math.sin(t*2+i)*r*.5,b.y-k*.5*b.s,r,0,7);cx.fill()}}
    cx.restore();
  }
  // ---------------------------------------------------------------- drawing over the picture: the beam, slime on the lens, the pack HUD
  function strand(x0,y0,x1,y1,cxp,cyp,amp,seed,t){const n=26,pts=[];for(let i=0;i<=n;i++){const k=i/n,a=1-k,x=a*a*x0+2*a*k*cxp+k*k*x1,y=a*a*y0+2*a*k*cyp+k*k*y1,dx=x1-x0,dy=y1-y0,l=Math.hypot(dx,dy)||1,
      j=Math.sin(k*Math.PI)*amp*(Math.sin(k*23+t*40+seed)*.5+Math.sin(k*61-t*65+seed*3)*.3+(Math.random()-.5)*.6);pts.push([x-dy/l*j,y+dx/l*j])}
    cx.beginPath();pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));cx.stroke()}
  function overlay(t){
    if(!on())return;
    if(B.fire){
      const x0=W*.72,y0=H+16;let tx,ty,hit=null;
      if(B.lock){const q=proj(ghostTop());if(q){tx=q.x;ty=q.y;hit=q}}
      if(tx==null){const q=proj(O.F.map(v=>v*3.4));tx=q?q.x:W/2;ty=q?q.y:H/2}
      const cxp=(x0+tx)/2+Math.sin(t*3)*W*.08,cyp=(y0+ty)/2+Math.cos(t*2.3)*H*.05;
      cx.save();cx.globalCompositeOperation='lighter';cx.lineCap='round';cx.lineJoin='round';
      cx.strokeStyle='rgba(255,60,20,.25)';cx.lineWidth=26;strand(x0,y0,tx,ty,cxp,cyp,10,0,t);
      cx.strokeStyle='rgba(255,120,40,.55)';cx.lineWidth=9;strand(x0,y0,tx,ty,cxp,cyp,16,1,t);strand(x0,y0,tx,ty,cxp,cyp,22,2,t);
      cx.strokeStyle='rgba(120,170,255,.75)';cx.lineWidth=2.5;for(let i=0;i<3;i++)strand(x0,y0,tx,ty,cxp,cyp,34+i*8,5+i*7,t);
      cx.strokeStyle='rgba(255,250,235,.95)';cx.lineWidth=3.5;strand(x0,y0,tx,ty,cxp,cyp,6,9,t);
      // where it hits: sparks, and when it's locked on, the stream wraps round the ghost
      const g=cx.createRadialGradient(tx,ty,0,tx,ty,60);g.addColorStop(0,'rgba(255,240,200,.9)');g.addColorStop(.3,'rgba(255,120,40,.45)');g.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=g;cx.fillRect(tx-60,ty-60,120,120);
      cx.strokeStyle='rgba(255,230,180,.9)';cx.lineWidth=1.5;for(let i=0;i<10;i++){const a=rand(0,6.3),r=rand(10,48);cx.beginPath();cx.moveTo(tx,ty);cx.lineTo(tx+Math.cos(a)*r,ty+Math.sin(a)*r);cx.stroke()}
      if(hit){const R=clamp(.55*hit.s,30,W*.6);cx.strokeStyle='rgba(140,180,255,.8)';cx.lineWidth=2;for(let i=0;i<4;i++){cx.beginPath();const ph=rand(0,6.3);for(let k=0;k<=40;k++){const a=ph+k/40*Math.PI*2.2,rr2=R*(.7+.3*Math.sin(k*1.7+t*20));cx.lineTo(tx+Math.cos(a)*rr2*.55+rand(-4,4),ty+Math.sin(a)*rr2*1.1+rand(-4,4))}cx.stroke()}
        cx.strokeStyle='rgba(255,140,60,.6)';cx.lineWidth=4;cx.beginPath();cx.ellipse(tx,ty,R*.6,R*1.15,Math.sin(t*5)*.4,0,7);cx.stroke()}
      cx.restore();
      // the nozzle glow at the bottom of the screen
      cx.save();cx.globalCompositeOperation='lighter';const n=cx.createRadialGradient(x0,H,0,x0,H,90);n.addColorStop(0,'rgba(255,200,140,.8)');n.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=n;cx.fillRect(x0-90,H-90,180,90);cx.restore();
    }
    if(B.slime>0)drawSlimeLens(t);
  }
  const DRIP=(()=>{const c=document.createElement('canvas');c.width=360;c.height=640;const x=c.getContext('2d'),r=rng(11),R=(a,b)=>a+r()*(b-a);
    for(let i=0;i<34;i++){const px=R(0,360),py=R(0,640)*(r()<.6?.35:1),rad=R(18,70),g=x.createRadialGradient(px-rad*.3,py-rad*.3,rad*.1,px,py,rad);
      g.addColorStop(0,'rgba(200,255,170,.7)');g.addColorStop(.4,'rgba(80,220,40,.55)');g.addColorStop(1,'rgba(40,150,20,0)');x.fillStyle=g;x.beginPath();x.arc(px,py,rad,0,7);x.fill();
      if(r()<.7){x.fillStyle='rgba(70,210,40,.5)';x.fillRect(px-R(3,8),py,R(5,14),R(40,200));x.beginPath();x.arc(px,py+R(60,220),R(5,10),0,7);x.fill()}}return c})();
  function drawSlimeLens(t){const k=Math.min(1,B.slime),drip=(1.4-Math.min(1.4,B.slime))*H*.25;cx.save();cx.globalAlpha=k;cx.drawImage(DRIP,0,drip-H*.05,W,H*1.05);cx.restore()}
  function hud(t){
    if(!on())return;const w=150,x=W-w-12,y=156;cx.save();cx.textAlign='left';cx.textBaseline='top';cx.font='10px ui-monospace,monospace';
    cx.fillStyle='rgba(0,0,0,.55)';rr(x,y,w,B.lock||B.hp<1?62:40,7);cx.fill();
    cx.fillStyle=B.vent>0?'#ff9a2b':'#bfffd9';cx.fillText(B.vent>0?`VENTING ${B.vent.toFixed(1)}s`:B.fire?(B.lock?'STREAM LOCKED':'FIRING'):'PACK READY',x+8,y+6);
    cx.fillStyle='rgba(255,255,255,.15)';cx.fillRect(x+8,y+20,w-16,8);const hc=B.heat<.6?'#38ff9c':B.heat<.85?'#ffb627':'#ff3b30';cx.fillStyle=hc;cx.fillRect(x+8,y+20,(w-16)*B.heat,8);
    cx.fillStyle='#8aa';cx.fillText('HEAT',x+w-34,y+6);
    if(B.lock||B.hp<1){cx.fillStyle='#ddd';cx.fillText(B.hp>0?'TARGET STRENGTH':'WEAKENED - TRAP IT',x+8,y+34);cx.fillStyle='rgba(255,255,255,.15)';cx.fillRect(x+8,y+48,w-16,7);cx.fillStyle=B.hp>0?'#ff8a3c':'#9fd0ff';cx.fillRect(x+8,y+48,(w-16)*Math.max(B.hp,.02),7)}
    cx.restore();
  }
  // the kit follows the pack: the RGB LED pulses like a cyclotron, the buzzer hums while firing, it vibrates while wrangling
  function hw(){
    if(!on()||!canSend())return false;const now=performance.now();
    if(B.trap&&B.trap.st==='open')return true;
    if(B.fire){if(now-B.hwT>260){B.hwT=now;hwOut(`led 255 ${B.lock?40:90+Math.random()*80|0} ${B.lock?120:0}`,true);if(B.heat<.85)hwOut('beep 140 260',true);else hwOut('beep 2400 80',true)}return true}
    if(B.vent>0){hwOut('fx flicker 800 255 120 0');return true}
    const ph=(now/180|0)%4,c=[[255,0,0],[255,40,0],[160,0,0],[60,0,0]][ph];hwOut(`led ${c[0]} ${c[1]} ${c[2]}`);return true;
  }
  // ---------------------------------------------------------------- the ghost meter
  function devPke(t,level){
    const b=devBox(.6,.62),{x,y,w,h}=b,armsOpen=clamp(level*1.15,0,1),cxm=x+w/2,top=y+h*.28;
    // arms (drawn first so the body covers their hinges)
    for(const sd of[-1,1]){cx.save();cx.translate(cxm+sd*w*.18,top);cx.rotate(sd*(.12+armsOpen*1.0));const aw=w*.13,al=h*.42;
      body(-aw/2,-al,aw,al,8,'#2c2c2c','#111');for(let i=0;i<5;i++)led(0,-al+14+i*(al-26)/4,Math.min(7,aw*.28),i<armsOpen*5?'#ff3b1f':'#ff3b1f',i<Math.round(armsOpen*5)&&(t*8+i)%2>.5,1);cx.restore()}
    body(x+w*.12,top-h*.06,w*.76,h*.68,16,'#3a3a3a','#141414');
    cx.fillStyle='#0b0b0b';rr(x+w*.18,top+h*.02,w*.64,h*.22,10);cx.fill();
    // a bar graph of the field, and the direction it's strongest in
    const n=Math.round(level*12);for(let i=0;i<12;i++){const bx=x+w*.22+i*(w*.56/12);cx.fillStyle=i<n?(i<6?'#38ff9c':i<9?'#ffb627':'#ff3b30'):'rgba(255,255,255,.08)';cx.fillRect(bx,top+h*.05,w*.56/12-3,h*.16)}
    let dir=null,lab='';if(active()){dir=wrap(gBear()-O.h);lab='ENTITY'}else{const s=B.slimeDrops[B.slimeDrops.length-1];if(s&&performance.now()-s.t<120000){dir=wrap(headingOf(s.p)-O.h);lab='SLIME TRAIL'}}
    cx.save();cx.translate(cxm,top+h*.42);cx.strokeStyle='#555';cx.lineWidth=2;cx.beginPath();cx.arc(0,0,h*.1,Math.PI,0);cx.stroke();
    if(dir!=null){cx.rotate(clamp(dir,-90,90)*D2R);cx.strokeStyle='#ff6a3c';cx.lineWidth=3;cx.beginPath();cx.moveTo(0,0);cx.lineTo(0,-h*.1);cx.stroke()}cx.restore();
    cx.textAlign='center';cx.font='10px ui-monospace,monospace';cx.fillStyle='#bbb';cx.fillText(dir==null?'NO SIGNAL':`${lab} ${Math.abs(Math.round(dir))}° ${dir<0?'LEFT':'RIGHT'}`,cxm,top+h*.5);
    cx.font='bold 15px ui-sans-serif,system-ui';cx.fillStyle='#ddd';cx.fillText('GHOST METER',cxm,top+h*.57);
    cx.font='11px ui-monospace,monospace';cx.fillStyle='#8a8a8a';cx.fillText(`PK ${(level*10).toFixed(1)}`,cxm,top+h*.57+18);
  }
  // ---------------------------------------------------------------- HQ (journal tab) and the map
  function renderHQ(el){
    const r=rank(),c=DB.ghosts.filter(g=>g.state==='captured'),load=Math.min(100,Math.round(c.length/50*100));
    const jobs=BS.jobs.filter(j=>!j.done).map(j=>({j,d:GPS.ok?geoDist(GPS.lat,GPS.lon,j.lat,j.lon):null})).sort((a,b)=>(a.d??1e9)-(b.d??1e9));
    el.innerHTML=`<div class="tiles"><div class="tile"><div class="small">Bank</div><b>${money(BS.cash)}</b></div><div class="tile"><div class="small">Rank</div><b style="font-size:15px">${r.name}</b><div class="small">${r.next?`${r.next[0]-r.n} more captures to ${r.next[1]}`:'top rank'}</div></div>
      <div class="tile"><div class="small">Containment unit</div><b>${load}%</b><div class="small">${c.length} held</div></div><div class="tile"><div class="small">Property damage</div><b>${money(BS.damage)}</b><div class="small">scorched walls</div></div></div>
      <h3>Callouts</h3>${GPS.ok?'':'<p class="small">Jobs need GPS. In Bust mode with location on, up to three callouts appear within about 400 m.</p>'}
      ${jobs.map(({j,d})=>`<div class="gl"><div class="gh"><b>${esc(j.client)}</b><span>${money(j.pay)}</span></div><div class="small">${esc(j.place)} · ${d==null?'':Math.round(d)+' m · '}reported: ${esc(typeOf({type:j.type}).look.kind==='none'?'things moving on their own':typeOf({type:j.type}).look.kind==='shadow'?'a dark figure':typeOf({type:j.type}).look.kind==='pale'?'a pale figure':'something strange')}</div></div>`).join('')||'<p class="small">No open callouts.</p>'}
      <h3>Paid</h3>${BS.paid.slice(0,12).map(p=>`<div class="small">${fmtDate(p.t)} · ${esc(p.name)} · <b style="color:#38ff9c">${money(p.amt)}</b>${p.job?` · ${esc(p.job)}`:''}${p.dmg?` · −${money(p.dmg)} damage`:''}</div>`).join('')||'<p class="small">Nothing yet. Catch something.</p>'}
      <h3>How to bust a ghost</h3><ul class="small"><li>Find it with the ghost meter, or follow its slime trail.</li><li>Hold <b>FIRE</b> with it in your sights. Keep the stream on it while it thrashes; don't overheat.</li><li>When it's weakened, tap <b>THROW TRAP</b> (aim at the floor to choose where).</li><li>Keep firing and point at the trap: the ghost follows the beam. Over the trap, it's sucked in.</li><li>Tap the trap button again to empty a full trap. Missed shots scorch walls, and that comes out of your pay.</li></ul>`;
  }
  function mapMarks(Lf,map,pts){for(const j of BS.jobs.filter(j=>!j.done)){pts.push([j.lat,j.lon]);Lf.circleMarker([j.lat,j.lon],{radius:9,color:'#b07cff',weight:2,fillOpacity:.25}).addTo(map).bindPopup(`<b>Callout: ${esc(j.client)}</b><br>${esc(j.place)} · ${money(j.pay)}`)}}
  function status(){return`${money(BS.cash)} · ${rank().name}`}
  // ---------------------------------------------------------------- buttons
  function ui(){const bust=MODE==='bust';$('#trap').textContent=bust?'FIRE':'TRAP';$('#trap').classList.toggle('fire',bust);
    for(const id of['#provBtn','#calmBtn'])if(bust)$(id).hidden=true;$('#throwBtn').hidden=!bust;$('#ventBtn').hidden=!bust;
    $('#throwBtn').textContent=!B.trap?'THROW TRAP':B.trap.st==='full'?'EMPTY TRAP':'PICK UP'}
  $('#throwBtn').onclick=()=>{throwTrap();ui()};
  $('#ventBtn').onclick=()=>{if(B.vent<=0&&B.heat>.1){stopFire();B.vent=1.5;noiseHit(1.4,.45,'highpass',2000);say('Venting…')}};
  function enter(){ui();if(started){auInit();powerUp();say(GPS.ok?'Pack powered up. Check the journal for callouts.':'Pack powered up. Find it with the ghost meter.')}}
  return{step,wrangle,held:()=>on()&&B.lock&&G.state==='active',overlay,drawWorld,hud,hw,devPke,trapPoint,renderHQ,mapMarks,status,ui,enter,contact,slimed,get state(){return B},bank:BS};
})();
