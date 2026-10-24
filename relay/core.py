from __future__ import annotations
import hashlib, hmac, secrets, time, copy, json
from datetime import datetime, timedelta, timezone
from typing import Callable
from .bank import concept, public_question
from .scheduling import find_slots, parse_time, ics_event
from .store import Store

STAGES = ('lobby', 'diagnostic', 'discussion', 'transfer', 'debrief')

class RelayError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status
        super().__init__(message)


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

class Relay:
    def __init__(self, store: Store, now: Callable[[], float] = time.time, secret=''):
        self.store, self.now, self.secret = store, now, secret

    def discord_token(self, sid, uid):
        if len(self.secret) < 32:
            raise RelayError('Set a service key of at least 32 characters.', 503)
        return hmac.new(self.secret.encode(), f'{sid}:{uid}'.encode(), hashlib.sha256).hexdigest()

    def _member(self, s, token):
        for mid, member in s['members'].items():
            if hmac.compare_digest(member['token_hash'], digest(token)):
                return mid, member
        raise RelayError('Not authorized for this session.', 403)

    def _host(self, s, mid):
        if mid != s['host']:
            raise RelayError('Only the session host may do this.', 403)

    def _save(self, db, s):
        s['revision'] += 1
        self.store.save(db, s)

    def create(self, name, concept_id='compound-change', discord_id=None, channel=None):
        concept(concept_id)
        sid = secrets.token_urlsafe(9)
        mid = f'discord:{discord_id}' if discord_id else 'web:' + secrets.token_hex(6)
        token = self.discord_token(sid, mid) if discord_id else secrets.token_urlsafe(32)
        member = {'name': self._name(name), 'token_hash': digest(token), 'reminders': False,
                  'discord_id': discord_id, 'availability': [], 'joined_at': self.now()}
        session = {'id': sid, 'host': mid, 'concept_id': concept_id, 'stage': 'lobby',
                   'revision': 1, 'created_at': self.now(), 'channel': channel,
                   'pack': copy.deepcopy(concept(concept_id)),
                   'pack_hash': hashlib.sha256(json.dumps(concept(concept_id),sort_keys=True).encode()).hexdigest(),
                   'members': {mid: member}, 'answers': {'diagnostic': {}, 'transfer': {}, 'retention': {}},
                   'explanations': [], 'plan_version': 0, 'plan': None, 'approvals': [],
                   'history': [], 'facilitator': None, 'closed_at': None, 'deleted': False,
                   'challenge': None, 'invalidated': False}
        with self.store.transaction() as db:
            self.store.save(db, session)
        return {'session_id': sid, 'token': token, 'member_id': mid}

    @staticmethod
    def _name(name):
        name = str(name).strip()
        if not 1 <= len(name) <= 40:
            raise RelayError('Use a display name between 1 and 40 characters.')
        return name

    def join(self, sid, name, discord_id=None):
        with self.store.transaction() as db:
            s = self.store.load(db, sid)
            mid = f'discord:{discord_id}' if discord_id else 'web:' + secrets.token_hex(6)
            if discord_id and mid in s['members']:
                return {'session_id': sid, 'token': self.discord_token(sid, mid), 'member_id': mid}
            if s['stage'] != 'lobby' or s['deleted']:
                raise RelayError('The roster is locked after the session begins.', 409)
            if len(s['members']) >= 8:
                raise RelayError('This prototype supports at most eight participants.')
            token = self.discord_token(sid, mid) if discord_id else secrets.token_urlsafe(32)
            s['members'][mid] = {'name': self._name(name), 'token_hash': digest(token),
                'reminders': False, 'discord_id': discord_id, 'availability': [], 'joined_at': self.now()}
            self._invalidate_schedule(db, s)
            self._save(db, s)
            return {'session_id': sid, 'token': token, 'member_id': mid}

    def _invalidate_schedule(self, db, s):
        s['plan_version'] += 1
        s['plan'], s['approvals'] = None, []
        db.execute("UPDATE jobs SET status='cancelled' WHERE session_id=? AND kind='reminder' AND status IN ('pending','leased')", (s['id'],))

    def availability(self, sid, token, windows):
        from .scheduling import normalize, iso
        cleaned = [{'start': iso(a), 'end': iso(b)} for a, b in normalize(windows)]
        with self.store.transaction() as db:
            s = self.store.load(db, sid)
            mid, m = self._member(s, token)
            if s['stage'] != 'lobby':
                raise RelayError('Availability edits are restricted to the lobby.', 409)
            m['availability'] = cleaned
            self._invalidate_schedule(db, s)
            self._save(db, s)
        return self.view(sid, token)

    def propose(self, sid, token, durations=(60,45,30)):
        with self.store.transaction() as db:
            s = self.store.load(db, sid)
            mid, _ = self._member(s, token); self._host(s, mid)
            if s['stage'] != 'lobby':
                raise RelayError('Scheduling is only available in the lobby.', 409)
            options = find_slots({k:v['availability'] for k,v in s['members'].items()}, durations,
                                 datetime.fromtimestamp(self.now(), timezone.utc))
            self._invalidate_schedule(db, s)
            s['plan'] = options[0] if options else None
            self._save(db, s)
        return {'options': options, 'state': self.view(sid, token),
                'notice': None if options else 'No common slot. Ask participants to change availability or duration; nobody was silently excluded.'}

    def approve(self, sid, token, version):
        with self.store.transaction() as db:
            s = self.store.load(db, sid)
            mid, _ = self._member(s, token)
            if not s['plan'] or version != s['plan_version']:
                raise RelayError('This proposal changed. Review the current version.', 409)
            if mid not in s['approvals']:
                s['approvals'].append(mid)
            if set(s['approvals']) == set(s['members']):
                for uid, m in s['members'].items():
                    if m['reminders']:
                        due = max(self.now(), parse_time(s['plan']['start']).timestamp() - 900)
                        self._job(db, s, uid, 'reminder', due, version)
            self._save(db, s)
        return self.view(sid, token)

    def consent(self, sid, token, enabled):
        with self.store.transaction() as db:
            s = self.store.load(db, sid); mid, m = self._member(s, token)
            m['reminders'] = bool(enabled)
            if not enabled:
                db.execute("UPDATE jobs SET status='cancelled' WHERE session_id=? AND member_id=? AND status IN ('pending','leased')", (sid,mid))
            elif s['stage'] == 'debrief' and not s.get('invalidated'):
                # Repeated consent updates do not push the job out or create duplicates.
                self._job(db, s, mid, 'retention', (s['closed_at'] or self.now()) + 86400)
            elif s['plan'] and set(s['approvals']) == set(s['members']):
                self._job(db, s, mid, 'reminder', max(self.now(), parse_time(s['plan']['start']).timestamp()-900), s['plan_version'])
            self._save(db,s)
        return self.view(sid,token)

    def _job(self, db, s, uid, kind, due, version=None):
        key = hashlib.sha256(f"{s['id']}:{uid}:{kind}:{version}".encode()).hexdigest()
        db.execute("INSERT INTO jobs(id,session_id,member_id,kind,due_at,plan_version) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='pending',due_at=excluded.due_at,error=NULL WHERE jobs.status='cancelled'",
                   (key,s['id'],uid,kind,due,version))

    def advance(self, sid, token, expected_stage):
        with self.store.transaction() as db:
            s = self.store.load(db,sid); mid,_ = self._member(s,token); self._host(s,mid)
            if s.get('challenge',{} ) and s['challenge'].get('pending'):
                raise RelayError('A participant challenged this item. Resolve the review before advancing.',409)
            if s['stage'] != expected_stage:
                raise RelayError('The stage changed. Refresh before continuing.',409)
            if s['stage'] == 'debrief':
                raise RelayError('This session is complete.',409)
            if len(s['members']) < 2:
                raise RelayError('At least two participants are required for the peer session.')
            if s['stage'] in ('diagnostic','transfer'):
                missing = set(s['members']) - set(s['answers'][s['stage']])
                if missing:
                    raise RelayError('Wait for every participant, or explicitly mark a skipped response.',409)
            if s['stage'] == 'discussion' and not s['explanations']:
                raise RelayError('Invite a voluntary peer explanation or explicitly record a source-based fallback.',409)
            old = s['stage']; s['stage'] = STAGES[STAGES.index(old)+1]
            s['history'].append({'from':old,'to':s['stage'],'at':self.now()})
            if s['stage'] == 'debrief':
                s['closed_at'] = self.now()
                for uid,m in s['members'].items():
                    if m['reminders']:
                        self._job(db,s,uid,'retention',self.now()+86400)
            self._save(db,s)
        return self.view(sid,token)

    def answer(self,sid,token,question_id,choice,confidence='unsure',rationale=''):
        with self.store.transaction() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token)
            phase=s['stage']
            if s.get('invalidated') or (s.get('challenge') and s['challenge'].get('pending')):
                raise RelayError('This item is paused or discarded; no answer is being graded.',409)
            if phase=='debrief':
                phase='retention'
                if self.now() < (s['closed_at'] or 0)+86400:
                    raise RelayError('The delayed check is not due. Do not present an immediate check as retention.',409)
            if phase not in s['answers']:
                raise RelayError('Answers are not accepted in this stage.',409)
            item=s['pack'][phase]
            if item['id']!=question_id:
                raise RelayError('Wrong or stale question.',409)
            if choice not in item['options'] and choice!='SKIP':
                raise RelayError('Select a valid option or SKIP.')
            if confidence not in ('unsure','somewhat','confident'):
                raise RelayError('Invalid confidence choice.')
            answer={'choice':choice,'confidence':confidence,'rationale':str(rationale)[:600],
                    'correct':None if choice=='SKIP' else choice==item['correct'],
                    'question_id':question_id,'at':self.now()}
            previous=s['answers'][phase].get(mid)
            if previous:
                if previous['choice']==choice and previous['confidence']==confidence:
                    return self._project(s,mid)
                raise RelayError('This answer is already locked. Do not replace another attempt.',409)
            s['answers'][phase][mid]=answer
            self._save(db,s)
            return self._project(s,mid)

    def explain(self,sid,token,text,source_fallback=False):
        with self.store.transaction() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token)
            if s['stage']!='discussion':
                raise RelayError('Peer explanations belong in the discussion stage.',409)
            if source_fallback:
                self._host(s,mid)
                text='No volunteer explanation. Group reviewed the provided teaching note.'
            text=str(text).strip()
            if not 1<=len(text)<=1200:
                raise RelayError('Use 1-1200 characters.')
            s['explanations'].append({'author':s['members'][mid]['name'],'text':text,
                                     'source_fallback':bool(source_fallback)})
            self._save(db,s)
        return self.view(sid,token)

    def view(self,sid,token):
        with self.store.connect() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token)
        return self._project(s,mid)

    def _project(self,s,mid):
        c=s['pack']; stage=s['stage']; m=s['members'][mid]
        result={'id':s['id'],'concept':{'id':c['id'],'title':c['title']},'stage':stage,
                'revision':s['revision'],'pack_hash':s['pack_hash'],'is_host':mid==s['host'],'members':[],
                'me':{'name':m['name'],'reminders':m['reminders'],'availability':m['availability']},
                'plan':s['plan'],'plan_version':s['plan_version'],'approved_count':len(s['approvals']),
                'approved_by_me':mid in s['approvals'],
                'schedule_confirmed':bool(s['plan']) and set(s['approvals'])==set(s['members']),
                'source':None,'question':None,'my_answer':None,'group':None,
                'challenge':s.get('challenge'),'invalidated':s.get('invalidated',False),
                'explanations':s['explanations'],'hint':None,'my_results':{},
                'notice':'Original demonstration material. No grade or mastery prediction.'}
        for uid,member in s['members'].items():
            result['members'].append({'name':member['name'],
                'responded':uid in s['answers'].get(stage,{}),'is_me':uid==mid})
        if stage in ('diagnostic','transfer'):
            result['question']=public_question(c[stage])
            answer=s['answers'][stage].get(mid)
            result['my_answer']={k:answer[k] for k in ('choice','confidence')} if answer else None
        if stage in ('discussion','debrief') or (s.get('challenge') and s['challenge'].get('pending')):
            result['source']={k:c[k] for k in ('source_id','source_title','source_text')}
        if stage=='discussion':
            result['hint']=s.get('facilitator') or {'discussion_question':c['hint'],
                         'mode':'curated fallback','possible_misconception':'Use the source to examine the reasoning.'}
            # No participant-level correctness, rationales, or confidence in group state.
            diag=list(s['answers']['diagnostic'].values())
            high_wrong=sum(a['correct'] is False and a['confidence']=='confident' for a in diag)
            result['discussion_signal']='Check the shared assumption' if high_wrong>=2 else 'Compare the reasoning'
        if stage=='debrief':
            # Aggregate performance is suppressed below three actual paired responders.
            matched=[uid for uid in s['members'] if s['answers']['diagnostic'].get(uid,{}).get('correct') is not None
                       and s['answers']['transfer'].get(uid,{}).get('correct') is not None]
            if len(matched)>=3 and not s.get('invalidated'):
                result['group']={'paired_responses':len(matched),
                    'initial_correct':sum(s['answers']['diagnostic'][u]['correct'] for u in matched),
                    'fresh_correct':sum(s['answers']['transfer'][u]['correct'] for u in matched),
                    'warning':'Immediate item performance; not causal evidence or lasting mastery. Small groups can still infer information.'}
            for phase in ('diagnostic','transfer','retention'):
                if mid in s['answers'][phase]:
                    a=s['answers'][phase][mid]
                    result['my_results'][phase]={'choice':a['choice'],'correct':None if s.get('invalidated') else a['correct'],
                        'explanation':c[phase]['explanation'],'question_id':a['question_id']}
            due=(s['closed_at'] or 0)+86400
            result['retention_due_at']=due
            if self.now()>=due and mid not in s['answers']['retention'] and not s.get('invalidated'):
                result['question']=public_question(c['retention'])
        return result

    def challenge(self,sid,token,reason):
        reason=str(reason).strip()
        if not 5<=len(reason)<=500: raise RelayError('Explain the issue in 5-500 characters.')
        with self.store.transaction() as db:
            s=self.store.load(db,sid);self._member(s,token)
            if s['stage'] not in ('diagnostic','discussion','transfer'):
                raise RelayError('Challenge an item during an active learning round.',409)
            if s.get('challenge') and s['challenge'].get('pending'):
                raise RelayError('An item review is already open.',409)
            s['challenge']={'reason':reason,'pending':True,'stage':s['stage'],'resolution':None}
            self._save(db,s)
        return self.view(sid,token)

    def resolve_challenge(self,sid,token,decision,note):
        if decision not in ('resume','discard') or not 10<=len(str(note).strip())<=500:
            raise RelayError('Choose resume/discard and provide a review note (10-500 characters).')
        with self.store.transaction() as db:
            s=self.store.load(db,sid);mid,_=self._member(s,token);self._host(s,mid)
            if not s.get('challenge') or not s['challenge']['pending']:
                raise RelayError('There is no open item review.',409)
            s['challenge'].update(pending=False,resolution={'decision':decision,'host_note':str(note).strip()})
            if decision=='discard':
                s['invalidated']=True;s['stage']='debrief';s['closed_at']=self.now()
                db.execute("UPDATE jobs SET status='cancelled' WHERE session_id=? AND status IN ('pending','leased')",(sid,))
            self._save(db,s)
        return self.view(sid,token)

    def calendar_file(self,sid,token):
        with self.store.connect() as db:
            s=self.store.load(db,sid); self._member(s,token)
            if not s['plan'] or set(s['approvals'])!=set(s['members']):
                raise RelayError('All participants must approve the current plan first.',409)
            return ics_event(sid,s['plan_version'],s['plan']['start'],s['plan']['end'])

    def model_context(self,sid,token):
        with self.store.connect() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token); self._host(s,mid)
            if s['stage']!='discussion' or (s.get('challenge') or {}).get('pending'):
                raise RelayError('Facilitation requires an unpaused discussion.',409)
            c=s['pack']
            # Send aggregate option counts only, not names or private free text.
            counts={k:sum(a['choice']==k for a in s['answers']['diagnostic'].values()) for k in c['diagnostic']['options']}
            return {'source_id':c['source_id'],'source_text':c['source_text'],
                    'question':c['diagnostic']['prompt'],'option_counts':counts,
                    'candidate_misconceptions':c['diagnostic']['misconceptions'],
                    'reviewed_hint':c['hint']}, s['revision']

    def save_facilitation(self,sid,token,payload,revision):
        with self.store.transaction() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token); self._host(s,mid)
            if s['stage']!='discussion' or s['revision']!=revision:
                raise RelayError('The session changed during inference. Retry on the current state.',409)
            s['facilitator']=payload; self._save(db,s)
        return self.view(sid,token)

    def delete(self,sid,token):
        with self.store.transaction() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token); self._host(s,mid)
            db.execute('DELETE FROM jobs WHERE session_id=?',(sid,))
            db.execute('DELETE FROM sessions WHERE id=?',(sid,))
        return {'deleted':True,'notice':'Deleted from this prototype database. Provider or infrastructure logs are separate.'}
