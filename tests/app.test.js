// Headless checks for the built app. Run: npm test (after python3 scripts/build.py)
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','dist','index.html'),'utf8');
let failed=0;
const errors=[];
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://example.org/ww.html',pretendToBeVisual:true,beforeParse(w){w.scrollTo=()=>{};w.addEventListener('error',e=>errors.push(e.message))}});
const w=dom.window;w.console.error=(...a)=>errors.push(a.join(' '));
const go=h=>{w.location.hash=h;w.eval('route()')};
const txt=()=>w.document.getElementById('main').textContent;
const check=(name,cond)=>{if(!cond)failed++;console.log((cond?'PASS ':'FAIL ')+name)};
for(const p of ['discover','moments','journey','explore','inbox','settings','lab','tip/ww-001','tip/ww-112','tip/ww-126','bogus']){go(p);check('render '+p,txt().length>100)}
go('moments');
w.eval("selectMoment('moment','env-aqi')");check('AQI shows tip',/Save and send/.test(txt()));
w.eval('deliver()');check('delivered once',w.eval('S.events.length')===1);
w.eval('deliver()');check('no double delivery',w.eval('S.events.length')===1);
// clinician-only suppression: potassium salt
w.eval("selectMoment('product','potassium','share')");check('potassium suppressed',/will not push a tip here/.test(txt()));
// no match
w.eval("setTab('share')");w.document.getElementById('shareBox').value='a decorative notebook';w.eval('findShared()');check('notebook no match',/No strong match/.test(txt()));
w.document.getElementById('shareBox').value='Order: 1 x RO purifier filter cartridge';w.eval('findShared()');check('RO -> water filter',w.eval('S.selected.id')==='filter');
w.document.getElementById('shareBox').value='vitamin d supplement 60 caps';w.eval('findShared()');check('vit D match',w.eval('S.selected.id')==='vitd');
// low mood support notice
w.eval("selectMoment('moment','p-low')");check('crisis line notice',/crisis line/.test(txt()));
// agent tab
w.eval("setTab('agent')");check('agent optional empty',/Link your AI agent/.test(txt()));
w.eval("S.agentConnected=true;render()");w.eval("selectMoment('agent','pan')");w.eval('deliver()');w.eval("S.agent='Dots';selectMoment('agent','pan')");w.eval('deliver()');
check('cross-agent events',w.eval("S.events.filter(e=>e.source==='agent').length")>=1);
// checkins
w.eval("setStatus('ww-021','trying');S.offsetDays=8;persist()");go('discover');check('7-day checkin',/Quick check-in/.test(txt()));
w.eval("checkin('ww-021',7,'kept')");check('kept -> adopted',w.eval("S.statuses['ww-021']")==='adopted');
// diet boost
w.eval("S.diet='Vegan';S.seen={}");check('vegan boosts B12 in supplement prompt',w.eval("candidates('prompt:supplement').scored[0].t.id")==='ww-104');
// hindi
w.eval("setLang('hi')");go('tip/ww-001');check('hindi tip',/तेल/.test(txt()));w.eval("setLang('en')");
// whatsapp
w.eval("S.channel='WhatsApp preview';S.frequency='daily';queueTip()");go('inbox');check('whatsapp bubble',!!w.document.querySelector('.wa'));
// explore count + search
go('explore');w.eval("searchText='lead';updateExplore()");check('search works',/Showing \d+/.test(w.document.getElementById('exploreCount').textContent));
// sponsor
go('tip/ww-126');check('sponsor slot',/Sponsored/.test(txt()));

// new tips from pack
w.eval("S.offsetDays=0;persist();TIPS[0].added=new Date().toISOString().slice(0,10)");go('discover');check('new section shows',/New in Wellwise/.test(txt()));
const base=w.eval('TIPS.length');check('library loads',base>=200);
// in-browser import: invalid
w.eval("importReport={name:'bad.json',...validatePack({tips:[{title:'x',category:'Nope',action:'a',why:'b',caution:'c',sources:['http://x']}]})}");
check('invalid pack blocked',w.eval('importReport.errors.length')>=2);
// valid import with auto id
w.eval("importReport={name:'ok.json',...validatePack({tips:[{title:'Drink water with meals',category:'Food & nutrition',action:'Keep a glass of water on the table',why:'Easy swap for sugary drinks',caution:'Follow fluid limits if you have them',sources:['https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html'],triggerKeys:['prompt:grocery']}],edges:[]})}");
check('valid pack ok',w.eval('importReport.errors.length')===0 && w.eval('importReport.tips[0].id')===w.eval('nextId(ALLTIPS.map(t=>t.id))'));
const newId=w.eval('importReport.tips[0].id');w.eval('addPack()');check('imported tip live',w.eval('TIPS.length')===base+1 && w.eval(`!!TIPMAP['${newId}']`));
go('settings');check('settings shows remove',/Remove 1 added tip/.test(txt()));
w.eval("saveOverlay({tips:[],edges:[]});applyContent(CONTENT)");check('remove works',w.eval('TIPS.length')===base);
// retired tip hidden
w.eval("CONTENT.TIPS.find(t=>t.id==='ww-018').status='retired';applyContent(CONTENT)");check('retired hidden but kept',w.eval("!TIPS.some(t=>t.id==='ww-018')&&!!TIPMAP['ww-018']"));
console.log('reachable',w.eval('REACHABLE'));
console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'no errors');
if(errors.length||failed){console.log(failed+' check(s) failed');process.exit(1)}
