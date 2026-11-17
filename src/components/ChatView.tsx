import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock,
  Gift,
  Handshake,
  MessageCircle,
  Mic,
  Plus,
  Send,
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
import { buildCanonicalChatId, mergeChatLists } from '../utils/chatList';
import { getSafeUserDisplayName, pickPreferredAvatar } from '../utils/telegramProfile';
import { resolveEffectiveProfileAvatar } from '../utils/faceId';
import { isUserOnlineStrict, formatLastSeenUz } from '../utils/presence';
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
  capMessagesForLocalCache,
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

const ChatMediaPicker = lazy(() =>
  import('./ChatMediaPicker').then((m) => ({ default: m.ChatMediaPicker }))
);

const ALOV_AI_USER = {
  uid: 'alov_ai_bot',
  id: 'ALOV-AI',
  name: 'Alov AI',
  avatar: '/assets/aistudio/image_e20a1307.webp',
  bio: 'Sizning samimiy va mehribon virtual suhbatdoshingiz.',
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
  const isUserNearBottomRef = useRef<boolean>(true);
  const forceScrollToBottomRef = useRef<boolean>(false);
  const prevConversationKeyRef = useRef<string>('');
  const prevMessageCountRef = useRef<number>(0);

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

  // Load users list for resolving partner avatars & statuses
  useEffect(() => {
    apiFetchJson('/api/users').then((res) => {
      if (res?.success && Array.isArray(res.users)) {
        setUsersList(res.users);
      }
    });
  }, [apiFetchJson]);

  // Load chats list directly from Render Backend + localStorage cache
  useEffect(() => {
    const myUid = effectiveUser?.uid || effectiveUser?.id;
    if (!myUid) {
      setIsLoadingChats(false);
      return;
    }

    let cancelled = false;
    const loadChats = async () => {
      let localChats: any[] = [];
      try {
        const cached = localStorage.getItem('alov_chats_' + myUid);
        if (cached) localChats = JSON.parse(cached);
      } catch {}

      const data = await apiFetchJson(`/api/chats/user/${encodeURIComponent(myUid)}`);
      if (cancelled) return;
      const serverChats = data?.success && Array.isArray(data.chats) ? data.chats : [];

      setChatsList((prev) => {
        const merged = mergeChatLists([prev, localChats, serverChats], myUid, {
          myAliases: [myUid, effectiveUser?.id].filter(Boolean) as string[],
          usersList: usersListRef.current,
        });
        try {
          localStorage.setItem('alov_chats_' + myUid, JSON.stringify(merged));
        } catch {}
        return merged;
      });
      setIsLoadingChats(false);
    };

    loadChats();
    return () => {
      cancelled = true;
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
          socket.emit('join_chat', buildCanonicalChatId(uidNow, otherUid));
        }
      }
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
      const selUser = selectedChatUserRef.current;

      let partnerId = payload?.senderId === uidNow ? payload?.recipientId : payload?.senderId;
      if (!partnerId && msg?.senderId) {
        partnerId = msg.senderId === uidNow ? payload?.recipientId : msg.senderId;
      }
      if (!partnerId && selUser) {
        partnerId = selUser.uid || selUser.id;
      }
      if (!partnerId && !chatId) return;

      const newMsg = {
        ...msg,
        status: msg.status || (msg.senderId === uidNow ? 'sent' : 'read'),
        time:
          msg.time ||
          new Date(msg.createdAt || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
      };

      setChatMessages((prev) => {
        const partnerKeys = [partnerId, selUser?.id, selUser?.uid].filter(
          (k): k is string => Boolean(k) && k !== uidNow
        );
        const keys = Array.from(new Set([chatId, ...partnerKeys].filter(Boolean))) as string[];
        const next = { ...prev };
        keys.forEach((k) => {
          next[k] = mergeUniqueChatMessages(prev[k], [newMsg]);
        });
        if (chatId && next[chatId]) {
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(capMessagesForLocalCache(next[chatId])));
          } catch {}
        }
        return next;
      });

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
            payload?.message?.sender ||
            (partnerId
              ? {
                  uid: partnerId,
                  id: partnerId,
                  name: msg.senderName || selUser?.name || 'Foydalanuvchi',
                  avatar: msg.senderAvatar || selUser?.avatar || '',
                }
              : undefined);
          const incomingChat = {
            id: chatId,
            participants: [uidNow, partnerId].filter(Boolean),
            lastMessage: lastMsg,
            updatedAt: msg.createdAt || new Date().toISOString(),
            partner: partnerInfo,
          };
          const merged = mergeChatLists([prev, [incomingChat]], uidNow || '', {
            myAliases: [uidNow, activeUserRef.current?.id].filter(Boolean) as string[],
            usersList: usersListRef.current,
          });
          if (uidNow) {
            try {
              localStorage.setItem('alov_chats_' + uidNow, JSON.stringify(merged));
            } catch {}
          }
          return merged;
        });
      }

      if (msg.senderId && msg.senderId !== uidNow && selUser && (selUser.id === partnerId || selUser.uid === partnerId)) {
        socket.emit('mark_read', {
          chatId,
          messageIds: [msg.id],
          senderId: msg.senderId,
          recipientId: uidNow,
        });
      }

      if (msg.senderId === ALOV_AI_USER.uid || msg.senderId === 'user_kamola_006' || msg.senderId === 'ALOV-006') {
        setIsAiTyping(false);
      }
    };

    socket.on('receive_message', handleIncomingMessage);
    socket.on('chat:message', handleIncomingMessage);

    socket.on('message_ack', ({ chatId, messageId, status }: any) => {
      setChatMessages((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k]) {
            next[k] = next[k].map((m) => (m.id === messageId ? { ...m, status: status || 'sent' } : m));
          }
        });
        if (chatId && next[chatId]) {
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(capMessagesForLocalCache(next[chatId])));
          } catch {}
        }
        return next;
      });
    });

    socket.on('message_read', ({ chatId, messageIds }: any) => {
      setChatMessages((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k]) {
            next[k] = next[k].map((m) =>
              !messageIds || messageIds.includes(m.id) ? { ...m, status: 'read', read: true } : m
            );
          }
        });
        if (chatId && next[chatId]) {
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(capMessagesForLocalCache(next[chatId])));
          } catch {}
        }
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
  }, [apiOrigin, bridgeToken, effectiveUser?.authToken, effectiveUser?.id, effectiveUser?.uid, notifyParentOrToast]);

  // Join conversation room & fetch message history ONLY when active conversation ID changes (never clobber optimistic GIFs)
  const selectedOtherUid = selectedChatUser?.uid || selectedChatUser?.id || '';
  const myActiveUid = effectiveUser?.uid || effectiveUser?.id || '';

  useEffect(() => {
    if (!selectedOtherUid || !myActiveUid || chatView !== 'conversation') return;

    const chatId = buildCanonicalChatId(myActiveUid, selectedOtherUid);
    socketRef.current?.emit('join_chat', chatId);
    socketRef.current?.emit('mark_read', { chatId, senderId: selectedOtherUid, recipientId: myActiveUid });

    let cancelled = false;
    let localMsgs: any[] = [];
    try {
      const cached = localStorage.getItem('alov_msgs_' + chatId);
      if (cached) localMsgs = JSON.parse(cached);
    } catch {}

    const sanitizedLocal = (Array.isArray(localMsgs) ? localMsgs : []).map((m) => ({
      ...m,
      status: m.status === 'sending' || !m.status ? 'sent' : m.status,
    }));

    if (sanitizedLocal.length > 0) {
      setChatMessages((prev) => {
        const merged = mergeUniqueChatMessages(sanitizedLocal, prev[chatId], prev[selectedOtherUid]);
        return { ...prev, [chatId]: merged, [selectedOtherUid]: merged };
      });
    }

    apiFetchJson(`/api/chats/${encodeURIComponent(chatId)}/messages`).then((data) => {
      if (cancelled) return;
      if (data?.success) {
        if (data.friendship !== undefined) {
          setChatFriendships((prev) => ({ ...prev, [chatId]: Boolean(data.friendship?.active) }));
        }
        if (Array.isArray(data.messages)) {
          setChatMessages((prev) => {
            // Merge safely inside functional update so optimistically sent GIFs/messages are NEVER wiped!
            const merged = mergeUniqueChatMessages(
              sanitizedLocal,
              data.messages,
              prev[chatId],
              prev[selectedOtherUid]
            );
            try {
              localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(capMessagesForLocalCache(merged)));
            } catch {}
            return { ...prev, [chatId]: merged, [selectedOtherUid]: merged };
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [apiFetchJson, chatView, myActiveUid, selectedOtherUid]);

  // Countdown tick for female diamond unlock timer
  useEffect(() => {
    const batches = effectiveUser?.pendingDiamondBatches;
    if (!Array.isArray(batches) || batches.length === 0) return;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [effectiveUser?.pendingDiamondBatches]);

  const myUid = effectiveUser?.uid || effectiveUser?.id;
  const otherUid = selectedChatUser?.uid || selectedChatUser?.id;
  const activeChatId = myUid && otherUid ? buildCanonicalChatId(myUid, otherUid) : '';
  const isFriendActive = Boolean(activeChatId && chatFriendships[activeChatId]);
  const isAIBotChat = otherUid === ALOV_AI_USER.uid || otherUid === 'user_kamola_006' || otherUid === 'ALOV-006';
  const isSenderCharged = canChargeForMessage({
    senderGender: effectiveUser?.gender,
    isAIBot: isAIBotChat,
    isFriendFreeChat: isFriendActive,
    isAdminSender: isAdminTelegramUser(effectiveUser),
  });

  const msgs =
    (activeChatId && chatMessages[activeChatId]) ||
    (otherUid && chatMessages[otherUid]) ||
    [];
  const sortedMessages = mergeUniqueChatMessages(msgs);

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
        prev.map((c) => (c.id === chatId ? { ...c, unreadCount: { ...(c.unreadCount || {}), [uidNow]: 0 } } : c))
      );
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
    if (type === 'text' && !inputMessage.trim()) return;

    const uidNow = effectiveUser?.uid || effectiveUser?.id;
    if (!uidNow) {
      onOpenAuth?.();
      return;
    }

    const text =
      type === 'text'
        ? inputMessage.trim()
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

    if (type === 'text') setInputMessage('');
    setGifBarHideTrigger((n) => n + 1);
    forceScrollToBottomRef.current = true;

    const targetId = selectedChatUser.uid || selectedChatUser.id;
    const isAIBot = targetId === ALOV_AI_USER.uid;
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
      status: 'sending' as 'sending' | 'sent' | 'read',
      read: false,
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current?.emit('typing', { chatId, uid: uidNow, isTyping: false });

    // Optimistically add via unique-ID merge BEFORE socket ack so consecutive GIFs always stay separate and visible
    setChatMessages((prev) => {
      const partnerKeys = [selectedChatUser.id, selectedChatUser.uid, targetId].filter(
        (k): k is string => Boolean(k) && k !== uidNow
      );
      const keys = Array.from(new Set([chatId, ...partnerKeys].filter(Boolean))) as string[];
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = mergeUniqueChatMessages(prev[k], [msgObj]);
      });
      try {
        localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(capMessagesForLocalCache(next[chatId])));
      } catch {}
      return next;
    });

    const coinCost = getMessageCoinCost(type);

    socketRef.current?.emit(
      'send_message',
      { chatId, senderId: uidNow, recipientId: targetId, message: msgObj },
      (ack: any) => {
        if (ack && ack.success === false) {
          setChatMessages((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((k) => {
              if (next[k]) next[k] = next[k].filter((m) => m.id !== msgObj.id);
            });
            try {
              localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(capMessagesForLocalCache(next[chatId] || [])));
            } catch {}
            return next;
          });
          if (ack.error === 'insufficient_coins') {
            const notice = ack.message || `Monetalaringiz yetarli emas! Ushbu xabar narxi ${coinCost} moneta.`;
            if (onOpenTopUp) {
              onOpenTopUp(notice);
            } else if (typeof window !== 'undefined' && window.self !== window.top) {
              window.parent.postMessage({ type: 'ALOV_EMBED_OPEN_TOPUP', message: notice }, '*');
            }
          } else if (ack.message) {
            notifyParentOrToast(ack.message);
          }
          return;
        }
        if (ack && (ack.status === 'sent' || ack.success)) {
          setChatMessages((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((k) => {
              if (next[k]) {
                next[k] = next[k].map((m) => (m.id === msgObj.id ? { ...m, status: 'sent' } : m));
              }
            });
            try {
              localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(capMessagesForLocalCache(next[chatId] || [])));
            } catch {}
            return next;
          });
        }
      }
    );

    setTimeout(() => {
      setChatMessages((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k]) {
            next[k] = next[k].map((m) => (m.id === msgObj.id && m.status === 'sending' ? { ...m, status: 'sent' } : m));
          }
        });
        return next;
      });
    }, 350);

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
      const merged = mergeChatLists([prev, [entry]], uidNow, {
        myAliases: [uidNow, effectiveUser?.id].filter(Boolean) as string[],
        usersList: usersListRef.current,
      });
      try {
        localStorage.setItem('alov_chats_' + uidNow, JSON.stringify(merged));
      } catch {}
      return merged;
    });

    if (isAIBot && type === 'text') {
      setIsAiTyping(true);
    }
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
    return (
      <div
        data-testid="chat-view-list"
        className="flex-1 min-h-0 h-full w-full flex flex-col bg-[#09090D] text-zinc-100 p-3 sm:p-4 overflow-hidden"
      >
        <div className="bg-[#11131C] rounded-[24px] border border-white/[0.08] overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="p-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
            <h2 className="font-editorial text-2xl font-bold text-white">Xabarlar</h2>
            <span className="text-xs font-semibold text-zinc-400 tabular-nums" data-testid="chats-count-badge">
              {chatsList.length} faol suhbat
            </span>
          </div>
          <div
            className="flex-1 min-h-0 divide-y divide-white/[0.06] overflow-y-auto overscroll-y-contain touch-pan-y pb-20"
            data-testid="chats-list-scroll-area"
          >
            {isLoadingChats ? (
              <>
                <ChatSkeleton />
                <ChatSkeleton />
                <ChatSkeleton />
              </>
            ) : chatsList.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="w-16 h-16 bg-white/[0.05] border border-white/[0.08] rounded-full flex items-center justify-center mx-auto">
                  <MessageCircle className="w-8 h-8 text-zinc-500" />
                </div>
                <p className="text-xs text-zinc-400 font-medium">
                  Hozircha xabarlar yo&apos;q. Nomzodlar bilan suhbatni boshlang!
                </p>
              </div>
            ) : (
              chatsList.map((chat, idx) => {
                const uidNow = effectiveUser?.uid || effectiveUser?.id;
                const partnerUid =
                  chat.participants?.find((p: string) => p !== uidNow) || chat.partner?.uid || chat.partner?.id;
                const otherUser =
                  usersList.find((u) => u.uid === partnerUid || u.id === partnerUid) ||
                  (partnerUid === ALOV_AI_USER.uid ? ALOV_AI_USER : null) ||
                  chat.partner || { uid: partnerUid, name: 'Foydalanuvchi' };
                const unread = chat.unreadCount?.[uidNow || ''] || 0;
                const chatAvatar = resolveMediaOrAvatar(resolveEffectiveProfileAvatar(otherUser));

                return (
                  <button
                    type="button"
                    key={chat.id ? `${chat.id}_${idx}` : `chat_${idx}`}
                    onClick={() => handleOpenConversation(otherUser)}
                    className={`w-full text-left p-4 flex items-center space-x-3 cursor-pointer hover:bg-white/[0.04] transition-colors relative ${
                      chat.isAI ? 'bg-rose-500/[0.06]' : ''
                    }`}
                  >
                    <div className="relative shrink-0">
                      {chatAvatar ? (
                        <img
                          src={chatAvatar}
                          alt={otherUser?.name || ''}
                          className="w-12 h-12 rounded-full object-cover border border-white/15"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-300 font-bold text-base flex items-center justify-center border border-rose-500/30">
                          {getSafeUserDisplayName(otherUser, 'F').charAt(0).toUpperCase()}
                        </div>
                      )}
                      {isUserOnlineStrict(otherUser, onlineUserIds) && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#11131C] rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <h3 className="font-bold text-sm text-white truncate">
                            {otherUser?.name || 'Foydalanuvchi'}
                          </h3>
                          {chat.isAI && <span className="text-[10px] font-bold text-rose-400 shrink-0">· AI</span>}
                        </div>
                        <span className="text-[10.5px] text-zinc-500 tabular-nums shrink-0">
                          {chat.updatedAt
                            ? new Date(chat.updatedAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-xs truncate flex-1 pr-2 ${unread > 0 ? 'text-white font-semibold' : 'text-zinc-400'}`}>
                          {chat.isAI && isAiTyping ? (
                            <span className="text-emerald-400 font-semibold">yozmoqda...</span>
                          ) : (
                            chat.lastMessage
                          )}
                        </p>
                        {unread > 0 && (
                          <span className="bg-rose-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 tabular-nums">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  const partnerOnline = isUserOnlineStrict(selectedChatUser, onlineUserIds);
  const partnerAvatar = resolveMediaOrAvatar(resolveEffectiveProfileAvatar(selectedChatUser));

  const progressVal = Number(effectiveUser?.diamondProgress || 0);
  const progressPct = getDiamondProgressPercent(progressVal);
  const pendingBatches = Array.isArray(effectiveUser?.pendingDiamondBatches)
    ? effectiveUser.pendingDiamondBatches
    : [];
  const pendingTotal = getPendingDiamondsTotal(pendingBatches);
  const nextUnlockAt = getNextUnlockTimestamp(pendingBatches);
  const countdown = computeCountdownParts(nextUnlockAt, countdownNow);

  return (
    <div
      data-testid="chat-view-conversation"
      className="flex-1 min-h-0 h-full w-full bg-[#09090D] flex flex-col overflow-hidden text-zinc-100 relative"
    >
      {/* Top Bar */}
      <div className="shrink-0 z-20 px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between bg-[#11131C]">
        <div className="flex items-center space-x-2 min-w-0">
          <button
            type="button"
            aria-label="Suhbatlar ro'yxatiga qaytish"
            onClick={() => setChatView('list')}
            className="p-2 rounded-full hover:bg-white/[0.08] text-zinc-200 transition active:scale-90 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => otherUid && triggerOpenProfile(otherUid, selectedChatUser)}
            className="flex items-center space-x-2.5 min-w-0 text-left hover:opacity-85 transition cursor-pointer"
            title="Profilni ko'rish"
          >
            <div className="relative shrink-0">
              {partnerAvatar ? (
                <img
                  src={partnerAvatar}
                  alt={selectedChatUser?.name || ''}
                  className="w-9 h-9 rounded-full object-cover border border-white/15"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-rose-500/20 text-rose-300 font-bold text-sm flex items-center justify-center border border-rose-500/30">
                  {getSafeUserDisplayName(selectedChatUser, 'F').charAt(0).toUpperCase()}
                </div>
              )}
              {partnerOnline && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#11131C] rounded-full" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-sans font-bold text-sm text-white leading-none truncate">
                {selectedChatUser?.name || 'Foydalanuvchi'}
              </h3>
              <p className={`text-[10.5px] mt-1 ${partnerOnline ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}`}>
                {partnerOnline ? 'tarmoqda' : formatLastSeenUz(selectedChatUser?.lastSeen, false)}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center space-x-1">
          {effectiveUser?.gender === 'female' && !isAIBotChat && (
            <button
              type="button"
              onClick={handleToggleFriendship}
              className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold flex items-center space-x-1 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer ${
                isFriendActive
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
              }`}
            >
              <Handshake className="w-3.5 h-3.5" />
              <span>{isFriendActive ? "Do'stlashilgan" : "Do'stlashish"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => selectedChatUser && triggerOpenGift(selectedChatUser)}
            title="Sovg'a yuborish"
            aria-label="Sovg'a yuborish"
            className="p-2 rounded-full hover:bg-amber-500/15 text-amber-400 transition active:scale-90 cursor-pointer"
          >
            <Gift className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => selectedChatUser && triggerStartCall(selectedChatUser)}
            title="Video qo'ng'iroq"
            aria-label="Video qo'ng'iroq"
            className="p-2 rounded-full hover:bg-rose-500/15 text-rose-400 transition active:scale-90 cursor-pointer"
          >
            <Video className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Pricing / Earnings Strip */}
      {isFriendActive && !isAIBotChat ? (
        <div className="bg-emerald-500/15 border-b border-emerald-500/25 text-emerald-200 px-3.5 py-1.5 text-[10.5px] font-semibold flex items-center justify-between shrink-0">
          <span>Do&apos;stlashish faol — Yigitdan moneta yechilmaydi</span>
          <span className="text-emerald-300 font-bold whitespace-nowrap">Bepul chat</span>
        </div>
      ) : effectiveUser?.gender === 'female' ? (
        <div className="bg-cyan-500/10 border-b border-cyan-500/20 text-cyan-200 px-3.5 py-1.5 text-[10.5px] font-semibold flex items-center justify-between shrink-0">
          <span>💎 Har bir javobingiz uchun +{MESSAGE_DIAMOND_REWARD} Almaz limitga qo&apos;shiladi</span>
          <span className="font-mono text-cyan-300 font-bold whitespace-nowrap tabular-nums">
            Wallet: {formatDiamondsDisplay(effectiveUser?.diamonds)}
          </span>
        </div>
      ) : !isAIBotChat ? (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-200 px-3.5 py-1.5 text-[10.5px] font-semibold flex items-center justify-between gap-2 shrink-0">
          <span className="truncate">
            🪙 Xabar/GIF/Rasm: {MESSAGE_COIN_COST} · Ovozli: {VOICE_MESSAGE_COIN_COST} · Audio/Video: {MEDIA_FILE_COIN_COST}
          </span>
          <span className="font-mono text-amber-300 font-bold whitespace-nowrap tabular-nums shrink-0" data-testid="chat-coin-balance">
            Balans: {effectiveUser?.coins ?? 100}
          </span>
        </div>
      ) : null}

      {/* Scrollable Messages Viewport */}
      <div
        ref={chatMessagesContainerRef}
        onScroll={handleMessagesScroll}
        data-testid="chat-messages-scroll-area"
        style={{ WebkitOverflowScrolling: 'touch' }}
        className="flex-1 min-h-0 px-3.5 py-3 overflow-y-auto overscroll-y-contain touch-pan-y space-y-2.5 bg-[#09090D]"
      >
        {sortedMessages.map((msg, idx) => {
          const isMe = msg.senderId === 'me' || (myUid && (msg.senderId === myUid || msg.userId === myUid));
          const rawMediaUrl = msg.fileUrl || (msg.type === 'gif' ? msg.content : '') || '';
          const resolvedUrl = rawMediaUrl.startsWith('/api/') ? `${apiOrigin}${rawMediaUrl}` : rawMediaUrl;
          const frameless = isFramelessChatMediaType(msg);
          const isDefaultMediaText =
            !msg.text ||
            ['GIF', 'Rasm 🖼️', 'Rasm', 'Video 🎥', 'Video'].includes(String(msg.text).trim());

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
                  {msg.type === 'video' ? (
                    <div className="relative rounded-2xl overflow-hidden">
                      <VideoPlayer url={resolvedUrl} />
                      {/* Timestamp pill top-right so bottom native video controls remain clear */}
                      <div className="pointer-events-none absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white flex items-center gap-1">
                        <span className="text-[9.5px] tabular-nums">{msg.time}</span>
                        {isMe && (
                          <span className="flex items-center shrink-0">
                            {msg.status === 'sending' ? (
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
                            {msg.status === 'sending' ? (
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
                  className={`max-w-[85%] rounded-[18px] relative px-4 py-2.5 ${
                    isMe
                      ? 'bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white rounded-tr-none shadow-md shadow-rose-950/30'
                      : 'bg-[#151824] text-zinc-100 border border-white/[0.08] rounded-tl-none'
                  }`}
                >
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
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                  )}

                  <div className="flex items-center justify-end space-x-1 mt-1">
                    <span className={`text-[9.5px] tabular-nums ${isMe ? 'text-rose-100/80' : 'text-zinc-500'}`}>
                      {msg.time}
                    </span>
                    {isMe && (
                      <span className="flex items-center ml-1 shrink-0">
                        {msg.status === 'sending' ? (
                          <Clock className="w-3 h-3 text-rose-200/90 animate-pulse" />
                        ) : msg.status === 'read' || msg.read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-cyan-200" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-rose-200" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
          className="absolute right-4 bottom-20 z-30 w-9 h-9 rounded-full bg-[#1C1F2E] hover:bg-[#262A3E] border border-white/15 text-zinc-100 shadow-lg flex items-center justify-center transition active:scale-90 cursor-pointer"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Female Diamond Limit Strip */}
      {effectiveUser?.gender === 'female' && (
        <div className="bg-[#11131C] border-t border-white/[0.08] px-3.5 pt-2 pb-1.5 shrink-0 space-y-1">
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

      {/* Bottom Input / Media Picker / GIF Bar / Dictaphone */}
      <div className="shrink-0 z-20 px-3 pt-2 pb-2.5 bg-[#11131C] border-t border-white/[0.08] flex flex-col">
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
            className="flex items-center gap-2.5 w-full bg-[#181B29] border border-rose-500/40 rounded-[22px] px-2.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => finishRecording(true)}
              data-testid="dictaphone-cancel-btn"
              aria-label="Ovozli xabarni bekor qilish"
              title="Bekor qilish"
              className="p-2 rounded-full bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 transition active:scale-90 cursor-pointer shrink-0"
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
              <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/25 shrink-0">
                {VOICE_MESSAGE_COIN_COST} 🪙
              </span>
            )}

            <button
              type="button"
              onClick={() => finishRecording(false)}
              data-testid="dictaphone-send-btn"
              aria-label="Ovozli xabarni yuborish"
              title="Ovozli xabarni yuborish"
              className="bg-[#E11D48] hover:bg-[#BE123C] text-white p-2.5 rounded-full shadow-lg transition active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-end space-x-2 w-full">
            <button
              type="button"
              onClick={() => setShowChatMediaPicker((prev) => !prev)}
              aria-label="Media yuklash"
              data-testid="toggle-chat-media-picker"
              className={`p-2.5 rounded-full transition active:scale-90 cursor-pointer shrink-0 ${
                showChatMediaPicker
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
              }`}
            >
              <Plus className={`w-5 h-5 transition-transform ${showChatMediaPicker ? 'rotate-45' : ''}`} />
            </button>
            <div className="flex-1 relative">
              <textarea
                placeholder="Xabar yozing..."
                rows={1}
                value={inputMessage}
                onFocus={() => {
                  if (isUserNearBottomRef.current) {
                    setTimeout(() => {
                      const el = chatMessagesContainerRef.current;
                      if (el) el.scrollTop = el.scrollHeight;
                    }, 120);
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
                className="w-full px-4 py-2.5 rounded-[20px] bg-[#181B29] border border-white/[0.08] text-[13px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-500 resize-none max-h-32"
              />
            </div>
            {inputMessage.trim() ? (
              <button
                type="button"
                aria-label="Xabarni yuborish"
                data-testid="chat-send-text-btn"
                onClick={() => void handleSendMessage()}
                className="bg-[#E11D48] text-white p-3 rounded-full shadow-lg hover:bg-[#BE123C] transition-all active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
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
                className="p-3 rounded-full transition-all active:scale-95 flex items-center justify-center cursor-pointer bg-white/[0.07] text-zinc-300 hover:bg-rose-500/20 hover:text-rose-300 shrink-0"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Image Fullscreen Lightbox */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxImageUrl(null);
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxImageUrl(null)}
            aria-label="Yopish"
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
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
