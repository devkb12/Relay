'use client';

import { createContext, useContext } from 'react';
import type { Room } from '@/lib/room';
import type { Health, SessionView } from '@/lib/schemas';
import type { Mode } from '@/components/states';

export type RoomCtx = { room: Room; view: SessionView; sid: string; mode: Mode; health?: Health; basePath: string };

const Ctx = createContext<RoomCtx | null>(null);

export const RoomProvider = ({ value, children }: { value: RoomCtx; children: React.ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;

export function useRoomCtx() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRoomCtx outside RoomProvider');
  return v;
}

/** Members still expected to answer in this stage (server's own member states). */
export const waitingCount = (v: SessionView) => v.members.filter((m) => m.state === 'waiting').length;
