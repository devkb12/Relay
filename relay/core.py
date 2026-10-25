from __future__ import annotations
import hashlib, hmac, secrets, time, copy, json
from datetime import datetime, timedelta, timezone
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .bank import concept, public_question
from .scheduling import find_slots, parse_time, ics_event, local_label
from .store import Store

STAGES = ('lobby', 'diagnostic', 'discussion', 'transfer', 'debrief')
DEFAULT_TZ = 'America/Phoenix'
DAY = 86400

class RelayError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status
        super().__init__(message)


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def outcome(answer, invalidated=False):
    """One vocabulary everywhere: an absent or withdrawn response is never 'incorrect'."""
    if invalidated: return 'invalidated'
    if answer is None: return 'missing'
    if answer['choice'] == 'SKIP': return 'skipped'
    return 'correct' if answer['correct'] else 'incorrect'

class Relay:
    def __init__(self, store: Store, now: Callable[[], float] = time.time, secret=''):
        self.store, self.now, self.secret = store, now, secret

    def discord_token(self, sid, uid):
        if len(self.secret) < 32:
            raise RelayError('Set a service key of at least 32 characters.', 503)
        return hmac.new(self.secret.encode(), f'{sid}:{uid}'.encode(), hashlib.sha256).hexdigest()

    def _member(self, s, token, allow_withdrawn=False):
        if s.get('deleted'):
            raise RelayError('Session not found.', 404)
        for mid, member in s['members'].items():
            if hmac.compare_digest(member['token_hash'], digest(token)):
                if member.get('withdrawn_at') and not allow_withdrawn:
                    raise RelayError('You left this session. Your responses were removed.', 403)
                return mid, member
        raise RelayError('Not authorized for this session.', 403)

    def _host(self, s, mid):
        if mid != s['host']:
            raise RelayError('Only the session host may do this.', 403)

    @staticmethod
    def active(s):
        return [mid for mid, m in s['members'].items() if not m.get('withdrawn_at')]

    def _save(self, db, s):
        s['revision'] += 1
        self.store.save(db, s)

    def _new_member(self, name, discord_id, token):
        return {'name': self._name(name), 'token_hash': digest(token), 'reminders': False,
                'discord_id': discord_id, 'availability': [], 'timezone': DEFAULT_TZ,
                'joined_at': self.now(), 'withdrawn_at': None}

    def create(self, name, concept_id='compound-change', discord_id=None, channel=None):
        concept(concept_id)
        sid = secrets.token_urlsafe(9)
        mid = f'discord:{discord_id}' if discord_id else 'web:' + secrets.token_hex(6)
        token = self.discord_token(sid, mid) if discord_id else secrets.token_urlsafe(32)
        pack = copy.deepcopy(concept(concept_id))
        session = {'id': sid, 'host': mid, 'concept_id': concept_id, 'stage': 'lobby',
                   'revision': 1, 'created_at': self.now(), 'channel': channel,
                   'pack': pack,
                   'pack_hash': hashlib.sha256(json.dumps(pack, sort_keys=True).encode()).hexdigest(),
                   'members': {mid: self._new_member(name, discord_id, token)},
                   'answers': {'diagnostic': {}, 'transfer': {}, 'retention': {}},
                   'missing': {'diagnostic': [], 'transfer': []},
                   'explanations': [], 'plan_version': 0, 'plan': None, 'plan_members': [], 'approvals': [],
                   'plan_cancelled': None, 'history': [], 'facilitator': None, 'closed_at': None, 'deleted': False,
                   'challenge': None, 'invalidated': False}
        with self.store.transaction() as db:
            self.store.save(db, session)
            self.store.audit(db, sid, 'created', {'concept': concept_id, 'pack_hash': session['pack_hash'][:12]}, self.now())
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
            if s['deleted']: raise RelayError('Session not found.', 404)
            mid = f'discord:{discord_id}' if discord_id else 'web:' + secrets.token_hex(6)
            existing = s['members'].get(mid)
            if existing and not existing.get('withdrawn_at'):
                return {'session_id': sid, 'token': self.discord_token(sid, mid), 'member_id': mid}
            if s['stage'] != 'lobby':
                raise RelayError('The roster is locked after the session begins.', 409)
            if len(self.active(s)) >= 8:
                raise RelayError('This prototype supports at most eight participants.')
            token = self.discord_token(sid, mid) if discord_id else secrets.token_urlsafe(32)
            s['members'][mid] = self._new_member(name, discord_id, token)
            self._invalidate_schedule(db, s)
            self._save(db, s)
            return {'session_id': sid, 'token': token, 'member_id': mid}

    def withdraw(self, sid, token):
        """Participant leaves. Their stored responses are deleted; the host is never reassigned."""
        with self.store.transaction() as db:
            s = self.store.load(db, sid); mid, m = self._member(s, token)
            if mid == s['host']:
                raise RelayError('The host cannot leave an active session. Delete the session instead; RELAY never appoints a new host silently.', 409)
            for phase in s['answers'].values(): phase.pop(mid, None)
            for item in s['explanations']:
                if item.get('author_id') == mid:
                    item.update(text='[Removed: participant withdrew]', author='Former participant', withdrawn=True)
            m.update(withdrawn_at=self.now(), availability=[], reminders=False)
            db.execute("UPDATE jobs SET status='cancelled' WHERE session_id=? AND member_id=? AND status IN ('pending','leased')", (sid, mid))
            if s['stage'] == 'lobby': self._invalidate_schedule(db, s)
            self.store.audit(db, sid, 'withdrawn', {'stage': s['stage']}, self.now())
            self._save(db, s)
        return {'withdrawn': True, 'notice': 'Your answers, reasoning, availability and pending reminders were removed. Messages already posted in Discord are not retracted.'}

    def _invalidate_schedule(self, db, s):
        s['plan_version'] += 1
        s['plan'], s['approvals'], s['plan_members'] = None, [], []
        db.execute("UPDATE jobs SET status='cancelled' WHERE session_id=? AND kind='reminder' AND status IN ('pending','leased')", (s['id'],))

    def _confirmed(self, s):
        active = set(self.active(s))
        return bool(s['plan']) and set(s['plan_members']) == active and set(s['approvals']) >= active

    def availability(self, sid, token, windows, tz=None):
        from .scheduling import normalize, iso
        cleaned = normalize(windows)
        now = datetime.fromtimestamp(self.now(), timezone.utc)
        if any(end <= now for _, end in cleaned):
            raise RelayError('Availability must be in the future.')
        if any(start > now + timedelta(days=60) for start, _ in cleaned):
            raise RelayError('Availability must start within the next 60 days.')
        if tz is not None:
            try: ZoneInfo(tz)
            except (ZoneInfoNotFoundError, ValueError): raise RelayError('Use an IANA timezone such as America/Phoenix.')
        with self.store.transaction() as db:
            s = self.store.load(db, sid)
            mid, m = self._member(s, token)
            if s['stage'] != 'lobby':
                raise RelayError('Availability edits are restricted to the lobby.', 409)
            m['availability'] = [{'start': iso(a), 'end': iso(b)} for a, b in cleaned]
            if tz: m['timezone'] = tz
            self._invalidate_schedule(db, s)
            self._save(db, s)
        return self.view(sid, token)

    def propose(self, sid, token, durations=(60,45,30)):
        with self.store.transaction() as db:
            s = self.store.load(db, sid)
            mid, _ = self._member(s, token); self._host(s, mid)
            if s['stage'] != 'lobby':
                raise RelayError('Scheduling is only available in the lobby.', 409)
            active = self.active(s)
            options = find_slots({k: s['members'][k]['availability'] for k in active}, durations,
                                 datetime.fromtimestamp(self.now(), timezone.utc))
            self._invalidate_schedule(db, s)
            s['plan'] = options[0] if options else None
            s['plan_members'] = sorted(active) if options else []
            s['plan_cancelled'] = None
            self._save(db, s)
        return {'options': options, 'state': self.view(sid, token),
                'notice': None if options else 'No common slot. Ask participants to change availability or duration; nobody was silently excluded.'}

    def cancel_plan(self, sid, token):
        with self.store.transaction() as db:
            s = self.store.load(db, sid); mid, _ = self._member(s, token); self._host(s, mid)
            if not s['plan']: raise RelayError('There is no proposal to cancel.', 409)
            cancelled = {'version': s['plan_version'], 'start': s['plan']['start'], 'at': self.now()}
            self._invalidate_schedule(db, s)
            s['plan_cancelled'] = cancelled
            self._save(db, s)
        return self.view(sid, token)

    def approve(self, sid, token, version, accept_shorter=False):
        with self.store.transaction() as db:
            s = self.store.load(db, sid)
            mid, _ = self._member(s, token)
            if not s['plan'] or version != s['plan_version']:
                raise RelayError('This proposal changed. Review the current version.', 409)
            if mid not in s['plan_members']:
                raise RelayError('You joined after this proposal; the host must propose again.', 409)
            if s['plan'].get('shorter_alternative') and not accept_shorter:
                raise RelayError(f"This proposal is a shorter {s['plan']['minutes']}-minute alternative. Confirm the shorter time explicitly.", 409)
            if mid not in s['approvals']:
                s['approvals'].append(mid)
            if self._confirmed(s):
                for uid in self.active(s):
                    if s['members'][uid]['reminders']:
                        self._job(db, s, uid, 'reminder', self._reminder_due(s), version)
            self._save(db, s)
        return self.view(sid, token)

    def _reminder_due(self, s):
        return max(self.now(), parse_time(s['plan']['start']).timestamp() - 900)

    def consent(self, sid, token, enabled):
        with self.store.transaction() as db:
            s = self.store.load(db, sid); mid, m = self._member(s, token)
            m['reminders'] = bool(enabled)
            if not enabled:
                db.execute("UPDATE jobs SET status='cancelled' WHERE session_id=? AND member_id=? AND status IN ('pending','leased')", (sid,mid))
            elif s['stage'] == 'debrief' and not s.get('invalidated'):
                # Repeated consent updates do not push the job out or create duplicates.
                self._job(db, s, mid, 'retention', (s['closed_at'] or self.now()) + DAY)
            elif self._confirmed(s):
                self._job(db, s, mid, 'reminder', self._reminder_due(s), s['plan_version'])
            self._save(db,s)
        return self.view(sid,token)

    def _job(self, db, s, uid, kind, due, version=None):
        # Logical key: one job per session/member/kind/plan version, however often it is requested.
        key = hashlib.sha256(f"{s['id']}:{uid}:{kind}:{version}".encode()).hexdigest()
        db.execute("INSERT INTO jobs(id,session_id,member_id,kind,due_at,plan_version) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='pending',due_at=excluded.due_at,error=NULL WHERE jobs.status='cancelled'",
                   (key,s['id'],uid,kind,due,version))

    def advance(self, sid, token, expected_stage, nonresponders='wait'):
        if nonresponders not in ('wait', 'mark_missing'):
            raise RelayError('Use nonresponders=wait or mark_missing.')
        with self.store.transaction() as db:
            s = self.store.load(db,sid); mid,_ = self._member(s,token); self._host(s,mid)
            if (s.get('challenge') or {}).get('pending'):
                raise RelayError('A participant challenged this item. Resolve the review before advancing.',409)
            if s['stage'] != expected_stage:
                raise RelayError('The stage changed. Refresh before continuing.',409)
            if s['stage'] == 'debrief':
                raise RelayError('This session is complete.',409)
            active = self.active(s)
            if len(active) < 2:
                raise RelayError('At least two participants are required for the peer session.')
            if s['stage'] in ('diagnostic','transfer'):
                answered = set(s['answers'][s['stage']])
                missing = [m for m in active if m not in answered]
                if missing and nonresponders == 'wait':
                    raise RelayError(f'{len(missing)} participant(s) have not responded. Wait, or explicitly close the round and record them as missing (not incorrect).',409)
                if missing and len(answered & set(active)) < 2:
                    raise RelayError('At least two responses are needed before closing the round.',409)
                s['missing'][s['stage']] = sorted(missing)
            if s['stage'] == 'discussion' and not [e for e in s['explanations'] if not e.get('withdrawn')]:
                raise RelayError('Invite a voluntary peer explanation or explicitly record a source-based fallback.',409)
            old = s['stage']; s['stage'] = STAGES[STAGES.index(old)+1]
            s['history'].append({'from':old,'to':s['stage'],'at':self.now()})
            if s['stage'] == 'debrief':
                s['closed_at'] = self.now()
                for uid in active:
                    if s['members'][uid]['reminders']:
                        self._job(db,s,uid,'retention',self.now()+DAY)
            self.store.audit(db, sid, 'advanced', {'from': old, 'to': s['stage'], 'missing': len(s['missing'].get(old, []))}, self.now())
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
                if self.now() < (s['closed_at'] or 0)+DAY:
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
            previous=s['answers'][phase].get(mid)
            if previous:
                # Idempotency is scoped to actor + session + phase: identical retry returns the stored result.
                if previous['choice']==choice and previous['confidence']==confidence and previous['rationale']==str(rationale)[:600]:
                    return self._project(s,mid)
                raise RelayError('This answer is already locked. A changed resubmission is rejected, not applied.',409)
            s['answers'][phase][mid]={'choice':choice,'confidence':confidence,'rationale':str(rationale)[:600],
                    'correct':None if choice=='SKIP' else choice==item['correct'],
                    'question_id':question_id,'at':self.now()}
            self._save(db,s)
            return self._project(s,mid)

    def explain(self,sid,token,text,source_fallback=False):
        with self.store.transaction() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token)
            if s['stage']!='discussion':
                raise RelayError('Peer explanations belong in the discussion stage.',409)
            if (s.get('challenge') or {}).get('pending'):
                raise RelayError('The item is paused for review. Share explanations after the host resolves it.',409)
            if source_fallback:
                self._host(s,mid)
                text='No volunteer explanation. Group reviewed the provided teaching note.'
            text=str(text).strip()
            if not source_fallback and not (12<=len(text)<=1200 and len(text.split())>=3):
                raise RelayError('Explain the idea in at least a short sentence (12-1200 characters).')
            for item in s['explanations']:
                if item.get('author_id')==mid and item['text']==text:
                    return self._project(s,mid)  # identical retry
            s['explanations'].append({'author':s['members'][mid]['name'],'author_id':mid,'text':text,
                                     'source_fallback':bool(source_fallback)})
            self._save(db,s)
            return self._project(s,mid)

    def view(self,sid,token):
        with self.store.connect() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token,allow_withdrawn=True)
        return self._project(s,mid)

    def _project(self,s,mid):
        c=s['pack']; stage=s['stage']; m=s['members'][mid]; active=self.active(s)
        paused=bool((s.get('challenge') or {}).get('pending'))
        challenge=None
        if s.get('challenge'):
            ch=s['challenge']; challenge={k:ch.get(k) for k in ('id','reason','pending','stage','resolution')}
        tz=m.get('timezone') or DEFAULT_TZ
        plan=dict(s['plan'],start_local=local_label(s['plan']['start'],tz),timezone=tz) if s['plan'] else None
        result={'id':s['id'],'concept':{'id':c['id'],'title':c['title']},'stage':stage,
                'revision':s['revision'],'pack_hash':s['pack_hash'],'is_host':mid==s['host'],'members':[],
                'me':{'name':m['name'],'reminders':m['reminders'],'availability':m['availability'],
                      'timezone':tz,'withdrawn':bool(m.get('withdrawn_at'))},
                'plan':plan,'plan_version':s['plan_version'],'approved_count':len(set(s['approvals'])&set(active)),
                'approved_by_me':mid in s['approvals'],'plan_cancelled':s.get('plan_cancelled'),
                'needs_reproposal':bool(s['plan']) and set(s['plan_members'])!=set(active),
                'schedule_confirmed':self._confirmed(s),
                'paused':paused,'source':None,'question':None,'my_answer':None,'group':None,
                'challenge':challenge,'invalidated':s.get('invalidated',False),
                'explanations':[{k:e.get(k) for k in ('author','text','source_fallback')} for e in s['explanations']],
                'hint':None,'my_results':{},'receipt':None,
                'allowed_actions':self._allowed(s,mid),'waiting_on':self._waiting(s),
                'notice':'Original demonstration material. No grade or mastery prediction.'}
        if m.get('withdrawn_at'):
            result.update(members=[],explanations=[],plan=None)
            return result
        missing_now=set(s.get('missing',{}).get(stage,[]))
        for uid,member in s['members'].items():
            if member.get('withdrawn_at'):
                state='withdrawn'
            elif uid in s['answers'].get(stage,{}): state='responded'
            elif uid in missing_now: state='missing'
            else: state='waiting' if stage in ('diagnostic','transfer') else 'present'
            result['members'].append({'name':member['name'],'responded':state=='responded','state':state,
                                      'is_me':uid==mid,'is_host':uid==s['host']})
        if stage in ('diagnostic','transfer'):
            result['question']=public_question(c[stage])
            answer=s['answers'][stage].get(mid)
            result['my_answer']={k:answer[k] for k in ('choice','confidence')} if answer else None
        if stage in ('discussion','debrief') or paused:
            result['source']={k:c[k] for k in ('source_id','source_title','source_text')}
        if stage=='discussion':
            hint=s.get('facilitator') or {'discussion_question':c['hint'],'mode':'curated fallback',
                         'possible_misconception':'Use the source to examine the reasoning.'}
            result['hint']={k:hint.get(k) for k in ('discussion_question','possible_misconception','evidence_quote','source_id','mode','feedback_source','fallback_reason') if k in hint}
            result['hint'].setdefault('feedback_source','live_model' if hint.get('mode','').startswith('live') else 'reviewed_fallback')
            # No participant-level correctness, rationales, or confidence in group state.
            diag=list(s['answers']['diagnostic'].values())
            high_wrong=sum(a['correct'] is False and a['confidence']=='confident' for a in diag)
            result['discussion_signal']='Check the shared assumption' if high_wrong>=2 else 'Compare the reasoning'
        if stage=='debrief':
            invalid=bool(s.get('invalidated'))
            result['group']=self._group(s) if not invalid else None
            for phase in ('diagnostic','transfer','retention'):
                a=s['answers'][phase].get(mid)
                if phase=='retention' and a is None: continue
                if a is None and phase not in [h['from'] for h in s['history']]: continue
                result['my_results'][phase]={'status':outcome(a,invalid),'choice':a['choice'] if a else None,
                    'correct':None if invalid or a is None else a['correct'],
                    'explanation':c[phase]['explanation'],'question_id':c[phase]['id']}
            due=(s['closed_at'] or 0)+DAY
            result['retention_due_at']=due
            result['retention_note']='Delayed practice is separate evidence from the immediate items and opens after 24 hours.'
            if self.now()>=due and mid not in s['answers']['retention'] and not invalid:
                result['question']=public_question(c['retention'])
            result['receipt']=self._receipt(s,mid)
        return result

    def _waiting(self,s):
        stage=s['stage']
        if stage not in ('diagnostic','transfer'): return 0
        return sum(u not in s['answers'][stage] for u in self.active(s))

    def _allowed(self,s,mid):
        """What this viewer may do now, and the server's reason when not. Mirrors the checks in the
        mutating methods (tests assert they agree) so a client never re-derives the rules."""
        stage=s['stage']; host=mid==s['host']; active=self.active(s)
        paused=bool((s.get('challenge') or {}).get('pending')); invalid=bool(s.get('invalidated'))
        ok=lambda:{'allowed':True,'reason':None}
        no=lambda why:{'allowed':False,'reason':why}
        if s['members'][mid].get('withdrawn_at'):
            return {k:no('You left this session.') for k in ('answer','explain','source_fallback','challenge','resolve','advance','close_round')}
        answering=stage in ('diagnostic','transfer')
        answered=set(s['answers'][stage]) if answering else set()
        waiting=[u for u in active if u not in answered] if answering else []
        held='The item is paused for review.' if paused else 'This item was discarded after review.' if invalid else None
        if held: answer=no(held)
        elif answering: answer=no('Your answer is locked.') if mid in answered else ok()
        elif stage=='debrief' and self.now()>=(s['closed_at'] or 0)+DAY and mid not in s['answers']['retention']: answer=ok()
        else: answer=no('Answers open in Think privately and Fresh problem.')
        explain=ok() if stage=='discussion' and not paused else no(held or 'Explanations belong in Explain together.')
        fallback=explain if host else no('Only the host can record the source fallback.')
        challenge=ok() if stage in ('diagnostic','discussion','transfer') and not paused else no(held or 'Challenge an item during an active round.')
        resolve=no('Only the host reviews a challenge.') if not host else ok() if paused else no('There is no open item review.')
        if not host: advance=no('The host moves the group forward.')
        elif paused: advance=no('Resolve the review before moving on.')
        elif stage=='debrief': advance=no('This session is complete.')
        elif len(active)<2: advance=no('At least two participants are needed.')
        elif waiting: advance=no(f"Waiting for {len(waiting)} more {'answer' if len(waiting)==1 else 'answers'}.")
        elif stage=='discussion' and not [e for e in s['explanations'] if not e.get('withdrawn')]:
            advance=no('Needs one shared explanation, or the host records the source fallback.')
        else: advance=ok()
        if not host: close=no('The host closes a round.')
        elif paused or not answering or not waiting: close=no(held or ('Everyone has answered.' if answering else 'Only answering rounds can be closed.'))
        elif len(answered&set(active))<2: close=no('At least two responses are needed before closing the round.')
        else: close=ok()
        return {'answer':answer,'explain':explain,'source_fallback':fallback,'challenge':challenge,
                'resolve':resolve,'advance':advance,'close_round':close}

    def _receipt(self,s,mid):
        """Evidence-linked recap for one participant: what was checked, what they did, and a reviewed
        next step from a fixed policy (receipt-v1). No model, score, ranking or mastery claim."""
        c=s['pack']; invalid=bool(s.get('invalidated'))
        def part(phase):
            q=c[phase]; a=s['answers'][phase].get(mid); status=outcome(a,invalid)
            picked=a['choice'] if a and a['choice']!='SKIP' else None
            return {'question_id':q['id'],'prompt':q['prompt'],'status':status,'choice':picked,
                    'choice_text':q['options'].get(picked) if picked else None,
                    'reviewed_answer':None if invalid else q['options'][q['correct']]}
        shared=[e for e in s['explanations'] if not e.get('withdrawn') and not e.get('source_fallback')]
        initial,fresh=part('diagnostic'),part('transfer')
        if invalid:
            step=('discarded','This item was withdrawn after review, so nothing in this round counts. Start a new session when the group is ready.')
        elif fresh['status']=='correct':
            step=('try_later','Try a different application later. One correct answer right after a discussion does not show lasting understanding.')
        elif fresh['status']=='incorrect':
            step=('revisit_source',f"Reread “{c['source_title']}”, then try a different problem on the same idea.")
        else:
            step=('no_fresh_answer','No fresh answer was recorded, so this round says little about you. Try a different problem on the same idea when you are ready.')
        return {'concept':{'id':c['id'],'title':c['title']},
                'source':{'source_id':c['source_id'],'source_title':c['source_title']},'pack_hash':s['pack_hash'],
                'initial':initial,'fresh':fresh,
                'explanations':{'shared':len(shared),'mine':sum(e.get('author_id')==mid for e in shared),
                                'source_fallback':any(e.get('source_fallback') for e in s['explanations'])},
                'next_step':{'kind':step[0],'text':step[1],'policy':'receipt-v1',
                             'evidence':[initial['question_id'],fresh['question_id'],c['source_id']]},
                'delayed_check':{'opted_in':bool(s['members'][mid]['reminders']) and not invalid,
                                 'answered':mid in s['answers']['retention']},
                'limits':['Two different items right after one discussion: practice evidence, not a grade or a measure of lasting understanding.',
                          'Answers were checked against the reviewed source, which can still be wrong. Anyone could challenge it.']}

    def _group(self,s):
        # Aggregate performance is suppressed below three actual paired responders.
        active=self.active(s)
        matched=[u for u in active if s['answers']['diagnostic'].get(u,{}).get('correct') is not None
                 and s['answers']['transfer'].get(u,{}).get('correct') is not None]
        if len(matched)<3: return None
        tally=lambda phase:{k:sum(outcome(s['answers'][phase].get(u))==k for u in active) for k in ('correct','incorrect','skipped','missing')}
        return {'paired_responses':len(matched),
                'initial_correct':sum(s['answers']['diagnostic'][u]['correct'] for u in matched),
                'fresh_correct':sum(s['answers']['transfer'][u]['correct'] for u in matched),
                'active_participants':len(active),
                'withdrawn':len(s['members'])-len(active),
                'initial_outcomes':tally('diagnostic'),'fresh_outcomes':tally('transfer'),
                'warning':'Two different immediate items, same participants. Not causal evidence of learning or lasting mastery. Small groups can still infer individual results.'}

    def challenge(self,sid,token,reason):
        reason=str(reason).strip()
        if not 5<=len(reason)<=500: raise RelayError('Explain the issue in 5-500 characters.')
        with self.store.transaction() as db:
            s=self.store.load(db,sid);self._member(s,token)
            if s['stage'] not in ('diagnostic','discussion','transfer'):
                raise RelayError('Challenge an item during an active learning round.',409)
            if s.get('challenge') and s['challenge'].get('pending'):
                raise RelayError('An item review is already open.',409)
            item=s['pack'][s['stage'] if s['stage']!='discussion' else 'diagnostic']['id']
            s['challenge']={'id':secrets.token_hex(4),'reason':reason,'pending':True,'stage':s['stage'],
                            'item_id':item,'resolution':None}
            self.store.audit(db,sid,'challenged',{'stage':s['stage'],'item':item},self.now())
            self._save(db,s)
        return self.view(sid,token)

    def resolve_challenge(self,sid,token,decision,note,challenge_id=None):
        if decision not in ('resume','discard') or not 10<=len(str(note).strip())<=500:
            raise RelayError('Choose resume/discard and provide a review note (10-500 characters).')
        with self.store.transaction() as db:
            s=self.store.load(db,sid);mid,_=self._member(s,token);self._host(s,mid)
            if not s.get('challenge') or not s['challenge']['pending']:
                raise RelayError('There is no open item review.',409)
            if challenge_id and challenge_id!=s['challenge'].get('id'):
                raise RelayError('This review was already resolved or replaced. Refresh first.',409)
            s['challenge'].update(pending=False,resolution={'decision':decision,'host_note':str(note).strip()})
            if decision=='discard':
                # Results are suppressed, never regraded in place. A corrected item must be a new reviewed version.
                s['invalidated']=True;s['stage']='debrief';s['closed_at']=self.now()
                db.execute("UPDATE jobs SET status='cancelled' WHERE session_id=? AND status IN ('pending','leased')",(sid,))
            self.store.audit(db,sid,'resolved',{'decision':decision,'item':s['challenge'].get('item_id')},self.now())
            self._save(db,s)
        return self.view(sid,token)

    def review_packet(self,sid,token):
        """Host review: item, key and source only. Classmates' private reasoning is not included."""
        with self.store.connect() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token); self._host(s,mid)
        ch=s.get('challenge')
        if not ch or not ch.get('pending'): raise RelayError('There is no open item review.',409)
        phase='diagnostic' if ch['stage']=='discussion' else ch['stage']
        item=s['pack'][phase]
        return {'challenge':{k:ch.get(k) for k in ('id','reason','stage','item_id')},
                'item':{k:item[k] for k in ('id','prompt','options','correct','explanation')},
                'source':{k:s['pack'][k] for k in ('source_id','source_title','source_text')},'pack_hash':s['pack_hash']}

    def calendar_file(self,sid,token):
        with self.store.connect() as db:
            s=self.store.load(db,sid); self._member(s,token)
            if not self._confirmed(s):
                raise RelayError('All participants must approve the current plan first.',409)
            return ics_event(sid,s['plan_version'],s['plan']['start'],s['plan']['end'])

    def model_context(self,sid,token):
        with self.store.connect() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token); self._host(s,mid)
            if s['stage']!='discussion' or (s.get('challenge') or {}).get('pending'):
                raise RelayError('Facilitation requires an unpaused discussion.',409)
            c=s['pack']
            # Aggregate option counts only: no names, rationales, fresh/delayed items, or answer key.
            # Misconceptions are unlabeled so the missing option letter cannot reveal the key.
            counts={k:sum(a['choice']==k for a in s['answers']['diagnostic'].values()) for k in c['diagnostic']['options']}
            return {'source_id':c['source_id'],'source_text':c['source_text'],
                    'question':c['diagnostic']['prompt'],'option_counts':counts,
                    'candidate_misconceptions':sorted(c['diagnostic']['misconceptions'].values()),
                    'reviewed_hint':c['hint']}, s['revision']

    def save_facilitation(self,sid,token,payload,revision):
        with self.store.transaction() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token); self._host(s,mid)
            if s['stage']!='discussion' or s['revision']!=revision or (s.get('challenge') or {}).get('pending'):
                raise RelayError('The session changed during inference. Retry on the current state.',409)
            s['facilitator']=payload; self._save(db,s)
        return self.view(sid,token)

    def delete(self,sid,token):
        with self.store.transaction() as db:
            s=self.store.load(db,sid); mid,_=self._member(s,token); self._host(s,mid)
            self.store.delete_session(db,sid)
        return {'deleted':True,'notice':'Deleted from the RELAY database, including jobs and audit records. Discord messages already posted, provider logs and backups are separate.'}

    def purge_expired(self,retention_days):
        """Retention: delete sessions created more than retention_days ago. Returns the count."""
        cutoff=self.now()-retention_days*DAY
        with self.store.transaction() as db:
            ids=[r[0] for r in db.execute('SELECT id FROM sessions WHERE created_at<?',(cutoff,)).fetchall()]
            for sid in ids: self.store.delete_session(db,sid)
            db.execute('DELETE FROM oauth_states WHERE expires_at<?',(self.now(),))
            db.execute('DELETE FROM web_sessions WHERE expires_at<? OR revoked_at IS NOT NULL',(self.now(),))
        return len(ids)
