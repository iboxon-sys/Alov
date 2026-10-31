/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Heart, Flame, Radio, MessageCircle, User as UserIcon, Sparkles, Video, 
  MapPin, Send, Mic, Play, Plus, Users, Eye, ThumbsUp, Smartphone, 
  ChevronRight, X, ArrowUpRight, ShieldCheck, Globe, LogIn, LogOut, CheckCircle2, Edit3, ArrowLeft, VideoOff,
  ZoomIn, ZoomOut, Move, Crop, AlertTriangle, RefreshCw, Navigation, Shield, Lock, EyeOff, Car, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LandingPage } from './LandingPage';
import { LiveStreamModal } from './components/LiveStreamModal';
import { AudioRoomModal } from './components/AudioRoomModal';
import { VideoPlayer, VoiceMessage } from './components/ChatMedia';
import { CandidateSkeleton, ChatSkeleton } from './components/Skeleton';
import { 
  auth, googleProvider, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, 
  setPersistence, browserLocalPersistence, User
} from './firebase';
import { getApiUrl, getBaseUrl } from './config/api';
import { io, Socket } from 'socket.io-client';

/** Utility for Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// High Precision GPS Options: Forces device physical GPS chip rather than coarse IP
const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0
};

// --- Uzbekistan Location Data (All 14 Regions and Districts) ---
const UZ_LOCATIONS: Record<string, string[]> = {
  "Toshkent shahri": [
    "Yunusobod tumani", "Mirzo Ulug'bek tumani", "Chilonzor tumani", "Yakkasaroy tumani", 
    "Mirobod tumani", "Shayxontohur tumani", "Uchtepa tumani", "Sergeli tumani", 
    "Bektemir tumani", "Olmazor tumani", "Yangihayot tumani"
  ],
  "Toshkent viloyati": [
    "Chirchiq shahri", "Angren shahri", "Olmaliq shahri", "Yangiyo'l shahri", 
    "Bekobod shahri", "Parkent tumani", "Bo'stonliq tumani", "Zangiota tumani", "Qibray tumani"
  ],
  "Samarqand viloyati": [
    "Samarqand shahri", "Urgut tumani", "Kattaqo'rg'on shahri", "Bulung'ur tumani", 
    "Jomboy tumani", "Ishtixon tumani", "Payariq tumani", "Narpay tumani"
  ],
  "Farg'ona viloyati": [
    "Farg'ona shahri", "Marg'ilon shahri", "Qo'qon shahri", "Rishton tumani", 
    "Quva tumani", "Bag'dod tumani", "Beshariq tumani", "Oltiariq tumani"
  ],
  "Andijon viloyati": [
    "Andijon shahri", "Xonobod shahri", "Asaka tumani", "Shahrixon tumani", 
    "Xo'jaobod tumani", "Buloqboshi tumani", "Marhamat tumani", "Oltinko'l tumani"
  ],
  "Namangan viloyati": [
    "Namangan shahri", "Chust tumani", "Kosonsoy tumani", "Uychi tumani", 
    "Mingbuloq tumani", "Pop tumani", "To'raqo'rg'on tumani", "Chortoq tumani"
  ],
  "Buxoro viloyati": [
    "Buxoro shahri", "Kogon shahri", "G'ijduvon tumani", "Vobkent tumani", 
    "Jondor tumani", "Olot tumani", "Peshku tumani"
  ],
  "Navoiy viloyati": [
    "Navoiy shahri", "Zarafshon shahri", "Karmana tumani", "Nurota tumani", 
    "Qiziltepa tumani", "Xatirchi tumani", "Konimex tumani"
  ],
  "Jizzax viloyati": [
    "Jizzax shahri", "G'allaorol tumani", "Zomin tumani", "Paxtakor tumani", 
    "Dustlik tumani", "Baxmal tumani", "Zarbdor tumani"
  ],
  "Sirdaryo viloyati": [
    "Guliston shahri", "Yangiyer shahri", "Shirin shahri", "Sirdaryo tumani", 
    "Boyovut tumani", "Mirzaobod tumani", "Sardoba tumani"
  ],
  "Qashqadaryo viloyati": [
    "Qarshi shahri", "Shahrisabz shahri", "Kitob tumani", "G'uzor tumani", 
    "Qamashi tumani", "Kasbi tumani", "Koson tumani", "Dehqonobod tumani"
  ],
  "Surxondaryo viloyati": [
    "Termiz shahri", "Denov tumani", "Sherobod tumani", "Jarqo'rg'on tumani", 
    "Qumqo'rg'on tumani", "Angor tumani", "Sariosiyo tumani", "Uzun tumani"
  ],
  "Xorazm viloyati": [
    "Urganch shahri", "Xiva shahri", "Shovot tumani", "Gurlan tumani", 
    "Xonqa tumani", "Yangiariq tumani", "Yangibozor tumani"
  ],
  "Qoraqalpog'iston Respublikasi": [
    "Nukus shahri", "To'rtko'l tumani", "Beruniy tumani", "Chimboy tumani", 
    "Xo'jayli tumani", "Qo'ng'irot tumani", "Mo'ynoq tumani", "Ellikqal'a tumani"
  ]
};

const ALOV_AI_USER = {
  uid: 'alov_ai_bot',
  id: 'ALOV-AI',
  name: 'Alov AI',
  avatar: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
  bio: 'Sizning samimiy va mehribon virtual suhbatdoshingiz. Sevgi va munosabatlar haqida gaplashamizmi? 😊✨',
  status: 'online',
  isAI: true
};

const APP_VERSION = '1.1.1';
const LATEST_VERSION = '1.1.1';

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  if (url.includes('youtube.com/shorts/')) {
    const id = url.split('youtube.com/shorts/')[1]?.split('?')[0];
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1`;
  }
  if (url.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1]?.split('?')[0];
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1`;
  }
  if (url.includes('youtube.com/watch')) {
    try {
      const urlObj = new URL(url);
      const id = urlObj.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1`;
    } catch(e) {}
  }
  return null;
}

function getGpsErrorMessage(error: any): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Iltimos, brauzer va telefoningiz sozlamalarida GPS/Lokatsiyaga ruxsat bering!";
    case error.POSITION_UNAVAILABLE:
      return "GPS ma'lumotlarini olish imkoni bo'lmadi.";
    case error.TIMEOUT:
      return "GPS so'rovi vaqti tugadi.";
    default:
      return "GPS xatoligi yuz berdi.";
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('landing');

  // Firebase Auth State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Profile Form Fields (including Avatar URL and Location Visibility)
  const [regName, setRegName] = useState('');
  const [regAge, setRegAge] = useState('22');
  const [regGender, setRegGender] = useState<'male' | 'female'>('female');
  const [regRegion, setRegRegion] = useState('Toshkent shahri');
  const [regDistrict, setRegDistrict] = useState('Yunusobod tumani');
  const [regNeighborhood, setRegNeighborhood] = useState('Bodomzor');
  const [regPhone, setRegPhone] = useState('+99890');
  const [regTelegram, setRegTelegram] = useState('');
  const [regInstagram, setRegInstagram] = useState('');
  const [regBio, setRegBio] = useState('Alov.uz da yangi tanishuvlar va suhbatlar uchun.');
  const [regAvatar, setRegAvatar] = useState('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600');
  const [regLocationVisibility, setRegLocationVisibility] = useState<'everyone' | 'mutual' | 'ghost'>('mutual');

  // Safety Liability Disclaimer Modal (10s Countdown)
  const [showLiabilityModal, setShowLiabilityModal] = useState(false);
  const [liabilityCountdown, setLiabilityCountdown] = useState(10);
  const timerRef = useRef<any>(null);

  // Avatar Image Cropper State
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropScale, setCropScale] = useState<number>(1);
  const [cropPan, setCropPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [usersList, setUsersList] = useState<any[]>([]);
  const [chatsList, setChatsList] = useState<any[]>([]);
  const [filterRegion, setFilterRegion] = useState('Barchasi');
  const [filterDistrict, setFilterDistrict] = useState('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  // OSRM Street Routing State
  const [activeRouteUser, setActiveRouteUser] = useState<any | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: string; durationMin: number } | null>(null);
  const mapPolylineRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, any>>({});

  // Chat view substate: 'list' or 'conversation'
  const [chatView, setChatView] = useState<'list' | 'conversation'>('list');

  // Live Stream (Jonli Efir) states
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [liveModalMode, setLiveModalMode] = useState<'broadcaster' | 'viewer'>('broadcaster');
  const [activeLiveStreamId, setActiveLiveStreamId] = useState<string | undefined>(undefined);
  const [activeLiveHostUser, setActiveLiveHostUser] = useState<any | undefined>(undefined);

  // Audio Room (Ovozli xona) states
  const [showAudioRoomModal, setShowAudioRoomModal] = useState(false);
  const [audioRoomCode, setAudioRoomCode] = useState<string>('alov_general_room');
  const [audioRoomTitle, setAudioRoomTitle] = useState<string>('Alov.uz Jonli Ovozli Xona 🎙️');

  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [roomList, setRoomList] = useState<any[]>([]);

  const [selectedChatUser, setSelectedChatUser] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, any[]>>({});
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);

  // Reels / Efirlar feed index & Touch Swipe & Live Chat
  const [currentReelIndex, setCurrentReelIndex] = useState(0);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [reelComments, setReelComments] = useState<Record<string, any[]>>({});
  const [reelCommentInput, setReelCommentInput] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);

  // Real GPS Geolocation & Ghost Mode state
  const [isLocationEnabled, setIsLocationEnabled] = useState<boolean>(false);
  const [geoWatchId, setGeoWatchId] = useState<number | null>(null);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number, accuracy?: number}>({ lat: 41.2995, lng: 69.2401, accuracy: 20 });
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string>('');
  const [activeUsersCount, setActiveUsersCount] = useState<number>(1);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(getBaseUrl());
    socketRef.current = socket;

    socket.on('connect', () => {
      const myUid = currentUser?.uid || firebaseUser?.uid;
      if (myUid) {
        socket.emit('register_user', myUid);
      }
    });

    socket.on('active_users_count', ({ count }: { count: number }) => {
      if (typeof count === 'number' && count > 0) {
        setActiveUsersCount(count);
      }
    });

    const handleIncomingChatMessage = (payload: any) => {
      const msg = payload.message || payload;
      const chatId = payload.chatId;
      const myUid = currentUser?.uid || firebaseUser?.uid;

      let partnerId = payload.senderId === myUid ? payload.recipientId : payload.senderId;
      if (!partnerId && msg.senderId) {
        partnerId = msg.senderId === myUid ? payload.recipientId : msg.senderId;
      }
      if (!partnerId && selectedChatUser) {
        partnerId = selectedChatUser.uid || selectedChatUser.id;
      }

      if (!partnerId && !chatId) return;

      const newMsg = {
        ...msg,
        time: msg.time || new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages(prev => {
        const key = chatId || partnerId;
        const currentMsgs = prev[key] || (partnerId ? prev[partnerId] : []) || [];
        if (currentMsgs.some(m => m.id === newMsg.id)) return prev;

        const updatedMsgs = [...currentMsgs, newMsg];
        if (chatId) {
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(updatedMsgs));
          } catch (e) {}
        }

        const next = { ...prev };
        if (chatId) next[chatId] = updatedMsgs;
        if (partnerId) next[partnerId] = updatedMsgs;
        if (payload.senderId) next[payload.senderId] = updatedMsgs;
        if (payload.recipientId) next[payload.recipientId] = updatedMsgs;
        return next;
      });

      // Update chatsList so this chat never disappears
      if (chatId) {
        setChatsList(prev => {
          const existingIdx = prev.findIndex(c => c.id === chatId);
          let updated = [...prev];
          const lastMsg = msg.text || (msg.type === 'image' ? 'Rasm 🖼️' : 'Xabar');
          if (existingIdx > -1) {
            const item = { ...updated[existingIdx], lastMessage: lastMsg, updatedAt: msg.createdAt || new Date().toISOString() };
            updated.splice(existingIdx, 1);
            updated.unshift(item);
          } else {
            updated.unshift({
              id: chatId,
              participants: [myUid, partnerId].filter(Boolean),
              lastMessage: lastMsg,
              updatedAt: msg.createdAt || new Date().toISOString()
            });
          }
          if (myUid) {
            try {
              localStorage.setItem('alov_chats_' + myUid, JSON.stringify(updated));
            } catch (e) {}
          }
          return updated;
        });
      }

      if (msg.senderId === ALOV_AI_USER.uid || msg.senderId === 'user_kamola_006' || msg.senderId === 'ALOV-006') {
        setIsAiTyping(false);
      }
    };

    socket.on('receive_message', handleIncomingChatMessage);
    socket.on('chat:message', handleIncomingChatMessage);

    socket.on('user_typing', ({ uid, isTyping }) => {
      if (selectedChatUser && (selectedChatUser.uid === uid || selectedChatUser.id === uid)) {
        setIsOtherTyping(isTyping);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('active_users_count');
      socket.off('receive_message', handleIncomingChatMessage);
      socket.off('chat:message', handleIncomingChatMessage);
      socket.off('user_typing');
      socket.disconnect();
    };
  }, []);

  // Register user on socket when auth state changes
  useEffect(() => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (myUid && socketRef.current) {
      socketRef.current.emit('register_user', myUid);
    }
  }, [currentUser?.uid, firebaseUser?.uid]);

  // Join active conversation room on socket
  useEffect(() => {
    if (!selectedChatUser) return;
    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = selectedChatUser.uid || selectedChatUser.id;
    if (myUid && otherUid && socketRef.current) {
      const chatId = [myUid, otherUid].sort().join('_');
      socketRef.current.emit('join_chat', chatId);
    }
  }, [selectedChatUser, currentUser?.uid, firebaseUser?.uid, chatView]);

  // Ensure persistent Auth session across browser reloads
  useEffect(() => {
    // Check version for backward compatibility
    if (APP_VERSION !== LATEST_VERSION) {
      setShowUpdateBanner(true);
    }

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        console.log("Auth persistence set to local");
      })
      .catch((err) => {
        console.warn("Auth persistence error:", err);
      });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Safety Timeout Fallback to prevent infinite loading ("Sessiya tiklanmoqda...")
  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsAuthChecking((prev) => {
        if (prev) {
          console.warn("Auth check timed out after 4s, forcing isAuthChecking to false.");
          return false;
        }
        return prev;
      });
    }, 4000);
    return () => clearTimeout(timeout);
  }, []);

  // Foydalanuvchi hisobini Render server va Lokal kesh bilan sinxronizatsiya qilish (Zero Firestore)
  const syncUserWithBackend = async (user: User) => {
    try {
      let userData: any = null;

      // 1. Ushbu qurilmaning Lokal keshidan qidirish (eski profilni tiklash)
      try {
        const cached = localStorage.getItem('alov_user_' + user.uid);
        if (cached) {
          userData = JSON.parse(cached);
          userData.status = 'online';
          userData.uid = user.uid;
        }
      } catch (e) {}

      // 2. Agar profil mavjud bo'lmasa, yangi profil obyektini shakllantirish
      if (!userData) {
        userData = {
          uid: user.uid,
          id: `ALOV-${user.uid.slice(0, 5).toUpperCase()}`,
          name: user.displayName || 'Alov Foydalanuvchisi',
          email: user.email || '',
          avatar: user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600',
          role: 'user',
          age: 22,
          gender: 'female',
          region: 'Toshkent shahri',
          district: 'Yunusobod tumani',
          bio: 'Alov.uz da yangi tanishuvlar va suhbatlar uchun.',
          status: 'online',
          isLocationEnabled: true,
          locationVisibility: 'everyone',
          location: { lat: 41.3111, lng: 69.2797 }
        };
      }

      // 3. Render serveriga sinxronizatsiya qilish
      try {
        const res = await fetch(getApiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userData })
        });
        const data = await res.json();
        if (data.success && data.user) {
          userData = data.user;
        }
      } catch (e) {
        console.warn("Backend user sync offline fallback:", e);
      }

      // Har doim lokal keshni yangilab qo'yish
      try {
        localStorage.setItem('alov_user_' + user.uid, JSON.stringify(userData));
      } catch (e) {}

      setCurrentUser(userData);
      
      // Anketani to'ldirish maydonlarini yangilash
      setRegName(userData.name || '');
      setRegAge(String(userData.age || 22));
      setRegGender(userData.gender || 'female');
      setRegRegion(userData.region || 'Toshkent shahri');
      setRegDistrict(userData.district || 'Yunusobod tumani');
      setRegBio(userData.bio || '');
      setRegAvatar(userData.avatar || '');
      setRegLocationVisibility(userData.locationVisibility || 'everyone');
      setIsLocationEnabled(userData.isLocationEnabled !== false);

      setShowAuthModal(false);
      setActiveTab(prev => (prev === 'landing' ? 'discover' : prev));
      return userData;
    } catch (err: any) {
      console.error("User sync error:", err);
    } finally {
      setIsAuthChecking(false);
    }
  };

  // Listen for Google Sign In Redirect Result on page mount
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          await syncUserWithBackend(result.user);
          setShowAuthModal(false);
          setActiveTab('discover');
        }
      })
      .catch((err: any) => {
        console.error("Get Redirect Result Error:", err);
        if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
          setErrorMsg(err.message || "Google orqali kirishda xatolik yuz berdi.");
        }
      });
  }, []);

  // Synchronize Auth State & Real-time Presence
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setFirebaseUser(user);
        if (user) {
          await syncUserWithBackend(user);
          
          // Update status on beforeunload via sendBeacon / fetch keepalive
          const handleOffline = () => {
            if (auth.currentUser) {
              fetch(getApiUrl('/api/users/update'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: auth.currentUser.uid, updates: { status: 'offline' } }),
                keepalive: true
              }).catch(() => {});
            }
          };
          window.addEventListener('beforeunload', handleOffline);
          return () => {
            window.removeEventListener('beforeunload', handleOffline);
            handleOffline();
          };
        } else {
          setCurrentUser(null);
          setIsAuthChecking(false);
        }
      } catch (err) {
        console.error("Auth state change error:", err);
        setIsAuthChecking(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time users loader from Render server & Socket.io (Zero Firestore)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(getApiUrl('/api/users'));
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setUsersList(data.users);
          setIsLoadingCandidates(false);
        }
      } catch (err) {
        console.warn("Could not fetch users from server:", err);
        setIsLoadingCandidates(false);
      }
    };
    fetchUsers();

    const socket = io(getBaseUrl());
    socket.on('user_updated', (updatedUser: any) => {
      setUsersList(prev => {
        const userMap = new Map<string, any>();
        prev.forEach(u => userMap.set(u.uid || u.id, u));
        userMap.set(updatedUser.uid || updatedUser.id, updatedUser);
        return Array.from(userMap.values());
      });
    });

    socket.on('stream_started', (streamData: any) => {
      setUsersList(prev => prev.map(u => {
        if (u.uid === streamData.hostUid) {
          return { ...u, isLive: true, liveStreamId: streamData.id, liveTitle: streamData.title };
        }
        return u;
      }));
    });

    socket.on('stream_stopped', ({ hostUid }: { hostUid: string }) => {
      setUsersList(prev => prev.map(u => {
        if (u.uid === hostUid) {
          return { ...u, isLive: false, liveStreamId: null, liveTitle: null };
        }
        return u;
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Load real active audio party rooms from Render server (Zero mock rooms)
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch(getApiUrl('/api/audio-rooms'));
        const data = await res.json();
        if (data.success && Array.isArray(data.rooms)) {
          setRoomList(data.rooms);
        }
      } catch (err) {
        console.warn("Could not fetch audio rooms:", err);
      }
    };
    fetchRooms();

    const socket = io(getBaseUrl());
    socket.on('audio_room_created', (newRoom: any) => {
      setRoomList(prev => [...prev.filter(r => r.code !== newRoom.code), newRoom]);
    });
    socket.on('audio_room_deleted', ({ roomCode }: { roomCode: string }) => {
      setRoomList(prev => prev.filter(r => r.code !== roomCode));
    });
    socket.on('audio_room_closed', ({ roomCode }: { roomCode: string }) => {
      setRoomList(prev => prev.filter(r => r.code !== roomCode));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Load active 1-on-1 chats from Render API & localStorage (No Firestore)
  useEffect(() => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid) return;

    const fetchChats = async () => {
      let serverChats: any[] = [];
      try {
        const res = await fetch(getApiUrl(`/api/chats/user/${myUid}`));
        const data = await res.json();
        if (data.success && Array.isArray(data.chats)) {
          serverChats = data.chats;
        }
      } catch (e) {
        console.warn("Could not fetch chats from server:", e);
      }

      // Merge with cached local chats
      let localChats: any[] = [];
      try {
        const cached = localStorage.getItem('alov_chats_' + myUid);
        if (cached) localChats = JSON.parse(cached);
      } catch (e) {}

      const chatMap = new Map<string, any>();
      [...localChats, ...serverChats].forEach(c => chatMap.set(c.id, c));
      const combined = Array.from(chatMap.values());

      // Always prepend Alov AI to the chat list
      const aiChatId = [myUid, ALOV_AI_USER.uid].sort().join('_');
      const hasAiChat = combined.some(c => c.id === aiChatId);

      let finalChats = [...combined];
      if (!hasAiChat) {
        finalChats.unshift({
          id: aiChatId,
          participants: [myUid, ALOV_AI_USER.uid],
          lastMessage: "Salom! Men Alov AI. Suhbatlashamizmi? 😊",
          updatedAt: new Date().toISOString(),
          isAI: true
        });
      } else {
        const aiIndex = finalChats.findIndex(c => c.id === aiChatId);
        if (aiIndex > -1) {
          const aiChat = finalChats.splice(aiIndex, 1)[0];
          finalChats.unshift({ ...aiChat, isAI: true });
        }
      }

      setChatsList(finalChats);
      setIsLoadingChats(false);
    };

    fetchChats();
  }, [firebaseUser, currentUser]);

  // Load chat messages for the selected conversation from localStorage & Render API
  useEffect(() => {
    if (!selectedChatUser || chatView !== 'conversation') return;
    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = selectedChatUser.uid || selectedChatUser.id;
    if (!myUid || !otherUid) return;

    const chatId = [myUid, otherUid].sort().join('_');

    // 1. Load from localStorage
    let localMsgs: any[] = [];
    try {
      const cached = localStorage.getItem('alov_msgs_' + chatId);
      if (cached) localMsgs = JSON.parse(cached);
    } catch (e) {}

    if (localMsgs.length > 0) {
      setChatMessages(prev => ({ ...prev, [selectedChatUser.id]: localMsgs }));
    }

    // 2. Sync from Render API
    fetch(getApiUrl(`/api/chats/${chatId}/messages`))
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.messages)) {
          const msgMap = new Map<string, any>();
          [...localMsgs, ...data.messages].forEach(m => msgMap.set(m.id, m));
          const merged = Array.from(msgMap.values()).sort((a, b) => 
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
          );
          setChatMessages(prev => ({ ...prev, [selectedChatUser.id]: merged }));
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(merged));
          } catch (e) {}
        }
      })
      .catch(err => console.warn("Failed to sync chat messages from Render server:", err));

  }, [firebaseUser, currentUser, selectedChatUser, chatView]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatView === 'conversation') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatView]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { 
            lat: pos.coords.latitude, 
            lng: pos.coords.longitude, 
            accuracy: pos.coords.accuracy 
          };
          setUserCoords(coords);
          setIsLocationEnabled(true);
          setGpsStatusMsg('');
          if (firebaseUser) {
            fetch(getApiUrl('/api/users/update'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uid: firebaseUser.uid,
                updates: {
                  location: coords,
                  isLocationEnabled: true,
                  isOnline: true
                }
              })
            }).catch(() => {});
          }
        },
        (err) => {
          console.warn("GPS detection error:", err);
          setGpsStatusMsg(getGpsErrorMessage(err));
        },
        GPS_OPTIONS
      );

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = { 
            lat: pos.coords.latitude, 
            lng: pos.coords.longitude, 
            accuracy: pos.coords.accuracy 
          };
          setUserCoords(coords);
          setIsLocationEnabled(true);
          if (firebaseUser) {
            fetch(getApiUrl('/api/users/update'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uid: firebaseUser.uid,
                updates: {
                  location: coords,
                  isLocationEnabled: true,
                  isOnline: true
                }
              })
            }).catch(() => {});
          }
        },
        (err) => {
          console.warn("GPS watch error:", err);
        },
        GPS_OPTIONS
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setGpsStatusMsg("Qurilmangiz geolokatsiyani (GPS) qo'llab-quvvatlamaydi.");
    }
  }, [firebaseUser]);


  // Handle Privacy-Protected Route Calculation to a target user
  const handleDrawRouteToUser = (targetUser: any) => {
    if (!userCoords?.lat || !userCoords?.lng || !isLocationEnabled) {
      alert("Marshrut chizish uchun avval o'zingizning GPS lokatsiyangizni yoqing!");
      return;
    }
    if (!targetUser || !targetUser.location?.lat || !targetUser.location?.lng) {
      alert("Ushbu foydalanuvchining lokatsiyasi mavjud emas.");
      return;
    }

    // Privacy Guard Check
    const vis = targetUser.locationVisibility || 'mutual';
    if (vis === 'ghost' || targetUser.isLocationEnabled === false) {
      alert("Bu foydalanuvchi o'z lokatsiyasini yashirgan (Ghost Mode). Marshrut chizib bo'lmaydi.");
      return;
    }

    const isFollowed = followingIds.includes(targetUser.id) || followingIds.includes(targetUser.uid);
    if (vis === 'mutual' && !isFollowed) {
      alert("🔒 Bu foydalanuvchi o'z lokatsiyasi va marshrutini faqat o'zi obuna bo'lgan tanishlariga ko'rsatadi. Iltimos, avval unga obuna bo'ling!");
      return;
    }

    // Allowed! Set active route target and switch to map tab
    setActiveRouteUser(targetUser);
    setActiveTab('map');
  };

  // Listen to Custom Map Marker Click Events
  useEffect(() => {
    const handleOpenProfile = (e: any) => {
      const userId = e.detail;
      const found = usersList.find(u => u.id === userId || u.uid === userId);
      if (found) {
        setSelectedProfile(found);
      }
    };
    const handleDrawRoute = (e: any) => {
      const userId = e.detail;
      const found = usersList.find(u => u.id === userId || u.uid === userId);
      if (found) {
        handleDrawRouteToUser(found);
      }
    };
    const handleWatchLive = (e: any) => {
      const userId = e.detail;
      const found = usersList.find(u => u.id === userId || u.uid === userId);
      if (found) {
        setActiveLiveHostUser(found);
        setActiveLiveStreamId(found.liveStreamId || ('stream_' + (found.uid || found.id)));
        setLiveModalMode('viewer');
        setShowLiveModal(true);
      }
    };

    window.addEventListener('alov-open-user-profile', handleOpenProfile);
    window.addEventListener('alov-draw-route-to-user', handleDrawRoute);
    window.addEventListener('alov-watch-live-stream', handleWatchLive);
    return () => {
      window.removeEventListener('alov-open-user-profile', handleOpenProfile);
      window.removeEventListener('alov-draw-route-to-user', handleDrawRoute);
      window.removeEventListener('alov-watch-live-stream', handleWatchLive);
    };
  }, [usersList, followingIds, userCoords, isLocationEnabled]);

  // OSRM Real Street Polyline Generator on Leaflet Map
  useEffect(() => {
    if (activeTab === 'map' && activeRouteUser && activeRouteUser.location?.lat && mapInstanceRef.current) {
      const L = (window as any).L;
      if (!L) return;

      if (mapPolylineRef.current) {
        mapPolylineRef.current.remove();
        mapPolylineRef.current = null;
      }

      const originLng = userCoords.lng;
      const originLat = userCoords.lat;
      const destLng = activeRouteUser.location.lng;
      const destLat = activeRouteUser.location.lat;

      fetch(`https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const latLngs = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

            const polyline = L.polyline(latLngs, {
              color: '#E8474A',
              weight: 6,
              opacity: 0.9,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(mapInstanceRef.current);

            mapPolylineRef.current = polyline;
            mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });

            const distKm = (route.distance / 1000).toFixed(1);
            const durationMin = Math.round(route.duration / 60);
            setRouteInfo({ distanceKm: distKm, durationMin });
          }
        })
        .catch(err => {
          console.error("OSRM Route Error:", err);
        });
    }
  }, [activeTab, activeRouteUser, userCoords]);


  // Real-time Leaflet Map Marker Sync Effect (Flicker-free Optimization)
  useEffect(() => {
    if (activeTab !== 'map' || !mapInstanceRef.current) return;

    import('leaflet').then(L => {
      const map = mapInstanceRef.current;
      if (!map) return;

      // 1. Sync User Marker ('me')
      if (userCoords?.lat && userCoords?.lng && isLocationEnabled) {
        const userIcon = L.divIcon({
          className: 'custom-user-marker',
          html: `<div class="relative w-[38px] h-[38px] flex items-center justify-center">
            <div class="pulse-ring"></div>
            <div style="background:#E8474A;width:32px;height:32px;border-radius:50%;border:3px solid white;box-shadow:0 4px 14px rgba(232,71,74,0.6);display:flex;align-items:center;justify-center;color:white;font-weight:bold;font-size:14px;position:relative;z-index:2;">📍</div>
          </div>`,
          iconSize: [38, 38]
        });

        if (!markersRef.current['me']) {
          markersRef.current['me'] = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon }).addTo(map);
        } else {
          markersRef.current['me'].setLatLng([userCoords.lat, userCoords.lng]);
        }
      } else if (markersRef.current['me']) {
        markersRef.current['me'].remove();
        delete markersRef.current['me'];
      }

      // 2. Sync Other Users
      const myUid = currentUser?.uid || firebaseUser?.uid;
      const activeUsers = usersList.filter(u => {
        if (myUid && (u.uid === myUid || u.id === myUid)) return false;
        const hasCoords = u.location && u.location.lat != null && u.location.lng != null;
        return hasCoords && u.locationVisibility !== 'ghost' && u.isLocationEnabled !== false;
      });

      // Remove markers no longer active
      Object.keys(markersRef.current).forEach(id => {
        if (id !== 'me' && !activeUsers.find(u => (u.uid === id || u.id === id))) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });

      // Add/Update markers
      activeUsers.forEach(u => {
        const markerKey = u.uid || u.id;
        const lat = Number(u.location.lat);
        const lng = Number(u.location.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const userAvatar = u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600';
        const isLive = u.isLive === true;
        const isOnline = u.status === 'online';

        const otherIcon = L.divIcon({
          className: isLive ? 'custom-live-marker' : 'custom-other-marker',
          html: `
            <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
              ${(isLive || isOnline) ? '<div class="pulse-ring" style="background-color:' + (isLive ? '#EF4444' : '#10B981') + '"></div>' : ''}
              <div style="background:#1C1C1C;width:38px;height:38px;border-radius:50%;border:2px solid ${isLive ? '#EF4444' : 'white'};box-shadow:0 4px 12px rgba(0,0,0,0.3);overflow:hidden;position:relative;z-index:2;">
                <img src="${userAvatar}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'"/>
                ${isOnline ? '<span style="position:absolute;bottom:1px;right:1px;width:9px;height:9px;background:#10B981;border:1.5px solid white;border-radius:50%;"></span>' : ''}
              </div>
              ${isLive ? '<span style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);background:#EF4444;color:white;font-size:7px;font-weight:900;padding:0.5px 5px;border-radius:999px;z-index:10;white-space:nowrap;">● LIVE</span>' : ''}
            </div>
          `,
          iconSize: [44, 44]
        });

        const popupContent = `
          <div style="font-family: Inter, sans-serif; text-align: center; width: 175px; padding: 4px;">
            <div style="position:relative; width:48px; margin: 0 auto 6px;">
              <img src="${userAvatar}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid ${isLive ? '#EF4444' : '#E8474A'};" />
              ${isLive ? '<span style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);background:#EF4444;color:white;font-size:8px;font-weight:900;padding:1px 5px;border-radius:6px;">LIVE</span>' : ''}
              ${isOnline ? '<span style="position:absolute;top:0;right:0;width:12px;height:12px;background:#10B981;border:2px solid white;border-radius:50%;"></span>' : ''}
            </div>
            <b style="font-size: 13px; display:block; color:#1C1C1C;">${u.name || 'Foydalanuvchi'}</b>
            <p style="font-size: 10px; color: #666; margin: 2px 0 6px;">${u.district || u.region || 'Toshkent'}</p>
            ${isLive ? `<button onclick="window.dispatchEvent(new CustomEvent('alov-watch-live-stream', { detail: '${markerKey}' }))" style="background:#EF4444;color:white;border:none;padding:7px 12px;border-radius:12px;font-size:11px;font-weight:bold;cursor:pointer;margin-bottom:4px;width:100%;box-shadow:0 2px 8px rgba(239,68,68,0.4);">🎥 Efirni ko'rish (LIVE)</button>` : ''}
            <button onclick="window.dispatchEvent(new CustomEvent('alov-open-user-profile', { detail: '${markerKey}' }))" style="background:#E8474A;color:white;border:none;padding:6px 12px;border-radius:12px;font-size:11px;font-weight:bold;cursor:pointer;margin-bottom:4px;width:100%;box-shadow:0 2px 6px rgba(232,71,74,0.3);">Profilni ko'rish 👤</button>
            <button onclick="window.dispatchEvent(new CustomEvent('alov-draw-route-to-user', { detail: '${markerKey}' }))" style="background:#1C1C1C;color:white;border:none;padding:6px 12px;border-radius:12px;font-size:11px;font-weight:bold;cursor:pointer;width:100%;box-shadow:0 2px 6px rgba(0,0,0,0.2);">Yo'l (Marshrut) 🚗</button>
          </div>
        `;

        if (!markersRef.current[markerKey]) {
          const marker = L.marker([lat, lng], { icon: otherIcon }).addTo(map);
          marker.bindPopup(popupContent);
          markersRef.current[markerKey] = marker;
        } else {
          const existingMarker = markersRef.current[markerKey];
          existingMarker.setLatLng([lat, lng]);
          // Only update icon/popup if data actually changed (to prevent flickering)
          if (existingMarker.options.icon.options.html !== otherIcon.options.html) {
            existingMarker.setIcon(otherIcon);
          }
          if (existingMarker.getPopup().getContent() !== popupContent) {
            existingMarker.setPopupContent(popupContent);
          }
        }
      });
    });
  }, [activeTab, usersList, userCoords, isLocationEnabled, currentUser, firebaseUser]);


  // Device Image File Upload Handler -> Opens Avatar Image Crop Modal
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setCropImageSrc(reader.result);
          setCropScale(1);
          setCropPan({ x: 0, y: 0 });
          setShowCropModal(true);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Render Cropped Avatar via Canvas and Save
  const handleApplyCrop = () => {
    if (!cropImageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = cropImageSrc;
    img.onload = () => {
      const size = 300;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clean white canvas background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      // Translate to canvas center
      ctx.translate(size / 2, size / 2);
      ctx.scale(cropScale, cropScale);
      ctx.translate(cropPan.x, cropPan.y);

      // Draw image keeping ratio
      const aspect = img.width / img.height;
      let drawW = size;
      let drawH = size;
      if (aspect > 1) {
        drawW = size * aspect;
      } else {
        drawH = size / aspect;
      }
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.88);
      setRegAvatar(croppedBase64);
      setShowCropModal(false);
      setCropImageSrc(null);
    };
  };

  // Toggle Live Location with strict physical GPS options & clear user guidance alerts
  const handleToggleLocation = async (enabled: boolean) => {
    if (enabled) {
      if (!navigator.geolocation) {
        alert("Qurilmangiz geolokatsiyani (GPS) qo'llab-quvvatlamaydi.");
        setIsLocationEnabled(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const newCoords = { 
            lat: pos.coords.latitude, 
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          setUserCoords(newCoords);
          setIsLocationEnabled(true);
          setGpsStatusMsg('');

          if (firebaseUser) {
            try {
              await fetch(getApiUrl('/api/users/update'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uid: firebaseUser.uid,
                  updates: {
                    isLocationEnabled: true,
                    locationVisibility: regLocationVisibility,
                    location: newCoords
                  }
                })
              });
            } catch (e) {
              console.error("Backend location update error:", e);
            }
          }

          if (geoWatchId !== null) {
            navigator.geolocation.clearWatch(geoWatchId);
          }

          const watchId = navigator.geolocation.watchPosition(
            async (p) => {
              const updatedCoords = { 
                lat: p.coords.latitude, 
                lng: p.coords.longitude,
                accuracy: p.coords.accuracy
              };
              setUserCoords(updatedCoords);
              if (firebaseUser) {
                try {
                  await fetch(getApiUrl('/api/users/update'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      uid: firebaseUser.uid,
                      updates: {
                        isLocationEnabled: true,
                        locationVisibility: regLocationVisibility,
                        location: updatedCoords
                      }
                    })
                  });
                } catch (e) {
                  console.error("Watch update error:", e);
                }
              }
            },
            (err) => console.warn("Watch position error:", err),
            GPS_OPTIONS
          );
          setGeoWatchId(watchId);
        },
        (err) => {
          const errMsg = getGpsErrorMessage(err);
          alert(errMsg);
          setIsLocationEnabled(false);
          setGpsStatusMsg(errMsg);
          if (firebaseUser) {
            fetch(getApiUrl('/api/users/update'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uid: firebaseUser.uid,
                updates: { isLocationEnabled: false }
              })
            }).catch(() => {});
          }
        },
        GPS_OPTIONS
      );
    } else {
      if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        setGeoWatchId(null);
      }
      setIsLocationEnabled(false);
      if (firebaseUser) {
        try {
          await fetch(getApiUrl('/api/users/update'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: firebaseUser.uid,
              updates: { isLocationEnabled: false }
            })
          });
        } catch (e) {
          console.error("Error disabling location:", e);
        }
      }
    }
  };

  const getGpsRegionName = (lat: number, lng: number): string => {
    if (lat >= 41.1 && lat <= 41.6 && lng >= 69.0 && lng <= 69.6) return "Toshkent shahri";
    if (lat >= 40.8 && lat <= 41.8 && lng >= 68.8 && lng <= 70.3) return "Toshkent viloyati";
    if (lat >= 39.2 && lat <= 40.0 && lng >= 66.2 && lng <= 67.5) return "Samarqand viloyati";
    if (lng >= 70.0) return "Farg'ona viloyati";
    if (lng <= 66.0 && lat >= 39.5 && lat <= 40.5) return "Buxoro viloyati";
    if (lng <= 61.5) return "Xorazm viloyati";
    if (lat < 39.2) return "Qashqadaryo viloyati";
    if (lat >= 39.8 && lat <= 40.3 && lng >= 67.3 && lng <= 68.2) return "Jizzax viloyati";
    if (lat >= 40.1 && lat <= 40.7 && lng >= 68.2 && lng <= 69.3) return "Sirdaryo viloyati";
    return "Toshkent shahri";
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setErrorMsg('');

    // Mandatory GPS Region Verification
    if (userCoords?.lat && userCoords?.lng) {
      const detectedRegion = getGpsRegionName(userCoords.lat, userCoords.lng);
      if (detectedRegion.includes("Toshkent") && !regRegion.includes("Toshkent")) {
        setErrorMsg(`Iltimos, aniq va haqiqiy joylashuvingizni kiriting! GPS orqali ${detectedRegion} aniqlandi, lekin siz ${regRegion} tanladingiz.`);
        return;
      }
    }
    try {
      const newUserData = {
        ...currentUser,
        id: currentUser?.id || `ALOV-${firebaseUser.uid.slice(0, 5).toUpperCase()}`,
        uid: firebaseUser.uid,
        name: regName || firebaseUser.displayName || 'Alov Foydalanuvchisi',
        age: Number(regAge),
        gender: regGender,
        region: regRegion,
        district: regDistrict,
        neighborhood: regNeighborhood,
        phone: regPhone || firebaseUser.phoneNumber || '+998901112233',
        telegram: regTelegram || '@user_tg',
        instagram: regInstagram || '@user_insta',
        bio: regBio,
        avatar: regAvatar || firebaseUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600',
        videoUrl: currentUser?.videoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-young-woman-looking-at-camera-in-a-park-41686-large.mp4',
        followersCount: currentUser?.followersCount || 1,
        followingCount: currentUser?.followingCount || 1,
        likesCount: currentUser?.likesCount || 5,
        isOnline: true,
        isLocationEnabled: isLocationEnabled,
        locationVisibility: regLocationVisibility,
        location: userCoords
      };

      const res = await fetch(getApiUrl('/api/users/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: newUserData })
      });
      const data = await res.json();
      const savedUser = (data.success && data.user) ? data.user : newUserData;

      try {
        localStorage.setItem('alov_user_' + firebaseUser.uid, JSON.stringify(savedUser));
      } catch (e) {}

      setCurrentUser(savedUser);
      setUsersList(prev => {
        const userMap = new Map<string, any>();
        prev.forEach(u => userMap.set(u.uid || u.id, u));
        userMap.set(firebaseUser.uid, savedUser);
        return Array.from(userMap.values());
      });
      setShowProfileModal(false);
      setActiveTab('discover');
    } catch (err: any) {
      setErrorMsg(err.message || "Profilni saqlashda xatolik.");
    }
  };

  const handleLocationVisibilityChange = (value: 'everyone' | 'mutual' | 'ghost') => {
    setRegLocationVisibility(value);
    if (firebaseUser) {
      fetch(getApiUrl('/api/users/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: firebaseUser.uid,
          updates: { locationVisibility: value }
        })
      }).catch(console.error);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setErrorMsg('');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // Mobil va kompyuterlarda bir xil barqaror popup usulidan foydalanamiz
      try {
        const result = await signInWithPopup(auth, provider);
        if (result?.user) {
          await syncUserWithBackend(result.user);
          setShowAuthModal(false);
          setActiveTab('discover');
        }
      } catch (popupErr: any) {
        if (popupErr.code === 'auth/popup-closed-by-user' || popupErr.code === 'auth/cancelled-popup-request') {
          setIsLoggingIn(false);
          return; // Foydalanuvchi popup oynasini yopdi
        }
        console.warn("Popup oyna bloklandi, redirect usuliga o'tilmoqda:", popupErr);
        await signInWithRedirect(auth, provider);
      }
    } catch (err: any) {
      console.error("Google Login Error:", err);
      setErrorMsg(err.message || "Google orqali kirishda xatolik yuz berdi.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (firebaseUser) {
      try {
        await fetch(getApiUrl('/api/users/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: firebaseUser.uid,
            updates: { isOnline: false }
          })
        });
      } catch (e) {}
    }
    await signOut(auth);
    setFirebaseUser(null);
    setCurrentUser(null);
    setActiveTab('landing');
  };

  const handleToggleFollow = (targetId: string) => {
    if (followingIds.includes(targetId)) {
      setFollowingIds(followingIds.filter(id => id !== targetId));
    } else {
      setFollowingIds([...followingIds, targetId]);
    }
  };

  const handleCreateMeetLink = async () => {
    let meetUrl = 'https://meet.google.com/abc-defg-hij';
    try {
      const res = await fetch(getApiUrl('/api/meet/create-link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${currentUser?.name} va ${selectedChatUser?.name} Google Meet Qo'ng'irog'i` })
      });
      const data = await res.json();
      if (data.success && data.meetUrl) {
        meetUrl = data.meetUrl;
      }
    } catch (e) {
      console.warn("Meet link API fallback used");
    }

    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = selectedChatUser?.uid || selectedChatUser?.id;

    if (!myUid || !otherUid) return;

    const chatId = [myUid, otherUid].sort().join('_');
    const msgObj = {
      id: 'meet_' + Date.now(),
      senderId: myUid,
      senderName: currentUser?.name || firebaseUser?.displayName || 'Foydalanuvchi',
      type: 'meet' as const,
      text: "Google Meet Havolasi 📹",
      meetUrl,
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socketRef.current?.emit('send_message', {
      chatId,
      senderId: myUid,
      recipientId: otherUid,
      message: msgObj
    });

    setChatMessages(prev => {
      const currentMsgs = prev[selectedChatUser.id] || [];
      const updatedMsgs = [...currentMsgs, msgObj];
      try {
        localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(updatedMsgs));
      } catch (e) {}
      return {
        ...prev,
        [selectedChatUser.id]: updatedMsgs
      };
    });

    // Update chatsList item and persist
    setChatsList(prev => {
      const existingIdx = prev.findIndex(c => c.id === chatId);
      let updated = [...prev];
      if (existingIdx > -1) {
        const item = { ...updated[existingIdx], lastMessage: msgObj.text, updatedAt: msgObj.createdAt };
        updated.splice(existingIdx, 1);
        updated.unshift(item);
      } else {
        updated.unshift({
          id: chatId,
          participants: [myUid, otherUid],
          lastMessage: msgObj.text,
          updatedAt: msgObj.createdAt,
          partner: selectedChatUser
        });
      }
      try {
        localStorage.setItem('alov_chats_' + myUid, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Helper to open chat and immediately add to chatsList and localStorage
  const openChatWithUser = (targetUser: any) => {
    setSelectedChatUser(targetUser);
    setChatView('conversation');
    setActiveTab('chats');

    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = targetUser?.uid || targetUser?.id;
    if (myUid && otherUid) {
      const chatId = [myUid, otherUid].sort().join('_');
      setChatsList(prev => {
        const existingIdx = prev.findIndex(c => c.id === chatId);
        let updated = [...prev];
        if (existingIdx === -1) {
          updated.unshift({
            id: chatId,
            participants: [myUid, otherUid],
            lastMessage: "Yangi suhbat boshlandi",
            updatedAt: new Date().toISOString(),
            partner: targetUser
          });
        }
        try {
          localStorage.setItem('alov_chats_' + myUid, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    }
  };

  // 1 Room per user: Open existing or create single room
  const handleOpenMyRoom = async () => {
    if (!firebaseUser && !currentUser) {
      setShowAuthModal(true);
      return;
    }
    const myUid = currentUser?.uid || firebaseUser?.uid;
    const myName = currentUser?.name || firebaseUser?.displayName || 'Alov Foydalanuvchisi';
    const myAvatar = currentUser?.avatar || firebaseUser?.photoURL || '';

    // Check if user already created an active room in roomList
    const existing = roomList.find(r => r.ownerUid === myUid);
    if (existing) {
      setAudioRoomCode(existing.code);
      setAudioRoomTitle(existing.title);
      setShowAudioRoomModal(true);
      return;
    }

    try {
      const res = await fetch(getApiUrl('/api/audio-rooms/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid: myUid,
          ownerName: myName,
          ownerAvatar: myAvatar,
          title: `${myName} Ovozli Xonasi 🎙️`
        })
      });
      const data = await res.json();
      if (data.success && data.room) {
        setAudioRoomCode(data.room.code);
        setAudioRoomTitle(data.room.title);
        setShowAudioRoomModal(true);
      }
    } catch (e) {
      setAudioRoomCode(`room_${myUid}`);
      setAudioRoomTitle(`${myName} Ovozli Xonasi 🎙️`);
      setShowAudioRoomModal(true);
    }
  };

  const handleTyping = () => {
    if (!firebaseUser || !selectedChatUser) return;
    const myUid = firebaseUser.uid;
    const otherUid = selectedChatUser.uid || selectedChatUser.id;
    const chatId = [myUid, otherUid].sort().join('_');

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    socketRef.current?.emit('typing', { chatId, uid: myUid, isTyping: true });

    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing', { chatId, uid: myUid, isTyping: false });
    }, 2000);
  };

  const handleSendChatMessage = async (type: 'text' | 'image' | 'video' | 'audio' | 'voice' = 'text', fileUrl?: string) => {
    if (!selectedChatUser) return;
    if (type === 'text' && !inputMessage.trim()) return;
    
    const text = type === 'text' ? inputMessage.trim() : (type === 'image' ? "Rasm 🖼️" : (type === 'video' ? "Video 🎥" : (type === 'voice' ? "Ovozli xabar 🎤" : "Fayl 📎")));
    if (type === 'text') setInputMessage('');

    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = selectedChatUser.uid || selectedChatUser.id;
    const isAIBot = selectedChatUser.uid === ALOV_AI_USER.uid;

    if (!myUid) return;

    const chatId = [myUid, otherUid].sort().join('_');
    const msgObj = {
      id: 'msg_' + Date.now() + Math.random().toString(36).substring(2, 5),
      senderId: myUid,
      senderName: currentUser?.name || firebaseUser?.displayName || 'Foydalanuvchi',
      text,
      type,
      fileUrl: fileUrl || null,
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current?.emit('typing', { chatId, uid: myUid, isTyping: false });

    // Send message via Socket.io bridge (Render server + memory store)
    socketRef.current?.emit('send_message', {
      chatId,
      senderId: myUid,
      recipientId: otherUid,
      message: msgObj
    });

    // Optimistically update local chat messages & localStorage
    setChatMessages(prev => {
      const currentMsgs = prev[selectedChatUser.id] || [];
      const updatedMsgs = [...currentMsgs, msgObj];
      try {
        localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(updatedMsgs));
      } catch (e) {}
      return {
        ...prev,
        [selectedChatUser.id]: updatedMsgs
      };
    });

    // Update chatsList item and persist
    setChatsList(prev => {
      const existingIdx = prev.findIndex(c => c.id === chatId);
      let updated = [...prev];
      if (existingIdx > -1) {
        const item = { ...updated[existingIdx], lastMessage: text, updatedAt: msgObj.createdAt };
        updated.splice(existingIdx, 1);
        updated.unshift(item);
      } else {
        updated.unshift({
          id: chatId,
          participants: [myUid, otherUid],
          lastMessage: text,
          updatedAt: msgObj.createdAt,
          partner: selectedChatUser
        });
      }
      try {
        localStorage.setItem('alov_chats_' + myUid, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (isAIBot) {
      setIsAiTyping(true);
    }
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser || !selectedChatUser) return;

    const type = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'audio');
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        handleSendChatMessage(type, reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            handleSendChatMessage('voice', reader.result);
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      setIsRecording(true);
    } catch (err) {
      console.error("Mic error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const resetUnreadCount = (_chatId: string) => {
    // Unread count is reset locally and tracked via Socket.io
  };

  const targetGender = currentUser?.gender === 'male' ? 'female' : 'male';
  const filteredCandidates = usersList.filter(u => {
    if (!currentUser) return false;
    if (currentUser.uid && (u.uid === currentUser.uid || u.id === currentUser.uid)) return false;
    if (currentUser.id && (u.id === currentUser.id || u.uid === currentUser.id)) return false;
    if (u.gender !== targetGender) return false;
    if (filterRegion !== 'Barchasi' && u.region !== filterRegion) return false;
    if (filterDistrict !== 'Barchasi' && u.district !== filterDistrict) return false;
    if (searchQuery.trim() && !u.name.toLowerCase().includes(searchQuery.toLowerCase()) && !u.bio.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Dashboard content inside smartphone mockup
  const dashboardContent = (
    <div className="h-full bg-[#FAFAFB] text-[#1C1C1C] font-sans flex flex-col w-full relative overflow-hidden">
      
      {/* Top Header inside mockup */}
      <header className="shrink-0 bg-white border-b border-[rgba(28,28,28,0.06)] px-3 h-13 flex items-center justify-between">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveTab('discover')}>
          <span className="text-lg font-black tracking-tight text-[#1C1C1C]">
            alov<span className="text-[#E8474A]">.uz</span>
          </span>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center space-x-1 border border-emerald-200/60 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>{activeUsersCount} onlayn</span>
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setActiveTab('profile')}
            className="flex items-center space-x-1.5 bg-white border border-[rgba(28,28,28,0.08)] py-1 px-2 rounded-full shadow-subtle"
          >
            <img src={currentUser?.avatar || firebaseUser?.photoURL || ''} alt="Avatar" className="w-5 h-5 rounded-full object-cover shrink-0" />
            <span className="text-[10px] font-bold truncate max-w-[70px]">{currentUser?.name || 'Profil'}</span>
          </button>
          <button onClick={handleLogout} className="p-1.5 rounded-full bg-rose-50 text-[#E8474A]">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Scrollable Inner Viewport or Fullscreen Reels */}
      <div className={`flex-1 overflow-y-auto relative ${activeTab === 'reels' ? 'p-0 pb-0' : 'p-3 space-y-3 pb-16'}`}>
        
        {/* --- LANDING TAB --- */}
        {activeTab === 'landing' && <LandingPage onLogin={() => setShowAuthModal(true)} />}

        {/* --- DISCOVER TAB --- */}
        {activeTab === 'discover' && (
          <div className="space-y-3">
            {/* Live Stream Go Live Promo Banner */}
            <div className="bg-gradient-to-r from-red-600 to-rose-600 rounded-[20px] p-3.5 text-white shadow-xl shadow-red-500/20 flex items-center justify-between border border-white/10">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-full shadow-inner">
                  <Radio className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-xs tracking-wide">JONLI EFIR (LIVE)</h3>
                  <p className="text-[10px] text-white/80">Kamerangizni yoqing va barcha bilan muloqot qiling</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!firebaseUser && !currentUser) {
                    setShowAuthModal(true);
                    return;
                  }
                  setLiveModalMode('broadcaster');
                  setShowLiveModal(true);
                }}
                className="bg-white text-red-600 px-3 py-1.5 rounded-full text-xs font-black shadow-md shrink-0 hover:bg-slate-50 transition active:scale-95"
              >
                Efir boshlash 🔴
              </button>
            </div>

            <div className="bg-white p-3 rounded-[16px] card-shadow space-y-2">
              <h2 className="text-lg font-editorial">Nomzodlar</h2>
              <select 
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className="w-full px-3 py-2 rounded-[8px] bg-[#FAFAFB] border border-slate-200 text-xs font-semibold"
              >
                <option value="Barchasi">Barcha viloyatlar</option>
                {Object.keys(UZ_LOCATIONS).map(reg => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {isLoadingCandidates ? (
                <>
                  <CandidateSkeleton />
                  <CandidateSkeleton />
                </>
              ) : filteredCandidates.map(user => (
                <div key={user.id} className="bg-white rounded-[20px] p-2.5 card-shadow flex flex-col justify-between space-y-2 border border-slate-100 hover:shadow-md transition-all">
                  <div className="relative aspect-[3/4] w-full rounded-[14px] overflow-hidden bg-slate-100">
                    <img 
                      src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                      alt={user.name} 
                      className="w-full h-full object-cover object-center transition-transform duration-300 hover:scale-105"
                      onError={(e: any) => {
                        e.target.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600';
                      }}
                    />
                    
                    {user.isLive && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-600 text-white text-[8px] font-black flex items-center space-x-1 shadow-md animate-pulse border border-white/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        <span>LIVE</span>
                      </div>
                    )}

                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#E8474A] text-white text-[8px] font-bold shadow-xs">
                      {user.id}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-sm font-bold font-editorial text-slate-900 truncate">{user.name}, {user.age}</h3>
                    <p className="text-[10px] text-[#6b635c] truncate">{user.district || user.region}</p>
                  </div>

                  {user.isLive && (
                    <button
                      onClick={() => {
                        setActiveLiveHostUser(user);
                        setActiveLiveStreamId(user.liveStreamId || ('stream_' + (user.uid || user.id)));
                        setLiveModalMode('viewer');
                        setShowLiveModal(true);
                      }}
                      className="w-full py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] shadow-sm flex items-center justify-center space-x-1 transition active:scale-95"
                    >
                      <Radio className="w-3 h-3 animate-pulse" />
                      <span>Efir (LIVE) 🎥</span>
                    </button>
                  )}

                  <div className="flex space-x-1.5 pt-0.5">
                    <button onClick={() => setSelectedProfile(user)} className="flex-1 py-1.5 rounded-full bg-[#FCEAEA] hover:bg-[#f8d7d7] text-[#E8474A] font-bold text-[10px] transition active:scale-95">
                      Profil
                    </button>
                    <button onClick={() => openChatWithUser(user)} className="flex-1 py-1.5 rounded-full bg-[#E8474A] hover:bg-[#CB2E31] text-white font-bold text-[10px] transition active:scale-95">
                      Chat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- ROOMS TAB --- */}
        {activeTab === 'rooms' && (
          <div className="space-y-3">
            <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-purple-600 text-white p-5 rounded-[24px] space-y-3 shadow-xl">
              <div className="flex items-center space-x-2">
                <Radio className="w-6 h-6 animate-pulse text-rose-200" />
                <h1 className="text-xl font-extrabold tracking-wide">Jonli Ovozli Xonalar (Party Room)</h1>
              </div>
              <p className="text-xs text-rose-100">
                8 ta mikrofon o'rindiqlari, jonli audio suhbat va real-time xona chati! 🎙️✨
              </p>
              <button 
                onClick={handleOpenMyRoom}
                className="w-full bg-white text-rose-600 hover:bg-rose-50 py-3 rounded-full font-bold text-xs shadow-lg active:scale-95 transition flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>O'z Ovozli Xonangizni Ochish (+ Join)</span>
              </button>
            </div>

            {/* Active Real Voice Rooms */}
            <div className="space-y-2.5">
              <h2 className="text-sm font-bold text-slate-800 px-1">Faol Ovozli Xonalar:</h2>
              {roomList.length === 0 ? (
                <div className="bg-white p-6 rounded-[20px] card-shadow text-center space-y-2 border border-slate-100">
                  <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 mx-auto flex items-center justify-center">
                    <Radio className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-800">Hozircha ochiq ovozli xonalar yo'q</h3>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Birinchi bo'lib o'z xonangizni oching va barchani jonli suhbatga chorlang! 🎙️✨
                  </p>
                  <button 
                    onClick={handleOpenMyRoom}
                    className="mt-2 px-5 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition"
                  >
                    Xona ochish ✨
                  </button>
                </div>
              ) : (
                roomList.map((room) => (
                  <div key={room.code} className="bg-white p-4 rounded-[20px] card-shadow space-y-3 border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <h3 className="font-bold text-sm text-slate-900 truncate">{room.title}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          Boshlovchi: {room.ownerName || 'Alov Foydalanuvchisi'} • {room.membersCount || 1} ta ishtirokchi
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-extrabold flex items-center space-x-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>FAOL</span>
                      </span>
                    </div>
                    <button 
                      onClick={() => {
                        if (!firebaseUser && !currentUser) {
                          setShowAuthModal(true);
                          return;
                        }
                        setAudioRoomCode(room.code);
                        setAudioRoomTitle(room.title);
                        setShowAudioRoomModal(true);
                      }} 
                      className="w-full py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition flex items-center justify-center space-x-2 active:scale-95"
                    >
                      <Mic className="w-3.5 h-3.5 text-rose-400" />
                      <span>Xonaga kirish 🎙️</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* --- REELS / EFIRLAR TAB (Only active live streamers) --- */}
        {activeTab === 'reels' && (
          <div 
            className="absolute inset-0 z-30 bg-black flex flex-col select-none"
            onTouchStart={(e) => setTouchStartY(e.touches[0].clientY)}
            onTouchEnd={(e) => {
              if (touchStartY === null) return;
              const touchEndY = e.changedTouches[0].clientY;
              const diff = touchStartY - touchEndY;
              if (diff > 40) setCurrentReelIndex(prev => prev + 1);
              else if (diff < -40) setCurrentReelIndex(prev => (prev > 0 ? prev - 1 : 0));
              setTouchStartY(null);
            }}
            onWheel={(e) => {
              if (e.deltaY > 30) setCurrentReelIndex(prev => prev + 1);
              else if (e.deltaY < -30) setCurrentReelIndex(prev => (prev > 0 ? prev - 1 : 0));
            }}
          >
            {(() => {
              const activeLiveUsers = usersList.filter(u => u.isLive === true);

              if (activeLiveUsers.length === 0) {
                return (
                  <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center text-white bg-slate-950 space-y-4">
                    <button onClick={() => setActiveTab('discover')} className="absolute top-4 left-4 p-2 rounded-full bg-black/40 backdrop-blur-md text-white">
                      <X className="w-5 h-5" />
                    </button>
                    <div className="w-16 h-16 rounded-full bg-rose-600/20 border border-rose-500/40 flex items-center justify-center animate-pulse">
                      <Radio className="w-8 h-8 text-rose-500" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-black">Hozirda jonli efirlar mavjud emas</h3>
                      <p className="text-xs text-slate-400 max-w-xs">
                        Faqat "Efirni boshlash" tugmasini bosgan foydalanuvchilar shu yerda ko'rinadi. Birinchi bo'lib efir boshlang! 🔴
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!firebaseUser && !currentUser) {
                          setShowAuthModal(true);
                          return;
                        }
                        setLiveModalMode('broadcaster');
                        setShowLiveModal(true);
                      }}
                      className="px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition active:scale-95 flex items-center space-x-2"
                    >
                      <Radio className="w-4 h-4" />
                      <span>Efirni Boshlash 🔴</span>
                    </button>
                  </div>
                );
              }

              const currentReelUser = activeLiveUsers[currentReelIndex % activeLiveUsers.length];
              const comments = reelComments[currentReelUser.id] || [];
              return (
                <div className="relative w-full h-full flex flex-col justify-between overflow-hidden">
                  {getYouTubeEmbedUrl(currentReelUser.videoUrl) ? (
                    <iframe 
                      src={getYouTubeEmbedUrl(currentReelUser.videoUrl)!} 
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none border-0" 
                      allow="autoplay; encrypted-media" 
                      allowFullScreen
                    />
                  ) : (
                    <video src={currentReelUser.videoUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

                  {/* Top Header - Profile & Title */}
                  <div className="relative z-10 p-4 flex items-center justify-between text-white pt-6">
                    <div className="flex items-center space-x-3">
                      <button onClick={() => setActiveTab('discover')} className="p-2 rounded-full bg-black/40 backdrop-blur-md"><X className="w-5 h-5" /></button>
                      
                      {/* Top Left Profile & Obuna */}
                      <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                        <img src={currentReelUser.avatar} className="w-7 h-7 rounded-full object-cover" />
                        <div>
                          <div className="font-bold text-xs">{currentReelUser.name}</div>
                        </div>
                        <button 
                          onClick={() => handleToggleFollow(currentReelUser.id)}
                          className="ml-2 px-3 py-1 bg-red-500 rounded-full text-[10px] font-bold text-white"
                        >
                          {followingIds.includes(currentReelUser.id) ? 'Obuna' : '+ Obuna'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold">
                       <span className="text-red-500 animate-pulse">●</span> {activeUsersCount || 1}
                    </div>
                  </div>

                  {/* Right Side Action Buttons */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col space-y-4 z-20">
                    <button className="flex flex-col items-center space-y-1 group">
                      <div className="p-3 rounded-full bg-black/30 backdrop-blur-md hover:bg-black/50 transition">
                        <Heart className="w-6 h-6 text-white group-hover:text-red-500" />
                      </div>
                      <span className="text-[10px] font-bold text-white">4.2K</span>
                    </button>
                    <button className="flex flex-col items-center space-y-1 group">
                      <div className="p-3 rounded-full bg-black/30 backdrop-blur-md hover:bg-black/50 transition">
                        <Flame className="w-6 h-6 text-white group-hover:text-orange-500" />
                      </div>
                      <span className="text-[10px] font-bold text-white">Sovg'a</span>
                    </button>
                    <button className="flex flex-col items-center space-y-1 group">
                      <div className="p-3 rounded-full bg-black/30 backdrop-blur-md hover:bg-black/50 transition">
                        <ArrowUpRight className="w-6 h-6 text-white group-hover:text-blue-400" />
                      </div>
                      <span className="text-[10px] font-bold text-white">Ulashish</span>
                    </button>
                  </div>

                  {/* Bottom Reel Info & Borderless Live Comments Overlay */}
                  <div className="relative z-10 space-y-2.5 text-white pb-2">
                    <p className="text-xs text-slate-100 font-medium leading-relaxed">{currentReelUser.bio}</p>

                    {/* Comments */}
                    <div className="space-y-1.5 max-h-[150px] overflow-y-auto pb-2" onWheel={(e) => e.stopPropagation()}>
                      {comments.map((c) => (
                        <div key={c.id} className="text-white text-xs flex items-center space-x-1.5">
                          <span className="font-bold text-rose-300">{c.name}:</span>
                          <span className="text-slate-100">{c.text}</span>
                        </div>
                      ))}
                      <div ref={commentsEndRef} />
                    </div>

                    {/* Live Comment Input Field */}
                    <div className="flex items-center space-x-2 pt-1">
                      <input 
                        type="text" 
                        placeholder="Efirga xabar yozing..." 
                        value={reelCommentInput}
                        onChange={(e) => setReelCommentInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && reelCommentInput.trim()) {
                            const newComment = { id: 'c-' + Date.now(), name: currentUser?.name || 'Siz', text: reelCommentInput };
                            setReelComments(prev => ({
                              ...prev,
                              [currentReelUser.id]: [...(prev[currentReelUser.id] || []), newComment]
                            }));
                            setReelCommentInput('');
                          }
                        }}
                        className="flex-1 px-4 py-2.5 rounded-full bg-black/60 text-white placeholder-white/50 border border-white/20 text-xs focus:outline-none focus:border-red-500"
                      />
                      <button 
                        onClick={() => {
                          if (reelCommentInput.trim()) {
                            const newComment = { id: 'c-' + Date.now(), name: currentUser?.name || 'Siz', text: reelCommentInput };
                            setReelComments(prev => ({
                              ...prev,
                              [currentReelUser.id]: [...(prev[currentReelUser.id] || []), newComment]
                            }));
                            setReelCommentInput('');
                          }
                        }}
                        className="bg-[#E8474A] text-white p-2 rounded-full shadow-md shrink-0 hover:bg-[#CB2E31] transition-all"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* --- CHATS TAB --- */}
        {activeTab === 'chats' && (
          <div className="h-full flex flex-col">
            {chatView === 'list' ? (
              <div className="bg-white rounded-[24px] card-shadow overflow-hidden flex flex-col h-full animate-fade-in-up">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-editorial text-2xl">Xabarlar</h2>
                  <div className="px-2.5 py-1 bg-rose-50 text-[#E8474A] rounded-full text-[10px] font-bold">
                    {chatsList.length} faol
                  </div>
                </div>
                <div className="divide-y divide-slate-50 overflow-y-auto pb-20">
                  {isLoadingChats ? (
                    <>
                      <ChatSkeleton />
                      <ChatSkeleton />
                      <ChatSkeleton />
                    </>
                  ) : chatsList.length === 0 ? (
                    <div className="p-10 text-center space-y-3">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                        <MessageCircle className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-xs text-slate-400 font-medium">Hozircha xabarlar yo'q. Nomzodlar bilan suhbatni boshlang!</p>
                    </div>
                  ) : chatsList.map(chat => {
                    const otherUid = chat.participants.find((p: string) => p !== firebaseUser?.uid);
                    const otherUser = usersList.find(u => u.uid === otherUid) || (otherUid === ALOV_AI_USER.uid ? ALOV_AI_USER : null);
                    const unread = chat.unreadCount?.[firebaseUser?.uid || ''] || 0;
                    
                    return (
                      <motion.div 
                        key={chat.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => { 
                          setSelectedChatUser(otherUser || { uid: otherUid, name: 'Foydalanuvchi' }); 
                          setChatView('conversation'); 
                        }}
                        className={cn(
                          "p-4 flex items-center space-x-3 cursor-pointer hover:bg-slate-50 transition-all relative",
                          chat.isAI && "bg-rose-50/30 border-l-4 border-rose-500"
                        )}
                      >
                        <div className="relative">
                          <img src={otherUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} alt="" className="w-12 h-12 rounded-full object-cover shrink-0 border border-slate-100" />
                          {otherUser?.status === 'online' && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#10B981] border-2 border-white rounded-full"></span>
                          )}
                          {chat.isAI && (
                            <div className="absolute -top-1 -right-1 bg-rose-500 text-white p-0.5 rounded-full shadow-sm">
                              <Sparkles className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5">
                              <h4 className="font-bold text-sm text-slate-900 truncate">{otherUser?.name || 'Foydalanuvchi'}</h4>
                              {chat.isAI && <span className="bg-rose-100 text-rose-600 text-[8px] font-black px-1 rounded uppercase tracking-tighter">AI BOT</span>}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {chat.updatedAt?.toDate ? chat.updatedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className={cn("text-[11px] truncate flex-1 pr-2", unread > 0 ? "text-slate-900 font-bold" : "text-slate-500")}>
                              {chat.isTyping?.[otherUid] || (chat.isAI && isAiTyping) ? (
                                <span className="text-emerald-500 font-bold flex items-center">
                                  yozmoqda... <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }}>.</motion.span>
                                </span>
                              ) : chat.lastMessage}
                            </p>
                            {unread > 0 && (
                              <span className="bg-[#E8474A] text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 animate-pulse">
                                {unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="fixed inset-0 md:absolute md:inset-0 z-50 bg-white flex flex-col h-[100dvh] md:h-full max-h-[100dvh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="sticky top-0 z-30 shrink-0 p-3 border-b border-slate-100 flex items-center justify-between bg-white/95 backdrop-blur-md shadow-subtle">
                  <div className="flex items-center space-x-2">
                    <button onClick={() => setChatView('list')} className="p-2 rounded-full hover:bg-slate-100 text-slate-700 transition active:scale-90">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center space-x-2.5">
                      <div className="relative">
                        <img src={selectedChatUser?.avatar} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-100" />
                        {selectedChatUser?.status === 'online' && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10B981] border-2 border-white rounded-full"></span>
                        )}
                      </div>
                      <div>
                        <h3 className="font-sans font-bold text-sm text-slate-900 leading-none">{selectedChatUser?.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {selectedChatUser?.status === 'online' ? 'tarmoqda' : 'yaqinda online edi'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button onClick={handleCreateMeetLink} className="p-2 rounded-full hover:bg-rose-50 text-[#E8474A] transition active:scale-90">
                      <Video className="w-5 h-5" />
                    </button>
                    {/* Phone button removed */}
                  </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto overscroll-contain space-y-3 bg-[#F8F9FA] scrollbar-none scroll-smooth">
                  <AnimatePresence>
                    {(() => {
                      const myUid = currentUser?.uid || firebaseUser?.uid;
                      const activeKey = selectedChatUser?.id || selectedChatUser?.uid;
                      const msgs = (activeKey ? (chatMessages[activeKey] || (selectedChatUser?.uid ? chatMessages[selectedChatUser.uid] : [])) : []) || [];
                      
                      const sortedMessages = [...msgs].sort((a, b) => 
                        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
                      );

                      return sortedMessages.map((msg, idx) => {
                        const isMe = msg.senderId === 'me' || (myUid && (msg.senderId === myUid || msg.userId === myUid));

                        return (
                          <motion.div 
                            key={msg.id || idx}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={cn("flex", isMe ? 'justify-end' : 'justify-start')}
                          >
                            <div className={cn(
                              "max-w-[85%] rounded-[18px] px-4 py-2.5 shadow-subtle relative",
                              isMe 
                                ? 'bg-[#E8474A] text-white rounded-tr-none' 
                                : 'bg-white text-slate-900 border border-slate-200/50 rounded-tl-none'
                            )}>
                              {msg.type === 'meet' ? (
                                <a href={msg.meetUrl} target="_blank" rel="noreferrer" className="underline font-bold flex items-center space-x-2 py-1">
                                  <Video className="w-4 h-4" />
                                  <span>Google Meet Qo'shilish</span>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </a>
                              ) : msg.type === 'image' ? (
                                <img src={msg.fileUrl} alt="" className="rounded-lg max-h-60 object-cover cursor-zoom-in" onClick={() => window.open(msg.fileUrl)} />
                              ) : msg.type === 'video' ? (
                                <VideoPlayer url={msg.fileUrl || ''} />
                              ) : (msg.type === 'voice' || msg.type === 'audio') ? (
                                <VoiceMessage url={msg.fileUrl || ''} senderId={isMe ? 'me' : msg.senderId} />
                              ) : (
                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                              )}
                              <div className="flex items-center justify-end space-x-1 mt-1">
                                <span className={cn("text-[9px]", isMe ? 'text-rose-100' : 'text-slate-400')}>
                                  {msg.time}
                                </span>
                                {isMe && (
                                  <CheckCircle2 className={cn("w-2.5 h-2.5", msg.read ? "text-blue-300" : "text-rose-200")} />
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      });
                    })()}
                    {/* Auto-scroll effect */}
                    <div ref={chatBottomRef} />

                    {isOtherTyping || (selectedChatUser?.uid === ALOV_AI_USER.uid && isAiTyping) ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                      >
                        <div className="bg-slate-100 text-slate-500 rounded-[18px] rounded-tl-none px-4 py-2 shadow-subtle flex items-center space-x-2">
                          <span className="text-[11px] font-bold">{selectedChatUser?.uid === ALOV_AI_USER.uid ? 'Alov AI yozmoqda' : 'yozmoqda'}</span>
                          <div className="flex space-x-1">
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1 h-1 bg-slate-400 rounded-full" />
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-slate-400 rounded-full" />
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-slate-400 rounded-full" />
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <div ref={commentsEndRef} />
                </div>

                <div className="sticky bottom-0 z-30 p-3 pb-safe bg-white/95 backdrop-blur-md border-t border-slate-100 flex items-end space-x-2 shrink-0 glass">
                  <label aria-label="Media yuklash" className="p-2.5 rounded-full text-slate-400 hover:bg-slate-50 transition active:scale-90 cursor-pointer">
                    <Plus className="w-5 h-5" />
                    <input type="file" className="hidden" accept="image/*,video/*,audio/*" onChange={handleMediaUpload} />
                  </label>
                  <div className="flex-1 relative">
                    <textarea 
                      placeholder="Xabar yozing..." 
                      rows={1}
                      value={inputMessage}
                      onChange={(e) => {
                        setInputMessage(e.target.value);
                        handleTyping();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendChatMessage();
                        }
                      }}
                      className="w-full px-4 py-2.5 rounded-[20px] bg-slate-100 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E8474A]/10 border-none resize-none max-h-32"
                    />
                  </div>
                  {inputMessage.trim() ? (
                    <button 
                      onClick={() => handleSendChatMessage()} 
                      className="bg-[#E8474A] text-white p-3 rounded-full shadow-lg hover:bg-[#CB2E31] transition-all active:scale-95 flex items-center justify-center"
                    >
                      <Send className="w-4.5 h-4.5" />
                    </button>
                  ) : (
                    <button 
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      className={cn(
                        "p-3 rounded-full transition-all active:scale-95 flex items-center justify-center",
                        isRecording ? "bg-red-500 text-white animate-pulse" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      )}
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- PROFILE TAB --- */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-[20px] card-shadow p-5 space-y-4">
            <div className="flex items-center space-x-4">
              <img src={currentUser?.avatar || firebaseUser?.photoURL || ''} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-[#E8474A]" />
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-editorial truncate">{currentUser?.name || firebaseUser?.displayName}</h1>
                <p className="text-[10px] font-bold text-[#E8474A]">ID: {currentUser?.id}</p>
                <p className="text-[10px] text-[#6b635c]">{currentUser?.district}, {currentUser?.region}</p>
              </div>
            </div>

            {/* Public Account Stats (Followers / Following / Likes) */}
            <div className="grid grid-cols-3 gap-2 text-center bg-[#FAFAFB] p-3 rounded-[14px]">
              <div>
                <p className="text-sm font-black text-[#E8474A]">{currentUser?.followersCount || 1}</p>
                <p className="text-[9px] text-slate-500 font-bold">Obunachilar</p>
              </div>
              <div>
                <p className="text-sm font-black text-purple-600">{currentUser?.followingCount || 1}</p>
                <p className="text-[9px] text-slate-500 font-bold">Obunalar</p>
              </div>
              <div>
                <p className="text-sm font-black text-pink-600">{currentUser?.likesCount || 5}</p>
                <p className="text-[9px] text-slate-500 font-bold">Laiklar</p>
              </div>
            </div>

            <p className="text-xs text-[#57534E] bg-[#FAFAFB] p-3 rounded-[12px]">{currentUser?.bio}</p>

            {/* Privacy Guard Status Badge */}
            <div className="bg-[#FAFAFB] p-3 rounded-[14px] border border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-[#E8474A]" />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Lokatsiya Maxfiyligi 🔒</span>
                  <span className="text-[10px] text-slate-500 block">
                    {regLocationVisibility === 'mutual' ? 'Faqat obunachilarga ko\'rinadi' : regLocationVisibility === 'everyone' ? 'Barchaga ochiq' : 'Ghost Mode (Yashirin)'}
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-rose-50 text-[#E8474A] text-[10px] font-bold">
                {regLocationVisibility.toUpperCase()}
              </span>
            </div>

            {/* Real Live GPS Location Toggle (Ghost Mode) */}
            <div className="bg-[#FAFAFB] p-3.5 rounded-[16px] border border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <MapPin className={`w-5 h-5 ${isLocationEnabled ? 'text-[#E8474A] animate-pulse' : 'text-slate-400'}`} />
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {isLocationEnabled ? 'Jonli GPS Lokatsiya Faol 🟢' : 'Ghost Mode (Lokatsiya o\'chirilgan) 👻'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {isLocationEnabled ? 'Koordinatalaringiz real vaqtda yangilanmoqda' : 'Xaritada ko\'rinmaysiz'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => handleToggleLocation(!isLocationEnabled)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-subtle ${isLocationEnabled ? 'bg-[#E8474A] text-white' : 'bg-slate-200 text-slate-700'}`}
              >
                {isLocationEnabled ? 'O\'chirish' : 'Yoqish'}
              </button>
            </div>

            <button 
              onClick={() => {
                setRegName(currentUser?.name || '');
                setRegAge(String(currentUser?.age || 22));
                setRegGender(currentUser?.gender || 'female');
                setRegRegion(currentUser?.region || 'Toshkent shahri');
                setRegDistrict(currentUser?.district || 'Yunusobod tumani');
                setRegNeighborhood(currentUser?.neighborhood || 'Bodomzor');
                setRegPhone(currentUser?.phone || '');
                setRegTelegram(currentUser?.telegram || '');
                setRegInstagram(currentUser?.instagram || '');
                setRegBio(currentUser?.bio || '');
                setRegAvatar(currentUser?.avatar || '');
                setRegLocationVisibility(currentUser?.locationVisibility || 'mutual');
                setShowProfileModal(true);
              }}
              className="w-full py-3 rounded-full bg-slate-900 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-2"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Profilni tahrirlash</span>
            </button>
          </div>
        )}

        {/* --- MAP / XARITA TAB (Fullscreen Edge-to-Edge with OSRM Real Street Routing) --- */}
        {activeTab === 'map' && (
          <div className="absolute inset-0 pb-12 z-30 bg-white flex flex-col">
            
            {/* Active Route Info Floating Banner */}
            {activeRouteUser && routeInfo && (
              <div className="absolute top-3 left-3 right-3 z-40 bg-white/95 backdrop-blur-md rounded-[20px] p-3 shadow-xl border border-rose-100 flex items-center justify-between animate-fadeIn">
                <div className="flex items-center space-x-2.5">
                  <img src={activeRouteUser.avatar} alt={activeRouteUser.name} className="w-10 h-10 rounded-full object-cover border-2 border-[#E8474A]" />
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 truncate max-w-[130px]">{activeRouteUser.name} bilan marshrut</h4>
                    <p className="text-[10px] text-[#E8474A] font-extrabold flex items-center space-x-1">
                      <Car className="w-3 h-3 inline mr-0.5" />
                      <span>{routeInfo.distanceKm} km • ~{routeInfo.durationMin} daqiqa</span>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setActiveRouteUser(null);
                    setRouteInfo(null);
                    if (mapPolylineRef.current) {
                      mapPolylineRef.current.remove();
                      mapPolylineRef.current = null;
                    }
                  }}
                  className="p-1.5 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold shadow-subtle"
                >
                  Yopish
                </button>
              </div>
            )}
            {/* Live Stream Go Live Button on Map */}
            <button
              onClick={() => {
                if (!firebaseUser && !currentUser) {
                  setShowAuthModal(true);
                  return;
                }
                setLiveModalMode('broadcaster');
                setShowLiveModal(true);
              }}
              className="absolute top-3 right-3 z-40 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-xl px-3.5 py-2 rounded-full flex items-center space-x-1.5 font-bold text-xs transition transform active:scale-95 border border-white/20"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <Radio className="w-4 h-4" />
              <span>Jonli Efir</span>
            </button>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilterModal(!showFilterModal)}
              className="absolute top-14 right-3 z-40 bg-white shadow-lg p-3 rounded-full flex items-center space-x-2 border border-slate-200"
            >
              <div className="w-5 h-5 flex items-center justify-center bg-[#E8474A] rounded-full text-white font-bold text-[10px]">F</div>
            </button>

            {/* Filter Modal */}
            {showFilterModal && (
              <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-6 w-full space-y-4 shadow-2xl">
                    <h3 className="font-bold text-lg">Hudud bo'yicha filtr</h3>
                    <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterDistrict('Barchasi'); }} className="w-full p-3 rounded-xl border">
                        <option value="Barchasi">Barcha viloyatlar</option>
                        {Object.keys(UZ_LOCATIONS).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                    </select>
                    <select value={filterDistrict} onChange={(e) => setFilterDistrict(e.target.value)} className="w-full p-3 rounded-xl border">
                        <option value="Barchasi">Barcha tumanlar</option>
                        {UZ_LOCATIONS[filterRegion]?.map(dist => <option key={dist} value={dist}>{dist}</option>)}
                    </select>
                    <div className="flex space-x-2 pt-2">
                        <button onClick={() => setShowFilterModal(false)} className="flex-1 p-3 rounded-xl bg-gray-100 font-bold">Yopish</button>
                        <button onClick={() => { setShowFilterModal(false); /* Filter logic already handled by state */ }} className="flex-1 p-3 rounded-xl bg-[#E8474A] text-white font-bold">Qidirish</button>
                    </div>
                </div>
              </div>
            )}

            {/* Ghost Mode Notification Banner */}
            {!isLocationEnabled && !activeRouteUser && (
              <div className="bg-amber-50 border-b border-amber-200 p-2.5 px-3 flex items-center justify-between shrink-0 z-30 text-amber-900 text-xs shadow-sm">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-sm">👻</span>
                  <p className="truncate text-[11px] font-medium">Jonli lokatsiyangiz o'chirilgan (Ghost Mode).</p>
                </div>
                <button 
                  onClick={() => handleToggleLocation(true)}
                  className="bg-[#E8474A] text-white px-3 py-1 rounded-full text-[10px] font-bold shrink-0 ml-2 shadow-sm"
                >
                  GPS yoqish
                </button>
              </div>
            )}

            {gpsStatusMsg && (
              <div className="bg-rose-50 border-b border-rose-200 p-2 px-3 text-[#E8474A] text-[10px] font-semibold flex items-center justify-between z-30">
                <div className="flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{gpsStatusMsg}</span>
                </div>
                <button onClick={() => handleToggleLocation(true)} className="underline text-[10px] font-bold">
                  Qayta urinish
                </button>
              </div>
            )}
            
            {/* Map Container */}
            <div className="flex-1 relative z-10 w-full h-full" id="alov-leaflet-map" ref={(node) => {
              if (node) {
                if (!mapInstanceRef.current) {
                  import('leaflet').then(L => {
                    if (!node || mapInstanceRef.current) return;
                    const initialLat = userCoords?.lat || 41.311081;
                    const initialLng = userCoords?.lng || 69.240562;
                    const map = L.map(node).setView([initialLat, initialLng], 15);
                    mapInstanceRef.current = map;
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                      maxZoom: 19,
                      attribution: '© OpenStreetMap Alov.uz GPS'
                    }).addTo(map);
                    setTimeout(() => {
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.invalidateSize();
                      }
                    }, 250);
                  });
                }
              } else {
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.remove();
                  mapInstanceRef.current = null;
                  markersRef.current = {};
                }
              }
            }}></div>
          </div>

        )}

      </div>

      {/* Sticky Bottom Navigation inside Mockup - Pinned permanently to bottom */}
      {activeTab !== 'reels' && !(activeTab === 'chats' && chatView === 'conversation') && (
        <nav className="sticky bottom-0 left-0 right-0 z-50 shrink-0 bg-white/95 backdrop-blur-xl border-t border-[rgba(28,28,28,0.06)] px-1 py-2.5 flex items-center justify-around shadow-medium">
          <button onClick={() => setActiveTab('discover')} className={`flex flex-col items-center p-1 ${activeTab === 'discover' ? 'text-[#E8474A] font-bold' : 'text-[#6b635c]'}`}>
            <Users className="w-4 h-4" />
            <span className="text-[9px]">Nomzodlar</span>
          </button>
          <button onClick={() => setActiveTab('rooms')} className={`flex flex-col items-center p-1 ${activeTab === 'rooms' ? 'text-[#E8474A] font-bold' : 'text-[#6b635c]'}`}>
            <Radio className="w-4 h-4" />
            <span className="text-[9px]">Xonalar</span>
          </button>
          <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center p-1 ${activeTab === 'map' ? 'text-[#E8474A] font-bold' : 'text-[#6b635c]'}`}>
            <MapPin className="w-4 h-4" />
            <span className="text-[9px]">Xarita</span>
          </button>
          <button onClick={() => setActiveTab('reels')} className={`flex flex-col items-center p-1 ${activeTab === 'reels' ? 'text-[#E8474A] font-bold' : 'text-[#6b635c]'}`}>
            <Video className="w-4 h-4" />
            <span className="text-[9px]">Efirlar</span>
          </button>
          <button onClick={() => { setChatView('list'); setActiveTab('chats'); }} className={`flex flex-col items-center p-1 ${activeTab === 'chats' ? 'text-[#E8474A] font-bold' : 'text-[#6b635c]'}`}>
            <MessageCircle className="w-4 h-4" />
            <span className="text-[9px]">Chatlar</span>
          </button>
          <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center p-1 ${activeTab === 'profile' ? 'text-[#E8474A] font-bold' : 'text-[#6b635c]'}`}>
            <UserIcon className="w-4 h-4" />
            <span className="text-[9px]">Profil</span>
          </button>
        </nav>
      )}

    </div>
  );

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#FFFDF9] flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-rose-200 border-t-[#E8474A] animate-spin" />
          <Flame className="w-5 h-5 text-[#E8474A] absolute inset-0 m-auto animate-pulse" />
        </div>
        <div className="text-2xl font-black tracking-tight text-slate-900">
          alov<span className="text-[#E8474A]">.uz</span>
        </div>
        <p className="text-xs text-slate-500 font-medium">Sessiya tiklanmoqda...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFB] text-[#1C1C1C] font-sans selection:bg-[#E8474A] selection:text-white">
      
      {/* Landing Page */}
      {(!firebaseUser || activeTab === 'landing') && (
        <div>
          <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/90 border-b border-[rgba(28,28,28,0.06)] shadow-subtle">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
              <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('landing')}>
                <span className="text-2xl font-black tracking-tight text-[#1C1C1C]">
                  alov<span className="text-[#E8474A]">.uz</span>
                </span>
              </div>
              <button 
                onClick={() => setShowAuthModal(true)}
                className="bg-[#E8474A] text-white px-7 py-3 rounded-full font-semibold text-sm shadow-medium hover:bg-[#CB2E31] transition-all card-shadow-hover flex items-center space-x-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Kirish / Ro'yxatdan o'tish</span>
              </button>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-7 space-y-8">
                <span className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-[#FCEAEA] text-[#E8474A] text-xs font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-[#E8474A]" />
                  <span>Jiddiy Tanishuv va Jonli Efir Platformasi</span>
                </span>
                <h1 className="text-6xl md:text-[104px] font-editorial leading-[1.02] tracking-[-2.6px] text-[#1C1C1C]">
                  Oila <span className="italic text-[#E8474A]">shu yerdan</span> boshlanadi.
                </h1>
                <p className="text-[#57534E] text-lg font-normal leading-[1.65] max-w-xl">
                  Alov.uz — o'z juftini qidirayotganlar uchun maxsus yaratilgan ishonchli platforma. Google orqali kiring, jonli ovozli xonalar va video qo'ng'iroqlardan foydalaning!
                </p>
                <button 
                  onClick={() => setShowAuthModal(true)}
                  className="bg-[#E8474A] text-white px-8 py-4 rounded-full font-semibold text-base shadow-medium hover:bg-[#CB2E31] transition-all card-shadow-hover flex items-center space-x-2"
                >
                  <span>Xoziroq ro'yxatdan o'ting !</span>
                  <ArrowUpRight className="w-5 h-5" />
                </button>
              </div>

              <div className="lg:col-span-5 flex justify-center">
                <div className="bg-white p-6 rounded-[28px] card-shadow border w-full max-w-md relative overflow-hidden">
                  <div className="relative h-[480px] rounded-[20px] overflow-hidden bg-gradient-to-tr from-rose-100 to-pink-50">
                    <img 
                      src="https://i.pinimg.com/1200x/76/ef/1d/76ef1d3d0a406603cfbdd02b21d2a23c.jpg" 
                      alt="Alov.uz" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Dashboard inside smartphone mockup */}
      {firebaseUser && activeTab !== 'landing' && (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-rose-950 to-purple-950 flex flex-col items-center justify-center p-0 md:p-6 overflow-hidden">
          {showUpdateBanner && (
            <motion.div 
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-[390px] bg-amber-50 border-b border-amber-200 p-3 flex items-center justify-between z-[60] shadow-md mb-2 rounded-xl"
            >
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
                <span className="text-[11px] font-bold text-amber-900">Yangi versiya mavjud! Iltimos, ilovani yangilang.</span>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="bg-amber-600 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-sm"
              >
                YANGILASH
              </button>
            </motion.div>
          )}
          <div className="w-full md:w-[390px] h-[100dvh] md:h-[780px] bg-[#FAFAFB] md:rounded-[40px] md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] md:border-[6px] border-slate-900 relative overflow-hidden flex flex-col">
            {dashboardContent}
          </div>
        </div>
      )}

      {/* --- AUTHENTICATION MODAL (Google & Phone SMS Auth) --- */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 text-left space-y-4 relative shadow-2xl border border-slate-100">
            <button 
              onClick={() => {
                setShowAuthModal(false);
              }} 
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-4 text-center">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Alov.uz ga xush kelibsiz</h2>
                <p className="text-xs text-slate-500 font-medium">Platformaga kirish uchun Google akkauntingizdan foydalaning</p>
              </div>

              <div className="space-y-4 pt-2">
                <button 
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="w-full flex items-center justify-center space-x-3 py-4 px-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 font-bold text-sm shadow-xs bg-white text-slate-800 active:scale-98 transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoggingIn ? (
                    <div className="flex items-center space-x-2">
                      <RefreshCw className="w-4 h-4 text-rose-500 animate-spin" />
                      <span>Kirilmoqda...</span>
                    </div>
                  ) : (
                    <>
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.18v3.15C3.165 21.33 7.21 24 12 24z"/>
                        <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.18C.43 8.13 0 9.87 0 12s.43 3.87 1.18 5.39l4.09-3.15z"/>
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.21 0 3.165 2.67 1.18 6.61l4.09 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
                      </svg>
                      <span>Google orqali davom ettirish</span>
                    </>
                  )}
                </button>
                <p className="text-[10px] text-slate-400 text-center px-4">
                  Kirish orqali siz foydalanish shartlari va maxfiylik siyosatiga rozilik bildirasiz.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- PROFILE QUESTIONNAIRE / EDIT MODAL --- */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[32px] max-w-md w-full p-6 sm:p-7 space-y-5 max-h-[88vh] overflow-y-auto shadow-2xl border border-gray-200 relative text-slate-900">
            
            {/* Minimalist Close / Back Button */}
            <button 
              type="button" 
              onClick={() => setShowProfileModal(false)} 
              className="absolute top-5 right-5 p-2 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center space-x-1.5 text-xs font-bold transition duration-200 hover:scale-105 active:scale-95 shadow-xs"
            >
              <X className="w-3.5 h-3.5" />
              <span>Yopish</span>
            </button>

            <div className="space-y-1 pr-14">
              <h2 className="text-2xl font-black tracking-tight text-slate-900 flex items-center space-x-2">
                <span>Anketani to'ldirish</span>
                <Sparkles className="w-5 h-5 text-rose-500 animate-pulse" />
              </h2>
              <p className="text-xs text-slate-600 font-medium">Shaxsiy ma'lumotlar va lokatsiya sozlamalarini yangilang</p>
            </div>

            {/* Error Message Banner */}
            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-[#E8474A] text-xs font-semibold flex items-center space-x-2 animate-shake">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Profile Image & Upload Button */}
              <div className="flex flex-col items-center space-y-3 py-1">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-500 rounded-full blur-xs opacity-80 group-hover:opacity-100 transition duration-300"></div>
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white shadow-xl bg-slate-100">
                    <img src={regAvatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                  </div>
                </div>
                <label className="cursor-pointer inline-flex items-center space-x-2 bg-gradient-to-r from-red-500 via-pink-500 to-rose-600 hover:from-red-600 hover:to-pink-600 text-white font-bold py-2.5 px-5 rounded-full text-xs shadow-md transition duration-200 hover:scale-105 active:scale-95">
                  <Upload className="w-4 h-4" />
                  <span>Qurilmadan rasm yuklash</span>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              </div>

              {/* Jonli lokatsiyani yoqish (GPS) Card */}
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs flex items-center justify-between transition-all hover:border-red-300">
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center space-x-1.5">
                    <MapPin className="w-4 h-4 text-rose-500 animate-pulse" />
                    <span className="text-xs font-bold text-slate-900">Jonli lokatsiyani yoqish (GPS)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">Atrofdagilar sizni xaritada ko'rishi uchun</p>
                </div>
                <button 
                  type="button"
                  onClick={() => handleToggleLocation(!isLocationEnabled)}
                  className={`w-12 h-6.5 rounded-full transition-colors duration-300 p-0.5 flex items-center shadow-inner ${isLocationEnabled ? 'bg-gradient-to-r from-rose-500 to-pink-500 justify-end' : 'bg-slate-300 justify-start'}`}
                >
                  <span className="w-5.5 h-5.5 rounded-full bg-white shadow-md transform transition-transform duration-200" />
                </button>
              </div>

              {/* Lokatsiya Maxfiyligi (Privacy Guard) Card */}
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2 hover:border-red-300 transition-all">
                <label className="block text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                  <Shield className="w-4 h-4 text-rose-500" />
                  <span>Lokatsiya Maxfiyligi (Privacy Guard) 🔒</span>
                </label>
                <div className="relative">
                  <select 
                    value={regLocationVisibility}
                    onChange={(e) => handleLocationVisibilityChange(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all appearance-none cursor-pointer pr-8 shadow-xs"
                  >
                    <option value="mutual" className="text-gray-900 bg-white font-medium">Faqat obunachilarim / tanishlarimga 🔒 (Tavsiya etiladi)</option>
                    <option value="everyone" className="text-gray-900 bg-white font-medium">Barchaga ko'rinsin 🌍</option>
                    <option value="ghost" className="text-gray-900 bg-white font-medium">Hech kimga ko'rsatmaslik 👻 (Ghost Mode)</option>
                  </select>
                  <ChevronRight className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none rotate-90" />
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Qizlar va barcha foydalanuvchilar xavfsizligi uchun marshrut faqat ruxsat berilgan tanishlarga ko'rinadi.
                </p>
              </div>

              {/* Input Fields in Crisp Light Mode */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Ism va Familiya</label>
                  <input 
                    type="text" 
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none placeholder:text-gray-400"
                    placeholder="Ismingiz..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Yosh</label>
                    <input 
                      type="number" 
                      value={regAge}
                      onChange={(e) => setRegAge(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Jins</label>
                    <select 
                      value={regGender}
                      onChange={(e) => setRegGender(e.target.value as any)}
                      className="w-full px-3.5 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none"
                    >
                      <option value="female" className="text-gray-900 bg-white font-medium">Ayol / Qiz</option>
                      <option value="male" className="text-gray-900 bg-white font-medium">Erkak / Yigit</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Viloyat</label>
                  <select 
                    value={regRegion}
                    onChange={(e) => { 
                      const reg = e.target.value;
                      setRegRegion(reg);
                      setRegDistrict(UZ_LOCATIONS[reg]?.[0] || '');
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none"
                  >
                    {Object.keys(UZ_LOCATIONS).map(reg => (
                      <option key={reg} value={reg} className="text-gray-900 bg-white font-medium">{reg}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Tuman / Shahar</label>
                    <select 
                      value={regDistrict}
                      onChange={(e) => setRegDistrict(e.target.value)}
                      className="w-full px-3.5 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none"
                    >
                      {UZ_LOCATIONS[regRegion]?.map(dist => (
                        <option key={dist} value={dist} className="text-gray-900 bg-white font-medium">{dist}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Mahalla / Ko'cha</label>
                    <input 
                      type="text" 
                      placeholder="Mahalla"
                      value={regNeighborhood}
                      onChange={(e) => setRegNeighborhood(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Telefon Raqam</label>
                  <input 
                    type="text" 
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Telegram</label>
                    <input 
                      type="text" 
                      placeholder="@username"
                      value={regTelegram}
                      onChange={(e) => setRegTelegram(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Instagram</label>
                    <input 
                      type="text" 
                      placeholder="@handle"
                      value={regInstagram}
                      onChange={(e) => setRegInstagram(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">O'zingiz haqingizda (Bio)</label>
                  <textarea 
                    rows={2}
                    value={regBio}
                    onChange={(e) => setRegBio(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-5 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition duration-200 hover:scale-[1.02] active:scale-95"
                >
                  Orqaga
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-red-500 via-pink-500 to-rose-600 hover:from-red-600 hover:to-pink-600 text-white font-bold text-xs shadow-lg shadow-pink-500/25 transition duration-200 hover:scale-[1.02] active:scale-95"
                >
                  Saqlash va Boshlash ✨
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- PUBLIC LOCATION SAFETY LIABILITY NOTICE MODAL (10s Countdown Timer - NO INNER SCROLL) --- */}
      {showLiabilityModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fadeIn">
          <div className="bg-white rounded-[32px] max-w-md w-full p-6 sm:p-7 space-y-4 relative select-none shadow-2xl border border-rose-100">
            
            <div className="flex items-center space-x-2.5 text-[#E8474A]">
              <div className="p-2 rounded-2xl bg-rose-100">
                <AlertTriangle className="w-6 h-6 shrink-0 animate-bounce text-[#E8474A]" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Xavfsizlik va Mas'uliyat Omonati</h3>
            </div>

            {/* Expands dynamically without inner text scrollbar */}
            <div className="space-y-3 text-xs text-slate-700 bg-rose-50 p-4 rounded-2xl border border-rose-200 leading-relaxed">
              <p className="font-extrabold text-[#E8474A] flex items-center space-x-1">
                <span>⚠️ DIQQAT! Lokatsiyangizni barchaga ochiq rejimga o'tkazmoqdasiz!</span>
              </p>
              <p>
                Ushbu rejim yoqilganda platformadagi barcha foydalanuvchilar sizning xaritadagi jonli GPS joylashuvingizni ko'ra oladilar va siz tomonga ko'chalar bo'ylab marshrut chizishlari mumkin bo'ladi.
              </p>
              <p className="font-bold text-slate-900">
                Xavfsizlik qoidalari buzilsa, noxush holatlar yoki shaxsiy xavfsizlik bilan bog'liq har qanday muammo yuzaga kelsa, Alov.uz platformasi va Ma'muriyati mutlaqo javobgar emas va hech qanday mas'uliyatni o'z zimmasiga olmaydi.
              </p>
              <p className="text-[11px] text-slate-600 italic">
                Ushbu qaror va uning oqibatlari uchun barcha mas'uliyat hamda xavf-xatarlarni to'liq va shaxsan o'z zimmasiga olasiz.
              </p>
            </div>

            <div className="text-center">
              {liabilityCountdown > 0 ? (
                <span className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping mr-1" />
                  Iltimos, diqqat bilan o'qing: {liabilityCountdown} soniya
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold shadow-xs">
                  ✓ O'qib chiqildi. Barcha shartlarni qabul qilishingiz mumkin.
                </span>
              )}
            </div>

            <div className="flex space-x-2.5 pt-1">
              <button 
                type="button"
                onClick={() => {
                  setRegLocationVisibility('mutual');
                  setShowLiabilityModal(false);
                  if (timerRef.current) clearInterval(timerRef.current);
                }}
                className="px-4 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition duration-200 shrink-0"
              >
                Bekor qilish
              </button>
              <button 
                type="button"
                disabled={liabilityCountdown > 0}
                onClick={() => {
                  setIsLocationEnabled(true);
                  setRegLocationVisibility('everyone');
                  setShowLiabilityModal(false);
                  if (timerRef.current) clearInterval(timerRef.current);
                }}
                className={`flex-1 py-3.5 rounded-xl font-bold text-xs shadow-md transition duration-200 ${
                  liabilityCountdown > 0 
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-red-500 via-pink-500 to-rose-600 hover:from-red-600 hover:to-pink-600 text-white shadow-pink-500/25 hover:scale-[1.02] active:scale-95 cursor-pointer'
                }`}
              >
                {liabilityCountdown > 0 ? `Kutib turing (${liabilityCountdown}s)` : 'Roziman va Tasdiqlayman ✨'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- IMAGE CROP & ZOOM EDITING MODAL (Renders ON TOP with z-[100]) --- */}
      {showCropModal && cropImageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[28px] max-w-sm w-full p-5 space-y-4 relative card-shadow select-none shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Crop className="w-5 h-5 text-[#E8474A]" />
                <h3 className="font-bold text-sm text-slate-900">Rasmni moslashtirish</h3>
              </div>
              <button onClick={() => setShowCropModal(false)} className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Barmoq/sichqoncha bilan rasmni suring va zoom orqali joylashuvini to'g'rilang:
            </p>

            {/* Circular Preview Container with Drag and Pinch capabilities */}
            <div 
              className="relative w-56 h-56 mx-auto rounded-full overflow-hidden border-4 border-[#E8474A] shadow-lg bg-slate-900 cursor-move flex items-center justify-center touch-none"
              onMouseDown={(e) => {
                setIsDraggingPan(true);
                dragStartRef.current = { x: e.clientX - cropPan.x, y: e.clientY - cropPan.y };
              }}
              onMouseMove={(e) => {
                if (!isDraggingPan) return;
                setCropPan({
                  x: e.clientX - dragStartRef.current.x,
                  y: e.clientY - dragStartRef.current.y
                });
              }}
              onMouseUp={() => setIsDraggingPan(false)}
              onMouseLeave={() => setIsDraggingPan(false)}
              onTouchStart={(e) => {
                if (e.touches.length === 1) {
                  setIsDraggingPan(true);
                  dragStartRef.current = { 
                    x: e.touches[0].clientX - cropPan.x, 
                    y: e.touches[0].clientY - cropPan.y 
                  };
                }
              }}
              onTouchMove={(e) => {
                if (isDraggingPan && e.touches.length === 1) {
                  setCropPan({
                    x: e.touches[0].clientX - dragStartRef.current.x,
                    y: e.touches[0].clientY - dragStartRef.current.y
                  });
                }
              }}
              onTouchEnd={() => setIsDraggingPan(false)}
            >
              <img 
                src={cropImageSrc} 
                alt="Crop preview" 
                className="max-w-none transition-transform duration-75 pointer-events-none select-none"
                style={{
                  transform: `scale(${cropScale}) translate(${cropPan.x / cropScale}px, ${cropPan.y / cropScale}px)`,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            </div>

            {/* Zoom Slider and Controls */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center space-x-3 px-2">
                <button 
                  type="button"
                  onClick={() => setCropScale(prev => Math.max(1, prev - 0.2))} 
                  className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <input 
                  type="range" 
                  min="1" 
                  max="3" 
                  step="0.05"
                  value={cropScale}
                  onChange={(e) => setCropScale(parseFloat(e.target.value))}
                  className="flex-1 accent-[#E8474A] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
                <button 
                  type="button"
                  onClick={() => setCropScale(prev => Math.min(3, prev + 0.2))} 
                  className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 px-2">
                <span>1x (Oddiy)</span>
                <span>Zoom: {cropScale.toFixed(2)}x</span>
                <span>3x (Kattaroq)</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-2">
              <button 
                type="button"
                onClick={() => {
                  setCropScale(1);
                  setCropPan({ x: 0, y: 0 });
                }}
                className="px-3 py-2.5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-all flex items-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tiklash</span>
              </button>
              <button 
                type="button"
                onClick={handleApplyCrop}
                className="flex-1 py-2.5 rounded-full bg-[#E8474A] text-white font-bold text-xs shadow-md hover:bg-[#CB2E31] transition-all flex items-center justify-center space-x-1.5"
              >
                <span>Saqlash va Tasdiqlash ✨</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PUBLIC USER PROFILE POPUP MODAL (Triggered from Map or Candidate Cards) --- */}
      {selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 space-y-4 relative card-shadow max-h-[90vh] overflow-y-auto border border-slate-100 shadow-2xl text-slate-900">
            <button 
              onClick={() => setSelectedProfile(null)} 
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-4 pt-1">
              <div className="relative w-18 h-18 rounded-full overflow-hidden border-2 border-[#E8474A] shrink-0 bg-slate-100 shadow-md">
                <img 
                  src={selectedProfile.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                  alt={selectedProfile.name} 
                  className="w-full h-full object-cover object-center" 
                  onError={(e: any) => { e.target.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'; }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-editorial font-bold text-slate-900 truncate">{selectedProfile.name}, {selectedProfile.age}</h3>
                <p className="text-[10px] font-bold text-[#E8474A]">ID: {selectedProfile.id}</p>
                <p className="text-[11px] text-slate-500 truncate">{selectedProfile.district}, {selectedProfile.region}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center bg-[#FAFAFB] p-3 rounded-[16px] border border-slate-100">
              <div>
                <p className="text-sm font-black text-[#E8474A]">{selectedProfile.followersCount || 120}</p>
                <p className="text-[9px] text-slate-500 font-bold">Obunachilar</p>
              </div>
              <div>
                <p className="text-sm font-black text-purple-600">{selectedProfile.followingCount || 45}</p>
                <p className="text-[9px] text-slate-500 font-bold">Obunalar</p>
              </div>
              <div>
                <p className="text-sm font-black text-pink-600">{selectedProfile.likesCount || 340}</p>
                <p className="text-[9px] text-slate-500 font-bold">Laiklar</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-[#FAFAFB] p-3.5 rounded-[14px] leading-relaxed border border-slate-100">{selectedProfile.bio || 'Alov.uz da yangi tanishuvlar va suhbatlar uchun.'}</p>

            <div className="flex space-x-2 pt-1">
              <button 
                onClick={() => handleToggleFollow(selectedProfile.id)} 
                className={`flex-1 py-2.5 rounded-full font-bold text-xs shadow-sm transition-all active:scale-95 ${followingIds.includes(selectedProfile.id) ? 'bg-slate-200 text-slate-800' : 'bg-[#E8474A] text-white hover:bg-[#CB2E31]'}`}
              >
                {followingIds.includes(selectedProfile.id) ? 'Obuna bo\'lingan' : '+ Obuna bo\'lish'}
              </button>
              <button 
                onClick={() => {
                  openChatWithUser(selectedProfile);
                  setSelectedProfile(null);
                }} 
                className="flex-1 py-2.5 rounded-full bg-[#E8474A] hover:bg-[#CB2E31] text-white font-bold text-xs shadow-sm flex items-center justify-center space-x-1 active:scale-95 transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Chat yozish</span>
              </button>
            </div>

            <button 
              onClick={() => {
                handleDrawRouteToUser(selectedProfile);
                setSelectedProfile(null);
              }} 
              className="w-full py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-1.5 active:scale-95 transition-all"
            >
              <Navigation className="w-3.5 h-3.5 text-rose-400" />
              <span>Marshrut chizish (Yo'l) 🚗</span>
            </button>
          </div>
        </div>
      )}

      {/* --- LIVE STREAM (JONLI EFIR) MODAL --- */}
      {showLiveModal && (
        <LiveStreamModal
          mode={liveModalMode}
          streamId={activeLiveStreamId}
          hostUser={activeLiveHostUser}
          currentUser={{
            uid: currentUser?.uid || firebaseUser?.uid,
            id: currentUser?.id,
            name: currentUser?.name || firebaseUser?.displayName || 'Alov Foydalanuvchisi',
            avatar: currentUser?.avatar || firebaseUser?.photoURL || ''
          }}
          onClose={() => {
            setShowLiveModal(false);
            setActiveLiveStreamId(undefined);
            setActiveLiveHostUser(undefined);
          }}
        />
      )}

      {/* --- AUDIO ROOM (OVOZLI XONA) MODAL --- */}
      {showAudioRoomModal && (
        <AudioRoomModal
          roomCode={audioRoomCode}
          roomTitle={audioRoomTitle}
          currentUser={{
            uid: currentUser?.uid || firebaseUser?.uid || 'user_' + Date.now(),
            name: currentUser?.name || firebaseUser?.displayName || 'Alov Foydalanuvchisi',
            avatar: currentUser?.avatar || firebaseUser?.photoURL || ''
          }}
          onClose={() => setShowAudioRoomModal(false)}
        />
      )}

    </div>
  );
}
