"""Generate importable node graphs. Imports/executions still require n8n verification."""
import json,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'n8n'

def node(name,type_,params,x,version,y=260):
    return {'id':str(uuid.uuid5(uuid.NAMESPACE_URL,'relay-n8n:'+name)),'name':name,'type':type_,'typeVersion':version,'position':[x,y],'parameters':params}
def http(name,path,body,x,y=260):
    n=node(name,'n8n-nodes-base.httpRequest',{'method':'POST','url':'https://relay-api.example.invalid'+path,
      'authentication':'genericCredentialType','genericAuthType':'httpHeaderAuth','sendBody':True,
      'specifyBody':'json','jsonBody':body,'options':{'timeout':30000}},x,4.2,y)
    # Deliberately no embedded credentials. Select a Header Auth credential in n8n.
    return n

def save(name,nodes,filename,chains=None):
    # Each chain is a linear list of nodes; one workflow may hold several independent triggers.
    chains=chains or [nodes]
    connections={c[i]['name']:{'main':[[{'node':c[i+1]['name'],'type':'main','index':0}]]} for c in chains for i in range(len(c)-1)}
    flow={'name':name,'nodes':nodes,'connections':connections,'active':False,
          'settings':{'executionOrder':'v1','timezone':'America/Phoenix','saveDataSuccessExecution':'none','saveDataErrorExecution':'none','saveExecutionProgress':False},
          'pinData':{},'tags':[]}
    (ROOT/filename).write_text(json.dumps(flow,indent=2))

for kind,title,filename in [('reminder','Approved-session reminders','01_session_reminders.json'),('retention','Opt-in delayed practice','02_delayed_practice.json')]:
    nodes=[node('Every minute','n8n-nodes-base.scheduleTrigger',{'rule':{'interval':[{'field':'minutes','minutesInterval':1}]}},240,1.2),
           http('Consent-check and deliver due jobs','/internal/automation/tick',json.dumps({'kind':kind,'dry_run':True}),530)]
    chains=[nodes]
    if kind=='retention':
        # Daily retention cleanup (RELAY_RETENTION_DAYS on the API). Deletes database rows only.
        purge=[node('Daily 03:30 Phoenix','n8n-nodes-base.scheduleTrigger',{'rule':{'interval':[{'field':'cronExpression','expression':'30 3 * * *'}]}},240,1.2,480),
               http('Apply retention policy','/internal/maintenance/purge','{}',530,480)]
        chains.append(purge); nodes=nodes+purge
    save('RELAY / '+title,nodes,filename,chains)

nodes=[node('Execution failed','n8n-nodes-base.errorTrigger',{},220,1),
       node('Keep identifiers only','n8n-nodes-base.code',{'jsCode':"const x = $input.first().json; return [{json:{workflow:String(x.workflow?.name || 'unknown').slice(0,100),execution:String(x.execution?.id || 'unknown').slice(0,100)}}];"},480,2),
       http('Record operational failure','/internal/automation/error','={{ JSON.stringify($json) }}',740)]
save('RELAY / Privacy-minimized error handler',nodes,'03_error_handler.json')
