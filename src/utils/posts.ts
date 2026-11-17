import { isAdminTelegramUser } from './tokenomics';

export type PostMediaType = 'photo' | 'video' | 'music' | 'text';

export interface PostComment {
  id: string;
  postId: string;
  authorUid: string;
  authorId?: string;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  text: string;
  createdAt: string;
}

export interface PostItem {
  id: string;
  authorUid: string;
  authorId?: string;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  authorGender?: 'male' | 'female';
  authorVerified?: boolean;
  type: PostMediaType;
  caption: string;
  mediaUrl?: string;
  embedUrl?: string;
  mediaProvider?: string;
  isVerticalVideo?: boolean;
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

export function resolvePostAuthorGender(
  post: Pick<PostItem, 'authorGender'> | null | undefined,
  authorFallback?: { gender?: string } | null
): 'male' | 'female' | '' {
  const raw = post?.authorGender || authorFallback?.gender || '';
  return raw === 'male' || raw === 'female' ? raw : '';
}

export function isPostVisibleToViewer(
  post: Pick<PostItem, 'authorUid' | 'authorGender'> | null | undefined,
  viewer?: {
    uid?: string;
    id?: string;
    gender?: string;
    role?: string | null;
    isAdmin?: boolean | null;
    telegram?: string | null;
    username?: string | null;
  } | null,
  _authorGenderFallback?: string
): boolean {
  if (!post || !String(post.authorUid || '').trim()) return false;
  if (isAdminTelegramUser(viewer)) return true;
  return true;
}

export function canUserDeletePost(
  post: Pick<PostItem, 'authorUid' | 'authorId'> | null | undefined,
  currentUser: {
    uid?: string;
    id?: string;
    role?: string | null;
    isAdmin?: boolean | null;
    telegram?: string | null;
    username?: string | null;
  } | null | undefined
): boolean {
  if (!post || !currentUser) return false;
  if (isAdminTelegramUser(currentUser)) return true;
  if (currentUser.id === 'ALOV-ADMIN') return true;
  if (currentUser.uid && post.authorUid && currentUser.uid === post.authorUid) return true;
  if (currentUser.id && post.authorId && currentUser.id === post.authorId) return true;
  return false;
}

export function filterPostsForAdminModeration(
  posts: PostItem[],
  options: {
    genderFilter?: 'all' | 'female' | 'male';
    query?: string;
    resolveAuthorGender?: (post: PostItem) => 'male' | 'female' | '';
  } = {}
): PostItem[] {
  const genderFilter = options.genderFilter || 'all';
  const q = String(options.query || '').trim().toLowerCase();

  return (Array.isArray(posts) ? posts : []).filter((p) => {
    const g = options.resolveAuthorGender
      ? options.resolveAuthorGender(p)
      : resolvePostAuthorGender(p);
    if (genderFilter !== 'all' && g !== genderFilter) return false;
    if (!q) return true;
    return (
      String(p.authorName || '').toLowerCase().includes(q) ||
      String(p.authorUsername || '').toLowerCase().includes(q) ||
      String(p.caption || '').toLowerCase().includes(q) ||
      String(p.audioTitle || '').toLowerCase().includes(q) ||
      String(p.id || '').toLowerCase().includes(q)
    );
  });
}

export function normalizePostRecord(raw: any): PostItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const authorUid = String(raw.authorUid || '').trim();
  if (!id || !authorUid) return null;

  const safeType: PostMediaType = ['photo', 'video', 'music', 'text'].includes(raw.type)
    ? raw.type
    : 'text';
  const authorGender =
    raw.authorGender === 'male' || raw.authorGender === 'female' ? raw.authorGender : undefined;

  return {
    id,
    authorUid,
    authorId: raw.authorId ? String(raw.authorId) : undefined,
    authorName: String(raw.authorName || 'Foydalanuvchi').trim() || 'Foydalanuvchi',
    authorUsername: raw.authorUsername ? String(raw.authorUsername) : '',
    authorAvatar: raw.authorAvatar ? String(raw.authorAvatar) : '',
    ...(authorGender ? { authorGender } : {}),
    authorVerified: Boolean(raw.authorVerified),
    type: safeType,
    caption: String(raw.caption || ''),
    ...(raw.mediaUrl ? { mediaUrl: String(raw.mediaUrl) } : {}),
    ...(raw.embedUrl ? { embedUrl: String(raw.embedUrl) } : {}),
    ...(raw.mediaProvider ? { mediaProvider: String(raw.mediaProvider) } : {}),
    ...(raw.isVerticalVideo !== undefined ? { isVerticalVideo: Boolean(raw.isVerticalVideo) } : {}),
    ...(raw.coverUrl ? { coverUrl: String(raw.coverUrl) } : {}),
    ...(raw.audioTitle ? { audioTitle: String(raw.audioTitle) } : {}),
    ...(raw.audioArtist ? { audioArtist: String(raw.audioArtist) } : {}),
    likes: Array.isArray(raw.likes) ? raw.likes.map(String) : [],
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

export function mergePostsLists(primary: PostItem[], secondary: PostItem[]): PostItem[] {
  const byId = new Map<string, PostItem>();
  for (const item of [...(Array.isArray(secondary) ? secondary : []), ...(Array.isArray(primary) ? primary : [])]) {
    const normalized = normalizePostRecord(item);
    if (!normalized) continue;
    byId.set(normalized.id, normalized);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function isPostCommentsOpen(
  expandedComments: Record<string, boolean> | null | undefined,
  postId: string
): boolean {
  if (!expandedComments || !postId) return false;
  return Boolean(expandedComments[postId]);
}
