/**
 * Local test identities (RELAY_PUBLIC_DEMO backends only). Participant tokens are capability
 * credentials: kept in sessionStorage only, never in URLs, cookies, localStorage, logs or analytics.
 */
import type { Credentials } from './schemas';

export type Identity = Credentials & { name: string };
const LIST = 'relay.identities';
const activeKey = (sid: string) => `relay.active.${sid}`;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function listIdentities(sessionId?: string): Identity[] {
  try {
    const all = JSON.parse(storage()?.getItem(LIST) ?? '[]') as Identity[];
    return sessionId ? all.filter((i) => i.session_id === sessionId) : all;
  } catch {
    return [];
  }
}

export function addIdentity(identity: Identity) {
  const s = storage();
  if (!s) return;
  const all = listIdentities().filter((i) => i.member_id !== identity.member_id || i.session_id !== identity.session_id);
  all.push(identity);
  s.setItem(LIST, JSON.stringify(all));
  s.setItem(activeKey(identity.session_id), identity.member_id);
}

export function activeIdentity(sessionId: string): Identity | null {
  const mine = listIdentities(sessionId);
  const wanted = storage()?.getItem(activeKey(sessionId));
  return mine.find((i) => i.member_id === wanted) ?? mine[0] ?? null;
}

export function setActive(sessionId: string, memberId: string) {
  storage()?.setItem(activeKey(sessionId), memberId);
}

export function forgetSession(sessionId: string) {
  const s = storage();
  if (!s) return;
  s.setItem(LIST, JSON.stringify(listIdentities().filter((i) => i.session_id !== sessionId)));
  s.removeItem(activeKey(sessionId));
}
