import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStreamRoomName,
  normalizeStreamChatMessage,
  appendStreamChatMessage,
  createFloatingHeart,
  appendFloatingHeart,
  formatStreamDuration,
  resolveStreamTargetSocketId,
  type FloatingHeartItem,
} from './liveStream.ts';

test('getStreamRoomName formats unique room as stream_<streamId>', () => {
  assert.equal(getStreamRoomName('abc_123'), 'stream_abc_123');
  assert.equal(getStreamRoomName('  room99  '), 'stream_room99');
});

test('normalizeStreamChatMessage marks host messages accurately', () => {
  const hostMsg = normalizeStreamChatMessage(
    {
      id: 'm1',
      senderUid: 'user_host',
      senderName: 'Madina',
      text: 'Hammaga salom!',
    },
    'user_host',
    's1'
  );
  assert.ok(hostMsg);
  assert.equal(hostMsg.isHost, true);
  assert.equal(hostMsg.streamId, 's1');

  const viewerMsg = normalizeStreamChatMessage(
    {
      id: 'm2',
      senderUid: 'viewer_1',
      senderName: 'Aziz',
      text: 'Zo‘r efir!',
    },
    'user_host',
    's1'
  );
  assert.ok(viewerMsg);
  assert.equal(viewerMsg.isHost, false);

  const emptyMsg = normalizeStreamChatMessage({ senderUid: 'v1', text: '   ' }, 'user_host');
  assert.equal(emptyMsg, null);
});

test('appendStreamChatMessage deduplicates by id and caps array size', () => {
  const m1 = normalizeStreamChatMessage({ id: 'm1', senderUid: 'u1', senderName: 'A', text: 'One' }, 'host')!;
  const m2 = normalizeStreamChatMessage({ id: 'm2', senderUid: 'u2', senderName: 'B', text: 'Two' }, 'host')!;
  const m3 = normalizeStreamChatMessage({ id: 'm3', senderUid: 'u3', senderName: 'C', text: 'Three' }, 'host')!;

  let list = appendStreamChatMessage([], m1, 2);
  list = appendStreamChatMessage(list, m1, 2); // duplicate ignored
  assert.equal(list.length, 1);

  list = appendStreamChatMessage(list, m2, 2);
  list = appendStreamChatMessage(list, m3, 2);
  assert.deepEqual(
    list.map((m) => m.id),
    ['m2', 'm3']
  );
});

test('createFloatingHeart & appendFloatingHeart clamp position and cap count', () => {
  const item = createFloatingHeart('heart', 'u1', () => 0.5);
  assert.equal(item.left, 50);
  assert.equal(item.size, 29);
  assert.equal(item.variant, 'heart');

  let particles: FloatingHeartItem[] = [];
  for (let i = 0; i < 30; i++) {
    particles = appendFloatingHeart(particles, { id: `h_${i}`, left: 30, size: 24, variant: 'heart' }, 24);
  }
  assert.equal(particles.length, 24);
  assert.equal(particles[0].id, 'h_6');
});

test('formatStreamDuration formats seconds to mm:ss', () => {
  assert.equal(formatStreamDuration(0), '00:00');
  assert.equal(formatStreamDuration(65), '01:05');
  assert.equal(formatStreamDuration(-5), '00:00');
});

test('resolveStreamTargetSocketId resolves host alias to registered hostSocketId', () => {
  const room = {
    hostSocketId: 'sock_host_77',
    hostUid: 'u_host',
    participants: new Set(['sock_host_77', 'sock_viewer_1']),
  };
  assert.equal(resolveStreamTargetSocketId(room, 'host'), 'sock_host_77');
  assert.equal(resolveStreamTargetSocketId(room, undefined), 'sock_host_77');
  assert.equal(resolveStreamTargetSocketId(room, 'sock_viewer_1'), 'sock_viewer_1');
  assert.equal(resolveStreamTargetSocketId(undefined, 'host'), null);
});
