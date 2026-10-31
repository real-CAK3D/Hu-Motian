// Ghost Hunter ambience: things that make a staged haunting sit in the real room. Ghosts brighten or fade
// with the room's light, a flashlight drives shadow people off, mist pools on the floor around them, your
// breath fogs in a cold spot, and a poltergeist's throws are real objects that land and stay put.
'use strict';
const AMB=(()=>{
  const A={lum:.25,lumT:0,light:false,lightReactT:0,breathT:rand(2,4),puffs:[],props:[],mist:[]};
  const tiny=document.createElement('canvas');tiny.width=tiny.height=12;const tx=tiny.getContext('2d',{willReadFrequently:true});
  const lightOn=()=>A.light||cam.torchOn;
  function step(dt){
    // how bright the room is (from the camera picture): ghosts glow in the dark and wash out in daylight
    A.lumT-=dt;if(A.lumT<=0&&camC.width>4){A.lumT=.5;try{tx.drawImage(camC,0,0,12,12);const d=tx.getImageData(0,0,12,12).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]*.3+d[i+1]*.59+d[i+2]*.11;A.lum+=(s/144/255-A.lum)*.5}catch(e){}}
    G3.room=cam.ok?clamp(1.25-A.lum*1.1,.45,1.2):1;
    if(!started||!staged())return;
    // a flashlight on a shadow person: it can't stand it
    A.lightReactT-=dt;
    if(lightOn()&&active()&&G.state==='active'&&A.lightReactT<=0&&inViewFn([G.p[0],G.p[1],-.5])&&G.vis>.2){const k=T_().look.kind;
      if(k==='shadow'&&!(typeof BUST!=='undefined'&&BUST.held())){A.lightReactT=rand(4,7);setBeh(Math.random()<.6?'hide':'flee');say('It recoiled from the light!','warn');logEv(`${nm()} fled the light`)}
      else if(k==='demon'&&Math.random()<.5){A.lightReactT=rand(6,10);G.anger=Math.min(100,G.anger+8);growl(G.p);say('The light made it angry.','alert')}
      else A.lightReactT=3}
    // your breath fogs when it's this cold
    A.breathT-=dt;const cold=TEMP.amb!=null&&TEMP.amb<TEMP.base-3.5;
    if(A.breathT<=0){A.breathT=rand(3.2,4.6);if(cold){A.puffs.push({t:0});noiseHit(.9,.06,'lowpass',500)}}
    for(const p of A.puffs)p.t+=dt;A.puffs=A.puffs.filter(p=>p.t<1.6);
    // mist hugging the floor around the cold ones
    if(active()&&['pale','wraith','mist','demon'].includes(T_().look.kind)&&A.mist.length<26&&Math.random()<dt*8){const a=rand(0,6.3),r=rand(.1,1.1);A.mist.push({p:[G.p[0]+Math.cos(a)*r,G.p[1]+Math.sin(a)*r,-CAM_H+rand(.02,.25)],v:[rand(-.08,.08),rand(-.08,.08)],t:0,life:rand(4,8),s:rand(.25,.6)})}
    for(const m of A.mist){m.t+=dt;m.p[0]+=m.v[0]*dt;m.p[1]+=m.v[1]*dt}A.mist=A.mist.filter(m=>m.t<m.life);
    // thrown things fly, bounce, and then lie where they landed
    for(const o of A.props){if(o.rest)continue;o.t+=dt;for(let i=0;i<3;i++)o.p[i]+=o.v[i]*dt;o.v[2]-=9.8*dt;o.spin+=o.w*dt;
      if(o.p[2]<=-CAM_H+o.h/2){o.p[2]=-CAM_H+o.h/2;if(Math.abs(o.v[2])>1.2){o.v[2]*=-.35;o.v[0]*=.5;o.v[1]*=.5;o.w*=.5;knock([o.p[0],o.p[1],-CAM_H],1)}else{o.rest=true;o.v=[0,0,0]}}}
    A.props=A.props.filter(o=>performance.now()-o.born<240000);
  }
  // a poltergeist throws something real: it flies from `from` toward `to`
  const KINDS=[{n:'book',w:.2,d:.14,h:.04,c:['#5a2a1a','#7a3a22','#3a1a10']},{n:'box',w:.14,d:.14,h:.12,c:['#9a7a52','#b8946a','#6e5638']},{n:'tin',w:.08,d:.08,h:.12,c:['#8a8f96','#b0b5bc','#5e6268']}];
  function throwProp(from,to){const k=pick(KINDS),T=.5,v=[(to[0]-from[0])/T,(to[1]-from[1])/T,(to[2]-from[2])/T+4.9*T];A.props.push({...k,p:from.slice(),v,spin:0,w:rand(-12,12),t:0,born:performance.now(),rest:false});if(A.props.length>8)A.props.shift()}
  function drawProp(o,lens){
    const c=Math.cos(o.spin),s=Math.sin(o.spin),P=(x,y,z)=>{const xx=x*c-z*s,zz=x*s+z*c;return proj([o.p[0]+xx,o.p[1]+y,o.p[2]+zz])};
    const w=o.w/2,d=o.d/2,h=o.h/2,V=[P(-w,-d,-h),P(w,-d,-h),P(w,d,-h),P(-w,d,-h),P(-w,-d,h),P(w,-d,h),P(w,d,h),P(-w,d,h)];if(V.some(v=>!v||v.z<.3))return;
    const F=[[0,1,5,4,0],[1,2,6,5,1],[3,0,4,7,0],[4,5,6,7,2],[2,3,7,6,1],[0,3,2,1,2]];
    const th=lens==='thermal',nv=lens==='nv';
    for(const f of F){const a=V[f[0]],b=V[f[1]],e=V[f[2]],cr=(b.x-a.x)*(e.y-a.y)-(b.y-a.y)*(e.x-a.x);if(cr>0)continue;  // back faces
      cx.beginPath();cx.moveTo(a.x,a.y);for(let i=1;i<4;i++)cx.lineTo(V[f[i]].x,V[f[i]].y);cx.closePath();cx.fillStyle=th?['#2a1060','#341470','#200a50'][f[4]]:nv?['#2e4a32','#4a6a4e','#1e3020'][f[4]]:o.c[f[4]];cx.fill()}
  }
  function drawWorld(t,lens){
    if(!staged())return;const th=lens==='thermal';
    for(const m of A.mist){const q=proj(m.p);if(!q||q.z<.4)continue;const a=Math.min(m.t,m.life-m.t,1)*(th?.0:.18),r=m.s*q.s*(1+m.t*.08);if(a<=0||r<1)continue;
      const g=cx.createRadialGradient(q.x,q.y,0,q.x,q.y,r);g.addColorStop(0,`rgba(225,232,236,${a})`);g.addColorStop(1,'rgba(225,232,236,0)');cx.fillStyle=g;cx.save();cx.translate(q.x,q.y);cx.scale(1.8,.55);cx.translate(-q.x,-q.y);cx.fillRect(q.x-r,q.y-r,r*2,r*2);cx.restore()}
    for(const o of A.props)drawProp(o,lens);
  }
  // drawn over the camera picture: the flashlight's pool of light, and your breath
  function overlay(t,lens){
    if(A.light&&lens!=='thermal'){const r=Math.min(W,H)*.55,g=cx.createRadialGradient(W/2,H*.5,r*.15,W/2,H*.5,Math.max(W,H)*.75);
      g.addColorStop(0,'rgba(255,250,230,.16)');g.addColorStop(.35,'rgba(0,0,0,0)');g.addColorStop(.6,'rgba(0,0,0,.45)');g.addColorStop(1,'rgba(0,0,0,.85)');cx.fillStyle=g;cx.fillRect(0,0,W,H)}
    for(const p of A.puffs){const k=p.t/1.6,a=(k<.2?k/.2:1-(k-.2)/.8)*.35,r=W*(.25+k*.5),y=H*(1.05-k*.25),g=cx.createRadialGradient(W/2,y,0,W/2,y,r);
      g.addColorStop(0,`rgba(235,240,245,${a})`);g.addColorStop(1,'rgba(235,240,245,0)');cx.fillStyle=g;cx.fillRect(0,y-r,W,r*2)}
  }
  function toggleLight(){A.light=!A.light;click();logEv(A.light?'Flashlight on':'Flashlight off')}
  return{step,throwProp,drawWorld,overlay,toggleLight,get light(){return A.light},get lum(){return A.lum},_A:A};
})();
