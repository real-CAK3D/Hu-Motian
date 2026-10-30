// Ghost Hunter spirits: the bestiary, each ghost's behaviour, evidence and identification, capture,
// the GPS haunt map (ghosts stay where you found them), leads, and the stats.
'use strict';
let inViewFn=()=>false;  // set by the view (depends on the camera's field of view)
let say=()=>{};          // set by the view

// ================================================================ bestiary
// beh: weighted behaviours. Movement: still wander pace stare beckon point approach stalk chase swoop circle flee hide peek float crawl teleport mimic unpredictable
// Events (brief, then back to moving): knock throw flicker giggle cry growl scream whisper
const TYPES=[
  {id:'residual',name:'Residual imprint',rarity:1,lv:[1,3],anger:[0,5],look:{kind:'pale',h:1.72,a:.5},beh:{pace:8,still:1},ev:{whisper:1},speed:.7,hp:1,cold:.4,ignores:1,
    desc:'A moment replaying itself. It walks the same path over and over and never notices you.'},
  {id:'orbs',name:'Spirit lights',rarity:1,lv:[1,2],anger:[0,10],look:{kind:'orbs'},beh:{float:5,wander:3,circle:2,flee:1},ev:{},speed:.6,hp:.6,cold:.2,
    desc:'Drifting points of light. Curious, harmless, easily startled.'},
  {id:'mist',name:'Ectoplasmic mist',rarity:2,lv:[1,4],anger:[0,20],look:{kind:'mist',h:1.6},beh:{wander:4,still:3,approach:2},ev:{whisper:1},speed:.35,hp:1,cold:1,
    desc:'A freezing column of fog that drifts toward warmth.'},
  {id:'shadow',name:'Shadow person',rarity:2,lv:[2,5],anger:[10,40],look:{kind:'shadow',h:1.75},beh:{stare:4,hide:4,peek:3,stalk:2,wander:2},ev:{whisper:2,knock:1},speed:1.6,hp:1.2,cold:.7,
    words:['watching','here','go'],desc:'A human-shaped absence of light. It watches from doorways and slips away when you look.'},
  {id:'wanderer',name:'Wandering soul',rarity:1,lv:[1,4],anger:[0,20],look:{kind:'pale',h:1.72,a:.6},beh:{wander:6,still:2,stare:1,beckon:1},ev:{whisper:2,cry:1},speed:.8,hp:1,cold:.6,
    words:['lost','home','where','cold','help'],desc:'Confused and lost. Walks without purpose and may follow you for company.'},
  {id:'child',name:'Lost child',rarity:3,lv:[2,5],anger:[0,30],look:{kind:'pale',h:1.15,a:.6},beh:{beckon:5,flee:3,peek:3,point:2,hide:1},ev:{giggle:4,whisper:1},speed:1.9,hp:1.1,cold:.6,
    words:['play','mommy','here','come','hide','find me'],desc:'Giggles, hides, and waves for you to come and play. Follow it and it may lead you somewhere.'},
  {id:'guide',name:'Guide',rarity:3,lv:[3,6],anger:[0,15],look:{kind:'pale',h:1.8,a:.5,glow:1},beh:{point:6,beckon:3,still:2},ev:{whisper:1},speed:.9,hp:1.4,cold:.5,
    words:['that way','follow','there','find them'],desc:'A calm presence that points the way. Its directions lead to other spirits.'},
  {id:'bride',name:'Woman in white',rarity:3,lv:[3,6],anger:[10,50],look:{kind:'pale',h:1.68,a:.7,dress:1,hair:1},beh:{float:4,stare:2,beckon:2,approach:2},ev:{cry:4,whisper:1},speed:.6,hp:1.6,cold:.9,
    words:['where is he','waiting','alone','why','cold'],desc:'Drifts in a pale gown, weeping. She is waiting for someone who never came.'},
  {id:'poltergeist',name:'Poltergeist',rarity:3,lv:[3,7],anger:[30,70],look:{kind:'none'},beh:{wander:3,unpredictable:2,still:1},ev:{throw:5,knock:4,flicker:4,bang:2},speed:2,hp:1.8,cold:.5,
    words:['get out','mine','go','no'],desc:'Never seen, only heard. Knocks, throws things, and plays with the lights.'},
  {id:'stalker',name:'Stalker',rarity:3,lv:[4,7],anger:[40,70],look:{kind:'shadow',h:1.82},beh:{stalk:8,stare:2},ev:{whisper:2},speed:2.4,hp:2,cold:.8,
    words:['closer','behind you','turn around'],desc:'It only moves when you aren\'t looking. Every time you turn back, it\'s closer.'},
  {id:'hatman',name:'The Hat Man',rarity:4,lv:[6,9],anger:[30,70],look:{kind:'shadow',h:2.05,hat:1,eyes:'red'},beh:{stare:6,stalk:3,still:2,teleport:2,chase:1},ev:{whisper:2,flicker:1},speed:1.4,hp:2.6,cold:1,
    words:['watching','mine','stay','sleep'],desc:'Very tall, with a wide-brimmed hat. Reported standing over sleepers. It is always watching.'},
  {id:'wraith',name:'Wraith',rarity:4,lv:[5,8],anger:[50,85],look:{kind:'wraith',h:1.9},beh:{swoop:5,float:3,circle:3},ev:{scream:1,whisper:1},speed:4,hp:2.2,cold:1,
    words:['die','leave','mine'],desc:'A ragged floating shape that circles, then dives at you at terrifying speed.'},
  {id:'revenant',name:'Revenant',rarity:4,lv:[5,8],anger:[60,95],look:{kind:'shadow',h:1.86,eyes:'red'},beh:{chase:5,stare:3,approach:2},ev:{growl:3,bang:1},speed:2.7,hp:2.4,cold:.9,
    words:['get out','leave','you','mine'],desc:'Came back with a grudge. Hostile, persistent, and it runs.'},
  {id:'banshee',name:'Banshee',rarity:4,lv:[5,8],anger:[40,80],look:{kind:'pale',h:1.7,a:.75,hair:1,dress:1},beh:{float:3,swoop:2,stare:2},ev:{scream:4,cry:1},speed:3,hp:2.2,cold:1,
    words:['death','soon','cry'],desc:'Her wail is said to foretell a death. Cover your ears.'},
  {id:'hound',name:'Black dog',rarity:3,lv:[3,6],anger:[30,70],look:{kind:'animal',h:.85,eyes:'red'},beh:{circle:4,chase:3,stare:2,wander:1},ev:{growl:4},speed:3.2,hp:1.6,cold:.7,
    desc:'A huge black dog with burning eyes. Omens follow wherever it goes.'},
  {id:'trickster',name:'Trickster',rarity:3,lv:[3,7],anger:[20,60],look:{kind:'shadow',h:1.6},beh:{unpredictable:6,teleport:4,mimic:3,point:2},ev:{giggle:2,knock:1},speed:2,hp:1.8,cold:.6,
    words:['wrong way','ha','here','no, here','fooled you'],desc:'Lies, mimics and misleads. Don\'t trust where it points.'},
  {id:'doppel',name:'Doppelgänger',rarity:5,lv:[6,9],anger:[30,70],look:{kind:'pale',h:1.75,a:.85},beh:{mimic:6,stare:3,stalk:2},ev:{whisper:2},speed:1.6,hp:2.6,cold:.8,
    words:['me','you','behind you'],desc:'It looks like you. It stands right where you just were.'},
  {id:'inhuman',name:'Inhuman',rarity:5,lv:[8,10],anger:[70,100],look:{kind:'demon',h:2,eyes:'red'},beh:{crawl:4,chase:4,teleport:2,swoop:1},ev:{growl:4,flicker:2,bang:2},speed:3.4,hp:3.5,cold:1,
    words:['die','mine','leave','no god'],desc:'Not human, and never was. Don\'t provoke it. Don\'t let it follow you home.'},
];
const typeOf=g=>TYPES.find(t=>t.id===(g&&g.type))||TYPES[0];
const RARITY=['','Common','Uncommon','Rare','Very rare','Legendary'];
const BEH_TEXT={still:'Standing still',wander:'Wandering',pace:'Pacing',stare:'Staring at you',beckon:'Beckoning you closer',point:'Pointing',approach:'Approaching',stalk:'Stalking',
  chase:'CHASING YOU',swoop:'Diving at you',circle:'Circling you',flee:'Fleeing',hide:'Hiding',peek:'Peeking',float:'Floating',crawl:'Crawling',teleport:'Blinking around',mimic:'Mimicking',
  unpredictable:'Erratic',retreat:'Retreating',attack:'ATTACKING'};
const EVIDENCE={apparition:'Apparition',emf5:'EMF level 5',cold:'Freezing temps',box:'Spirit box',words:'Word box',evp:'EVP',sls:'SLS figure',dots:'Laser grid'};
const hostility=a=>a<20?'Passive':a<40?'Uneasy':a<60?'Agitated':a<80?'Hostile':'Enraged';
const threat=g=>{const s=g.level*10*.6+g.anger*.4;return s<25?'Low':s<45?'Moderate':s<65?'High':'Extreme'};

// names: humans get a name, a year and a story; the rest get an epithet
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0}
function rng(seed){let s=seed||1;return()=>{s=Math.imul(s^s>>>15,1|s);s^=s+Math.imul(s^s>>>7,61|s);return((s^s>>>14)>>>0)/4294967296}}
const NM={m:['Thomas','William','Elijah','Samuel','Henry','Josiah','Walter','Edgar','Silas','Arthur','Amos','Jedediah','Clarence','Otis','Ezra','Virgil','Harold','Calvin','Abner','Roy'],
  f:['Mary','Eliza','Abigail','Clara','Ada','Hattie','Mabel','Ruth','Lydia','Constance','Florence','Edith','Agnes','Minnie','Opal','Beatrice','Delia','Cora','Ivy','Winifred'],
  c:['Tommy','Annie','Lucy','Billy','Molly','Charlie','Rose','Jack','Emmy','Ollie'],
  last:['Hargrove','Whitlock','Pryor','Blackwood','Ashby','Crane','Holloway','Mercer','Thorne','Graves','Fenwick','Calloway','Shaw','Pike','Ellison','Vance','Morrow','Kettering','Dunmore','Sloane']};
const FATES=['drowned in the river','lost in a house fire','died of fever','fell from the stairs','never came home from the war','disappeared one winter night','was buried without a name','died waiting by the window','was struck down in the barn','vanished in the flood'];
const EPI={orbs:['Fireflies','The Lanterns','Will-o\'-the-wisps'],mist:['The Fog','Cold Breath','Grey Veil'],poltergeist:['The Thrower','Knocker','Rattlebones'],hound:['Black Shuck','Old Grim','Barghest'],
  inhuman:['The Nameless','Crooked One','Thing Beneath'],hatman:['The Hat Man'],wraith:['The Tatters','Screaming Rags','Hollow'],stalker:['The Follower','Closer','Mr. Behind'],trickster:['Jack Lies','The Fool','Mischief'],
  doppel:['Your Double','The Copy'],shadow:['The Watcher','Doorway Man','Slip'],guide:['The Usher','Lantern Bearer','Pointing Lady']};
function makeGhost(typeId){
  const T=typeId?TYPES.find(t=>t.id===typeId):pickType(),id=Date.now().toString(36)+Math.random().toString(36).slice(2,7),r=rng(hash(id));
  const level=T.lv[0]+Math.floor(r()*(T.lv[1]-T.lv[0]+1)),anger=Math.round(T.anger[0]+r()*(T.anger[1]-T.anger[0]));
  const pickR=a=>a[Math.floor(r()*a.length)];let name,story='';
  if(EPI[T.id]&&(T.id!=='shadow'&&T.id!=='guide'||r()<.6))name=pickR(EPI[T.id]);
  else{const sex=T.id==='bride'||T.id==='banshee'?'f':T.id==='child'?'c':r()<.5?'m':'f',year=1760+Math.floor(r()*230);
    name=`${pickR(NM[sex])} ${pickR(NM.last)}`;story=`${T.id==='doppel'?'Took the face of someone who':pickR(['Lived here and','Worked nearby and','Passed through and','Was born here and'])} ${pickR(FATES)}, ${year}.`}
  return{id,type:T.id,name,story,level,anger,baseAnger:anger,hp:+(T.hp*(1+level*.15)).toFixed(2),home:null,state:'free',firstSeen:null,lastSeen:null,sightings:0,evidence:[],identified:false,attacks:0,provoked:0,escapes:0,capturedAt:null};
}
function pickType(){const w=[0,10,6,3.2,1.4,.5];let tot=0;for(const t of TYPES)tot+=w[t.rarity];let x=Math.random()*tot;for(const t of TYPES){x-=w[t.rarity];if(x<=0)return t}return TYPES[0]}

// ================================================================ database: ghosts you've met, leads, stats (saved on this phone)
const DB=(()=>{try{const d=JSON.parse(store.get('gh.db',''));if(d&&d.ghosts)return d}catch(e){}return{ghosts:[],leads:[],stats:{}}})();
const ST=DB.stats;ST.types=ST.types||{};ST.since=ST.since||Date.now();
let dbDirty=false;const saveDB=()=>{dbDirty=true};setInterval(()=>{if(dbDirty){dbDirty=false;store.set('gh.db',JSON.stringify(DB))}},2000);
addEventListener('pagehide',()=>store.set('gh.db',JSON.stringify(DB)));
function stat(k,n=1){ST[k]=(ST[k]||0)+n;saveDB()}
function typeStat(id,k){const t=ST.types[id]=ST.types[id]||{seen:0,ided:0,caught:0};t[k]++;saveDB()}
const ghostById=id=>DB.ghosts.find(g=>g.id===id);

// ================================================================ world: the staged haunting
const WORLD={cold:[],orbs:[],shadows:[],nextOrb:8,nextShadow:rand(30,55)};
// G is the ghost you're dealing with right now (spec = its saved record)
const G={state:'idle',spec:null,wait:3,p:[0,6,0],v:[0,0,0],lift:0,vis:0,age:0,beh:'still',behT:0,bs:{},pose:'stand',face:1,anger:0,aimT:0,hold:0,trapT:0,scareT:0,cool:0,
  stepT:0,evT:5,seen:false,warned:false,dart:null,coldT:0,resident:false,pointBear:null,peekSide:1,lookHist:[]};
const gDist=()=>len2(G.p),gBear=()=>headingOf(G.p);
const active=()=>G.state==='active'||G.state==='charge';
const T_=()=>typeOf(G.spec);
const visibleKind=()=>T_().look.kind!=='none';
function summon(spec,bear,dist,resident){
  Object.assign(G,{state:'active',spec,p:atBearing(bear,dist),v:[0,0,0],lift:0,vis:0,age:0,beh:'still',behT:0,bs:{},pose:'stand',anger:spec.anger,aimT:0,hold:0,seen:false,warned:false,
    dart:null,coldT:1,stepT:0,evT:rand(4,9),resident:!!resident,pointBear:null});
  G.anchor=[G.p[0],G.p[1]];pickBehavior();
  say(resident?'Readings… something lives here.':MODE==='hunt'?'It\'s here. Look around…':'EMF fluctuation detected… sweep slowly.');
  logEv(`${resident?'Returned to the haunt of':'EMF spike'} ${resident&&spec.identified?spec.name:'an unknown entity'} at ${Math.round(((bear%360)+360)%360)}°`);
}
function dismiss(msg){if(!active()&&G.state!=='trapped')return;G.state='idle';G.wait=rand(15,40);G.spec=null;if(msg)say(msg)}
function spawnNew(bear,dist){summon(makeGhost(),bear,dist,false)}

// ---- choosing what it does next: its type's habits, bent by its mood
function pickBehavior(force){
  const T=T_(),a=G.anger/100,w={...T.beh};
  if(!T.ignores){
    if(a>.55){w.chase=(w.chase||0)+(a-.5)*8*(T.look.kind==='orbs'||T.look.kind==='mist'?0:1);w.approach=(w.approach||0)+a*2;if(T.look.kind==='wraith'||T.id==='banshee'||T.id==='inhuman')w.swoop=(w.swoop||0)+a*4;w.flee=(w.flee||0)*.3;w.beckon=(w.beckon||0)*.3}
    if(a<.3){for(const k of['chase','swoop','crawl'])if(w[k])w[k]*=.25;w.still=(w.still||0)+1}
  }
  if(force)return setBeh(force);
  let tot=0;for(const k in w)tot+=w[k];let x=Math.random()*tot,b='still';for(const k in w){x-=w[k];if(x<=0){b=k;break}}
  setBeh(b);
}
function setBeh(b){
  const T=T_();G.beh=b;G.bs={};G.behT={unpredictable:rand(1.5,3),teleport:rand(6,10),swoop:20,chase:20,stalk:30,point:rand(6,9),beckon:rand(6,10),peek:rand(5,8),pace:rand(15,25)}[b]||rand(5,11);
  G.lift=b==='float'||b==='swoop'||T.look.kind==='wraith'?rand(.3,.7):0;
  if(b==='point')makeLead();
  if(b==='peek'){const side=Math.random()<.5?-1:1;G.peekSide=side;G.p=atBearing(O.h+side*rand(20,35),rand(3,4.5));G.anchor=[G.p[0],G.p[1]]}
  if(b==='mimic'){const old=G.lookHist[0];const dir=old||O.F;G.p=[dir[0]*3.2,dir[1]*3.2,0];if(Math.random()<.4)G.p=[-O.F[0]*2.5,-O.F[1]*2.5,0];whoosh(.5,G.p)}
  if(b==='swoop'){G.bs.phase='circle';G.bs.t=0}
  if(b==='pace'){const d=gDist()||1,perp=[-G.p[1]/d,G.p[0]/d];G.bs.a=[G.anchor[0]-perp[0]*2,G.anchor[1]-perp[1]*2];G.bs.b=[G.anchor[0]+perp[0]*2,G.anchor[1]+perp[1]*2];G.bs.to='b'}
  if(b==='chase'){say(pick(['IT\'S COMING!','RUN!','It\'s coming for you!']),'alert');growl(G.p);hwOut('fx strobe 900 255 40 20',true)}
}
const moveTo=(tx,ty,s,dt)=>{const dx=tx-G.p[0],dy=ty-G.p[1],d=Math.hypot(dx,dy);if(d<.05){G.v=[0,0,0];return true}const k=Math.min(s*dt,d)/d;G.v=[dx/d*s,dy/d*s,0];G.p[0]+=dx*k;G.p[1]+=dy*k;return d<.15};
const towardMe=s=>{const d=gDist()||1;return[-G.p[0]/d*s,-G.p[1]/d*s,0]};
function attackStart(){if(G.state!=='active')return;G.state='charge';G.bs.c=0;say(pick(['IT\'S COMING!','THERE!','LOOK OUT!']),'alert');growl(G.p);whoosh(1.1,G.p);logEv(`${nm()} attacked`);stat('attacks')}
function contact(){
  G.state='gone';G.cool=rand(8,16);G.anger=Math.max(G.spec.baseAnger,G.anger-25);G.spec.attacks++;
  if(CFG.scares){G.scareT=.6;scream();buzz([300,60,500,60,250]);if(window.scareFX)scareFX();hwOut('fx scare 1600',true)}else whoosh(.8);
  say('…it\'s gone.','warn');logEv('Contact. Readings dropped to zero');stat('scares');
}
const nm=()=>G.spec&&G.spec.identified?G.spec.name:'Unknown entity';

// ---- the behaviours
function behaviorStep(dt,seen,d){
  const T=T_(),sp=T.speed,b=G.beh,s=G.bs;G.behT-=dt;let done=G.behT<=0;
  switch(b){
    case'still':case'stare':G.v=[0,0,0];G.pose='stand';if(b==='stare'&&seen&&!T.ignores){G.anger=Math.min(100,G.anger+dt*(T.anger[1]/40));if(G.anger>85&&Math.random()<dt*.3)attackStart()}break;
    case'wander':case'float':if(!s.to||moveTo(s.to[0],s.to[1],sp*(b==='float'?.4:.55),dt)){const a=rand(0,6.28),r=rand(.5,2.5);s.to=[G.anchor[0]+Math.cos(a)*r,G.anchor[1]+Math.sin(a)*r]}G.pose=b==='float'?'float':'walk';break;
    case'pace':if(moveTo(...s[s.to],sp*.55,dt))s.to=s.to==='a'?'b':'a';G.pose='walk';break;
    case'approach':if(d>1.8)moveTo(0,0,sp*.4,dt);else G.v=[0,0,0];G.pose=d>1.8?'walk':'stand';break;
    case'beckon':G.v=[0,0,0];G.pose='beckon';if(!s.said&&seen){s.said=1;say(pick(['It\'s waving you closer…','It wants you to follow…','"Come here…"']),'warn');logEv(`${nm()} beckoned`)}
      if(G.behT<2&&!s.moved){s.moved=1;const away=[G.p[0]*1.6,G.p[1]*1.6];s.to=away}if(s.to)moveTo(s.to[0],s.to[1],sp*.6,dt);break;
    case'point':G.v=[0,0,0];G.pose='point';if(!s.said&&seen&&G.pointBear!=null){s.said=1;say(`It's pointing ${compass(G.pointBear)} (${Math.round(G.pointBear)}°)…`,'warn');logEv(`${nm()} pointed ${compass(G.pointBear)}`)}break;
    case'stalk':if(!seen&&d>1.2){const v=towardMe(sp);G.p[0]+=v[0]*dt;G.p[1]+=v[1]*dt;G.v=v;G.pose='walk'}else{G.v=[0,0,0];G.pose='stand'}
      if(d<1.4&&!s.hit){s.hit=1;if(G.anger>50)attackStart();else{whisper([G.p[0],G.p[1],.2],1.5);say('…right behind you.','warn');G.state='gone';G.cool=rand(6,12)}}done=done&&!seen;break;
    case'chase':{const v=towardMe(sp);G.p[0]+=v[0]*dt;G.p[1]+=v[1]*dt;G.v=v;G.pose='run';if(d<.45)contact();break}
    case'swoop':s.t+=dt;if(s.phase==='circle'){const a=Math.atan2(G.p[1],G.p[0])+dt*1.2,r=Math.max(3,d);G.p=[Math.cos(a)*r,Math.sin(a)*r,0];G.pose='float';if(s.t>rand(2.5,4)&&seen){s.phase='dive';say('IT\'S DIVING!','alert');whoosh(.8,G.p)}}
      else{const v=towardMe(sp*2.2);G.p[0]+=v[0]*dt;G.p[1]+=v[1]*dt;G.v=v;G.pose='float';G.lift=Math.max(0,G.lift-dt*.4);if(d<.5)contact()}done=false;break;
    case'circle':{const a=Math.atan2(G.p[1],G.p[0])+dt*sp*.25/Math.max(2,d),r=d+(3-d)*dt*.5;G.p=[Math.cos(a)*r,Math.sin(a)*r,0];G.pose=T.look.kind==='animal'?'walk':'float';break}
    case'flee':if(seen||s.go){s.go=1;const v=towardMe(-sp*1.3);G.p[0]+=v[0]*dt;G.p[1]+=v[1]*dt;G.pose='run';G.vis=Math.max(0,G.vis-dt*.5);if(d>8){G.p=[G.anchor[0],G.anchor[1],0];done=true}}else G.pose='stand';break;
    case'hide':if(seen){s.st=(s.st||0)+dt;if(s.st>.8){whoosh(.4,G.p);G.p=atBearing(O.h+180+rand(-60,60),rand(3,5));G.vis=0;done=true;logEv(`${nm()} vanished`)}}G.pose='stand';break;
    case'peek':G.v=[0,0,0];G.pose='stand';if(seen){s.st=(s.st||0)+dt;if(s.st>1.2){G.p=atBearing(gBear()+G.peekSide*15,d);G.vis=0;done=true}}break;
    case'crawl':{const v=d>1?towardMe(sp*.6):[0,0,0];G.p[0]+=v[0]*dt;G.p[1]+=v[1]*dt;G.pose='crawl';if(d<1.1&&G.anger>60)attackStart();break}
    case'teleport':s.t=(s.t||0)+dt;G.pose='stand';if(s.t>rand(1.8,3.5)){s.t=0;G.p=atBearing(gBear()+rand(-70,70),clamp(d+rand(-1.5,1.5),2,7));G.vis*=.3;bang(G.p);if(Math.random()<.3)hwOut('fx flicker 500 255 255 255')}break;
    case'mimic':G.v=[0,0,0];G.pose='stand';break;
    case'unpredictable':{if(!s.sub){s.sub=pick(['wander','stare','teleport','approach','circle','still','hide'])}const save=G.beh;G.beh=s.sub;behaviorStep(dt,seen,d);G.beh=save;break}
  }
  if(G.beh==='still'||G.beh==='stare')G.face=1;
  if(done&&G.state==='active')pickBehavior();
}
// ---- events: things it does now and then
function eventStep(dt,seen,d){
  G.evT-=dt;if(G.evT>0)return;const T=T_(),a=G.anger/100;G.evT=rand(6,14)*(1.3-a*.6);
  const w={...T.ev};if(a>.6){w.growl=(w.growl||0)+(T.look.kind==='pale'?0:1.5);w.bang=(w.bang||0)+1}let tot=0;for(const k in w)tot+=w[k];if(!tot)return;let x=Math.random()*tot,e=null;for(const k in w){x-=w[k];if(x<=0){e=k;break}}
  const p=[G.p[0],G.p[1],.2];
  switch(e){
    case'whisper':whisper(p);break;
    case'giggle':giggle(p);if(Math.random()<.4)say('…was that a giggle?','warn');break;
    case'cry':sob(p);say('Someone is crying…','warn');break;
    case'growl':growl(p);hwOut('fx flicker 600 255 0 0');break;
    case'scream':wail(p);say('THE WAIL…','alert');hwOut('fx strobe 1500 200 220 255',true);logEv(`${nm()} screamed`);break;
    case'knock':knock(atBearing(gBear(),d+1.2,-.2),Math.random()<.5?3:2);say('Knocking…','warn');logEv('Knocks heard');stat('knocks');hwOut('beep 120 80');break;
    case'bang':bang(atBearing(gBear()+rand(-40,40),d+1,-.5));logEv('A loud bang');break;
    case'throw':{const from=atBearing(gBear()+rand(-30,30),rand(1.5,3),-.3),to=atBearing(O.h+rand(-30,30),2,-.3);whoosh(.6,from);setTimeout(()=>{crash(to);if(window.shakeFX)shakeFX()},500);say('Something was thrown!','alert');logEv('Object moved / thrown');stat('throws');break}
    case'flicker':if(window.flickerFX)flickerFX();hwOut('fx flicker 1800 255 230 180',true);say('The lights…','warn');logEv('Lights flickered');stat('flickers');break;
  }
}
// a lead: something points the way; follow it (GPS) and you may find another ghost
function makeLead(){
  const T=T_(),honest=T.id!=='trickster'||Math.random()<.3;let bear=rand(0,360),target=null;
  if(GPS.ok){const others=DB.ghosts.filter(g=>g.state==='free'&&g.home&&g!==G.spec).map(g=>({g,d:geoDist(GPS.lat,GPS.lon,g.home.lat,g.home.lon),b:geoBear(GPS.lat,GPS.lon,g.home.lat,g.home.lon)})).filter(o=>o.d>25&&o.d<400).sort((a,b)=>a.d-b.d);
    if(others.length&&honest){target=others[0];bear=target.b}}
  if(!honest)bear=rand(0,360);
  G.pointBear=bear;
  if(GPS.ok&&!target&&!DB.leads.some(l=>!l.done&&l.from===G.spec.id)){const m=rand(50,150),[la,lo]=geoMove(GPS.lat,GPS.lon,bear,m);
    DB.leads.push({id:'L'+Date.now().toString(36),lat:la,lon:lo,from:G.spec.id,fromName:G.spec.identified?G.spec.name:'unknown',ts:Date.now(),done:false,fake:!honest});stat('leads');saveDB()}
}
const compass=b=>['N','NE','E','SE','S','SW','W','NW'][Math.round((((b%360)+360)%360)/45)%8];

// ---- evidence and identification
function addEvidence(k){
  if(!active()||!G.spec||G.spec.evidence.includes(k))return;G.spec.evidence.push(k);saveDB();logEv(`Evidence: ${EVIDENCE[k]}`);
  if(!G.spec.identified&&G.spec.evidence.length>=2&&G.seen!==null){G.spec.identified=true;typeStat(G.spec.type,'ided');
    say(`Identified: ${G.spec.name}, ${T_().name}`,'');logEv(`IDENTIFIED: ${G.spec.name} (${T_().name}), level ${G.spec.level}, ${hostility(G.anger)}`)}
}
function onSeen(){
  if(G.seen)return;G.seen=true;const s=G.spec;s.sightings++;s.lastSeen=Date.now();stat('sightings');
  if(!s.firstSeen){s.firstSeen=Date.now();if(GPS.ok&&GPS.acc<80)s.home={lat:GPS.lat,lon:GPS.lon,r:Math.round(rand(9,15)),acc:Math.round(GPS.acc)};
    DB.ghosts.push(s);stat('encounters');typeStat(s.type,'seen');logEv(`New entity encountered${s.home?' (saved to the map)':''}`)}
  saveDB();
}

// ---- the main ghost update
function ghostStep(dt,trapDown){
  if(G.scareT>0)G.scareT=Math.max(0,G.scareT-dt);
  if(G.state==='idle'){G.wait-=dt;if(G.wait<=0&&MODE==='ghost'&&!insideHaunt())spawnNew(O.h+rand(-160,160),rand(6,8.5));return}
  if(G.state==='gone'){G.cool-=dt;if(G.cool<=0){if(G.spec&&G.spec.state==='free'&&(G.resident||insideHauntOf(G.spec))){summon(G.spec,O.h+rand(-170,170),rand(5,8),true)}else{G.state='idle';G.spec=null;G.wait=rand(8,20);if(MODE==='ghost')say('Monitoring… quiet for now.')}}return}
  if(G.state==='trapped'){G.trapT+=dt;if(G.trapT>1.4){G.state='idle';G.spec=null;G.wait=rand(10,25)}return}
  const T=T_(),d=gDist(),aimP=[G.p[0],G.p[1],G.lift-.4],seen=inViewFn(aimP),vis=visibleKind();
  G.age+=dt;
  // remember where the camera pointed (for the mimic)
  if(!G.lookT||G.age-G.lookT>1){G.lookT=G.age;G.lookHist.push([O.F[0],O.F[1]]);if(G.lookHist.length>8)G.lookHist.shift()}
  if(G.state==='charge'){G.bs.c+=dt;const v=towardMe(2+G.bs.c*G.bs.c*14);G.p[0]+=v[0]*dt;G.p[1]+=v[1]*dt;G.v=v;G.vis=1;G.pose=T.look.kind==='animal'?'walk':T.look.kind==='demon'?'crawl':'run';
    G.stepT-=dt;if(G.stepT<=0){G.stepT=.15;footstep([G.p[0],G.p[1],-CAM_H],1)}if(gDist()<.4||G.bs.c>3)contact()}
  else{behaviorStep(dt,seen,d);eventStep(dt,seen,d)}
  if(len2(G.p)<.9&&G.state==='active'){const k=.9/len2(G.p);G.p[0]*=k;G.p[1]*=k}
  const rushing=G.beh==='chase'||G.beh==='swoop'&&G.bs.phase==='dive'||G.state==='charge';
  const tv=!vis?0:rushing?1:seen?clamp(1.35-gDist()/7.5,0,1)*(T.look.a?T.look.a/.6:1):G.beh==='stalk'?1:.0;G.vis+=(clamp(tv,0,1)-G.vis)*Math.min(1,dt*1.6);
  if(seen&&(vis?G.vis>.3:L>.75))onSeen();
  G.aimT=seen?G.aimT+dt:0;
  // anger drifts back toward its nature
  G.anger+=(G.spec.baseAnger-G.anger)*dt/90;G.spec.anger=Math.round(G.anger);
  const sp=Math.hypot(G.v[0],G.v[1]);G.stepT-=dt;if(sp>.25&&G.stepT<=0&&G.lift<.1&&vis&&T.look.kind!=='orbs'&&T.look.kind!=='mist'){G.stepT=sp>1.5?.28:.62;footstep([G.p[0],G.p[1],-CAM_H],sp>1.5?.8:.5)}
  G.coldT-=dt;if(G.coldT<=0){G.coldT=rand(3,5)/T.cold;WORLD.cold.push({p:[G.p[0],G.p[1],-.5],r:rand(.6,.9),s:T.cold,v:[rand(-.05,.05),rand(-.05,.05),0]});if(WORLD.cold.length>14)WORLD.cold.shift()}
  if(d<4.2&&!G.warned&&G.state==='active'){G.warned=true;say('Strong readings. It\'s close…','warn')}
  // evidence the tools pick up
  if(L>.82&&ledCount(L)>=5)addEvidence('emf5');
  if(TEMP.amb!=null&&TEMP.amb<TEMP.base-4.5||spotTempStaged()<TEMP.base-5)addEvidence('cold');
  if(seen&&G.vis>.35){addEvidence('apparition');if(DEV==='sls')addEvidence('sls');if(DEV==='laser')addEvidence('dots')}
  if(CFG.radarTrig&&radarLive()&&RD.r&&RD.r.s&1&&RD.r.md<300&&G.age>4&&!T.ignores&&G.state==='active'&&G.anger>30)attackStart();
  // capture: hold TRAP while it's in your sights and close. It fights back.
  const can=active()&&seen&&d<5;
  if(trapDown&&can){const need=1+G.spec.level*.3+G.anger*.012;G.hold+=dt;G.anger=Math.min(100,G.anger+dt*4);
    if(Math.random()<dt*(G.anger/100)*.35*(T.ignores?0:1)){G.hold=0;G.spec.escapes++;stat('escapes');say('IT BROKE FREE!','alert');logEv(`${nm()} broke free of the trap`);G.anger=Math.min(100,G.anger+15);bang(G.p);if(G.anger>70)attackStart()}
    else if(G.hold>=need)capture()}
  else G.hold=Math.max(0,G.hold-dt*2);
  G.trapNeed=1+(G.spec?G.spec.level*.3+G.anger*.012:0);
}
function capture(){
  const s=G.spec;G.state='trapped';G.trapT=0;G.hold=0;s.state='captured';s.capturedAt=Date.now();if(GPS.ok)s.capturedWhere={lat:GPS.lat,lon:GPS.lon};
  if(!s.firstSeen){s.firstSeen=Date.now();DB.ghosts.push(s);stat('encounters');typeStat(s.type,'seen')}
  if(!s.identified){s.identified=true;typeStat(s.type,'ided')}
  caps++;store.set('gh.caps',caps);stat('captures');typeStat(s.type,'caught');saveDB();
  zap();buzz([60,40,60,40,200]);hwOut('fx pulse 1500 0 140 255',true);say(`Contained: ${s.name} (${typeOf(s).name})`);logEv(`CONTAINED: ${s.name} (${typeOf(s).name}), level ${s.level}`);
}
function provoke(){if(!active())return say('Nothing here to provoke.','warn');const T=T_();G.spec.provoked++;stat('provokes');
  const k=T.id==='inhuman'||T.id==='revenant'?rand(20,30):T.ignores?0:rand(10,22);G.anger=Math.min(100,G.anger+k);logEv(`Provoked ${nm()} (hostility ${Math.round(G.anger)}%)`);
  if(T.ignores)return say('It doesn\'t react. It doesn\'t know you\'re there.','warn');
  const r=Math.random();if(r<.35)bang(atBearing(gBear(),gDist()+1));else if(r<.6)growl([G.p[0],G.p[1],.2]);else knock(atBearing(gBear(),gDist()+1.2,-.2),3);
  say(pick(['It didn\'t like that.','The air just got colder.','Something is very angry now.']),'warn');if(G.anger>80&&Math.random()<.5)setTimeout(attackStart,rand(800,2500));else if(G.anger>60)pickBehavior()}
function calm(){if(!active())return say('Nobody here to talk to.','warn');const T=T_();stat('calms');
  const k=T.id==='inhuman'?-rand(0,8):T.id==='child'||T.id==='bride'||T.id==='wanderer'||T.id==='guide'?rand(10,20):rand(4,12);G.anger=clamp(G.anger-k,0,100);
  logEv(`Spoke calmly to ${nm()} (hostility ${Math.round(G.anger)}%)`);say(T.id==='inhuman'?'It laughs at you.':k>9?'It seems calmer…':'Hard to tell if it listened.',T.id==='inhuman'?'alert':'');
  if(T.id==='inhuman'&&Math.random()<.4)growl([G.p[0],G.p[1],.2]);else if(k>9&&Math.random()<.3)whisper([G.p[0],G.p[1],.2],1)}
function release(id){const s=ghostById(id);if(!s||s.state!=='captured')return;s.state='free';s.anger=Math.min(100,s.baseAnger+25);caps=Math.max(0,caps-1);store.set('gh.caps',caps);stat('released');saveDB();logEv(`Released ${s.name}`)}

// ================================================================ the haunt map: ghosts stay where you found them
function hauntsNear(){if(!GPS.ok)return[];return DB.ghosts.filter(g=>g.state==='free'&&g.home).map(g=>({g,d:geoDist(GPS.lat,GPS.lon,g.home.lat,g.home.lon)}))}
const slack=()=>clamp(GPS.acc,5,25);
function insideHaunt(){return hauntsNear().some(o=>o.d<=o.g.home.r+slack())}
function insideHauntOf(spec){return!!spec.home&&GPS.ok&&geoDist(GPS.lat,GPS.lon,spec.home.lat,spec.home.lon)<=spec.home.r+slack()+15}
let hauntT=0,lastFix=null;
function hauntStep(dt){
  hauntT-=dt;if(hauntT>0)return;hauntT=2;
  if(GPS.ok&&GPS.acc<25){if(lastFix){const m=geoDist(lastFix[0],lastFix[1],GPS.lat,GPS.lon);if(m>3&&m<60){stat('walked',m);lastFix=[GPS.lat,GPS.lon]}}else lastFix=[GPS.lat,GPS.lon]}
  if(!GPS.ok||MODE==='real')return;
  const near=hauntsNear().filter(o=>o.d<=o.g.home.r+slack()).sort((a,b)=>a.d-b.d)[0];
  if(near&&(G.state==='idle'||(active()&&!G.seen&&!G.resident&&G.spec!==near.g))){  // you walked into its area
    summon(near.g,geoBear(GPS.lat,GPS.lon,near.g.home.lat,near.g.home.lon)+rand(-40,40),clamp(near.d,3,7),true)}
  else if(active()&&G.spec&&G.spec.home&&!insideHauntOf(G.spec))dismiss('Readings fading. You left its area.');
  // arriving at a lead you were shown
  for(const l of DB.leads)if(!l.done&&geoDist(GPS.lat,GPS.lon,l.lat,l.lon)<15&&G.state==='idle'){l.done=true;stat('leadsFollowed');saveDB();
    if(l.fake){say('Nothing here… it lied to you.','warn');logEv('Followed a false lead')}
    else{const g=makeGhost();summon(g,O.h+rand(-120,120),rand(5,8),false);logEv(`Followed a lead from ${l.fromName}`)}}
}
// Hunt: head for the nearest unfinished lead or a haunt you haven't cleared
const hunt={dist:null,bear:null,target:null,respawn:true,lat:null,lon:null,fleeT:0,fled:false,dir:0};
function huntStep(dt){
  if(!GPS.ok){hunt.dist=null;return}
  const cands=[...DB.leads.filter(l=>!l.done).map(l=>({lat:l.lat,lon:l.lon,kind:'lead'})),...DB.ghosts.filter(g=>g.state==='free'&&g.home).map(g=>({lat:g.home.lat,lon:g.home.lon,kind:'haunt',r:g.home.r}))]
    .map(c=>({...c,d:geoDist(GPS.lat,GPS.lon,c.lat,c.lon)})).filter(c=>c.d>(c.r||15)).sort((a,b)=>a.d-b.d);
  if(cands.length&&cands[0].d<2000){const c=cands[0];hunt.target=c.kind;hunt.dist=c.d;hunt.bear=geoBear(GPS.lat,GPS.lon,c.lat,c.lon);return}
  // nothing on the map: a fresh trail that wanders, and sometimes runs
  if(hunt.respawn||hunt.lat==null){if(GPS.acc>40)return;const b=rand(0,360),m=rand(45,95);[hunt.lat,hunt.lon]=geoMove(GPS.lat,GPS.lon,b,m);hunt.respawn=false;hunt.fled=false;hunt.fleeT=0;hunt.dir=rand(0,360);
    say(`Faint readings ${Math.round(m)} m away. Follow the arrow.`);logEv(`Hunt: readings ${Math.round(m)} m away`)}
  hunt.target='trail';hunt.dist=geoDist(GPS.lat,GPS.lon,hunt.lat,hunt.lon);hunt.bear=geoBear(GPS.lat,GPS.lon,hunt.lat,hunt.lon);
  if(G.state!=='idle')return;
  if(hunt.fleeT>0){hunt.fleeT-=dt;hunt.dir=hunt.bear+rand(-20,20)}
  else{hunt.dir+=rand(-40,40)*dt;if(!hunt.fled&&hunt.dist<28){hunt.fled=true;if(Math.random()<.5){hunt.fleeT=12;say('It\'s moving away! Follow it!','alert');whoosh(1.2);logEv('Hunt: target moving away')}}}
  [hunt.lat,hunt.lon]=geoMove(hunt.lat,hunt.lon,hunt.dir,(hunt.fleeT>0?1.7:.35)*dt);
  if(hunt.dist<9){hunt.respawn=true;spawnNew(hunt.bear,Math.min(7,hunt.dist+2))}
}

// ================================================================ ambient world (orbs, shadow passes, cold spots)
function worldStep(dt){
  for(const c of WORLD.cold){c.p[0]+=c.v[0]*dt;c.p[1]+=c.v[1]*dt;c.s*=Math.exp(-dt/95)}
  WORLD.cold=WORLD.cold.filter(c=>c.s>.05);
  for(const o of WORLD.orbs){o.p[0]+=o.v[0]*dt;o.p[1]+=o.v[1]*dt;o.p[2]+=o.v[2]*dt;o.age+=dt}
  WORLD.orbs=WORLD.orbs.filter(o=>o.age<o.life);
  WORLD.shadows=WORLD.shadows.filter(s=>performance.now()-s.t0<s.dur*1000+200);
  if(MODE!=='ghost'||!active())return;
  WORLD.nextOrb-=dt;if(WORLD.nextOrb<=0){WORLD.nextOrb=T_().look.kind==='orbs'?rand(1.5,4):rand(7,16);const b=T_().look.kind==='orbs'?gBear()+rand(-20,20):rand(0,360),dd=T_().look.kind==='orbs'?gDist()+rand(-1,1):rand(1.5,4);
    WORLD.orbs.push({p:atBearing(b,Math.max(1.2,dd),rand(-.8,.9)),v:[rand(-.25,.25),rand(-.25,.25),rand(-.06,.08)],age:0,life:rand(5,11),r:rand(.025,.05)})}
  WORLD.nextShadow-=dt;if(WORLD.nextShadow<=0&&G.state==='active'){WORLD.nextShadow=rand(35,70);const b=rand(0,360),dd=rand(3,5),b2=b+(Math.random()<.5?-1:1)*rand(50,90);
    const s={a:atBearing(b,dd),b:atBearing(b2,dd),t0:performance.now(),dur:rand(1.2,1.8),seen:false};WORLD.shadows.push(s);
    for(let i=0;i<5;i++)setTimeout(()=>{const k=i/5;footstep([s.a[0]+(s.b[0]-s.a[0])*k,s.a[1]+(s.b[1]-s.a[1])*k,-CAM_H],.7)},i*s.dur*200)}
}
const shadowPos=s=>{const k=clamp((performance.now()-s.t0)/(s.dur*1000),0,1);return[s.a[0]+(s.b[0]-s.a[0])*k,s.a[1]+(s.b[1]-s.a[1])*k]};

// ================================================================ readings: EMF level, temperature
const beam=(diff,w)=>.15+.85*Math.exp(-((diff/w)**2));
let L=0;  // smoothed 0-1 field strength the meters show
function targetLevel(){
  if(MODE==='real'){
    const k=kit();if(k&&k.hd!=null)return clamp(Math.abs(k.hd)/120,0,1);  // real magnetic field from the Hall sensor
    const t=radarTarget();if(!t)return .02;return clamp(t.e/100*1.25,0,1)*(.45+.55*clamp(1-t.d/6,0,1));
  }
  if(G.state==='charge'||G.beh==='chase')return 1;
  if(active()){const lv=.75+G.spec.level*.025+G.anger*.001;return clamp(Math.pow(clamp(1-gDist()/9,0,1),.8)*beam(Math.abs(wrap(gBear()-O.h)),38)*1.15*lv,0,1)}
  if(MODE==='hunt'&&hunt.dist!=null)return clamp(Math.pow(clamp(1-hunt.dist/130,0,1),1.4)*beam(Math.abs(wrap(hunt.bear-O.h)),55),0,.9);
  return .03;
}
const levelSource=()=>MODE!=='real'?'staged':kit()&&kit().hd!=null?'Hall sensor':'radar return';
const mG=lv=>.1+Math.pow(lv,1.6)*26;
const TEMP={base:rand(20.4,21.8),amb:null};
function tempAt(p){
  let t=TEMP.base;for(const c of WORLD.cold){const dx=p[0]-c.p[0],dy=p[1]-c.p[1],dz=p[2]-c.p[2];t-=c.s*7*Math.exp(-(dx*dx+dy*dy+dz*dz)/(c.r*c.r))}
  if(active()){const dx=p[0]-G.p[0],dy=p[1]-G.p[1],dz=p[2]+.4;t-=Math.max(G.vis,.4)*5*T_().cold*Math.exp(-(dx*dx+dy*dy)/.25-dz*dz/1.2)}
  return t;
}
function realTemp(){const k=kit();return k&&k.tc!=null?k.tc:null}
function tempStep(dt){
  if(!staged()){TEMP.amb=realTemp();return}
  TEMP.base+=(Math.random()-.5)*.02*dt;const tgt=tempAt([0,0,0])+(Math.random()-.5)*.06;TEMP.amb=TEMP.amb==null?tgt:TEMP.amb+(tgt-TEMP.amb)*Math.min(1,dt*.8);
}
function spotTempStaged(){let m=99;for(let k=.6;k<=7;k+=.3)m=Math.min(m,tempAt(O.F.map(v=>v*k)));return m}
function spotTemp(){return staged()?spotTempStaged():realTemp()}
const fmtT=c=>c==null?'--':CFG.units==='F'?(c*9/5+32).toFixed(1)+'°F':c.toFixed(1)+'°C';
