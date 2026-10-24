"""Durable, consent-checked delivery. n8n triggers this worker, not answer grading.

Jobs are claimed atomically (a row is processed only by the tick whose UPDATE changed it), so
concurrent ticks, workflow retries and restarts cannot send the same reminder twice. A timeout
after a possible send becomes 'unknown' for inspection, never a blind resend. Exactly-once
external delivery is NOT promised, and a cancellation cannot retract a message Discord accepted.
"""
from __future__ import annotations
import time
import httpx
from .store import Store
from .scheduling import local_label

class RetryLater(Exception):
    def __init__(self, seconds=60): self.seconds=seconds
class DeliveryUnknown(Exception): pass
class DeliveryBlocked(Exception): pass

def _retry_after(response):
    try: return float(response.headers.get('retry-after') or response.json().get('retry_after',60))
    except Exception: return 60.0

def discord_send(bot_token, discord_id, text):
    if not bot_token or not discord_id:
        raise DeliveryBlocked('No configured Discord destination.')
    headers={'Authorization':f'Bot {bot_token}'}
    with httpx.Client(timeout=8, headers=headers) as client:
        try:
            response=client.post('https://discord.com/api/v10/users/@me/channels',json={'recipient_id':str(discord_id)})
            if response.status_code==429: raise RetryLater(_retry_after(response))
            if response.status_code>=500: raise RetryLater(60)
            if response.status_code>=400: raise DeliveryBlocked('Cannot open DM; user may have disabled DMs.')
            channel=response.json()['id']
        except httpx.HTTPError as exc:
            raise RetryLater(60) from exc  # No study message has been sent yet.
        try:
            response=client.post(f'https://discord.com/api/v10/channels/{channel}/messages',
                json={'content':text[:1900],'allowed_mentions':{'parse':[]}})
        except httpx.HTTPError as exc:
            # A timeout can occur after Discord accepted a message. Do not blindly resend.
            raise DeliveryUnknown('Message delivery outcome is unknown; inspect before retrying.') from exc
        if response.status_code==429: raise RetryLater(_retry_after(response))
        if response.status_code>=500: raise DeliveryUnknown('Provider error; delivery needs inspection.')
        if response.status_code==403: raise DeliveryBlocked('Discord refused the DM (DMs closed or no shared server).')
        if response.status_code>=400: raise DeliveryBlocked('Discord rejected the message.')
        return response.json()['id']

def _message(row, s, member):
    tz=member.get('timezone') or 'America/Phoenix'
    if row['kind']=='reminder':
        when=local_label(s['plan']['start'],tz) if s['plan'] else 'a changed time'
        return f"Your approved RELAY session starts {when}. Open the study channel. Use /relay reminders enabled:False to stop reminders."
    return 'Your optional RELAY follow-up is ready. Open the study channel and use /relay question. This is a delayed practice check, not a grade. Use /relay reminders enabled:False to stop.'

def _allowed(row, s, member, now, active):
    if not member or member.get('withdrawn_at') or not member['reminders'] or s.get('deleted'): return False
    if row['member_id'] not in active: return False
    if row['kind']=='reminder':
        return bool(s['plan']) and row['plan_version']==s['plan_version'] and set(s['plan_members'])==set(active) and set(s['approvals'])>=set(active)
    return not s.get('invalidated') and s['stage']=='debrief' and now >= (s['closed_at'] or 0)+86400

def tick(store: Store, sender=None, kind=None, now=None, limit=8, dry_run=True, budget_seconds=20.0):
    started=time.monotonic()
    now=time.time() if now is None else now
    query="SELECT * FROM jobs WHERE status='pending' AND due_at<=?"
    args=[now]
    if kind: query+=' AND kind=?'; args.append(kind)
    query+=' ORDER BY due_at LIMIT ?'; args.append(limit)
    claimed=[]
    with store.transaction() as db:
        if dry_run:
            rows=db.execute(query,args).fetchall()
            return {'dry_run':True,'due_jobs':len(rows),'sent':0,'notice':'No network delivery attempted.'}
        # An expired lease could represent a sent-but-unacknowledged message.
        # Preserve it for inspection instead of turning at-least-once into spam.
        db.execute("UPDATE jobs SET status='unknown',error='Expired delivery lease; inspect outcome' WHERE status='leased' AND lease_until<?",(now,))
        for row in [dict(r) for r in db.execute(query,args).fetchall()]:
            cur=db.execute("UPDATE jobs SET status='leased',lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending'",(now+60,row['id']))
            if cur.rowcount==1: claimed.append(row)
    result={'dry_run':False,'claimed':len(claimed),'sent':0,'cancelled':0,'failed':0,'unknown':0,'retry':0,'deferred':0}
    from .core import Relay
    for row in claimed:
        status,error,provider_id,due=('cancelled',None,None,row['due_at'])
        if time.monotonic()-started>budget_seconds:
            # Stay under the caller's timeout: release untouched claims for the next tick.
            status='pending'; result['deferred']+=1
        else:
            try:
                with store.connect() as db:
                    s=store.load(db,row['session_id'])
                    current=db.execute('SELECT status FROM jobs WHERE id=?',(row['id'],)).fetchone()
                member=s['members'].get(row['member_id'])
                # Re-check consent, membership, plan version and invalidation immediately before dispatch.
                if current and current['status']=='leased' and _allowed(row,s,member,now,Relay.active(s)):
                    if sender is None: raise DeliveryBlocked('No delivery adapter configured.')
                    provider_id=sender(member.get('discord_id'),_message(row,s,member))
                    status='sent'
            except KeyError:
                status='cancelled'
            except RetryLater as exc:
                status='pending'; due=now+max(1,float(exc.seconds)); result['retry']+=1
            except DeliveryUnknown as exc:
                status='unknown'; error=str(exc); result['unknown']+=1
            except DeliveryBlocked as exc:
                status='failed'; error=str(exc); result['failed']+=1
            except Exception:
                # Unexpected errors must not result in an automatic duplicate delivery.
                status='unknown'; error='Unexpected delivery failure; inspect server logs.'; result['unknown']+=1
            if status in ('sent','cancelled'): result[status]+=1
        with store.transaction() as db:
            # A concurrent revocation may have cancelled the lease; a message already sent is still recorded as sent.
            db.execute("UPDATE jobs SET status=?,provider_id=?,error=?,due_at=?,lease_until=NULL WHERE id=? AND (status='leased' OR ?='sent')",
                       (status,provider_id,error,due,row['id'],status))
    return result

def list_jobs(store: Store, status='unknown', limit=50):
    with store.connect() as db:
        rows=db.execute('SELECT id,session_id,kind,status,due_at,attempts,provider_id,error FROM jobs WHERE status=? ORDER BY due_at LIMIT ?',(status,limit)).fetchall()
    return [dict(r) for r in rows]

def reconcile(store: Store, job_id, outcome, note):
    """Operator decision for an ambiguous job after checking Discord. Never re-queues a send."""
    from .core import RelayError
    with store.transaction() as db:
        cur=db.execute("UPDATE jobs SET status=?,error=? WHERE id=? AND status IN ('unknown','failed')",(outcome,('reconciled: '+note)[:200],job_id))
        if cur.rowcount!=1: raise RelayError('Only unknown or failed jobs can be reconciled.',409)
    return {'id':job_id,'status':outcome}
