// Ghost Hunter shared haunts: ghosts are shared between everyone using the app. A ghost you find (with GPS)
// is sent to the shared map; ghosts other hunters found within 500 m of you are added to yours, so walking into
// one's area brings the same ghost out for you. Catch a shared ghost and it's gone for everyone.
'use strict';
const NET=(()=>{
  const API=/\.vercel\.app$/.test(location.hostname)?'/api/haunts':'https://hu-motian.vercel.app/api/haunts';
  const N={on:store.get('gh.share','1')==='1',hunter:store.get('gh.hunter','')||'Hunter '+Math.random().toString(16).slice(2,6).toUpperCase(),last:null,lastT:0,busy:false,ok:null,pending:[]};
  store.set('gh.hunter',N.hunter);
  try{N.pending=JSON.parse(store.get('gh.netq','[]'))||[]}catch(e){}
  const saveQ=()=>store.set('gh.netq',JSON.stringify(N.pending.slice(-40)));
  async function post(body){const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok&&r.status>=500)throw new Error('server '+r.status);return r.ok}
  // anything that couldn't be sent (no signal) waits here and goes out on the next sync
  async function flush(){for(const b of N.pending.slice()){try{await post(b);N.pending.splice(N.pending.indexOf(b),1)}catch(e){break}}saveQ()}
  function send(body){if(!N.on)return;N.pending.push(body);saveQ();flush()}
  // you found it (and it has a home on the map): share it
  function share(s){if(!s.home||s.shared)return;send({ghost:{id:s.id,type:s.type,name:s.name,story:s.story,level:s.level,anger:s.baseAnger,hp:s.hp,home:s.home},hunter:N.hunter})}
  // you caught it: if it lives on the shared map, it's gone for everyone
  function caught(s){if(!s.home)return;send({caught:s.id,lat:s.home.lat,lon:s.home.lon,hunter:N.hunter})}
  async function sync(force){
    if(!N.on||N.busy||!started||!GPS.ok||GPS.acc>80||MODE==='real'||document.visibilityState!=='visible')return;
    const moved=N.last?geoDist(N.last[0],N.last[1],GPS.lat,GPS.lon):1e9;if(!force&&moved<120&&Date.now()-N.lastT<45000)return;
    N.busy=true;try{
      await flush();
      const r=await fetch(`${API}?lat=${GPS.lat.toFixed(5)}&lon=${GPS.lon.toFixed(5)}`,{cache:'no-store'});if(!r.ok)throw new Error('server '+r.status);
      const j=await r.json();N.ok=true;N.last=[GPS.lat,GPS.lon];N.lastT=Date.now();let added=0;
      for(const h of j.haunts||[]){if(DB.ghosts.some(g=>g.id===h.id))continue;if(!TYPES.some(t=>t.id===h.type))continue;
        DB.ghosts.push({id:h.id,type:h.type,name:h.name,story:h.story||'',level:h.level,anger:h.anger,baseAnger:h.anger,hp:h.hp,home:h.home,state:'free',firstSeen:null,lastSeen:null,
          sightings:0,evidence:[],identified:false,attacks:0,provoked:0,escapes:0,capturedAt:null,shared:true,finder:h.finder,foundAt:h.foundAt});added++}
      for(const c of j.caught||[]){const g=DB.ghosts.find(x=>x.id===c.id);if(!g||g.state!=='free')continue;
        if(G.spec===g&&active())dismiss(`${c.by} just caught it.`);
        if(g.shared&&!g.firstSeen)DB.ghosts.splice(DB.ghosts.indexOf(g),1);else{g.state='taken';g.takenBy=c.by;g.takenAt=c.at;logEv(`${g.identified?g.name:'An entity you found'} was caught by ${c.by}`)}}
      if(added){saveDB();stat('sharedFound',added);say(added===1?'Another hunter reported activity nearby.':`Other hunters reported ${added} entities nearby.`);logEv(`${added} entit${added===1?'y':'ies'} reported nearby by other hunters`)}
      else if(j.caught&&j.caught.length)saveDB();
    }catch(e){N.ok=false}finally{N.busy=false}
  }
  setInterval(()=>sync(false),5000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync(true)});
  function setOn(v){N.on=v;store.set('gh.share',v?'1':'0');if(v)sync(true)}
  function setHunter(v){N.hunter=String(v||'').replace(/[<>]/g,'').trim().slice(0,24)||N.hunter;store.set('gh.hunter',N.hunter)}
  return{share,caught,sync,setOn,setHunter,get on(){return N.on},get hunter(){return N.hunter},get ok(){return N.ok},get pending(){return N.pending.length}};
})();
