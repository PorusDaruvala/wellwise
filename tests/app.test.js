// Headless checks for the built app, without the server. Run: npm test (after python3 scripts/build.py)
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','dist','index.html'),'utf8');
let failed=0;
const errors=[];
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://example.org/ww.html',pretendToBeVisual:true,beforeParse(w){w.scrollTo=()=>{};w.addEventListener('error',e=>errors.push(e.message))}});
const w=dom.window;w.console.error=(...a)=>errors.push(a.join(' '));
const go=h=>{w.location.hash=h;w.eval('route()')};
const txt=()=>w.document.getElementById('main').textContent;
const check=(name,cond)=>{if(!cond)failed++;console.log((cond?'PASS ':'FAIL ')+name)};
for(const p of ['discover','moments','journey','explore','inbox','settings','tip/ww-001','tip/ww-112','tip/ww-126','bogus'])go(p),check('render '+p,txt().length>100);
for(const tab of ['near','share','scan','calendar','prompt','whatsapp','agent']){go('moments');w.eval(`setTab('${tab}')`);check('moments tab '+tab,txt().length>100)}

// menu: four places, inbox and settings as icons, the same four in the phone menu
go('discover');
const navText=[...w.document.querySelectorAll('#nav .navbtn')].map(b=>b.textContent.replace(/ · \d+/,''));
check('four main places',navText.join()==='Discover,Moments,Explore,Journey');
check('phone menu has the same four',[...w.document.querySelectorAll('#tabbar button')].map(b=>b.textContent).join()==='Discover,Moments,Explore,Journey');
check('inbox and settings icons',w.document.querySelectorAll('#icons .iconbtn').length===2&&/Settings/.test(w.document.querySelector('#icons').innerHTML));
w.eval("S.notifications.unshift({id:'n-new',tip:'ww-001',at:Date.now()-1000,message:'Hi',source:'daily',channel:'In the app'});S.inboxSeenAt=0;render()");
check('unread badge',!!w.document.querySelector('#icons .dot'));
go('inbox');check('badge clears in the inbox',!w.document.querySelector('#icons .dot')&&w.document.querySelector('#icons .iconbtn.active'));
// no small label above page titles; tip pages keep their category
check('no labels above menu page titles',['discover','moments','explore','journey','inbox','settings'].every(p=>(go(p),!w.document.querySelector('#main > .eyebrow'))));
go('tip/ww-001');check('tip page keeps its category',/Food & nutrition/i.test(w.document.querySelector('#main > .eyebrow')?.textContent||''));

// every tip can come from a moment
check('all tips reachable',w.eval('REACHABLE===TIPS.length'));
check('no agent simulations left',w.eval('typeof AGENT_SCENARIOS')==='undefined'&&!w.eval('"AGENT_SCENARIOS" in CONTENT'));

go('moments');
w.eval("selectMoment('moment','env-aqi')");check('AQI shows tip',/Save to my journey/.test(txt()));
w.eval('deliver()');check('delivered once',w.eval('S.events.length')===1);
w.eval('deliver()');check('no double delivery',w.eval('S.events.length')===1);
// medicine tips now fire from moments too
w.eval("selectMoment('product','potassium','share')");check('potassium brings its tip',w.eval("candidates('commerce:potassium_supplement').scored[0].t.id")==='ww-106'&&/Save to my journey/.test(txt()));
w.eval("selectMoment('product','anticoag','share')");check('blood thinner brings its tip',w.eval("candidates('profile:anticoagulant').scored[0].t.id")==='ww-112');
// no match
w.eval("setTab('share')");w.document.getElementById('shareBox').value='a decorative notebook';w.eval('findShared()');check('notebook no match',/No strong match/.test(txt()));
w.document.getElementById('shareBox').value='Order: 1 x RO purifier filter cartridge';w.eval('findShared()');check('RO -> water filter',w.eval('S.selected.id')==='filter');
w.document.getElementById('shareBox').value='vitamin d supplement 60 caps';w.eval('findShared()');check('vit D match',w.eval('S.selected.id')==='vitd');
// text matching finds moments, not just products
check('text finds a flight',w.eval("ENGINE.matchText(CONTENT,'Flight BA142 to London').some(m=>m.id==='cal-flight')"));
check('text finds a blood test',w.eval("ENGINE.matchText(CONTENT,'Blood test at Thyrocare 9am').some(m=>m.id==='cal-blood')"));
// low mood support notice
w.eval("selectMoment('moment','p-low')");check('crisis line notice',/crisis line/.test(txt()));
// agent tab without the server
w.eval("setTab('agent')");check('agent tab explains linking',/Link your AI agent/.test(txt()));

// daily insight and near-you are never shown together
w.eval("S.live=null;S.nearConsent=false");go('discover');check('daily insight without live data',/Your daily insight/.test(txt())&&!/Near you today/.test(txt()));
w.eval("S.live={at:Date.now(),place:'Delhi',region:'IN',reading:{aqi:182,tempMax:24},moments:[{id:'env-aqi',reason:'US AQI 182'}]}");go('discover');
check('near you replaces daily insight',/Near you today/.test(txt())&&!/Your daily insight/.test(txt()));
w.eval('saveLive()');check('save live tip',/✓ Saved/.test(txt()));
w.eval("S.live={at:Date.now(),place:'Delhi',reading:{aqi:20},moments:[]}");go('discover');check('quiet day falls back to daily insight',/Your daily insight/.test(txt())&&/Nothing stands out/.test(txt()));
// one tap: ten options, tip shows in place
check('ten one-tap options',w.document.querySelectorAll('.tapgrid button').length===10);
check('one tap title',/One tap, one more useful tip/.test(txt()));
w.eval("tapMoment('p-cook')");check('tap shows tip inline',/Save to my journey/.test(txt()));
w.eval('saveTap()');check('tap saves',w.eval("S.events.some(e=>e.source==='prompt')"));

// checkins
w.eval("setStatus('ww-021','trying');S.offsetDays=8;persist()");go('discover');check('7-day checkin',/Quick check-in/.test(txt()));
w.eval("checkin('ww-021',7,'kept')");check('kept -> adopted',w.eval("S.statuses['ww-021']")==='adopted');
// diet boost
w.eval("S.diet='Vegan';S.seen={}");check('vegan boosts B12 in supplement prompt',w.eval("candidates('prompt:supplement').scored[0].t.id")==='ww-104');
// hindi
w.eval("setLang('hi')");go('tip/ww-001');check('hindi tip',/तेल/.test(txt()));w.eval("setLang('en')");
// whatsapp delivery shows as a chat bubble
w.eval("S.notifications.unshift({id:'x1',tip:'ww-001',at:Date.now(),message:'Hi',source:'whatsapp',channel:'WhatsApp'})");go('inbox');check('whatsapp bubble',!!w.document.querySelector('.wa'));
// explore: search, region, familiarity
go('explore');w.eval("searchText='lead';updateExplore()");check('search works',/Showing \d+/.test(w.document.getElementById('exploreCount').textContent));
w.eval("searchText='';searchGeo='ALL';updateExplore()");const all=w.document.querySelectorAll('#exploreResults .card').length;
w.eval("searchGeo='IN';updateExplore()");const india=w.document.querySelectorAll('#exploreResults .card').length;check('region filter',india<all&&india>0);
w.eval("searchGeo='ALL';searchKind='COMMON';updateExplore()");const common=w.document.querySelectorAll('#exploreResults .card').length;check('well-known filter',common>0&&common<all);
w.eval("searchKind='ALL'");
// familiarity on the tip page
go('tip/ww-005');check('well-known tip says why it is here',/You may know this one already/.test(txt()));
go('tip/ww-106');check('lesser-known tip has no repeat note',!/You may know this one already/.test(txt())&&/Lesser known/.test(txt()));

// no over-caution, no admin or prototype tools for users
const pages=['discover','moments','journey','explore','inbox','settings','tip/ww-106','tip/ww-112','tip/ww-047'].map(p=>(go(p),txt())).join(' ');
check('no safety tags',!/Check first|Talk to a clinician|clinician’s input|held back|Not yet reviewed/.test(pages));
go('settings');check('no add-tips in settings',!/Add tips|tip pack/i.test(txt()));check('no prototype tools',!/Prototype tools|Jump ahead/.test(txt()));
check('disclaimer in footer',/not a substitute for medical advice/.test(w.document.getElementById('footer').textContent)&&/certified healthcare provider/.test(w.document.getElementById('footer').textContent));
go('tip/ww-126');check('sponsor slot',/Sponsored/.test(txt()));
w.eval("API.on=true;API.id='abc123def';API.linked={};API.features={}");go('settings');check('settings shows the Wellwise ID',/WW-ABC123/.test(txt()));w.eval('API.on=false');
// sign-in: offered in Settings and before connecting an assistant; signed-in view shows the account
w.eval("API.on=true;API.account=null;API.features={signIn:{email:true,whatsapp:true}};API.linked={}");go('settings');
check('settings offers sign-in', /Your account/.test(txt())&&/Send me a code/.test(txt())&&/Sign in with WhatsApp/.test(txt()));
w.eval("SIGN={step:'code',id:'lc_1',email:'me@example.com'};render()");check('settings asks for the emailed code', /6-digit code to me@example.com/.test(txt()));
w.eval("SIGN={step:null};API.account={email:'me@example.com'};render()");check('settings shows who is signed in', /Signed in as me@example.com/.test(txt())&&/Sign out/.test(txt()));
w.eval("API.account=null");go('moments');w.eval("setTab('agent')");check('agent tab asks to sign in first', /Sign in first/.test(txt()));
w.eval("API.on=false;API.features={}");
go('settings');check('health details panel',/Health details/.test(txt())&&/tips that matter most to you/.test(txt())&&!/unsafe/.test(txt()));
// online-only tabs, as they look when the server is there
w.eval("API.on=true;API.linked={};API.features={}");go('moments');w.eval("setTab('calendar')");check('calendar sign-in shown as coming soon',/Connect Google Calendar/.test(txt())&&/Coming soon/.test(txt()));
w.eval("setTab('agent')");check('agent options for Muse, ChatGPT/Dots, Claude, Instinct',['Muse','ChatGPT and Dots','Claude','Instinct','Another assistant'].every(n=>[...w.document.querySelectorAll('.agent summary b')].some(b=>b.textContent===n))&&/Connect calendar/.test(txt()));
check('Muse shows sign-in and key ways',/Way 1: sign in/.test(txt())&&/Way 2: with a key/.test(txt())&&/Create a key/.test(txt()));
w.eval("API.agentKey={key:'wwk_test123',api:'x',mcp:'y'};render()");check('Muse shows the new key to copy',[...w.document.querySelectorAll('.agent')][0].textContent.includes('wwk_test123'));w.eval('API.agentKey=null');
check('agent connector address',/\/mcp/.test(txt())&&/Add custom connector/.test(txt()));
// daily notifications: the one-tap card on Discover, or Home Screen steps on iPhone
w.eval("window.PushManager=function(){};window.Notification={permission:'default',requestPermission:async()=>'default'};Object.defineProperty(navigator,'serviceWorker',{value:{ready:new Promise(()=>{}),register:async()=>{}},configurable:true});S.pushAskedAt=0;API.pushOn=false");
go('discover');check('notifications card',/Turn on notifications/.test(txt()));
w.eval('laterPush()');check('not now hides it for a while',!/Turn on notifications/.test(txt()));
w.eval("S.pushAskedAt=0;API.pushOn=true;render()");check('card gone once on',!/Get a useful tip every morning/.test(txt()));
go('settings');check('notifications switch in settings',/Notifications on this device/.test(txt())&&/Turn off/.test(txt()));
w.eval("API.pushOn=false;delete window.PushManager;Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',configurable:true});S.pushAskedAt=0");
go('discover');check('iPhone gets Home Screen steps',/Add to Home Screen/.test(txt())&&/Open as Web App/.test(txt())&&w.document.querySelectorAll('.steps li').length===4);
w.eval("Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0',configurable:true});render()");check('Chrome on iPhone gets its own steps',/address bar at the top/.test(txt()));
go('moments');w.eval("API.agents={mcp:'https://x/mcp',connected:[{id:'wwc_1',name:'Muse',since:Date.now()}]};setTab('agent')");check('connected assistant shown first, with a mark on its option',/✓ Muse/.test(txt())&&/Connect another agent/.test(txt())&&/Connected/.test(w.document.querySelector('.agent summary').textContent));w.eval('API.agents=null');
w.eval("API.on=false");
check('travel tips moved',['ww-059','ww-191','ww-196'].every(id=>w.eval(`TIPMAP['${id}'].category`)==='Travel health'));

// new tips from a pack
w.eval("S.offsetDays=0;persist();TIPS[0].added=new Date().toISOString().slice(0,10)");go('discover');check('new section shows',/New in Wellwise/.test(txt()));
check('library loads',w.eval('TIPS.length')>=200);
// retired tip hidden
w.eval("CONTENT.TIPS.find(t=>t.id==='ww-018').status='retired';applyContent(CONTENT)");check('retired hidden but kept',w.eval("!TIPS.some(t=>t.id==='ww-018')&&!!TIPMAP['ww-018']"));
// local daily tip lands in the inbox once a day
w.eval("S.lastDaily='';S.frequency='daily';const n=S.notifications.length;localDaily();localDaily();window.__d=S.notifications.length-n");check('daily tip once',w.eval('__d')===1);

console.log('reachable',w.eval('REACHABLE'),'of',w.eval('TIPS.length'));
console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'no errors');
if(errors.length||failed){console.log(failed+' check(s) failed');process.exit(1)}
