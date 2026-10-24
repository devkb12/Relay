"""Durable, consent-checked delivery. n8n triggers this worker, not answer grading."""
from __future__ import annotations
import time
import httpx
from .store import Store

class RetryLater(Exception):
    def __init__(self, seconds=60): self.seconds=seconds
class DeliveryUnknown(Exception): pass
class DeliveryBlocked(Exception): pass


def discord_send(bot_token, discord_id, text):
    if not bot_token or not discord_id:
        raise DeliveryBlocked('No configured Discord destination.')
    headers={'Authorization':f'Bot {bot_token}'}
    with httpx.Client(timeout=12, headers=headers) as client:
        try:
            response=client.post('https://discord.com/api/v10/users/@me/channels',json={'recipient_id':str(discord_id)})
            if response.status_code==429: raise RetryLater(response.json().get('retry_after',60))
            if response.status_code>=400: raise DeliveryBlocked('Cannot open DM; user may have disabled DMs.')
            channel=response.json()['id']
        except httpx.HTTPError as exc:
            raise RetryLater(60) from exc  # No study message has been sent yet.
        try:
            response=client.post(f'https://discord.com/api/v10/channels/{channel}/messages',
                json={'content':text,'allowed_mentions':{'parse':[]}})
        except httpx.HTTPError as exc:
            # A timeout can occur after Discord accepted a message. Do not blindly resend.
            raise DeliveryUnknown('Message delivery outcome is unknown; inspect before retrying.') from exc
        if response.status_code==429: raise RetryLater(response.json().get('retry_after',60))
        if response.status_code>=500: raise DeliveryUnknown('Provider error; delivery needs inspection.')
        if response.status_code>=400: raise DeliveryBlocked('Discord rejected the message.')
        return response.json()['id']


def tick(store: Store, sender=None, kind=None, now=None, limit=8, dry_run=True):
    now=time.time() if now is None else now
    query="SELECT * FROM jobs WHERE status='pending' AND due_at<=?"
    args=[now]
    if kind: query+=' AND kind=?'; args.append(kind)
    query+=' ORDER BY due_at LIMIT ?'; args.append(limit)
    with store.transaction() as db:
        # An expired lease could represent a sent-but-unacknowledged message.
        # Preserve it for inspection instead of turning at-least-once into spam.
        if not dry_run:
            db.execute("UPDATE jobs SET status='unknown',error='Expired delivery lease; inspect outcome' WHERE status='leased' AND lease_until<?",(now,))
        rows=[dict(r) for r in db.execute(query,args)]
        if dry_run:
            return {'dry_run':True,'due_jobs':len(rows),'sent':0,
                    'notice':'No network delivery attempted.'}
        for row in rows:
            db.execute("UPDATE jobs SET status='leased',lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending'",(now+60,row['id']))
    result={'dry_run':False,'claimed':len(rows),'sent':0,'cancelled':0,'failed':0,'unknown':0,'retry':0}
    for row in rows:
        status,error,provider_id,due='cancelled',None,None,row['due_at']
        try:
            with store.connect() as db:
                s=store.load(db,row['session_id'])
                member=s['members'].get(row['member_id'])
                current=db.execute('SELECT status FROM jobs WHERE id=?',(row['id'],)).fetchone()
            allowed=bool(member and member['reminders'] and current and current['status']=='leased')
            if row['kind']=='reminder':
                allowed=allowed and bool(s['plan']) and row['plan_version']==s['plan_version'] and set(s['approvals'])==set(s['members'])
                text=f"Your approved RELAY session starts at {s['plan']['start'] if s['plan'] else 'a changed time'} (UTC). Open the study channel. Use /relay reminders off to stop reminders."
            else:
                allowed=allowed and not s.get('invalidated') and s['stage']=='debrief' and now >= (s['closed_at'] or 0)+86400
                text='Your optional RELAY follow-up is ready. Open the study channel and use /relay question. This is a delayed practice check, not a grade. Use /relay reminders off to stop.'
            if allowed:
                if sender is None: raise DeliveryBlocked('No delivery adapter configured.')
                provider_id=sender(member.get('discord_id'),text)
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
            db.execute('UPDATE jobs SET status=?,provider_id=?,error=?,due_at=?,lease_until=NULL WHERE id=?',
                       (status,provider_id,error,due,row['id']))
    return result
