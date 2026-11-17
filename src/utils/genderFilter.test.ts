import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBinaryGender,
  areOppositeGenders,
  isOppositeGenderUserVisible,
  findOppositeGenderRouletteMatchIndex,
} from './genderFilter.ts';

describe('Strict opposite-gender filtering & roulette matching', () => {
  it('normalizes binary genders accurately from objects or strings', () => {
    assert.equal(normalizeBinaryGender('male'), 'male');
    assert.equal(normalizeBinaryGender('female'), 'female');
    assert.equal(normalizeBinaryGender({ gender: 'female' }), 'female');
    assert.equal(normalizeBinaryGender({ faceId: { detectedGender: 'male' } }), 'male');
    assert.equal(normalizeBinaryGender({ gender: '' }), '');
    assert.equal(normalizeBinaryGender(null), '');
  });

  it('strictly allows only male<->female opposite pairs', () => {
    assert.equal(areOppositeGenders('male', 'female'), true);
    assert.equal(areOppositeGenders('female', 'male'), true);
    assert.equal(areOppositeGenders('male', 'male'), false);
    assert.equal(areOppositeGenders('female', 'female'), false);
    assert.equal(areOppositeGenders('male', ''), false);
    assert.equal(areOppositeGenders('', 'female'), false);
  });

  it('hides same-gender and self profiles across Discover, Map, and Efirlar', () => {
    const maleViewer = { uid: 'm1', id: 'M1', gender: 'male' };
    const femaleViewer = { uid: 'f1', id: 'F1', gender: 'female' };
    const otherMale = { uid: 'm2', id: 'M2', gender: 'male' };
    const otherFemale = { uid: 'f2', id: 'F2', gender: 'female' };
    const unknownGenderUser = { uid: 'u3', id: 'U3', gender: '' };

    assert.equal(isOppositeGenderUserVisible(maleViewer, maleViewer), false);
    assert.equal(isOppositeGenderUserVisible(otherMale, maleViewer), false);
    assert.equal(isOppositeGenderUserVisible(unknownGenderUser, maleViewer), false);
    assert.equal(isOppositeGenderUserVisible(otherFemale, maleViewer), true);

    assert.equal(isOppositeGenderUserVisible(otherFemale, femaleViewer), false);
    assert.equal(isOppositeGenderUserVisible(otherMale, femaleViewer), true);
    assert.equal(isOppositeGenderUserVisible(otherFemale, null), false);
  });

  it('matches Chatruletka queue participants ONLY with opposite gender', () => {
    const queue = [
      { socketId: 's1', uid: 'm1', name: 'Aziz', gender: 'male' },
      { socketId: 's2', uid: 'm2', name: 'Bobur', gender: 'male' },
      { socketId: 's3', uid: 'f1', name: 'Madina', gender: 'female' },
    ];

    // Male joining skips m1, m2 and matches f1 at index 2
    assert.equal(
      findOppositeGenderRouletteMatchIndex(queue, {
        socketId: 's4',
        uid: 'm3',
        gender: 'male',
      }),
      2
    );

    // Female joining matches m1 at index 0
    assert.equal(
      findOppositeGenderRouletteMatchIndex(queue, {
        socketId: 's5',
        uid: 'f2',
        gender: 'female',
      }),
      0
    );

    // Male joining queue of only males gets -1 (waits, never connects same gender)
    assert.equal(
      findOppositeGenderRouletteMatchIndex(queue.slice(0, 2), {
        socketId: 's4',
        uid: 'm3',
        gender: 'male',
      }),
      -1
    );

    // Unknown gender never matches
    assert.equal(
      findOppositeGenderRouletteMatchIndex(queue, {
        socketId: 's6',
        uid: 'u6',
        gender: '',
      }),
      -1
    );
  });
});
