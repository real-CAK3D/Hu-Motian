// Ghost Hunter 3D apparitions: real animated human bodies (the CC0 Quaternius characters in assets/), drawn
// with three.js as translucent, rim-lit spirits that stand on the floor and track you with their heads.
// view.js falls back to the 2D figures when WebGL, three.js or a model isn't available.
'use strict';
const G3=(()=>{
  const has=()=>!!(window.THREE&&THREE.GLTFLoader&&THREE.SkeletonUtils);
  let room=1,R=null,cnv=null,scene=null,camera=null,failed=false,glowC=null,glowX=null,trailC=null,trailX=null;
  const models={},loading={},actors={};
  // which body each kind of ghost wears; a ghost keeps the same one every time you meet it
  const RIG={
    residual:{body:['farmer','worker'],keep:.45,noLook:1},
    wanderer:{body:['casual','farmer','beach','worker']},
    child:{body:['casual','hoodie'],head:1.08},
    guide:{body:['adventurer','king'],glow:1.6},
    bride:{body:['casual'],dress:1,hair:1},
    banshee:{body:['casual'],dress:1,hair:1,arms:1.08},
    shadow:{body:['hoodie','business']},
    stalker:{body:['hoodie','business'],arms:1.1},
    hatman:{body:['business'],hat:1,stretch:1.06},
    wraith:{body:['hoodie'],arms:1.25,fade:1.15},
    revenant:{body:['worker','swat','farmer']},
    trickster:{body:['punk','hoodie']},
    doppel:{body:['casual','hoodie','business','beach'],keep:.75},
    inhuman:{body:['punk'],stretch:1.14,arms:1.32,owl:1},
  };
  const CLIP={stand:'Idle_Neutral',walk:'Walk',run:'Run',beckon:'Wave',point:'Idle_Gun_Pointing',float:'Idle',scream:'HitRecieve_2',crawl:'Walk'};
  const toT=v=>new THREE.Vector3(v[0],v[2],-v[1]);              // world (east, north, up) -> three (x, y up, -z north)
  const fromT=v=>[v.x,-v.z,v.y];

  function init(){
    if(R)return true;if(failed||!has())return false;
    try{cnv=document.createElement('canvas');
      R=new THREE.WebGLRenderer({canvas:cnv,alpha:true,antialias:true,premultipliedAlpha:true,powerPreference:'high-performance'});
      R.setClearColor(0,0);R.localClippingEnabled=true;R.setPixelRatio(1);
      cnv.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;R=null});
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(50,1,.05,80);
      glowC=document.createElement('canvas');glowX=glowC.getContext('2d');trailC=document.createElement('canvas');trailX=trailC.getContext('2d');
      for(const n of['hoodie','business','casual'])load(n);
      return true}
    catch(e){console.warn('3D ghosts off:',e);failed=true;R=null;return false}
  }
  function load(n){
    if(models[n])return models[n];
    if(!loading[n])loading[n]=new THREE.GLTFLoader().loadAsync('assets/'+n+'.glb').then(g=>{models[n]=g}).catch(e=>{console.warn('model',n,e)});
    return null;
  }

  // ---------------------------------------------------------------- the apparition material
  const VS=`#include <common>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vN;varying vec3 vV;varying float vH;varying vec2 vUv;
uniform float uFloor,uTime,uWob;
void main(){
vUv=uv;
#include <skinbase_vertex>
#include <beginnormal_vertex>
#include <skinnormal_vertex>
#include <begin_vertex>
#include <skinning_vertex>
  vec4 wp=modelMatrix*vec4(transformed,1.);vH=wp.y-uFloor;
  wp.xz+=uWob*vec2(sin(wp.y*7.+uTime*2.3),cos(wp.y*5.3-uTime*1.7))*.012*(1.+smoothstep(.9,0.,vH)*2.);  // ectoplasm wobble, worse near the floor
  vN=normalize(mat3(modelMatrix)*objectNormal);vV=cameraPosition-wp.xyz;
  vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
#include <clipping_planes_vertex>
}`;
  const FS=`#include <clipping_planes_pars_fragment>
uniform vec3 uBase,uTint,uRimCol,uEyeCol;uniform float uKeep,uVis,uRim,uFade,uCore,uEdgeA,uEdge,uTime,uEye,uLit,uStr;
varying vec3 vN;varying vec3 vV;varying float vH;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
#include <clipping_planes_fragment>
  float fade=smoothstep(0.,uFade,vH)*(.55+.45*smoothstep(0.,uFade*.5,vH));
  float flick=(.9+.1*sin(gl_FragCoord.y*1.9+uTime*9.))*(.86+.14*sin(gl_FragCoord.y*.021-uTime*2.6));
  float grain=.72+.56*hash(floor(gl_FragCoord.xy*.5)+floor(uTime*24.)*.137);
  if(uEye>.5){gl_FragColor=vec4(uEyeCol,clamp(uVis*1.3,0.,1.)*fade);return;}
  vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;
  float ndv=clamp(dot(n,normalize(vV)),0.,1.),rim=pow(1.-ndv,2.4);
  float lum=dot(uBase,vec3(.299,.587,.114));vec3 cloth=mix(vec3(lum),uBase,.3)*1.7;
  vec3 col=mix(uTint,cloth+uTint*.3,uKeep)*mix(1.,.3+.7*ndv,uLit)+uRimCol*rim*uRim;
  float a=uVis*fade*flick*mix(1.,grain,.55)*mix(uCore,uEdgeA,rim)*smoothstep(0.,uEdge,ndv);
  if(uStr>.5){float k=vUv.x*46.+sin(vUv.y*11.+vUv.x*30.)*.6;  // strands of long hair, ragged at the ends
    a*=smoothstep(.15,.5,fract(k))*smoothstep(0.,.3,vUv.y+hash(vec2(floor(k),3.))*.35-.12);}
  gl_FragColor=vec4(col,clamp(a,0.,1.));
}`;
  // one look per kind of apparition, adjusted for the lens it's seen through
  function style(kind,role,lens,cfg){
    let s;
    if(kind==='pale')s={tint:[.74,.83,.86],rimCol:[.82,.95,1],rim:1.35,keep:cfg.keep??.32,core:.22,edgeA:.95,edge:.001,lit:1,eye:[0,0,0]};
    else if(kind==='demon')s={tint:[.015,0,0],rimCol:[.75,.06,.02],rim:.9,keep:0,core:.97,edgeA:.85,edge:.001,lit:1,eye:[1.6,.12,.05]};
    else s={tint:[.005,.005,.008],rimCol:[.2,.22,.26],rim:.6,keep:0,core:.95,edgeA:.25,edge:.4,lit:0,eye:[0,0,0]};  // shadow, wraith
    if(cfg.glow)s.rim*=cfg.glow;
    if(role==='skin'&&kind==='pale'){s.tint=[.84,.88,.9];s.keep=0;s.core=.42}
    if(role==='hair'||role==='strands'){s.tint=[.01,.01,.012];s.keep=0;s.core=.94;s.edgeA=.35;s.rim=.15;s.edge=.25;s.lit=0}
    if(role==='dress'){s.core=Math.max(s.core,.3);s.keep=0;s.lit=.6}
    if(lens==='thermal'){s.tint=[.09,.02,.24];s.rimCol=[.2,.08,.5];s.rim=.6;s.keep=0;s.core=.75;s.edgeA=.45;s.eye=[.09,.02,.24]}
    else if(lens==='nv'){const m=[.8,1,.84];s.tint=s.tint.map((v,i)=>v*m[i]);s.rimCol=s.rimCol.map((v,i)=>v*m[i]);if(kind!=='pale'&&role!=='eye')s.eye=s.eye.map(v=>v*.8)}
    return s;
  }
  function material(base,role,shared){
    const u={uBase:{value:new THREE.Color(base)},uTint:{value:new THREE.Color()},uRimCol:{value:new THREE.Color()},uEyeCol:{value:new THREE.Color()},
      uKeep:{value:0},uRim:{value:1},uCore:{value:.5},uEdgeA:{value:1},uEdge:{value:.001},uLit:{value:1},uEye:{value:role==='eye'?1:0},uStr:{value:role==='strands'?1:0},
      uVis:shared.uVis,uTime:shared.uTime,uFloor:shared.uFloor,uFade:shared.uFade,uWob:shared.uWob};
    const m=new THREE.ShaderMaterial({uniforms:u,vertexShader:VS,fragmentShader:FS,transparent:true,depthWrite:true,side:THREE.FrontSide,clipping:true,clippingPlanes:[shared.clip]});
    m.userData.role=role;return m;
  }
  function restyle(a,lens){
    for(const m of a.mats){const s=style(a.kind,m.userData.role,lens,a.cfg),u=m.uniforms;
      u.uTint.value.setRGB(...s.tint);u.uRimCol.value.setRGB(...s.rimCol);u.uEyeCol.value.setRGB(...s.eye);
      u.uKeep.value=s.keep;u.uRim.value=s.rim;u.uCore.value=s.core;u.uEdgeA.value=s.edgeA;u.uEdge.value=s.edge;u.uLit.value=s.lit}
    a.lens=lens;
  }

  // ---------------------------------------------------------------- building a body
  const findBone=(root,n)=>{let b=null;root.traverse(o=>{if(!b&&o.isBone&&o.name===n)b=o});return b};
  function build(key,o){
    const gl=models[o.body];const root=new THREE.Group(),body=THREE.SkeletonUtils.clone(gl.scene);root.add(body);
    const shared={uVis:{value:0},uTime:{value:0},uFloor:{value:0},uFade:{value:.5},uWob:{value:o.kind==='pale'?1:.5},clip:new THREE.Plane(new THREE.Vector3(1,0,0),1e4)};
    const a={key,body:o.body,kind:o.kind,cfg:o.cfg,root,shared,mats:[],mixer:new THREE.AnimationMixer(body),clips:gl.animations,act:null,pose:null,
      yaw:o.yaw0||0,lw:0,tilt:0,tiltT:rand(2,6),tiltTo:0,hold:0,holdCool:rand(1,3),used:false,lastP:null,spd:0,lens:null};
    body.traverse(m=>{if(!m.isMesh)return;m.frustumCulled=false;const n=(m.material&&m.material.name)||'';
      const role=/^Eye$/.test(n)?'eye':/Skin/.test(n)?'skin':/Hair|Eyebrow|Moustache/.test(n)?'hair':'body';
      const mat=material(m.material&&m.material.color?m.material.color:0x888888,role,shared);m.material=mat;a.mats.push(mat);
      if(role==='eye'&&m.geometry)a.eyeMesh=m;});
    // fit the height, and stretch the ones that shouldn't look quite human
    const sc=o.h/1.86,st=o.cfg.stretch||1;body.scale.set(sc/Math.sqrt(st),sc*st,sc/Math.sqrt(st));
    a.head=findBone(body,'Head');a.neck=findBone(body,'Neck');a.hips=findBone(body,'Hips');
    const hs=o.cfg.head||.84;if(a.head)a.head.scale.setScalar(hs);
    if(o.cfg.dress)for(const n of['UpperLegL','UpperLegR']){const b=findBone(body,n);if(b)b.scale.setScalar(.001)}  // under a gown: no legs
    if(o.cfg.arms)for(const n of['UpperArmL','UpperArmR','LowerArmL','LowerArmR']){const b=findBone(body,n);if(b)b.scale.set(1,o.cfg.arms,1)}
    root.updateMatrixWorld(true);
    // the head's forward and up, in its own frame (for turning it toward you)
    if(a.head){const q=new THREE.Quaternion();a.head.getWorldQuaternion(q);q.invert();a.fwdL=new THREE.Vector3(0,0,1).applyQuaternion(q);a.upL=new THREE.Vector3(0,1,0).applyQuaternion(q);
      const hp=new THREE.Vector3();a.head.getWorldPosition(hp);const s=new THREE.Vector3();a.head.getWorldScale(s);
      const top=(o.h*st-hp.y)*hs;  // from the head bone to the crown, in metres
      const add=(geo,base,role,y,parent)=>{const m=new THREE.Mesh(geo,material(base,role,shared));m.frustumCulled=false;a.mats.push(m.material);
        m.position.copy(a.upL).multiplyScalar(y/s.y);m.scale.set(1/s.x,1/s.y,1/s.z);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),a.upL);(parent||a.head).add(m);return m};
      if(o.cfg.hat){add(new THREE.CylinderGeometry(.3,.3,.016,28),0x020202,'hair',top-.06);add(new THREE.CylinderGeometry(.135,.15,.24,24),0x020202,'hair',top+.06)}
      if(o.cfg.hair){add(new THREE.CylinderGeometry(.14,.22,.85,32,1,true),0x050505,'strands',top-.4);add(new THREE.CylinderGeometry(.125,.17,.6,32,1,true),0x050505,'strands',top-.28)}  // long wet hair, hanging over the face
      // the eyes, for the glow drawn over them
      if(a.eyeMesh){const g=a.eyeMesh.geometry;g.computeBoundingBox();const b=g.boundingBox.clone().applyMatrix4(a.eyeMesh.matrixWorld),w=b.max.x-b.min.x,y=(b.min.y+b.max.y)/2;
        const inv=new THREE.Matrix4().copy(a.head.matrixWorld).invert();
        a.eyeL=[new THREE.Vector3(b.min.x+w*.22,y,b.max.z),new THREE.Vector3(b.max.x-w*.22,y,b.max.z)].map(v=>v.applyMatrix4(inv))}}
    if(o.cfg.dress&&a.hips){const s=new THREE.Vector3();a.hips.getWorldScale(s);const hp=new THREE.Vector3();a.hips.getWorldPosition(hp);
      const q=new THREE.Quaternion();a.hips.getWorldQuaternion(q);q.invert();const up=new THREE.Vector3(0,1,0).applyQuaternion(q);
      const h=hp.y+.14,m=new THREE.Mesh(new THREE.CylinderGeometry(.13,.5,h,28,6,true),material(0xd8dcd8,'dress',shared));m.frustumCulled=false;a.mats.push(m.material);
      m.position.copy(up).multiplyScalar((.16-h/2)/s.y);m.scale.set(1/s.x,1/s.y,1/s.z);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);a.hips.add(m)}
    scene.add(root);actors[key]=a;return a;
  }
  function drop(key){const a=actors[key];if(!a)return;scene.remove(a.root);a.mixer.stopAllAction();for(const m of new Set(a.mats))m.dispose();delete actors[key]}

  function play(a,pose,speed){
    const name=CLIP[pose]||CLIP.stand;
    if(a.pose!==pose){const clip=a.clips.find(c=>c.name.endsWith('|'+name));if(clip){const next=a.mixer.clipAction(clip);next.reset().setEffectiveWeight(1).fadeIn(a.act?.35:0).play();if(a.act&&a.act!==next)a.act.fadeOut(.35);a.act=next}a.pose=pose}
    if(a.act)a.act.timeScale=pose==='walk'?clamp(speed/1.15,.35,1.5)*.85:pose==='run'?clamp(speed/2.6,.7,1.5):pose==='crawl'?1.5:pose==='stand'?.45:pose==='float'?.3:pose==='scream'?.55:.7;
  }
  const _q=[],_v=[];
  function lookAtYou(a,w,max,dt){
    a.lw+=(w-a.lw)*Math.min(1,dt*3);if(!a.head||a.lw<.01)return;
    if(!_q.length){for(let i=0;i<4;i++)_q.push(new THREE.Quaternion());for(let i=0;i<3;i++)_v.push(new THREE.Vector3())}
    const[qh,qd,qp,qi]=_q,[p,cur,want]=_v;a.head.updateWorldMatrix(true,false);a.head.getWorldQuaternion(qh);a.head.getWorldPosition(p);
    cur.copy(a.fwdL).applyQuaternion(qh);want.copy(p).negate().normalize();qd.setFromUnitVectors(cur,want);
    const ang=2*Math.acos(clamp(Math.abs(qd.w),0,1));qi.identity();qd.copy(qi.slerp(qd,Math.min(1,max/Math.max(ang,1e-4))*a.lw));
    // tilt: the head cocks to one side every so often
    a.tiltT-=dt;if(a.tiltT<=0){a.tiltT=rand(1.5,5);a.tiltTo=Math.random()<.45?rand(-.45,.45):0}
    a.tilt+=(a.tiltTo-a.tilt)*Math.min(1,dt*(Math.random()<.02?40:2.5));
    qh.premultiply(qd);a.head.parent.getWorldQuaternion(qp);qp.invert();a.head.quaternion.copy(qp.multiply(qh));
    if(a.tilt)a.head.quaternion.multiply(qi.setFromAxisAngle(a.fwdL,a.tilt));
  }

  // ---------------------------------------------------------------- per frame
  // o: {body, kind, cfg, h, p:[e,n], lift, pose, vis, speed, face:'you'|'move'|bearing, look, peek, toward:[e,n,u]&k}
  function pose(key,o,dt){
    if(!init())return null;const g=load(o.body);if(!g)return null;
    let a=actors[key];if(a&&(a.body!==o.body||a.kind!==o.kind||a.cfg!==o.cfg||a.tag!==o.tag)){drop(key);a=null}
    if(!a){a=build(key,o);a.tag=o.tag}
    a.used=true;a.vis=o.vis;a.eyes=o.eyes;
    // stop-motion: now and then it freezes for a moment, then jumps on to where it really is
    a.holdCool-=dt;if(a.hold>0)a.hold-=dt;else if(a.holdCool<=0&&o.glitch){a.holdCool=rand(.8,3.5)/o.glitch;if(Math.random()<.6)a.hold=rand(.08,.35)}
    if(a.hold>0)return a;
    const fl=o.pose==='float'?.06*Math.sin(performance.now()/700):0,lift=(o.lift||0)+fl;
    const vx=a.lastP?(o.p[0]-a.lastP[0])/Math.max(dt,1e-3):0,vy=a.lastP?(o.p[1]-a.lastP[1])/Math.max(dt,1e-3):0,sp=Math.min(Math.hypot(vx,vy),8);
    a.spd+=(sp-a.spd)*Math.min(1,dt*5);a.lastP=[o.p[0],o.p[1]];const v=o.v||(sp>.05&&sp<8?[vx,vy]:null);
    let wantYaw;const toYou=Math.atan2(-o.p[0],o.p[1]);
    if(typeof o.face==='number')wantYaw=Math.atan2(Math.sin(o.face*D2R),-Math.cos(o.face*D2R));
    else if(o.face==='move'&&v&&Math.hypot(v[0],v[1])>.05)wantYaw=Math.atan2(v[0],-v[1]);
    else if(o.face==='move')wantYaw=a.yaw;
    else wantYaw=toYou;
    let dy=wantYaw-a.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));a.yaw+=dy*Math.min(1,dt*(o.pose==='run'?8:3.5));
    a.root.position.set(o.p[0],-CAM_H+lift,-o.p[1]);
    const lean=o.pose==='float'?clamp(a.spd/5,0,1)*.7:o.pose==='crawl'?1.25:0;
    a.root.rotation.set(0,0,0);a.root.rotateY(a.yaw);a.root.rotateX(lean);
    if(o.pose==='crawl'){a.root.position.y=-CAM_H+.3;a.root.position.x-=Math.sin(a.yaw)*1.1;a.root.position.z-=Math.cos(a.yaw)*1.1}  // head first, chest where it is
    if(o.toward){const k=o.toward.k,t=toT(o.toward.p);a.root.position.lerp(t,k);a.root.scale.setScalar(Math.max(.05,1-k*.95))}else a.root.scale.setScalar(1);
    play(a,o.pose,o.speed??a.spd);a.mixer.update(dt);
    a.shared.uFloor.value=-CAM_H+lift*.6;a.shared.uFade.value=o.cfg.fade||(o.pose==='float'?.9:o.kind==='wraith'?1.1:.45);
    a.root.updateMatrixWorld(true);
    lookAtYou(a,o.look??1,o.cfg.owl?2.9:1.25,dt);
    // peeking round an invisible edge: only one side of it shows
    const cl=a.shared.clip;if(o.peek){const n=toT(O.R).multiplyScalar(o.peek).normalize();cl.normal.copy(n);cl.constant=-n.dot(a.root.position)+.06}else{cl.normal.set(1,0,0);cl.constant=1e4}
    return a;
  }
  // render every body posed this frame into the 2D canvas
  function flush(lens,t){
    if(!R)return;let any=false,pale=false,fast=false;
    for(const k in actors){const a=actors[k];a.root.visible=a.used&&a.vis>.01&&lens!=='sls';if(a.root.visible){any=true;if(a.kind==='pale')pale=true;if(a.spd>2.2)fast=true;
      if(a.lens!==lens)restyle(a,lens);a.shared.uVis.value=Math.min(1,a.vis*(a.kind==='pale'?room:1));a.shared.uTime.value=t}a.used=false}
    if(!any)return;
    const pr=Math.min(DPR,1.25),w=Math.round(W*pr),h=Math.round(H*pr);if(cnv.width!==w||cnv.height!==h)R.setSize(w,h,false);
    camera.position.set(0,0,0);camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(toT(O.R),toT(O.U),toT(O.F).negate()));
    camera.fov=2*Math.atan(H/2/fpx)/D2R;camera.aspect=W/H;camera.updateProjectionMatrix();
    R.render(scene,camera);
    cx.save();
    if(fast&&trailC.width){cx.globalAlpha=.32;cx.drawImage(trailC,0,0,W,H)}  // smear behind something fast
    cx.globalAlpha=1;if(pale&&lens!=='thermal')cx.filter='blur(.7px)';cx.drawImage(cnv,0,0,W,H);cx.filter='none';
    if(pale){const gw=Math.max(8,W/6|0),gh=Math.max(8,H/6|0);if(glowC.width!==gw){glowC.width=gw;glowC.height=gh}glowX.clearRect(0,0,gw,gh);glowX.drawImage(cnv,0,0,gw,gh);
      cx.globalCompositeOperation='lighter';cx.globalAlpha=lens==='thermal'?0:clamp(.55*room,.2,.7);cx.drawImage(glowC,0,0,W,H)}
    cx.restore();
    if(fast){const tw=W/2|0,th=H/2|0;if(trailC.width!==tw){trailC.width=tw;trailC.height=th}trailX.clearRect(0,0,tw,th);trailX.drawImage(cnv,0,0,tw,th)}else if(trailC.width)trailC.width=0;
    // its eyes: glowing for some, deep black holes for the pale ones (only while it faces you)
    const v=new THREE.Vector3(),f=new THREE.Vector3(),q=new THREE.Quaternion();
    for(const k in actors){const a=actors[k];if(!a.root.visible||!a.eyeL||lens==='thermal'||lens==='sls')continue;
      a.head.getWorldQuaternion(q);f.copy(a.fwdL).applyQuaternion(q);a.head.getWorldPosition(v);const facing=-f.dot(v.normalize());if(facing<.25)continue;
      const glow=a.eyes==='red'||a.eyes==='white',col=a.eyes==='red'?'#ff2a14':'#f2fff8';if(!glow&&a.kind!=='pale')continue;
      cx.save();cx.globalCompositeOperation=glow?'lighter':'source-over';cx.globalAlpha=Math.min(1,a.vis*(glow?1.4:1.1))*clamp((facing-.25)*3,0,1)*(Math.random()<.04?.2:1);
      for(const e of a.eyeL){v.copy(e).applyMatrix4(a.head.matrixWorld);const p=proj(fromT(v));if(!p)continue;
        if(glow){const r=clamp(.022*p.s,1.5,30),g=cx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*3);g.addColorStop(0,'#fff');g.addColorStop(.18,col);g.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=g;cx.fillRect(p.x-r*3,p.y-r*3,r*6,r*6)}
        else{const r=clamp(.03*p.s,1.5,60),g=cx.createRadialGradient(p.x,p.y+r*.15,0,p.x,p.y+r*.15,r);g.addColorStop(0,'rgba(0,0,0,.97)');g.addColorStop(.55,'rgba(0,0,0,.85)');g.addColorStop(1,'rgba(0,0,0,0)');
          cx.fillStyle=g;cx.beginPath();cx.ellipse(p.x,p.y+r*.15,r,r*1.25,0,0,7);cx.fill()}}
      cx.restore()}
  }
  // the SLS camera's stick figure, from the body's real bones
  const SLS=[['Head','Neck'],['Neck','Chest'],['Chest','Hips'],['Neck','UpperArmL'],['UpperArmL','LowerArmL'],['LowerArmL','WristL'],['Neck','UpperArmR'],['UpperArmR','LowerArmR'],['LowerArmR','WristR'],
    ['Hips','UpperLegL'],['UpperLegL','LowerLegL'],['LowerLegL','FootL'],['Hips','UpperLegR'],['UpperLegR','LowerLegR'],['LowerLegR','FootR']];
  function bones(key,alpha,col,glitch,label){
    const a=actors[key];if(!a)return false;const P={},v=new THREE.Vector3();
    if(!a.bmap){a.bmap={};a.root.traverse(o=>{if(o.isBone)a.bmap[o.name]=o})}
    for(const[n,b]of Object.entries(a.bmap)){b.getWorldPosition(v);const q=proj(fromT(v));if(q)P[n]={x:q.x+(glitch?rand(-1,1)*q.s*.03:0),y:q.y+(glitch?rand(-1,1)*q.s*.03:0),s:q.s}}
    cx.save();cx.globalAlpha=alpha;cx.strokeStyle=cx.fillStyle=col;cx.shadowColor=col;cx.shadowBlur=10;cx.lineWidth=3;
    for(const[x,y]of SLS){if(!P[x]||!P[y]||(glitch&&Math.random()<.1))continue;cx.beginPath();cx.moveTo(P[x].x,P[x].y);cx.lineTo(P[y].x,P[y].y);cx.stroke()}
    for(const k of['Head','Neck','Hips','LowerArmL','LowerArmR','WristL','WristR','LowerLegL','LowerLegR','FootL','FootR'])if(P[k]){cx.beginPath();cx.arc(P[k].x,P[k].y,k==='Head'?Math.max(4,.075*P[k].s):3.5,0,7);k==='Head'?cx.stroke():cx.fill()}
    if(label&&P.Head){cx.shadowBlur=0;cx.font='12px ui-monospace,monospace';cx.textAlign='center';cx.fillText(label,P.Head.x,P.Head.y-Math.max(14,.2*P.Head.s))}
    cx.restore();return true;
  }
  function forget(key){if(key)drop(key);else for(const k in actors)drop(k)}
  return{RIG,init,load,pose,flush,bones,forget,_a:actors,get ready(){return!!R},get room(){return room},set room(v){room=v}};
})();
