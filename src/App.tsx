/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Heart, Flame, Radio, MessageCircle, User as UserIcon, Sparkles, Video, 
  MapPin, Send, Mic, Play, Plus, Users, Eye, ThumbsUp, Smartphone, 
  ChevronRight, X, ArrowUpRight, ShieldCheck, Globe, LogIn, LogOut, CheckCircle2, Edit3, ArrowLeft, VideoOff,
  ZoomIn, ZoomOut, Move, Crop, AlertTriangle, RefreshCw, Navigation, Shield, Lock, EyeOff, Car, Upload,
  Clock, Check, CheckCheck, Gift, Coins, Wallet, CreditCard, Handshake, Crown, ScanFace
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LandingPage } from './LandingPage';
import { LiveStreamModal } from './components/LiveStreamModal';
import { OneOnOneCallModal } from './components/OneOnOneCallModal';
import { IncomingCallModal } from './components/IncomingCallModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { FaceIdVerificationModal, type FaceIdVerificationResult } from './components/FaceIdVerificationModal';
import { callNotification } from './services/callNotification';
import { VideoPlayer, VoiceMessage } from './components/ChatMedia';
import { CandidateSkeleton, ChatSkeleton } from './components/Skeleton';
import { 
  auth, googleProvider, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, 
  setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, User
} from './firebase';
import { getApiUrl, getBaseUrl, safeFetchJson } from './config/api';
import { io, Socket } from 'socket.io-client';
import {
  buildTelegramDisplayName,
  isPlaceholderAvatar,
  isPlaceholderOrUsername,
  pickPreferredAvatar
} from './utils/telegramProfile';
import {
  MESSAGE_COIN_COST,
  DIAMOND_LIMIT_TARGET,
  ADMIN_FULL_COINS,
  ADMIN_FULL_DIAMONDS,
  isAdminTelegramUser,
  getDiamondProgressPercent,
  getPendingDiamondsTotal,
  getNextUnlockTimestamp,
  computeCountdownParts
} from './utils/tokenomics';
import {
  requiresFaceIdForUser,
  formatFaceIdDateUz,
  genderToUzLabel,
  type FaceIdProfileData,
} from './utils/faceId';

function resolveAvatarUrl(rawUrl?: string | null): string {
  const clean = pickPreferredAvatar(rawUrl);
  if (!clean) return '';
  if (clean.startsWith('/api/')) {
    return `${getBaseUrl()}${clean}`;
  }
  return clean;
}

function getSafeUserDisplayName(user: any, fallback: string = 'Profil'): string {
  if (!user) return fallback;
  const fromParts = buildTelegramDisplayName({
    firstName: user.firstName || user.first_name || user.name,
    lastName: user.lastName || user.last_name,
    username: user.telegram || user.username,
    phone: user.phone,
  });
  if (fromParts) return fromParts;
  if (user.name && !isPlaceholderOrUsername(user.name, user.telegram || user.username, user.phone)) {
    return user.name;
  }
  return fallback;
}

/** Utility for Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Calculate dynamic age from birth date string (YYYY-MM-DD)
function calculateAge(birthDateStr?: string, fallbackAge: number = 22): number {
  if (!birthDateStr) return fallbackAge;
  try {
    const birthDate = new Date(birthDateStr);
    if (isNaN(birthDate.getTime())) return fallbackAge;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 ? age : fallbackAge;
  } catch (e) {
    return fallbackAge;
  }
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
    "Bektemir tumani", "Olmazor tumani", "Yangihayot tumani", "Yashnobod tumani"
  ],
  "Toshkent viloyati": [
    "Nurafshon shahri", "Angren shahri", "Olmaliq shahri", "Chirchiq shahri", "Bekobod shahri", 
    "Yangiyo'l shahri", "Ohangaron shahri", "Oqqo'rg'on tumani", "Bekobod tumani", 
    "Bo'stonliq tumani", "Bo'ka tumani", "Qibray tumani", "Quyi Chirchiq tumani", 
    "Zangiota tumani", "Yuqori Chirchiq tumani", "Piskent tumani", "Parkent tumani", 
    "O'rta Chirchiq tumani", "Chinoz tumani", "Yangiyo'l tumani", "Toshkent tumani", "Ohangaron tumani"
  ],
  "Andijon viloyati": [
    "Andijon shahri", "Xonobod shahri", "Andijon tumani", "Asaka tumani", "Baliqchi tumani", 
    "Buloqboshi tumani", "Bo'ston tumani", "Izboskan tumani", "Jalaquduq tumani", 
    "Marhamat tumani", "Oltinko'l tumani", "Paxtaobod tumani", "Shahrixon tumani", 
    "Ulug'nor tumani", "Xo'jaobod tumani", "Qo'rg'ontepa tumani"
  ],
  "Farg'ona viloyati": [
    "Farg'ona shahri", "Marg'ilon shahri", "Qo'qon shahri", "Quvasoy shahri", "Oltiariq tumani", 
    "Bag'dod tumani", "Beshariq tumani", "Buvayda tumani", "Dang'ara tumani", "Yozyovon tumani", 
    "Quva tumani", "Qo'shtepa tumani", "Rishton tumani", "So'x tumani", "Toshloq tumani", 
    "Uchko'prik tumani", "O'zbekiston tumani", "Farg'ona tumani", "Furqat tumani"
  ],
  "Namangan viloyati": [
    "Namangan shahri", "Namangan tumani", "Chortoq tumani", "Chust tumani", "Kosonsoy tumani", 
    "Mingbuloq tumani", "Norin tumani", "Pop tumani", "To'raqo'rg'on tumani", 
    "Uychi tumani", "Uchqo'rg'on tumani", "Yangiqo'rg'on tumani", "Davlatobod tumani", "Yangi Namangan tumani"
  ],
  "Buxoro viloyati": [
    "Buxoro shahri", "Kogon shahri", "Buxoro tumani", "Vobkent tumani", "G'ijduvon tumani", 
    "Jondor tumani", "Kogon tumani", "Qorako'l tumani", "Qorovulbozor tumani", 
    "Olot tumani", "Peshku tumani", "Romitan tumani", "Shofirkon tumani"
  ],
  "Samarqand viloyati": [
    "Samarqand shahri", "Kattaqo'rg'on shahri", "Oqdaryo tumani", "Bulung'ur tumani", 
    "Jomboy tumani", "Ishtixon tumani", "Kattaqo'rg'on tumani", "Narpay tumani", 
    "Nuropod tumani", "Payariq tumani", "Pastdarg'om tumani", 
    "Paxtachi tumani", "Samarqand tumani", "Toyloq tumani", "Urgut tumani", "Qo'shrabot tumani"
  ],
  "Qashqadaryo viloyati": [
    "Qarshi shahri", "Shahrisabz shahri", "G'uzor tumani", "Dehqonobod tumani", 
    "Qamashi tumani", "Qarshi tumani", "Kasbi tumani", "Kitob tumani", "Koson tumani", 
    "Mirishkor tumani", "Muborak tumani", "Nishon tumani", "Chiroqchi tumani", 
    "Shahrisabz tumani", "Yakkabog' tumani", "Ko'kdala tumani"
  ],
  "Surxondaryo viloyati": [
    "Termiz shahri", "Angor tumani", "Boysun tumani", "Denov tumani", "Jarqo'rg'on tumani", 
    "Qiziriq tumani", "Qumqo'rg'on tumani", "Muzrabot tumani", "Oltinsoy tumani", 
    "Sariosiyo tumani", "Termiz tumani", "Uzun tumani", "Sherobod tumani", "Sho'rchi tumani", "Bandixon tumani"
  ],
  "Navoiy viloyati": [
    "Navoiy shahri", "Zarafshon shahri", "G'ozg'on shahri", "Karmana tumani", "Konimex tumani", 
    "Qiziltepa tumani", "Navbahor tumani", "Nurota tumani", "Tomdi tumani", "Uchquduq tumani", "Xatirchi tumani"
  ],
  "Jizzax viloyati": [
    "Jizzax shahri", "Arnasoy tumani", "Baxmal tumani", "G'allaorol tumani", "Do'stlik tumani", 
    "Sharof Rashidov tumani", "Zarbdor tumani", "Zafarobod tumani", "Zomin tumani", 
    "Mirzachul tumani", "Paxtakor tumani", "Yangiobod tumani", "Forish tumani"
  ],
  "Sirdaryo viloyati": [
    "Guliston shahri", "Shirin shahri", "Yangiyer shahri", "Boyovut tumani", "Guliston tumani", 
    "Sardoba tumani", "Mirzaobod tumani", "Sayxunobod tumani", "Sirdaryo tumani", "Oqoltin tumani", "Xovos tumani"
  ],
  "Xorazm viloyati": [
    "Urganch shahri", "Xiva shahri", "Bog'ot tumani", "Gurlan tumani", "Qo'shko'pir tumani", 
    "Shovot tumani", "Urganch tumani", "Xiva tumani", "Xonqa tumani", "Hazorasp tumani", "Yangiarik tumani", "Yangibozor tumani", "Tuproqqala tumani"
  ],
  "Qoraqalpog'iston Respublikasi": [
    "Nukus shahri", "Amudaryo tumani", "Beruniy tumani", "Kegeyli tumani", "Qonlikul tumani", 
    "Qorao'zak tumani", "Qo'ng'irot tumani", "Mo'ynoq tumani", "Nukus tumani", 
    "Taxtako'pir tumani", "To'rtko'l tumani", "Xo'jayli tumani", "Chimboy tumani", 
    "Sho'manoy tumani", "Ellikqal'a tumani", "Taxiatosh tumani", "Bo'zatov tumani"
  ]
};

const ALOV_AI_USER = {
  uid: 'alov_ai_bot',
  id: 'ALOV-AI',
  name: 'Alov AI',
  avatar: '/assets/aistudio/image_e20a1307.png',
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
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'register_face_id' | 'google_face_id' | 'google_setup' | 'telegram'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any | null>(null);
  const [telegramInput, setTelegramInput] = useState('');
  const [telegramStep, setTelegramStep] = useState<'input_phone' | 'input_code' | 'face_id' | 'profile_setup'>('input_phone');
  const [generatedTgCode, setGeneratedTgCode] = useState('');
  const [enteredTgCode, setEnteredTgCode] = useState('');
  const [pendingTgUser, setPendingTgUser] = useState<any | null>(null);
  const [pendingFaceId, setPendingFaceId] = useState<FaceIdProfileData | null>(null);
  const [hasStartedBotError, setHasStartedBotError] = useState<boolean>(false);

  // Profile Form Fields (including Avatar URL and Location Visibility)
  const [regName, setRegName] = useState('');
  const [regBirthDate, setRegBirthDate] = useState('2002-05-15');
  const [regAge, setRegAge] = useState('22');
  const [regGender, setRegGender] = useState<'male' | 'female'>('female');
  const [regRegion, setRegRegion] = useState('Toshkent shahri');
  const [regDistrict, setRegDistrict] = useState('Yunusobod tumani');
  const [regNeighborhood, setRegNeighborhood] = useState('Bodomzor');
  const [regPhone, setRegPhone] = useState('+99890');
  const [regTelegram, setRegTelegram] = useState('');
  const [regInstagram, setRegInstagram] = useState('');
  const [regBio, setRegBio] = useState('Alov.uz da yangi tanishuvlar va suhbatlar uchun.');
  const [regAvatar, setRegAvatar] = useState('');
  const [regLocationVisibility, setRegLocationVisibility] = useState<'everyone' | 'mutual' | 'ghost'>('everyone');

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
  const chatMessagesContainerRef = useRef<HTMLDivElement>(null);

  const [usersList, setUsersList] = useState<any[]>([]);
  const [chatsList, setChatsList] = useState<any[]>([]);
  const [filterRegion, setFilterRegion] = useState('Barchasi');
  const [filterDistrict, setFilterDistrict] = useState('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [chatFriendships, setChatFriendships] = useState<Record<string, boolean>>({});
  const [countdownNow, setCountdownNow] = useState<number>(() => Date.now());

  // OSRM Street Routing State
  const [activeRouteUser, setActiveRouteUser] = useState<any | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: string; durationMin: number } | null>(null);
  const mapPolylineRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, any>>({});
  const hasCenteredMapRef = useRef<boolean>(false);
  const [mapReadyTick, setMapReadyTick] = useState(0);

  // Chat view substate: 'list' or 'conversation'
  const [chatView, setChatView] = useState<'list' | 'conversation'>('list');

  // Live Stream (Jonli Efir) states
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [liveModalMode, setLiveModalMode] = useState<'broadcaster' | 'viewer'>('broadcaster');
  const [activeLiveStreamId, setActiveLiveStreamId] = useState<string | undefined>(undefined);
  const [activeLiveHostUser, setActiveLiveHostUser] = useState<any | undefined>(undefined);
  // 1-on-1 WebRTC Video Call & Screen Sharing states
  const [activeCallUser, setActiveCallUser] = useState<any | null>(null);
  const [incomingCallData, setIncomingCallData] = useState<any | null>(null);
  // Tokenomics (Moneta & Almaz) States
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [topUpPackage, setTopUpPackage] = useState<{ coins: number; uzs: number }>({ coins: 300, uzs: 28000 });
  const [paymentProvider, setPaymentProvider] = useState<'click' | 'payme' | 'uzum' | 'telegram_stars'>('click');
  const [withdrawCardNumber, setWithdrawCardNumber] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState<number>(100);
  const [walletNoticeMsg, setWalletNoticeMsg] = useState('');

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
  const [mobileChatViewportHeight, setMobileChatViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleViewportChange = () => {
      if (window.visualViewport) {
        setMobileChatViewportHeight(window.visualViewport.height);
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
      return () => {
        window.visualViewport?.removeEventListener('resize', handleViewportChange);
        window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      };
    }
  }, []);

  const socketRef = useRef<Socket | null>(null);

  const currentUserRef = useRef<any>(null);
  const selectedChatUserRef = useRef<any>(null);

  useEffect(() => {
    currentUserRef.current = currentUser || (firebaseUser ? { uid: firebaseUser.uid, name: firebaseUser.displayName } : null);
  }, [currentUser, firebaseUser]);

  useEffect(() => {
    selectedChatUserRef.current = selectedChatUser;
  }, [selectedChatUser]);

  useEffect(() => {
    const socket = socketRef.current;
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (socket && myUid) {
      socket.emit('register_user', myUid);
      if (selectedChatUser) {
        const otherUid = selectedChatUser.uid || selectedChatUser.id;
        if (otherUid) {
          const chatId = [myUid, otherUid].sort().join('_');
          socket.emit('join_chat', chatId);
        }
      }
    }
  }, [currentUser?.uid, firebaseUser?.uid, selectedChatUser?.uid, selectedChatUser?.id]);

  useEffect(() => {
    const socket = io(getBaseUrl());
    socketRef.current = socket;

    const registerSocketUser = () => {
      const myUid = currentUserRef.current?.uid || firebaseUser?.uid || currentUser?.uid;
      if (myUid) {
        socket.emit('register_user', myUid);
      }
      const activeSelUser = selectedChatUserRef.current;
      if (myUid && activeSelUser) {
        const otherUid = activeSelUser.uid || activeSelUser.id;
        if (otherUid) {
          const chatId = [myUid, otherUid].sort().join('_');
          socket.emit('join_chat', chatId);
        }
      }
    };

    socket.on('connect', registerSocketUser);

    socket.on('active_users_count', ({ count }: { count: number }) => {
      if (typeof count === 'number' && count > 0) {
        setActiveUsersCount(count);
      }
    });

    const handleIncomingChatMessage = (payload: any) => {
      const msg = payload.message || payload;
      const chatId = payload.chatId;
      const myUid = currentUserRef.current?.uid || firebaseUser?.uid || currentUser?.uid;
      const currentSelUser = selectedChatUserRef.current;

      let partnerId = payload.senderId === myUid ? payload.recipientId : payload.senderId;
      if (!partnerId && msg.senderId) {
        partnerId = msg.senderId === myUid ? payload.recipientId : msg.senderId;
      }
      if (!partnerId && currentSelUser) {
        partnerId = currentSelUser.uid || currentSelUser.id;
      }

      if (!partnerId && !chatId) return;

      const newMsg = {
        ...msg,
        status: msg.status || (msg.senderId === myUid ? 'sent' : 'read'),
        time: msg.time || new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages(prev => {
        const keysToUpdate = Array.from(new Set([
          chatId, partnerId, payload.senderId, payload.recipientId, currentSelUser?.id, currentSelUser?.uid
        ].filter(Boolean))) as string[];

        const next = { ...prev };
        keysToUpdate.forEach(k => {
          const currentMsgs = prev[k] || [];
          const existingIdx = currentMsgs.findIndex(m => m.id === newMsg.id);
          let updatedMsgs: any[];
          if (existingIdx > -1) {
            updatedMsgs = [...currentMsgs];
            updatedMsgs[existingIdx] = { ...updatedMsgs[existingIdx], ...newMsg };
          } else {
            updatedMsgs = [...currentMsgs, newMsg];
          }
          next[k] = updatedMsgs;
        });

        if (chatId && next[chatId]) {
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(next[chatId]));
          } catch (e) {}
        }

        return next;
      });

      // Update chatsList so this chat never disappears and keeps partner profile
      if (chatId) {
        setChatsList(prev => {
          const existingIdx = prev.findIndex(c => c.id === chatId);
          let updated = [...prev];
          const lastMsg = msg.text || (msg.type === 'image' ? 'Rasm 🖼️' : 'Xabar');
          const partnerInfo = payload.message?.sender || (partnerId ? {
            uid: partnerId,
            id: partnerId,
            name: msg.senderName || selectedChatUser?.name || 'Foydalanuvchi',
            avatar: msg.senderAvatar || selectedChatUser?.avatar || ''
          } : undefined);

          if (existingIdx > -1) {
            const item = { 
              ...updated[existingIdx], 
              lastMessage: lastMsg, 
              updatedAt: msg.createdAt || new Date().toISOString(),
              partner: updated[existingIdx].partner || partnerInfo
            };
            updated.splice(existingIdx, 1);
            updated.unshift(item);
          } else {
            updated.unshift({
              id: chatId,
              participants: [myUid, partnerId].filter(Boolean),
              lastMessage: lastMsg,
              updatedAt: msg.createdAt || new Date().toISOString(),
              partner: partnerInfo
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

      // If incoming message is from partner while we have their chat open, emit mark_read
      if (msg.senderId && msg.senderId !== myUid && currentSelUser && (currentSelUser.id === partnerId || currentSelUser.uid === partnerId)) {
        socketRef.current?.emit('mark_read', {
          chatId,
          messageIds: [msg.id],
          senderId: msg.senderId,
          recipientId: myUid
        });
      }

      if (msg.senderId === ALOV_AI_USER.uid || msg.senderId === 'user_kamola_006' || msg.senderId === 'ALOV-006') {
        setIsAiTyping(false);
      }
    };

    socket.on('receive_message', handleIncomingChatMessage);
    socket.on('chat:message', handleIncomingChatMessage);

    socket.on('message_ack', ({ chatId, messageId, status }: any) => {
      setChatMessages(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (next[k]) {
            next[k] = next[k].map(m => m.id === messageId ? { ...m, status: status || 'sent' } : m);
          }
        });
        if (chatId && next[chatId]) {
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(next[chatId]));
          } catch (e) {}
        }
        return next;
      });
    });

    socket.on('message_read', ({ chatId, messageIds }: any) => {
      setChatMessages(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (next[k]) {
            next[k] = next[k].map(m => {
              if (!messageIds || messageIds.includes(m.id)) {
                return { ...m, status: 'read', read: true };
              }
              return m;
            });
          }
        });
        if (chatId && next[chatId]) {
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(next[chatId]));
          } catch (e) {}
        }
        return next;
      });
    });

    socket.on('user_typing', ({ uid, isTyping }) => {
      const currentSelUser = selectedChatUserRef.current;
      if (currentSelUser && (currentSelUser.uid === uid || currentSelUser.id === uid)) {
        setIsOtherTyping(isTyping);
      }
    });

    // 1-on-1 WebRTC Video Call Signaling & Notifications
    const handleIncomingCall = ({ offer, caller, callerSocketId }: any) => {
      setIncomingCallData({ caller, offer, callerSocketId });
      callNotification.requestPermission().catch(() => {});
    };

    callNotification.setActionCallback((action, _data) => {
      if (action === 'accept') {
        setIncomingCallData((prev: any) => {
          if (prev?.caller) {
            setActiveCallUser(prev.caller);
          }
          return prev;
        });
      } else {
        setIncomingCallData((prev: any) => {
          if (prev?.caller) {
            const targetUid = prev.caller.uid || prev.caller.id;
            socketRef.current?.emit('reject-call', { targetUid, targetSocketId: prev.callerSocketId });
            socketRef.current?.emit('end-call', { targetUid, targetSocketId: prev.callerSocketId });
          }
          return null;
        });
        setActiveCallUser(null);
      }
    });

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-made', handleIncomingCall);

    socket.on('call-rejected', () => {
      callNotification.dismissNotifications();
      callNotification.stopRingtone();
      setIncomingCallData(null);
      setActiveCallUser(null);
    });

    socket.on('call-ended', () => {
      callNotification.dismissNotifications();
      callNotification.stopRingtone();
      setIncomingCallData(null);
      setActiveCallUser(null);
    });

    socket.on('friendship_updated', ({ chatId, friendship }: any) => {
      if (chatId) {
        setChatFriendships(prev => ({ ...prev, [chatId]: Boolean(friendship?.active) }));
      }
    });

    socket.on('insufficient_coins', ({ message }: any) => {
      setWalletNoticeMsg(message || `Monetalaringiz yetarli emas! Har bir xabar narxi ${MESSAGE_COIN_COST} moneta.`);
      setShowTopUpModal(true);
    });

    return () => {
      socket.off('connect', registerSocketUser);
      socket.off('active_users_count');
      socket.off('receive_message', handleIncomingChatMessage);
      socket.off('chat:message', handleIncomingChatMessage);
      socket.off('message_ack');
      socket.off('message_read');
      socket.off('user_typing');
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-made', handleIncomingCall);
      socket.off('call-rejected');
      socket.off('call-ended');
      socket.off('friendship_updated');
      socket.off('insufficient_coins');
      socket.disconnect();
    };
  }, []);

  // Sync followingIds & location state whenever currentUser profile updates
  useEffect(() => {
    if (Array.isArray(currentUser?.following)) {
      setFollowingIds(currentUser.following);
    }
  }, [currentUser?.following]);

  useEffect(() => {
    if (!currentUser) return;
    const enabled = currentUser.isLocationEnabled !== false && currentUser.locationVisibility !== 'ghost';
    setIsLocationEnabled(enabled);
    if (currentUser.locationVisibility && currentUser.locationVisibility !== regLocationVisibility) {
      setRegLocationVisibility(currentUser.locationVisibility);
    }
    if (currentUser.location?.lat && currentUser.location?.lng) {
      setUserCoords({
        lat: Number(currentUser.location.lat),
        lng: Number(currentUser.location.lng),
        accuracy: currentUser.location.accuracy || 20
      });
      setGpsStatusMsg('');
    }
  }, [currentUser?.uid, currentUser?.isLocationEnabled, currentUser?.locationVisibility, currentUser?.location?.lat, currentUser?.location?.lng]);

  // Live 1-second 24h countdown timer for locked 100-diamond batches
  useEffect(() => {
    const batches = currentUser?.pendingDiamondBatches;
    if (!Array.isArray(batches) || batches.length === 0) return;

    let claimedOnce = false;
    const interval = setInterval(() => {
      const now = Date.now();
      setCountdownNow(now);
      const hasMatured = batches.some((b: any) => typeof b?.unlockAt === 'number' && b.unlockAt <= now);
      if (hasMatured && !claimedOnce && currentUser?.uid) {
        claimedOnce = true;
        fetch(getApiUrl('/api/wallet/claim-matured'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.uid })
        })
          .then(r => r.json())
          .then(res => {
            if (res?.success && res.user) {
              setCurrentUser(res.user);
              try {
                localStorage.setItem('alov_current_user', JSON.stringify(res.user));
                localStorage.setItem('alov_user_' + res.user.uid, JSON.stringify(res.user));
              } catch (e) {}
            }
          })
          .catch(() => {});
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentUser?.uid, currentUser?.pendingDiamondBatches]);

  // Auto-scroll chat messages container smoothly without scrolling outer page or hiding top bar
  useEffect(() => {
    if (chatView === 'conversation') {
      requestAnimationFrame(() => {
        const el = chatMessagesContainerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, [chatMessages, selectedChatUser?.id, selectedChatUser?.uid, chatView]);

  // Register user on socket when auth state changes
  useEffect(() => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (myUid && socketRef.current) {
      socketRef.current.emit('register_user', myUid);
    }
  }, [currentUser?.uid, firebaseUser?.uid]);

  // Join active conversation room on socket & mark messages read
  useEffect(() => {
    if (!selectedChatUser) return;
    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = selectedChatUser.uid || selectedChatUser.id;
    if (myUid && otherUid && socketRef.current) {
      const chatId = [myUid, otherUid].sort().join('_');
      socketRef.current.emit('join_chat', chatId);
      if (chatView === 'conversation') {
        socketRef.current.emit('mark_read', {
          chatId,
          senderId: otherUid,
          recipientId: myUid
        });
      }
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

  // LocalStorage Session Restore on App Mount (enforce clean DB reset epoch first)
  useEffect(() => {
    const DB_RESET_EPOCH = '2026-11-13-reset-v1';
    try {
      const currentEpoch = localStorage.getItem('alov_db_epoch');
      if (currentEpoch !== DB_RESET_EPOCH) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('alov_') && k !== 'alov_db_epoch') {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        localStorage.setItem('alov_db_epoch', DB_RESET_EPOCH);
        signOut(auth).catch(() => {});
        setCurrentUser(null);
        setFirebaseUser(null);
        setActiveTab('landing');
        setIsAuthChecking(false);
        return;
      }

      const cached = localStorage.getItem('alov_current_user');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.uid && parsed.isProfileCompleted && !requiresFaceIdForUser(parsed)) {
          const isTg = Boolean(parsed.uid?.startsWith('tg_') || parsed.telegramChatId || parsed.telegram);
          if (isTg) {
            const sanitized = {
              ...parsed,
              name: getSafeUserDisplayName(parsed, ''),
              avatar: parsed.faceId?.capturedPhotoUrl || pickPreferredAvatar(parsed.avatar),
            };
            setCurrentUser(sanitized);
            setActiveTab('discover');
            setIsAuthChecking(false);

            fetch(getApiUrl('/api/users/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user: sanitized })
            })
              .then(r => r.json())
              .then(res => {
                if (res && res.success && res.user) {
                  setCurrentUser(res.user);
                  try {
                    localStorage.setItem('alov_current_user', JSON.stringify(res.user));
                    localStorage.setItem('alov_user_' + res.user.uid, JSON.stringify(res.user));
                  } catch (e) {}
                }
              })
              .catch(() => {});
          } else {
            setCurrentUser(parsed);
            setActiveTab('discover');
            setIsAuthChecking(false);
          }
        }
      }
    } catch (e) {}
  }, []);

  // Telegram WebApp Auto-login & Integration
  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        const tgUser = tg.initDataUnsafe?.user;
        if (tgUser) {
          const realName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim();
          const telegramUserObj = {
            uid: `tg_${tgUser.id}`,
            id: `TG-${tgUser.id}`,
            name: realName,
            telegram: tgUser.username ? `https://t.me/${tgUser.username}` : undefined,
            telegramChatId: tgUser.id,
            avatar: tgUser.photo_url || '',
            bio: 'Telegram orqali ulandim! ✨',
            isOnline: true,
            region: 'Toshkent shahri',
            district: 'Yunusobod tumani',
            gender: 'female'
          };
          fetch(getBaseUrl() + '/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: telegramUserObj })
          })
          .then(res => res.json())
          .then(data => {
            if (data && data.success && data.user) {
              const u = data.user;
              setRegName(getSafeUserDisplayName(u, realName));
              setRegAvatar(u.faceId?.capturedPhotoUrl || pickPreferredAvatar(u.avatar, tgUser.photo_url));
              if (!isAdminTelegramUser(u) && (!u.isProfileCompleted || requiresFaceIdForUser(u))) {
                setPendingTgUser(u);
                setAuthMode('telegram');
                setTelegramStep('face_id');
                setShowAuthModal(true);
              } else {
                setCurrentUser(u);
                try {
                  localStorage.setItem('alov_current_user', JSON.stringify(u));
                  localStorage.setItem('alov_user_' + u.uid, JSON.stringify(u));
                } catch (e) {}
                setActiveTab('discover');
              }
            }
          })
          .catch(() => {});
          setIsAuthChecking(false);
        }
      }
    } catch (e) {
      console.warn("Telegram WebApp init warning:", e);
    }
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
          avatar: user.photoURL || '',
          role: 'user',
          age: 22,
          gender: 'female',
          region: 'Toshkent shahri',
          district: 'Yunusobod tumani',
          bio: 'Alov.uz da yangi tanishuvlar va suhbatlar uchun.',
          status: 'online',
          isProfileCompleted: false,
          isLocationEnabled: true,
          locationVisibility: 'everyone',
          location: { lat: 41.3111, lng: 69.2797 }
        };
      }

      // 3. Render serveriga sinxronizatsiya qilish
      try {
        const data = await safeFetchJson(getApiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userData })
        });
        if (data && data.success && data.user) {
          userData = data.user;
        }
      } catch (e) {
        console.warn("Backend user sync offline fallback:", e);
      }

      // Anketani to'ldirish maydonlarini yangilash
      const userBdate = userData.birthDate || '2002-05-15';
      setRegBirthDate(userBdate);
      setRegName(userData.name || user.displayName || '');
      setRegAge(String(calculateAge(userBdate, userData.age || 22)));
      setRegGender(userData.gender || 'female');
      setRegRegion(userData.region || 'Toshkent shahri');
      setRegDistrict(userData.district || 'Yunusobod tumani');
      setRegBio(userData.bio || '');
      setRegAvatar(userData.faceId?.capturedPhotoUrl || userData.avatar || '');
      setRegLocationVisibility(userData.locationVisibility || 'everyone');
      setIsLocationEnabled(userData.isLocationEnabled !== false);

      // Admin bypasses Face ID completely; non-admins without verified Face ID or completed profile go to Face ID first
      if (!isAdminTelegramUser(userData) && (!userData.isProfileCompleted || requiresFaceIdForUser(userData))) {
        setPendingGoogleUser(user);
        setAuthMode(prev => (prev === 'register_face_id' ? 'register_face_id' : 'google_face_id'));
        setShowAuthModal(true);
        return userData;
      }

      try {
        localStorage.setItem('alov_user_' + userData.uid, JSON.stringify(userData));
        localStorage.setItem('alov_current_user', JSON.stringify(userData));
      } catch (e) {}

      setCurrentUser(userData);
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
    const DB_RESET_EPOCH = '2026-11-13-reset-v1';
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        let epochOk = true;
        try {
          if (localStorage.getItem('alov_db_epoch') !== DB_RESET_EPOCH) {
            epochOk = false;
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith('alov_') && k !== 'alov_db_epoch') {
                keysToRemove.push(k);
              }
            }
            keysToRemove.forEach((k) => localStorage.removeItem(k));
            localStorage.setItem('alov_db_epoch', DB_RESET_EPOCH);
          }
        } catch (e) {}

        if (user && !epochOk) {
          await signOut(auth).catch(() => {});
          setFirebaseUser(null);
          setCurrentUser(null);
          setActiveTab('landing');
          setIsAuthChecking(false);
          return;
        }

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
          let hasLocalSession = false;
          try {
            const cached = localStorage.getItem('alov_current_user');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed && parsed.uid) hasLocalSession = true;
            }
          } catch (e) {}
          const tgWebAppUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
          if (!hasLocalSession && !tgWebAppUser) {
            setCurrentUser(null);
          }
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
        const data = await safeFetchJson(getApiUrl('/api/users'));
        if (data && data.success && Array.isArray(data.users)) {
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
      if (!updatedUser) return;
      setUsersList(prev => {
        const userMap = new Map<string, any>();
        prev.forEach(u => userMap.set(u.uid || u.id, u));
        userMap.set(updatedUser.uid || updatedUser.id, updatedUser);
        return Array.from(userMap.values());
      });

      const myUid = currentUserRef.current?.uid;
      if (myUid && (updatedUser.uid === myUid || updatedUser.id === myUid)) {
        setCurrentUser((prev: any) => {
          const merged = { ...(prev || {}), ...updatedUser };
          try {
            localStorage.setItem('alov_current_user', JSON.stringify(merged));
            localStorage.setItem('alov_user_' + merged.uid, JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }

      setSelectedProfile((prev: any) => {
        if (prev && (prev.uid === updatedUser.uid || prev.id === updatedUser.id)) {
          return { ...prev, ...updatedUser };
        }
        return prev;
      });

      setSelectedChatUser((prev: any) => {
        if (prev && (prev.uid === updatedUser.uid || prev.id === updatedUser.id)) {
          return { ...prev, ...updatedUser };
        }
        return prev;
      });
    });

    socket.on('user_deleted', ({ uid }: { uid: string }) => {
      if (!uid) return;
      setUsersList(prev => prev.filter(u => u.uid !== uid && u.id !== uid));
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


  // Load active 1-on-1 chats from Render API & localStorage (No Firestore)
  useEffect(() => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid) return;

    const fetchChats = async () => {
      let serverChats: any[] = [];
      try {
        const data = await safeFetchJson(getApiUrl(`/api/chats/user/${myUid}`));
        if (data && data.success && Array.isArray(data.chats)) {
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

      setChatsList(combined);
      setIsLoadingChats(false);
    };

    fetchChats();
  }, [firebaseUser?.uid, currentUser?.uid]);

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

    const sanitizedLocalMsgs = localMsgs.map(m => ({
      ...m,
      status: (m.status === 'sending' || !m.status) ? 'sent' : m.status
    }));

    if (sanitizedLocalMsgs.length > 0) {
      setChatMessages(prev => ({ ...prev, [selectedChatUser.id]: sanitizedLocalMsgs }));
    }

    // 2. Sync from Render API
    safeFetchJson(getApiUrl(`/api/chats/${chatId}/messages`))
      .then(data => {
        if (data && data.success) {
          if (data.friendship !== undefined) {
            setChatFriendships(prev => ({ ...prev, [chatId]: Boolean(data.friendship?.active) }));
          }
          if (Array.isArray(data.messages)) {
            const msgMap = new Map<string, any>();
            [...sanitizedLocalMsgs, ...data.messages].forEach(m => {
              const sanitized = {
                ...m,
                status: (m.status === 'sending' || !m.status) ? 'sent' : m.status
              };
              msgMap.set(m.id, sanitized);
            });
            const merged = Array.from(msgMap.values()).sort((a, b) => 
              new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
            );
            setChatMessages(prev => ({ ...prev, [selectedChatUser.id]: merged }));
            try {
              localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(merged));
            } catch (e) {}
          }
        }
      })
      .catch(err => console.warn("Failed to sync chat messages from Render server:", err));

  }, [firebaseUser?.uid, currentUser?.uid, selectedChatUser?.uid, selectedChatUser?.id, chatView]);

  useEffect(() => {
    const activeUid = currentUser?.uid || firebaseUser?.uid;
    const emitCoords = (coords: { lat: number; lng: number; accuracy?: number }) => {
      if (!activeUid) return;
      socketRef.current?.emit('update_location', {
        uid: activeUid,
        location: coords,
        isLocationEnabled: true,
        locationVisibility: currentUser?.locationVisibility || regLocationVisibility || 'everyone'
      });
      fetch(getApiUrl('/api/users/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: activeUid,
          updates: {
            location: coords,
            isLocationEnabled: true,
            isOnline: true
          }
        })
      }).catch(() => {});
    };

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
          emitCoords(coords);
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
          emitCoords(coords);
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
  }, [firebaseUser?.uid, currentUser?.uid]);


  // Handle Privacy-Protected Route Calculation to a target user
  const handleDrawRouteToUser = (targetUser: any) => {
    if (!userCoords?.lat || !userCoords?.lng) {
      alert("Marshrut chizish uchun avval GPS lokatsiyangizni yoqing!");
      return;
    }
    if (!targetUser || !targetUser.location?.lat || !targetUser.location?.lng) {
      alert("Ushbu foydalanuvchining lokatsiyasi mavjud emas.");
      return;
    }

    const vis = targetUser.locationVisibility || 'everyone';
    if (vis === 'ghost' || targetUser.isLocationEnabled === false) {
      alert("Bu foydalanuvchi o'z lokatsiyasini yashirgan (Ghost Mode). Marshrut chizib bo'lmaydi.");
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

      safeFetchJson(`https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`)
        .then(data => {
          if (data && data.routes && data.routes.length > 0) {
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


  // Initialize Unified Standard Leaflet Map cleanly when Map tab opens
  useEffect(() => {
    if (activeTab !== 'map') {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = {};
        hasCenteredMapRef.current = false;
      }
      return;
    }

    let cancelled = false;
    const node = mapContainerRef.current;
    if (!node || mapInstanceRef.current) return;

    import('leaflet')
      .then((LMod) => {
        if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;
        const L = (LMod as any).default || LMod;
        (window as any).L = L;
        const initialLat = userCoords?.lat || currentUser?.location?.lat || 41.2995;
        const initialLng = userCoords?.lng || currentUser?.location?.lng || 69.2401;
        const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([initialLat, initialLng], 12);
        mapInstanceRef.current = map;
        hasCenteredMapRef.current = true;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap Alov.uz GPS'
        }).addTo(map);
        setMapReadyTick(t => t + 1);
        setTimeout(() => {
          if (!cancelled && mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
        }, 120);
      })
      .catch((err) => {
        console.error("Leaflet init error:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Real-time Leaflet Map Marker Sync Effect (Unified Shared Map + Smooth In-Bounds Markers)
  useEffect(() => {
    if (activeTab !== 'map') return;

    import('leaflet').then((LMod) => {
      const L = (LMod as any).default || LMod;
      const map = mapInstanceRef.current;
      if (!map) return;

      // Center smoothly on the current user's location once
      if (userCoords?.lat && userCoords?.lng && !hasCenteredMapRef.current) {
        map.setView([userCoords.lat, userCoords.lng], 12, { animate: true });
        hasCenteredMapRef.current = true;
      }

      // 1. Sync User Marker ('me')
      if (userCoords?.lat && userCoords?.lng && isLocationEnabled) {
        const myAvatar = resolveAvatarUrl(currentUser?.avatar || firebaseUser?.photoURL);
        const myInitial = (getSafeUserDisplayName(currentUser, 'Siz') || 'S').charAt(0).toUpperCase();
        const userIcon = L.divIcon({
          className: 'custom-user-marker',
          html: `<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div class="pulse-ring"></div>
            <div style="background:#E8474A;width:34px;height:34px;border-radius:50%;border:2.5px solid white;box-shadow:0 4px 14px rgba(232,71,74,0.55);overflow:hidden;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:13px;position:relative;z-index:2;">
              ${myAvatar ? `<img src="${myAvatar}" style="width:100%;height:100%;object-fit:cover;" />` : myInitial}
            </div>
          </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        if (!markersRef.current['me']) {
          markersRef.current['me'] = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon }).addTo(map);
        } else {
          markersRef.current['me'].setLatLng([userCoords.lat, userCoords.lng]);
          if (markersRef.current['me'].options.icon.options.html !== userIcon.options.html) {
            markersRef.current['me'].setIcon(userIcon);
          }
        }
      } else if (markersRef.current['me']) {
        markersRef.current['me'].remove();
        delete markersRef.current['me'];
      }

      // 2. Sync Other Users — ALL users who enabled location visibility appear on the shared map
      const myUid = currentUser?.uid || firebaseUser?.uid;
      const activeUsers = usersList.filter(u => {
        if (myUid && (u.uid === myUid || u.id === myUid)) return false;
        if (filterRegion !== 'Barchasi' && u.region !== filterRegion) return false;
        if (filterDistrict !== 'Barchasi' && u.district !== filterDistrict) return false;
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

      // Add/Update markers smoothly inside the map
      activeUsers.forEach(u => {
        const markerKey = u.uid || u.id;
        const lat = Number(u.location.lat);
        const lng = Number(u.location.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const userAvatar = resolveAvatarUrl(u.avatar);
        const safeName = getSafeUserDisplayName(u, 'Foydalanuvchi');
        const initial = safeName.charAt(0).toUpperCase();
        const isLive = u.isLive === true;
        const isOnline = u.status === 'online' || u.isOnline === true;

        const otherIcon = L.divIcon({
          className: isLive ? 'custom-live-marker' : 'custom-other-marker',
          html: `
            <div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;">
              ${(isLive || isOnline) ? '<div class="pulse-ring" style="background-color:' + (isLive ? '#EF4444' : '#10B981') + '"></div>' : ''}
              <div style="background:#E8474A;width:36px;height:36px;border-radius:50%;border:2px solid ${isLive ? '#EF4444' : 'white'};box-shadow:0 4px 12px rgba(0,0,0,0.3);overflow:hidden;position:relative;z-index:2;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:13px;">
                ${userAvatar ? `<img src="${userAvatar}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'"/>` : initial}
                ${isOnline ? '<span style="position:absolute;bottom:1px;right:1px;width:9px;height:9px;background:#10B981;border:1.5px solid white;border-radius:50%;"></span>' : ''}
              </div>
              ${isLive ? '<span style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);background:#EF4444;color:white;font-size:7px;font-weight:900;padding:0.5px 5px;border-radius:999px;z-index:10;white-space:nowrap;">● LIVE</span>' : ''}
            </div>
          `,
          iconSize: [42, 42],
          iconAnchor: [21, 21]
        });

        const popupAvatarHtml = userAvatar
          ? `<img src="${userAvatar}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid ${isLive ? '#EF4444' : '#E8474A'};" />`
          : `<div style="width:48px;height:48px;border-radius:50%;background:#FCEAEA;color:#E8474A;font-weight:900;font-size:18px;display:flex;align-items:center;justify-content:center;border:2px solid #E8474A;">${initial}</div>`;

        const popupContent = `
          <div style="font-family: Inter, sans-serif; text-align: center; width: 175px; padding: 4px;">
            <div style="position:relative; width:48px; margin: 0 auto 6px;">
              ${popupAvatarHtml}
              ${isLive ? '<span style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);background:#EF4444;color:white;font-size:8px;font-weight:900;padding:1px 5px;border-radius:6px;">LIVE</span>' : ''}
              ${isOnline ? '<span style="position:absolute;top:0;right:0;width:12px;height:12px;background:#10B981;border:2px solid white;border-radius:50%;"></span>' : ''}
            </div>
            <b style="font-size: 13px; display:block; color:#1C1C1C;">${safeName}</b>
            <p style="font-size: 10px; color: #666; margin: 2px 0 6px;">${u.district || u.region || 'O\'zbekiston'}</p>
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
          if (existingMarker.options.icon.options.html !== otherIcon.options.html) {
            existingMarker.setIcon(otherIcon);
          }
          if (existingMarker.getPopup().getContent() !== popupContent) {
            existingMarker.setPopupContent(popupContent);
          }
        }
      });
    });
  }, [activeTab, mapReadyTick, usersList, userCoords, isLocationEnabled, currentUser, firebaseUser, filterRegion, filterDistrict]);


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
    const activeUid = currentUser?.uid || firebaseUser?.uid;
    const syncLocToServer = async (updates: Record<string, any>) => {
      if (!activeUid) return;
      if (updates.location) {
        socketRef.current?.emit('update_location', {
          uid: activeUid,
          location: updates.location,
          isLocationEnabled: updates.isLocationEnabled,
          locationVisibility: updates.locationVisibility || regLocationVisibility
        });
      }
      try {
        await fetch(getApiUrl('/api/users/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: activeUid, updates })
        });
      } catch (e) {
        console.error("Backend location update error:", e);
      }
    };

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

          await syncLocToServer({
            isLocationEnabled: true,
            locationVisibility: regLocationVisibility,
            location: newCoords
          });

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
              await syncLocToServer({
                isLocationEnabled: true,
                locationVisibility: regLocationVisibility,
                location: updatedCoords
              });
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
          syncLocToServer({ isLocationEnabled: false });
        },
        GPS_OPTIONS
      );
    } else {
      if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        setGeoWatchId(null);
      }
      setIsLocationEnabled(false);
      await syncLocToServer({ isLocationEnabled: false });
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
    const activeUid = firebaseUser?.uid || currentUser?.uid;
    if (!activeUid) return;
    setErrorMsg('');

    try {
      const computedAge = calculateAge(regBirthDate, Number(regAge));
      const newUserData = {
        ...currentUser,
        id: currentUser?.id || `ALOV-${activeUid.slice(0, 5).toUpperCase()}`,
        uid: activeUid,
        name: regName || firebaseUser?.displayName || currentUser?.name || '',
        birthDate: regBirthDate,
        age: computedAge,
        gender: regGender,
        region: regRegion,
        district: regDistrict,
        neighborhood: regNeighborhood,
        phone: regPhone || firebaseUser?.phoneNumber || currentUser?.phone || '+998901112233',
        telegram: regTelegram || currentUser?.telegram || '@user_tg',
        instagram: regInstagram || currentUser?.instagram || '@user_insta',
        bio: regBio,
        avatar: pickPreferredAvatar(regAvatar, firebaseUser?.photoURL, currentUser?.avatar),
        videoUrl: currentUser?.videoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-young-woman-looking-at-camera-in-a-park-41686-large.mp4',
        followersCount: currentUser?.followersCount ?? 0,
        followingCount: currentUser?.followingCount ?? 0,
        likesCount: currentUser?.likesCount ?? 0,
        isOnline: true,
        isLocationEnabled: isLocationEnabled,
        locationVisibility: regLocationVisibility,
        location: userCoords,
        isProfileCompleted: true
      };

      const data = await safeFetchJson(getApiUrl('/api/users/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: newUserData })
      });
      const savedUser = (data && data.success && data.user) ? data.user : newUserData;

      try {
        localStorage.setItem('alov_current_user', JSON.stringify(savedUser));
        localStorage.setItem('alov_user_' + activeUid, JSON.stringify(savedUser));
      } catch (e) {}

      setCurrentUser(savedUser);
      setUsersList(prev => {
        const userMap = new Map<string, any>();
        prev.forEach(u => userMap.set(u.uid || u.id, u));
        userMap.set(activeUid, savedUser);
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
    const activeUid = currentUser?.uid || firebaseUser?.uid;
    if (activeUid) {
      fetch(getApiUrl('/api/users/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: activeUid,
          updates: { locationVisibility: value }
        })
      }).catch(console.error);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setErrorMsg("Iltimos, Username/Email va parolni kiriting!");
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');

      // Universal Backend Login by Username, Email, Telegram or Phone + Password
      const serverLoginRes = await safeFetchJson(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginInput: authEmail.trim(), password: authPassword.trim() })
      });

      if (serverLoginRes && serverLoginRes.success && serverLoginRes.user) {
        const userData = serverLoginRes.user;
        if (!isAdminTelegramUser(userData) && (requiresFaceIdForUser(userData) || !userData.isProfileCompleted)) {
          setPendingTgUser(userData);
          setRegName(getSafeUserDisplayName(userData, userData.name || ''));
          setRegPhone(userData.phone || '+99890');
          setRegTelegram(userData.telegram || '');
          setRegRegion(userData.region || 'Toshkent shahri');
          setRegDistrict(userData.district || 'Yunusobod tumani');
          setAuthMode('telegram');
          setTelegramStep('face_id');
          return;
        }
        setCurrentUser(userData);
        try {
          localStorage.setItem('alov_current_user', JSON.stringify(userData));
          localStorage.setItem('alov_user_' + userData.uid, JSON.stringify(userData));
        } catch(e) {}
        setShowAuthModal(false);
        setActiveTab('discover');
        return;
      }

      // Fallback: Firebase Sign In if input was formatted as an email
      if (authEmail.includes('@') && !authEmail.startsWith('@')) {
        const userCredential = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
        if (userCredential.user) {
          await syncUserWithBackend(userCredential.user);
          return;
        }
      }

      setErrorMsg(serverLoginRes?.error || "Username, Email yoki parol xato.");
    } catch (err: any) {
      setErrorMsg(err.message || "Kirishda xatolik yuz berdi.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword || !regName) {
      setErrorMsg("Iltimos, email, parol va ism-familiyani to'ldiring!");
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      if (userCredential.user) {
        // Immediately enter Face ID verification BEFORE collecting remaining profile info
        setPendingGoogleUser(userCredential.user);
        setPendingFaceId(null);
        setAuthMode('register_face_id');
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Ro'yxatdan o'tishda xatolik.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setErrorMsg('');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (result?.user) {
        const partialUser = {
          uid: result.user.uid,
          email: result.user.email,
          name: result.user.displayName,
          avatar: result.user.photoURL
        };

        const response = await fetch(getApiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: partialUser })
        });
        const data = await response.json();

        if (data && data.success && data.user) {
          const canonicalUser = data.user;
          if (canonicalUser.isProfileCompleted && !requiresFaceIdForUser(canonicalUser)) {
            setCurrentUser(canonicalUser);
            try {
              localStorage.setItem('alov_current_user', JSON.stringify(canonicalUser));
              localStorage.setItem('alov_user_' + canonicalUser.uid, JSON.stringify(canonicalUser));
            } catch(e) {}
            setShowAuthModal(false);
            setActiveTab('discover');
            setIsLoggingIn(false);
            return;
          }
        }

        // Immediately run Face ID right after Google account selection, BEFORE profile info form
        setRegName(result.user.displayName || '');
        setPendingFaceId(null);
        setPendingGoogleUser(result.user);
        setAuthMode('google_face_id');
        setIsLoggingIn(false);
      }
    } catch (popupErr: any) {
      if (popupErr.code === 'auth/popup-closed-by-user' || popupErr.code === 'auth/cancelled-popup-request') {
        setIsLoggingIn(false);
        return;
      }
      setErrorMsg(popupErr.message || "Google orqali kirishda xatolik.");
      setIsLoggingIn(false);
    }
  };

  const handleCompleteGoogleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUser) return;
    if (!regName.trim()) {
      setErrorMsg("Iltimos, ismingizni kiriting!");
      return;
    }
    if (!pendingFaceId?.verified) {
      setErrorMsg("Avval Face ID tasdiqlashdan o'ting!");
      setAuthMode('google_face_id');
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');
      const cleanTg = (regTelegram || '').replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
      const formattedTg = cleanTg ? `https://t.me/${cleanTg}` : undefined;
      const verifiedGender = pendingFaceId.detectedGender;
      const verifiedAvatar = pendingFaceId.capturedPhotoUrl || regAvatar;

      const newUserData = {
        uid: pendingGoogleUser.uid,
        id: `ALOV-${pendingGoogleUser.uid.slice(0, 5).toUpperCase()}`,
        name: regName.trim(),
        email: pendingGoogleUser.email || authEmail || '',
        telegram: formattedTg,
        password: authPassword.trim() || undefined,
        avatar: verifiedAvatar,
        faceId: pendingFaceId,
        isVerified: true,
        role: isAdminTelegramUser({ telegram: formattedTg }) ? 'admin' : 'user',
        isAdmin: isAdminTelegramUser({ telegram: formattedTg }),
        age: Number(regAge) || calculateAge(regBirthDate, 22),
        birthDate: regBirthDate,
        gender: verifiedGender,
        region: regRegion,
        district: regDistrict,
        phone: regPhone,
        bio: regBio || 'Alov.uz da yangi tanishuvlar uchun.',
        status: 'online',
        isProfileCompleted: true,
        isLocationEnabled: isLocationEnabled,
        locationVisibility: regLocationVisibility,
        location: { lat: 41.3111, lng: 69.2797 }
      };
      const syncData = await safeFetchJson(getApiUrl('/api/users/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: newUserData })
      });
      const finalUser = (syncData && syncData.success && syncData.user) ? syncData.user : newUserData;
      setCurrentUser(finalUser);
      try {
        localStorage.setItem('alov_current_user', JSON.stringify(finalUser));
        localStorage.setItem('alov_user_' + finalUser.uid, JSON.stringify(finalUser));
      } catch(e) {}
      setPendingGoogleUser(null);
      setPendingFaceId(null);
      setShowAuthModal(false);
      setAuthMode('login');
      setActiveTab('discover');
    } catch (err: any) {
      setErrorMsg(err.message || "Profil yaratishda xatolik.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleStartTelegramAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramInput.trim()) {
      setErrorMsg("Iltimos, Telegram telefon raqami yoki username'ni kiriting!");
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');
      setHasStartedBotError(false);

      // Check if user has previously saved telegramChatId in localStorage
      let cachedChatId = undefined;
      try {
        const cleanKey = telegramInput.trim().replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
        cachedChatId = localStorage.getItem('alov_tg_chat_' + cleanKey);
        if (!cachedChatId && currentUser) {
          cachedChatId = currentUser.telegramChatId || currentUser.chatId;
        }
      } catch (e) {}

      const data = await safeFetchJson(getApiUrl('/api/auth/send-telegram-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phoneNumber: telegramInput.trim(),
          chatId: cachedChatId
        })
      });
      if (data && data.success && data.hasStartedBot) {
        setTelegramStep('input_code');
        try {
          const cleanKey = telegramInput.trim().replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
          if (data.chatId) {
            localStorage.setItem('alov_tg_chat_' + cleanKey, String(data.chatId));
            localStorage.setItem('alov_last_tg_chat', String(data.chatId));
          }
          localStorage.setItem('alov_tg_started_' + cleanKey, 'true');
        } catch (e) {}
      } else if (data && data.hasStartedBot === false) {
        setHasStartedBotError(true);
        setErrorMsg(data.error || "Botimiz ro'yxatida topilmadingiz! Iltimos, avval @alovuz_bot ga kirib /start tugmasini bir marta bosing.");
      } else {
        setErrorMsg(data?.error || "Kod yuborishda xatolik.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Tarmoq xatoligi.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyTelegramCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enteredTgCode.trim()) {
      setErrorMsg("Iltimos, kodni kiriting!");
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');
      const data = await safeFetchJson(getApiUrl('/api/auth/verify-telegram-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: telegramInput.trim(), code: enteredTgCode.trim() })
      });
      if (data && data.success && data.user) {
        // Remember chatId for this user so they NEVER have to press start again
        try {
          const cleanKey = telegramInput.trim().replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
          if (data.user.telegramChatId) {
            localStorage.setItem('alov_tg_chat_' + cleanKey, String(data.user.telegramChatId));
          }
          localStorage.setItem('alov_tg_started_' + cleanKey, 'true');
        } catch (e) {}

        const needsOnboardingOrFaceId =
          !isAdminTelegramUser(data.user) &&
          (data.isNewUser || !data.user.isProfileCompleted || requiresFaceIdForUser(data.user));

        if (needsOnboardingOrFaceId) {
          setPendingTgUser(data.user);
          setPendingFaceId(null);

          const tgWebAppUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
          const tgWebAppName = tgWebAppUser
            ? [tgWebAppUser.first_name, tgWebAppUser.last_name].filter(Boolean).join(' ').trim()
            : '';

          const calculatedName = buildTelegramDisplayName({
            firstName: data.user.firstName || data.user.first_name || data.user.name,
            lastName: data.user.lastName || data.user.last_name,
            username: data.user.telegram || telegramInput.trim(),
            phone: data.user.phone || telegramInput.trim(),
            existingName: tgWebAppName,
          });

          setRegName(calculatedName);
          setRegAvatar('');
          setRegPhone(data.user.phone || (/^\+?\d+$/.test(telegramInput.trim()) ? telegramInput.trim() : '+99890'));
          const cleanUserTg = telegramInput.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
          setRegTelegram(data.user.telegram || (cleanUserTg && !/^\d+$/.test(cleanUserTg) ? `https://t.me/${cleanUserTg}` : ''));
          setRegAge(String(data.user.age || 22));
          setRegGender(data.user.gender || 'female');
          setRegRegion(data.user.region || 'Toshkent shahri');
          setRegDistrict(data.user.district || 'Yunusobod tumani');

          // Enter real Face ID verification immediately after Telegram verification
          setTelegramStep('face_id');
        } else {
          // Admin (@Salikh_07) or already Face-ID-verified completed user logs straight in
          const userData = data.user;
          setCurrentUser(userData);
          try {
            localStorage.setItem('alov_current_user', JSON.stringify(userData));
            localStorage.setItem('alov_user_' + userData.uid, JSON.stringify(userData));
          } catch(e) {}
          setShowAuthModal(false);
          setAuthMode('login');
          setTelegramStep('input_phone');
          setActiveTab('discover');
        }
      } else {
        setErrorMsg(data?.error || "Kiritilgan tasdiqlash kodi noto'g'ri!");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Tasdiqlashda xatolik.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleFaceIdVerified = async (result: FaceIdVerificationResult, origin: 'telegram' | 'google' | 'register') => {
    setErrorMsg('');
    setPendingFaceId(result.faceId);
    setRegGender(result.detectedGender);
    setRegAvatar(result.photoUrl || result.photoDataUrl);

    if (origin === 'telegram') {
      // If returning Telegram user already completed profile fields previously, finalize & enter directly
      if (pendingTgUser?.isProfileCompleted) {
        const updatedUser = {
          ...pendingTgUser,
          avatar: result.photoUrl || result.photoDataUrl,
          gender: result.detectedGender,
          faceId: result.faceId,
          isVerified: true,
        };
        const syncData = await safeFetchJson(getApiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: updatedUser }),
        });
        const finalUser = syncData?.user || updatedUser;
        setCurrentUser(finalUser);
        try {
          localStorage.setItem('alov_current_user', JSON.stringify(finalUser));
          localStorage.setItem('alov_user_' + finalUser.uid, JSON.stringify(finalUser));
        } catch (e) {}
        setPendingTgUser(null);
        setPendingFaceId(null);
        setShowAuthModal(false);
        setAuthMode('login');
        setTelegramStep('input_phone');
        setActiveTab('discover');
        return;
      }
      setTelegramStep('profile_setup');
    } else {
      setAuthMode('google_setup');
    }
  };

  const handleCompleteTelegramRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingTgUser) return;
    if (!regName.trim()) {
      setErrorMsg("Iltimos, ismingizni kiriting!");
      return;
    }
    if (!pendingFaceId?.verified) {
      setErrorMsg("Avval Face ID tasdiqlashdan o'ting!");
      setTelegramStep('face_id');
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');
      const cleanTg = (regTelegram || pendingTgUser.telegram || telegramInput || '').replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
      const formattedTg = cleanTg && !/^\d+$/.test(cleanTg) ? `https://t.me/${cleanTg}` : undefined;
      const verifiedGender = pendingFaceId.detectedGender;
      const verifiedAvatar = pendingFaceId.capturedPhotoUrl || regAvatar;

      const newUserData = {
        uid: pendingTgUser.uid,
        id: pendingTgUser.id || `ALOV-TG-${pendingTgUser.uid.slice(0, 5).toUpperCase()}`,
        name: regName.trim(),
        telegram: formattedTg,
        telegramChatId: pendingTgUser.telegramChatId,
        password: authPassword.trim() || undefined,
        avatar: verifiedAvatar,
        faceId: pendingFaceId,
        isVerified: true,
        role: isAdminTelegramUser({ telegram: formattedTg }) ? 'admin' : 'user',
        isAdmin: isAdminTelegramUser({ telegram: formattedTg }),
        age: Number(regAge) || calculateAge(regBirthDate, 22),
        birthDate: regBirthDate,
        gender: verifiedGender,
        region: regRegion,
        district: regDistrict,
        phone: regPhone,
        bio: regBio || 'Alov.uz da yangi tanishuvlar va suhbatlar uchun.',
        status: 'online',
        isProfileCompleted: true,
        isLocationEnabled: isLocationEnabled,
        locationVisibility: regLocationVisibility,
        location: { lat: 41.3111, lng: 69.2797 }
      };
      const syncData = await safeFetchJson(getApiUrl('/api/users/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: newUserData })
      });
      const finalUser = (syncData && syncData.success && syncData.user) ? syncData.user : newUserData;
      setCurrentUser(finalUser);
      try {
        localStorage.setItem('alov_current_user', JSON.stringify(finalUser));
        localStorage.setItem('alov_user_' + finalUser.uid, JSON.stringify(finalUser));
      } catch(e) {}
      setPendingTgUser(null);
      setPendingFaceId(null);
      setShowAuthModal(false);
      setAuthMode('login');
      setTelegramStep('input_phone');
      setActiveTab('discover');
    } catch (err: any) {
      setErrorMsg(err.message || "Profil yaratishda xatolik.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    const activeUid = currentUser?.uid || firebaseUser?.uid;
    if (activeUid) {
      try {
        await fetch(getApiUrl('/api/users/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: activeUid,
            updates: { isOnline: false, status: 'offline' }
          })
        });
      } catch (e) {}
    }
    try {
      localStorage.removeItem('alov_current_user');
    } catch (e) {}
    await signOut(auth).catch(() => {});
    setFirebaseUser(null);
    setCurrentUser(null);
    setShowAdminPanel(false);
    setActiveTab('landing');
  };

  const handleToggleFollow = async (targetUidOrId: string) => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid || !targetUidOrId) return;

    const targetObj = usersList.find(u => u.uid === targetUidOrId || u.id === targetUidOrId) || selectedProfile;
    const resolvedTargetUid = targetObj?.uid || targetUidOrId;

    const wasFollowing = followingIds.includes(resolvedTargetUid) || followingIds.includes(targetUidOrId);
    setFollowingIds(prev =>
      wasFollowing
        ? prev.filter(id => id !== resolvedTargetUid && id !== targetUidOrId)
        : Array.from(new Set([...prev, resolvedTargetUid]))
    );

    try {
      const data = await safeFetchJson(getApiUrl('/api/users/follow'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerUid: myUid, targetUid: resolvedTargetUid })
      });
      if (data?.success) {
        if (data.follower) {
          setCurrentUser(data.follower);
          setFollowingIds(Array.isArray(data.follower.following) ? data.follower.following : []);
          try {
            localStorage.setItem('alov_current_user', JSON.stringify(data.follower));
            localStorage.setItem('alov_user_' + data.follower.uid, JSON.stringify(data.follower));
          } catch (e) {}
        }
        if (data.target && selectedProfile && (selectedProfile.uid === data.target.uid || selectedProfile.id === data.target.id)) {
          setSelectedProfile(data.target);
        }
      }
    } catch (err) {
      console.warn('Follow sync failed:', err);
    }
  };

  const handleToggleFriendship = async () => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = selectedChatUser?.uid || selectedChatUser?.id;
    if (!myUid || !otherUid) return;
    const chatId = [myUid, otherUid].sort().join('_');
    const nextState = !chatFriendships[chatId];
    setChatFriendships(prev => ({ ...prev, [chatId]: nextState }));

    try {
      const data = await safeFetchJson(getApiUrl('/api/chats/friendship'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, uid: myUid, enabled: nextState })
      });
      if (data?.success && data.friendship) {
        setChatFriendships(prev => ({ ...prev, [chatId]: Boolean(data.friendship.active) }));
      }
    } catch (e) {
      setChatFriendships(prev => ({ ...prev, [chatId]: !nextState }));
    }
  };

  const handleCreateMeetLink = async () => {
    let meetUrl = 'https://meet.google.com/abc-defg-hij';
    try {
      const data = await safeFetchJson(getApiUrl('/api/meet/create-link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${currentUser?.name} va ${selectedChatUser?.name} Google Meet Qo'ng'irog'i` })
      });
      if (data && data.success && data.meetUrl) {
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


  const handleTyping = () => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid || !selectedChatUser) return;
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
      status: 'sending' as 'sending' | 'sent' | 'read',
      read: false,
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current?.emit('typing', { chatId, uid: myUid, isTyping: false });

    // Send message via Socket.io bridge with ack callback
    socketRef.current?.emit('send_message', {
      chatId,
      senderId: myUid,
      recipientId: otherUid,
      message: msgObj
    }, (ack: any) => {
      if (ack && ack.success === false) {
        // Rollback optimistic message if rejected by server (e.g. insufficient coins or banned)
        setChatMessages(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => {
            if (next[k]) {
              next[k] = next[k].filter(m => m.id !== msgObj.id);
            }
          });
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(next[chatId] || []));
          } catch (e) {}
          return next;
        });
        if (ack.error === 'insufficient_coins') {
          setWalletNoticeMsg(ack.message || `Monetalaringiz yetarli emas! Har bir xabar narxi ${MESSAGE_COIN_COST} moneta.`);
          setShowTopUpModal(true);
        } else if (ack.message) {
          setErrorMsg(ack.message);
        }
        return;
      }
      if (ack && (ack.status === 'sent' || ack.success)) {
        setChatMessages(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => {
            if (next[k]) {
              next[k] = next[k].map(m => m.id === msgObj.id ? { ...m, status: 'sent' } : m);
            }
          });
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(next[chatId] || []));
          } catch (e) {}
          return next;
        });
      }
    });

    // Optimistically update local chat messages & localStorage across all key aliases
    setChatMessages(prev => {
      const keysToUpdate = Array.from(new Set([
        chatId, selectedChatUser.id, selectedChatUser.uid, otherUid
      ].filter(Boolean))) as string[];

      const next = { ...prev };
      keysToUpdate.forEach(k => {
        const currentMsgs = prev[k] || [];
        next[k] = [...currentMsgs, msgObj];
      });

      try {
        localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(next[chatId]));
      } catch (e) {}

      return next;
    });

    // Fallback timer: update sending status to sent after 300ms if no ack callback fired yet
    setTimeout(() => {
      setChatMessages(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (next[k]) {
            next[k] = next[k].map(m => {
              if (m.id === msgObj.id && m.status === 'sending') {
                return { ...m, status: 'sent' };
              }
              return m;
            });
          }
        });
        if (chatId && next[chatId]) {
          try {
            localStorage.setItem('alov_msgs_' + chatId, JSON.stringify(next[chatId]));
          } catch (e) {}
        }
        return next;
      });
    }, 300);

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

  const handleSendGift = async (gift: { id: string; name: string; coinPrice: number; icon: string }) => {
    if (!selectedChatUser) return;
    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = selectedChatUser.uid || selectedChatUser.id;
    if (!myUid || !otherUid) return;

    if ((currentUser?.coins ?? 100) < gift.coinPrice) {
      setShowGiftModal(false);
      setShowTopUpModal(true);
      setWalletNoticeMsg(`"${gift.name}" sovg'asi uchun ${gift.coinPrice} moneta kerak. Moneta sotib olasizmi?`);
      return;
    }

    try {
      const data = await safeFetchJson(getApiUrl('/api/gifts/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderUid: myUid,
          recipientUid: otherUid,
          giftId: gift.id,
          giftName: gift.name,
          coinPrice: gift.coinPrice,
          giftIcon: gift.icon
        })
      });
      if (data && data.success && data.sender) {
        setCurrentUser(data.sender);
        setShowGiftModal(false);
      } else {
        alert(data?.error || "Sovg'a yuborishda xatolik");
      }
    } catch (e: any) {
      alert(e.message || "Xatolik yuz berdi");
    }
  };

  const handleExecuteTopUp = async () => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid) return;
    try {
      const data = await safeFetchJson(getApiUrl('/api/wallet/topup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: myUid,
          coinAmount: topUpPackage.coins,
          paymentMethod: paymentProvider
        })
      });
      if (data && data.success && data.user) {
        setCurrentUser(data.user);
        setShowTopUpModal(false);
        setWalletNoticeMsg('');
        alert(`🎉 ${topUpPackage.coins} moneta hisobingizga muvaffaqiyatli qo'shildi!`);
      } else {
        alert(data?.error || "To'lovni amalga oshirishda xatolik.");
      }
    } catch (e: any) {
      alert(e.message || "Xatolik yuz berdi");
    }
  };

  const handleExecuteWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid) return;
    if (!withdrawCardNumber || withdrawCardNumber.replace(/\D/g, '').length < 16) {
      alert("Iltimos, 16 xonali Humo yoki Uzcard karta raqamini kiriting!");
      return;
    }
    if (withdrawAmount < 100) {
      alert("Minimal yechib olish miqdori 100 almaz (100,000 so'm)!");
      return;
    }

    try {
      const data = await safeFetchJson(getApiUrl('/api/wallet/withdraw'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: myUid,
          diamondAmount: withdrawAmount,
          bankCard: withdrawCardNumber
        })
      });
      if (data && data.success && data.user) {
        setCurrentUser(data.user);
        setShowWithdrawModal(false);
        alert(`✅ Pul yechib olish arizangiz qabul qilindi! ${(withdrawAmount * 1000).toLocaleString()} so'm 1-24 soat ichida kartangizga o'tkaziladi.`);
      } else {
        alert(data?.error || "Arizani yuborishda xatolik.");
      }
    } catch (e: any) {
      alert(e.message || "Xatolik yuz berdi");
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

  // Dashboard content inside refined romantic dating shell
  const dashboardContent = (
    <div className="h-full bg-[#FDFBF9] text-[#221719] font-sans flex flex-col w-full relative overflow-hidden">
      
      {/* Top Header (always pinned cleanly at top) */}
      <header className="shrink-0 bg-white/95 backdrop-blur-md border-b border-[rgba(166,36,51,0.1)] px-2.5 sm:px-5 h-14 flex items-center justify-between gap-1.5 z-40">
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 cursor-pointer" onClick={() => setActiveTab('discover')}>
            <img src="/assets/aistudio/image_e20a1307.png" alt="Alov.uz Logo" className="w-7 h-7 rounded-xl object-cover border border-[#C93545]/30 shadow-xs shrink-0" />
            <span className="text-[16px] sm:text-[18px] font-black font-editorial tracking-tight text-[#221719] whitespace-nowrap shrink-0">
              alov<span className="text-[#C93545]">.uz</span>
            </span>
            <span className="text-[9.5px] sm:text-[10.5px] font-bold text-emerald-700 bg-emerald-50/90 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200/80 shadow-xs whitespace-nowrap shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>{activeUsersCount} onlayn</span>
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {isAdminTelegramUser(currentUser) ? (
              <>
                <button
                  onClick={() => setActiveTab('profile')}
                  title="Admin Full Almaz Balansi"
                  className="flex items-center gap-1 bg-gradient-to-r from-cyan-50 to-sky-50 border border-cyan-200/90 text-cyan-900 py-1 px-2 rounded-full text-[9.5px] sm:text-[10.5px] font-bold shadow-xs hover:bg-cyan-100 transition whitespace-nowrap shrink-0"
                >
                  <span>💎</span>
                  <span>Full</span>
                </button>
                <button
                  onClick={() => setActiveTab('profile')}
                  title="Admin Full Moneta Balansi"
                  className="flex items-center gap-1 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300/80 text-amber-900 py-1 px-2 rounded-full text-[9.5px] sm:text-[10.5px] font-bold shadow-xs hover:bg-amber-100 transition whitespace-nowrap shrink-0"
                >
                  <Coins className="w-3 h-3 text-amber-600 fill-amber-400 shrink-0" />
                  <span>Full</span>
                </button>
              </>
            ) : currentUser?.gender === 'female' ? (
              <button 
                onClick={() => setShowWithdrawModal(true)}
                className="flex items-center gap-1 bg-cyan-50 border border-cyan-200 text-cyan-900 py-1 px-2 rounded-full text-[10px] font-bold shadow-xs hover:bg-cyan-100 transition active:scale-95 whitespace-nowrap shrink-0"
              >
                <span>💎</span>
                <span>{currentUser?.diamonds ?? 0}</span>
              </button>
            ) : (
              <button 
                onClick={() => setShowTopUpModal(true)}
                className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 py-1 px-2 rounded-full text-[10px] font-bold shadow-xs hover:bg-amber-100 transition active:scale-95 whitespace-nowrap shrink-0"
              >
                <Coins className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />
                <span>{currentUser?.coins ?? 100}</span>
              </button>
            )}

            {isAdminTelegramUser(currentUser) && (
              <button
                onClick={() => setShowAdminPanel(true)}
                title="Admin Panel"
                className="flex items-center gap-1 bg-[#221719] hover:bg-[#352427] text-[#F5D28E] py-1 px-2 rounded-full text-[9.5px] sm:text-[10.5px] font-bold shadow-xs border border-[#C89B54]/40 transition active:scale-95 whitespace-nowrap shrink-0"
              >
                <Crown className="w-3 h-3 shrink-0" />
                <span>Admin</span>
              </button>
            )}

            <button 
              onClick={() => setActiveTab('profile')}
              className="flex items-center gap-1.5 bg-[#FAF4F2] border border-[rgba(166,36,51,0.14)] py-0.5 px-1.5 pr-2 rounded-full shadow-subtle whitespace-nowrap shrink-0 hover:bg-[#F5EBE7] transition"
            >
              {(() => {
                const headerAvatar = resolveAvatarUrl(currentUser?.avatar || firebaseUser?.photoURL);
                const headerName = getSafeUserDisplayName(currentUser, firebaseUser?.displayName || 'Profil');
                return (
                  <>
                    {headerAvatar ? (
                      <img
                        src={headerAvatar}
                        alt={headerName}
                        className="w-5.5 h-5.5 rounded-full object-cover shrink-0 border border-white"
                        onError={(e: any) => {
                          e.currentTarget.style.display = 'none';
                          const fallbackEl = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallbackEl) fallbackEl.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "w-5.5 h-5.5 rounded-full bg-rose-100 text-[#C93545] text-[10px] font-black items-center justify-center shrink-0",
                        headerAvatar ? "hidden" : "flex"
                      )}
                    >
                      {headerName.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-bold truncate max-w-[46px] sm:max-w-[90px] text-[#221719]">{headerName}</span>
                  </>
                );
              })()}
            </button>
            <button onClick={handleLogout} title="Chiqish" aria-label="Chiqish" className="p-1.5 rounded-full bg-[#FAF4F2] hover:bg-rose-100 text-[#C93545] border border-[rgba(166,36,51,0.1)] shrink-0 transition">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

      {/* Scrollable Inner Viewport or Fixed-Height Reels / Map / Chat Container */}
      <div className={`flex-1 min-h-0 relative ${(activeTab === 'reels' || activeTab === 'map' || (activeTab === 'chats' && chatView === 'conversation')) ? 'overflow-hidden flex flex-col p-0' : 'overflow-y-auto overscroll-y-contain p-3 sm:p-5 space-y-4 pb-20'}`}>
        
        {/* --- LANDING TAB --- */}
        {activeTab === 'landing' && <LandingPage onLogin={() => setShowAuthModal(true)} />}

        {/* --- DISCOVER TAB --- */}
        {activeTab === 'discover' && (
          <div className="space-y-4">
            {/* Live Stream Go Live Promo Banner */}
            <div className="bg-gradient-to-r from-[#C93545] via-[#B42A3B] to-[#982030] rounded-[22px] p-4 text-white shadow-lg shadow-rose-900/15 flex items-center justify-between border border-[#C89B54]/30">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-white/15 backdrop-blur-md rounded-full shadow-inner border border-white/20">
                  <Radio className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-xs sm:text-sm tracking-wide">JONLI EFIR (LIVE)</h3>
                  <p className="text-[10.5px] sm:text-xs text-white/85">Kamerangizni yoqing va barcha bilan muloqot qiling</p>
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
                className="bg-white text-[#A62433] px-3.5 py-2 rounded-full text-xs font-black shadow-md shrink-0 hover:bg-[#FDFBF9] transition active:scale-95"
              >
                Efir boshlash 🔴
              </button>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-[20px] border border-[rgba(166,36,51,0.1)] shadow-subtle flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div>
                <h2 className="text-xl sm:text-2xl font-editorial font-bold text-[#221719]">Nomzodlar</h2>
                <p className="text-[11px] text-[#6B5B5E]">Face ID bilan tasdiqlangan haqiqiy insonlar</p>
              </div>
              <select 
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className="w-full sm:w-64 px-3.5 py-2 rounded-xl bg-[#FAF4F2] border border-[rgba(166,36,51,0.12)] text-xs font-semibold text-[#221719] outline-none focus:border-[#C93545]"
              >
                <option value="Barchasi">Barcha viloyatlar</option>
                {Object.keys(UZ_LOCATIONS).map((reg, idx) => (
                  <option key={`reg_opt1_${reg}_${idx}`} value={reg}>{reg}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {isLoadingCandidates ? (
                <>
                  <CandidateSkeleton />
                  <CandidateSkeleton />
                </>
              ) : filteredCandidates.length === 0 ? (
                <div className="col-span-full p-8 text-center bg-white rounded-[24px] border border-[rgba(166,36,51,0.1)] shadow-subtle space-y-3">
                  <div className="w-12 h-12 bg-[#FAF4F2] text-[#C93545] rounded-full flex items-center justify-center mx-auto border border-[rgba(166,36,51,0.12)]">
                    <Users className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-[#221719]">Ushbu filtr bo'yicha nomzodlar topilmadi</h4>
                  <p className="text-xs text-[#6B5B5E]">Filtrni tozalab barcha viloyatdagi nomzodlarni ko'rishingiz mumkin.</p>
                  <button 
                    onClick={() => {
                      setFilterRegion('Barchasi');
                      setFilterDistrict('Barchasi');
                      setSearchQuery('');
                    }}
                    className="px-5 py-2.5 rounded-full bg-[#C93545] text-white text-xs font-bold hover:bg-[#A62433] transition active:scale-95 shadow-xs"
                  >
                    Barcha nomzodlarni ko'rish
                  </button>
                </div>
              ) : filteredCandidates.map((user, idx) => {
                const candidateAvatar = resolveAvatarUrl(user.avatar);
                const candidateName = getSafeUserDisplayName(user, user.name || 'Foydalanuvchi');
                const faceVerified = Boolean(user.faceId?.verified);
                const detectedGender = user.faceId?.detectedGender || user.gender;
                const genderBadge = detectedGender === 'female' ? '👩 Qiz' : '👨 Yigit';
                return (
                <div key={user.uid ? `${user.uid}_${idx}` : `${user.id}_${idx}`} className="bg-white rounded-[22px] p-2.5 shadow-subtle flex flex-col justify-between space-y-2.5 border border-[rgba(166,36,51,0.1)] hover:shadow-md hover:border-[rgba(166,36,51,0.22)] transition-all">
                  <div className="relative aspect-[3/4] w-full rounded-[16px] overflow-hidden bg-[#FAF4F2]">
                    {candidateAvatar ? (
                      <img 
                        src={candidateAvatar} 
                        alt={candidateName} 
                        className="w-full h-full object-cover object-center transition-transform duration-300 hover:scale-105"
                        onError={(e: any) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className={cn(
                        "w-full h-full items-center justify-center bg-gradient-to-br from-[#FAF0EC] to-[#F3DFD9] text-[#A62433] font-editorial font-black text-3xl",
                        candidateAvatar ? "hidden" : "flex"
                      )}
                    >
                      {candidateName.charAt(0).toUpperCase()}
                    </div>
                    
                    {user.isLive && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-600 text-white text-[8px] font-black flex items-center space-x-1 shadow-md animate-pulse border border-white/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        <span>LIVE</span>
                      </div>
                    )}

                    {faceVerified && !user.isLive && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-600/95 backdrop-blur-md text-white text-[8.5px] font-bold flex items-center space-x-1 shadow-xs border border-white/25">
                        <ScanFace className="w-2.5 h-2.5" />
                        <span>Face ID ✓</span>
                      </div>
                    )}

                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#221719]/80 backdrop-blur-sm text-white text-[8px] font-mono font-bold shadow-xs">
                      {user.id}
                    </span>

                    {/* Online / Offline Status Badge */}
                    <div className={cn(
                      "absolute bottom-2 left-2 px-2 py-0.5 rounded-full backdrop-blur-md text-[8.5px] font-semibold flex items-center space-x-1 shadow-xs border border-white/20 text-white",
                      (user.status === 'online' || user.isOnline) ? "bg-emerald-600/90" : "bg-[#221719]/75"
                    )}>
                      <span className={cn("w-1.5 h-1.5 rounded-full bg-white", (user.status === 'online' || user.isOnline) && "animate-pulse")} />
                      <span>{(user.status === 'online' || user.isOnline) ? "Onlayn" : "Oflayn"}</span>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-bold font-editorial text-[#221719] truncate">{candidateName}, {calculateAge(user.birthDate, user.age)} yoshda</h3>
                    <p className="text-[10.5px] text-[#6B5B5E] truncate">{user.district || user.region}</p>

                    {/* Face ID biometric summary inside candidate card */}
                    {faceVerified ? (
                      <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-xl px-2 py-1 text-[9.5px] text-emerald-900 space-y-0.5">
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{genderBadge}</span>
                          </span>
                          <span className="font-mono text-emerald-700">{user.faceId?.confidence ?? 95}%</span>
                        </div>
                        <p className="text-[8.5px] text-emerald-700 font-medium truncate">
                          Face ID · Ko'z & Tabassum ✓
                        </p>
                      </div>
                    ) : isAdminTelegramUser(user) ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-2 py-1 text-[9.5px] font-bold text-amber-900 flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>Platforma Admini</span>
                      </div>
                    ) : (
                      <div className="bg-[#FAF4F2] border border-[rgba(166,36,51,0.08)] rounded-xl px-2 py-1 text-[9.5px] font-semibold text-[#6B5B5E]">
                        {genderBadge}
                      </div>
                    )}
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
                    <button onClick={() => setSelectedProfile(user)} className="flex-1 py-1.5 rounded-full bg-[#FAF4F2] hover:bg-[#F3E4E0] text-[#A62433] font-bold text-[10.5px] border border-[rgba(166,36,51,0.12)] transition active:scale-95">
                      Profil
                    </button>
                    <button onClick={() => openChatWithUser(user)} className="flex-1 py-1.5 rounded-full bg-[#C93545] hover:bg-[#A62433] text-white font-bold text-[10.5px] transition active:scale-95">
                      Chat
                    </button>
                  </div>
                </div>
                );
              })}
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
                      {comments.map((c, idx) => (
                        <div key={c.id ? `${c.id}_${idx}` : `comment_${idx}`} className="text-white text-xs flex items-center space-x-1.5">
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
                  ) : chatsList.map((chat, idx) => {
                    const myUid = currentUser?.uid || firebaseUser?.uid;
                    const otherUid = chat.participants?.find((p: string) => p !== myUid) || chat.partner?.uid || chat.partner?.id;
                    const otherUser = usersList.find(u => u.uid === otherUid || u.id === otherUid) || 
                                      (otherUid === ALOV_AI_USER.uid ? ALOV_AI_USER : null) || 
                                      chat.partner || 
                                      { uid: otherUid, name: 'Foydalanuvchi' };
                    const unread = chat.unreadCount?.[myUid || ''] || 0;
                    
                    return (
                      <motion.div 
                        key={chat.id ? `${chat.id}_${idx}` : `chat_${idx}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => { 
                          setSelectedChatUser(otherUser); 
                          setChatView('conversation'); 
                          setChatsList(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: { ...(c.unreadCount || {}), [myUid || '']: 0 } } : c));
                        }}
                        className={cn(
                          "p-4 flex items-center space-x-3 cursor-pointer hover:bg-slate-50 transition-all relative",
                          chat.isAI && "bg-rose-50/30 border-l-4 border-rose-500"
                        )}
                      >
                        <div className="relative">
                          {resolveAvatarUrl(otherUser?.avatar) ? (
                            <img src={resolveAvatarUrl(otherUser?.avatar)} alt={otherUser?.name || ''} className="w-12 h-12 rounded-full object-cover shrink-0 border border-slate-100" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-rose-100 text-[#E8474A] font-black text-base flex items-center justify-center shrink-0 border border-rose-200">
                              {getSafeUserDisplayName(otherUser, 'F').charAt(0).toUpperCase()}
                            </div>
                          )}
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
              <div className="flex-1 min-h-0 w-full bg-white flex flex-col overflow-hidden">
                <div className="shrink-0 z-20 px-3 py-2.5 border-b border-slate-100 flex items-center justify-between bg-white shadow-subtle">
                  <div className="flex items-center space-x-2 min-w-0">
                    <button onClick={() => setChatView('list')} className="p-2 rounded-full hover:bg-slate-100 text-slate-700 transition active:scale-90 shrink-0">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="relative shrink-0">
                        {resolveAvatarUrl(selectedChatUser?.avatar) ? (
                          <img src={resolveAvatarUrl(selectedChatUser?.avatar)} alt={selectedChatUser?.name || ''} className="w-9 h-9 rounded-full object-cover border border-slate-100" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-rose-100 text-[#E8474A] font-black text-sm flex items-center justify-center border border-rose-200">
                            {getSafeUserDisplayName(selectedChatUser, 'F').charAt(0).toUpperCase()}
                          </div>
                        )}
                        {(selectedChatUser?.status === 'online' || selectedChatUser?.isOnline) && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10B981] border-2 border-white rounded-full"></span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-sans font-bold text-sm text-slate-900 leading-none truncate">{selectedChatUser?.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {(selectedChatUser?.status === 'online' || selectedChatUser?.isOnline) ? 'tarmoqda' : 'yaqinda online edi'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    {(() => {
                      const myUid = currentUser?.uid || firebaseUser?.uid;
                      const otherUid = selectedChatUser?.uid || selectedChatUser?.id;
                      const activeChatId = (myUid && otherUid) ? [myUid, otherUid].sort().join('_') : '';
                      const isAIBotChat = otherUid === ALOV_AI_USER.uid || otherUid === 'user_kamola_006' || otherUid === 'ALOV-006';
                      const isFriendActive = Boolean(activeChatId && chatFriendships[activeChatId]);
                      if (currentUser?.gender === 'female' && !isAIBotChat) {
                        return (
                          <button
                            type="button"
                            onClick={handleToggleFriendship}
                            title={isFriendActive ? "Do'stlashishni bekor qilish (5 moneta yechiladi)" : "Do'stlashish — yigitdan moneta yechilmaydi"}
                            className={cn(
                              "px-2.5 py-1.5 rounded-full text-[10px] font-bold flex items-center space-x-1 transition active:scale-95 whitespace-nowrap shrink-0",
                              isFriendActive
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "bg-rose-50 hover:bg-rose-100 text-[#E8474A] border border-rose-200"
                            )}
                          >
                            <Handshake className="w-3.5 h-3.5" />
                            <span>{isFriendActive ? "Do'stlashilgan ✓" : "Do'stlashish"}</span>
                          </button>
                        );
                      }
                      return null;
                    })()}
                    <button 
                      onClick={() => setShowGiftModal(true)} 
                      title="Sovg'a yuborish 🎁"
                      className="p-2 rounded-full hover:bg-amber-50 text-amber-500 transition active:scale-90"
                    >
                      <Gift className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => {
                        if (selectedChatUser) {
                          setActiveCallUser(selectedChatUser);
                        }
                      }} 
                      title="Video qo'ng'iroq va Ekran ulashish 📹"
                      className="p-2 rounded-full hover:bg-rose-50 text-[#E8474A] transition active:scale-90"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {(() => {
                  const myUid = currentUser?.uid || firebaseUser?.uid;
                  const otherUid = selectedChatUser?.uid || selectedChatUser?.id;
                  const activeChatId = (myUid && otherUid) ? [myUid, otherUid].sort().join('_') : '';
                  const isFriendActive = Boolean(activeChatId && chatFriendships[activeChatId]);
                  const isAIBotChat = otherUid === ALOV_AI_USER.uid || otherUid === 'user_kamola_006' || otherUid === 'ALOV-006';

                  if (isFriendActive && !isAIBotChat) {
                    return (
                      <div className="bg-emerald-600 text-white px-3.5 py-1.5 text-[10px] font-bold flex items-center justify-between shrink-0 shadow-xs">
                        <span>🤝 Do'stlashish faol — Yigitdan moneta yechilmaydi</span>
                        <span className="bg-white/20 px-2 py-0.5 rounded-full text-[9px] whitespace-nowrap">Bepul chat</span>
                      </div>
                    );
                  }
                  if (currentUser?.gender === 'female') {
                    return (
                      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-3.5 py-1.5 text-[10px] font-bold flex items-center justify-between shrink-0 shadow-xs">
                        <span>💎 Har bir javobingiz uchun +5 Almaz limitga qo'shiladi</span>
                        <span className="bg-white/20 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider whitespace-nowrap">Wallet: {currentUser?.diamonds ?? 0}</span>
                      </div>
                    );
                  }
                  if (!isAIBotChat) {
                    return (
                      <div className="bg-amber-50 border-b border-amber-200/70 text-amber-900 px-3.5 py-1.5 text-[10px] font-bold flex items-center justify-between shrink-0">
                        <span>🪙 Har bir xabar narxi: {MESSAGE_COIN_COST} Moneta</span>
                        <span className="bg-amber-100 px-2 py-0.5 rounded-full text-[9px] whitespace-nowrap">Balans: {currentUser?.coins ?? 100}</span>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div ref={chatMessagesContainerRef} className="flex-1 min-h-0 px-3.5 py-3 overflow-y-auto overscroll-y-contain space-y-2.5 bg-[#F8F9FA] [-webkit-overflow-scrolling:touch]">
                  <AnimatePresence>
                    {(() => {
                      const myUid = currentUser?.uid || firebaseUser?.uid;
                      const otherUid = selectedChatUser?.uid || selectedChatUser?.id;
                      const activeKey = selectedChatUser?.id || selectedChatUser?.uid;
                      const activeChatId = (myUid && otherUid) ? [myUid, otherUid].sort().join('_') : null;

                      const msgs = (activeChatId && chatMessages[activeChatId]) ||
                                   (activeKey && chatMessages[activeKey]) ||
                                   (selectedChatUser?.uid && chatMessages[selectedChatUser.uid]) ||
                                   (selectedChatUser?.id && chatMessages[selectedChatUser.id]) ||
                                   [];
                      
                      const sortedMessages = [...msgs].sort((a, b) => 
                        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
                      );

                      return sortedMessages.map((msg, idx) => {
                        const isMe = msg.senderId === 'me' || (myUid && (msg.senderId === myUid || msg.userId === myUid));

                        return (
                          <motion.div 
                            key={msg.id ? `${msg.id}_${idx}` : `msg_${idx}`}
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
                              {msg.type === 'gift' ? (
                                <div className="flex items-center space-x-2.5 py-1">
                                  <span className="text-3xl shrink-0">{msg.giftIcon || '🎁'}</span>
                                  <div>
                                    <p className="font-extrabold text-xs">{msg.giftName || 'Sovg\'a'} yuborildi!</p>
                                    <p className="text-[10px] opacity-90 flex items-center space-x-1 mt-0.5">
                                      <span>🪙 {msg.coinPrice || 10} moneta</span>
                                    </p>
                                  </div>
                                </div>
                              ) : msg.type === 'meet' ? (
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
                                  <div className="flex items-center ml-1 shrink-0">
                                    {msg.status === 'sending' ? (
                                      <Clock className="w-3 h-3 text-rose-200/90 animate-pulse" />
                                    ) : (msg.status === 'read' || msg.read) ? (
                                      <CheckCheck className="w-3.5 h-3.5 text-blue-300 font-bold" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5 text-rose-200" />
                                    )}
                                  </div>
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
                </div>

                {/* 0%-100% Diamond Limit Bar + 24h Wallet Credit Timer Above Text Bar */}
                {(() => {
                  const progressVal = Number(currentUser?.diamondProgress || 0);
                  const progressPct = getDiamondProgressPercent(progressVal);
                  const pendingBatches = Array.isArray(currentUser?.pendingDiamondBatches) ? currentUser.pendingDiamondBatches : [];
                  const pendingTotal = getPendingDiamondsTotal(pendingBatches);
                  const nextUnlockAt = getNextUnlockTimestamp(pendingBatches);
                  const countdown = computeCountdownParts(nextUnlockAt, countdownNow);

                  if (currentUser?.gender === 'female') {
                    return (
                      <div className="bg-white border-t border-slate-100 px-3.5 pt-2 pb-1.5 shrink-0 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-slate-700 flex items-center gap-1">
                            <span>💎 Olmos limiti:</span>
                            <span className="text-cyan-700 font-black">{progressVal} / {DIAMOND_LIMIT_TARGET}</span>
                          </span>
                          <span className="text-emerald-600 font-black">{progressPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500 rounded-full"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        {pendingTotal > 0 && (
                          <div className="flex items-center justify-between text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{pendingTotal} 💎 24 soat ichida hisobga qo'shiladi</span>
                            </span>
                            <span className="font-mono font-black text-amber-900">{countdown.formatted}</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="shrink-0 z-20 px-3 py-2.5 pb-safe bg-white border-t border-slate-100 flex items-end space-x-2">
                  <label aria-label="Media yuklash" className="p-2.5 rounded-full text-slate-400 hover:bg-slate-50 transition active:scale-90 cursor-pointer shrink-0">
                    <Plus className="w-5 h-5" />
                    <input type="file" className="hidden" accept="image/*,video/*,audio/*" onChange={handleMediaUpload} />
                  </label>
                  <div className="flex-1 relative">
                    <textarea 
                      placeholder="Xabar yozing..." 
                      rows={1}
                      value={inputMessage}
                      onFocus={() => {
                        setTimeout(() => {
                          const el = chatMessagesContainerRef.current;
                          if (el) el.scrollTop = el.scrollHeight;
                        }, 120);
                      }}
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
          <div className="bg-white rounded-[24px] border border-[rgba(166,36,51,0.1)] shadow-subtle p-5 sm:p-6 space-y-4">
            {(() => {
              const profileAvatar = resolveAvatarUrl(currentUser?.avatar || firebaseUser?.photoURL);
              const profileName = getSafeUserDisplayName(currentUser, firebaseUser?.displayName || 'Profil');
              return (
                <div className="flex items-center space-x-4">
                  {profileAvatar ? (
                    <img
                      src={profileAvatar}
                      alt={profileName}
                      className="w-18 h-18 rounded-full object-cover border-2 border-[#C93545] shrink-0 shadow-sm"
                      onError={(e: any) => {
                        e.currentTarget.style.display = 'none';
                        const fallbackEl = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallbackEl) fallbackEl.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className={cn(
                      "w-18 h-18 rounded-full bg-[#FAF4F2] text-[#C93545] font-editorial font-black text-2xl items-center justify-center border-2 border-[#C93545] shrink-0",
                      profileAvatar ? "hidden" : "flex"
                    )}
                  >
                    {profileName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl sm:text-2xl font-editorial font-bold truncate text-[#221719]">{profileName}</h1>
                      {isAdminTelegramUser(currentUser) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#221719] text-[#F5D28E] text-[10px] font-bold">
                          <Crown className="w-3 h-3" />
                          <span>Admin</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono font-bold text-[#C93545]">ID: {currentUser?.id}</p>
                    <p className="text-[11px] text-[#6B5B5E]">{[currentUser?.district, currentUser?.region].filter(Boolean).join(', ') || "O'zbekiston"}</p>
                  </div>
                </div>
              );
            })()}

            {/* Admin Full Coins + Full Diamonds Card */}
            {isAdminTelegramUser(currentUser) && (
              <div className="grid grid-cols-2 gap-2.5 bg-gradient-to-r from-[#221719] to-[#3A2226] text-white p-3.5 rounded-[18px] border border-[#C89B54]/40 shadow-sm">
                <div className="bg-white/10 rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[#F5D28E] font-bold uppercase tracking-wider">Almaz Wallet</p>
                    <p className="text-sm sm:text-base font-black text-white">💎 Full ({(currentUser?.diamonds ?? ADMIN_FULL_DIAMONDS).toLocaleString()})</p>
                  </div>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[#F5D28E] font-bold uppercase tracking-wider">Moneta Balansi</p>
                    <p className="text-sm sm:text-base font-black text-white">🪙 Full ({(currentUser?.coins ?? ADMIN_FULL_COINS).toLocaleString()})</p>
                  </div>
                </div>
              </div>
            )}

            {/* Face ID Biometric Card */}
            {currentUser?.faceId?.verified ? (
              <div className="bg-emerald-50/90 border border-emerald-200 rounded-[18px] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <ScanFace className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-950">Face ID Biometrik Tasdiqlangan</p>
                      <p className="text-[10.5px] text-emerald-800 font-medium">
                        Aniqlangan jins: <b>{genderToUzLabel(currentUser.faceId.detectedGender || currentUser.gender)}</b> · {currentUser.faceId.confidence ?? 95}%
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9.5px] font-bold shrink-0">
                    TASDIQLANGAN ✓
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-emerald-800 pt-1 border-t border-emerald-200/70">
                  <span>Jonlilik: Ko'z harakati · Tabassum ✓</span>
                  {currentUser.faceId.verifiedAt && (
                    <span>Sana: {formatFaceIdDateUz(currentUser.faceId.verifiedAt)}</span>
                  )}
                </div>
              </div>
            ) : isAdminTelegramUser(currentUser) ? (
              <div className="bg-[#FAF4F2] border border-[#C89B54]/30 rounded-[16px] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-[#C89B54]" />
                  <span className="text-xs font-bold text-[#221719]">Admin hisobi (Face ID tekshiruvisiz kirish faol)</span>
                </div>
              </div>
            ) : null}

            {/* Public Account Stats (Followers / Following / Likes) */}
            <div className="grid grid-cols-3 gap-2 text-center bg-[#FAF4F2] p-3 rounded-[16px] border border-[rgba(166,36,51,0.08)]">
              <div>
                <p className="text-sm font-black text-[#C93545]">{currentUser?.followersCount ?? 0}</p>
                <p className="text-[9.5px] text-[#6B5B5E] font-bold">Obunachilar</p>
              </div>
              <div>
                <p className="text-sm font-black text-[#221719]">{currentUser?.followingCount ?? 0}</p>
                <p className="text-[9.5px] text-[#6B5B5E] font-bold">Obunalar</p>
              </div>
              <div>
                <p className="text-sm font-black text-[#A62433]">{currentUser?.likesCount ?? 0}</p>
                <p className="text-[9.5px] text-[#6B5B5E] font-bold">Laiklar</p>
              </div>
            </div>

            {currentUser?.gender === 'female' && !isAdminTelegramUser(currentUser) && (() => {
              const progressVal = Number(currentUser?.diamondProgress || 0);
              const progressPct = getDiamondProgressPercent(progressVal);
              const pendingTotal = getPendingDiamondsTotal(currentUser?.pendingDiamondBatches);
              const nextUnlockAt = getNextUnlockTimestamp(currentUser?.pendingDiamondBatches);
              const countdown = computeCountdownParts(nextUnlockAt, countdownNow);
              return (
                <div className="bg-cyan-50/70 border border-cyan-200 rounded-[14px] p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-cyan-950">
                    <span>💎 Olmos limiti (0% - 100%)</span>
                    <span>{progressVal} / {DIAMOND_LIMIT_TARGET} ({progressPct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-cyan-100">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {pendingTotal > 0 && (
                    <p className="text-[10px] font-bold text-amber-800 flex items-center justify-between">
                      <span>⏳ Walletga qo'shilish vaqti ({pendingTotal} 💎):</span>
                      <span className="font-mono font-black">{countdown.formatted}</span>
                    </p>
                  )}
                </div>
              );
            })()}

            <p className="text-xs text-[#4A3B3D] bg-[#FAF4F2] p-3.5 rounded-[14px] border border-[rgba(166,36,51,0.06)]">{currentUser?.bio}</p>

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

            {isAdminTelegramUser(currentUser) && (
              <button
                onClick={() => setShowAdminPanel(true)}
                className="w-full py-3 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 text-amber-300 font-bold text-xs shadow-md flex items-center justify-center space-x-2"
              >
                <Crown className="w-4 h-4" />
                <span>Admin Panelni Ochish (@Salikh_07)</span>
              </button>
            )}

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
                setRegLocationVisibility(currentUser?.locationVisibility || 'everyone');
                setShowProfileModal(true);
              }}
              className="w-full py-3 rounded-full bg-slate-900 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-2"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Profilni tahrirlash</span>
            </button>
          </div>
        )}

        {/* --- MAP / XARITA TAB (Unified Standard Map + Smooth In-Bounds Markers) --- */}
        {activeTab === 'map' && (
          <div className="absolute inset-0 z-30 bg-white flex flex-col overflow-hidden">
            {/* Ghost Mode Notification Banner */}
            {!isLocationEnabled && !activeRouteUser && (
              <div className="bg-amber-50 border-b border-amber-200 p-2 px-3 flex items-center justify-between shrink-0 z-30 text-amber-900 text-xs shadow-sm">
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
              <div className="bg-rose-50 border-b border-rose-200 p-2 px-3 text-[#E8474A] text-[10px] font-semibold flex items-center justify-between shrink-0 z-30 gap-2">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{gpsStatusMsg}</span>
                </div>
                <button onClick={() => handleToggleLocation(true)} className="underline text-[10px] font-bold shrink-0">
                  Qayta urinish
                </button>
              </div>
            )}

            {/* Map Viewport Wrapper with overlay controls inside map bounds */}
            <div className="relative flex-1 min-h-0 w-full overflow-hidden">
              {/* Active Route Info Floating Banner */}
              {activeRouteUser && routeInfo && (
                <div className="absolute top-3 left-3 right-3 z-40 bg-white/95 backdrop-blur-md rounded-[20px] p-3 shadow-xl border border-rose-100 flex items-center justify-between animate-fadeIn">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    {resolveAvatarUrl(activeRouteUser.avatar) ? (
                      <img src={resolveAvatarUrl(activeRouteUser.avatar)} alt={activeRouteUser.name} className="w-10 h-10 rounded-full object-cover border-2 border-[#E8474A] shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-rose-100 text-[#E8474A] font-black text-sm flex items-center justify-center border-2 border-[#E8474A] shrink-0">
                        {getSafeUserDisplayName(activeRouteUser, 'F').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
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
                    className="p-1.5 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold shadow-subtle shrink-0"
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
                title="Hudud bo'yicha filtr"
                className="absolute top-14 right-3 z-40 bg-white shadow-lg p-2.5 rounded-full flex items-center space-x-2 border border-slate-200"
              >
                <div className="w-5 h-5 flex items-center justify-center bg-[#E8474A] rounded-full text-white font-bold text-[10px]">F</div>
              </button>

              {/* Re-center on My Location Button */}
              <button
                type="button"
                onClick={() => {
                  if (mapInstanceRef.current && userCoords?.lat && userCoords?.lng) {
                    mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 14, { animate: true });
                  } else {
                    handleToggleLocation(true);
                  }
                }}
                title="Mening joylashuvim"
                className="absolute bottom-4 right-3 z-40 bg-white hover:bg-slate-50 text-[#E8474A] shadow-lg p-3 rounded-full border border-slate-200 transition active:scale-95"
              >
                <Navigation className="w-4 h-4" />
              </button>

              {/* Filter Modal */}
              {showFilterModal && (
                <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 w-full space-y-4 shadow-2xl">
                      <h3 className="font-bold text-lg">Hudud bo'yicha filtr</h3>
                      <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterDistrict('Barchasi'); }} className="w-full p-3 rounded-xl border">
                          <option value="Barchasi">Barcha viloyatlar</option>
                          {Object.keys(UZ_LOCATIONS).map((reg, idx) => <option key={`filter_modal_reg_${reg}_${idx}`} value={reg}>{reg}</option>)}
                      </select>
                      <select value={filterDistrict} onChange={(e) => setFilterDistrict(e.target.value)} className="w-full p-3 rounded-xl border">
                          <option value="Barchasi">Barcha tumanlar</option>
                          {UZ_LOCATIONS[filterRegion]?.map((dist, idx) => <option key={`filter_modal_dist_${dist}_${idx}`} value={dist}>{dist}</option>)}
                      </select>
                      <div className="flex space-x-2 pt-2">
                          <button onClick={() => setShowFilterModal(false)} className="flex-1 p-3 rounded-xl bg-gray-100 font-bold">Yopish</button>
                          <button onClick={() => { setShowFilterModal(false); }} className="flex-1 p-3 rounded-xl bg-[#E8474A] text-white font-bold">Qidirish</button>
                      </div>
                  </div>
                </div>
              )}

              {/* Map Container */}
              <div className="relative z-10 w-full h-full overflow-hidden" id="alov-leaflet-map" ref={mapContainerRef}></div>
            </div>
          </div>

        )}

      </div>

      {/* Sticky Bottom Navigation - Pinned permanently to bottom */}
      {activeTab !== 'reels' && !(activeTab === 'chats' && chatView === 'conversation') && (
        <nav className="sticky bottom-0 left-0 right-0 z-50 shrink-0 bg-white/95 backdrop-blur-xl border-t border-[rgba(166,36,51,0.1)] px-2 py-2.5 flex items-center justify-around shadow-medium">
          <button onClick={() => setActiveTab('discover')} className={`flex flex-col items-center p-1 transition ${activeTab === 'discover' ? 'text-[#C93545] font-bold' : 'text-[#6B5B5E] hover:text-[#221719]'}`}>
            <Users className="w-4.5 h-4.5" />
            <span className="text-[10px]">Nomzodlar</span>
          </button>
          <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center p-1 transition ${activeTab === 'map' ? 'text-[#C93545] font-bold' : 'text-[#6B5B5E] hover:text-[#221719]'}`}>
            <MapPin className="w-4.5 h-4.5" />
            <span className="text-[10px]">Xarita</span>
          </button>
          <button onClick={() => setActiveTab('reels')} className={`flex flex-col items-center p-1 transition ${activeTab === 'reels' ? 'text-[#C93545] font-bold' : 'text-[#6B5B5E] hover:text-[#221719]'}`}>
            <Video className="w-4.5 h-4.5" />
            <span className="text-[10px]">Efirlar</span>
          </button>
          <button onClick={() => { setChatView('list'); setActiveTab('chats'); }} className={`flex flex-col items-center p-1 transition ${activeTab === 'chats' ? 'text-[#C93545] font-bold' : 'text-[#6B5B5E] hover:text-[#221719]'}`}>
            <MessageCircle className="w-4.5 h-4.5" />
            <span className="text-[10px]">Chatlar</span>
          </button>
          <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center p-1 transition ${activeTab === 'profile' ? 'text-[#C93545] font-bold' : 'text-[#6B5B5E] hover:text-[#221719]'}`}>
            <UserIcon className="w-4.5 h-4.5" />
            <span className="text-[10px]">Profil</span>
          </button>
        </nav>
      )}

    </div>
  );

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#FDFBF9] flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-rose-200 border-t-[#C93545] animate-spin" />
          <Flame className="w-5 h-5 text-[#C93545] absolute inset-0 m-auto animate-pulse" />
        </div>
        <div className="text-2xl font-editorial font-black tracking-tight text-[#221719]">
          alov<span className="text-[#C93545]">.uz</span>
        </div>
        <p className="text-xs text-[#6B5B5E] font-medium">Sessiya tiklanmoqda...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF9] text-[#221719] font-sans selection:bg-[#C93545] selection:text-white">
      
      {/* Landing Page */}
      {(!firebaseUser && !currentUser) || activeTab === 'landing' ? (
        <LandingPage onLogin={() => setShowAuthModal(true)} />
      ) : (
        <div className="min-h-screen bg-gradient-to-br from-[#FBF5F2] via-[#F6ECE7] to-[#EFE1D9] flex flex-col items-center justify-center p-0 md:p-4 overflow-hidden">
          {showUpdateBanner && (
            <motion.div 
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-[1040px] bg-amber-50 border-b border-amber-200 p-3 flex items-center justify-between z-[60] shadow-md mb-2 rounded-xl"
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
          <div className="w-full md:max-w-[1040px] h-[100dvh] md:h-[calc(100dvh-2rem)] bg-[#FDFBF9] md:rounded-[28px] md:shadow-[0_24px_70px_rgba(34,23,25,0.1)] md:border md:border-[rgba(166,36,51,0.12)] relative overflow-hidden flex flex-col">
            {dashboardContent}
          </div>
        </div>
      )}

      {/* --- AUTHENTICATION MODAL --- */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#221719]/60 backdrop-blur-md animate-fadeIn">
          <div className={cn(
            "bg-[#FDFBF9] rounded-[32px] w-full p-6 text-left space-y-4 relative shadow-2xl border border-[rgba(166,36,51,0.14)] max-h-[92vh] overflow-y-auto",
            (authMode === 'google_face_id' || authMode === 'register_face_id' || (authMode === 'telegram' && telegramStep === 'face_id')) ? "max-w-md" : "max-w-sm"
          )}>
            <button 
              onClick={() => {
                setShowAuthModal(false);
                setAuthMode('login');
                setTelegramStep('input_phone');
              }} 
              aria-label="Oynani yopish"
              className="absolute top-5 right-5 p-1.5 rounded-full text-[#6B5B5E] hover:text-[#221719] hover:bg-[#FAF4F2] transition z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {(authMode === 'google_face_id' || authMode === 'register_face_id' || (authMode === 'telegram' && telegramStep === 'face_id')) ? (
              <FaceIdVerificationModal
                apiBaseUrl={getBaseUrl()}
                userUid={
                  authMode === 'telegram'
                    ? pendingTgUser?.uid
                    : (pendingGoogleUser?.uid || firebaseUser?.uid || currentUser?.uid)
                }
                userName={
                  regName ||
                  pendingTgUser?.name ||
                  pendingGoogleUser?.displayName ||
                  firebaseUser?.displayName ||
                  'Foydalanuvchi'
                }
                onVerified={(result) =>
                  handleFaceIdVerified(
                    result,
                    authMode === 'telegram'
                      ? 'telegram'
                      : authMode === 'register_face_id'
                        ? 'register'
                        : 'google'
                  )
                }
                onCancel={() => {
                  setShowAuthModal(false);
                  setAuthMode('login');
                  setTelegramStep('input_phone');
                }}
              />
            ) : authMode === 'google_setup' ? (
              <div className="space-y-4">
                <div className="space-y-1 text-center">
                  <h2 className="text-xl font-editorial font-black text-[#221719] tracking-tight">Profilni yakunlash ✨</h2>
                  <p className="text-xs text-[#6B5B5E] font-medium">Face ID tasdiqlandi. Endi qolgan ma'lumotlarni to'ldiring:</p>
                </div>

                {/* Face ID captured avatar & auto-detected gender banner */}
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3">
                  <div className="w-14 h-14 rounded-full bg-white shadow-sm overflow-hidden shrink-0 border-2 border-emerald-500 flex items-center justify-center">
                    {resolveAvatarUrl(regAvatar) ? (
                      <img src={resolveAvatarUrl(regAvatar)} alt="Face ID" className="w-full h-full object-cover" />
                    ) : (
                      <ScanFace className="w-6 h-6 text-emerald-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Face ID Tasdiqlandi</span>
                    </p>
                    <p className="text-xs font-black text-[#221719] mt-0.5">
                      Jins: {genderToUzLabel(pendingFaceId?.detectedGender || regGender)} ({pendingFaceId?.confidence ?? 95}%)
                    </p>
                    <p className="text-[10px] text-emerald-700 font-medium">Rasm Face ID dan avtomatik olindi</p>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleCompleteGoogleRegistration} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#221719] mb-1">Ism va Familiya</label>
                    <input 
                      type="text" 
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[rgba(166,36,51,0.15)] text-xs font-semibold text-[#221719] focus:border-[#C93545] outline-none"
                      placeholder="Ismingiz..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-[#221719] mb-1">Tug'ilgan sana</label>
                      <input 
                        type="date" 
                        value={regBirthDate}
                        onChange={(e) => {
                          const bDate = e.target.value;
                          setRegBirthDate(bDate);
                          setRegAge(String(calculateAge(bDate)));
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-white border border-[rgba(166,36,51,0.15)] text-xs font-semibold text-[#221719] focus:border-[#C93545] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#221719] mb-1">Jins (Face ID)</label>
                      <div className="w-full px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center justify-between">
                        <span>{genderToUzLabel(pendingFaceId?.detectedGender || regGender)}</span>
                        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#221719] mb-1">Viloyat</label>
                    <select 
                      value={regRegion}
                      onChange={(e) => {
                        const reg = e.target.value;
                        setRegRegion(reg);
                        const dists = UZ_LOCATIONS[reg] || [];
                        if (dists.length > 0) setRegDistrict(dists[0]);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[rgba(166,36,51,0.15)] text-xs font-semibold text-[#221719] focus:border-[#C93545] outline-none"
                    >
                      {Object.keys(UZ_LOCATIONS).map((reg) => (
                        <option key={reg} value={reg}>{reg}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#221719] mb-1">Telegram (Havola / Username)</label>
                    <input 
                      type="text" 
                      value={regTelegram}
                      onChange={(e) => setRegTelegram(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[rgba(166,36,51,0.15)] text-xs font-semibold text-[#221719] focus:border-[#C93545] outline-none"
                      placeholder="https://t.me/username yoki @username"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#221719] mb-1">Akkaunt uchun Parol (Kirish uchun)</label>
                    <input 
                      type="password" 
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[rgba(166,36,51,0.15)] text-xs font-semibold text-[#221719] focus:border-[#C93545] outline-none"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#221719] mb-1">Bio / O'zingiz haqingizda</label>
                    <textarea 
                      value={regBio}
                      onChange={(e) => setRegBio(e.target.value)}
                      rows={2}
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-[rgba(166,36,51,0.15)] text-xs font-semibold text-[#221719] focus:border-[#C93545] outline-none resize-none"
                      placeholder="Qanday insonlarni qidiryapsiz..."
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3 px-4 rounded-2xl bg-[#C93545] text-white font-bold text-sm shadow-md hover:bg-[#A62433] transition disabled:opacity-60"
                  >
                    {isLoggingIn ? "Saqlanmoqda..." : "Profilni yaratish va boshlash ✨"}
                  </button>
                </form>
              </div>
            ) : telegramStep === 'input_phone' && authMode === 'telegram' ? (
              <div className="space-y-4">
                <div className="space-y-1 text-center">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Telegram orqali kirish</h2>
                  <p className="text-xs text-slate-500 font-medium">Telefon raqamingiz yoki @username'ingizni kiriting:</p>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                {hasStartedBotError && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-3 text-left">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 font-medium leading-relaxed">
                        <p className="font-bold text-amber-950">Botimizga ruxsat berilmagan!</p>
                        <p className="mt-1">Kodni Telegram xabarnomasida olish uchun avval rasmiy botimizga kirib <b>/start</b> tugmasini bosing:</p>
                      </div>
                    </div>
                    
                    <a 
                      href={
                        telegramInput.trim() 
                          ? `https://t.me/alovuz_bot?start=${encodeURIComponent(telegramInput.trim().replace(/^(https?:\/\/t\.me\/|@)/i, ''))}`
                          : "https://t.me/alovuz_bot"
                      } 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={() => {
                        try {
                          const cleanKey = telegramInput.trim().replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
                          localStorage.setItem('alov_tg_opened_' + cleanKey, 'true');
                        } catch(e) {}
                      }}
                      className="flex items-center justify-center space-x-2 w-full py-2.5 px-4 rounded-xl bg-[#229ED9] text-white font-bold text-xs hover:bg-[#1f8fc6] transition shadow-xs"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27 0-.12.05-1.98 1.26-5.6 3.7-.53.36-1.01.54-1.44.53-.47-.01-1.38-.26-2.06-.48-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.98-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.4-.02.07-.02.13-.04.2z"/>
                      </svg>
                      <span>🤖 Botga o'tish (@alovuz_bot)</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                <form onSubmit={handleStartTelegramAuth} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Telefon raqam yoki Username</label>
                    <input 
                      type="text" 
                      value={telegramInput}
                      onChange={(e) => {
                        setTelegramInput(e.target.value);
                        if (hasStartedBotError) setHasStartedBotError(false);
                      }}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-red-500 focus:bg-white outline-none"
                      placeholder="+998901234567 yoki @username"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3 px-4 rounded-2xl bg-[#229ED9] text-white font-bold text-sm shadow-md hover:bg-[#1f8fc6] transition disabled:opacity-60"
                  >
                    {isLoggingIn ? "Tekshirilmoqda..." : hasStartedBotError ? "🔄 Botni yoqdim (Kodni yuborish)" : "Tasdiqlash kodi olish 📨"}
                  </button>

                  <button 
                    type="button"
                    onClick={() => { setAuthMode('login'); setTelegramStep('input_phone'); setHasStartedBotError(false); setErrorMsg(''); }}
                    className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800 pt-1"
                  >
                    Orqaga qaytish
                  </button>
                </form>
              </div>
            ) : telegramStep === 'input_code' ? (
              <div className="space-y-4 text-center">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Tasdiqlash Kodini Kiriting 🔐</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Kodingiz Telegram botimiz (<b>@alovuz_bot</b>) chatiga yuborildi:
                  </p>
                </div>

                <a 
                  href="https://t.me/alovuz_bot" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center space-x-2 w-full py-3 px-4 rounded-2xl bg-[#229ED9] text-white font-bold text-xs hover:bg-[#1f8fc6] transition shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27 0-.12.05-1.98 1.26-5.6 3.7-.53.36-1.01.54-1.44.53-.47-.01-1.38-.26-2.06-.48-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.98-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.4-.02.07-.02.13-.04.2z"/>
                  </svg>
                  <span>🤖 Botga o'tish va kodni ko'rish (@alovuz_bot)</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold text-left">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleVerifyTelegramCode} className="space-y-3 text-left">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">6 xonali tasdiqlash kodi</label>
                    <input 
                      type="text" 
                      maxLength={6}
                      value={enteredTgCode}
                      onChange={(e) => setEnteredTgCode(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-xl font-black tracking-widest text-slate-900 focus:border-red-500 focus:bg-white outline-none"
                      placeholder="123456"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3 px-4 rounded-2xl bg-[#E8474A] text-white font-bold text-sm shadow-md hover:bg-[#cb2e31] transition disabled:opacity-60"
                  >
                    {isLoggingIn ? "Tekshirilmoqda..." : "Tasdiqlash va kirish 🚀"}
                  </button>

                  <button 
                    type="button"
                    onClick={() => { setTelegramStep('input_phone'); setEnteredTgCode(''); setErrorMsg(''); }}
                    className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800 pt-1"
                  >
                    Raqamni qayta kiritish
                  </button>
                </form>
              </div>
            ) : telegramStep === 'profile_setup' ? (
              <div className="space-y-4">
                <div className="space-y-1 text-center">
                  <h2 className="text-xl font-editorial font-black text-[#221719] tracking-tight">Profilni yakunlash ✨</h2>
                  <p className="text-xs text-[#6B5B5E] font-medium">Face ID tasdiqlandi. Endi qolgan ma'lumotlaringizni kiriting.</p>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3 mb-1">
                  {(() => {
                    const setupAvatar = resolveAvatarUrl(regAvatar);
                    const setupDisplayName = regName.trim() || 'Ismingizni kiriting';
                    return (
                      <>
                        <div className="w-14 h-14 rounded-full bg-white shadow-sm overflow-hidden shrink-0 border-2 border-emerald-500 flex items-center justify-center">
                          {setupAvatar ? (
                            <img
                              src={setupAvatar}
                              alt={setupDisplayName}
                              className="w-full h-full object-cover"
                              onError={(e: any) => {
                                e.currentTarget.style.display = 'none';
                                const fallbackEl = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (fallbackEl) fallbackEl.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div
                            className={cn(
                              "w-full h-full items-center justify-center bg-emerald-100 text-emerald-600 font-black text-lg",
                              setupAvatar ? "hidden" : "flex"
                            )}
                          >
                            {(regName.trim().charAt(0) || 'A').toUpperCase()}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Face ID Tasdiqlangan Profil</span>
                          </p>
                          <p className="text-sm font-black text-[#221719] truncate">{setupDisplayName}</p>
                          <p className="text-[10.5px] font-bold text-emerald-800">
                            Aniqlangan jins: {genderToUzLabel(pendingFaceId?.detectedGender || regGender)} ({pendingFaceId?.confidence ?? 95}%)
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <form onSubmit={handleCompleteTelegramRegistration} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Ismingiz</span>
                      <span className="text-[10px] text-slate-400 font-medium">* Familiya ixtiyoriy</span>
                    </label>
                    <input 
                      type="text" 
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[rgba(166,36,51,0.15)] text-xs font-semibold text-[#221719] focus:border-[#C93545] outline-none transition-all shadow-xs"
                      placeholder="Ismingiz (masalan: Malika)..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Viloyat</label>
                      <select 
                        value={regRegion}
                        onChange={(e) => {
                          setRegRegion(e.target.value);
                          setRegDistrict(UZ_LOCATIONS[e.target.value][0]);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-[#E8474A] outline-none"
                      >
                        {Object.keys(UZ_LOCATIONS).map((reg) => (
                          <option key={`reg_setup_${reg}`} value={reg}>{reg}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Tuman</label>
                      <select 
                        value={regDistrict}
                        onChange={(e) => setRegDistrict(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-[#E8474A] outline-none"
                      >
                        {UZ_LOCATIONS[regRegion]?.map((dist) => (
                          <option key={`dist_setup_${dist}`} value={dist}>{dist}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Akkaunt uchun Parol</span>
                      <span className="text-[10px] text-rose-500 font-medium">* Majburiy</span>
                    </label>
                    <input 
                      type="password" 
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      required
                      autoFocus
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-900 focus:border-[#E8474A] focus:bg-white outline-none transition-all shadow-sm"
                      placeholder="••••••••"
                    />
                    <p className="mt-2 text-[10px] text-slate-400 leading-relaxed px-1">
                      Kelajakda boshqa qurilmalardan kirish uchun ushbu paroldan foydalanasiz.
                    </p>
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-4 px-4 rounded-2xl bg-[#E8474A] text-white font-bold text-sm shadow-lg shadow-rose-500/20 hover:bg-[#cb2e31] transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center space-x-2"
                  >
                    {isLoggingIn ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saqlanmoqda...</span>
                      </>
                    ) : (
                      <span>Platformaga kirish ✨</span>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Alov.uz ga xush kelibsiz</h2>
                  <p className="text-xs text-slate-500 font-medium">Tanishuv va muloqot dunyosiga kiring</p>
                </div>

                {/* Tab Switcher */}
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl">
                  <button 
                    type="button"
                    onClick={() => { setAuthMode('login'); setErrorMsg(''); }}
                    className={`py-2 rounded-xl text-xs font-bold transition ${authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Kirish (Login)
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setAuthMode('register'); setErrorMsg(''); }}
                    className={`py-2 rounded-xl text-xs font-bold transition ${authMode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Ro'yxatdan o'tish
                  </button>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold text-left">
                    {errorMsg}
                  </div>
                )}

                {authMode === 'login' ? (
                  <form onSubmit={handleEmailLogin} className="space-y-3 text-left">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Username, Email yoki Telefon</label>
                      <input 
                        type="text" 
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-red-500 focus:bg-white outline-none"
                        placeholder="@username, email yoki telefon..."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Parol</label>
                      <input 
                        type="password" 
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-red-500 focus:bg-white outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full py-3 px-4 rounded-2xl bg-[#E8474A] text-white font-bold text-sm shadow-md hover:bg-[#cb2e31] transition disabled:opacity-60"
                    >
                      {isLoggingIn ? "Kirilmoqda..." : "Kirish 🚀"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleEmailRegister} className="space-y-3 text-left">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Ism va Familiya</label>
                      <input 
                        type="text" 
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-red-500 focus:bg-white outline-none"
                        placeholder="Ismingiz..."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Email</label>
                      <input 
                        type="email" 
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-red-500 focus:bg-white outline-none"
                        placeholder="example@gmail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Parol</label>
                      <input 
                        type="password" 
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-red-500 focus:bg-white outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full py-3 px-4 rounded-2xl bg-[#E8474A] text-white font-bold text-sm shadow-md hover:bg-[#cb2e31] transition disabled:opacity-60"
                    >
                      {isLoggingIn ? "Ro'yxatdan o'tmoqda..." : "Ro'yxatdan o'tish ✨"}
                    </button>
                  </form>
                )}

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-slate-400 uppercase">yoki</span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                <div className="space-y-2">
                  <button 
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="w-full flex items-center justify-center space-x-3 py-3.5 px-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 font-bold text-sm shadow-xs bg-white text-slate-800 active:scale-98 transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.18v3.15C3.165 21.33 7.21 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.18C.43 8.13 0 9.87 0 12s.43 3.87 1.18 5.39l4.09-3.15z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.21 0 3.165 2.67 1.18 6.61l4.09 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
                    </svg>
                    <span>Google orqali davom ettirish</span>
                  </button>

                  <button 
                    onClick={() => { setAuthMode('telegram'); setTelegramStep('input_phone'); }}
                    className="w-full flex items-center justify-center space-x-3 py-3.5 px-4 rounded-2xl bg-[#229ED9] hover:bg-[#1f8fc6] font-bold text-sm shadow-sm text-white active:scale-98 transition duration-200"
                  >
                    <svg className="w-5 h-5 shrink-0 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27 0-.12.05-1.98 1.26-5.6 3.7-.53.36-1.01.54-1.44.53-.47-.01-1.38-.26-2.06-.48-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.98-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.4-.02.07-.02.13-.04.2z"/>
                    </svg>
                    <span>Telegram orqali davom etish</span>
                  </button>
                </div>
              </div>
            )}
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
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white shadow-xl bg-slate-100 flex items-center justify-center">
                    {resolveAvatarUrl(regAvatar) ? (
                      <img
                        src={resolveAvatarUrl(regAvatar)}
                        alt="Avatar Preview"
                        className="w-full h-full object-cover"
                        onError={(e: any) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-2xl font-black text-rose-500">
                        {(regName?.trim().charAt(0) || 'A').toUpperCase()}
                      </span>
                    )}
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

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Tug'ilgan sana (Kalendardan tanlang) 📅</label>
                  <input 
                    type="date" 
                    value={regBirthDate}
                    onChange={(e) => {
                      const bDate = e.target.value;
                      setRegBirthDate(bDate);
                      const computedAge = calculateAge(bDate);
                      setRegAge(String(computedAge));
                    }}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">
                    Hozirgi yoshingiz: <span className="font-bold text-[#E8474A]">{calculateAge(regBirthDate, Number(regAge))} yoshda</span> (har yili avtomatik 1 yoshga ulg'ayadi)
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Jins</span>
                    {currentUser?.faceId?.verified && !isAdminTelegramUser(currentUser) && (
                      <span className="text-[10px] text-emerald-600 font-bold">Face ID tasdiqlagan 🔒</span>
                    )}
                  </label>
                  <select 
                    value={regGender}
                    onChange={(e) => setRegGender(e.target.value as any)}
                    disabled={Boolean(currentUser?.faceId?.verified && !isAdminTelegramUser(currentUser))}
                    className="w-full px-3.5 py-3 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all outline-none disabled:bg-emerald-50/70 disabled:text-emerald-950"
                  >
                    <option value="female" className="text-gray-900 bg-white font-medium">Ayol / Qiz</option>
                    <option value="male" className="text-gray-900 bg-white font-medium">Erkak / Yigit</option>
                  </select>
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
                    {Object.keys(UZ_LOCATIONS).map((reg, idx) => (
                      <option key={`prof_reg_${reg}_${idx}`} value={reg} className="text-gray-900 bg-white font-medium">{reg}</option>
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
                      {UZ_LOCATIONS[regRegion]?.map((dist, idx) => (
                        <option key={`prof_dist_${dist}_${idx}`} value={dist} className="text-gray-900 bg-white font-medium">{dist}</option>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#221719]/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#FDFBF9] rounded-[32px] max-w-sm w-full p-6 space-y-4 relative card-shadow max-h-[90vh] overflow-y-auto border border-[rgba(166,36,51,0.14)] shadow-2xl text-[#221719]">
            <button 
              onClick={() => setSelectedProfile(null)} 
              aria-label="Profilni yopish"
              className="absolute top-5 right-5 p-2 rounded-full bg-[#FAF4F2] hover:bg-[#F1E2DD] text-[#221719] font-bold transition active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-4 pt-1">
              {(() => {
                const spAvatar = resolveAvatarUrl(selectedProfile.avatar);
                const spName = getSafeUserDisplayName(selectedProfile, selectedProfile.name || 'Profil');
                return (
                  <div className="relative w-18 h-18 rounded-full overflow-hidden border-2 border-[#C93545] shrink-0 bg-[#FAF4F2] shadow-md flex items-center justify-center">
                    {spAvatar ? (
                      <img 
                        src={spAvatar} 
                        alt={spName} 
                        className="w-full h-full object-cover object-center" 
                        onError={(e: any) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className={cn(
                        "w-full h-full items-center justify-center bg-[#FAF4F2] text-[#C93545] font-editorial font-black text-2xl",
                        spAvatar ? "hidden" : "flex"
                      )}
                    >
                      {spName.charAt(0).toUpperCase()}
                    </div>
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-editorial font-bold text-[#221719] truncate">{selectedProfile.name}, {calculateAge(selectedProfile.birthDate, selectedProfile.age)}</h3>
                <p className="text-[10.5px] font-mono font-bold text-[#C93545]">ID: {selectedProfile.id}</p>
                <p className="text-[11px] text-[#6B5B5E] truncate">{selectedProfile.district}, {selectedProfile.region}</p>
              </div>
            </div>

            {/* Face ID Biometric Verification Data inside Public Profile */}
            {selectedProfile.faceId?.verified ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-[18px] p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                    <ScanFace className="w-4 h-4 text-emerald-600" />
                    <span>Face ID Biometrik Tasdiq</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold">
                    TASDIQLANGAN ✓
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-900">
                  <span>Jins: {genderToUzLabel(selectedProfile.faceId.detectedGender || selectedProfile.gender)}</span>
                  <span className="font-mono">{selectedProfile.faceId.confidence ?? 95}% aniqlik</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-emerald-700">
                  <span>Jonlilik: Ko'z harakati · Tabassum ✓</span>
                  {selectedProfile.faceId.verifiedAt && (
                    <span>{formatFaceIdDateUz(selectedProfile.faceId.verifiedAt)}</span>
                  )}
                </div>
              </div>
            ) : isAdminTelegramUser(selectedProfile) ? (
              <div className="bg-amber-50 border border-amber-200 rounded-[16px] p-3 flex items-center gap-2 text-xs font-bold text-amber-900">
                <Crown className="w-4 h-4 text-amber-600" />
                <span>Alov.uz Platforma Admini</span>
              </div>
            ) : (
              <div className="bg-[#FAF4F2] border border-[rgba(166,36,51,0.1)] rounded-[16px] p-3 flex items-center justify-between text-xs text-[#6B5B5E]">
                <span>Jins: <b>{genderToUzLabel(selectedProfile.gender)}</b></span>
                <span className="text-[10px]">Face ID kutilmoqda</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center bg-[#FAF4F2] p-3 rounded-[16px] border border-[rgba(166,36,51,0.08)]">
              <div>
                <p className="text-sm font-black text-[#C93545]">{selectedProfile.followersCount ?? 0}</p>
                <p className="text-[9.5px] text-[#6B5B5E] font-bold">Obunachilar</p>
              </div>
              <div>
                <p className="text-sm font-black text-[#221719]">{selectedProfile.followingCount ?? 0}</p>
                <p className="text-[9.5px] text-[#6B5B5E] font-bold">Obunalar</p>
              </div>
              <div>
                <p className="text-sm font-black text-[#A62433]">{selectedProfile.likesCount ?? 0}</p>
                <p className="text-[9.5px] text-[#6B5B5E] font-bold">Laiklar</p>
              </div>
            </div>

            <p className="text-xs text-[#4A3B3D] bg-[#FAF4F2] p-3.5 rounded-[14px] leading-relaxed border border-[rgba(166,36,51,0.08)]">{selectedProfile.bio || 'Alov.uz da yangi tanishuvlar va suhbatlar uchun.'}</p>

            <div className="flex space-x-2 pt-1">
              <button 
                onClick={() => handleToggleFollow(selectedProfile.uid || selectedProfile.id)} 
                className={`flex-1 py-2.5 rounded-full font-bold text-xs shadow-sm transition-all active:scale-95 ${(followingIds.includes(selectedProfile.uid) || followingIds.includes(selectedProfile.id)) ? 'bg-slate-200 text-slate-800' : 'bg-[#E8474A] text-white hover:bg-[#CB2E31]'}`}
              >
                {(followingIds.includes(selectedProfile.uid) || followingIds.includes(selectedProfile.id)) ? 'Obuna bo\'lingan' : '+ Obuna'}
              </button>
              <button 
                onClick={() => {
                  openChatWithUser(selectedProfile);
                  setSelectedProfile(null);
                }} 
                className="flex-1 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs shadow-sm flex items-center justify-center space-x-1 active:scale-95 transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#E8474A]" />
                <span>Chat</span>
              </button>
              <button 
                onClick={() => {
                  setActiveCallUser(selectedProfile);
                  setSelectedProfile(null);
                }} 
                className="px-3.5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm flex items-center justify-center space-x-1 active:scale-95 transition-all"
                title="Video qo'ng'iroq va ekran ulashish"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Qo'ng'iroq</span>
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


      {/* --- WHATSAPP / TELEGRAM STYLE INCOMING CALL MODAL WITH RINGTONE --- */}
      {incomingCallData && !activeCallUser && (
        <IncomingCallModal
          caller={incomingCallData.caller}
          onAccept={() => {
            setActiveCallUser(incomingCallData.caller);
          }}
          onReject={() => {
            const targetUid = incomingCallData.caller?.uid || incomingCallData.caller?.id;
            socketRef.current?.emit('reject-call', {
              targetUid,
              targetSocketId: incomingCallData.callerSocketId
            });
            socketRef.current?.emit('end-call', {
              targetUid,
              targetSocketId: incomingCallData.callerSocketId
            });
            setIncomingCallData(null);
          }}
        />
      )}

      {/* --- 1-ON-1 WEBRTC VIDEO CALL & SCREEN SHARING MODAL --- */}
      {activeCallUser && (
        <OneOnOneCallModal
          socket={socketRef.current}
          currentUser={{
            uid: currentUser?.uid || firebaseUser?.uid || 'user_' + Date.now(),
            name: currentUser?.name || firebaseUser?.displayName || 'Alov Foydalanuvchisi',
            avatar: currentUser?.avatar || firebaseUser?.photoURL || ''
          }}
          remoteUser={activeCallUser}
          isIncoming={!!incomingCallData}
          incomingOffer={incomingCallData?.offer}
          onClose={() => {
            setActiveCallUser(null);
            setIncomingCallData(null);
          }}
        />
      )}

      {/* --- GIFT SELECTION MODAL --- */}
      {showGiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 space-y-4 relative card-shadow border border-slate-100 shadow-2xl text-slate-900">
            <button 
              onClick={() => setShowGiftModal(false)}
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 flex items-center space-x-2">
                <span>Sovg'a Yuborish 🎁</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {selectedChatUser?.name || 'Foydalanuvchi'}ga virtual sovg'a taqdim eting:
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5 flex items-center justify-between text-xs font-bold text-amber-900">
              <span className="flex items-center space-x-1">
                <Coins className="w-4 h-4 text-amber-500 fill-amber-400" />
                <span>Balansingiz: {currentUser?.coins ?? 100} moneta</span>
              </span>
              <button 
                onClick={() => { setShowGiftModal(false); setShowTopUpModal(true); }}
                className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold shadow-xs"
              >
                + To'ldirish
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
              {[
                { id: 'rose', name: 'Atirgul 🌹', coinPrice: 10, icon: '🌹' },
                { id: 'heart', name: 'Yurak 💖', coinPrice: 30, icon: '💖' },
                { id: 'teddy', name: 'Ayiqcha 🧸', coinPrice: 50, icon: '🧸' },
                { id: 'crown', name: 'Toj 👑', coinPrice: 100, icon: '👑' },
                { id: 'car', name: 'Qimmat Mashina 🚗', coinPrice: 300, icon: '🚗' },
                { id: 'castle', name: 'Olmos Qasr 💎', coinPrice: 500, icon: '💎' },
              ].map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleSendGift(g)}
                  className="p-3 rounded-2xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 flex flex-col items-center justify-center space-y-1.5 transition active:scale-95 text-center group"
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">{g.icon}</span>
                  <span className="text-xs font-bold text-slate-800 leading-tight">{g.name}</span>
                  <span className="text-[10px] font-black text-amber-600 bg-amber-100/80 px-2 py-0.5 rounded-full flex items-center space-x-0.5">
                    <Coins className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                    <span>{g.coinPrice} moneta</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- TOP-UP COINS MODAL (Click, Payme, Uzum, Telegram Stars) --- */}
      {showTopUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 space-y-4 relative card-shadow border border-slate-100 shadow-2xl text-slate-900">
            <button 
              onClick={() => { setShowTopUpModal(false); setWalletNoticeMsg(''); }}
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 flex items-center space-x-2">
                <Coins className="w-5 h-5 text-amber-500 fill-amber-400" />
                <span>Moneta Sotib Olish 🪙</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Xabar yozish va sovg'alar yuborish uchun moneta balansini to'ldiring:
              </p>
            </div>

            {walletNoticeMsg && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs font-semibold">
                {walletNoticeMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-700">Moneta Paketini Tanlang:</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { coins: 100, uzs: 10000, label: 'Standard' },
                  { coins: 300, uzs: 28000, label: '🔥 Mashhur' },
                  { coins: 500, uzs: 45000, label: 'Tejamkor' },
                  { coins: 1000, uzs: 80000, label: '⚡️ Super' },
                ].map((pkg) => (
                  <button
                    key={pkg.coins}
                    type="button"
                    onClick={() => setTopUpPackage(pkg)}
                    className={cn(
                      "p-3 rounded-2xl border text-left transition relative active:scale-95",
                      topUpPackage.coins === pkg.coins 
                        ? "border-amber-500 bg-amber-50/70 shadow-xs ring-2 ring-amber-400/30" 
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    )}
                  >
                    <span className="text-xs font-black text-slate-900 block">{pkg.coins} Moneta 🪙</span>
                    <span className="text-[11px] font-bold text-amber-600 block mt-0.5">{pkg.uzs.toLocaleString()} so'm</span>
                    <span className="text-[9px] font-bold text-slate-400 block mt-0.5">{pkg.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-700">To'lov Tizimi:</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'click', name: 'Click' },
                  { id: 'payme', name: 'Payme' },
                  { id: 'uzum', name: 'Uzum Bank' },
                  { id: 'telegram_stars', name: 'Telegram Stars ⭐️' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPaymentProvider(p.id as any)}
                    className={cn(
                      "py-2.5 px-3 rounded-xl border text-xs font-bold transition active:scale-95 text-center",
                      paymentProvider === p.id 
                        ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-400/30" 
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleExecuteTopUp}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs shadow-lg shadow-amber-500/25 transition active:scale-95 flex items-center justify-center space-x-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>{topUpPackage.uzs.toLocaleString()} So'm To'lash va Olish 🚀</span>
            </button>
          </div>
        </div>
      )}

      {/* --- WITHDRAW DIAMONDS MODAL (FOR FEMALE USERS) --- */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 space-y-4 relative card-shadow border border-slate-100 shadow-2xl text-slate-900">
            <button 
              onClick={() => setShowWithdrawModal(false)}
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 flex items-center space-x-2">
                <span>Pul Yechib Olish 💎</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Ishlab topilgan almazlarni Humo yoki Uzcard kartangizga pul qilib chiqaring:
              </p>
            </div>

            <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-3.5 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-cyan-950">
                <span>Mavjud Balans:</span>
                <span className="text-sm font-black text-cyan-700">💎 {currentUser?.diamonds ?? 0} Almaz</span>
              </div>
              <p className="text-[10px] text-cyan-800 font-medium">
                Kurs: 1 Almaz = 1,000 So'm • minimal yechish: 100 Almaz (100,000 So'm)
              </p>
            </div>

            <form onSubmit={handleExecuteWithdrawal} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Yechib olinadigan almaz miqdori:</label>
                <input 
                  type="number"
                  min={100}
                  max={currentUser?.diamonds ?? 0}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:border-cyan-500 outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Kartangizga o'tkaziladi: <span className="font-bold text-emerald-600">{(withdrawAmount * 1000).toLocaleString()} So'm</span>
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Humo / Uzcard Karta Raqami (16 xonali):</label>
                <input 
                  type="text"
                  maxLength={19}
                  placeholder="8600 0000 0000 0000"
                  value={withdrawCardNumber}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    const formatted = raw.match(/.{1,4}/g)?.join(' ') || raw;
                    setWithdrawCardNumber(formatted);
                  }}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:border-cyan-500 outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold text-xs shadow-lg shadow-teal-500/25 transition active:scale-95 flex items-center justify-center space-x-2"
              >
                <Wallet className="w-4 h-4" />
                <span>Ariza Yuborish (Kartaga O'tkazish) 💸</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- ADMIN PANEL MODAL (@Salikh_07) --- */}
      {showAdminPanel && isAdminTelegramUser(currentUser) && (
        <AdminPanelModal
          currentUser={currentUser}
          apiBaseUrl={getBaseUrl()}
          onClose={() => setShowAdminPanel(false)}
          onUserUpdated={(updatedUser) => {
            if (updatedUser?.uid === currentUser?.uid) {
              setCurrentUser(updatedUser);
              try {
                localStorage.setItem('alov_current_user', JSON.stringify(updatedUser));
                localStorage.setItem('alov_user_' + updatedUser.uid, JSON.stringify(updatedUser));
              } catch (e) {}
            }
          }}
        />
      )}

    </div>
  );
}
