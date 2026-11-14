export type PostMediaType = 'photo' | 'video' | 'music' | 'text';

export interface PostComment {
  id: string;
  postId: string;
  authorUid: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  createdAt: string;
}

export interface PostItem {
  id: string;
  authorUid: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  authorGender?: 'male' | 'female';
  authorVerified?: boolean;
  type: PostMediaType;
  caption: string;
  mediaUrl?: string;
  coverUrl?: string;
  audioTitle?: string;
  audioArtist?: string;
  likes: string[];
  comments: PostComment[];
  createdAt: string;
}

export interface NewPostDraft {
  type: PostMediaType;
  caption: string;
  mediaUrl?: string;
  audioTitle?: string;
  audioArtist?: string;
}

export function validateNewPostDraft(draft: NewPostDraft): { valid: boolean; error?: string } {
  const caption = (draft.caption || '').trim();
  const mediaUrl = (draft.mediaUrl || '').trim();

  if (draft.type === 'text') {
    if (!caption) {
      return { valid: false, error: 'Post matnini kiriting.' };
    }
    return { valid: true };
  }

  if (!mediaUrl) {
    const label =
      draft.type === 'photo'
        ? 'Rasm'
        : draft.type === 'video'
          ? 'Video'
          : 'Musiqa fayli';
    return { valid: false, error: `${label} yuklang yoki havolasini kiriting.` };
  }

  return { valid: true };
}

export function togglePostLike(post: PostItem, uid: string): { post: PostItem; liked: boolean } {
  if (!uid) return { post, liked: false };
  const currentLikes = Array.isArray(post.likes) ? post.likes : [];
  const alreadyLiked = currentLikes.includes(uid);
  const nextLikes = alreadyLiked
    ? currentLikes.filter((id) => id !== uid)
    : [...currentLikes, uid];

  return {
    liked: !alreadyLiked,
    post: {
      ...post,
      likes: nextLikes,
    },
  };
}

export function appendPostComment(post: PostItem, comment: PostComment): PostItem {
  const currentComments = Array.isArray(post.comments) ? post.comments : [];
  return {
    ...post,
    comments: [...currentComments, comment],
  };
}

export function computeAuthorTotalLikes(posts: PostItem[], authorUid: string): number {
  if (!authorUid || !Array.isArray(posts)) return 0;
  return posts.reduce((sum, p) => {
    if (p.authorUid !== authorUid) return sum;
    return sum + (Array.isArray(p.likes) ? p.likes.length : 0);
  }, 0);
}

export function formatPostTimeUz(isoDate: string, nowMs: number = Date.now()): string {
  const ts = new Date(isoDate).getTime();
  if (isNaN(ts)) return 'Hozirgina';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return 'Hozirgina';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} daq oldin`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} soat oldin`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays < 7) return `${diffDays} kun oldin`;
  return new Date(ts).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' });
}
