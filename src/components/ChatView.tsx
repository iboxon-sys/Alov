import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock,
  Gift,
  Handshake,
  Lock,
  MapPin,
  MessageCircle,
  Mic,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { getBaseUrl, MAIN_RENDER_ORIGIN } from '../config/api';
import {
  extractLocalAuthCredentials,
  parseIncomingAuthMessage,
  persistLocalAuthCredentials,
  resolveRealtimeBackendUrl,
} from '../utils/microFrontendBridge';
import { buildCanonicalChatId, mergeChatLists, resolvePartnerUidForChat } from '../utils/chatList';
import { getSafeUserDisplayName, pickPreferredAvatar } from '../utils/telegramProfile';
import { resolveEffectiveProfileAvatar } from '../utils/faceId';
import { isUserOnlineStrict, formatLastSeenUz } from '../utils/presence';
import { purgeLegacyLocalChatCaches } from '../utils/profileSync';
import {
  MESSAGE_COIN_COST,
  VOICE_MESSAGE_COIN_COST,
  MEDIA_FILE_COIN_COST,
  MESSAGE_DIAMOND_REWARD,
  DIAMOND_LIMIT_TARGET,
  DAILY_LIMIT_WINDOW_HOURS,
  DIAMOND_UNLOCK_HOURS,
  canChargeForMessage,
  isAdminTelegramUser,
  getMessageCoinCost,
  formatDiamondsDisplay,
  getDiamondProgressPercent,
  getPendingDiamondsTotal,
  getNextUnlockTimestamp,
  computeCountdownParts,
} from '../utils/tokenomics';
import {
  evaluateStartGifGate,
  formatMediaDuration,
  generateUniqueMessageId,
  isFramelessChatMediaType,
  mergeUniqueChatMessages,
  shouldAutoScrollConversation,
} from '../utils/chatMessages';
import type { ChatMediaKind } from './ChatMediaPicker';
import { ChatGifBar } from './ChatGifBar';
import { VideoPlayer, VoiceMessage, AudioPlayer } from './ChatMedia';
import { isGifMessage, type GiphyGifItem } from '../utils/giphy';
import { ChatSkeleton } from './Skeleton';
import { AdminBadge } from './AdminBadge';
import {
  filterChatConversations,
  resetViewportScrollOffsets,
  shouldUseCompactKeyboardChrome,
  useVisualViewportLock,
} from '../utils/mobileViewport';

const ChatMediaPicker = lazy(() =>
  import('./ChatMediaPicker').then((m) => ({ default: m.ChatMediaPicker }))
);

const ALOV_AI_USER = {
  uid: 'alov_ai_bot',
  id: 'ALOV-AI',
  name: 'Alov AI',
  avatar: '/assets/aistudio/image_e20a1307.webp',
  bio: "Samimiy do'st va hayotiy suhbatdosh.",
  status: 'online',
  isAI: true,
};

function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {}
  }
  return '';
}

interface ChatViewProps {
  currentUser: any | null;
  backendOrigin?: string;
  initialPartner?: any | null;
  onOpenAuth?: () => void;
  onOpenProfile?: (uid: string, snapshot?: any) => void;
  onStartCall?: (targetUser: any) => void;
  onOpenGift?: (targetUser: any) => void;
  onOpenTopUp?: (notice?: string) => void;
  onNotify?: (msg: string) => void;
  onChatViewChange?: (view: 'list' | 'conversation') => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentUser,
  backendOrigin,
  initialPartner,
  onOpenAuth,
  onOpenProfile,
  onStartCall,
  onOpenGift,
  onOpenTopUp,
  onNotify,
  onChatViewChange,
}) => {
  const [bridgeUser, setBridgeUser] = useState<any | null>(currentUser);
  const [bridgeToken, setBridgeToken] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return extractLocalAuthCredentials(window.localStorage).token;
    }
    return '';
  });
  const [activeBackendOrigin, setActiveBackendOrigin] = useState<string>(() =>
    resolveRealtimeBackendUrl(backendOrigin || getBaseUrl() || MAIN_RENDER_ORIGIN)
  );

  const [chatView, setChatView] = useState<'list' | 'conversation'>(
    initialPartner ? 'conversation' : 'list'
  );
  const [selectedChatUser, setSelectedChatUser] = useState<any | null>(initialPartner || null);
  const [chatsList, setChatsList] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<Record<string, any[]>>({});
  const [chatFriendships, setChatFriendships] = useState<Record<string, boolean>>({});
  const [usersList, setUsersList] = useState<any[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [isLoadingChats, setIsLoadingChats] = useState(true);

  const [inputMessage, setInputMessage] = useState('');
  const [gifBarHideTrigger, setGifBarHideTrigger] = useState(0);
  const [showChatMediaPicker, setShowChatMediaPicker] = useState(false);
  const [isUploadingChatMedia, setIsUploadingChatMedia] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [countdownNow, setCountdownNow] = useState<number>(() => Date.now());
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isCompactMobile, setIsCompactMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : true
  );
  const [partnerStartGifByChat, setPartnerStartGifByChat] = useState<Record<string, string>>({});
  const [loadedMessagesByChat, setLoadedMessagesByChat] = useState<Record<string, boolean>>({});

  // Dictaphone state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState<number[]>(() => Array(14).fill(25));

  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingDurationRef = useRef<number>(0);
  const shouldDiscardRecordingRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);

  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isUserNearBottomRef = useRef<boolean>(true);
  const forceScrollToBottomRef = useRef<boolean>(false);
  const prevConversationKeyRef = useRef<string>('');
  const prevMessageCountRef = useRef<number>(0);

  const viewportMetrics = useVisualViewportLock({
    enabled: true,
    resetWindowScrollOnKeyboard: true,
  });

  const effectiveUser = bridgeUser || currentUser;
  const activeUserRef = useRef<any>(effectiveUser);
  const selectedChatUserRef = useRef<any>(selectedChatUser);
  const usersListRef = useRef<any[]>(usersList);
  const onOpenTopUpRef = useRef(onOpenTopUp);
  const onNotifyRef = useRef(onNotify);
  const onChatViewChangeRef = useRef(onChatViewChange);

  useEffect(() => {
    onOpenTopUpRef.current = onOpenTopUp;
  }, [onOpenTopUp]);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  useEffect(() => {
    onChatViewChangeRef.current = onChatViewChange;
  }, [onChatViewChange]);

  useEffect(() => {
    activeUserRef.current = effectiveUser;
  }, [effectiveUser]);

  useEffect(() => {
    selectedChatUserRef.current = selectedChatUser;
  }, [selectedChatUser]);

  useEffect(() => {
    usersListRef.current = usersList;
  }, [usersList]);

  useEffect(() => {
    if (currentUser) {
      setBridgeUser((prev: any) => ({ ...(prev || {}), ...currentUser }));
    }
  }, [currentUser]);

  useEffect(() => {
    if (backendOrigin) {
      setActiveBackendOrigin(resolveRealtimeBackendUrl(backendOrigin));
    }
  }, [backendOrigin]);

  useEffect(() => {
    if (initialPartner) {
      setSelectedChatUser(initialPartner);
      setChatView('conversation');
      forceScrollToBottomRef.current = true;
    }
  }, [initialPartner]);

  useEffect(() => {
    onChatViewChangeRef.current?.(chatView);
    if (typeof window !== 'undefined' && window.self !== window.top) {
      try {
        window.parent.postMessage({ type: 'ALOV_EMBED_CHAT_VIEW', view: chatView }, '*');
      } catch {}
    }
  }, [chatView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsCompactMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep latest message visible above mobile keyboard when viewport shrinks
  useEffect(() => {
    if (chatView !== 'conversation') return;
    if (!isUserNearBottomRef.current) return;
    const raf = requestAnimationFrame(() => {
      const el = chatMessagesContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [chatView, viewportMetrics.heightPx, viewportMetrics.isKeyboardOpen]);

  // Auto-resize composer textarea cleanly on input/reset
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const nextHeight = Math.min(112, Math.max(40, ta.scrollHeight));
    ta.style.height = `${nextHeight}px`;
  }, [inputMessage]);

  const apiOrigin = resolveRealtimeBackendUrl(
    activeBackendOrigin || backendOrigin || getBaseUrl() || MAIN_RENDER_ORIGIN
  );

  const resolveMediaOrAvatar = useCallback(
    (rawUrl?: string | null): string => {
      const clean = pickPreferredAvatar(rawUrl);
      if (!clean) return '';
      if (clean.startsWith('/api/')) {
        return `${apiOrigin}${clean}`;
      }
      return clean;
    },
    [apiOrigin]
  );

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const stored =
      typeof window !== 'undefined' && window.localStorage
        ? extractLocalAuthCredentials(window.localStorage)
        : { token: '', userId: '', user: null };
    const uid = String(effectiveUser?.uid || effectiveUser?.id || stored.userId || '').trim();
    const token = String(bridgeToken || effectiveUser?.authToken || stored.token || '').trim();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Alov-Token'] = token;
    }
    if (uid) {
      headers['X-User-Id'] = uid;
    }
    return headers;
  }, [bridgeToken, effectiveUser?.authToken, effectiveUser?.id, effectiveUser?.uid]);

  const apiFetchJson = useCallback(
    async (endpoint: string, options?: RequestInit): Promise<any> => {
      const cleanEp = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const url = `${apiOrigin}${cleanEp}`;
      try {
        const res = await fetch(url, {
          ...(options || {}),
          headers: {
            ...getAuthHeaders(),
            ...(options?.headers || {}),
          },
        });
        const text = await res.text();
        if (text && text.trim()) {
          try {
            return JSON.parse(text);
          } catch {
            return { success: false, status: res.status };
          }
        }
        return { success: false, status: res.status };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiOrigin, getAuthHeaders]
  );

  const notifyParentOrToast = useCallback((message: string) => {
    if (onNotifyRef.current) {
      onNotifyRef.current(message);
    }
    if (typeof window !== 'undefined' && window.self !== window.top) {
      try {
        window.parent.postMessage({ type: 'ALOV_EMBED_TOAST', message }, '*');
      } catch {}
    }
  }, []);

  // Strict postMessage listener for Render -> Vercel auth + active partner sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMessage = (event: MessageEvent) => {
      const parsed = parseIncomingAuthMessage(event, [window.location.origin]);
      if (!parsed) return;

      const resolvedOrigin = resolveRealtimeBackendUrl(parsed.backendOrigin);
      setActiveBackendOrigin(resolvedOrigin);
      if (parsed.token) {
        setBridgeToken(parsed.token);
      }

      persistLocalAuthCredentials(window.localStorage, {
        token: parsed.token,
        userId: parsed.userId,
        user: parsed.user,
      });

      if (parsed.user || parsed.userId) {
        setBridgeUser((prev: any) => ({
          ...(prev || {}),
          ...(parsed.user || {}),
          ...(parsed.userId ? { uid: parsed.userId } : {}),
          ...(parsed.token ? { authToken: parsed.token } : {}),
        }));
      }

      if (parsed.partner) {
        setSelectedChatUser(parsed.partner);
        setChatView('conversation');
        forceScrollToBottomRef.current = true;
      } else if (parsed.partnerUid) {
        const matched = usersListRef.current.find(
          (u) => u.uid === parsed.partnerUid || u.id === parsed.partnerUid
        );
        setSelectedChatUser(matched || { uid: parsed.partnerUid, id: parsed.partnerUid, name: 'Foydalanuvchi' });
        setChatView('conversation');
        forceScrollToBottomRef.current = true;
      }
    };

    window.addEventListener('message', handleMessage);
    if (window.self !== window.top) {
      try {
        window.parent.postMessage({ type: 'ALOV_EMBED_READY', section: 'chat' }, '*');
      } catch {}
    }
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Scrub any legacy browser chat caches on mount so chats persist strictly on Render server
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      purgeLegacyLocalChatCaches(window.localStorage);
    }
  }, []);

  // Load users list for resolving partner avatars & statuses
  useEffect(() => {
    apiFetchJson('/api/users').then((res) => {
      if (res?.success && Array.isArray(res.users)) {
        setUsersList(res.users);
      }
    });
  }, [apiFetchJson]);

  const aiReplyPollTimerRef = useRef<number | null>(null);
  const aiReplyTimeoutRef = useRef<number | null>(null);

  const isAiBotIdentifier = useCallback((id?: string | null) => {
    const clean = String(id || '').trim();
    return (
      clean === ALOV_AI_USER.uid ||
      clean === 'ALOV-AI' ||
      clean === 'user_kamola_006' ||
      clean === 'ALOV-006'
    );
  }, []);

  const stopAiReplyPolling = useCallback(() => {
    if (aiReplyPollTimerRef.current !== null) {
      window.clearInterval(aiReplyPollTimerRef.current);
      aiReplyPollTimerRef.current = null;
    }
    if (aiReplyTimeoutRef.current !== null) {
      window.clearTimeout(aiReplyTimeoutRef.current);
      aiReplyTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAiReplyPolling();
    };
  }, [stopAiReplyPolling]);

  const refreshChatsFromServer = useCallback(async () => {
    const myUidNow = activeUserRef.current?.uid || activeUserRef.current?.id;
    if (!myUidNow) {
      setIsLoadingChats(false);
      return;
    }
    const data = await apiFetchJson(`/api/chats/user/${encodeURIComponent(myUidNow)}`);
    const serverChats = data?.success && Array.isArray(data.chats) ? data.chats : [];
    const aliases = [myUidNow, activeUserRef.current?.id].filter(Boolean) as string[];
    setChatsList((prev) =>
      mergeChatLists([prev, serverChats], myUidNow, {
        myAliases: aliases,
        usersList: usersListRef.current,
      })
    );
    setIsLoadingChats(false);
  }, [apiFetchJson]);

  // Re-hydrate partner snapshots in chatsList whenever usersList updates
  useEffect(() => {
    const myUidNow = effectiveUser?.uid || effectiveUser?.id;
    if (!myUidNow || usersList.length === 0) return;
    const aliases = [myUidNow, effectiveUser?.id].filter(Boolean) as string[];
    setChatsList((prev) =>
      prev.length === 0
        ? prev
        : mergeChatLists([prev], myUidNow, {
            myAliases: aliases,
            usersList,
          })
    );
  }, [effectiveUser?.id, effectiveUser?.uid, usersList]);

  // Load chats list strictly from Render Backend (no browser localStorage cache), retrying once on cold wake
  useEffect(() => {
    const myUidNow = effectiveUser?.uid || effectiveUser?.id;
    if (!myUidNow) {
      setIsLoadingChats(false);
      return;
    }
    let cancelled = false;
    let retryTimer: number | null = null;
    setIsLoadingChats(true);
    const loadChats = async (attempt: number) => {
      const data = await apiFetchJson(`/api/chats/user/${encodeURIComponent(myUidNow)}`);
      if (cancelled) return;
      if (data?.success && Array.isArray(data.chats)) {
        const aliases = [myUidNow, effectiveUser?.id].filter(Boolean) as string[];
        setChatsList((prev) =>
          mergeChatLists([prev, data.chats], myUidNow, {
            myAliases: aliases,
            usersList: usersListRef.current,
          })
        );
        setIsLoadingChats(false);
      } else if (attempt === 0) {
        retryTimer = window.setTimeout(() => {
          if (!cancelled) void loadChats(1);
        }, 1200);
      } else {
        setIsLoadingChats(false);
      }
    };
    void loadChats(0);
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [apiFetchJson, effectiveUser?.id, effectiveUser?.uid]);

  // Connect Socket.io directly to Render Backend
  useEffect(() => {
    const stored =
      typeof window !== 'undefined' && window.localStorage
        ? extractLocalAuthCredentials(window.localStorage)
        : { token: '', userId: '', user: null };
    const myUid = String(effectiveUser?.uid || effectiveUser?.id || stored.userId || '').trim();
    const token = String(bridgeToken || effectiveUser?.authToken || stored.token || '').trim();

    const socket = io(apiOrigin, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1500,
      timeout: 15000,
      auth: { token, userId: myUid },
    });
    socketRef.current = socket;

    const registerAndJoin = () => {
      const uidNow = String(activeUserRef.current?.uid || activeUserRef.current?.id || myUid || '').trim();
      if (uidNow) {
        socket.emit('register_user', uidNow);
      }
      const partner = selectedChatUserRef.current;
      if (uidNow && partner) {
        const otherUid = partner.uid || partner.id;
        if (otherUid) {
          const cid = buildCanonicalChatId(uidNow, otherUid);
          socket.emit('join_chat', cid);
          void apiFetchJson(`/api/chats/${encodeURIComponent(cid)}/messages?viewerUid=${encodeURIComponent(uidNow)}`).then((data) => {
            if (data?.success && Array.isArray(data.messages)) {
              setChatMessages((prev) => {
                const merged = mergeUniqueChatMessages(data.messages, prev[cid], prev[otherUid]);
                return { ...prev, [cid]: merged, [otherUid]: merged };
              });
            }
          });
        }
      }
      void refreshChatsFromServer();
    };

    socket.on('connect', registerAndJoin);

    socket.on('presence_sync', ({ onlineUserIds: ids }: { onlineUserIds?: string[] }) => {
      const nextSet = new Set((ids || []).map(String));
      setOnlineUserIds(nextSet);
      setUsersList((prev) =>
        prev.map((u) => {
          const isOn = Boolean((u.uid && nextSet.has(u.uid)) || (u.id && nextSet.has(u.id)));
          return u.isOnline === isOn ? u : { ...u, isOnline: isOn, status: isOn ? 'online' : 'offline' };
        })
      );
    });

    socket.on('user_updated', (updatedUser: any) => {
      if (!updatedUser) return;
      const uidNow = activeUserRef.current?.uid;
      if (uidNow && (updatedUser.uid === uidNow || updatedUser.id === uidNow)) {
        setBridgeUser((prev: any) => ({ ...(prev || {}), ...updatedUser }));
      }
      setSelectedChatUser((prev: any) =>
        prev && (prev.uid === updatedUser.uid || prev.id === updatedUser.id)
          ? { ...prev, ...updatedUser }
          : prev
      );
      setUsersList((prev) => {
        const map = new Map<string, any>();
        prev.forEach((u) => map.set(u.uid || u.id, u));
        map.set(updatedUser.uid || updatedUser.id, updatedUser);
        return Array.from(map.values());
      });
    });

    const handleIncomingMessage = (payload: any) => {
      const msg = payload?.message || payload;
      const chatId = payload?.chatId;
      const uidNow = activeUserRef.current?.uid || activeUserRef.current?.id;
      const myAliasSet = new Set(
        [activeUserRef.current?.uid, activeUserRef.current?.id, uidNow].filter(Boolean).map(String)
      );
      const selUser = selectedChatUserRef.current;

      const senderStr = String(payload?.senderId || msg?.senderId || '');
      const recipientStr = String(payload?.recipientId || '');
      const senderIsSelf = Boolean(senderStr && myAliasSet.has(senderStr));

      let partnerId = senderIsSelf ? recipientStr : senderStr;
      if (!partnerId && selUser) {
        partnerId = selUser.uid || selUser.id;
      }
      if (!partnerId && !chatId) return;

      const newMsg = {
        ...msg,
        status: msg.read ? 'read' : (msg.status || (senderIsSelf ? 'sent' : 'read')),
        time:
          msg.time ||
          new Date(msg.createdAt || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
      };

      setChatMessages((prev) => {
        const partnerKeys = [partnerId, selUser?.id, selUser?.uid].filter(
          (k): k is string => Boolean(k) && !myAliasSet.has(String(k))
        );
        const keys = Array.from(new Set([chatId, ...partnerKeys].filter(Boolean))) as string[];
        const next = { ...prev };
        keys.forEach((k) => {
          next[k] = mergeUniqueChatMessages(prev[k], [newMsg]);
        });
        return next;
      });

      const isActiveConversationOpen = Boolean(
        selUser &&
          partnerId &&
          (selUser.id === partnerId || selUser.uid === partnerId)
      );

      if (chatId) {
        setChatsList((prev) => {
          const lastMsg =
            msg.type === 'gif'
              ? 'GIF 🎬'
              : msg.type === 'voice'
              ? '🎤 Ovozli xabar'
              : msg.type === 'audio'
              ? `🎵 ${msg.fileName || 'Audio fayl'}`
              : msg.type === 'image'
              ? '🖼️ Rasm'
              : msg.type === 'video'
              ? '🎥 Video'
              : msg.text || 'Xabar';
          const partnerInfo =
            (!senderIsSelf ? payload?.message?.sender : undefined) ||
            (partnerId
              ? usersListRef.current.find((u) => u.uid === partnerId || u.id === partnerId) || {
                  uid: partnerId,
                  id: partnerId,
                  name: (!senderIsSelf ? msg.senderName : '') || selUser?.name || 'Foydalanuvchi',
                  avatar: (!senderIsSelf ? msg.senderAvatar : '') || selUser?.avatar || '',
                }
              : undefined);

          const existingChat = prev.find(
            (c) =>
              c.id === chatId ||
              resolvePartnerUidForChat(c, uidNow || '', Array.from(myAliasSet), usersListRef.current) === partnerId
          );
          const nextUnread = { ...(existingChat?.unreadCount || {}) };
          if (uidNow) {
            if (!senderIsSelf && !isActiveConversationOpen) {
              nextUnread[uidNow] = Number(nextUnread[uidNow] || 0) + 1;
            } else {
              for (const alias of myAliasSet) nextUnread[alias] = 0;
            }
          }

          const incomingChat = {
            id: chatId,
            participants: [uidNow, partnerId].filter(Boolean),
            lastMessage: lastMsg,
            unreadCount: nextUnread,
            updatedAt: msg.createdAt || new Date().toISOString(),
            partner: partnerInfo,
          };
          return mergeChatLists([prev, [incomingChat]], uidNow || '', {
            myAliases: Array.from(myAliasSet),
            usersList: usersListRef.current,
          });
        });
      }

      if (!senderIsSelf && msg.senderId && isActiveConversationOpen) {
        socket.emit('mark_read', {
          chatId,
          messageIds: [msg.id],
          senderId: msg.senderId,
          recipientId: uidNow,
        });
      }

      if (isAiBotIdentifier(msg.senderId)) {
        stopAiReplyPolling();
        setIsAiTyping(false);
      }
    };

    socket.on('receive_message', handleIncomingMessage);
    socket.on('chat:message', handleIncomingMessage);

    socket.on('message_ack', ({ messageId, status }: any) => {
      setChatMessages((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k]) {
            next[k] = next[k].map((m) => (m.id === messageId ? { ...m, status: status || 'sent' } : m));
          }
        });
        return next;
      });
    });

    socket.on('message_read', ({ messageIds }: any) => {
      setChatMessages((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k]) {
            next[k] = next[k].map((m) =>
              !messageIds || messageIds.includes(m.id) ? { ...m, status: 'read', read: true } : m
            );
          }
        });
        return next;
      });
    });

    socket.on('user_typing', ({ uid, isTyping }: any) => {
      const sel = selectedChatUserRef.current;
      if (sel && (sel.uid === uid || sel.id === uid)) {
        setIsOtherTyping(Boolean(isTyping));
      }
    });

    socket.on('friendship_updated', ({ chatId, friendship }: any) => {
      if (chatId) {
        setChatFriendships((prev) => ({ ...prev, [chatId]: Boolean(friendship?.active) }));
      }
    });

    socket.on('insufficient_coins', ({ message }: any) => {
      const text = message || `Monetalaringiz yetarli emas! Har bir xabar narxi ${MESSAGE_COIN_COST} moneta.`;
      if (onOpenTopUpRef.current) {
        onOpenTopUpRef.current(text);
      } else if (typeof window !== 'undefined' && window.self !== window.top) {
        try {
          window.parent.postMessage({ type: 'ALOV_EMBED_OPEN_TOPUP', message: text }, '*');
        } catch {}
      } else {
        notifyParentOrToast(text);
      }
    });

    return () => {
      socket.off('connect', registerAndJoin);
      socket.off('receive_message', handleIncomingMessage);
      socket.off('chat:message', handleIncomingMessage);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [apiFetchJson, apiOrigin, bridgeToken, effectiveUser?.authToken, effectiveUser?.id, effectiveUser?.uid, notifyParentOrToast, refreshChatsFromServer]);

  // Join conversation room & fetch authoritative message history directly from Render backend
  const selectedOtherUid = selectedChatUser?.uid || selectedChatUser?.id || '';
  const myActiveUid = effectiveUser?.uid || effectiveUser?.id || '';

  useEffect(() => {
    if (!selectedOtherUid || !myActiveUid || chatView !== 'conversation') return;

    const chatId = buildCanonicalChatId(myActiveUid, selectedOtherUid);
    socketRef.current?.emit('join_chat', chatId);
    socketRef.current?.emit('mark_read', { chatId, senderId: selectedOtherUid, recipientId: myActiveUid });

    let cancelled = false;
    let retryTimer: number | null = null;
    setLoadedMessagesByChat((prev) => ({ ...prev, [chatId]: false }));

    const loadConversationMessages = async (attempt: number) => {
      const data = await apiFetchJson(`/api/chats/${encodeURIComponent(chatId)}/messages?viewerUid=${encodeURIComponent(myActiveUid)}`);
      if (cancelled) return;
      if (data?.success) {
        setLoadedMessagesByChat((prev) => ({ ...prev, [chatId]: true }));
        if (typeof data.partnerStartGifUrl === 'string') {
          setPartnerStartGifByChat((prev) => ({ ...prev, [chatId]: data.partnerStartGifUrl }));
        }
        if (data.friendship !== undefined) {
          setChatFriendships((prev) => ({ ...prev, [chatId]: Boolean(data.friendship?.active) }));
        }
        if (Array.isArray(data.messages)) {
          setChatMessages((prev) => {
            const merged = mergeUniqueChatMessages(
              data.messages,
              prev[chatId],
              prev[selectedOtherUid]
            );
            return { ...prev, [chatId]: merged, [selectedOtherUid]: merged };
          });
        }
      } else if (attempt === 0) {
        retryTimer = window.setTimeout(() => {
          if (!cancelled) void loadConversationMessages(1);
        }, 1200);
      } else {
        setLoadedMessagesByChat((prev) => ({ ...prev, [chatId]: true }));
      }
    };

    void loadConversationMessages(0);

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      stopAiReplyPolling();
    };
  }, [apiFetchJson, chatView, myActiveUid, selectedOtherUid, stopAiReplyPolling]);

  // Countdown tick for female diamond unlock timer
  useEffect(() => {
    const batches = effectiveUser?.pendingDiamondBatches;
    if (!Array.isArray(batches) || batches.length === 0) return;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [effectiveUser?.pendingDiamondBatches]);

  const myUid = effectiveUser?.uid || effectiveUser?.id;
  const myAliases = Array.from(new Set([effectiveUser?.uid, effectiveUser?.id].filter(Boolean).map(String)));
  const otherUid = selectedChatUser?.uid || selectedChatUser?.id;
  const activeChatId = myUid && otherUid ? buildCanonicalChatId(myUid, otherUid) : '';
  const isFriendActive = Boolean(activeChatId && chatFriendships[activeChatId]);
  const isAIBotChat = isAiBotIdentifier(otherUid);
  const isSenderCharged = canChargeForMessage({
    senderGender: effectiveUser?.gender,
    isAIBot: isAIBotChat,
    isFriendFreeChat: isFriendActive,
    isAdminSender: isAdminTelegramUser(effectiveUser),
  });

  const sortedMessages = mergeUniqueChatMessages(
    activeChatId ? chatMessages[activeChatId] : undefined,
    otherUid ? chatMessages[otherUid] : undefined
  );

  const partnerFromUsersList = otherUid
    ? usersList.find((u) => u.uid === otherUid || u.id === otherUid)
    : undefined;
  const resolvedChatPartner = partnerFromUsersList
    ? { ...selectedChatUser, ...partnerFromUsersList }
    : selectedChatUser;
  const resolvedPartnerStartGif = String(
    partnerFromUsersList?.startGifUrl ??
      selectedChatUser?.startGifUrl ??
      (activeChatId ? partnerStartGifByChat[activeChatId] : '') ??
      ''
  ).trim();
  const startGifGate = evaluateStartGifGate({
    isAIBotChat,
    partnerStartGifUrl: resolvedPartnerStartGif,
    messages: sortedMessages,
  });
  const isMessagesConfirmedEmpty = !activeChatId || loadedMessagesByChat[activeChatId] !== false;
  const isStartGifLocked = Boolean(startGifGate.isLocked && isMessagesConfirmedEmpty);

  // Smart scroll handler — never yanks user back down when scrolling up!
  const handleMessagesScroll = useCallback(() => {
    const el = chatMessagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= 100;
    isUserNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom && el.scrollHeight > el.clientHeight + 80);
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = chatMessagesContainerRef.current;
    if (!el) return;
    if (smooth && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    isUserNearBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    if (chatView !== 'conversation') {
      prevConversationKeyRef.current = '';
      prevMessageCountRef.current = 0;
      return;
    }
    const convKey = `${myUid || ''}_${otherUid || ''}`;
    const conversationChanged = prevConversationKeyRef.current !== convKey;
    const shouldScroll = shouldAutoScrollConversation({
      prevCount: prevMessageCountRef.current,
      nextCount: sortedMessages.length,
      conversationChanged,
      forceScroll: forceScrollToBottomRef.current,
      isNearBottom: isUserNearBottomRef.current,
    });

    prevConversationKeyRef.current = convKey;
    prevMessageCountRef.current = sortedMessages.length;

    if (shouldScroll) {
      forceScrollToBottomRef.current = false;
      requestAnimationFrame(() => {
        const el = chatMessagesContainerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
          isUserNearBottomRef.current = true;
          setShowScrollToBottom(false);
        }
      });
    }
  }, [chatView, myUid, otherUid, sortedMessages.length]);

  const handleOpenConversation = (targetUser: any) => {
    setSelectedChatUser(targetUser);
    setChatView('conversation');
    setIsOtherTyping(false);
    setInputMessage('');
    setGifBarHideTrigger((n) => n + 1);
    isUserNearBottomRef.current = true;
    forceScrollToBottomRef.current = true;

    const uidNow = effectiveUser?.uid || effectiveUser?.id;
    const targetId = targetUser?.uid || targetUser?.id;
    if (uidNow && targetId) {
      const chatId = buildCanonicalChatId(uidNow, targetId);
      setChatsList((prev) =>
        prev.map((c) => {
          const pUid = resolvePartnerUidForChat(c, uidNow, myAliases, usersList);
          if (c.id !== chatId && pUid !== targetId && pUid !== targetUser?.uid && pUid !== targetUser?.id) {
            return c;
          }
          const clearedUnread = { ...(c.unreadCount || {}) };
          for (const alias of myAliases) clearedUnread[alias] = 0;
          clearedUnread[uidNow] = 0;
          return { ...c, unreadCount: clearedUnread };
        })
      );
      socketRef.current?.emit('mark_read', { chatId, senderId: targetId, recipientId: uidNow });
      apiFetchJson('/api/chats/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myUid: uidNow, targetUid: targetId, partnerSnapshot: targetUser }),
      }).catch(() => {});
    }
  };

  const handleToggleFriendship = async () => {
    const uidNow = effectiveUser?.uid || effectiveUser?.id;
    const targetId = selectedChatUser?.uid || selectedChatUser?.id;
    if (!uidNow || !targetId) return;
    const chatId = buildCanonicalChatId(uidNow, targetId);
    const nextState = !chatFriendships[chatId];
    setChatFriendships((prev) => ({ ...prev, [chatId]: nextState }));
    const data = await apiFetchJson('/api/chats/friendship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, uid: uidNow, enabled: nextState }),
    });
    if (data?.success && data.friendship) {
      setChatFriendships((prev) => ({ ...prev, [chatId]: Boolean(data.friendship.active) }));
    } else if (!data?.success) {
      setChatFriendships((prev) => ({ ...prev, [chatId]: !nextState }));
    }
  };

  const handleTyping = () => {
    const uidNow = effectiveUser?.uid || effectiveUser?.id;
    const targetId = selectedChatUser?.uid || selectedChatUser?.id;
    if (!uidNow || !targetId) return;
    const chatId = buildCanonicalChatId(uidNow, targetId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current?.emit('typing', { chatId, uid: uidNow, isTyping: true });
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing', { chatId, uid: uidNow, isTyping: false });
    }, 2000);
  };

  const handleSendMessage = async (
    type: 'text' | 'image' | 'gif' | 'video' | 'audio' | 'voice' = 'text',
    fileUrl?: string,
    customCaption?: string,
    extra?: { durationSec?: number; fileName?: string }
  ) => {
    if (!selectedChatUser) return;
    if (type === 'text' && !(customCaption ?? inputMessage).trim()) return;

    const uidNow = effectiveUser?.uid || effectiveUser?.id;
    if (!uidNow) {
      onOpenAuth?.();
      return;
    }

    const text =
      type === 'text'
        ? (customCaption ?? inputMessage).trim()
        : customCaption?.trim() ||
          (type === 'gif'
            ? 'GIF'
            : type === 'image'
            ? 'Rasm 🖼️'
            : type === 'video'
            ? 'Video 🎥'
            : type === 'voice'
            ? 'Ovozli xabar 🎤'
            : extra?.fileName || 'Audio 🎵');

    if (type === 'text' && customCaption === undefined) setInputMessage('');
    setGifBarHideTrigger((n) => n + 1);
    forceScrollToBottomRef.current = true;

    const targetId = selectedChatUser.uid || selectedChatUser.id;
    const isAIBot = isAiBotIdentifier(targetId);
    const chatId = buildCanonicalChatId(uidNow, targetId);
    const msgId = generateUniqueMessageId('msg');

    const msgObj = {
      id: msgId,
      senderId: uidNow,
      senderName: effectiveUser?.name || 'Foydalanuvchi',
      text,
      type,
      fileUrl: fileUrl || null,
      ...(type === 'gif' && fileUrl ? { content: fileUrl } : {}),
      ...(extra?.durationSec ? { durationSec: extra.durationSec } : {}),
      ...(extra?.fileName ? { fileName: extra.fileName } : {}),
      status: 'sending' as 'sending' | 'sent' | 'read' | 'failed',
      read: false,
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current?.emit('typing', { chatId, uid: uidNow, isTyping: false });

    // Optimistically add in memory BEFORE server ACK so consecutive messages/GIFs appear immediately
    setChatMessages((prev) => {
      const myAliasSet = new Set(myAliases);
      const partnerKeys = [selectedChatUser.id, selectedChatUser.uid, targetId].filter(
        (k): k is string => Boolean(k) && !myAliasSet.has(String(k))
      );
      const keys = Array.from(new Set([chatId, ...partnerKeys].filter(Boolean))) as string[];
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = mergeUniqueChatMessages(prev[k], [msgObj]);
      });
      return next;
    });

    setChatsList((prev) => {
      const entry = {
        id: chatId,
        participants: [uidNow, targetId],
        lastMessage:
          type === 'gif'
            ? 'GIF 🎬'
            : type === 'voice'
            ? '🎤 Ovozli xabar'
            : type === 'audio'
            ? `🎵 ${extra?.fileName || 'Audio'}`
            : text,
        updatedAt: msgObj.createdAt,
        partner: selectedChatUser,
      };
      return mergeChatLists([prev, [entry]], uidNow, {
        myAliases,
        usersList: usersListRef.current,
      });
    });

    if (isAIBot && type === 'text') {
      setIsAiTyping(true);
    }

    await deliverMessageToServer(msgObj, chatId, uidNow, targetId, isAIBot);
  };

  const deliverMessageToServer = async (
    msgObj: any,
    chatId: string,
    uidNow: string,
    targetId: string,
    isAIBot: boolean
  ) => {
    const coinCost = getMessageCoinCost(msgObj?.type);
    const updateStatusForId = (nextStatus: 'sending' | 'sent' | 'failed') => {
      setChatMessages((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k]) {
            next[k] = next[k].map((m) => (m.id === msgObj.id ? { ...m, status: nextStatus } : m));
          }
        });
        return next;
      });
    };

    const removeOptimisticMsg = () => {
      setChatMessages((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k]) next[k] = next[k].filter((m) => m.id !== msgObj.id);
        });
        return next;
      });
      if (isAIBot) setIsAiTyping(false);
    };

    const handleServerRejection = (errPayload: any) => {
      removeOptimisticMsg();
      if (errPayload?.error === 'insufficient_coins') {
        const notice = errPayload.message || `Monetalaringiz yetarli emas! Ushbu xabar narxi ${coinCost} moneta.`;
        if (onOpenTopUpRef.current) {
          onOpenTopUpRef.current(notice);
        } else if (typeof window !== 'undefined' && window.self !== window.top) {
          window.parent.postMessage({ type: 'ALOV_EMBED_OPEN_TOPUP', message: notice }, '*');
        } else {
          notifyParentOrToast(notice);
        }
      } else if (errPayload?.message) {
        notifyParentOrToast(errPayload.message);
      }
    };

    const startAiReplyPolling = () => {
      if (!isAIBot || (msgObj?.type && msgObj.type !== 'text')) return;
      stopAiReplyPolling();
      const sentAtMs = new Date(msgObj.createdAt || Date.now()).getTime() || Date.now();
      let attempts = 0;

      const pollOnce = async () => {
        attempts += 1;
        const data = await apiFetchJson(
          `/api/chats/${encodeURIComponent(chatId)}/messages?viewerUid=${encodeURIComponent(uidNow)}`
        );
        if (data?.success && Array.isArray(data.messages)) {
          setChatMessages((prev) => {
            const merged = mergeUniqueChatMessages(data.messages, prev[chatId], prev[targetId]);
            return { ...prev, [chatId]: merged, [targetId]: merged };
          });
          const hasFreshAiReply = data.messages.some((m: any) => {
            if (!m || !isAiBotIdentifier(m.senderId)) return false;
            const t = new Date(m.createdAt || 0).getTime() || 0;
            return t >= sentAtMs - 1000;
          });
          if (hasFreshAiReply) {
            stopAiReplyPolling();
            setIsAiTyping(false);
            void refreshChatsFromServer();
            return;
          }
        }
        if (attempts >= 16) {
          stopAiReplyPolling();
          setIsAiTyping(false);
        }
      };

      aiReplyPollTimerRef.current = window.setInterval(() => {
        void pollOnce();
      }, 900);
      aiReplyTimeoutRef.current = window.setTimeout(() => {
        stopAiReplyPolling();
        setIsAiTyping(false);
      }, 16000);
    };

    const sendViaHttpFallback = async () => {
      const httpRes = await apiFetchJson('/api/chats/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          senderId: uidNow,
          recipientId: targetId,
          message: msgObj,
        }),
      });
      if (httpRes?.success) {
        updateStatusForId('sent');
        if (httpRes.sender) {
          setBridgeUser((prev: any) => ({ ...(prev || {}), ...httpRes.sender }));
        }
        startAiReplyPolling();
        return true;
      }
      if (
        httpRes?.error === 'insufficient_coins' ||
        httpRes?.error === 'start_gif_required' ||
        httpRes?.error === 'user_banned'
      ) {
        handleServerRejection(httpRes);
        return false;
      }
      updateStatusForId('failed');
      if (isAIBot) {
        stopAiReplyPolling();
        setIsAiTyping(false);
      }
      notifyParentOrToast("Xabar yuborilmadi. Qayta urinib ko'ring.");
      return false;
    };

    if (!socketRef.current?.connected || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      await sendViaHttpFallback();
      return;
    }

    let settled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      void sendViaHttpFallback();
    }, 2500);

    socketRef.current.emit(
      'send_message',
      { chatId, senderId: uidNow, recipientId: targetId, message: msgObj },
      (ack: any) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (ack && ack.success === false) {
          handleServerRejection(ack);
          return;
        }
        if (ack && (ack.status === 'sent' || ack.success)) {
          updateStatusForId('sent');
          startAiReplyPolling();
        } else {
          void sendViaHttpFallback();
        }
      }
    );
  };

  const handleRetryMessage = async (failedMsg: any) => {
    const uidNow = effectiveUser?.uid || effectiveUser?.id;
    const targetId = selectedChatUser?.uid || selectedChatUser?.id;
    if (!uidNow || !targetId || !failedMsg?.id) return;
    const chatId = buildCanonicalChatId(uidNow, targetId);
    const isAIBot = isAiBotIdentifier(targetId);
    setChatMessages((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k]) {
          next[k] = next[k].map((m) => (m.id === failedMsg.id ? { ...m, status: 'sending' } : m));
        }
      });
      return next;
    });
    if (isAIBot && (!failedMsg.type || failedMsg.type === 'text')) setIsAiTyping(true);
    await deliverMessageToServer({ ...failedMsg, status: 'sending' }, chatId, uidNow, targetId, isAIBot);
  };

  const handleSendGif = async (gif: GiphyGifItem) => {
    const selectedGifUrl = gif?.images?.original?.url || gif?.sendUrl;
    if (!selectedGifUrl || !selectedChatUser) return;
    setInputMessage('');
    setGifBarHideTrigger((n) => n + 1);
    await handleSendMessage('gif', selectedGifUrl, 'GIF');
  };

  const handleSendPickedMedia = async (
    payload: { file?: File; remoteUrl?: string; fileName?: string },
    kind: ChatMediaKind,
    caption?: string
  ) => {
    if (!selectedChatUser) return;
    if (payload.remoteUrl && !payload.file) {
      await handleSendMessage(kind, payload.remoteUrl, caption, { fileName: payload.fileName });
      setShowChatMediaPicker(false);
      return;
    }

    const file = payload.file;
    if (!file) return;
    setIsUploadingChatMedia(true);
    try {
      const res = await fetch(`${apiOrigin}/api/media/upload-raw?type=${encodeURIComponent(kind)}`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name || 'chat_media'),
        },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.url) {
        const resolved = data.url.startsWith('/') ? `${apiOrigin}${data.url}` : data.url;
        await handleSendMessage(kind, resolved, caption, { fileName: file.name });
        setShowChatMediaPicker(false);
      } else {
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (typeof reader.result === 'string') {
            await handleSendMessage(kind, reader.result, caption, { fileName: file.name });
            setShowChatMediaPicker(false);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      notifyParentOrToast(err?.message || 'Media yuklashda xatolik yuz berdi');
    } finally {
      setIsUploadingChatMedia(false);
    }
  };

  // Cleanup Dictaphone helpers
  const cleanupDictaphoneResources = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (analyserRafRef.current !== null) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupDictaphoneResources();
    };
  }, [cleanupDictaphoneResources]);

  const startRecording = async () => {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;
    shouldDiscardRecordingRef.current = false;
    recordingDurationRef.current = 0;
    setRecordingSeconds(0);
    setRecordingLevels(Array(14).fill(25));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isRecordingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      mediaStreamRef.current = stream;

      // Live audio level meter via Web Audio AnalyserNode
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);
          audioContextRef.current = ctx;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const tickLevels = () => {
            if (!isRecordingRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            const bars: number[] = [];
            for (let i = 0; i < 14; i++) {
              const v = dataArray[i % dataArray.length] || 0;
              bars.push(Math.max(18, Math.min(100, Math.round((v / 255) * 100) + 18)));
            }
            setRecordingLevels(bars);
            analyserRafRef.current = requestAnimationFrame(tickLevels);
          };
          analyserRafRef.current = requestAnimationFrame(tickLevels);
        }
      } catch {}

      const supportedMime = pickSupportedAudioMimeType();
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const finalMime = recorder.mimeType || supportedMime || 'audio/webm';

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const recordedSec = Math.max(1, recordingDurationRef.current);
        cleanupDictaphoneResources();
        if (shouldDiscardRecordingRef.current) {
          shouldDiscardRecordingRef.current = false;
          return;
        }
        const blob = new Blob(chunks, { type: finalMime });
        if (blob.size < 120) return;

        const ext = finalMime.includes('mp4')
          ? 'm4a'
          : finalMime.includes('ogg')
          ? 'ogg'
          : 'weba';
        try {
          const uploadRes = await fetch(`${apiOrigin}/api/media/upload-raw?type=voice`, {
            method: 'POST',
            headers: {
              ...getAuthHeaders(),
              'Content-Type': finalMime,
              'x-file-name': encodeURIComponent(`voice_${Date.now()}.${ext}`),
            },
            body: blob,
          });
          const data = await uploadRes.json().catch(() => null);
          if (uploadRes.ok && data?.success && data?.url) {
            const resolved = data.url.startsWith('/') ? `${apiOrigin}${data.url}` : data.url;
            await handleSendMessage('voice', resolved, undefined, { durationSec: recordedSec });
            return;
          }
        } catch {}

        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            void handleSendMessage('voice', reader.result, undefined, { durationSec: recordedSec });
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        recordingDurationRef.current += 1;
        setRecordingSeconds(recordingDurationRef.current);
      }, 1000);
    } catch {
      isRecordingRef.current = false;
      cleanupDictaphoneResources();
      notifyParentOrToast('Mikrofonga ruxsat berilmadi');
    }
  };

  const finishRecording = (discard: boolean) => {
    shouldDiscardRecordingRef.current = discard;
    isRecordingRef.current = false;
    setIsRecording(false);
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        } else {
          cleanupDictaphoneResources();
        }
      } catch {
        cleanupDictaphoneResources();
      }
      mediaRecorderRef.current = null;
    } else {
      cleanupDictaphoneResources();
    }
  };

  const triggerOpenProfile = (uid: string, snapshot?: any) => {
    if (onOpenProfile) {
      onOpenProfile(uid, snapshot);
    }
    if (typeof window !== 'undefined' && window.self !== window.top) {
      try {
        window.parent.postMessage({ type: 'ALOV_EMBED_OPEN_PROFILE', uid, snapshot }, '*');
      } catch {}
    }
  };

  const triggerOpenGift = (user: any) => {
    if (onOpenGift) {
      onOpenGift(user);
    }
    if (typeof window !== 'undefined' && window.self !== window.top) {
      try {
        window.parent.postMessage({ type: 'ALOV_EMBED_OPEN_GIFT', user }, '*');
      } catch {}
    }
  };

  const triggerStartCall = (user: any) => {
    if (onStartCall) {
      onStartCall(user);
    }
    if (typeof window !== 'undefined' && window.self !== window.top) {
      try {
        window.parent.postMessage({ type: 'ALOV_EMBED_START_CALL', user }, '*');
      } catch {}
    }
  };

  if (chatView === 'list') {
    const filteredChats = filterChatConversations(chatsList, chatSearchQuery, myUid, usersList, myAliases);
    const hasAiInChats = chatsList.some((c) => {
      const uidNow = effectiveUser?.uid || effectiveUser?.id;
      const partnerUid = resolvePartnerUidForChat(c, uidNow || '', myAliases, usersList);
      return partnerUid === ALOV_AI_USER.uid || c.id?.includes(ALOV_AI_USER.uid);
    });
    const showPinnedAiCard =
      !hasAiInChats &&
      (!chatSearchQuery.trim() ||
        'alov ai'.includes(chatSearchQuery.trim().toLowerCase()) ||
        'suhbatdosh'.includes(chatSearchQuery.trim().toLowerCase()));

    const compactKeyboardList = shouldUseCompactKeyboardChrome({
      isCompactViewport: isCompactMobile,
      isKeyboardOpen: viewportMetrics.isKeyboardOpen,
      heightPx: viewportMetrics.heightPx,
    });

    return (
      <div
        data-testid="chat-view-list"
        data-viewport-scroll-lock="true"
        className="flex-1 min-h-0 h-full w-full flex flex-col bg-[#09090D] text-zinc-100 p-0 sm:p-4 overflow-clip"
      >
        <div className="bg-[#0D0F17] sm:bg-[#11131C] sm:rounded-[24px] sm:border sm:border-white/[0.08] overflow-clip flex flex-col flex-1 min-h-0">
          {/* Modern List Header + Search */}
          <div
            className={`px-4 border-b border-white/[0.07] shrink-0 bg-[#0F111A]/95 backdrop-blur-xl ${
              compactKeyboardList
                ? 'pt-[max(0.75rem,var(--alov-safe-top,env(safe-area-inset-top,0px)))] pb-2.5 space-y-2'
                : 'pt-[max(0.875rem,var(--alov-safe-top,env(safe-area-inset-top,0px)))] pb-3 space-y-3'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-editorial text-[26px] sm:text-[28px] font-bold text-white tracking-tight leading-none">
                Xabarlar
              </h2>
              <span className="text-xs font-medium text-zinc-400 tabular-nums" data-testid="chats-count-badge">
                {chatsList.length} suhbat
              </span>
            </div>

            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 pointer-events-none" />
              <input
                type="search"
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                placeholder="Suhbatlarni qidirish..."
                aria-label="Suhbatlarni qidirish"
                data-testid="chat-list-search-input"
                className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-[#171A26] border border-white/[0.08] focus:border-rose-500/60 text-[16px] sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
              />
              {chatSearchQuery && (
                <button
                  type="button"
                  onClick={() => setChatSearchQuery('')}
                  aria-label="Qidiruvni tozalash"
                  className="absolute right-0.5 z-10 min-w-[44px] min-h-[44px] w-11 h-11 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.08] cursor-pointer transition"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div
            className="flex-1 min-h-0 divide-y divide-white/[0.05] overflow-y-auto overscroll-y-contain touch-pan-y pb-24 sm:pb-6"
            style={{ WebkitOverflowScrolling: 'touch' }}
            data-testid="chats-list-scroll-area"
          >
            {isLoadingChats ? (
              <>
                <ChatSkeleton />
                <ChatSkeleton />
                <ChatSkeleton />
              </>
            ) : (
              <>
                {showPinnedAiCard && (
                  <button
                    type="button"
                    data-testid="pinned-alov-ai-chat-btn"
                    onClick={() => handleOpenConversation(ALOV_AI_USER)}
                    className="w-full min-h-[72px] text-left px-4 py-3 flex items-center gap-3.5 cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.07] transition-colors relative bg-rose-500/[0.05]"
                  >
                    <div className="relative shrink-0">
                      <img
                        src={ALOV_AI_USER.avatar}
                        alt={ALOV_AI_USER.name}
                        className="w-12 h-12 rounded-full object-cover ring-1 ring-rose-400/35"
                      />
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0D0F17] rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h3 className="font-bold text-[15px] text-white truncate">{ALOV_AI_USER.name}</h3>
                          <span className="text-[11px] font-semibold text-rose-400 shrink-0">· Suhbatdosh</span>
                        </div>
                        <span className="text-[11px] text-emerald-400 font-semibold shrink-0">Onlayn</span>
                      </div>
                      <p className="text-[13px] text-zinc-400 truncate mt-0.5">
                        Samimiy do&apos;st · Jonli suhbat va mos juft topish
                      </p>
                    </div>
                  </button>
                )}

                {filteredChats.length === 0 ? (
                  <div className="px-6 py-12 text-center space-y-3">
                    <div className="w-14 h-14 bg-white/[0.05] border border-white/[0.08] rounded-full flex items-center justify-center mx-auto">
                      <MessageCircle className="w-7 h-7 text-zinc-500" />
                    </div>
                    <p className="text-sm text-zinc-400 font-medium max-w-xs mx-auto">
                      {chatSearchQuery.trim()
                        ? `«${chatSearchQuery.trim()}» bo'yicha suhbat topilmadi.`
                        : "Hozircha boshqa xabarlar yo'q. Nomzodlar bilan suhbatni boshlang!"}
                    </p>
                    {chatSearchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => setChatSearchQuery('')}
                        className="min-h-[44px] px-5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-white transition cursor-pointer"
                      >
                        Barcha suhbatlarni ko&apos;rish
                      </button>
                    )}
                  </div>
                ) : (
                  filteredChats.map((chat, idx) => {
                    const uidNow = effectiveUser?.uid || effectiveUser?.id;
                    const partnerUid = resolvePartnerUidForChat(chat, uidNow || '', myAliases, usersList);
                    const otherUser =
                      usersList.find((u) => u.uid === partnerUid || u.id === partnerUid) ||
                      (partnerUid === ALOV_AI_USER.uid ? ALOV_AI_USER : null) ||
                      chat.partner || { uid: partnerUid, name: 'Foydalanuvchi' };
                    const unread = myAliases.reduce(
                      (acc, alias) => Math.max(acc, Number(chat.unreadCount?.[alias] || 0)),
                      Number(chat.unreadCount?.[uidNow || ''] || 0)
                    );
                    const chatAvatar = resolveMediaOrAvatar(resolveEffectiveProfileAvatar(otherUser));

                    return (
                      <button
                        type="button"
                        key={chat.id ? `${chat.id}_${idx}` : `chat_${idx}`}
                        onClick={() => handleOpenConversation(otherUser)}
                        className={`w-full min-h-[72px] text-left px-4 py-3 flex items-center gap-3.5 cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.07] transition-colors relative ${
                          chat.isAI ? 'bg-rose-500/[0.04]' : ''
                        }`}
                      >
                        <div className="relative shrink-0">
                          {chatAvatar ? (
                            <img
                              src={chatAvatar}
                              alt={otherUser?.name || ''}
                              className="w-12 h-12 rounded-full object-cover ring-1 ring-white/15"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-300 font-bold text-base flex items-center justify-center ring-1 ring-rose-500/30">
                              {getSafeUserDisplayName(otherUser, 'F').charAt(0).toUpperCase()}
                            </div>
                          )}
                          {isUserOnlineStrict(otherUser, onlineUserIds) && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0D0F17] rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h3 className="font-bold text-[15px] text-white truncate">
                                {otherUser?.name || 'Foydalanuvchi'}
                              </h3>
                              <AdminBadge user={otherUser} size="xs" testId="chat-list-admin-badge" />
                              {chat.isAI && <span className="text-[11px] font-semibold text-rose-400 shrink-0">· AI</span>}
                            </div>
                            <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">
                              {chat.updatedAt
                                ? new Date(chat.updatedAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5 gap-2">
                            <p className={`text-[13px] truncate flex-1 ${unread > 0 ? 'text-white font-semibold' : 'text-zinc-400'}`}>
                              {chat.isAI && isAiTyping ? (
                                <span className="text-emerald-400 font-semibold">yozmoqda...</span>
                              ) : (
                                chat.lastMessage
                              )}
                            </p>
                            {unread > 0 && (
                              <span className="bg-[#E11D48] text-white text-[11px] font-bold min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5 tabular-nums shrink-0">
                                {unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const partnerOnline = isUserOnlineStrict(resolvedChatPartner, onlineUserIds);
  const partnerAvatar = resolveMediaOrAvatar(resolveEffectiveProfileAvatar(resolvedChatPartner));
  const partnerIsAdmin = isAdminTelegramUser(resolvedChatPartner);

  const progressVal = Number(effectiveUser?.diamondProgress || 0);
  const progressPct = getDiamondProgressPercent(progressVal);
  const pendingBatches = Array.isArray(effectiveUser?.pendingDiamondBatches)
    ? effectiveUser.pendingDiamondBatches
    : [];
  const pendingTotal = getPendingDiamondsTotal(pendingBatches);
  const nextUnlockAt = getNextUnlockTimestamp(pendingBatches);
  const countdown = computeCountdownParts(nextUnlockAt, countdownNow);

  const isTypingActive = isOtherTyping || (otherUid === ALOV_AI_USER.uid && isAiTyping);
  const compactKeyboardChrome = shouldUseCompactKeyboardChrome({
    isCompactViewport: isCompactMobile,
    isKeyboardOpen: viewportMetrics.isKeyboardOpen,
    heightPx: viewportMetrics.heightPx,
  });

  return (
    <div
      data-testid="chat-view-conversation"
      data-viewport-scroll-lock="true"
      style={
        isCompactMobile
          ? { height: '100%', maxHeight: `${viewportMetrics.heightPx}px` }
          : undefined
      }
      className="flex-1 min-h-0 h-full w-full bg-[#09090D] flex flex-col overflow-clip text-zinc-100 relative"
    >
      {/* Subtle Ambient Header Aura */}
      <div className="pointer-events-none absolute top-0 inset-x-0 h-36 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.08),transparent_70%)]" />

      {/* Pinned Top Bar (Avatar, Name, Status, Gift, Video Call) */}
      <div
        data-testid="chat-conversation-header"
        className="relative shrink-0 z-30 px-2.5 sm:px-4 pt-[max(0.625rem,var(--alov-safe-top,env(safe-area-inset-top,0px)))] pb-2.5 min-h-[calc(4rem+var(--alov-safe-top,env(safe-area-inset-top,0px)))] border-b border-white/[0.08] flex items-center justify-between gap-1.5 sm:gap-3 bg-[#0F111A]/95 backdrop-blur-xl"
      >
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          <button
            type="button"
            aria-label="Suhbatlar ro'yxatiga qaytish"
            data-testid="chat-header-back-btn"
            onClick={() => {
              setChatView('list');
              void refreshChatsFromServer();
            }}
            className="min-w-[44px] min-h-[44px] rounded-full hover:bg-white/[0.08] active:bg-white/[0.12] text-zinc-200 flex items-center justify-center transition active:scale-95 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            data-testid="chat-header-partner-btn"
            onClick={() => otherUid && triggerOpenProfile(otherUid, resolvedChatPartner)}
            className="min-h-[44px] flex-1 flex items-center gap-2.5 min-w-0 text-left hover:opacity-90 active:opacity-75 transition cursor-pointer pr-1"
            title="Profilni ko'rish"
          >
            <div className="relative shrink-0">
              {partnerAvatar ? (
                <img
                  src={partnerAvatar}
                  alt={resolvedChatPartner?.name || ''}
                  className={`w-10 h-10 rounded-full object-cover ring-1 ${
                    partnerIsAdmin ? 'ring-amber-400/70' : 'ring-white/15'
                  }`}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-300 font-bold text-sm flex items-center justify-center ring-1 ring-rose-500/35">
                  {getSafeUserDisplayName(resolvedChatPartner, 'F').charAt(0).toUpperCase()}
                </div>
              )}
              {partnerOnline && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#0F111A] rounded-full" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-sans font-bold text-[15px] text-white leading-tight truncate">
                  {resolvedChatPartner?.name || 'Foydalanuvchi'}
                </h3>
                <AdminBadge user={resolvedChatPartner} size="xs" testId="chat-header-admin-badge" />
              </div>
              <p
                className={`text-[11px] leading-tight mt-0.5 truncate ${
                  isTypingActive
                    ? 'text-rose-400 font-semibold'
                    : partnerOnline
                    ? 'text-emerald-400 font-semibold'
                    : 'text-zinc-400'
                }`}
              >
                {isTypingActive
                  ? 'yozmoqda...'
                  : partnerIsAdmin
                  ? `Administrator · ${partnerOnline ? 'tarmoqda' : formatLastSeenUz(resolvedChatPartner?.lastSeen, false)}`
                  : partnerOnline
                  ? 'tarmoqda'
                  : formatLastSeenUz(resolvedChatPartner?.lastSeen, false)}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {effectiveUser?.gender === 'female' && !isAIBotChat && (
            <button
              type="button"
              onClick={handleToggleFriendship}
              className={`min-h-[38px] px-2.5 sm:px-3 rounded-full text-[11px] font-bold flex items-center gap-1 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer ${
                isFriendActive
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
              }`}
            >
              <Handshake className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xs:inline sm:inline">
                {isFriendActive ? "Do'st" : "Do'stlashish"}
              </span>
            </button>
          )}
          <button
            type="button"
            data-testid="chat-header-gift-btn"
            onClick={() => selectedChatUser && triggerOpenGift(selectedChatUser)}
            title="Sovg'a yuborish"
            aria-label="Sovg'a yuborish"
            className="min-w-[44px] min-h-[44px] rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/20 text-amber-400 flex items-center justify-center transition active:scale-90 cursor-pointer shrink-0"
          >
            <Gift className="w-[19px] h-[19px]" />
          </button>
          <button
            type="button"
            data-testid="chat-header-video-btn"
            onClick={() => selectedChatUser && triggerStartCall(selectedChatUser)}
            title="Video qo'ng'iroq"
            aria-label="Video qo'ng'iroq"
            className="min-w-[44px] min-h-[44px] rounded-full bg-rose-500/12 hover:bg-rose-500/24 border border-rose-500/25 text-rose-400 flex items-center justify-center transition active:scale-90 cursor-pointer shrink-0"
          >
            <Video className="w-[19px] h-[19px]" />
          </button>
        </div>
      </div>

      {/* Pricing / Earnings Micro-Strip */}
      {isFriendActive && !isAIBotChat ? (
        <div
          data-testid="chat-pricing-strip"
          className={`bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-200 px-3.5 font-semibold flex items-center justify-between gap-2 shrink-0 ${
            compactKeyboardChrome ? 'py-1 text-[10.5px]' : 'py-1.5 text-[11px]'
          }`}
        >
          <span className="truncate">Do&apos;stlashish faol — Yigitdan moneta yechilmaydi</span>
          <span className="text-emerald-300 font-bold whitespace-nowrap shrink-0">Bepul</span>
        </div>
      ) : effectiveUser?.gender === 'female' ? (
        <div
          data-testid="chat-pricing-strip"
          className={`bg-cyan-500/10 border-b border-cyan-500/20 text-cyan-200 px-3.5 font-semibold flex items-center justify-between gap-2 shrink-0 ${
            compactKeyboardChrome ? 'py-1 text-[10.5px]' : 'py-1.5 text-[11px]'
          }`}
        >
          <span className="truncate">💎 Har bir javob uchun +{MESSAGE_DIAMOND_REWARD} Almaz</span>
          <span className="font-mono text-cyan-300 font-bold whitespace-nowrap tabular-nums shrink-0">
            Hamyon: {formatDiamondsDisplay(effectiveUser?.diamonds)}
          </span>
        </div>
      ) : !isAIBotChat ? (
        <div
          data-testid="chat-pricing-strip"
          className={`bg-amber-500/[0.08] border-b border-amber-500/20 text-amber-200 px-3.5 font-semibold flex items-center justify-between gap-2 shrink-0 ${
            compactKeyboardChrome ? 'py-1 text-[10.5px]' : 'py-1.5 text-[11px]'
          }`}
        >
          <span className="truncate">
            🪙 Xabar/GIF: {MESSAGE_COIN_COST} · Golos: {VOICE_MESSAGE_COIN_COST} · Video/Audio: {MEDIA_FILE_COIN_COST}
          </span>
          <span className="font-mono text-amber-300 font-bold whitespace-nowrap tabular-nums shrink-0" data-testid="chat-coin-balance">
            {effectiveUser?.coins ?? 100} 🪙
          </span>
        </div>
      ) : null}

      {/* Scrollable Messages Viewport */}
      <div
        ref={chatMessagesContainerRef}
        onScroll={handleMessagesScroll}
        data-testid="chat-messages-scroll-area"
        style={{ WebkitOverflowScrolling: 'touch' }}
        className={`flex-1 min-h-0 px-3 sm:px-4 overflow-y-auto overscroll-y-contain touch-pan-y space-y-2 bg-[#09090D] relative z-10 flex flex-col ${
          compactKeyboardChrome ? 'py-2' : 'py-3.5'
        }`}
      >
        {sortedMessages.length === 0 && !isStartGifLocked && (
          <div
            data-testid="chat-empty-starter"
            className={
              compactKeyboardChrome
                ? 'mx-auto my-1 max-w-xs w-full py-2 px-4 text-center space-y-2 shrink-0'
                : 'my-auto mx-auto max-w-xs w-full py-6 px-4 text-center space-y-3 shrink-0'
            }
          >
            {partnerAvatar ? (
              <img
                src={partnerAvatar}
                alt={resolvedChatPartner?.name || ''}
                className={`${compactKeyboardChrome ? 'w-11 h-11' : 'w-16 h-16'} rounded-full object-cover mx-auto ring-2 ring-white/15`}
              />
            ) : (
              <div
                className={`${
                  compactKeyboardChrome ? 'w-11 h-11 text-base' : 'w-16 h-16 text-xl'
                } rounded-full bg-rose-500/20 text-rose-300 font-bold flex items-center justify-center mx-auto ring-2 ring-rose-500/30`}
              >
                {getSafeUserDisplayName(resolvedChatPartner, 'F').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="space-y-1">
              <h4 className="font-editorial text-xl font-bold text-white">
                {resolvedChatPartner?.name || 'Foydalanuvchi'}
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isAIBotChat
                  ? "Samimiy suhbatdosh · O'zbekcha jonli muloqot"
                  : [resolvedChatPartner?.region, resolvedChatPartner?.district].filter(Boolean).join(', ') ||
                    "Suhbatni samimiy salomdan boshlang"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {isAIBotChat ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSendMessage('text', undefined, 'Salom! Toshkentdan mos juft topib ber')}
                    className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#161925] hover:bg-[#1E2233] border border-white/[0.1] text-xs font-semibold text-zinc-200 transition active:scale-95 cursor-pointer"
                  >
                    Juft topishda yordam ber
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendMessage('text', undefined, "Qalaysan, bugun kuning qanday o'tdi?")}
                    className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#161925] hover:bg-[#1E2233] border border-white/[0.1] text-xs font-semibold text-zinc-200 transition active:scale-95 cursor-pointer"
                  >
                    Salomlashish
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSendMessage('text', undefined, 'Salom! Tanishsak bo‘ladimi?')}
                  className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#161925] hover:bg-[#1E2233] border border-white/[0.1] text-xs font-semibold text-zinc-200 transition active:scale-95 cursor-pointer"
                >
                  Salom yozish 👋
                </button>
              )}
            </div>
          </div>
        )}
        {sortedMessages.map((msg, idx) => {
          const isMe =
            msg.senderId === 'me' ||
            myAliases.includes(String(msg.senderId || '')) ||
            myAliases.includes(String(msg.userId || ''));
          const rawMediaUrl = msg.fileUrl || (msg.type === 'gif' ? msg.content : '') || '';
          const resolvedUrl = rawMediaUrl.startsWith('/api/') ? `${apiOrigin}${rawMediaUrl}` : rawMediaUrl;
          const frameless = isFramelessChatMediaType(msg);
          const isDefaultMediaText =
            !msg.text ||
            ['GIF', 'Rasm 🖼️', 'Rasm', 'Video 🎥', 'Video'].includes(String(msg.text).trim());
          const adminBadgeUser = isMe ? effectiveUser : resolvedChatPartner;
          const messageSenderIsAdmin = isAdminTelegramUser(adminBadgeUser);

          return (
            <div
              key={msg.id ? `${msg.id}_${idx}` : `msg_${idx}`}
              data-testid={`chat-message-row-${msg.type || 'text'}`}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              {frameless ? (
                <div
                  data-testid="chat-frameless-media"
                  className="max-w-[82%] sm:max-w-[75%] relative bg-transparent border-0 p-0 shadow-none"
                >
                  {messageSenderIsAdmin && (
                    <div className={`mb-1 flex items-center ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <AdminBadge user={adminBadgeUser} size="xs" testId="chat-message-admin-badge" />
                    </div>
                  )}
                  {msg.type === 'video' ? (
                    <div className="relative rounded-2xl overflow-hidden">
                      <VideoPlayer url={resolvedUrl} />
                      {/* Timestamp pill top-right so bottom native video controls remain clear */}
                      <div className="pointer-events-none absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white flex items-center gap-1">
                        <span className="text-[9.5px] tabular-nums">{msg.time}</span>
                        {isMe && (
                          <span className="flex items-center shrink-0">
                            {msg.status === 'failed' ? (
                              <AlertCircle className="w-3.5 h-3.5 text-amber-300" />
                            ) : msg.status === 'sending' ? (
                              <Clock className="w-3 h-3 text-white/80 animate-pulse" />
                            ) : msg.status === 'read' || msg.read ? (
                              <CheckCheck className="w-3.5 h-3.5 text-cyan-300" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-white/90" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden inline-block">
                      <img
                        src={resolvedUrl}
                        alt={msg.text || (isGifMessage(msg) ? 'GIF' : 'Rasm')}
                        onClick={() => !isGifMessage(msg) && resolvedUrl && setLightboxImageUrl(resolvedUrl)}
                        className={`rounded-2xl max-h-64 block ${
                          isGifMessage(msg)
                            ? 'min-w-[140px] min-h-[96px] max-w-[260px] w-auto object-contain bg-black/20'
                            : 'max-w-[270px] w-auto object-cover cursor-pointer'
                        }`}
                      />
                      <div className="pointer-events-none absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white flex items-center gap-1">
                        <span className="text-[9.5px] tabular-nums">{msg.time}</span>
                        {isMe && (
                          <span className="flex items-center shrink-0">
                            {msg.status === 'failed' ? (
                              <AlertCircle className="w-3.5 h-3.5 text-amber-300" />
                            ) : msg.status === 'sending' ? (
                              <Clock className="w-3 h-3 text-white/80 animate-pulse" />
                            ) : msg.status === 'read' || msg.read ? (
                              <CheckCheck className="w-3.5 h-3.5 text-cyan-300" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-white/90" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {isMe && msg.status === 'failed' && (
                    <button
                      type="button"
                      data-testid="chat-retry-message-btn"
                      onClick={() => void handleRetryMessage(msg)}
                      className="mt-1 ml-auto px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Qayta yuborish</span>
                    </button>
                  )}

                  {!isDefaultMediaText && (
                    <p
                      className={`mt-1 px-3 py-1.5 rounded-xl text-xs max-w-[260px] ${
                        isMe
                          ? 'bg-[#E11D48]/90 text-white ml-auto'
                          : 'bg-[#151824] text-zinc-100 border border-white/[0.08]'
                      }`}
                    >
                      {msg.text}
                    </p>
                  )}
                </div>
              ) : (
                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-[20px] relative px-3.5 sm:px-4 py-2.5 ${
                    isMe
                      ? 'bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white rounded-br-[6px] shadow-[0_6px_18px_rgba(225,29,72,0.22)]'
                      : messageSenderIsAdmin
                      ? 'bg-[#191620] text-zinc-100 border border-amber-400/35 rounded-bl-[6px] shadow-md shadow-amber-950/20'
                      : 'bg-[#151824] text-zinc-100 border border-white/[0.08] rounded-bl-[6px]'
                  }`}
                >
                  {messageSenderIsAdmin && (
                    <div className={`mb-1.5 flex items-center ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <AdminBadge user={adminBadgeUser} size="xs" testId="chat-message-admin-badge" />
                    </div>
                  )}
                  {msg.type === 'gift' ? (
                    <div className="flex items-center space-x-2.5 py-1">
                      <span className="text-3xl shrink-0">{msg.giftIcon || msg.giftInfo?.giftIcon || '🎁'}</span>
                      <div>
                        <p className="font-bold text-xs">{msg.giftName || msg.giftInfo?.giftName || "Sovg'a"} yuborildi!</p>
                        <p className="text-[10px] opacity-90 mt-0.5">🪙 {msg.coinPrice || msg.giftInfo?.coinPrice || 10} moneta</p>
                      </div>
                    </div>
                  ) : msg.type === 'meet' ? (
                    <a href={msg.meetUrl} target="_blank" rel="noreferrer" className="underline font-bold flex items-center space-x-2 py-1">
                      <Video className="w-4 h-4" />
                      <span>Google Meet Qo&apos;shilish</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  ) : msg.type === 'voice' ? (
                    <VoiceMessage
                      url={resolvedUrl}
                      senderId={isMe ? 'me' : msg.senderId}
                      durationSec={msg.durationSec}
                    />
                  ) : msg.type === 'audio' ? (
                    <AudioPlayer
                      url={resolvedUrl}
                      senderId={isMe ? 'me' : msg.senderId}
                      title={msg.fileName || msg.text}
                      durationSec={msg.durationSec}
                    />
                  ) : (
                    <p className="text-[14px] leading-[1.48] whitespace-pre-wrap break-words">{msg.text}</p>
                  )}

                  <div className="flex items-center justify-end space-x-1 mt-1">
                    <span className={`text-[9.5px] tabular-nums ${isMe ? 'text-rose-100/80' : 'text-zinc-500'}`}>
                      {msg.time}
                    </span>
                    {isMe && (
                      <span className="flex items-center ml-1 shrink-0">
                        {msg.status === 'failed' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-200" />
                        ) : msg.status === 'sending' ? (
                          <Clock className="w-3 h-3 text-rose-200/90 animate-pulse" />
                        ) : msg.status === 'read' || msg.read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-cyan-200" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-rose-200" />
                        )}
                      </span>
                    )}
                  </div>
                  {isMe && msg.status === 'failed' && (
                    <button
                      type="button"
                      data-testid="chat-retry-message-btn"
                      onClick={() => void handleRetryMessage(msg)}
                      className="mt-1.5 w-full px-2.5 py-1 rounded-lg bg-black/30 border border-amber-300/40 text-amber-200 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-black/45 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Yuborilmadi — Qayta yuborish</span>
                    </button>
                  )}

                  {!isMe && Array.isArray(msg.recommendedProfiles) && msg.recommendedProfiles.length > 0 && (
                    <div
                      data-testid="ai-recommended-profiles"
                      className="mt-3 pt-2.5 border-t border-white/[0.08] space-y-2.5"
                    >
                      {msg.recommendedProfiles.map((profile: any, pIdx: number) => {
                        const matchAvatar = resolveMediaOrAvatar(resolveEffectiveProfileAvatar(profile));
                        const matchLocation = [profile.region, profile.district].filter(Boolean).join(', ');
                        return (
                          <div
                            key={profile.uid || `match_${pIdx}`}
                            data-testid="ai-recommended-profile-card"
                            className="rounded-2xl bg-[#0D0F18] border border-white/10 p-3 space-y-2.5 shadow-sm"
                          >
                            <div className="flex items-center gap-2.5">
                              {matchAvatar ? (
                                <img
                                  src={matchAvatar}
                                  alt={profile.name || 'Nomzod'}
                                  className="w-11 h-11 rounded-full object-cover border border-white/15 shrink-0"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-full bg-rose-500/20 text-rose-300 font-bold text-sm flex items-center justify-center border border-rose-500/30 shrink-0">
                                  {getSafeUserDisplayName(profile, 'F').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-xs text-white truncate">
                                    {profile.name || 'Foydalanuvchi'}
                                  </span>
                                  {profile.age && (
                                    <span className="text-[11px] font-semibold text-rose-300 tabular-nums">
                                      · {profile.age} yosh
                                    </span>
                                  )}
                                  {profile.isVerified && (
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  )}
                                </div>
                                {matchLocation && (
                                  <p className="text-[10.5px] text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
                                    <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                                    <span className="truncate">{matchLocation}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                            {profile.bio && (
                              <p className="text-[11px] text-zinc-300 line-clamp-2 leading-relaxed">
                                {profile.bio}
                              </p>
                            )}
                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                data-testid="ai-match-open-chat-btn"
                                onClick={() => handleOpenConversation(profile)}
                                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#E11D48] to-rose-600 hover:brightness-110 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>Chatga kirish</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => triggerOpenProfile(profile.uid, profile)}
                                className="py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 font-bold text-[11px] transition cursor-pointer"
                              >
                                Profil
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isStartGifLocked && (
          <div className="flex-1 min-h-[260px] flex items-center justify-center py-6">
            <div
              data-testid="start-gif-gate"
              className="w-full max-w-[300px] rounded-[24px] bg-[#131622] border border-rose-500/30 p-4 text-center space-y-3 shadow-2xl"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/25 text-rose-300 text-[10.5px] font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Suhbatni boshlash GIFi</span>
              </div>
              <button
                type="button"
                data-testid="start-gif-send-btn"
                onClick={() => void handleSendMessage('gif', startGifGate.startGifUrl, 'Start / Salomlashish GIF')}
                className="group w-full rounded-2xl overflow-hidden border border-white/15 bg-black/40 hover:border-rose-400/60 transition cursor-pointer block"
              >
                <img
                  src={startGifGate.startGifUrl}
                  alt="Start GIF"
                  className="w-full max-h-48 object-contain mx-auto bg-black/30"
                />
                <div className="py-2.5 px-3 bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 group-hover:brightness-110 transition">
                  <Send className="w-3.5 h-3.5" />
                  <span>Start / Salomlashish yuborish</span>
                </div>
              </button>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {selectedChatUser?.name || 'Foydalanuvchi'} bilan suhbatni ochish uchun avval yuqoridagi GIFni bosing.
              </p>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />

        {(isOtherTyping || (otherUid === ALOV_AI_USER.uid && isAiTyping)) && (
          <div className="flex justify-start">
            <div className="bg-[#151824] border border-white/[0.08] text-zinc-400 rounded-[18px] rounded-tl-none px-4 py-2 flex items-center space-x-2">
              <span className="text-[11px] font-semibold">
                {otherUid === ALOV_AI_USER.uid ? 'Alov AI yozmoqda...' : 'yozmoqda...'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Scroll-to-Bottom Button when user scrolled up */}
      {showScrollToBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          data-testid="chat-scroll-bottom-btn"
          aria-label="Eng pastga tushish"
          className="absolute right-4 bottom-24 z-30 min-w-[44px] min-h-[44px] rounded-full bg-[#181B29]/95 hover:bg-[#23273A] border border-white/15 text-zinc-100 shadow-xl flex items-center justify-center transition active:scale-90 cursor-pointer"
        >
          <ArrowDown className="w-4.5 h-4.5" />
        </button>
      )}

      {/* Female Diamond Limit Strip (compact / collapsed while virtual keyboard is open on mobile) */}
      {effectiveUser?.gender === 'female' && !(isCompactMobile && viewportMetrics.isKeyboardOpen) && (
        <div className="bg-[#0F111A] border-t border-white/[0.08] px-3.5 pt-2 pb-1.5 shrink-0 space-y-1">
          <div className="flex items-center justify-between text-[10.5px] font-bold">
            <span className="text-zinc-300 flex items-center gap-1">
              <span>💎 Kunlik limit ({DAILY_LIMIT_WINDOW_HOURS} soat):</span>
              <span className="text-cyan-300 tabular-nums">
                {formatDiamondsDisplay(progressVal)} / {DIAMOND_LIMIT_TARGET}
              </span>
            </span>
            <span className="text-emerald-400 tabular-nums">{progressPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full w-full origin-left bg-gradient-to-r from-cyan-500 to-emerald-500 transition-transform duration-500 rounded-full"
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, progressPct / 100))})` }}
            />
          </div>
          {pendingTotal > 0 && (
            <div className="flex items-center justify-between text-[10px] font-semibold text-amber-200 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-400/20">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 shrink-0 text-amber-400" />
                <span>
                  {formatDiamondsDisplay(pendingTotal)} 💎 {DIAMOND_UNLOCK_HOURS} soatda hamyonga tushadi
                </span>
              </span>
              <span className="font-mono font-bold text-amber-300 tabular-nums">{countdown.formatted}</span>
            </div>
          )}
        </div>
      )}

      {/* Modern Unified Bottom Composer / Media Picker / GIF Bar / Dictaphone */}
      <div
        data-testid="chat-composer-bar"
        className={`shrink-0 z-20 px-2.5 sm:px-4 bg-[#0F111A]/95 backdrop-blur-xl border-t border-white/[0.08] flex flex-col ${
          compactKeyboardChrome
            ? 'pt-1.5 pb-1.5'
            : 'pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]'
        }`}
      >
        {isStartGifLocked ? (
          <div
            data-testid="start-gif-locked-bar"
            className="w-full py-2.5 px-3.5 rounded-2xl bg-[#181B29] border border-white/10 text-zinc-400 text-[12px] font-semibold flex items-center justify-center gap-2 text-center"
          >
            <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Suhbat qulflangan — avval yuqoridagi Start / Salomlashish GIFini yuboring</span>
          </div>
        ) : (
          <>
            <Suspense fallback={null}>
              <ChatMediaPicker
                isOpen={showChatMediaPicker}
                onToggleOpen={() => setShowChatMediaPicker((prev) => !prev)}
                onSendMedia={handleSendPickedMedia}
                isUploading={isUploadingChatMedia}
                apiOrigin={apiOrigin}
                currentUserUid={myUid}
                showPrices={isSenderCharged}
              />
            </Suspense>

            <ChatGifBar
              query={inputMessage}
              hideTrigger={gifBarHideTrigger}
              apiOrigin={apiOrigin}
              onSelectGif={handleSendGif}
            />

            {isRecording ? (
              <div
                data-testid="dictaphone-bar"
                className="flex items-center gap-2 w-full bg-[#171A26] border border-rose-500/40 rounded-[26px] px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => finishRecording(true)}
                  data-testid="dictaphone-cancel-btn"
                  aria-label="Ovozli xabarni bekor qilish"
                  title="Bekor qilish"
                  className="min-w-[44px] min-h-[44px] rounded-full bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center transition active:scale-90 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span
                    data-testid="dictaphone-timer"
                    className="text-xs font-mono font-bold text-white tabular-nums"
                  >
                    {formatMediaDuration(recordingSeconds)}
                  </span>
                </div>

                <div className="flex-1 flex items-center justify-center gap-1 h-7 overflow-hidden px-1">
                  {recordingLevels.map((lvl, idx) => (
                    <span
                      key={idx}
                      style={{ height: `${lvl}%` }}
                      className="w-1 rounded-full bg-rose-400/85 transition-all duration-100"
                    />
                  ))}
                </div>

                {isSenderCharged && (
                  <span className="text-[10.5px] font-bold text-amber-300 px-1.5 shrink-0 tabular-nums">
                    {VOICE_MESSAGE_COIN_COST} 🪙
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => finishRecording(false)}
                  data-testid="dictaphone-send-btn"
                  aria-label="Ovozli xabarni yuborish"
                  title="Ovozli xabarni yuborish"
                  className="min-w-[44px] min-h-[44px] bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-full shadow-lg transition active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-1.5 w-full bg-[#161925] border border-white/[0.09] focus-within:border-rose-500/55 rounded-[26px] p-1 transition-colors">
                <button
                  type="button"
                  onClick={() => setShowChatMediaPicker((prev) => !prev)}
                  aria-label="Media yuklash"
                  data-testid="toggle-chat-media-picker"
                  className={`min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition active:scale-90 cursor-pointer shrink-0 ${
                    showChatMediaPicker
                      ? 'bg-rose-500/20 text-rose-400'
                      : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                  }`}
                >
                  <Plus className={`w-5 h-5 transition-transform ${showChatMediaPicker ? 'rotate-45' : ''}`} />
                </button>
                <div className="flex-1 min-w-0 flex items-center">
                  <textarea
                    ref={textareaRef}
                    placeholder="Xabar yozing..."
                    rows={1}
                    value={inputMessage}
                    onFocus={() => {
                      setShowChatMediaPicker(false);
                      resetViewportScrollOffsets();
                      if (isUserNearBottomRef.current) {
                        [120, 280].forEach((delay) => {
                          setTimeout(() => {
                            resetViewportScrollOffsets();
                            const el = chatMessagesContainerRef.current;
                            if (el) el.scrollTop = el.scrollHeight;
                          }, delay);
                        });
                      }
                    }}
                    onChange={(e) => {
                      setInputMessage(e.target.value);
                      handleTyping();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    className="w-full px-2 py-2.5 bg-transparent text-[16px] sm:text-[14px] leading-snug text-white placeholder:text-zinc-500 focus:outline-none resize-none max-h-28 overflow-y-auto"
                  />
                </div>
                {inputMessage.trim() ? (
                  <button
                    type="button"
                    aria-label="Xabarni yuborish"
                    data-testid="chat-send-text-btn"
                    onClick={() => void handleSendMessage()}
                    className="min-w-[44px] min-h-[44px] bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white rounded-full shadow-lg shadow-rose-950/40 hover:brightness-110 transition-all active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Send className="w-4.5 h-4.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Ovozli xabar yozish (diktafon)"
                    title={isSenderCharged ? `Diktafon (${VOICE_MESSAGE_COIN_COST} moneta)` : 'Diktafon'}
                    data-testid="start-voice-recording-btn"
                    onClick={() => void startRecording()}
                    className="min-w-[44px] min-h-[44px] rounded-full transition-all active:scale-95 flex items-center justify-center cursor-pointer bg-white/[0.07] text-zinc-300 hover:bg-rose-500/20 hover:text-rose-300 shrink-0"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Image Fullscreen Lightbox */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-[180] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 pt-[max(1rem,var(--alov-safe-top,0px))]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxImageUrl(null);
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxImageUrl(null)}
            aria-label="Yopish"
            className="absolute top-[calc(1rem+var(--alov-safe-top,0px))] right-4 z-30 min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center rounded-full bg-black/70 hover:bg-rose-600 border border-white/25 text-white shadow-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImageUrl}
            alt="Rasm"
            className="max-w-full max-h-[88dvh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
