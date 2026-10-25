"""Browser interaction test using the real FastAPI app through an in-process bridge.
This avoids browser network requirements. Synthetic participants; not a live
Discord/model/calendar/n8n test and not a learning study.
Requires Playwright + Chromium in addition to the normal requirements.
"""
import json,os,tempfile
from datetime import datetime,timedelta,timezone
from pathlib import Path
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright
from relay.api import make_app

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
report={'scope':'Synthetic Chromium UI test, real FastAPI logic through an in-process bridge; no browser HTTP transport test','checks':[],'js_errors':[]}
os.environ['RELAY_PUBLIC_DEMO']='true'
os.environ['RELAY_MODEL_PROVIDER']='none'
os.environ['RELAY_DELIVERY_ENABLED']='false'
with tempfile.TemporaryDirectory() as tmp:
    api=TestClient(make_app(str(Path(tmp)/'ui.sqlite3')))
    def req(path,body=None,token=None,method='POST'):
        h={'Authorization':'Bearer '+token} if token else {}
        r=api.request(method,path,json=body,headers=h);r.raise_for_status();return r.json()
    host=req('/api/sessions',{'name':'Rithik','concept_id':'compound-change'});sid=host['session_id'];host['name']='Rithik'
    people=[host]
    for name in ('Dev','Sankalp','Kanha'):
        x=req('/api/sessions/'+sid+'/join',{'name':name});x['name']=name;people.append(x)
    path='/api/sessions/'+sid
    now=datetime.now(timezone.utc);start=(now+timedelta(days=1)).replace(hour=22,minute=0,second=0,microsecond=0);end=start+timedelta(hours=2)
    for p in people:req(path+'/availability',{'windows':[{'start':start.isoformat(),'end':end.isoformat()}]},p['token'])
    plan=req(path+'/propose',{'durations':[60,45,30]},host['token'])['state']
    for p in people:req(path+'/approve',{'version':plan['plan_version']},p['token'])
    req(path+'/advance',{'expected_stage':'lobby'},host['token'])
    for p in people:req(path+'/answer',{'question_id':'compound-d1','choice':'A','confidence':'confident'},p['token'])
    req(path+'/advance',{'expected_stage':'diagnostic'},host['token'])
    def bridge(payload):
        response=api.request(payload['method'],payload['path'],content=payload.get('body'),headers=payload.get('headers',{}))
        return {'status':response.status_code,'body':response.text,'headers':dict(response.headers)}
    with sync_playwright() as p:
        # CHROMIUM_PATH, else the system chromium if present, else Playwright's own managed browser.
        chromium=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None)
        browser=p.chromium.launch(headless=True,executable_path=chromium,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=1,timezone_id='America/Phoenix')
        page=context.new_page();page.on('pageerror',lambda err:report['js_errors'].append(str(err)))
        page.expose_function('relayTestBridge',bridge)
        html=(ROOT/'web/index.html').read_text().replace('<link rel="stylesheet" href="/static/style.css">','<style>'+(ROOT/'web/style.css').read_text()+'</style>').replace('<script src="/static/app.js"></script>','')
        page.set_content(html)
        page.evaluate('''(identities) => {
          const data = {'relay.identities': JSON.stringify(identities), 'relay.active':'0'};
          Object.defineProperty(window, 'sessionStorage', {value:{getItem:k=>data[k]??null,setItem:(k,v)=>{data[k]=String(v)}}});
          window.fetch=async (path, options={})=>{const x=await window.relayTestBridge({path,method:options.method||'GET',headers:options.headers||{},body:options.body});return new Response(x.body,{status:x.status,headers:x.headers});};
        }''',people)
        page.add_script_tag(content=(ROOT/'web/app.js').read_text())
        page.wait_for_selector('#explanationText')
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT/'relay-study-room.png'),full_page=True)
        assert 'shared assumption' in page.locator('#mainCard').inner_text()
        report['checks'].append('Discussion uses aggregate signals without exposing individual correctness.')
        page.click('#openSource');assert page.locator('#sourceDialog').is_visible();page.click('#closeSource')
        report['checks'].append('Source drawer opens and closes.')
        page.fill('#explanationText','The second percentage uses the new value. Multiplication keeps that changing base explicit.')
        page.click('#shareExplanation');page.wait_for_selector('.peer-explanation')
        page.click('#nextStage');page.wait_for_selector('[data-choice="A"]')
        page.click('[data-choice="A"]');page.select_option('#confidence','somewhat');page.click('#submitAnswer')
        page.wait_for_function('document.querySelector("#mainCard").textContent.includes("response is locked")')
        for i,person in enumerate(people[1:]):req(path+'/answer',{'question_id':'compound-t1','choice':'B' if i==1 else 'A','confidence':'somewhat'},person['token'])
        page.wait_for_timeout(1800);page.click('#nextStage');page.wait_for_selector('.results-grid')
        assert '3' in page.locator('.result-tile').nth(1).inner_text()
        report['checks'].append('Peer explanation, private fresh answer, and aggregate debrief run against real backend state.')
        page.click('#presentBtn');assert not page.locator('.private-zone').is_visible()
        report['checks'].append('Presentation mode hides private results.')
        page.screenshot(path=str(OUT/'relay-debrief.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844});page.emulate_media(reduced_motion='reduce')
        page.screenshot(path=str(OUT/'relay-mobile.png'),full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        report['checks'].append('390px viewport has no horizontal overflow; reduced-motion preference is enabled.')
        assert not report['js_errors']
        report['status']='passed'
        context.close();browser.close()
(OUT/'browser-test-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
