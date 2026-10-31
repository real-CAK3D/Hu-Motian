// Ghost Hunter walk-around AR (Android Chrome, ARCore): with WebXR the phone knows where it is in the room,
// not just which way it's pointing. Walk up to a ghost, round it, away from it; the floor is the real floor.
// The app keeps the phone at the origin of its world, so as you move, everything staged moves the other way.
'use strict';
const XRS=(()=>{
  const X={on:false,ok:false,session:null,space:null,gl:null,psi:0,last:null,fpx:0,R:[1,0,0],U:[0,0,1],F:[0,1,0],h:1.4,walked:0};
  if(navigator.xr&&navigator.xr.isSessionSupported)navigator.xr.isSessionSupported('immersive-ar').then(s=>{X.ok=!!s;if(window.uiSync)uiSync()}).catch(()=>{});
  // xr (x right, y up, z back) -> world (east, north, up), turned by psi so the room keeps the heading it had
  const map=(v,psi)=>{const e=v[0],n=-v[2],c=Math.cos(psi),s=Math.sin(psi);return[e*c+n*s,-e*s+n*c,v[1]]};
  const qrot=(q,v)=>{const[x,y,z,w]=q,tx=2*(y*v[2]-z*v[1]),ty=2*(z*v[0]-x*v[2]),tz=2*(x*v[1]-y*v[0]);return[v[0]+w*tx+y*tz-z*ty,v[1]+w*ty+z*tx-x*tz,v[2]+w*tz+x*ty-y*tx]};  // q v q*
  // move the whole staged world by -d (you walked d)
  function shift(dx,dy){
    const sh=p=>{if(p){p[0]-=dx;p[1]-=dy}};
    sh(G.p);sh(G.anchor);for(const k of['to','a','b'])if(Array.isArray(G.bs[k]))sh(G.bs[k]);if(G.bs.subS)for(const k of['to','a','b'])if(Array.isArray(G.bs.subS[k]))sh(G.bs.subS[k]);
    for(const c of WORLD.cold)sh(c.p);for(const o of WORLD.orbs)sh(o.p);for(const s of WORLD.shadows){sh(s.a);sh(s.b)}for(const b of RD.blips)sh(b.p);
    const B=BUST.state;if(B.trap){sh(B.trap.p);sh(B.trap.from);sh(B.trap.to)}for(const s of B.scorch)sh(s.p);for(const s of B.slimeDrops)sh(s.p);for(const s of B.spits)sh(s.p);if(B.lastDrop)sh(B.lastDrop);
    const A=AMB._A;for(const m of A.mist)sh(m.p);for(const o of A.props)sh(o.p);
    for(const k in G3._a){const a=G3._a[k];if(a.lastP)sh(a.lastP)}
  }
  async function start(){
    if(X.on||!X.ok)return;
    try{
      const s=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local-floor','dom-overlay'],domOverlay:{root:document.body}});
      X.session=s;X.space=await s.requestReferenceSpace('local-floor');
      const c=document.createElement('canvas');X.gl=c.getContext('webgl',{xrCompatible:true,alpha:true});if(X.gl.makeXRCompatible)await X.gl.makeXRCompatible();
      s.updateRenderState({baseLayer:new XRWebGLLayer(s,X.gl)});
      if(cam.stream){for(const t of cam.stream.getTracks())t.stop();cam.stream=null;cam.ok=false}  // ARCore needs the camera; it draws it for us now
      X.on=true;X.last=null;X.psi=null;document.body.classList.add('xr');resize();
      s.addEventListener('end',stop);s.requestAnimationFrame(loop);
      say('Walk-around AR on. Walk up to it.');logEv('Walk-around AR started');uiSync();
    }catch(e){say('AR: '+(e.message||e),'warn')}
  }
  function stop(){if(!X.on)return;X.on=false;X.session=null;CAM_H=1.4;document.body.classList.remove('xr');resize();startCam();requestAnimationFrame(frame);logEv(`Walk-around AR ended (walked ${X.walked.toFixed(1)} m)`);uiSync()}
  function loop(ts,xf){
    const s=X.session;if(!s)return;s.requestAnimationFrame(loop);
    const gl=X.gl,L2=s.renderState.baseLayer;gl.bindFramebuffer(gl.FRAMEBUFFER,L2.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const pose=xf.getViewerPose(X.space);
    if(pose){const v=pose.views[0],q=[v.transform.orientation.x,v.transform.orientation.y,v.transform.orientation.z,v.transform.orientation.w],p=v.transform.position;
      const f=qrot(q,[0,0,-1]),r=qrot(q,[1,0,0]),u=qrot(q,[0,1,0]);
      if(X.psi==null){const hf=Math.atan2(f[0],-f[2]);X.psi=O.h*D2R-hf}  // keep facing the heading you had
      X.F=map(f,X.psi);X.R=map(r,X.psi);X.U=map(u,X.psi);X.fpx=v.projectionMatrix[5]*H/2;CAM_H=clamp(p.y,.4,2.3);
      const here=map([p.x,0,p.z],X.psi);if(X.last){const dx=here[0]-X.last[0],dy=here[1]-X.last[1],m=Math.hypot(dx,dy);if(m<1.5){shift(dx,dy);X.walked+=m;if(m>.002&&started)stat('walkedAR',m)}}X.last=here}
    frame(ts);
  }
  function toggle(){X.on?X.session.end():start()}
  return{start,toggle,shift,get on(){return X.on},get ok(){return X.ok},get fpx(){return X.fpx},get R(){return X.R},get U(){return X.U},get F(){return X.F},_X:X};
})();
