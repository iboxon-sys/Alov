import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateNewPostDraft,
  togglePostLike,
  appendPostComment,
  computeAuthorTotalLikes,
  formatPostTimeUz,
  isPostVisibleToViewer,
  canUserDeletePost,
  canUserDeleteComment,
  didPostAuthorLikeComment,
  togglePostCommentLike,
  appendCommentReply,
  deletePostComment,
  deleteCommentReply,
  splitCommentRepliesForDisplay,
  filterPostsForAdminModeration,
  normalizePostRecord,
  mergePostsLists,
  isPostCommentsOpen,
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

  it('strictly shows only opposite-gender posts to non-admins (plus own post), while admin sees all', () => {
    const maleViewer = { uid: 'm1', gender: 'male' };
    const femaleViewer = { uid: 'f1', gender: 'female' };
    const adminViewer = { uid: 'tg_salikh_07', telegram: '@Salikh_07', gender: 'male' };

    const ownMalePost = { authorUid: 'm1', authorGender: 'male' as const };
    const otherMalePost = { authorUid: 'm2', authorGender: 'male' as const };
    const femalePost = { authorUid: 'f2', authorGender: 'female' as const };
    const missingGenderPost = { authorUid: 'u3' };

    assert.equal(isPostVisibleToViewer(ownMalePost, maleViewer), true);
    assert.equal(isPostVisibleToViewer(otherMalePost, maleViewer), false);
    assert.equal(isPostVisibleToViewer(femalePost, maleViewer), true);
    assert.equal(isPostVisibleToViewer(missingGenderPost, maleViewer), false);

    assert.equal(isPostVisibleToViewer(femalePost, femaleViewer), false);
    assert.equal(isPostVisibleToViewer(otherMalePost, femaleViewer), true);

    assert.equal(isPostVisibleToViewer(otherMalePost, adminViewer), true);
    assert.equal(isPostVisibleToViewer(femalePost, adminViewer), true);
    assert.equal(isPostVisibleToViewer(missingGenderPost, adminViewer), true);
    assert.equal(isPostVisibleToViewer(missingGenderPost, null), false);
    assert.equal(isPostVisibleToViewer({ authorUid: '' }, maleViewer), false);
  });

  it('allows admin (@Salikh_07 or role admin) to delete any user post and any comment while non-admins can delete only own/post items', () => {
    const femalePost = { authorUid: 'u_female_1', authorId: 'id_f1' };
    const malePost = { authorUid: 'u_male_1', authorId: 'id_m1' };

    const adminByHandle = { uid: 'tg_salikh_07', telegram: '@Salikh_07' };
    const adminByRole = { uid: 'u_mod_1', role: 'admin' };
    const regularUser = { uid: 'u_female_1', id: 'id_f1', role: 'user' };
    const thirdPartyUser = { uid: 'u_other', id: 'id_other', role: 'user' };

    assert.equal(canUserDeletePost(femalePost, adminByHandle), true);
    assert.equal(canUserDeletePost(malePost, adminByHandle), true);
    assert.equal(canUserDeletePost(femalePost, adminByRole), true);
    assert.equal(canUserDeletePost(malePost, adminByRole), true);
    assert.equal(canUserDeletePost(femalePost, regularUser), true);
    assert.equal(canUserDeletePost(malePost, regularUser), false);
    assert.equal(canUserDeletePost(femalePost, null), false);

    const commentOnMalePost = { authorUid: 'u_commenter', authorId: 'id_c' };
    assert.equal(canUserDeleteComment(malePost, commentOnMalePost, adminByHandle), true);
    assert.equal(canUserDeleteComment(malePost, commentOnMalePost, adminByRole), true);
    assert.equal(canUserDeleteComment(malePost, commentOnMalePost, { uid: 'u_male_1' }), true);
    assert.equal(canUserDeleteComment(malePost, commentOnMalePost, { uid: 'u_commenter' }), true);
    assert.equal(canUserDeleteComment(malePost, commentOnMalePost, thirdPartyUser), false);
  });

  it('handles comment likes, author-liked badges, replies, author-reply surfacing, and deletion', () => {
    let post: PostItem = {
      id: 'p1',
      authorUid: 'author_1',
      authorId: 'A1',
      authorName: 'Madina',
      authorGender: 'female',
      type: 'text',
      caption: 'Salom!',
      likes: [],
      comments: [
        {
          id: 'c1',
          postId: 'p1',
          authorUid: 'u_m1',
          authorName: 'Aziz',
          text: 'Chiroyli!',
          likes: [],
          replies: [],
          createdAt: '2026-11-16T10:00:00Z',
        },
      ],
      createdAt: '2026-11-16T09:00:00Z',
    };

    // Non-author like does NOT show author-liked badge
    const likedByOther = togglePostCommentLike(post, 'c1', 'u_m2');
    assert.equal(likedByOther.liked, true);
    assert.equal(didPostAuthorLikeComment(likedByOther.post, likedByOther.post.comments[0]), false);

    // Author like DOES show author-liked badge
    const likedByAuthor = togglePostCommentLike(likedByOther.post, 'c1', 'author_1');
    assert.equal(likedByAuthor.liked, true);
    assert.equal(didPostAuthorLikeComment(likedByAuthor.post, likedByAuthor.post.comments[0]), true);
    post = likedByAuthor.post;

    // Add one regular user reply (hidden when collapsed) and one author reply (immediately visible!)
    post = appendCommentReply(post, 'c1', {
      id: 'r_user',
      commentId: 'c1',
      postId: 'p1',
      authorUid: 'u_m3',
      authorName: 'Bobur',
      text: 'Men ham qo‘shilaman',
      createdAt: '2026-11-16T10:02:00Z',
    }).post;
    post = appendCommentReply(post, 'c1', {
      id: 'r_author',
      commentId: 'c1',
      postId: 'p1',
      authorUid: 'author_1',
      authorName: 'Madina',
      text: 'Rahmat Aziz!',
      createdAt: '2026-11-16T10:03:00Z',
    }).post;

    const collapsed = splitCommentRepliesForDisplay(post, post.comments[0], false);
    assert.equal(collapsed.totalRepliesCount, 2);
    assert.equal(collapsed.hiddenRepliesCount, 1);
    assert.deepEqual(collapsed.visibleReplies.map((r) => r.id), ['r_author']);

    const expanded = splitCommentRepliesForDisplay(post, post.comments[0], true);
    assert.equal(expanded.hiddenRepliesCount, 0);
    assert.deepEqual(expanded.visibleReplies.map((r) => r.id), ['r_user', 'r_author']);

    // Delete single reply and entire comment
    const afterReplyDel = deleteCommentReply(post, 'c1', 'r_user');
    assert.equal(afterReplyDel.deleted, true);
    assert.equal(afterReplyDel.post.comments[0].replies?.length, 1);

    const afterCommentDel = deletePostComment(afterReplyDel.post, 'c1');
    assert.equal(afterCommentDel.deleted, true);
    assert.equal(afterCommentDel.post.comments.length, 0);
  });

  it('filters posts for admin moderation by all/female/male and search query', () => {
    const posts: PostItem[] = [
      {
        id: 'pf1',
        authorUid: 'u_f1',
        authorName: 'Laylo',
        authorGender: 'female',
        type: 'photo',
        caption: 'Chiroyli kun',
        likes: [],
        comments: [],
        createdAt: '2026-11-16T10:00:00Z',
      },
      {
        id: 'pm1',
        authorUid: 'u_m1',
        authorName: 'Sardor',
        authorGender: 'male',
        type: 'text',
        caption: 'Salom hammaga',
        likes: [],
        comments: [],
        createdAt: '2026-11-16T11:00:00Z',
      },
    ];

    assert.equal(filterPostsForAdminModeration(posts, { genderFilter: 'all' }).length, 2);
    assert.deepEqual(filterPostsForAdminModeration(posts, { genderFilter: 'female' }).map((p) => p.id), ['pf1']);
    assert.deepEqual(filterPostsForAdminModeration(posts, { genderFilter: 'male' }).map((p) => p.id), ['pm1']);
    assert.deepEqual(filterPostsForAdminModeration(posts, { query: 'sardor' }).map((p) => p.id), ['pm1']);
  });

  it('normalizes, deduplicates, and sorts merged posts newest-first', () => {
    assert.equal(normalizePostRecord({ id: '', authorUid: 'u1' }), null);
    assert.equal(normalizePostRecord({ id: 'p1', authorUid: '' }), null);

    const oldPost: PostItem = {
      id: 'p1',
      authorUid: 'u1',
      authorName: 'Ali',
      type: 'text',
      caption: 'Old',
      likes: [],
      comments: [],
      createdAt: '2026-11-14T10:00:00Z',
    };
    const updatedOldPost: PostItem = {
      ...oldPost,
      likes: ['u2'],
    };
    const newPost: PostItem = {
      id: 'p2',
      authorUid: 'u2',
      authorName: 'Laylo',
      type: 'text',
      caption: 'New',
      likes: [],
      comments: [],
      createdAt: '2026-11-15T10:00:00Z',
    };

    const merged = mergePostsLists([updatedOldPost], [oldPost, newPost]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].id, 'p2');
    assert.equal(merged[1].id, 'p1');
    assert.deepEqual(merged[1].likes, ['u2']);
  });

  it('keeps post comments hidden by default until explicitly expanded', () => {
    assert.equal(isPostCommentsOpen(undefined, 'post_1'), false);
    assert.equal(isPostCommentsOpen({}, 'post_1'), false);
    assert.equal(isPostCommentsOpen({ post_1: false }, 'post_1'), false);
    assert.equal(isPostCommentsOpen({ post_1: true }, 'post_1'), true);
    assert.equal(isPostCommentsOpen({ post_1: true }, 'post_2'), false);
  });
});
