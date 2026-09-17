import { describe, expect, it } from 'vitest';
import type { FriendRequest, Friendship } from '../types';
import { connectionStateFor } from './friendConnectionService';

const friendship: Friendship = {
  id: 'a_b',
  participantUids: ['student-a', 'student-b'],
  status: 'accepted',
};

const request = (fromUid: string, toUid: string): FriendRequest => ({
  id: `${fromUid}_${toUid}`,
  fromUid,
  toUid,
  participantUids: [fromUid, toUid].sort(),
  status: 'pending',
});

describe('connectionStateFor', () => {
  it('prioritizes an accepted friendship over stale requests', () => {
    expect(connectionStateFor(
      'student-b',
      'student-a',
      [friendship],
      [request('student-b', 'student-a')],
      [],
    )).toBe('accepted');
  });

  it('distinguishes incoming, outgoing, and unconnected students', () => {
    expect(connectionStateFor(
      'student-b',
      'student-a',
      [],
      [request('student-b', 'student-a')],
      [],
    )).toBe('incoming');
    expect(connectionStateFor(
      'student-b',
      'student-a',
      [],
      [],
      [request('student-a', 'student-b')],
    )).toBe('pending');
    expect(connectionStateFor('student-c', 'student-a', [], [], [])).toBe('none');
  });
});
