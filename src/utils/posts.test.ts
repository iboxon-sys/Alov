import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateNewPostDraft,
  togglePostLike,
  appendPostComment,
  computeAuthorTotalLikes,
  formatPostTimeUz,
  isPostVisibleToViewer,
  type PostItem,
} from './posts.ts';

describe('Posts pure helpers', () => {
  it('validates photo, video, music, and text post drafts', () => {
    assert.equal(validateNewPostDraft({ type: 'text', caption: '' }).valid, false);
    assert.equal(validateNewPostDraft({ type: 'text', caption: 'Assalomu alaykum' }).valid, true);
    assert.equal(validateNewPostDraft({ type: 'photo', caption: 'Surat', mediaUrl: '' }).valid, false);
    assert.equal(validateNewPostDraft({ type: 'photo', caption: '', mediaUrl: '/api/media/a.jpg' }).valid, true);
    assert.equal(validateNewPostDraft({ type: 'music', caption: '', mediaUrl: '/api/media/song.mp3' }).valid, true);
    assert.equal(validateNewPostDraft({ type: 'video', caption: '', mediaUrl: '' }).valid, false);
  });

  it('toggles likes and computes total author likes accurately', () => {
    const post: PostItem = {
      id: 'p1',
      authorUid: 'u1',
      authorName: 'Ali',
      type: 'photo',
      caption: 'Toshkent',
      mediaUrl: '/api/media/1.jpg',
      likes: [],
      comments: [],
      createdAt: '2026-11-14T10:00:00Z',
    };

    const likedRes = togglePostLike(post, 'u2');
    assert.equal(likedRes.liked, true);
    assert.deepEqual(likedRes.post.likes, ['u2']);

    const unlikedRes = togglePostLike(likedRes.post, 'u2');
    assert.equal(unlikedRes.liked, false);
    assert.deepEqual(unlikedRes.post.likes, []);

    const p2: PostItem = { ...post, id: 'p2', likes: ['u2', 'u3'] };
    assert.equal(computeAuthorTotalLikes([likedRes.post, p2], 'u1'), 3);
  });

  it('appends comments with commenter identity intact', () => {
    const post: PostItem = {
      id: 'p1',
      authorUid: 'u1',
      authorName: 'Ali',
      type: 'text',
      caption: 'Salom',
      likes: [],
      comments: [],
      createdAt: '2026-11-14T10:00:00Z',
    };

    const next = appendPostComment(post, {
      id: 'c1',
      postId: 'p1',
      authorUid: 'u2',
      authorName: 'Malika',
      text: 'Zo\'r post!',
      createdAt: '2026-11-14T10:05:00Z',
    });

    assert.equal(next.comments.length, 1);
    assert.equal(next.comments[0].authorUid, 'u2');
    assert.equal(next.comments[0].authorName, 'Malika');
  });

  it('formats post timestamps in Uzbek', () => {
    const now = new Date('2026-11-14T12:00:00Z').getTime();
    assert.equal(formatPostTimeUz('2026-11-14T11:59:45Z', now), 'Hozirgina');
    assert.equal(formatPostTimeUz('2026-11-14T11:50:00Z', now), '10 daq oldin');
    assert.equal(formatPostTimeUz('2026-11-14T08:00:00Z', now), '4 soat oldin');
  });

  it('shows only opposite-gender posts and user own posts', () => {
    const maleViewer = { uid: 'm1', gender: 'male' };
    const femaleViewer = { uid: 'f1', gender: 'female' };

    const ownMalePost = { authorUid: 'm1', authorGender: 'male' as const };
    const otherMalePost = { authorUid: 'm2', authorGender: 'male' as const };
    const femalePost = { authorUid: 'f2', authorGender: 'female' as const };
    const fallbackGenderPost = { authorUid: 'f3' };

    assert.equal(isPostVisibleToViewer(ownMalePost, maleViewer), true);
    assert.equal(isPostVisibleToViewer(otherMalePost, maleViewer), false);
    assert.equal(isPostVisibleToViewer(femalePost, maleViewer), true);
    assert.equal(isPostVisibleToViewer(fallbackGenderPost, maleViewer, 'female'), true);
    assert.equal(isPostVisibleToViewer(fallbackGenderPost, maleViewer, 'male'), false);

    assert.equal(isPostVisibleToViewer(femalePost, femaleViewer), false);
    assert.equal(isPostVisibleToViewer(otherMalePost, femaleViewer), true);
    assert.equal(isPostVisibleToViewer({ authorUid: 'f1', authorGender: 'female' }, femaleViewer), true);
  });
});
