import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteLink, inviteRoom, readSavedSeat } from './invite';

test('invite links preserve the app path without leaking unrelated parameters', () => {
  const link = inviteLink('https://chess.example/play?token=private#position', 'AB12CD34');
  assert.equal(link, 'https://chess.example/play?room=AB12CD34');
  assert.equal(inviteRoom(link), 'AB12CD34');
  assert.equal(inviteRoom('https://chess.example/?room=ab12cd34'), 'AB12CD34');
});
test('invalid invite codes do not open a room', () => {
  for (const query of ['', '?room=short', '?room=AB12-CD34', '?room=AB12CD345']) {
    assert.equal(inviteRoom(`https://chess.example/${query}`), null);
  }
});
test('saved seats accept only valid room and color data', () => {
  assert.deepEqual(readSavedSeat('{"roomId":"AB12CD34","color":"b"}'), { roomId: 'AB12CD34', color: 'b' });
  for (const value of [null, 'broken', '{}', '{"roomId":"AB12CD34","color":"x"}']) assert.equal(readSavedSeat(value), null);
});
