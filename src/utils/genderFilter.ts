import { isAdminTelegramUser } from './tokenomics';

export type BinaryGender = 'male' | 'female';

export interface RouletteParticipantLike {
  socketId: string;
  uid: string;
  name?: string;
  avatar?: string;
  gender?: string;
}

/**
 * Normalizes user/author gender strictly to 'male' | 'female' | ''.
 */
export function normalizeBinaryGender(input: any): BinaryGender | '' {
  if (!input) return '';
  const raw =
    typeof input === 'string'
      ? input
      : input.gender || input.authorGender || input.faceId?.detectedGender || '';
  const clean = String(raw).trim().toLowerCase();
  if (clean === 'male' || clean === 'erkak' || clean === 'yigit') return 'male';
  if (clean === 'female' || clean === 'ayol' || clean === 'qiz') return 'female';
  return '';
}

/**
 * Strict dating platform rule: returns true ONLY when both parties have known opposite binary genders.
 * Never returns true for same-gender or missing/unknown genders.
 */
export function areOppositeGenders(a: any, b: any): boolean {
  const ga = normalizeBinaryGender(a);
  const gb = normalizeBinaryGender(b);
  return Boolean(ga && gb && ga !== gb);
}

/**
 * Visibility check for dating discovery, map markers, and live streams (Efirlar).
 * Never shows self and never shows same-gender profiles to each other.
 */
export function isOppositeGenderUserVisible(
  targetUser: any,
  viewerUser: any,
  options: { allowAdminAll?: boolean } = {}
): boolean {
  if (!targetUser || !viewerUser) return false;
  const targetUid = String(targetUser.uid || '').trim();
  const targetId = String(targetUser.id || '').trim();
  const viewerUid = String(viewerUser.uid || '').trim();
  const viewerId = String(viewerUser.id || '').trim();

  if (viewerUid && (targetUid === viewerUid || targetId === viewerUid)) return false;
  if (viewerId && (targetUid === viewerId || targetId === viewerId)) return false;

  if (options.allowAdminAll && isAdminTelegramUser(viewerUser)) {
    return true;
  }

  return areOppositeGenders(targetUser, viewerUser);
}

/**
 * Finds the first waiting participant in Chatruletka queue whose gender is strictly opposite.
 */
export function findOppositeGenderRouletteMatchIndex<T extends RouletteParticipantLike>(
  queue: T[],
  me: RouletteParticipantLike
): number {
  const myGender = normalizeBinaryGender(me.gender);
  if (!myGender || !Array.isArray(queue)) return -1;

  return queue.findIndex((candidate) => {
    if (!candidate) return false;
    if (candidate.socketId && me.socketId && candidate.socketId === me.socketId) return false;
    if (me.uid && candidate.uid && candidate.uid === me.uid) return false;
    return areOppositeGenders(candidate.gender, myGender);
  });
}
