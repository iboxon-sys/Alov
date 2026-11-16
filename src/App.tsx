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
  Clock, Check, CheckCheck, Gift, Coins, Wallet, CreditCard, Handshake, Crown, ScanFace,
  Image as ImageIcon, Camera, Newspaper, SlidersHorizontal
} from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LandingPage } from './LandingPage';
import { LiveStreamModal } from './components/LiveStreamModal';
import { OneOnOneCallModal } from './components/OneOnOneCallModal';
import { IncomingCallModal } from './components/IncomingCallModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { FaceIdVerificationModal, type FaceIdVerificationResult } from './components/FaceIdVerificationModal';
import { FollowListModal } from './components/FollowListModal';
import { PostsFeed } from './components/PostsFeed';
import { PublicProfileModal } from './components/PublicProfileModal';
import { SmartPhoneInput } from './components/SmartPhoneInput';
import { ChatMediaPicker, type ChatMediaKind } from './components/ChatMediaPicker';
import { callNotification } from './services/callNotification';
import { VideoPlayer, VoiceMessage } from './components/ChatMedia';
import { CandidateSkeleton, ChatSkeleton } from './components/Skeleton';
import { 
  auth, googleProvider, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, 
  setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, User
} from './firebase';
import { getApiUrl, getBaseUrl, safeFetchJson } from './config/api';
import { io, Socket } from 'socket.io-client';
import {
  buildTelegramDisplayName,
  getSafeUserDisplayName,
  isPlaceholderAvatar,
  isPlaceholderOrUsername,
  pickPreferredAvatar
} from './utils/telegramProfile';
import {
  MESSAGE_COIN_COST,
  MESSAGE_DIAMOND_REWARD,
  DIAMOND_LIMIT_TARGET,
  DAILY_LIMIT_WINDOW_HOURS,
  DIAMOND_UNLOCK_HOURS,
  ADMIN_FULL_COINS,
  ADMIN_FULL_DIAMONDS,
  calculateDiamondsToUzs,
  formatDiamondsDisplay,
  isAdminTelegramUser,
  getDiamondProgressPercent,
  getPendingDiamondsTotal,
  getNextUnlockTimestamp,
  computeCountdownParts
} from './utils/tokenomics';
import {
  requiresFaceIdForUser,
  resolveEffectiveProfileAvatar,
  resolvePostFaceIdGender,
  formatFaceIdDateUz,
  genderToUzLabel,
  type FaceIdProfileData,
} from './utils/faceId';
import {
  COIN_SHOP_PACKAGES,
  type CoinPurchaseRequest,
} from './utils/coinRequests';
import { isUserOnlineStrict, formatLastSeenUz } from './utils/presence';
import {
  resolveExactUserByUid,
  getInitialAuthDraftState,
  canPersistUserProfile,
  formatAuthErrorMessage,
  resolveTelegramMiniAppBootAction,
  resolvePostProviderAuthStep,
  resolvePostFaceIdStep,
} from './utils/profileLookup';
import { computeAuthorTotalLikes, isPostVisibleToViewer, type PostItem } from './utils/posts';
import { validateUsername, isUsernameUnique, formatUsernameDisplay } from './utils/username';
import { formatPhoneNumberPretty } from './utils/phone';
import { PrivacyPolicyInline } from './components/PrivacyPolicyInline';
import { TurnstileWidget } from './components/TurnstileWidget';
import { MandatorySubscriptionGate } from './components/MandatorySubscriptionGate';
import { buildCanonicalChatId, mergeChatLists } from './utils/chatList';
import { shouldEnableCaptureProtection, isCaptureShortcutEvent } from './utils/captureProtection';
import {
  DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG,
  evaluateMandatorySubscriptionAccess,
  type MandatorySubscriptionConfig,
} from './utils/telegramBotUtils';

function resolveAvatarUrl(rawUrl?: string | null): string {
  const clean = pickPreferredAvatar(rawUrl);
  if (!clean) return '';
  if (clean.startsWith('/api/')) {
    return `${getBaseUrl()}${clean}`;
  }
  return clean;
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
  avatar: '/assets/aistudio/image_e20a1307.webp',
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

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function computeHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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
  const [authOrigin, setAuthOrigin] = useState<'google' | 'telegram' | 'email'>('email');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any | null>(null);
  const [telegramInput, setTelegramInput] = useState('');
  const [telegramStep, setTelegramStep] = useState<'input_phone' | 'input_code' | 'face_id' | 'profile_setup'>('input_phone');
  const [generatedTgCode, setGeneratedTgCode] = useState('');
  const [enteredTgCode, setEnteredTgCode] = useState('');
  const [pendingTgUser, setPendingTgUser] = useState<any | null>(null);
  const [pendingFaceId, setPendingFaceId] = useState<FaceIdProfileData | null>(null);
  const [showProfileFaceIdModal, setShowProfileFaceIdModal] = useState<boolean>(false);
  const [hasStartedBotError, setHasStartedBotError] = useState<boolean>(false);
  const [privacyAgreed, setPrivacyAgreed] = useState<boolean>(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [privacyReadToBottom, setPrivacyReadToBottom] = useState<boolean>(false);
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [termsReadToBottom, setTermsReadToBottom] = useState<boolean>(false);
  const [inlinePolicyReturnMode, setInlinePolicyReturnMode] = useState<'register' | 'google_setup' | 'telegram_setup' | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetTick, setTurnstileResetTick] = useState<number>(0);
  const [captureShieldVisible, setCaptureShieldVisible] = useState<boolean>(false);
  const [subscriptionConfig, setSubscriptionConfig] = useState<MandatorySubscriptionConfig>(DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG);
  const [isChannelSubscribed, setIsChannelSubscribed] = useState<boolean>(true);
  const [showSubscriptionGate, setShowSubscriptionGate] = useState<boolean>(false);
  const [isCheckingSubscription, setIsCheckingSubscription] = useState<boolean>(false);
  const [subscriptionError, setSubscriptionError] = useState<string>('');
  const [subVersionTick, setSubVersionTick] = useState<number>(0);

  // Profile Form Fields (including Avatar URL and Location Visibility)
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regBirthDate, setRegBirthDate] = useState('2002-05-15');
  const [regAge, setRegAge] = useState('22');
  const [regGender, setRegGender] = useState<'male' | 'female' | ''>('');
  const [regRegion, setRegRegion] = useState('Toshkent shahri');
  const [regDistrict, setRegDistrict] = useState('Yunusobod tumani');
  const [regNeighborhood, setRegNeighborhood] = useState('Bodomzor');
  const [regPhone, setRegPhone] = useState('+998 ');
  const [regTelegram, setRegTelegram] = useState('');
  const [regInstagram, setRegInstagram] = useState('');
  const [regBio, setRegBio] = useState('');
  const [regAvatar, setRegAvatar] = useState('');
  const [regBanner, setRegBanner] = useState('');
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<number | null>(null);
  const [regLocationVisibility, setRegLocationVisibility] = useState<'everyone' | 'mutual' | 'ghost'>('everyone');

  const showToast = React.useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg('');
    }, 3200);
  }, []);

  const fetchPostsFromServer = React.useCallback(async () => {
    try {
      const viewerUid = currentUser?.uid || firebaseUser?.uid || '';
      const query = viewerUid ? `?viewerUid=${encodeURIComponent(viewerUid)}` : '';
      const postsData = await safeFetchJson(getApiUrl(`/api/posts${query}`));
      if (postsData && postsData.success && Array.isArray(postsData.posts)) {
        setPostsList(postsData.posts);
      }
    } catch (err) {
      console.warn('Could not refresh posts from server:', err);
    }
  }, [currentUser?.uid, firebaseUser?.uid]);

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
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [postsList, setPostsList] = useState<PostItem[]>([]);
  const [chatsList, setChatsList] = useState<any[]>([]);
  const [filterRegion, setFilterRegion] = useState('Barchasi');
  const [filterDistrict, setFilterDistrict] = useState('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [followModalState, setFollowModalState] = useState<{ user: any; tab: 'followers' | 'following' } | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [chatFriendships, setChatFriendships] = useState<Record<string, boolean>>({});
  const [countdownNow, setCountdownNow] = useState<number>(() => Date.now());

  // OSRM Street Routing State
  const [activeRouteUser, setActiveRouteUser] = useState<any | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: string; durationMin: number; isFallback?: boolean } | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
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
  const [topUpPackage, setTopUpPackage] = useState<{ coins: number; uzs: number }>({ coins: 1000, uzs: 50000 });
  const [paymentProvider, setPaymentProvider] = useState<'click' | 'payme' | 'uzum' | 'telegram_stars'>('click');
  const [coinRequestContact, setCoinRequestContact] = useState('');
  const [coinRequestNote, setCoinRequestNote] = useState('');
  const [isSubmittingCoinRequest, setIsSubmittingCoinRequest] = useState(false);
  const [userCoinRequests, setUserCoinRequests] = useState<CoinPurchaseRequest[]>([]);
  const [withdrawCardNumber, setWithdrawCardNumber] = useState('');
  const [withdrawContact, setWithdrawContact] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState<number>(100);
  const [walletNoticeMsg, setWalletNoticeMsg] = useState('');

  const [selectedChatUser, setSelectedChatUser] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, any[]>>({});
  const [inputMessage, setInputMessage] = useState('');
  const [showChatMediaPicker, setShowChatMediaPicker] = useState(false);
  const [isUploadingChatMedia, setIsUploadingChatMedia] = useState(false);
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
  const [activeUsersCount, setActiveUsersCount] = useState<number>(0);
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
  const usersListRef = useRef<any[]>([]);
  const originalGetDisplayMediaRef = useRef<any>(null);

  useEffect(() => {
    currentUserRef.current = currentUser || (firebaseUser ? { uid: firebaseUser.uid, name: firebaseUser.displayName } : null);
  }, [currentUser, firebaseUser]);

  useEffect(() => {
    selectedChatUserRef.current = selectedChatUser;
  }, [selectedChatUser]);

  useEffect(() => {
    usersListRef.current = usersList;
  }, [usersList]);

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
    const socket = io(getBaseUrl(), {
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });
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
      fetchPostsFromServer();
    };

    socket.on('connect', registerSocketUser);

    const heartbeatTimer = window.setInterval(() => {
      const myUid = currentUserRef.current?.uid || firebaseUser?.uid;
      if (myUid && socket.connected) {
        socket.emit('presence_heartbeat', { uid: myUid });
      }
    }, 20000);

    socket.on('active_users_count', ({ count }: { count: number }) => {
      if (typeof count === 'number' && count >= 0) {
        setActiveUsersCount(count);
      }
    });

    socket.on('presence_sync', ({ onlineUserIds: ids, onlineCount }: { onlineUserIds?: string[]; onlineCount?: number }) => {
      const nextSet = new Set((ids || []).map(String));
      setOnlineUserIds(nextSet);
      if (typeof onlineCount === 'number' && onlineCount >= 0) {
        setActiveUsersCount(onlineCount);
      } else {
        setActiveUsersCount(nextSet.size);
      }
      setUsersList(prev =>
        prev.map(u => {
          const isOn = Boolean((u.uid && nextSet.has(u.uid)) || (u.id && nextSet.has(u.id)));
          if (u.isOnline === isOn && (u.status === 'online') === isOn) return u;
          return { ...u, isOnline: isOn, status: isOn ? 'online' : 'offline' };
        })
      );
    });

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
      setSelectedProfile((prev: any) => (prev && (prev.uid === uid || prev.id === uid) ? null : prev));
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

    socket.on('post_created', (post: PostItem) => {
      if (!post?.id) return;
      if (!isPostVisibleToViewer(post, currentUserRef.current)) return;
      setPostsList(prev => (prev.some(p => p.id === post.id) ? prev : [post, ...prev]));
    });

    socket.on('post_updated', (post: PostItem) => {
      if (!post?.id) return;
      setPostsList(prev => prev.map(p => (p.id === post.id ? post : p)));
    });

    socket.on('post_deleted', ({ postId }: { postId: string }) => {
      if (!postId) return;
      setPostsList(prev => prev.filter(p => p.id !== postId));
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

      // Update chatsList via canonical deduplication so old chats NEVER vanish when new ones arrive
      if (chatId) {
        setChatsList(prev => {
          const lastMsg = msg.text || (msg.type === 'image' ? 'Rasm 🖼️' : (msg.type === 'video' ? 'Video 🎥' : 'Xabar'));
          const partnerInfo = payload.message?.sender || (partnerId ? {
            uid: partnerId,
            id: partnerId,
            name: msg.senderName || selectedChatUserRef.current?.name || 'Foydalanuvchi',
            avatar: msg.senderAvatar || selectedChatUserRef.current?.avatar || ''
          } : undefined);
          const incomingChat = {
            id: chatId,
            participants: [myUid, partnerId].filter(Boolean),
            lastMessage: lastMsg,
            updatedAt: msg.createdAt || new Date().toISOString(),
            partner: partnerInfo
          };
          const merged = mergeChatLists([prev, [incomingChat]], myUid || '', {
            myAliases: [myUid, currentUserRef.current?.id].filter(Boolean) as string[],
            usersList: usersListRef.current,
          });
          if (myUid) {
            try {
              localStorage.setItem('alov_chats_' + myUid, JSON.stringify(merged));
            } catch (e) {}
          }
          return merged;
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

    socket.on('coin_request_updated', (updatedReq: CoinPurchaseRequest) => {
      if (!updatedReq?.id) return;
      setUserCoinRequests((prev) => {
        const exists = prev.some((r) => r.id === updatedReq.id);
        return exists ? prev.map((r) => (r.id === updatedReq.id ? updatedReq : r)) : prev;
      });
      const myUid = currentUserRef.current?.uid;
      if (myUid && updatedReq.userUid === myUid) {
        if (updatedReq.status === 'approved') {
          showToast(`Moneta buyurtmangiz yakunlandi: +${updatedReq.coinAmount} moneta`);
        } else if (updatedReq.status === 'rejected') {
          showToast('Moneta buyurtmasi rad etildi');
        }
      }
    });

    socket.on('withdrawal_updated', (updatedW: any) => {
      const myUid = currentUserRef.current?.uid;
      if (myUid && updatedW?.userUid === myUid) {
        if (updatedW.status === 'approved') {
          showToast(`Pul yechib olish arizangiz bajarildi: ${Number(updatedW.uzsAmount || 0).toLocaleString()} so'm`);
        } else if (updatedW.status === 'rejected') {
          showToast('Pul yechib olish arizasi rad etildi, olmoslar hamyonga qaytarildi');
        }
      }
    });

    socket.on('subscription_config_updated', (nextCfg: MandatorySubscriptionConfig) => {
      if (nextCfg && typeof nextCfg === 'object') {
        setSubscriptionConfig({ ...DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG, ...nextCfg });
        setSubVersionTick((v) => v + 1);
      }
    });

    return () => {
      window.clearInterval(heartbeatTimer);
      socket.off('connect', registerSocketUser);
      socket.off('active_users_count');
      socket.off('presence_sync');
      socket.off('user_updated');
      socket.off('user_deleted');
      socket.off('stream_started');
      socket.off('stream_stopped');
      socket.off('post_created');
      socket.off('post_updated');
      socket.off('post_deleted');
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
      socket.off('coin_request_updated');
      socket.off('withdrawal_updated');
      socket.off('subscription_config_updated');
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

  // Non-destructive LocalStorage Session Restore on App Mount (updating app version never clears user data)
  useEffect(() => {
    try {
      localStorage.setItem('alov_app_version', APP_VERSION);

      const cached = localStorage.getItem('alov_current_user');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && canPersistUserProfile(parsed) && !requiresFaceIdForUser(parsed)) {
          const isTg = Boolean(parsed.uid?.startsWith('tg_') || parsed.telegramChatId || parsed.telegram);
          const sanitized = isTg
            ? {
                ...parsed,
                name: getSafeUserDisplayName(parsed, ''),
                avatar: parsed.faceId?.capturedPhotoUrl || pickPreferredAvatar(parsed.avatar),
              }
            : parsed;
          setCurrentUser(sanitized);
          setActiveTab('discover');
          setIsAuthChecking(false);

          fetch(getApiUrl('/api/users/sync'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: sanitized, lookupOnly: true })
          })
            .then(r => r.json())
            .then(res => {
              if (res && res.success && res.exists && res.user) {
                setCurrentUser(res.user);
                try {
                  localStorage.setItem('alov_current_user', JSON.stringify(res.user));
                  localStorage.setItem('alov_user_' + res.user.uid, JSON.stringify(res.user));
                } catch (e) {}
              } else if (res && res.success && res.exists === false) {
                try {
                  localStorage.removeItem('alov_current_user');
                  localStorage.removeItem('alov_user_' + parsed.uid);
                } catch (e) {}
                setCurrentUser(null);
                setActiveTab('landing');
              }
            })
            .catch(() => {});
        }
      }
    } catch (e) {}
  }, []);

  // Telegram WebApp Auto-login & Integration (never auto-opens Auth or Face ID on boot for new visitors)
  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        const tgUser = tg.initDataUnsafe?.user;
        if (tgUser?.id) {
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
            gender: '',
            isProfileCompleted: false
          };
          fetch(getBaseUrl() + '/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: telegramUserObj, lookupOnly: true })
          })
          .then(res => res.json())
          .then(data => {
            const exists = Boolean(data && data.success && data.exists && data.user);
            const u = exists ? data.user : null;
            const bootDecision = resolveTelegramMiniAppBootAction({ exists, user: u });
            if (bootDecision.shouldAutoLogin && u) {
              setRegName(getSafeUserDisplayName(u, realName));
              setRegAvatar(u.faceId?.capturedPhotoUrl || pickPreferredAvatar(u.avatar, tgUser.photo_url));
              setCurrentUser(u);
              try {
                localStorage.setItem('alov_current_user', JSON.stringify(u));
                localStorage.setItem('alov_user_' + u.uid, JSON.stringify(u));
              } catch (e) {}
              setActiveTab('discover');
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

  // Foydalanuvchi hisobini server bilan lookupOnly rejimida tekshirish (tugallanmagan profil yaratilmaydi)
  const syncUserWithBackend = async (user: User, options?: { autoOpenFaceId?: boolean }) => {
    const autoOpenFaceId = options?.autoOpenFaceId === true;
    try {
      let userData: any = null;

      try {
        const data = await safeFetchJson(getApiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: {
              uid: user.uid,
              email: user.email || '',
              name: user.displayName || '',
              avatar: user.photoURL || '',
            },
            lookupOnly: true,
          })
        });
        if (data && data.success && data.exists && data.user) {
          userData = data.user;
        }
      } catch (e) {
        console.warn("Backend user lookup offline fallback:", e);
      }

      if (!userData) {
        if (autoOpenFaceId) {
          setRegName(user.displayName || '');
          setPendingFaceId(null);
          setPendingGoogleUser(user);
          setAuthOrigin('google');
          setAuthMode('google_face_id');
          setShowAuthModal(true);
        }
        return null;
      }

      // Anketani to'ldirish maydonlarini yangilash
      const userBdate = userData.birthDate || '2002-05-15';
      setRegBirthDate(userBdate);
      setRegName(userData.name || user.displayName || '');
      setRegAge(String(calculateAge(userBdate, userData.age || 22)));
      setRegGender(
        userData.isProfileCompleted && (userData.gender === 'male' || userData.gender === 'female')
          ? userData.gender
          : ''
      );
      setRegRegion(userData.region || 'Toshkent shahri');
      setRegDistrict(userData.district || 'Yunusobod tumani');
      setRegBio(userData.bio || '');
      setRegAvatar(resolveEffectiveProfileAvatar(userData));
      setRegLocationVisibility(userData.locationVisibility || 'everyone');
      setIsLocationEnabled(userData.isLocationEnabled !== false);

      // Admin bypasses Face ID completely; non-admins must have completed profile + Face ID verification
      const nextStep = resolvePostProviderAuthStep({
        provider: 'google',
        exists: true,
        user: userData,
      });
      if (nextStep === 'face_id') {
        if (autoOpenFaceId) {
          setPendingGoogleUser(user);
          setAuthOrigin('google');
          setAuthMode('google_face_id');
          setShowAuthModal(true);
        }
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
          await syncUserWithBackend(result.user, { autoOpenFaceId: true });
        }
      })
      .catch((err: any) => {
        console.error("Get Redirect Result Error:", err);
        if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
          setErrorMsg(err.message || "Google orqali kirishda xatolik yuz berdi.");
        }
      });
  }, []);

  // Synchronize Auth State & Real-time Presence (non-destructive across version updates)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        try {
          localStorage.setItem('alov_app_version', APP_VERSION);
        } catch (e) {}

        setFirebaseUser(user);
        if (user) {
          await syncUserWithBackend(user, { autoOpenFaceId: false });
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

  // Mark user offline on browser tab close / pagehide (regardless of Telegram vs Google auth)
  useEffect(() => {
    const activeUid = currentUser?.uid || firebaseUser?.uid;
    if (!activeUid) return;
    const notifyOffline = () => {
      try {
        socketRef.current?.emit('unregister_user', { uid: activeUid });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(getApiUrl('/api/users/offline'), JSON.stringify({ uid: activeUid }));
        } else {
          fetch(getApiUrl('/api/users/offline'), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ uid: activeUid }),
            keepalive: true
          }).catch(() => {});
        }
      } catch {}
    };
    window.addEventListener('beforeunload', notifyOffline);
    window.addEventListener('pagehide', notifyOffline);
    return () => {
      window.removeEventListener('beforeunload', notifyOffline);
      window.removeEventListener('pagehide', notifyOffline);
    };
  }, [currentUser?.uid, firebaseUser?.uid]);

  // Initial loader for users, live presence state, and posts from backend
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const initialViewerUid = currentUser?.uid || firebaseUser?.uid || '';
        const postsQuery = initialViewerUid ? `?viewerUid=${encodeURIComponent(initialViewerUid)}` : '';
        const [usersData, postsData] = await Promise.all([
          safeFetchJson(getApiUrl('/api/users')),
          safeFetchJson(getApiUrl(`/api/posts${postsQuery}`)).catch(() => null),
        ]);
        if (usersData && usersData.success && Array.isArray(usersData.users)) {
          setUsersList(usersData.users);
          if (Array.isArray(usersData.onlineUserIds)) {
            setOnlineUserIds(new Set(usersData.onlineUserIds.map(String)));
            setActiveUsersCount(
              typeof usersData.onlineCount === 'number' ? usersData.onlineCount : usersData.onlineUserIds.length
            );
          }
        }
        if (postsData && postsData.success && Array.isArray(postsData.posts)) {
          setPostsList(postsData.posts);
        }
      } catch (err) {
        console.warn("Could not fetch users/posts from server:", err);
      } finally {
        setIsLoadingCandidates(false);
      }
    };
    fetchInitialData();
  }, []);

  // Refresh posts whenever viewer identity/gender changes or navigating to Posts/Profile tabs
  useEffect(() => {
    fetchPostsFromServer();
  }, [currentUser?.uid, currentUser?.gender, fetchPostsFromServer]);

  useEffect(() => {
    if (activeTab === 'posts' || activeTab === 'profile') {
      fetchPostsFromServer();
    }
  }, [activeTab, fetchPostsFromServer]);


  // Load active 1-on-1 chats from Render API & localStorage with full deduplication & retention
  useEffect(() => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid) return;

    const fetchChats = async () => {
      let localChats: any[] = [];
      try {
        const cached = localStorage.getItem('alov_chats_' + myUid);
        if (cached) localChats = JSON.parse(cached);
      } catch (e) {}

      let serverChats: any[] = [];
      try {
        const data = await safeFetchJson(getApiUrl(`/api/chats/user/${myUid}`));
        if (data && data.success && Array.isArray(data.chats)) {
          serverChats = data.chats;
        }
      } catch (e) {
        console.warn("Could not fetch chats from server:", e);
      }

      setChatsList(prev => {
        const merged = mergeChatLists([prev, localChats, serverChats], myUid, {
          myAliases: [myUid, currentUser?.id].filter(Boolean) as string[],
          usersList: usersListRef.current,
        });
        try {
          localStorage.setItem('alov_chats_' + myUid, JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
      setIsLoadingChats(false);
    };

    fetchChats();
  }, [firebaseUser?.uid, currentUser?.uid]);

  // Non-admin screenshot & screen-recording protection (@Salikh_07 admin is completely exempt)
  useEffect(() => {
    const captureProtected = shouldEnableCaptureProtection(currentUser);
    document.body.classList.toggle('alov-capture-protected', captureProtected);

    if (!captureProtected) {
      setCaptureShieldVisible(false);
      if (originalGetDisplayMediaRef.current && navigator.mediaDevices) {
        try {
          navigator.mediaDevices.getDisplayMedia = originalGetDisplayMediaRef.current;
        } catch {}
      }
      return;
    }

    let shieldTimer: number | null = null;
    const triggerShield = () => {
      setCaptureShieldVisible(true);
      showToast("Xavfsizlik: Skrinshot va ekran yozib olish cheklangan");
      if (shieldTimer) window.clearTimeout(shieldTimer);
      shieldTimer = window.setTimeout(() => setCaptureShieldVisible(false), 1800);
    };

    const onKeyEvent = (e: KeyboardEvent) => {
      if (isCaptureShortcutEvent(e)) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield();
      }
    };

    const onBeforePrint = () => {
      triggerShield();
    };

    const onContextMenuOrDrag = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'IMG' || target.tagName === 'VIDEO' || target.closest('video'))) {
        e.preventDefault();
      }
    };

    if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
      if (!originalGetDisplayMediaRef.current) {
        originalGetDisplayMediaRef.current = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      }
      try {
        navigator.mediaDevices.getDisplayMedia = async () => {
          triggerShield();
          throw new DOMException("Ekran yozib olish platforma xavfsizligi bilan cheklangan.", "NotAllowedError");
        };
      } catch {}
    }

    window.addEventListener('keydown', onKeyEvent, true);
    window.addEventListener('keyup', onKeyEvent, true);
    window.addEventListener('beforeprint', onBeforePrint);
    document.addEventListener('contextmenu', onContextMenuOrDrag);
    document.addEventListener('dragstart', onContextMenuOrDrag);

    return () => {
      if (shieldTimer) window.clearTimeout(shieldTimer);
      document.body.classList.remove('alov-capture-protected');
      window.removeEventListener('keydown', onKeyEvent, true);
      window.removeEventListener('keyup', onKeyEvent, true);
      window.removeEventListener('beforeprint', onBeforePrint);
      document.removeEventListener('contextmenu', onContextMenuOrDrag);
      document.removeEventListener('dragstart', onContextMenuOrDrag);
    };
  }, [currentUser?.uid, currentUser?.role, currentUser?.isAdmin, currentUser?.telegram, showToast]);

  // Mandatory Telegram Channel Subscription check (enforced only inside Telegram context for non-admins)
  const verifyMandatorySubscription = React.useCallback(async () => {
    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const isTgCtx = Boolean(tgUser?.id || currentUser?.telegramChatId || currentUser?.uid?.startsWith('tg_'));
    if (!isTgCtx) {
      setIsChannelSubscribed(true);
      setShowSubscriptionGate(false);
      setSubscriptionError('');
      return;
    }
    setIsCheckingSubscription(true);
    setSubscriptionError('');
    try {
      const data = await safeFetchJson(getApiUrl('/api/subscription/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser?.uid,
          telegramChatId: tgUser?.id || currentUser?.telegramChatId,
          telegram: currentUser?.telegram,
        }),
      });
      const nextConfig: MandatorySubscriptionConfig = data?.config
        ? { ...DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG, ...data.config }
        : subscriptionConfig;
      if (data?.config) {
        setSubscriptionConfig(nextConfig);
      }
      const nextSubscribed = typeof data?.isSubscribed === 'boolean' ? data.isSubscribed : true;
      setIsChannelSubscribed(nextSubscribed);

      const gateEval = evaluateMandatorySubscriptionAccess({
        config: nextConfig,
        user: currentUser,
        isTelegramContext: true,
        isSubscribed: nextSubscribed,
      });
      if (gateEval.gateRequired) {
        setShowSubscriptionGate(true);
      } else if (!nextConfig.enabled || !nextConfig.botIsAdmin || isAdminTelegramUser(currentUser)) {
        setShowSubscriptionGate(false);
      }
      if (data?.error) {
        setSubscriptionError(data.error);
      }
    } catch {
      // keep state resilient
    } finally {
      setIsCheckingSubscription(false);
    }
  }, [currentUser?.uid, currentUser?.telegramChatId, currentUser?.telegram, currentUser?.role, currentUser?.isAdmin]);

  useEffect(() => {
    void verifyMandatorySubscription();
  }, [verifyMandatorySubscription, subVersionTick]);

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
      showToast("Marshrut chizish uchun avval GPS lokatsiyangizni yoqing!");
      setActiveTab('map');
      return;
    }
    if (!targetUser || !targetUser.location?.lat || !targetUser.location?.lng) {
      showToast("Ushbu foydalanuvchining lokatsiyasi mavjud emas.");
      return;
    }

    const vis = targetUser.locationVisibility || 'everyone';
    if (vis === 'ghost' || targetUser.isLocationEnabled === false) {
      showToast("Bu foydalanuvchi o'z lokatsiyasini yashirgan (Ghost Mode).");
      return;
    }

    // Allowed! Set active route target and switch to map tab
    setActiveRouteUser(targetUser);
    setActiveTab('map');
  };

  const openUserProfileByUid = async (targetUidOrId: string, snapshot?: any) => {
    const key = String(targetUidOrId || '').trim();
    if (!key) return;
    const { isSelf, user: localMatch } = resolveExactUserByUid(key, usersList, currentUser, snapshot);
    if (isSelf) {
      setSelectedProfile(null);
      setFollowModalState(null);
      setActiveTab('profile');
      return;
    }
    if (localMatch && (localMatch.uid || localMatch.id)) {
      setSelectedProfile(localMatch);
      const canonical = localMatch.uid || localMatch.id;
      fetch(getApiUrl(`/api/users/${encodeURIComponent(canonical)}`))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.success && d?.user && (d.user.uid === canonical || d.user.id === canonical)) {
            setSelectedProfile((prev: any) =>
              prev && (prev.uid === d.user.uid || prev.id === d.user.id) ? { ...prev, ...d.user } : prev
            );
          }
        })
        .catch(() => {});
      return;
    }
    try {
      const data = await safeFetchJson(getApiUrl(`/api/users/${encodeURIComponent(key)}`));
      if (data?.success && data?.user) {
        setUsersList((prev) =>
          prev.some((u) => u.uid === data.user.uid) ? prev : [...prev, data.user]
        );
        setSelectedProfile(data.user);
      }
    } catch (err) {
      console.warn('Could not resolve profile:', err);
    }
  };

  // Listen to Custom Map Marker Click Events
  useEffect(() => {
    const handleOpenProfile = (e: any) => {
      const userId = e.detail;
      if (userId) {
        openUserProfileByUid(String(userId));
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

  // OSRM Real Street Polyline Generator on Leaflet Map (with Haversine fallback)
  useEffect(() => {
    if (
      activeTab !== 'map' ||
      !activeRouteUser ||
      activeRouteUser.location?.lat == null ||
      activeRouteUser.location?.lng == null ||
      userCoords?.lat == null ||
      userCoords?.lng == null ||
      !mapInstanceRef.current
    ) {
      return;
    }

    const L = (window as any).L;
    if (!L) return;

    if (mapPolylineRef.current) {
      mapPolylineRef.current.remove();
      mapPolylineRef.current = null;
    }

    const originLng = Number(userCoords.lng);
    const originLat = Number(userCoords.lat);
    const destLng = Number(activeRouteUser.location.lng);
    const destLat = Number(activeRouteUser.location.lat);
    if ([originLng, originLat, destLng, destLat].some((v) => Number.isNaN(v))) return;

    let cancelled = false;
    setIsCalculatingRoute(true);

    safeFetchJson(
      `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`
    )
      .then((data) => {
        if (cancelled || !mapInstanceRef.current) return;
        if (data && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const latLngs = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
          const polyline = L.polyline(latLngs, {
            color: '#E11D48',
            weight: 5,
            opacity: 0.92,
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(mapInstanceRef.current);

          mapPolylineRef.current = polyline;
          mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [56, 56] });

          const distKm = (route.distance / 1000).toFixed(1);
          const durationMin = Math.max(1, Math.round(route.duration / 60));
          setRouteInfo({ distanceKm: distKm, durationMin, isFallback: false });
          return;
        }
        throw new Error('No routes found');
      })
      .catch(() => {
        if (cancelled || !mapInstanceRef.current) return;
        const straightKm = computeHaversineKm(originLat, originLng, destLat, destLng);
        const polyline = L.polyline(
          [
            [originLat, originLng],
            [destLat, destLng],
          ],
          {
            color: '#F43F5E',
            weight: 4,
            opacity: 0.85,
            dashArray: '8 8',
          }
        ).addTo(mapInstanceRef.current);
        mapPolylineRef.current = polyline;
        mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [56, 56] });
        setRouteInfo({
          distanceKm: straightKm.toFixed(1),
          durationMin: Math.max(2, Math.round((straightKm / 35) * 60)),
          isFallback: true,
        });
      })
      .finally(() => {
        if (!cancelled) setIsCalculatingRoute(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeRouteUser, userCoords, mapReadyTick]);

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
    let resizeObserver: ResizeObserver | null = null;
    const node = mapContainerRef.current;
    if (!node) return;

    const handlePopupButtonClick = (evt: MouseEvent) => {
      const target = (evt.target as HTMLElement | null)?.closest('[data-alov-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.getAttribute('data-alov-action');
      const uid = target.getAttribute('data-uid');
      if (!uid) return;
      if (action === 'watch-live') {
        window.dispatchEvent(new CustomEvent('alov-watch-live-stream', { detail: uid }));
      } else if (action === 'open-profile') {
        window.dispatchEvent(new CustomEvent('alov-open-user-profile', { detail: uid }));
      } else if (action === 'draw-route') {
        window.dispatchEvent(new CustomEvent('alov-draw-route-to-user', { detail: uid }));
      }
    };
    node.addEventListener('click', handlePopupButtonClick);

    if (!mapInstanceRef.current) {
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
            attribution: '© OpenStreetMap Alov.uz GPS',
          }).addTo(map);
          setMapReadyTick((t) => t + 1);
          setTimeout(() => {
            if (!cancelled && mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize();
            }
          }, 120);
          if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
            resizeObserver = new ResizeObserver(() => {
              mapInstanceRef.current?.invalidateSize();
            });
            resizeObserver.observe(mapContainerRef.current);
          }
        })
        .catch((err) => {
          console.error('Leaflet init error:', err);
        });
    }

    return () => {
      cancelled = true;
      node.removeEventListener('click', handlePopupButtonClick);
      resizeObserver?.disconnect();
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
        const myAvatar = resolveAvatarUrl(resolveEffectiveProfileAvatar(currentUser) || firebaseUser?.photoURL);
        const myInitial = escapeHtml((getSafeUserDisplayName(currentUser, 'Siz') || 'S').charAt(0).toUpperCase());
        const safeMyAvatar = escapeHtml(myAvatar);
        const userIcon = L.divIcon({
          className: 'custom-user-marker',
          html: `<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div class="pulse-ring"></div>
            <div style="background:#E11D48;width:34px;height:34px;border-radius:50%;border:2.5px solid white;box-shadow:0 4px 14px rgba(225,29,72,0.55);overflow:hidden;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px;position:relative;z-index:2;">
              ${safeMyAvatar ? `<img src="${safeMyAvatar}" style="width:100%;height:100%;object-fit:cover;" />` : myInitial}
            </div>
          </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        if (!markersRef.current['me']) {
          markersRef.current['me'] = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon }).addTo(map);
        } else {
          markersRef.current['me'].setLatLng([userCoords.lat, userCoords.lng]);
          if (markersRef.current['me'].options?.icon?.options?.html !== userIcon.options.html) {
            markersRef.current['me'].setIcon(userIcon);
          }
        }
      } else if (markersRef.current['me']) {
        markersRef.current['me'].remove();
        delete markersRef.current['me'];
      }

      // 2. Sync Other Users — ALL users who enabled location visibility appear on the shared map
      const myUid = currentUser?.uid || firebaseUser?.uid;
      const activeUsers = usersList.filter((u) => {
        if (myUid && (u.uid === myUid || u.id === myUid)) return false;
        if (filterRegion !== 'Barchasi' && u.region !== filterRegion) return false;
        if (filterDistrict !== 'Barchasi' && u.district !== filterDistrict) return false;
        const hasCoords = u.location && u.location.lat != null && u.location.lng != null;
        return hasCoords && u.locationVisibility !== 'ghost' && u.isLocationEnabled !== false;
      });

      // Remove markers no longer active
      Object.keys(markersRef.current).forEach((id) => {
        if (id !== 'me' && !activeUsers.find((u) => u.uid === id || u.id === id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });

      // Add/Update markers smoothly inside the map
      activeUsers.forEach((u) => {
        const markerKey = String(u.uid || u.id || '');
        const lat = Number(u.location.lat);
        const lng = Number(u.location.lng);
        if (!markerKey || Number.isNaN(lat) || Number.isNaN(lng)) return;

        const userAvatar = resolveAvatarUrl(resolveEffectiveProfileAvatar(u));
        const safeAvatar = escapeHtml(userAvatar);
        const rawName = getSafeUserDisplayName(u, 'Foydalanuvchi');
        const safeName = escapeHtml(rawName);
        const safeLocation = escapeHtml(u.district || u.region || "O'zbekiston");
        const safeKeyAttr = escapeHtml(markerKey);
        const initial = escapeHtml(rawName.charAt(0).toUpperCase());
        const isLive = u.isLive === true;
        const isOnline = isUserOnlineStrict(u, onlineUserIds);

        const otherIcon = L.divIcon({
          className: isLive ? 'custom-live-marker' : 'custom-other-marker',
          html: `
            <div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;">
              ${isLive || isOnline ? '<div class="pulse-ring" style="background-color:' + (isLive ? '#EF4444' : '#10B981') + '"></div>' : ''}
              <div style="background:#E11D48;width:36px;height:36px;border-radius:50%;border:2px solid ${isLive ? '#EF4444' : '#FFFFFF'};box-shadow:0 4px 12px rgba(0,0,0,0.45);overflow:hidden;position:relative;z-index:2;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px;">
                ${safeAvatar ? `<img src="${safeAvatar}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'"/>` : initial}
                ${isOnline ? '<span style="position:absolute;bottom:1px;right:1px;width:9px;height:9px;background:#10B981;border:1.5px solid #131622;border-radius:50%;"></span>' : ''}
              </div>
              ${isLive ? '<span style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);background:#EF4444;color:white;font-size:7px;font-weight:900;padding:0.5px 5px;border-radius:999px;z-index:10;white-space:nowrap;">● LIVE</span>' : ''}
            </div>
          `,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });

        const popupAvatarHtml = safeAvatar
          ? `<img src="${safeAvatar}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid ${isLive ? '#EF4444' : '#E11D48'};" />`
          : `<div style="width:48px;height:48px;border-radius:50%;background:#1E2232;color:#F43F5E;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;border:2px solid #E11D48;">${initial}</div>`;

        const popupContent = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; text-align: center; width: 184px; padding: 4px 2px; color: #F4F4F6;">
            <div style="position:relative; width:48px; margin: 0 auto 8px;">
              ${popupAvatarHtml}
              ${isLive ? '<span style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);background:#EF4444;color:white;font-size:8px;font-weight:800;padding:1px 6px;border-radius:6px;">LIVE</span>' : ''}
              ${isOnline ? '<span style="position:absolute;top:0;right:0;width:12px;height:12px;background:#10B981;border:2px solid #131622;border-radius:50%;"></span>' : ''}
            </div>
            <b style="font-size: 13.5px; display:block; color:#FFFFFF; font-weight:700;">${safeName}</b>
            <p style="font-size: 10.5px; color: #A1A1AA; margin: 2px 0 10px;">${safeLocation}</p>
            ${isLive ? `<button type="button" data-alov-action="watch-live" data-uid="${safeKeyAttr}" style="background:#DC2626;color:white;border:none;padding:7px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:5px;width:100%;">Efirni ko'rish (LIVE)</button>` : ''}
            <button type="button" data-alov-action="open-profile" data-uid="${safeKeyAttr}" style="background:#E11D48;color:white;border:none;padding:7px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:5px;width:100%;">Profilni ko'rish</button>
            <button type="button" data-alov-action="draw-route" data-uid="${safeKeyAttr}" style="background:#1F2333;color:#E4E4E7;border:1px solid rgba(255,255,255,0.12);padding:7px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;width:100%;">Yo'l (Marshrut)</button>
          </div>
        `;

        if (!markersRef.current[markerKey]) {
          const marker = L.marker([lat, lng], { icon: otherIcon }).addTo(map);
          marker.bindPopup(popupContent);
          markersRef.current[markerKey] = marker;
        } else {
          const existingMarker = markersRef.current[markerKey];
          existingMarker.setLatLng([lat, lng]);
          if (existingMarker.options?.icon?.options?.html !== otherIcon.options.html) {
            existingMarker.setIcon(otherIcon);
          }
          if (existingMarker.getPopup()?.getContent() !== popupContent) {
            existingMarker.setPopupContent(popupContent);
          }
        }
      });
    });
  }, [activeTab, mapReadyTick, usersList, onlineUserIds, userCoords, isLocationEnabled, currentUser, firebaseUser, filterRegion, filterDistrict]);


  // Device Image File Upload Handler -> Opens Avatar Image Crop Modal
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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

  // Upload Cover Banner directly via server media store (and optionally save immediately to profile)
  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>, saveImmediately: boolean = false) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingBanner(true);
    setErrorMsg('');
    try {
      const res = await fetch(getApiUrl('/api/media/upload-raw'), {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'image/jpeg',
          'x-file-name': encodeURIComponent(file.name || 'banner.jpg'),
        },
        body: file,
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.url) {
        setErrorMsg(data?.error || 'Banner yuklanmadi.');
        return;
      }
      setRegBanner(data.url);
      if (saveImmediately && currentUser?.uid) {
        const updated = { ...currentUser, banner: data.url };
        const syncRes = await safeFetchJson(getApiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: updated }),
        });
        const finalUser = syncRes?.user || updated;
        setCurrentUser(finalUser);
        setUsersList((prev) =>
          prev.map((u) => (u.uid === finalUser.uid ? { ...u, ...finalUser } : u))
        );
        try {
          localStorage.setItem('alov_current_user', JSON.stringify(finalUser));
          localStorage.setItem('alov_user_' + finalUser.uid, JSON.stringify(finalUser));
        } catch {}
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Banner yuklashda xatolik.');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  // Render Cropped Avatar via Canvas and Save
  const handleApplyCrop = () => {
    if (!cropImageSrc) return;
    const img = new Image();
    let handled = false;
    const renderAndSave = () => {
      if (handled) return;
      handled = true;
      const size = 300;
      const previewSize = 224; // w-56 h-56 preview container
      const panRatio = size / previewSize;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setShowCropModal(false);
        return;
      }

      // Dark obsidian canvas background matching circular preview container
      ctx.fillStyle = '#09090D';
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      ctx.translate(size / 2 + cropPan.x * panRatio, size / 2 + cropPan.y * panRatio);
      ctx.scale(cropScale, cropScale);

      // Draw image keeping object-cover aspect ratio
      const naturalW = img.naturalWidth || img.width || size;
      const naturalH = img.naturalHeight || img.height || size;
      const aspect = naturalW / naturalH;
      let drawW = size;
      let drawH = size;
      if (aspect > 1) {
        drawW = size * aspect;
      } else {
        drawH = size / aspect;
      }
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      try {
        const croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);
        setRegAvatar(croppedBase64);
      } catch {
        setRegAvatar(cropImageSrc);
      }
      setShowCropModal(false);
      setCropImageSrc(null);
    };

    img.onload = renderAndSave;
    img.onerror = () => {
      if (handled) return;
      handled = true;
      setRegAvatar(cropImageSrc);
      setShowCropModal(false);
      setCropImageSrc(null);
    };
    if (!cropImageSrc.startsWith('data:') && !cropImageSrc.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = cropImageSrc;
    if (img.complete && img.naturalWidth > 0) {
      renderAndSave();
    }
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
        const msg = "Qurilmangiz geolokatsiyani (GPS) qo'llab-quvvatlamaydi.";
        setGpsStatusMsg(msg);
        showToast(msg);
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
          setIsLocationEnabled(false);
          setGpsStatusMsg(errMsg);
          showToast(errMsg);
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
    const activeUid = currentUser?.uid || firebaseUser?.uid;
    if (!activeUid) return;
    const trimmedName = regName.trim();
    if (!trimmedName) {
      setErrorMsg("Iltimos, ismingizni kiriting!");
      return;
    }
    setErrorMsg('');
    setIsSavingProfile(true);

    try {
      let finalUsername = currentUser?.username || '';
      if (regUsername.trim()) {
        const uRes = validateUsername(regUsername);
        if (!uRes.valid) {
          setErrorMsg(uRes.error || "Username xato kiritilgan.");
          return;
        }
        if (!isUsernameUnique(uRes.normalized, usersList, activeUid)) {
          setErrorMsg(`"@${uRes.normalized}" username band! Iltimos, boshqa username tanlang.`);
          return;
        }
        finalUsername = uRes.normalized;
      }

      let resolvedSavedAvatar = pickPreferredAvatar(
        regAvatar,
        currentUser?.hasCustomAvatar ? currentUser?.avatar : '',
        currentUser?.faceId?.capturedPhotoUrl,
        currentUser?.avatar,
        firebaseUser?.photoURL
      );
      if (resolvedSavedAvatar && resolvedSavedAvatar.startsWith('data:image/')) {
        try {
          const uploadRes = await safeFetchJson(getApiUrl('/api/media/upload'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataUrl: resolvedSavedAvatar,
              fileName: `avatar_${activeUid}.jpg`,
              mimeType: 'image/jpeg',
            }),
          });
          if (uploadRes?.success && uploadRes.url) {
            resolvedSavedAvatar = uploadRes.url;
          }
        } catch {}
      }

      const facePhotoUrl = String(currentUser?.faceId?.capturedPhotoUrl || '').trim();
      const hasCustomAvatar = Boolean(
        resolvedSavedAvatar &&
          ((facePhotoUrl && resolvedSavedAvatar !== facePhotoUrl) ||
            Boolean(currentUser?.hasCustomAvatar && resolvedSavedAvatar === currentUser?.avatar))
      );

      const isPrimaryLocked = Boolean(currentUser?.isProfileCompleted === true);
      const lockedGender = isPrimaryLocked && (currentUser?.gender === 'male' || currentUser?.gender === 'female')
        ? currentUser.gender
        : regGender;
      const lockedBirthDate = isPrimaryLocked && currentUser?.birthDate ? currentUser.birthDate : regBirthDate;
      const computedAge = calculateAge(lockedBirthDate, Number(currentUser?.age || regAge));
      const trimmedPhone = regPhone.trim();
      const formattedPhone = trimmedPhone && trimmedPhone !== '+' ? formatPhoneNumberPretty(trimmedPhone) : '';
      const newUserData = {
        ...currentUser,
        id: currentUser?.id || `ALOV-${activeUid.slice(0, 5).toUpperCase()}`,
        uid: activeUid,
        name: trimmedName,
        firstName: trimmedName,
        first_name: trimmedName,
        lastName: '',
        last_name: '',
        username: finalUsername,
        birthDate: lockedBirthDate,
        age: computedAge,
        gender: lockedGender,
        region: regRegion,
        district: regDistrict,
        neighborhood: regNeighborhood.trim(),
        phone: formattedPhone,
        telegram: regTelegram.trim(),
        instagram: regInstagram.trim(),
        bio: regBio.trim(),
        hasCustomAvatar,
        avatar: resolvedSavedAvatar,
        banner: showProfileModal ? regBanner : (regBanner || currentUser?.banner || ''),
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
      if (!data || !data.success || !data.user) {
        setErrorMsg(data?.error || "Profil ma'lumotlarini serverda saqlab bo'lmadi.");
        return;
      }
      const savedUser = data.user;

      if (auth.currentUser && trimmedName) {
        updateProfile(auth.currentUser, { displayName: trimmedName }).catch(() => {});
      }

      try {
        localStorage.setItem('alov_current_user', JSON.stringify(savedUser));
        localStorage.setItem('alov_user_' + (savedUser.uid || activeUid), JSON.stringify(savedUser));
      } catch (e) {}

      setCurrentUser(savedUser);
      setRegName(getSafeUserDisplayName(savedUser, trimmedName));
      setRegAvatar(resolveEffectiveProfileAvatar(savedUser));
      setUsersList(prev => {
        const userMap = new Map<string, any>();
        prev.forEach(u => userMap.set(u.uid || u.id, u));
        userMap.set(savedUser.uid || activeUid, savedUser);
        return Array.from(userMap.values());
      });
      setPostsList(prev =>
        prev.map(p =>
          p.authorUid === (savedUser.uid || activeUid)
            ? {
                ...p,
                authorName: savedUser.name || trimmedName,
                authorUsername: savedUser.username ?? p.authorUsername,
                authorAvatar: resolveEffectiveProfileAvatar(savedUser) || p.authorAvatar,
              }
            : p
        )
      );
      setShowProfileModal(false);
      if (activeTab === 'landing') {
        setActiveTab('discover');
      }
      showToast("Profil ma'lumotlari saqlandi");
    } catch (err: any) {
      setErrorMsg(err.message || "Profilni saqlashda xatolik.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLocationVisibilityChange = (value: 'everyone' | 'mutual' | 'ghost') => {
    setRegLocationVisibility(value);
    const enabled = value !== 'ghost';
    setIsLocationEnabled(enabled);
    setCurrentUser((prev: any) =>
      prev ? { ...prev, locationVisibility: value, isLocationEnabled: enabled } : prev
    );
    const activeUid = currentUser?.uid || firebaseUser?.uid;
    if (activeUid) {
      fetch(getApiUrl('/api/users/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: activeUid,
          updates: { locationVisibility: value, isLocationEnabled: enabled }
        })
      }).catch(console.error);
    }
  };

  const resetAuthFormState = () => {
    const clean = getInitialAuthDraftState();
    setAuthEmail(clean.authEmail);
    setAuthPassword(clean.authPassword);
    setShowAuthPassword(false);
    setTelegramInput(clean.telegramInput);
    setEnteredTgCode(clean.enteredTgCode);
    setGeneratedTgCode(clean.generatedTgCode);
    setPendingTgUser(null);
    setPendingGoogleUser(null);
    setPendingFaceId(null);
    setHasStartedBotError(false);
    setPrivacyAgreed(false);
    setPrivacyReadToBottom(false);
    setTermsReadToBottom(false);
    setInlinePolicyReturnMode(null);
    setTurnstileToken(null);
    setTurnstileResetTick((t) => t + 1);
    setErrorMsg('');
    setRegName(clean.regName);
    setRegUsername(clean.regUsername);
    setRegBirthDate(clean.regBirthDate);
    setRegAge(clean.regAge);
    setRegGender(clean.regGender);
    setRegRegion(clean.regRegion);
    setRegDistrict(clean.regDistrict);
    setRegNeighborhood(clean.regNeighborhood);
    setRegPhone(clean.regPhone);
    setRegTelegram(clean.regTelegram);
    setRegInstagram(clean.regInstagram);
    setRegBio(clean.regBio);
    setRegAvatar(clean.regAvatar);
    setRegBanner(clean.regBanner);
  };

  const openAuthModalClean = (mode: 'login' | 'register' | 'telegram' = 'login') => {
    resetAuthFormState();
    setTelegramStep('input_phone');
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      setErrorMsg("Iltimos, avval Cloudflare xavfsizlik tekshiruvini (CAPTCHA) tasdiqlang!");
      return;
    }
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
        body: JSON.stringify({ loginInput: authEmail.trim(), password: authPassword.trim(), turnstileToken })
      });

      if (serverLoginRes && serverLoginRes.success && serverLoginRes.user) {
        const userData = serverLoginRes.user;
        if (!canPersistUserProfile(userData)) {
          setErrorMsg("Ro'yxatdan o'tish oxirigacha yakunlanmagan. Iltimos, Face ID va profil anketasini yakunlang!");
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

      if (serverLoginRes?.error && /captcha|cloudflare/i.test(String(serverLoginRes.error))) {
        setTurnstileToken(null);
        setTurnstileResetTick((t) => t + 1);
        setErrorMsg(serverLoginRes.error);
        return;
      }

      // Fallback: Firebase Sign In if input was formatted as an email
      if (authEmail.includes('@') && !authEmail.startsWith('@')) {
        const userCredential = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
        if (userCredential.user) {
          const synced = await syncUserWithBackend(userCredential.user, { autoOpenFaceId: false });
          if (synced && canPersistUserProfile(synced)) {
            return;
          }
          await signOut(auth).catch(() => {});
          setErrorMsg("Profil bazada topilmadi yoki ro'yxatdan o'tish oxirigacha yakunlanmagan. Avval Face ID va profil anketasini yakunlang!");
          return;
        }
      }

      setTurnstileToken(null);
      setTurnstileResetTick((t) => t + 1);
      setErrorMsg(serverLoginRes?.error || "Username, Email yoki parol xato.");
    } catch (err: any) {
      setTurnstileToken(null);
      setTurnstileResetTick((t) => t + 1);
      setErrorMsg(formatAuthErrorMessage(err, 'login'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      setErrorMsg("Iltimos, avval Cloudflare xavfsizlik tekshiruvini (CAPTCHA) tasdiqlang!");
      return;
    }
    if (!authEmail.trim() || !authPassword.trim() || !regName.trim()) {
      setErrorMsg("Iltimos, email, parol va ism-familiyani to'ldiring!");
      return;
    }
    if (!privacyAgreed) {
      setErrorMsg("Avval Maxfiylik siyosati bilan tanishib chiqing va 'Roziman' tugmasini bosing.");
      setInlinePolicyReturnMode('register');
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');

      const captchaVerify = await safeFetchJson(getApiUrl('/api/auth/verify-turnstile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken }),
      });
      if (!captchaVerify?.success) {
        setTurnstileToken(null);
        setTurnstileResetTick((t) => t + 1);
        setErrorMsg(captchaVerify?.error || "Cloudflare CAPTCHA tekshiruvi muvaffaqiyatsiz tugadi.");
        return;
      }

      let registeredUser: User | null = null;
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
        registeredUser = userCredential.user;
      } catch (createErr: any) {
        // If user abandoned registration halfway earlier, Firebase Auth has the email while our DB does NOT.
        // Verify password and resume Face ID + profile setup only if backend confirms user is not yet in DB.
        if (createErr?.code === 'auth/email-already-in-use') {
          const existingCred = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
          const lookupRes = await safeFetchJson(getApiUrl('/api/users/sync'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user: { uid: existingCred.user.uid, email: existingCred.user.email || authEmail.trim() },
              lookupOnly: true,
            }),
          });
          if (lookupRes?.success && lookupRes?.exists && lookupRes?.user) {
            setErrorMsg("Bu email allaqachon ro'yxatdan o'tgan. Iltimos, 'Kirish' bo'limidan kiring!");
            setIsLoggingIn(false);
            return;
          }
          registeredUser = existingCred.user;
        } else {
          throw createErr;
        }
      }

      if (registeredUser) {
        setAuthOrigin('email');
        setPendingGoogleUser(registeredUser);
        setPendingFaceId(null);
        // Require Face ID BEFORE profile setup & DB creation
        setAuthMode('register_face_id');
      }
    } catch (err: any) {
      setErrorMsg(formatAuthErrorMessage(err, 'register'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!turnstileToken) {
      setErrorMsg("Iltimos, avval Cloudflare xavfsizlik tekshiruvini (CAPTCHA) tasdiqlang!");
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');

      const captchaVerify = await safeFetchJson(getApiUrl('/api/auth/verify-turnstile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken }),
      });
      if (!captchaVerify?.success) {
        setTurnstileToken(null);
        setTurnstileResetTick((t) => t + 1);
        setErrorMsg(captchaVerify?.error || "Cloudflare CAPTCHA tekshiruvi muvaffaqiyatsiz tugadi.");
        setIsLoggingIn(false);
        return;
      }

      setAuthOrigin('google');
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
          body: JSON.stringify({ user: partialUser, lookupOnly: true })
        });
        const data = await response.json();

        if (
          resolvePostProviderAuthStep({
            provider: 'google',
            exists: Boolean(data && data.success && data.exists && data.user),
            user: data?.user,
          }) === 'enter_app'
        ) {
          const canonicalUser = data.user;
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

        // First-time Google user: enter Face ID right after Google auth, then profile setup
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
      setErrorMsg(formatAuthErrorMessage(popupErr, 'google'));
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
    if (!privacyAgreed) {
      setErrorMsg("Avval Maxfiylik siyosati bilan tanishib chiqing va 'Roziman' tugmasini bosing.");
      setInlinePolicyReturnMode('google_setup');
      return;
    }
    if (!pendingFaceId?.verified) {
      setErrorMsg("Avval Face ID tasdiqlashdan o'ting!");
      setAuthMode(authOrigin === 'email' ? 'register_face_id' : 'google_face_id');
      return;
    }
    if (regGender !== 'male' && regGender !== 'female') {
      setErrorMsg("Iltimos, jinsingizni tanlang (Ayol / Qiz yoki Erkak / Yigit)!");
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');

      let finalUsername = '';
      if (regUsername.trim()) {
        const uRes = validateUsername(regUsername);
        if (!uRes.valid) {
          setErrorMsg(uRes.error || "Username xato kiritilgan.");
          setIsLoggingIn(false);
          return;
        }
        if (!isUsernameUnique(uRes.normalized, usersList, pendingGoogleUser.uid)) {
          setErrorMsg(`"@${uRes.normalized}" username band! Iltimos, boshqa username tanlang.`);
          setIsLoggingIn(false);
          return;
        }
        finalUsername = uRes.normalized;
      }

      const cleanTg = (regTelegram || '').replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
      const formattedTg = cleanTg ? `https://t.me/${cleanTg}` : undefined;
      const confirmedGender: 'male' | 'female' = regGender;
      const verifiedAvatar = pendingFaceId?.capturedPhotoUrl || regAvatar;
      const syncedFaceId = pendingFaceId
        ? {
            ...pendingFaceId,
            detectedGender: confirmedGender,
            genderLabelUz: genderToUzLabel(confirmedGender),
          }
        : undefined;

      const newUserData = {
        uid: pendingGoogleUser.uid,
        id: `ALOV-${pendingGoogleUser.uid.slice(0, 5).toUpperCase()}`,
        name: regName.trim(),
        username: finalUsername,
        email: pendingGoogleUser.email || authEmail || '',
        telegram: formattedTg,
        password: authPassword.trim() || undefined,
        avatar: verifiedAvatar,
        ...(syncedFaceId ? { faceId: syncedFaceId } : {}),
        isVerified: Boolean(syncedFaceId?.verified),
        role: isAdminTelegramUser({ telegram: formattedTg }) ? 'admin' : 'user',
        isAdmin: isAdminTelegramUser({ telegram: formattedTg }),
        age: calculateAge(regBirthDate, Number(regAge) || 22),
        birthDate: regBirthDate,
        gender: confirmedGender,
        region: regRegion,
        district: regDistrict,
        neighborhood: regNeighborhood,
        phone: formatPhoneNumberPretty(regPhone),
        bio: regBio.trim() || 'Alov.uz da yangi tanishuvlar uchun.',
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
      if (!syncData || !syncData.success || !syncData.user) {
        setErrorMsg(syncData?.error || "Profil yaratishda xatolik yuz berdi.");
        setIsLoggingIn(false);
        return;
      }
      const finalUser = syncData.user;
      setCurrentUser(finalUser);
      setUsersList(prev => {
        const userMap = new Map<string, any>();
        prev.forEach(u => userMap.set(u.uid || u.id, u));
        userMap.set(finalUser.uid, finalUser);
        return Array.from(userMap.values());
      });
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

  const handleOpenTelegramFlow = async () => {
    setErrorMsg('');
    setAuthOrigin('telegram');
    setAuthMode('telegram');

    try {
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;
      if (tg?.initData && tgUser?.id) {
        setIsLoggingIn(true);
        const realName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim();
        const telegramUserObj = {
          uid: `tg_${tgUser.id}`,
          id: `TG-${tgUser.id}`,
          name: realName,
          telegram: tgUser.username ? `https://t.me/${tgUser.username}` : undefined,
          telegramChatId: tgUser.id,
          avatar: tgUser.photo_url || '',
          gender: '',
          isProfileCompleted: false,
        };
        const res = await safeFetchJson(getApiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: telegramUserObj, lookupOnly: true }),
        });
        const exists = Boolean(res && res.success && res.exists && res.user);
        const step = resolvePostProviderAuthStep({ provider: 'telegram', exists, user: res?.user });
        if (step === 'enter_app' && res?.user) {
          setCurrentUser(res.user);
          try {
            localStorage.setItem('alov_current_user', JSON.stringify(res.user));
            localStorage.setItem('alov_user_' + res.user.uid, JSON.stringify(res.user));
          } catch (e) {}
          setShowAuthModal(false);
          setActiveTab('discover');
          setIsLoggingIn(false);
          return;
        }
        setPendingTgUser(res?.user || telegramUserObj);
        setPendingFaceId(null);
        setRegName(getSafeUserDisplayName(res?.user, realName));
        setRegAvatar('');
        setRegTelegram(telegramUserObj.telegram || '');
        setRegGender('');
        setTelegramStep('face_id');
        setIsLoggingIn(false);
        return;
      }
    } catch (e) {
      // Fallback cleanly to manual Telegram bot verification if Mini App lookup fails
    } finally {
      setIsLoggingIn(false);
    }

    setTelegramStep('input_phone');
  };

  const handleStartTelegramAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      setErrorMsg("Iltimos, avval Cloudflare xavfsizlik tekshiruvini (CAPTCHA) tasdiqlang!");
      return;
    }
    if (!telegramInput.trim()) {
      setErrorMsg("Iltimos, Telegram telefon raqami yoki username'ni kiriting!");
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');
      setHasStartedBotError(false);

      // Check ONLY chatId bound strictly to this entered Telegram identifier
      let cachedChatId = undefined;
      try {
        const cleanKey = telegramInput.trim().replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
        if (cleanKey) {
          cachedChatId = localStorage.getItem('alov_tg_chat_' + cleanKey) || undefined;
        }
      } catch (e) {}

      const data = await safeFetchJson(getApiUrl('/api/auth/send-telegram-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phoneNumber: telegramInput.trim(),
          chatId: cachedChatId,
          turnstileToken,
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
        setTurnstileToken(null);
        setTurnstileResetTick((t) => t + 1);
        setHasStartedBotError(true);
        setErrorMsg(data.error || "Botimiz ro'yxatida topilmadingiz! Iltimos, avval @alovuz_bot ga kirib /start tugmasini bir marta bosing.");
      } else {
        setTurnstileToken(null);
        setTurnstileResetTick((t) => t + 1);
        setErrorMsg(data?.error || "Kod yuborishda xatolik.");
      }
    } catch (err: any) {
      setTurnstileToken(null);
      setTurnstileResetTick((t) => t + 1);
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

        const nextStep = resolvePostProviderAuthStep({
          provider: 'telegram',
          exists: !data.isNewUser && Boolean(data.user),
          user: data.user,
        });

        if (nextStep === 'face_id') {
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

          // Telegram's display name is carried over, while avatar MUST come from Face ID camera
          setRegName(calculatedName);
          setRegAvatar('');
          const rawSeedPhone = data.user.phone || (/^\+?\d+$/.test(telegramInput.trim().replace(/\s+/g, '')) ? telegramInput.trim() : '+998 ');
          setRegPhone(formatPhoneNumberPretty(rawSeedPhone) || '+998 ');
          const cleanUserTg = telegramInput.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
          setRegTelegram(data.user.telegram || (cleanUserTg && !/^\d+$/.test(cleanUserTg) ? `https://t.me/${cleanUserTg}` : ''));
          setRegBirthDate(data.user.birthDate || '2002-05-15');
          setRegAge(String(calculateAge(data.user.birthDate || '2002-05-15', Number(data.user.age || 22))));
          setRegGender(
            data.user.isProfileCompleted && (data.user.gender === 'male' || data.user.gender === 'female')
              ? data.user.gender
              : ''
          );
          setRegRegion(data.user.region || 'Toshkent shahri');
          setRegDistrict(data.user.district || 'Yunusobod tumani');
          setRegNeighborhood(data.user.neighborhood || '');
          setRegBio(data.user.isProfileCompleted ? (data.user.bio || '') : '');

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
    const facePhoto = result.photoUrl || result.photoDataUrl;
    setPendingFaceId(result.faceId);
    setRegAvatar(facePhoto);

    if (origin === 'telegram') {
      // Only allow direct entry if returning Telegram user already passed full onboarding previously
      if (canPersistUserProfile(pendingTgUser)) {
        const preservedGender =
          pendingTgUser.gender === 'male' || pendingTgUser.gender === 'female'
            ? pendingTgUser.gender
            : (result.userSelectedGender || 'male');
        setRegGender(preservedGender);
        const updatedUser = {
          ...pendingTgUser,
          avatar: facePhoto,
          gender: preservedGender,
          birthDate: pendingTgUser.birthDate,
          faceId: {
            ...result.faceId,
            detectedGender: preservedGender,
            genderLabelUz: genderToUzLabel(preservedGender),
          },
          isVerified: true,
        };
        const syncData = await safeFetchJson(getApiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: updatedUser }),
        });
        if (!syncData || !syncData.success || !syncData.user) {
          setErrorMsg(syncData?.error || "Profilni serverga yuklashda xatolik.");
          return;
        }
        const finalUser = syncData.user;
        setCurrentUser(finalUser);
        setUsersList(prev => {
          const userMap = new Map<string, any>();
          prev.forEach(u => userMap.set(u.uid || u.id, u));
          userMap.set(finalUser.uid, finalUser);
          return Array.from(userMap.values());
        });
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
      setRegGender(resolvePostFaceIdGender({ explicitSelection: result.userSelectedGender }));
      setTelegramStep(resolvePostFaceIdStep('telegram') as 'profile_setup');
    } else {
      setRegGender(resolvePostFaceIdGender({ explicitSelection: result.userSelectedGender }));
      setAuthMode(resolvePostFaceIdStep(origin === 'register' ? 'email' : 'google') as 'google_setup');
    }
  };

  const handleCompleteTelegramRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingTgUser) return;
    if (!regName.trim()) {
      setErrorMsg("Iltimos, ismingizni kiriting!");
      return;
    }
    if (!privacyAgreed) {
      setErrorMsg("Avval Maxfiylik siyosati bilan tanishib chiqing va 'Roziman' tugmasini bosing.");
      setInlinePolicyReturnMode('telegram_setup');
      return;
    }
    if (!pendingFaceId?.verified) {
      setErrorMsg("Avval Face ID tasdiqlashdan o'ting!");
      setTelegramStep('face_id');
      return;
    }
    if (regGender !== 'male' && regGender !== 'female') {
      setErrorMsg("Iltimos, jinsingizni tanlang (Ayol / Qiz yoki Erkak / Yigit)!");
      return;
    }
    try {
      setIsLoggingIn(true);
      setErrorMsg('');

      let finalUsername = '';
      if (regUsername.trim()) {
        const uRes = validateUsername(regUsername);
        if (!uRes.valid) {
          setErrorMsg(uRes.error || "Username xato kiritilgan.");
          setIsLoggingIn(false);
          return;
        }
        if (!isUsernameUnique(uRes.normalized, usersList, pendingTgUser.uid)) {
          setErrorMsg(`"@${uRes.normalized}" username band! Iltimos, boshqa username tanlang.`);
          setIsLoggingIn(false);
          return;
        }
        finalUsername = uRes.normalized;
      }

      const cleanTg = (regTelegram || pendingTgUser.telegram || telegramInput || '').replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
      const formattedTg = cleanTg && !/^\d+$/.test(cleanTg) ? `https://t.me/${cleanTg}` : undefined;
      const confirmedGender: 'male' | 'female' = regGender;
      const verifiedAvatar = pendingFaceId.capturedPhotoUrl || regAvatar;
      const syncedFaceId = {
        ...pendingFaceId,
        detectedGender: confirmedGender,
        genderLabelUz: genderToUzLabel(confirmedGender),
      };

      const newUserData = {
        uid: pendingTgUser.uid,
        id: pendingTgUser.id || `ALOV-TG-${pendingTgUser.uid.slice(0, 5).toUpperCase()}`,
        name: regName.trim(),
        username: finalUsername,
        telegram: formattedTg,
        telegramChatId: pendingTgUser.telegramChatId,
        password: authPassword.trim() || undefined,
        avatar: verifiedAvatar,
        faceId: syncedFaceId,
        isVerified: true,
        role: isAdminTelegramUser({ telegram: formattedTg }) ? 'admin' : 'user',
        isAdmin: isAdminTelegramUser({ telegram: formattedTg }),
        age: calculateAge(regBirthDate, Number(regAge) || 22),
        birthDate: regBirthDate,
        gender: confirmedGender,
        region: regRegion,
        district: regDistrict,
        neighborhood: regNeighborhood,
        phone: formatPhoneNumberPretty(regPhone),
        bio: regBio.trim() || 'Alov.uz da yangi tanishuvlar va suhbatlar uchun.',
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
      if (!syncData || !syncData.success || !syncData.user) {
        setErrorMsg(syncData?.error || "Profil yaratishda xatolik yuz berdi.");
        setIsLoggingIn(false);
        return;
      }
      const finalUser = syncData.user;
      setCurrentUser(finalUser);
      setUsersList(prev => {
        const userMap = new Map<string, any>();
        prev.forEach(u => userMap.set(u.uid || u.id, u));
        userMap.set(finalUser.uid, finalUser);
        return Array.from(userMap.values());
      });
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
      socketRef.current?.emit('unregister_user', { uid: activeUid });
      try {
        await fetch(getApiUrl('/api/users/offline'), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ uid: activeUid })
        });
      } catch (e) {}
    }
    try {
      localStorage.removeItem('alov_current_user');
      localStorage.removeItem('alov_last_tg_chat');
    } catch (e) {}
    await signOut(auth).catch(() => {});
    setFirebaseUser(null);
    setCurrentUser(null);
    setSelectedProfile(null);
    setSelectedChatUser(null);
    setFollowModalState(null);
    setChatView('list');
    setShowAdminPanel(false);
    resetAuthFormState();
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
        setUsersList(prev =>
          prev.map(u => {
            if (data.follower && (u.uid === data.follower.uid || u.id === data.follower.id)) {
              return { ...u, ...data.follower };
            }
            if (data.target && (u.uid === data.target.uid || u.id === data.target.id)) {
              return { ...u, ...data.target };
            }
            return u;
          })
        );
        if (data.target && selectedProfile && (selectedProfile.uid === data.target.uid || selectedProfile.id === data.target.id)) {
          setSelectedProfile(data.target);
        }
        if (data.target && followModalState?.user && (followModalState.user.uid === data.target.uid || followModalState.user.id === data.target.id)) {
          setFollowModalState(prev => prev ? { ...prev, user: data.target } : null);
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

    // Update chatsList via canonical deduplication and persist
    setChatsList(prev => {
      const chatEntry = {
        id: chatId,
        participants: [myUid, otherUid],
        lastMessage: msgObj.text,
        updatedAt: msgObj.createdAt,
        partner: selectedChatUser
      };
      const merged = mergeChatLists([prev, [chatEntry]], myUid, {
        myAliases: [myUid, currentUser?.id].filter(Boolean) as string[],
        usersList: usersListRef.current,
      });
      try {
        localStorage.setItem('alov_chats_' + myUid, JSON.stringify(merged));
      } catch (e) {}
      return merged;
    });
  };

  // Helper to open chat and immediately add to chatsList, localStorage, and backend
  const openChatWithUser = (targetUser: any) => {
    setSelectedChatUser(targetUser);
    setChatView('conversation');
    setActiveTab('chats');

    const myUid = currentUser?.uid || firebaseUser?.uid;
    const otherUid = targetUser?.uid || targetUser?.id;
    if (myUid && otherUid) {
      const chatId = buildCanonicalChatId(myUid, otherUid);
      setChatsList(prev => {
        const existing = prev.find(c => c.id === chatId);
        const chatEntry = {
          id: chatId,
          participants: [myUid, otherUid],
          lastMessage: existing?.lastMessage || "Yangi suhbat boshlandi",
          updatedAt: existing?.updatedAt || new Date().toISOString(),
          partner: targetUser
        };
        const merged = mergeChatLists([prev, [chatEntry]], myUid, {
          myAliases: [myUid, currentUser?.id].filter(Boolean) as string[],
          usersList: usersListRef.current,
        });
        try {
          localStorage.setItem('alov_chats_' + myUid, JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
      fetch(getApiUrl('/api/chats/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myUid, targetUid: otherUid, partnerSnapshot: targetUser }),
      }).catch(() => {});
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

  const handleSendChatMessage = async (type: 'text' | 'image' | 'video' | 'audio' | 'voice' = 'text', fileUrl?: string, customCaption?: string) => {
    if (!selectedChatUser) return;
    if (type === 'text' && !inputMessage.trim()) return;
    
    const text =
      type === 'text'
        ? inputMessage.trim()
        : (customCaption?.trim() || (type === 'image' ? "Rasm 🖼️" : (type === 'video' ? "Video 🎥" : (type === 'voice' ? "Ovozli xabar 🎤" : "Audio 🎵"))));
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

    // Update chatsList via canonical deduplication and persist
    setChatsList(prev => {
      const chatEntry = {
        id: chatId,
        participants: [myUid, otherUid],
        lastMessage: text,
        updatedAt: msgObj.createdAt,
        partner: selectedChatUser
      };
      const merged = mergeChatLists([prev, [chatEntry]], myUid, {
        myAliases: [myUid, currentUser?.id].filter(Boolean) as string[],
        usersList: usersListRef.current,
      });
      try {
        localStorage.setItem('alov_chats_' + myUid, JSON.stringify(merged));
      } catch (e) {}
      return merged;
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
        showToast(`${gift.name} sovg'asi yuborildi!`);
      } else {
        showToast(data?.error || "Sovg'a yuborishda xatolik");
      }
    } catch (e: any) {
      showToast(e.message || "Xatolik yuz berdi");
    }
  };

  const fetchMyCoinRequests = async (uid?: string) => {
    const targetUid = uid || currentUser?.uid || firebaseUser?.uid;
    if (!targetUid) return;
    try {
      const data = await safeFetchJson(getApiUrl(`/api/wallet/topup-requests/${encodeURIComponent(targetUid)}`));
      if (data && data.success && Array.isArray(data.requests)) {
        setUserCoinRequests(data.requests);
      }
    } catch {}
  };

  useEffect(() => {
    if (showTopUpModal) {
      fetchMyCoinRequests();
      if (!coinRequestContact.trim()) {
        const fallback = currentUser?.telegram || currentUser?.phone || (currentUser?.username ? `@${currentUser.username.replace(/^@/, '')}` : '');
        if (fallback) setCoinRequestContact(fallback);
      }
    }
  }, [showTopUpModal, currentUser?.uid]);

  useEffect(() => {
    if (showWithdrawModal && !withdrawContact.trim()) {
      const fallback = currentUser?.telegram || currentUser?.phone || (currentUser?.username ? `@${currentUser.username.replace(/^@/, '')}` : '');
      if (fallback) setWithdrawContact(fallback);
    }
  }, [showWithdrawModal, currentUser?.uid]);

  const handleExecuteTopUp = async () => {
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid) return;
    const cleanContact = coinRequestContact.trim();
    if (cleanContact.length < 3) {
      showToast("Admin aloqaga chiqishi uchun Telegram username yoki telefon raqamingizni kiriting!");
      return;
    }
    setIsSubmittingCoinRequest(true);
    try {
      const data = await safeFetchJson(getApiUrl('/api/wallet/topup-request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: myUid,
          coinAmount: topUpPackage.coins,
          paymentMethod: paymentProvider,
          contactInfo: cleanContact,
          note: coinRequestNote.trim(),
        })
      });
      if (data && data.success && data.request) {
        setUserCoinRequests((prev) => [data.request, ...prev.filter((r) => r.id !== data.request.id)]);
        setCoinRequestNote('');
        setWalletNoticeMsg('');
        showToast(`${topUpPackage.coins.toLocaleString()} moneta buyurtmasi adminga yuborildi! Admin siz bilan bog'lanadi.`);
      } else {
        showToast(data?.error || "Buyurtmani yuborishda xatolik.");
      }
    } catch (e: any) {
      showToast(e.message || "Xatolik yuz berdi");
    } finally {
      setIsSubmittingCoinRequest(false);
    }
  };

  const handleExecuteWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const myUid = currentUser?.uid || firebaseUser?.uid;
    if (!myUid) return;
    if (!withdrawCardNumber || withdrawCardNumber.replace(/\D/g, '').length < 16) {
      showToast("Iltimos, 16 xonali Humo yoki Uzcard karta raqamini kiriting!");
      return;
    }
    const cleanContact = withdrawContact.trim();
    if (cleanContact.length < 3) {
      showToast("Admin aloqaga chiqishi uchun Telegram username yoki telefon raqamingizni kiriting!");
      return;
    }
    if (withdrawAmount < 100) {
      showToast("Minimal yechib olish miqdori 100 almaz (10,000 so'm)!");
      return;
    }

    try {
      const data = await safeFetchJson(getApiUrl('/api/wallet/withdraw'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: myUid,
          diamondAmount: withdrawAmount,
          bankCard: withdrawCardNumber,
          contactInfo: cleanContact,
        })
      });
      if (data && data.success && data.user) {
        setCurrentUser(data.user);
        setShowWithdrawModal(false);
        showToast(`Pul yechish arizangiz adminga yuborildi (${calculateDiamondsToUzs(withdrawAmount).toLocaleString()} so'm). Admin siz bilan bog'lanadi!`);
      } else {
        showToast(data?.error || "Arizani yuborishda xatolik.");
      }
    } catch (e: any) {
      showToast(e.message || "Xatolik yuz berdi");
    }
  };

  const handleSendPickedChatMedia = async (file: File, kind: ChatMediaKind, caption?: string) => {
    if (!file || !selectedChatUser) return;
    setIsUploadingChatMedia(true);
    try {
      const res = await fetch(getApiUrl('/api/media/upload-raw'), {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name || `chat_media`),
        },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.url) {
        await handleSendChatMessage(kind, data.url, caption);
        setShowChatMediaPicker(false);
      } else {
        // Fallback to DataURL for tiny files if upload fails
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (typeof reader.result === 'string') {
            await handleSendChatMessage(kind, reader.result, caption);
            setShowChatMediaPicker(false);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      showToast(err?.message || "Media yuklashda xatolik yuz berdi");
    } finally {
      setIsUploadingChatMedia(false);
    }
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

  // Dashboard content inside Obsidian Midnight shell
  const dashboardContent = (
    <div className="h-full bg-[#09090D] text-[#F4F4F6] font-sans flex flex-col w-full relative overflow-hidden">
      {/* Subtle Ambient Rose Glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[540px] h-[180px] rounded-full bg-rose-600/10 blur-[90px]" />

      {/* Top Header */}
      <header className="shrink-0 bg-[#0D0F17]/92 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-5 h-14 flex items-center justify-between gap-2 z-40 overflow-hidden">
        <div
          className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0 cursor-pointer group"
          onClick={() => setActiveTab('discover')}
        >
          <img
            src="/assets/aistudio/image_e20a1307.webp"
            alt="Alov.uz Logo"
            className="w-7 h-7 rounded-xl object-cover border border-rose-500/35 shadow-sm shrink-0 group-hover:scale-105 transition-transform"
          />
          <span className="text-[16px] sm:text-[18px] font-bold font-editorial tracking-tight text-white whitespace-nowrap shrink-0">
            alov<span className="text-rose-500">.uz</span>
          </span>
          <span className="text-[10.5px] font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-500/25 whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="tabular-nums">{activeUsersCount}</span>
            <span className="hidden sm:inline">onlayn</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isAdminTelegramUser(currentUser) ? (
            <>
              <button
                onClick={() => setActiveTab('profile')}
                title="Admin Full Almaz & Moneta Balansi"
                className="sm:hidden flex items-center gap-1 bg-amber-500/10 border border-amber-400/30 text-amber-200 py-1 px-2 rounded-full text-[10px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>💎</span>
                <Coins className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Full</span>
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                title="Admin Full Almaz Balansi"
                className="hidden sm:flex items-center gap-1 bg-cyan-500/10 border border-cyan-400/25 text-cyan-200 py-1 px-2.5 rounded-full text-[10.5px] font-bold hover:bg-cyan-500/20 transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>💎</span>
                <span>Full</span>
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                title="Admin Full Moneta Balansi"
                className="hidden sm:flex items-center gap-1 bg-amber-500/10 border border-amber-400/25 text-amber-200 py-1 px-2.5 rounded-full text-[10.5px] font-bold hover:bg-amber-500/20 transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Coins className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Full</span>
              </button>
            </>
          ) : currentUser?.gender === 'female' ? (
            <button
              onClick={() => setShowWithdrawModal(true)}
              className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-400/25 text-cyan-200 py-1 px-2.5 rounded-full text-[10.5px] font-bold hover:bg-cyan-500/20 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              <span>💎</span>
              <span>{currentUser?.diamonds ?? 0}</span>
            </button>
          ) : (
            <button
              onClick={() => setShowTopUpModal(true)}
              data-testid="header-coin-shop-btn"
              title="Moneta Do'koni"
              className="flex items-center gap-1 bg-amber-500/12 border border-amber-400/30 text-amber-200 py-1 px-2.5 rounded-full text-[10.5px] font-bold hover:bg-amber-500/20 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              <Coins className="w-3 h-3 text-amber-400 shrink-0" />
              <span>{currentUser?.coins ?? 100}</span>
              <span className="hidden sm:inline text-amber-300 font-semibold">· Do'kon</span>
            </button>
          )}

          {isAdminTelegramUser(currentUser) && (
            <button
              onClick={() => setShowAdminPanel(true)}
              data-testid="header-admin-panel-btn"
              title="Admin Panel"
              className="flex items-center gap-1 bg-[#1B1E2B] hover:bg-[#252A3C] text-amber-300 py-1 px-2.5 rounded-full text-[10.5px] font-bold border border-amber-400/30 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Crown className="w-3 h-3 shrink-0" />
              <span>Admin</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('profile')}
            title="Profil"
            className="flex items-center gap-1.5 bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.1] p-0.5 sm:px-2 sm:py-1 rounded-full whitespace-nowrap shrink-0 transition cursor-pointer"
          >
            {(() => {
              const headerAvatar = resolveAvatarUrl(resolveEffectiveProfileAvatar(currentUser) || firebaseUser?.photoURL);
              const headerName = getSafeUserDisplayName(currentUser, firebaseUser?.displayName || 'Profil');
              return (
                <>
                  {headerAvatar ? (
                    <img
                      src={headerAvatar}
                      alt={headerName}
                      className="w-6 h-6 sm:w-5 sm:h-5 rounded-full object-cover shrink-0 border border-white/20"
                      onError={(e: any) => {
                        e.currentTarget.style.display = 'none';
                        const fallbackEl = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallbackEl) fallbackEl.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "w-6 h-6 sm:w-5 sm:h-5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold items-center justify-center shrink-0",
                      headerAvatar ? "hidden" : "flex"
                    )}
                  >
                    {headerName.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline text-[11px] font-semibold truncate max-w-[96px] text-zinc-100">{headerName}</span>
                </>
              );
            })()}
          </button>
          <button
            onClick={handleLogout}
            title="Chiqish"
            aria-label="Chiqish"
            className="p-1.5 rounded-full bg-white/[0.05] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/[0.08] shrink-0 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Scrollable Inner Viewport or Fixed-Height Reels / Map / Chat Container */}
      <div className={`flex-1 min-h-0 relative z-10 ${(activeTab === 'reels' || activeTab === 'map' || (activeTab === 'chats' && chatView === 'conversation')) ? 'overflow-hidden flex flex-col p-0' : 'overflow-y-auto overscroll-y-contain p-3 sm:p-5 space-y-4 pb-24'}`}>
        {/* --- LANDING TAB --- */}
        {activeTab === 'landing' && <LandingPage onLogin={() => openAuthModalClean('login')} />}

        {/* --- DISCOVER, POSTS, CHATS, PROFILE WITH SMOOTH ANIMATEPRESENCE --- */}
        {activeTab !== 'landing' && activeTab !== 'map' && activeTab !== 'reels' && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={activeTab === 'chats' ? 'h-full flex flex-col' : 'space-y-4'}
            >
              {/* --- DISCOVER TAB --- */}
              {activeTab === 'discover' && (
                <div className="space-y-4">
                  {/* Live Stream Go Live Promo Banner */}
                  <div className="relative overflow-hidden bg-gradient-to-r from-[#221118] via-[#171825] to-[#12141E] rounded-[22px] p-4 text-white border border-rose-500/25 shadow-[0_14px_36px_rgba(0,0,0,0.45)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/35 flex items-center justify-center shrink-0">
                        <Radio className="w-5 h-5 text-rose-400 animate-pulse" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-xs sm:text-sm tracking-wide text-white truncate">JONLI EFIR (LIVE)</h3>
                        <p className="text-[11px] text-zinc-400 truncate">Kamerangizni yoqing va barcha bilan muloqot qiling</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (!firebaseUser && !currentUser) {
                          openAuthModalClean('login');
                          return;
                        }
                        setLiveModalMode('broadcaster');
                        setShowLiveModal(true);
                      }}
                      className="bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:brightness-110 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-rose-950/50 shrink-0 transition active:scale-95 whitespace-nowrap cursor-pointer"
                    >
                      Efir boshlash
                    </button>
                  </div>

                  {/* Discover Header + Region Filter */}
                  <div className="bg-[#12141E] p-3.5 sm:p-4 rounded-[20px] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-editorial font-bold text-white leading-tight">Nomzodlar</h2>
                      <p className="text-[11.5px] text-zinc-400">Face ID bilan tasdiqlangan haqiqiy insonlar</p>
                    </div>
                    <select
                      value={filterRegion}
                      onChange={(e) => setFilterRegion(e.target.value)}
                      className="w-full sm:w-64 px-3.5 py-2.5 rounded-xl bg-[#181B29] border border-white/10 text-xs font-semibold text-zinc-100 outline-none focus:border-rose-500 cursor-pointer"
                    >
                      <option value="Barchasi" className="bg-[#12141E] text-white">Barcha viloyatlar</option>
                      {Object.keys(UZ_LOCATIONS).map((reg, idx) => (
                        <option key={`reg_opt1_${reg}_${idx}`} value={reg} className="bg-[#12141E] text-white">{reg}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {isLoadingCandidates ? (
                      <>
                        <CandidateSkeleton />
                        <CandidateSkeleton />
                        <CandidateSkeleton />
                        <CandidateSkeleton />
                      </>
                    ) : filteredCandidates.length === 0 ? (
                      <div className="col-span-full p-8 text-center bg-[#12141E] rounded-[24px] border border-white/[0.08] space-y-3">
                        <div className="w-12 h-12 bg-white/[0.05] text-rose-400 rounded-full flex items-center justify-center mx-auto border border-white/10">
                          <Users className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-white">Ushbu filtr bo'yicha nomzodlar topilmadi</h4>
                        <p className="text-xs text-zinc-400">Filtrni tozalab barcha viloyatdagi nomzodlarni ko'rishingiz mumkin.</p>
                        <button
                          onClick={() => {
                            setFilterRegion('Barchasi');
                            setFilterDistrict('Barchasi');
                            setSearchQuery('');
                          }}
                          className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition active:scale-95 cursor-pointer"
                        >
                          Barcha nomzodlarni ko'rish
                        </button>
                      </div>
                    ) : filteredCandidates.map((user, idx) => {
                      const candidateAvatar = resolveAvatarUrl(resolveEffectiveProfileAvatar(user));
                      const candidateName = getSafeUserDisplayName(user, user.name || 'Foydalanuvchi');
                      const faceVerified = Boolean(user.faceId?.verified);
                      const detectedGender = user.gender || user.faceId?.detectedGender;
                      const genderLabel = genderToUzLabel(detectedGender);
                      const isOnline = isUserOnlineStrict(user, onlineUserIds);
                      const ageVal = calculateAge(user.birthDate, user.age);
                      return (
                        <motion.div
                          key={user.uid ? `${user.uid}_${idx}` : `${user.id}_${idx}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, delay: Math.min(idx * 0.03, 0.24) }}
                          className="bg-[#12141E] rounded-[22px] p-2.5 flex flex-col justify-between gap-2.5 border border-white/[0.08] hover:border-rose-500/35 hover:bg-[#161925] transition-colors group"
                        >
                          <button
                            type="button"
                            onClick={() => openUserProfileByUid(user.uid || user.id, user)}
                            aria-label={`${candidateName} profilini ochish`}
                            className="relative aspect-[3/4] w-full rounded-[16px] overflow-hidden bg-[#181B29] block text-left focus:outline-none focus:ring-2 focus:ring-rose-500/50 cursor-pointer"
                          >
                            {candidateAvatar ? (
                              <img
                                src={candidateAvatar}
                                alt={candidateName}
                                className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                                onError={(e: any) => {
                                  e.currentTarget.style.display = 'none';
                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              className={cn(
                                "w-full h-full items-center justify-center bg-gradient-to-br from-[#231822] to-[#151826] text-rose-400 font-editorial font-black text-3xl",
                                candidateAvatar ? "hidden" : "flex"
                              )}
                            >
                              {candidateName.charAt(0).toUpperCase()}
                            </div>

                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                            {user.isLive ? (
                              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-600/95 text-white text-[9px] font-bold flex items-center gap-1 shadow-md">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                <span>LIVE</span>
                              </div>
                            ) : faceVerified ? (
                              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-md text-emerald-300 text-[9px] font-semibold flex items-center gap-1 border border-emerald-400/30">
                                <ScanFace className="w-2.5 h-2.5" />
                                <span>Tasdiqlangan</span>
                              </div>
                            ) : null}

                            <div
                              className={cn(
                                "absolute bottom-2 left-2 px-2 py-0.5 rounded-full backdrop-blur-md text-[9px] font-semibold flex items-center gap-1 border text-white",
                                isOnline
                                  ? "bg-emerald-600/85 border-emerald-300/30"
                                  : "bg-black/60 border-white/15 text-zinc-300"
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-white animate-pulse" : "bg-zinc-400")} />
                              <span>{isOnline ? "Onlayn" : "Oflayn"}</span>
                            </div>
                          </button>

                          <div className="min-w-0 px-0.5 space-y-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <h3 className="text-[14px] font-bold font-editorial text-white truncate">
                                {candidateName}, {ageVal}
                              </h3>
                              {faceVerified && (
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {[user.district || user.region, genderLabel, faceVerified ? `${user.faceId?.confidence ?? 95}%` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>

                          {user.isLive && (
                            <button
                              onClick={() => {
                                setActiveLiveHostUser(user);
                                setActiveLiveStreamId(user.liveStreamId || ('stream_' + (user.uid || user.id)));
                                setLiveModalMode('viewer');
                                setShowLiveModal(true);
                              }}
                              className="w-full py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-[10.5px] flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                            >
                              <Radio className="w-3 h-3 animate-pulse" />
                              <span>Efirni ko'rish</span>
                            </button>
                          )}

                          <div className="flex gap-1.5 pt-0.5">
                            <button
                              onClick={() => openUserProfileByUid(user.uid || user.id, user)}
                              className="flex-1 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-zinc-200 font-semibold text-[11px] border border-white/[0.08] transition active:scale-95 cursor-pointer"
                            >
                              Profil
                            </button>
                            <button
                              onClick={() => openChatWithUser(user)}
                              className="flex-1 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-[11px] transition active:scale-95 cursor-pointer"
                            >
                              Chat
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* --- POSTS / LENTA TAB --- */}
              {activeTab === 'posts' && (
                <div className="space-y-4">
                  <div className="bg-[#12141E] p-4 sm:p-5 rounded-[22px] border border-white/[0.08] flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-editorial font-bold text-white">Postlar</h2>
                      <p className="text-[11.5px] text-zinc-400">Rasm, video va musiqiy lahzalar bilan bo'lishing</p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-400 tabular-nums shrink-0">
                      {postsList.length} ta post
                    </span>
                  </div>

                  <PostsFeed
                    posts={postsList}
                    currentUser={currentUser}
                    usersList={usersList}
                    onlineUserIds={onlineUserIds}
                    allowCompose={true}
                    onPostCreated={(post) =>
                      setPostsList((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]))
                    }
                    onPostUpdated={(post) =>
                      setPostsList((prev) => prev.map((p) => (p.id === post.id ? post : p)))
                    }
                    onPostDeleted={(postId) =>
                      setPostsList((prev) => prev.filter((p) => p.id !== postId))
                    }
                    onOpenProfile={openUserProfileByUid}
                    onOpenAuth={() => openAuthModalClean('login')}
                    onNotify={showToast}
                  />
                </div>
              )}

              {/* --- CHATS TAB --- */}
              {activeTab === 'chats' && (
                <div className="h-full flex flex-col">
                  {chatView === 'list' ? (
                    <div className="bg-[#11131C] rounded-[24px] border border-white/[0.08] overflow-hidden flex flex-col h-full min-h-0">
                      <div className="p-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
                        <h2 className="font-editorial text-2xl font-bold text-white">Xabarlar</h2>
                        <span className="text-xs font-semibold text-zinc-400 tabular-nums" data-testid="chats-count-badge">
                          {chatsList.length} faol suhbat
                        </span>
                      </div>
                      <div className="flex-1 min-h-0 divide-y divide-white/[0.06] overflow-y-auto pb-24" data-testid="chats-list-scroll-area">
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
                              Hozircha xabarlar yo'q. Nomzodlar bilan suhbatni boshlang!
                            </p>
                          </div>
                        ) : chatsList.map((chat, idx) => {
                          const myUid = currentUser?.uid || firebaseUser?.uid;
                          const otherUid = chat.participants?.find((p: string) => p !== myUid) || chat.partner?.uid || chat.partner?.id;
                          const otherUser = usersList.find(u => u.uid === otherUid || u.id === otherUid) ||
                                            (otherUid === ALOV_AI_USER.uid ? ALOV_AI_USER : null) ||
                                            chat.partner ||
                                            { uid: otherUid, name: 'Foydalanuvchi' };
                          const unread = chat.unreadCount?.[myUid || ''] || 0;
                          const chatAvatar = resolveAvatarUrl(resolveEffectiveProfileAvatar(otherUser));

                          return (
                            <motion.div
                              key={chat.id ? `${chat.id}_${idx}` : `chat_${idx}`}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.16, delay: Math.min(idx * 0.025, 0.2) }}
                              onClick={() => {
                                setSelectedChatUser(otherUser);
                                setChatView('conversation');
                                setChatsList(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: { ...(c.unreadCount || {}), [myUid || '']: 0 } } : c));
                              }}
                              className={cn(
                                "p-4 flex items-center space-x-3 cursor-pointer hover:bg-white/[0.04] transition-colors relative",
                                chat.isAI && "bg-rose-500/[0.06]"
                              )}
                            >
                              <div className="relative">
                                {chatAvatar ? (
                                  <img src={chatAvatar} alt={otherUser?.name || ''} className="w-12 h-12 rounded-full object-cover shrink-0 border border-white/15" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-300 font-bold text-base flex items-center justify-center shrink-0 border border-rose-500/30">
                                    {getSafeUserDisplayName(otherUser, 'F').charAt(0).toUpperCase()}
                                  </div>
                                )}
                                {isUserOnlineStrict(otherUser, onlineUserIds) && (
                                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#11131C] rounded-full"></span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center space-x-1.5 min-w-0">
                                    <h4 className="font-bold text-sm text-white truncate">{otherUser?.name || 'Foydalanuvchi'}</h4>
                                    {chat.isAI && <span className="text-[10px] font-bold text-rose-400 shrink-0">· AI</span>}
                                  </div>
                                  <span className="text-[10.5px] text-zinc-500 tabular-nums shrink-0">
                                    {chat.updatedAt?.toDate ? chat.updatedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-0.5">
                                  <p className={cn("text-xs truncate flex-1 pr-2", unread > 0 ? "text-white font-semibold" : "text-zinc-400")}>
                                    {chat.isTyping?.[otherUid] || (chat.isAI && isAiTyping) ? (
                                      <span className="text-emerald-400 font-semibold">yozmoqda...</span>
                                    ) : chat.lastMessage}
                                  </p>
                                  {unread > 0 && (
                                    <span className="bg-rose-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 tabular-nums">
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
                    <div className="flex-1 min-h-0 w-full bg-[#09090D] flex flex-col overflow-hidden">
                      <div className="shrink-0 z-20 px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between bg-[#11131C]">
                        <div className="flex items-center space-x-2 min-w-0">
                          <button onClick={() => setChatView('list')} className="p-2 rounded-full hover:bg-white/[0.08] text-zinc-200 transition active:scale-90 shrink-0 cursor-pointer">
                            <ArrowLeft className="w-5 h-5" />
                          </button>
                          {(() => {
                            const partnerOnline = isUserOnlineStrict(selectedChatUser, onlineUserIds);
                            const partnerUid = selectedChatUser?.uid || selectedChatUser?.id;
                            const partnerAvatar = resolveAvatarUrl(resolveEffectiveProfileAvatar(selectedChatUser));
                            return (
                              <button
                                type="button"
                                onClick={() => partnerUid && openUserProfileByUid(partnerUid, selectedChatUser)}
                                className="flex items-center space-x-2.5 min-w-0 text-left hover:opacity-85 transition cursor-pointer"
                                title="Profilni ko'rish"
                              >
                                <div className="relative shrink-0">
                                  {partnerAvatar ? (
                                    <img src={partnerAvatar} alt={selectedChatUser?.name || ''} className="w-9 h-9 rounded-full object-cover border border-white/15" />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-rose-500/20 text-rose-300 font-bold text-sm flex items-center justify-center border border-rose-500/30">
                                      {getSafeUserDisplayName(selectedChatUser, 'F').charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  {partnerOnline && (
                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#11131C] rounded-full"></span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-sans font-bold text-sm text-white leading-none truncate">{selectedChatUser?.name}</h3>
                                  <p className={cn("text-[10.5px] mt-1", partnerOnline ? "text-emerald-400 font-semibold" : "text-zinc-400")}>
                                    {partnerOnline ? 'tarmoqda' : formatLastSeenUz(selectedChatUser?.lastSeen, false)}
                                  </p>
                                </div>
                              </button>
                            );
                          })()}
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
                                  title={isFriendActive ? `Do'stlashishni bekor qilish (${MESSAGE_COIN_COST} moneta yechiladi)` : "Do'stlashish — yigitdan moneta yechilmaydi"}
                                  className={cn(
                                    "px-2.5 py-1.5 rounded-full text-[10px] font-bold flex items-center space-x-1 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer",
                                    isFriendActive
                                      ? "bg-emerald-600 text-white"
                                      : "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
                                  )}
                                >
                                  <Handshake className="w-3.5 h-3.5" />
                                  <span>{isFriendActive ? "Do'stlashilgan" : "Do'stlashish"}</span>
                                </button>
                              );
                            }
                            return null;
                          })()}
                          <button
                            onClick={() => setShowGiftModal(true)}
                            title="Sovg'a yuborish"
                            className="p-2 rounded-full hover:bg-amber-500/15 text-amber-400 transition active:scale-90 cursor-pointer"
                          >
                            <Gift className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              if (selectedChatUser) {
                                setActiveCallUser(selectedChatUser);
                              }
                            }}
                            title="Video qo'ng'iroq"
                            className="p-2 rounded-full hover:bg-rose-500/15 text-rose-400 transition active:scale-90 cursor-pointer"
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
                            <div className="bg-emerald-500/15 border-b border-emerald-500/25 text-emerald-200 px-3.5 py-1.5 text-[10.5px] font-semibold flex items-center justify-between shrink-0">
                              <span>Do'stlashish faol — Yigitdan moneta yechilmaydi</span>
                              <span className="text-emerald-300 font-bold whitespace-nowrap">Bepul chat</span>
                            </div>
                          );
                        }
                        if (currentUser?.gender === 'female') {
                          return (
                            <div className="bg-cyan-500/10 border-b border-cyan-500/20 text-cyan-200 px-3.5 py-1.5 text-[10.5px] font-semibold flex items-center justify-between shrink-0">
                              <span>💎 Har bir javobingiz uchun +{MESSAGE_DIAMOND_REWARD} Almaz limitga qo'shiladi</span>
                              <span className="font-mono text-cyan-300 font-bold whitespace-nowrap tabular-nums">Wallet: {formatDiamondsDisplay(currentUser?.diamonds)}</span>
                            </div>
                          );
                        }
                        if (!isAIBotChat) {
                          return (
                            <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-200 px-3.5 py-1.5 text-[10.5px] font-semibold flex items-center justify-between shrink-0">
                              <span>🪙 Har bir xabar narxi: {MESSAGE_COIN_COST} Moneta</span>
                              <span className="font-mono text-amber-300 font-bold whitespace-nowrap tabular-nums">Balans: {currentUser?.coins ?? 100}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      <div ref={chatMessagesContainerRef} className="flex-1 min-h-0 px-3.5 py-3 overflow-y-auto overscroll-y-contain space-y-2.5 bg-[#09090D] [-webkit-overflow-scrolling:touch]">
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
                                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  transition={{ duration: 0.16 }}
                                  className={cn("flex", isMe ? 'justify-end' : 'justify-start')}
                                >
                                  <div className={cn(
                                    "max-w-[85%] rounded-[18px] px-4 py-2.5 relative",
                                    isMe
                                      ? 'bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white rounded-tr-none shadow-md shadow-rose-950/30'
                                      : 'bg-[#151824] text-zinc-100 border border-white/[0.08] rounded-tl-none'
                                  )}>
                                    {msg.type === 'gift' ? (
                                      <div className="flex items-center space-x-2.5 py-1">
                                        <span className="text-3xl shrink-0">{msg.giftIcon || '🎁'}</span>
                                        <div>
                                          <p className="font-bold text-xs">{msg.giftName || "Sovg'a"} yuborildi!</p>
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
                                      <img src={msg.fileUrl} alt="" className="rounded-lg max-h-60 object-cover" />
                                    ) : msg.type === 'video' ? (
                                      <VideoPlayer url={msg.fileUrl || ''} />
                                    ) : (msg.type === 'voice' || msg.type === 'audio') ? (
                                      <VoiceMessage url={msg.fileUrl || ''} senderId={isMe ? 'me' : msg.senderId} />
                                    ) : (
                                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                                    )}
                                    <div className="flex items-center justify-end space-x-1 mt-1">
                                      <span className={cn("text-[9.5px] tabular-nums", isMe ? 'text-rose-100/80' : 'text-zinc-500')}>
                                        {msg.time}
                                      </span>
                                      {isMe && (
                                        <div className="flex items-center ml-1 shrink-0">
                                          {msg.status === 'sending' ? (
                                            <Clock className="w-3 h-3 text-rose-200/90 animate-pulse" />
                                          ) : (msg.status === 'read' || msg.read) ? (
                                            <CheckCheck className="w-3.5 h-3.5 text-cyan-200 font-bold" />
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
                          <div ref={chatBottomRef} />

                          {isOtherTyping || (selectedChatUser?.uid === ALOV_AI_USER.uid && isAiTyping) ? (
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex justify-start"
                            >
                              <div className="bg-[#151824] border border-white/[0.08] text-zinc-400 rounded-[18px] rounded-tl-none px-4 py-2 flex items-center space-x-2">
                                <span className="text-[11px] font-semibold">{selectedChatUser?.uid === ALOV_AI_USER.uid ? 'Alov AI yozmoqda' : 'yozmoqda'}</span>
                                <div className="flex space-x-1">
                                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1 h-1 bg-zinc-400 rounded-full" />
                                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-zinc-400 rounded-full" />
                                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-zinc-400 rounded-full" />
                                </div>
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>

                      {(() => {
                        const progressVal = Number(currentUser?.diamondProgress || 0);
                        const progressPct = getDiamondProgressPercent(progressVal);
                        const pendingBatches = Array.isArray(currentUser?.pendingDiamondBatches) ? currentUser.pendingDiamondBatches : [];
                        const pendingTotal = getPendingDiamondsTotal(pendingBatches);
                        const nextUnlockAt = getNextUnlockTimestamp(pendingBatches);
                        const countdown = computeCountdownParts(nextUnlockAt, countdownNow);

                        if (currentUser?.gender === 'female') {
                          return (
                            <div className="bg-[#11131C] border-t border-white/[0.08] px-3.5 pt-2 pb-1.5 shrink-0 space-y-1">
                              <div className="flex items-center justify-between text-[10.5px] font-bold">
                                <span className="text-zinc-300 flex items-center gap-1">
                                  <span>💎 Kunlik limit ({DAILY_LIMIT_WINDOW_HOURS} soat):</span>
                                  <span className="text-cyan-300 tabular-nums">{formatDiamondsDisplay(progressVal)} / {DIAMOND_LIMIT_TARGET}</span>
                                </span>
                                <span className="text-emerald-400 tabular-nums">{progressPct}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500 rounded-full"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              {pendingTotal > 0 && (
                                <div className="flex items-center justify-between text-[10px] font-semibold text-amber-200 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-400/20">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 shrink-0 text-amber-400" />
                                    <span>{formatDiamondsDisplay(pendingTotal)} 💎 (limit to'lmasa ham) {DIAMOND_UNLOCK_HOURS} soatda hamyonga tushadi</span>
                                  </span>
                                  <span className="font-mono font-bold text-amber-300 tabular-nums">{countdown.formatted}</span>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}

                      <div className="shrink-0 z-20 px-3 pt-2 pb-2.5 pb-safe bg-[#11131C] border-t border-white/[0.08] flex flex-col">
                        <ChatMediaPicker
                          isOpen={showChatMediaPicker}
                          onToggleOpen={() => setShowChatMediaPicker((prev) => !prev)}
                          onSendMedia={handleSendPickedChatMedia}
                          isUploading={isUploadingChatMedia}
                        />
                        <div className="flex items-end space-x-2 w-full">
                        <button
                          type="button"
                          onClick={() => setShowChatMediaPicker((prev) => !prev)}
                          aria-label="Media yuklash"
                          data-testid="toggle-chat-media-picker"
                          className={cn(
                            "p-2.5 rounded-full transition active:scale-90 cursor-pointer shrink-0",
                            showChatMediaPicker
                              ? "bg-rose-500/20 text-rose-400"
                              : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
                          )}
                        >
                          <Plus className={cn("w-5 h-5 transition-transform", showChatMediaPicker && "rotate-45")} />
                        </button>
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
                            className="w-full px-4 py-2.5 rounded-[20px] bg-[#181B29] border border-white/[0.08] text-[13px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-500 resize-none max-h-32"
                          />
                        </div>
                        {inputMessage.trim() ? (
                          <button
                            onClick={() => handleSendChatMessage()}
                            className="bg-[#E11D48] text-white p-3 rounded-full shadow-lg hover:bg-[#BE123C] transition-all active:scale-95 flex items-center justify-center cursor-pointer"
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
                              "p-3 rounded-full transition-all active:scale-95 flex items-center justify-center cursor-pointer",
                              isRecording ? "bg-red-600 text-white animate-pulse" : "bg-white/[0.07] text-zinc-300 hover:bg-white/[0.12]"
                            )}
                          >
                            <Mic className="w-5 h-5" />
                          </button>
                        )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- PROFILE TAB (Editorial Obsidian Dating Profile) --- */}
              {activeTab === 'profile' && (() => {
                const profileAvatar = resolveAvatarUrl(resolveEffectiveProfileAvatar(currentUser) || firebaseUser?.photoURL);
                const profileName = getSafeUserDisplayName(currentUser, firebaseUser?.displayName || 'Profil');
                const isAdmin = isAdminTelegramUser(currentUser);
                const locationText = [currentUser?.district, currentUser?.region].filter(Boolean).join(', ') || "O'zbekiston";
                const profileBanner = resolveAvatarUrl(currentUser?.banner);
                const followersCount = Array.isArray(currentUser?.followers)
                  ? currentUser.followers.length
                  : (currentUser?.followersCount ?? 0);
                const followingCount = Array.isArray(currentUser?.following)
                  ? currentUser.following.length
                  : (currentUser?.followingCount ?? 0);
                const totalLikesCount = Math.max(
                  Number(currentUser?.likesCount || 0),
                  computeAuthorTotalLikes(postsList, currentUser?.uid)
                );
                const openEditProfileModal = () => {
                  setErrorMsg('');
                  setRegName(getSafeUserDisplayName(currentUser, currentUser?.name || ''));
                  setRegUsername(currentUser?.username || '');
                  setRegBirthDate(currentUser?.birthDate || '2002-05-15');
                  setRegAge(String(currentUser?.age || calculateAge(currentUser?.birthDate, 22)));
                  setRegGender(
                    currentUser?.gender === 'male' || currentUser?.gender === 'female'
                      ? currentUser.gender
                      : ''
                  );
                  setRegRegion(currentUser?.region || 'Toshkent shahri');
                  setRegDistrict(currentUser?.district || 'Yunusobod tumani');
                  setRegNeighborhood(currentUser?.neighborhood || '');
                  setRegPhone(formatPhoneNumberPretty(currentUser?.phone || '+998 '));
                  setRegTelegram(currentUser?.telegram || '');
                  setRegInstagram(currentUser?.instagram || '');
                  setRegBio(currentUser?.bio || '');
                  setRegAvatar(resolveEffectiveProfileAvatar(currentUser));
                  setRegBanner(currentUser?.banner || '');
                  setRegLocationVisibility(currentUser?.locationVisibility || 'everyone');
                  setShowProfileModal(true);
                };

                return (
                  <div className="space-y-4">
                    {/* Editorial Profile Hero Card */}
                    <div className="bg-[#12141E] rounded-[28px] border border-white/[0.08] overflow-hidden">
                      {/* Cover Banner */}
                      <div className="relative h-40 sm:h-52 bg-gradient-to-br from-[#27121C] via-[#1B1726] to-[#11131C] border-b border-white/[0.08] overflow-hidden">
                        {profileBanner ? (
                          <img
                            src={profileBanner}
                            alt={`${profileName} banneri`}
                            className="w-full h-full object-cover object-center"
                            onError={(e: any) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center pointer-events-none">
                            <div className="text-center opacity-50">
                              <ImageIcon className="w-8 h-8 text-rose-400 mx-auto mb-1" />
                              <p className="text-[11px] font-semibold text-zinc-400">Profil banneri uchun joy</p>
                            </div>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#12141E] via-black/25 to-black/30 pointer-events-none" />

                        <div className="absolute top-3.5 left-4 right-4 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-emerald-300 text-[10.5px] font-semibold border border-emerald-400/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Onlayn</span>
                          </span>

                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border border-white/15 text-[11px] font-semibold transition active:scale-95">
                              <Camera className="w-3.5 h-3.5 text-rose-400" />
                              <span>{isUploadingBanner ? 'Yuklanmoqda...' : 'Banner'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                disabled={isUploadingBanner}
                                onChange={(e) => handleBannerFileChange(e, true)}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={openEditProfileModal}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border border-white/15 text-[11px] font-semibold transition active:scale-95 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-rose-400" />
                              <span>Tahrirlash</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="px-5 sm:px-7 pb-6">
                        <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 sm:-mt-14 relative z-10">
                          <div className="relative shrink-0 self-start">
                            {profileAvatar ? (
                              <img
                                src={profileAvatar}
                                alt={profileName}
                                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-[#12141E] shadow-xl bg-[#181B29]"
                                onError={(e: any) => {
                                  e.currentTarget.style.display = 'none';
                                  const fallbackEl = e.currentTarget.nextElementSibling as HTMLElement | null;
                                  if (fallbackEl) fallbackEl.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              className={cn(
                                "w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#1C1F2E] text-rose-400 font-editorial font-black text-3xl items-center justify-center border-4 border-[#12141E] shadow-xl",
                                profileAvatar ? "hidden" : "flex"
                              )}
                            >
                              {profileName.charAt(0).toUpperCase()}
                            </div>
                            {currentUser?.faceId?.verified && (
                              <span
                                title="Face ID Tasdiqlangan"
                                className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-emerald-600 text-white border-2 border-[#12141E] flex items-center justify-center shadow-sm"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 sm:pb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h1 className="text-2xl sm:text-[28px] font-editorial font-bold text-white leading-tight truncate">
                                {profileName}
                              </h1>
                              {currentUser?.username && (
                                <span className="font-mono text-xs font-semibold text-rose-400 shrink-0">
                                  {formatUsernameDisplay(currentUser.username)}
                                </span>
                              )}
                              {isAdmin ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/25 text-[10px] font-bold shrink-0">
                                  <Crown className="w-3 h-3" />
                                  <span>Admin</span>
                                </span>
                              ) : currentUser?.faceId?.verified ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/25 text-[10px] font-semibold shrink-0">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Face ID</span>
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-400">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                                <span>{locationText}</span>
                              </span>
                              <span className="text-zinc-600">·</span>
                              <span>{genderToUzLabel(currentUser?.gender || currentUser?.faceId?.detectedGender)}</span>
                              <span className="text-zinc-600">·</span>
                              <span className="font-mono text-[11px] tabular-nums text-zinc-500">ID: {currentUser?.id}</span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-4 text-[13.5px] text-zinc-300 leading-relaxed max-w-2xl">
                          {currentUser?.bio || "Alov.uz platformasida samimiy tanishuvlar va yangi suhbatlar."}
                        </p>

                        {/* Hairline-divided Interactive Stats Row */}
                        <div className="mt-5 pt-4 border-t border-white/[0.08] grid grid-cols-3 divide-x divide-white/[0.08] text-center">
                          <button
                            type="button"
                            onClick={() => setFollowModalState({ user: currentUser, tab: 'followers' })}
                            className="px-2 py-1.5 rounded-xl hover:bg-white/[0.04] transition group cursor-pointer"
                          >
                            <p className="text-lg sm:text-xl font-black tabular-nums text-white group-hover:text-rose-400 transition">{followersCount}</p>
                            <p className="text-[11px] font-medium text-zinc-400 mt-0.5">Obunachilar</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFollowModalState({ user: currentUser, tab: 'following' })}
                            className="px-2 py-1.5 rounded-xl hover:bg-white/[0.04] transition group cursor-pointer"
                          >
                            <p className="text-lg sm:text-xl font-black tabular-nums text-white group-hover:text-rose-400 transition">{followingCount}</p>
                            <p className="text-[11px] font-medium text-zinc-400 mt-0.5">Obunalar</p>
                          </button>
                          <div className="px-2 py-1.5">
                            <p className="text-lg sm:text-xl font-black tabular-nums text-rose-400">{totalLikesCount}</p>
                            <p className="text-[11px] font-medium text-zinc-400 mt-0.5">Laiklar</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Balanced 2-Column Account & Privacy Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left Card: Balans & Biometrik Tasdiq */}
                      <div className="bg-[#12141E] rounded-[24px] border border-white/[0.08] p-5 flex flex-col justify-between gap-4">
                        <div className="space-y-3.5">
                          <div className="flex items-center justify-between">
                            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                              Balans va Biometrik Tasdiq
                            </h2>
                            {isAdmin && (
                              <span className="text-[10.5px] font-bold text-amber-300">Cheksiz</span>
                            )}
                          </div>

                          {isAdmin ? (
                            <div className="rounded-2xl bg-gradient-to-br from-[#1C1722] to-[#171A26] text-white p-4 space-y-3 border border-amber-400/25">
                              <div className="grid grid-cols-2 gap-3 divide-x divide-white/10">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Almaz Wallet</p>
                                  <p className="text-base font-black tabular-nums mt-0.5">💎 Full</p>
                                  <p className="text-[10.5px] text-zinc-400 font-mono tabular-nums">
                                    {(currentUser?.diamonds ?? ADMIN_FULL_DIAMONDS).toLocaleString()}
                                  </p>
                                </div>
                                <div className="pl-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Moneta</p>
                                  <p className="text-base font-black tabular-nums mt-0.5">🪙 Full</p>
                                  <p className="text-[10.5px] text-zinc-400 font-mono tabular-nums">
                                    {(currentUser?.coins ?? ADMIN_FULL_COINS).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-300">
                                <span className="inline-flex items-center gap-1.5">
                                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Admin tezkor kirishi faol</span>
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between py-2 border-b border-white/[0.07]">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                                    <Wallet className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-white">
                                      {currentUser?.gender === 'female' ? 'Almaz Wallet' : 'Moneta Balansi'}
                                    </p>
                                    <p className="text-[11px] text-zinc-400 tabular-nums">
                                      {currentUser?.gender === 'female'
                                        ? `${formatDiamondsDisplay(currentUser?.diamonds)} olmos mavjud`
                                        : `${currentUser?.coins ?? 100} moneta mavjud`}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    currentUser?.gender === 'female' ? setShowWithdrawModal(true) : setShowTopUpModal(true)
                                  }
                                  data-testid="profile-wallet-action-btn"
                                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white text-[11px] font-bold transition cursor-pointer"
                                >
                                  {currentUser?.gender === 'female' ? 'Chiqarish' : "Do'kon"}
                                </button>
                              </div>

                              {currentUser?.gender === 'female' && (() => {
                                const progressVal = Number(currentUser?.diamondProgress || 0);
                                const progressPct = getDiamondProgressPercent(progressVal);
                                const pendingTotal = getPendingDiamondsTotal(currentUser?.pendingDiamondBatches);
                                const nextUnlockAt = getNextUnlockTimestamp(currentUser?.pendingDiamondBatches);
                                const countdown = computeCountdownParts(nextUnlockAt, countdownNow);
                                return (
                                  <div className="space-y-1.5 pb-2 border-b border-white/[0.07]">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-zinc-200">
                                      <span>Kunlik olmos limiti ({DAILY_LIMIT_WINDOW_HOURS} soat)</span>
                                      <span className="tabular-nums text-cyan-300">{formatDiamondsDisplay(progressVal)} / {DIAMOND_LIMIT_TARGET} ({progressPct}%)</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                                        style={{ width: `${progressPct}%` }}
                                      />
                                    </div>
                                    <p className="text-[10px] text-zinc-400">
                                      24 soatlik limit to'lmagan bo'lsa ham, yig'ilgan olmoslar {DIAMOND_UNLOCK_HOURS} soat ichida hamyoningizga tushadi.
                                    </p>
                                    {pendingTotal > 0 && (
                                      <p className="text-[10.5px] font-semibold text-amber-300 flex items-center justify-between">
                                        <span>Walletga qo'shilish vaqti ({formatDiamondsDisplay(pendingTotal)} olmos):</span>
                                        <span className="font-mono font-bold tabular-nums">{countdown.formatted}</span>
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Face ID Biometric Status Row */}
                              {currentUser?.faceId?.verified ? (
                                <div className="flex items-center justify-between gap-2 pt-0.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                                      <ScanFace className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-white">Face ID Tasdiqlangan</p>
                                      <p className="text-[11px] text-zinc-400 truncate">
                                        {genderToUzLabel(currentUser.gender || currentUser.faceId.detectedGender)} · {currentUser.faceId.confidence ?? 95}%
                                        {currentUser.faceId.verifiedAt ? ` · ${formatFaceIdDateUz(currentUser.faceId.verifiedAt)}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-[11px] font-semibold text-emerald-400 shrink-0">
                                    Faol
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2 pt-0.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                                      <ScanFace className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-white">Face ID kutilmoqda</p>
                                      <p className="text-[11px] text-zinc-400">Haqiqiy surat va jinsni tasdiqlang</p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setShowProfileFaceIdModal(true)}
                                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition shrink-0 cursor-pointer"
                                  >
                                    Tasdiqlash
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setShowAdminPanel(true)}
                            className="w-full py-2.5 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-200 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer"
                          >
                            <Crown className="w-3.5 h-3.5" />
                            <span>Admin Panelni Ochish (@Salikh_07)</span>
                          </button>
                        )}
                      </div>

                      {/* Right Card: Maxfiylik va Lokatsiya */}
                      <div className="bg-[#12141E] rounded-[24px] border border-white/[0.08] p-5 flex flex-col justify-between gap-3">
                        <div>
                          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400 mb-3">
                            Maxfiylik va Lokatsiya
                          </h2>

                          <div className="divide-y divide-white/[0.07]">
                            <div className="py-2.5 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${isLocationEnabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                  <span>Jonli GPS Lokatsiya</span>
                                </p>
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  {isLocationEnabled ? 'Koordinatalaringiz real vaqtda faol' : 'Xaritada vaqtincha yashirilgan'}
                                </p>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={isLocationEnabled}
                                aria-label="Jonli GPS lokatsiya"
                                onClick={() => handleToggleLocation(!isLocationEnabled)}
                                className={`w-11 h-6 rounded-full transition-colors duration-200 p-0.5 flex items-center shrink-0 cursor-pointer ${
                                  isLocationEnabled ? 'bg-rose-600 justify-end' : 'bg-white/15 justify-start'
                                }`}
                              >
                                <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                              </button>
                            </div>

                            <div className="py-2.5 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white">Kimlarga ko'rinadi</p>
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  {regLocationVisibility === 'mutual'
                                    ? 'Faqat obunachilarga'
                                    : regLocationVisibility === 'everyone'
                                    ? 'Barcha foydalanuvchilarga'
                                    : 'Hech kimga (Yashirin)'}
                                </p>
                              </div>
                              <select
                                aria-label="Lokatsiya maxfiyligi"
                                value={regLocationVisibility}
                                onChange={(e) => handleLocationVisibilityChange(e.target.value as any)}
                                className="px-2.5 py-1.5 rounded-xl bg-[#181B29] border border-white/10 text-[11px] font-bold text-zinc-100 outline-none focus:border-rose-500 cursor-pointer"
                              >
                                <option value="everyone" className="bg-[#12141E] text-white">Barchaga ochiq</option>
                                <option value="mutual" className="bg-[#12141E] text-white">Faqat tanishlar</option>
                                <option value="ghost" className="bg-[#12141E] text-white">Yashirin</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={openEditProfileModal}
                          className="w-full py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-white border border-white/[0.1] font-bold text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Anketa ma'lumotlarini tahrirlash</span>
                        </button>
                      </div>
                    </div>

                    {/* Own Posts Section */}
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between px-1">
                        <h2 className="text-base sm:text-lg font-editorial font-bold text-white">
                          Mening postlarim
                        </h2>
                        <span className="text-[11px] font-medium text-zinc-400">
                          Rasm, video va musiqa ulashing
                        </span>
                      </div>
                      <PostsFeed
                        posts={postsList}
                        currentUser={currentUser}
                        usersList={usersList}
                        onlineUserIds={onlineUserIds}
                        authorUid={currentUser?.uid}
                        allowCompose={true}
                        onPostCreated={(post) =>
                          setPostsList((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]))
                        }
                        onPostUpdated={(post) =>
                          setPostsList((prev) => prev.map((p) => (p.id === post.id ? post : p)))
                        }
                        onPostDeleted={(postId) =>
                          setPostsList((prev) => prev.filter((p) => p.id !== postId))
                        }
                        onOpenProfile={openUserProfileByUid}
                        onOpenAuth={() => openAuthModalClean('login')}
                        onNotify={showToast}
                      />
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </AnimatePresence>
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
                  <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center text-white bg-[#09090D] space-y-4">
                    <button onClick={() => setActiveTab('discover')} className="absolute top-4 left-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white transition cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                    <div className="w-16 h-16 rounded-full bg-rose-600/20 border border-rose-500/40 flex items-center justify-center animate-pulse">
                      <Radio className="w-8 h-8 text-rose-500" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-editorial font-bold">Hozirda jonli efirlar mavjud emas</h3>
                      <p className="text-xs text-zinc-400 max-w-xs">
                        Faqat "Efirni boshlash" tugmasini bosgan foydalanuvchilar shu yerda ko'rinadi. Birinchi bo'lib efir boshlang!
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!firebaseUser && !currentUser) {
                          openAuthModalClean('login');
                          return;
                        }
                        setLiveModalMode('broadcaster');
                        setShowLiveModal(true);
                      }}
                      className="px-6 py-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-xs shadow-lg shadow-rose-950/40 transition active:scale-95 flex items-center space-x-2 cursor-pointer"
                    >
                      <Radio className="w-4 h-4" />
                      <span>Efirni Boshlash</span>
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

                  <div className="relative z-10 p-4 flex items-center justify-between text-white pt-6">
                    <div className="flex items-center space-x-3">
                      <button onClick={() => setActiveTab('discover')} className="p-2 rounded-full bg-black/40 backdrop-blur-md cursor-pointer"><X className="w-5 h-5" /></button>

                      <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                        <img src={currentReelUser.avatar} className="w-7 h-7 rounded-full object-cover" />
                        <div>
                          <div className="font-bold text-xs">{currentReelUser.name}</div>
                        </div>
                        <button
                          onClick={() => handleToggleFollow(currentReelUser.id)}
                          className="ml-2 px-3 py-1 bg-rose-600 rounded-full text-[10px] font-bold text-white cursor-pointer"
                        >
                          {followingIds.includes(currentReelUser.id) ? 'Obuna' : '+ Obuna'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold">
                      <span className="text-red-500 animate-pulse">●</span> {activeUsersCount || 1}
                    </div>
                  </div>

                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col space-y-4 z-20">
                    <button className="flex flex-col items-center space-y-1 group cursor-pointer">
                      <div className="p-3 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 transition">
                        <Heart className="w-6 h-6 text-white group-hover:text-rose-500" />
                      </div>
                      <span className="text-[10px] font-bold text-white">4.2K</span>
                    </button>
                    <button className="flex flex-col items-center space-y-1 group cursor-pointer">
                      <div className="p-3 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 transition">
                        <Flame className="w-6 h-6 text-white group-hover:text-orange-500" />
                      </div>
                      <span className="text-[10px] font-bold text-white">Sovg'a</span>
                    </button>
                    <button className="flex flex-col items-center space-y-1 group cursor-pointer">
                      <div className="p-3 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 transition">
                        <ArrowUpRight className="w-6 h-6 text-white group-hover:text-blue-400" />
                      </div>
                      <span className="text-[10px] font-bold text-white">Ulashish</span>
                    </button>
                  </div>

                  <div className="relative z-10 p-4 space-y-2.5 text-white pb-2">
                    <p className="text-xs text-zinc-100 font-medium leading-relaxed">{currentReelUser.bio}</p>

                    <div className="space-y-1.5 max-h-[150px] overflow-y-auto pb-2" onWheel={(e) => e.stopPropagation()}>
                      {comments.map((c, idx) => (
                        <div key={c.id ? `${c.id}_${idx}` : `comment_${idx}`} className="text-white text-xs flex items-center space-x-1.5">
                          <span className="font-bold text-rose-300">{c.name}:</span>
                          <span className="text-zinc-100">{c.text}</span>
                        </div>
                      ))}
                      <div ref={commentsEndRef} />
                    </div>

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
                        className="flex-1 px-4 py-2.5 rounded-full bg-black/60 text-white placeholder-white/50 border border-white/20 text-xs focus:outline-none focus:border-rose-500"
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
                        className="bg-[#E11D48] text-white p-2.5 rounded-full shadow-md shrink-0 hover:bg-[#BE123C] transition-all cursor-pointer"
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

        {/* --- MAP / XARITA TAB (Unified Standard Map + Fixed Routing & Dark Glass Overlays) --- */}
        {activeTab === 'map' && (
          <div className="absolute inset-0 z-30 bg-[#0B0D13] flex flex-col overflow-hidden" data-testid="map-view-container">
            {!isLocationEnabled && !activeRouteUser && (
              <div className="bg-[#151824] border-b border-amber-400/20 p-2 px-3 flex items-center justify-between shrink-0 z-30 text-amber-200 text-xs">
                <div className="flex items-center space-x-2 min-w-0">
                  <EyeOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="truncate text-[11px] font-medium">Jonli lokatsiyangiz o'chirilgan (Ghost Mode).</p>
                </div>
                <button
                  type="button"
                  data-testid="map-enable-gps-btn"
                  onClick={() => handleToggleLocation(true)}
                  className="bg-[#E11D48] hover:bg-[#BE123C] text-white px-3 py-1 rounded-lg text-[10.5px] font-bold shrink-0 ml-2 transition cursor-pointer"
                >
                  GPS yoqish
                </button>
              </div>
            )}

            {gpsStatusMsg && (
              <div className="bg-rose-950/70 border-b border-rose-500/30 p-2 px-3 text-rose-200 text-[10.5px] font-medium flex items-center justify-between shrink-0 z-30 gap-2">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">{gpsStatusMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleLocation(true)}
                  className="underline text-[10.5px] font-bold text-white shrink-0 cursor-pointer"
                >
                  Qayta urinish
                </button>
              </div>
            )}

            {/* Map Viewport Wrapper */}
            <div className="relative flex-1 min-h-0 w-full overflow-hidden">
              {/* Top-left Map Users & Active Filter Pill */}
              {!activeRouteUser && (
                <div className="pointer-events-none absolute top-3 left-14 z-40">
                  <div className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#11131C]/90 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-zinc-200 shadow-lg">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" />
                    <span className="tabular-nums">
                      {usersList.filter((u) => {
                        const myUid = currentUser?.uid || firebaseUser?.uid;
                        if (myUid && (u.uid === myUid || u.id === myUid)) return false;
                        if (filterRegion !== 'Barchasi' && u.region !== filterRegion) return false;
                        if (filterDistrict !== 'Barchasi' && u.district !== filterDistrict) return false;
                        return u.location?.lat != null && u.location?.lng != null && u.locationVisibility !== 'ghost' && u.isLocationEnabled !== false;
                      }).length} ta foydalanuvchi xaritada
                    </span>
                    {(filterRegion !== 'Barchasi' || filterDistrict !== 'Barchasi') && (
                      <span className="text-rose-400 font-bold truncate max-w-[120px]">
                        · {filterDistrict !== 'Barchasi' ? filterDistrict : filterRegion}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Active Route Info Floating Banner */}
              {activeRouteUser && (routeInfo || isCalculatingRoute) && (
                <div className="absolute top-3 left-3 right-3 z-40 bg-[#12141E]/95 backdrop-blur-xl rounded-[20px] p-3 shadow-2xl border border-rose-500/25 flex items-center justify-between gap-2 animate-fadeIn">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    {resolveAvatarUrl(resolveEffectiveProfileAvatar(activeRouteUser)) ? (
                      <img src={resolveAvatarUrl(resolveEffectiveProfileAvatar(activeRouteUser))} alt={activeRouteUser.name} className="w-10 h-10 rounded-full object-cover border-2 border-rose-500 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-300 font-bold text-sm flex items-center justify-center border-2 border-rose-500 shrink-0">
                        {getSafeUserDisplayName(activeRouteUser, 'F').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-white truncate max-w-[160px]">{activeRouteUser.name} bilan marshrut</h4>
                      <p className="text-[10.5px] text-rose-400 font-bold flex items-center space-x-1 tabular-nums">
                        <Car className="w-3 h-3 inline mr-0.5 shrink-0" />
                        {isCalculatingRoute ? (
                          <span>Marshrut hisoblanmoqda...</span>
                        ) : routeInfo ? (
                          <span>
                            {routeInfo.distanceKm} km · ~{routeInfo.durationMin} daqiqa
                            {routeInfo.isFallback ? ' (taxminiy)' : ''}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRouteUser(null);
                      setRouteInfo(null);
                      setIsCalculatingRoute(false);
                      if (mapPolylineRef.current) {
                        mapPolylineRef.current.remove();
                        mapPolylineRef.current = null;
                      }
                    }}
                    className="p-1.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Yopish
                  </button>
                </div>
              )}

              {/* Live Stream Go Live Button on Map */}
              <button
                type="button"
                onClick={() => {
                  if (!firebaseUser && !currentUser) {
                    openAuthModalClean('login');
                    return;
                  }
                  setLiveModalMode('broadcaster');
                  setShowLiveModal(true);
                }}
                className="absolute top-3 right-3 z-40 bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:brightness-110 text-white shadow-xl px-3.5 py-2 rounded-full flex items-center space-x-1.5 font-bold text-xs transition transform active:scale-95 border border-white/15 cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <Radio className="w-4 h-4" />
                <span>Jonli Efir</span>
              </button>

              {/* Filter Button */}
              <button
                type="button"
                data-testid="map-filter-btn"
                onClick={() => setShowFilterModal(!showFilterModal)}
                title="Hudud bo'yicha filtr"
                aria-label="Hudud bo'yicha filtr"
                className="absolute top-14 right-3 z-40 bg-[#12141E]/92 hover:bg-[#1B1F30] text-zinc-100 shadow-lg p-2.5 rounded-full flex items-center justify-center border border-white/15 transition cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 text-rose-400" />
                {(filterRegion !== 'Barchasi' || filterDistrict !== 'Barchasi') && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 border border-[#12141E]" />
                )}
              </button>

              {/* Re-center on My Location Button */}
              <button
                type="button"
                data-testid="map-recenter-btn"
                onClick={() => {
                  if (mapInstanceRef.current && userCoords?.lat && userCoords?.lng) {
                    mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 14, { animate: true });
                    showToast("Xarita joylashuvingizga markazlashtirildi");
                  } else {
                    handleToggleLocation(true);
                  }
                }}
                title="Mening joylashuvim"
                aria-label="Mening joylashuvim"
                className="absolute bottom-24 right-3 z-40 bg-[#12141E]/95 hover:bg-[#1B1F30] text-rose-400 shadow-xl p-3 rounded-full border border-white/15 transition active:scale-95 cursor-pointer"
              >
                <Navigation className="w-4 h-4" />
              </button>

              {/* Filter Modal (Dark Obsidian, Proper Contrast) */}
              {showFilterModal && (
                <div
                  className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
                  data-testid="map-filter-modal"
                  onClick={() => setShowFilterModal(false)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#12141E] text-zinc-100 rounded-[24px] p-5 sm:p-6 w-full max-w-sm space-y-4 shadow-2xl border border-white/12"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-editorial font-bold text-xl text-white">Hudud bo'yicha filtr</h3>
                        <p className="text-[11px] text-zinc-400 mt-0.5">Viloyat yoki tumanni tanlang</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFilterModal(false)}
                        aria-label="Filtrni yopish"
                        className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-rose-600 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Viloyat</label>
                        <select
                          data-testid="map-filter-region"
                          value={filterRegion}
                          onChange={(e) => { setFilterRegion(e.target.value); setFilterDistrict('Barchasi'); }}
                          className="w-full p-3 rounded-xl bg-[#181B29] border border-white/12 text-xs font-semibold text-white outline-none focus:border-rose-500 cursor-pointer"
                        >
                          <option value="Barchasi" className="bg-[#12141E] text-white">Barcha viloyatlar</option>
                          {Object.keys(UZ_LOCATIONS).map((reg, idx) => (
                            <option key={`filter_modal_reg_${reg}_${idx}`} value={reg} className="bg-[#12141E] text-white">{reg}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Tuman / Shahar</label>
                        <select
                          data-testid="map-filter-district"
                          value={filterDistrict}
                          onChange={(e) => setFilterDistrict(e.target.value)}
                          className="w-full p-3 rounded-xl bg-[#181B29] border border-white/12 text-xs font-semibold text-white outline-none focus:border-rose-500 cursor-pointer"
                        >
                          <option value="Barchasi" className="bg-[#12141E] text-white">Barcha tumanlar</option>
                          {UZ_LOCATIONS[filterRegion]?.map((dist, idx) => (
                            <option key={`filter_modal_dist_${dist}_${idx}`} value={dist} className="bg-[#12141E] text-white">{dist}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFilterRegion('Barchasi');
                          setFilterDistrict('Barchasi');
                          setShowFilterModal(false);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 text-xs font-bold transition cursor-pointer"
                      >
                        Tozalash
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFilterModal(false)}
                        className="flex-1 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold transition cursor-pointer"
                      >
                        Qo'llash
                      </button>
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

      {/* Sticky Bottom Navigation Dock with Animated Active Pill */}
      {activeTab !== 'reels' && !(activeTab === 'chats' && chatView === 'conversation') && (
        <div className="sticky bottom-0 left-0 right-0 z-50 shrink-0 pointer-events-none pb-2.5 pt-1 px-2 sm:px-4">
          <nav className="pointer-events-auto max-w-lg mx-auto bg-[#11131C]/92 backdrop-blur-2xl border border-white/[0.1] rounded-2xl sm:rounded-full px-1.5 py-1.5 flex items-center justify-around shadow-[0_16px_42px_rgba(0,0,0,0.65)]">
            {[
              { id: 'discover', label: 'Nomzodlar', icon: Users, onClick: () => setActiveTab('discover') },
              { id: 'posts', label: 'Postlar', icon: Newspaper, onClick: () => setActiveTab('posts') },
              { id: 'map', label: 'Xarita', icon: MapPin, onClick: () => setActiveTab('map') },
              { id: 'reels', label: 'Efirlar', icon: Video, onClick: () => setActiveTab('reels') },
              { id: 'chats', label: 'Chatlar', icon: MessageCircle, onClick: () => { setChatView('list'); setActiveTab('chats'); } },
              { id: 'profile', label: 'Profil', icon: UserIcon, onClick: () => setActiveTab('profile') },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={tab.onClick}
                  data-testid={`tab-${tab.id}`}
                  className={`relative flex flex-col items-center justify-center px-2.5 sm:px-3.5 py-1.5 rounded-xl sm:rounded-full transition-colors duration-150 cursor-pointer min-w-0 ${
                    isActive ? 'text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activeDockPill"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-xl sm:rounded-full bg-[#E11D48]/22 border border-rose-500/35"
                    />
                  )}
                  <Icon className={`relative z-10 w-4 h-4 sm:w-4.5 sm:h-4.5 transition-transform duration-150 ${isActive ? 'text-rose-400 scale-105' : ''}`} />
                  <span className="relative z-10 text-[9.5px] sm:text-[10px] truncate mt-0.5">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );

  if (isAuthChecking) {
    return (
      <div
        data-testid="auth-loading-splash"
        className="relative min-h-screen bg-[#09090D] flex flex-col items-center justify-center px-6 overflow-hidden select-none"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,29,72,0.16),transparent_55%)]"
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-2xl space-y-6">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin" />
            <Flame className="w-7 h-7 text-rose-500 absolute inset-0 m-auto" />
          </div>

          <div className="space-y-2.5">
            <h1 className="text-3xl sm:text-5xl font-sans font-extrabold tracking-[0.14em] uppercase text-white leading-tight">
              ZUHRIDDIN{' '}
              <span className="bg-gradient-to-r from-rose-400 via-rose-500 to-amber-400 bg-clip-text text-transparent">
                SYS PRODUCT
              </span>
            </h1>
            <div className="text-xl sm:text-2xl font-editorial font-bold tracking-tight text-zinc-300">
              alov<span className="text-rose-500">.uz</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2.5 pt-1">
            <div className="w-40 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-rose-500 to-amber-400 animate-pulse" />
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 font-medium tracking-wide">
              Sessiya tiklanmoqda...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-[#09090D] text-[#F4F4F6] font-sans selection:bg-rose-600 selection:text-white">

      {/* Landing Page — only enter app after full DB registration sets currentUser */}
      {!currentUser || activeTab === 'landing' ? (
        <LandingPage onLogin={() => openAuthModalClean('login')} />
      ) : (
        <div className="min-h-screen bg-[#09090D] flex flex-col items-center justify-center p-0 md:p-4 overflow-hidden relative">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.12),transparent_55%)]" />
          {showUpdateBanner && (
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-[1060px] bg-amber-500/15 border border-amber-400/30 p-3 flex items-center justify-between z-[60] shadow-md mb-2 rounded-xl"
            >
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-[11px] font-bold text-amber-200">Yangi versiya mavjud! Iltimos, ilovani yangilang.</span>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="bg-amber-500 text-black px-3 py-1 rounded-full text-[10px] font-black shadow-sm cursor-pointer"
              >
                YANGILASH
              </button>
            </motion.div>
          )}
          <div className="w-full md:max-w-[1060px] h-[100dvh] md:h-[calc(100dvh-2rem)] bg-[#09090D] md:rounded-[28px] md:shadow-[0_28px_80px_rgba(0,0,0,0.8)] md:border md:border-white/[0.09] relative overflow-hidden flex flex-col z-10">
            {dashboardContent}
          </div>
        </div>
      )}

      {/* --- AUTHENTICATION MODAL --- */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#06060A]/80 backdrop-blur-xl"
          data-testid="auth-modal-backdrop"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            data-testid="auth-modal"
            className={cn(
              "bg-[#11131C] text-zinc-100 rounded-[28px] w-full p-6 sm:p-7 text-left space-y-4 relative shadow-[0_32px_90px_rgba(0,0,0,0.85)] border border-white/10 max-h-[92vh] overflow-y-auto",
              inlinePolicyReturnMode !== null
                ? "max-w-xl"
                : (authMode === 'google_face_id' || authMode === 'register_face_id' || (authMode === 'telegram' && telegramStep === 'face_id'))
                  ? "max-w-md"
                  : "max-w-sm"
            )}
          >
            <div className="pointer-events-none absolute -top-20 inset-x-10 h-32 bg-rose-600/15 blur-3xl rounded-full" />

            {!(authMode === 'google_face_id' || authMode === 'register_face_id' || (authMode === 'telegram' && telegramStep === 'face_id')) && (
              <button 
                onClick={() => {
                  resetAuthFormState();
                  setShowAuthModal(false);
                  setAuthMode('login');
                  setTelegramStep('input_phone');
                }} 
                aria-label="Oynani yopish"
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-zinc-400 hover:text-white flex items-center justify-center transition z-10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {inlinePolicyReturnMode !== null ? (
              <PrivacyPolicyInline
                onAccept={() => {
                  setPrivacyAgreed(true);
                  setPrivacyReadToBottom(true);
                  setErrorMsg('');
                  setInlinePolicyReturnMode(null);
                }}
                onBack={() => setInlinePolicyReturnMode(null)}
              />
            ) : (authMode === 'google_face_id' || authMode === 'register_face_id' || (authMode === 'telegram' && telegramStep === 'face_id')) ? (
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
                  resetAuthFormState();
                  setShowAuthModal(false);
                  setAuthMode('login');
                  setTelegramStep('input_phone');
                }}
              />
            ) : authMode === 'google_setup' ? (
              <div className="space-y-4 relative z-10">
                <div className="space-y-1 text-center">
                  <h2 className="text-xl font-editorial font-bold text-white tracking-tight">Profilni yakunlash</h2>
                  <p className="text-xs text-zinc-400 font-medium">
                    {pendingFaceId?.verified
                      ? "Face ID tasdiqlandi. Ma'lumotlaringizni tekshiring va to'ldiring:"
                      : "Profilingizni yakunlash uchun ma'lumotlaringizni kiriting:"}
                  </p>
                </div>

                {pendingFaceId?.verified ? (
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center space-x-3">
                    <div className="w-14 h-14 rounded-full bg-[#171A26] shadow-sm overflow-hidden shrink-0 border-2 border-emerald-500 flex items-center justify-center">
                      {resolveAvatarUrl(regAvatar) ? (
                        <img src={resolveAvatarUrl(regAvatar)} alt="Face ID" className="w-full h-full object-cover" />
                      ) : (
                        <ScanFace className="w-6 h-6 text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Face ID Tasdiqlandi</span>
                      </p>
                      <p className="text-xs font-bold text-white mt-0.5">
                        Jins:{' '}
                        <span className={regGender ? 'text-emerald-300' : 'text-amber-300'}>
                          {regGender ? genderToUzLabel(regGender) : 'Quyida tanlang *'}
                        </span>
                      </p>
                      <p className="text-[10px] text-emerald-300/80 font-medium">Real kamera suratingiz profilga o'rnatiladi</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-[#171A26] border border-white/10 rounded-2xl text-xs text-zinc-300">
                    Profilingiz uchun hudud, tug'ilgan sana va jins ma'lumotlarini kiriting.
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleCompleteGoogleRegistration} className="space-y-3" data-testid="google-setup-form">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Ism va Familiya</label>
                    <input 
                      type="text" 
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none"
                      placeholder="Ismingiz..."
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-zinc-300">
                        Foydalanuvchi nomi (@username)
                      </label>
                      <span className="text-[10px] text-rose-400 font-bold">Probel mumkin emas</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-zinc-500">@</span>
                      <input 
                        type="text" 
                        value={regUsername}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\s+/g, '').replace(/^@+/, '');
                          setRegUsername(clean);
                        }}
                        className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-mono font-bold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none"
                        placeholder="username"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#171A26]/90 border border-white/15 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-white">
                        Jinsingizni tanlang <span className="text-rose-400">*</span>
                      </label>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          regGender
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {regGender ? 'Tanlandi ✓' : 'Majburiy'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        data-testid="setup-gender-female"
                        aria-pressed={regGender === 'female'}
                        onClick={() => setRegGender('female')}
                        className={`py-3 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          regGender === 'female'
                            ? 'bg-gradient-to-r from-[#E11D48] to-rose-600 text-white border-rose-400 shadow-[0_6px_18px_rgba(225,29,72,0.35)]'
                            : 'bg-[#10121B] text-zinc-200 border-white/15 hover:border-rose-500/60 hover:text-white'
                        }`}
                      >
                        Ayol / Qiz
                      </button>
                      <button
                        type="button"
                        data-testid="setup-gender-male"
                        aria-pressed={regGender === 'male'}
                        onClick={() => setRegGender('male')}
                        className={`py-3 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          regGender === 'male'
                            ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-400 shadow-[0_6px_18px_rgba(14,165,233,0.35)]'
                            : 'bg-[#10121B] text-zinc-200 border-white/15 hover:border-sky-400/60 hover:text-white'
                        }`}
                      >
                        Erkak / Yigit
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-zinc-300">Tug'ilgan sana / yili (Birlamchi)</label>
                      <span className="text-[11px] font-bold text-rose-400 tabular-nums">
                        {calculateAge(regBirthDate, Number(regAge))} yosh
                      </span>
                    </div>
                    <input 
                      type="date" 
                      data-testid="setup-birthdate-input"
                      value={regBirthDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => {
                        const bDate = e.target.value;
                        setRegBirthDate(bDate);
                        setRegAge(String(calculateAge(bDate)));
                      }}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">Viloyat</label>
                      <select 
                        value={regRegion}
                        onChange={(e) => {
                          const reg = e.target.value;
                          setRegRegion(reg);
                          const dists = UZ_LOCATIONS[reg] || [];
                          if (dists.length > 0) setRegDistrict(dists[0]);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 outline-none"
                      >
                        {Object.keys(UZ_LOCATIONS).map((reg) => (
                          <option key={reg} value={reg} className="bg-[#11131C] text-white">{reg}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">Tuman / Shahar</label>
                      <select 
                        value={regDistrict}
                        onChange={(e) => setRegDistrict(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 outline-none"
                      >
                        {UZ_LOCATIONS[regRegion]?.map((dist) => (
                          <option key={dist} value={dist} className="bg-[#11131C] text-white">{dist}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">Mahalla / Manzil</label>
                      <input
                        type="text"
                        value={regNeighborhood}
                        onChange={(e) => setRegNeighborhood(e.target.value)}
                        placeholder="Mahalla"
                        className="w-full px-3 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Telefon raqam</label>
                    <SmartPhoneInput
                      value={regPhone}
                      onChange={setRegPhone}
                      testId="setup-phone-input"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Telegram (ixtiyoriy)</label>
                    <input 
                      type="text" 
                      value={regTelegram}
                      onChange={(e) => setRegTelegram(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none"
                      placeholder="@username"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">O'zingiz haqingizda (Bio)</label>
                    <textarea 
                      value={regBio}
                      onChange={(e) => setRegBio(e.target.value)}
                      rows={2}
                      data-testid="setup-bio-input"
                      className="w-full px-3.5 py-2 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none resize-none"
                      placeholder="Qiziqishlaringiz, fe'l-atvoringiz va qanday inson izlayotganingiz..."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Akkaunt uchun Parol (Kirish uchun)</label>
                    <div className="relative">
                      <input 
                        type={showAuthPassword ? 'text' : 'password'} 
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        required
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAuthPassword((p) => !p)}
                        aria-label="Parolni ko'rsatish"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition cursor-pointer"
                      >
                        {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 pt-1">
                    <input
                      type="checkbox"
                      id="google_privacy_checkbox"
                      data-testid="setup-privacy-checkbox"
                      checked={privacyAgreed}
                      onChange={(e) => setPrivacyAgreed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded bg-[#171A26] border-white/20 text-rose-500 focus:ring-rose-500/40 cursor-pointer"
                    />
                    <label htmlFor="google_privacy_checkbox" className="text-[11px] text-zinc-300 select-none cursor-pointer leading-relaxed text-left">
                      Men{' '}
                      <button
                        type="button"
                        data-testid="setup-privacy-link"
                        onClick={() => setInlinePolicyReturnMode('google_setup')}
                        className="text-rose-400 font-bold underline hover:text-rose-300 cursor-pointer"
                      >
                        Maxfiylik siyosati
                      </button>{' '}
                      bilan tanishib chiqdim
                    </label>
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-sm shadow-[0_12px_28px_rgba(225,29,72,0.35)] hover:brightness-110 transition disabled:opacity-60 cursor-pointer"
                  >
                    {isLoggingIn ? "Saqlanmoqda..." : "Profilni yaratish va boshlash"}
                  </button>

                  <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
                    Davom etish orqali siz <button type="button" onClick={() => setShowTermsModal(true)} className="text-zinc-400 underline hover:text-white">Foydalanish shartlari</button> va <button type="button" onClick={() => setInlinePolicyReturnMode('google_setup')} className="text-zinc-400 underline hover:text-white">Maxfiylik siyosati</button>ga rozilik bildirasiz.
                  </p>
                </form>
              </div>
            ) : telegramStep === 'input_phone' && authMode === 'telegram' ? (
              <div className="space-y-4 relative z-10">
                <div className="space-y-1.5 text-center pt-1">
                  <div className="w-11 h-11 rounded-2xl bg-[#229ED9]/15 border border-[#229ED9]/30 text-[#38BDF8] flex items-center justify-center mx-auto">
                    <Send className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-editorial font-bold text-white tracking-tight">Telegram orqali kirish</h2>
                  <p className="text-xs text-zinc-400 font-medium">Telefon raqamingiz yoki @username'ingizni kiriting:</p>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                {hasStartedBotError && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-400/25 rounded-2xl space-y-3 text-left">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-200 font-medium leading-relaxed">
                        <p className="font-bold text-amber-100">Botimizga ruxsat berilmagan!</p>
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
                      <span>Botga o'tish (@alovuz_bot)</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                <form onSubmit={handleStartTelegramAuth} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Telefon raqam yoki Username</label>
                    <input 
                      type="text" 
                      name="alov_tg_identifier"
                      autoComplete="off"
                      value={telegramInput}
                      onChange={(e) => {
                        setTelegramInput(e.target.value);
                        if (hasStartedBotError) setHasStartedBotError(false);
                      }}
                      required
                      className="w-full px-3.5 py-3 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-[#38BDF8] outline-none"
                      placeholder="+998901234567 yoki @username"
                    />
                  </div>

                  {!turnstileToken ? (
                    <TurnstileWidget
                      onTokenChange={setTurnstileToken}
                      resetSignal={turnstileResetTick}
                    />
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] font-semibold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Cloudflare xavfsizlik tekshiruvi tasdiqlandi</span>
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={isLoggingIn || !turnstileToken}
                    className="w-full py-3.5 px-4 rounded-2xl bg-[#229ED9] text-white font-bold text-sm shadow-lg shadow-sky-950/40 hover:bg-[#1f8fc6] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {hasStartedBotError ? <RefreshCw className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    <span>{isLoggingIn ? "Tekshirilmoqda..." : hasStartedBotError ? "Botni yoqdim (Kodni yuborish)" : "Tasdiqlash kodi olish"}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => { resetAuthFormState(); setAuthMode('login'); setTelegramStep('input_phone'); }}
                    className="w-full text-center text-xs font-bold text-zinc-400 hover:text-white pt-1 cursor-pointer"
                  >
                    Orqaga qaytish
                  </button>
                </form>
              </div>
            ) : telegramStep === 'input_code' ? (
              <div className="space-y-4 text-center relative z-10">
                <div className="space-y-1.5 pt-1">
                  <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-400 flex items-center justify-center mx-auto">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-editorial font-bold text-white tracking-tight">Tasdiqlash kodini kiriting</h2>
                  <p className="text-xs text-zinc-400 font-medium">
                    Kodingiz Telegram botimiz (<b className="text-zinc-200">@alovuz_bot</b>) chatiga yuborildi:
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
                  <span>Botga o'tish va kodni ko'rish (@alovuz_bot)</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>

                {errorMsg && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold text-left">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleVerifyTelegramCode} className="space-y-3 text-left">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">6 xonali tasdiqlash kodi</label>
                    <input 
                      type="text" 
                      name="alov_tg_otp_code"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={enteredTgCode}
                      onChange={(e) => setEnteredTgCode(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-xl bg-[#171A26] border border-white/10 text-center text-xl font-mono font-bold tracking-widest text-white placeholder:text-zinc-600 focus:border-rose-500 outline-none"
                      placeholder="123456"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-sm shadow-[0_12px_28px_rgba(225,29,72,0.35)] hover:brightness-110 transition disabled:opacity-60 cursor-pointer"
                  >
                    {isLoggingIn ? "Tekshirilmoqda..." : "Tasdiqlash va kirish"}
                  </button>

                  <button 
                    type="button"
                    onClick={() => { setTelegramStep('input_phone'); setEnteredTgCode(''); setGeneratedTgCode(''); setPendingTgUser(null); setErrorMsg(''); }}
                    className="w-full text-center text-xs font-bold text-zinc-400 hover:text-white pt-1 cursor-pointer"
                  >
                    Raqamni qayta kiritish
                  </button>
                </form>
              </div>
            ) : telegramStep === 'profile_setup' ? (
              <div className="space-y-4 relative z-10">
                <div className="space-y-1 text-center">
                  <h2 className="text-xl font-editorial font-bold text-white tracking-tight">Profilni yakunlash</h2>
                  <p className="text-xs text-zinc-400 font-medium">Face ID surati saqlandi. Ismingiz Telegramdan olindi, qolgan ma'lumotlarni to'ldiring.</p>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center space-x-3 mb-1">
                  {(() => {
                    const setupAvatar = resolveAvatarUrl(regAvatar);
                    const setupDisplayName = regName.trim() || 'Ismingizni kiriting';
                    return (
                      <>
                        <div className="w-14 h-14 rounded-full bg-[#171A26] shadow-sm overflow-hidden shrink-0 border-2 border-emerald-500 flex items-center justify-center">
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
                              "w-full h-full items-center justify-center bg-emerald-500/20 text-emerald-300 font-bold text-lg",
                              setupAvatar ? "hidden" : "flex"
                            )}
                          >
                            {(regName.trim().charAt(0) || 'A').toUpperCase()}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Face ID Tasdiqlangan Surat</span>
                          </p>
                          <p className="text-sm font-bold text-white truncate">{setupDisplayName}</p>
                          <p className="text-[10.5px] font-semibold text-emerald-300/85">
                            Jins:{' '}
                            <span className={regGender ? 'text-emerald-300' : 'text-amber-300'}>
                              {regGender ? genderToUzLabel(regGender) : 'Quyida tanlang *'}
                            </span>
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <form onSubmit={handleCompleteTelegramRegistration} className="space-y-3" data-testid="telegram-setup-form">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">
                      Ism va Familiya (Telegramdan olindi)
                    </label>
                    <input 
                      type="text" 
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none transition-all"
                      placeholder="Ismingiz..."
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-zinc-300">
                        Foydalanuvchi nomi (@username)
                      </label>
                      <span className="text-[10px] text-rose-400 font-bold">Probel mumkin emas</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-zinc-500">@</span>
                      <input 
                        type="text" 
                        value={regUsername}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\s+/g, '').replace(/^@+/, '');
                          setRegUsername(clean);
                        }}
                        className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-mono font-bold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none transition-all"
                        placeholder="username (masalan: dilnoza_9)"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#171A26]/90 border border-white/15 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-white">
                        Jinsingizni tanlang <span className="text-rose-400">*</span>
                      </label>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          regGender
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {regGender ? 'Tanlandi ✓' : 'Majburiy'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        data-testid="tg-setup-gender-female"
                        aria-pressed={regGender === 'female'}
                        onClick={() => setRegGender('female')}
                        className={`py-3 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          regGender === 'female'
                            ? 'bg-gradient-to-r from-[#E11D48] to-rose-600 text-white border-rose-400 shadow-[0_6px_18px_rgba(225,29,72,0.35)]'
                            : 'bg-[#10121B] text-zinc-200 border-white/15 hover:border-rose-500/60 hover:text-white'
                        }`}
                      >
                        Ayol / Qiz
                      </button>
                      <button
                        type="button"
                        data-testid="tg-setup-gender-male"
                        aria-pressed={regGender === 'male'}
                        onClick={() => setRegGender('male')}
                        className={`py-3 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          regGender === 'male'
                            ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-400 shadow-[0_6px_18px_rgba(14,165,233,0.35)]'
                            : 'bg-[#10121B] text-zinc-200 border-white/15 hover:border-sky-400/60 hover:text-white'
                        }`}
                      >
                        Erkak / Yigit
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-zinc-300">Tug'ilgan sana / yili (Birlamchi)</label>
                      <span className="text-[11px] font-bold text-rose-400 tabular-nums">
                        {calculateAge(regBirthDate, Number(regAge))} yosh
                      </span>
                    </div>
                    <input
                      type="date"
                      data-testid="tg-setup-birthdate-input"
                      value={regBirthDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => {
                        const bDate = e.target.value;
                        setRegBirthDate(bDate);
                        setRegAge(String(calculateAge(bDate)));
                      }}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">Viloyat</label>
                      <select 
                        value={regRegion}
                        onChange={(e) => {
                          setRegRegion(e.target.value);
                          setRegDistrict(UZ_LOCATIONS[e.target.value]?.[0] || '');
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 outline-none"
                      >
                        {Object.keys(UZ_LOCATIONS).map((reg) => (
                          <option key={`reg_setup_${reg}`} value={reg} className="bg-[#11131C] text-white">{reg}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">Tuman / Shahar</label>
                      <select 
                        value={regDistrict}
                        onChange={(e) => setRegDistrict(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 outline-none"
                      >
                        {UZ_LOCATIONS[regRegion]?.map((dist) => (
                          <option key={`dist_setup_${dist}`} value={dist} className="bg-[#11131C] text-white">{dist}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">Mahalla</label>
                      <input
                        type="text"
                        value={regNeighborhood}
                        onChange={(e) => setRegNeighborhood(e.target.value)}
                        placeholder="Mahalla"
                        className="w-full px-3 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Telefon raqam</label>
                    <SmartPhoneInput
                      value={regPhone}
                      onChange={setRegPhone}
                      testId="tg-setup-phone-input"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">O'zingiz haqingizda (Bio)</label>
                    <textarea
                      value={regBio}
                      onChange={(e) => setRegBio(e.target.value)}
                      rows={2}
                      data-testid="tg-setup-bio-input"
                      placeholder="O'zingiz va qiziqishlaringiz haqida yozing..."
                      className="w-full px-3.5 py-2 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1 flex items-center justify-between">
                      <span>Akkaunt uchun Parol</span>
                      <span className="text-[10px] text-rose-400 font-medium">* Majburiy</span>
                    </label>
                    <div className="relative">
                      <input 
                        type={showAuthPassword ? 'text' : 'password'} 
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        required
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 outline-none transition-all"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAuthPassword((p) => !p)}
                        aria-label="Parolni ko'rsatish"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition cursor-pointer"
                      >
                        {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed px-1">
                      Kelajakda boshqa qurilmalardan kirish uchun ushbu paroldan foydalanasiz.
                    </p>
                  </div>

                  <div className="flex items-start space-x-2.5 pt-1">
                    <input
                      type="checkbox"
                      id="tg_privacy_checkbox"
                      data-testid="tg-setup-privacy-checkbox"
                      checked={privacyAgreed}
                      onChange={(e) => setPrivacyAgreed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded bg-[#171A26] border-white/20 text-rose-500 focus:ring-rose-500/40 cursor-pointer"
                    />
                    <label htmlFor="tg_privacy_checkbox" className="text-[11px] text-zinc-300 select-none cursor-pointer leading-relaxed text-left">
                      Men{' '}
                      <button
                        type="button"
                        data-testid="tg-setup-privacy-link"
                        onClick={() => setInlinePolicyReturnMode('telegram_setup')}
                        className="text-rose-400 font-bold underline hover:text-rose-300 cursor-pointer"
                      >
                        Maxfiylik siyosati
                      </button>{' '}
                      bilan tanishib chiqdim
                    </label>
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-sm shadow-[0_12px_28px_rgba(225,29,72,0.35)] hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {isLoggingIn ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saqlanmoqda...</span>
                      </>
                    ) : (
                      <span>Profilni yaratish va boshlash</span>
                    )}
                  </button>

                  <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
                    Davom etish orqali siz <button type="button" onClick={() => setShowTermsModal(true)} className="text-zinc-400 underline hover:text-white">Foydalanish shartlari</button> va <button type="button" onClick={() => setInlinePolicyReturnMode('telegram_setup')} className="text-zinc-400 underline hover:text-white">Maxfiylik siyosati</button>ga rozilik bildirasiz.
                  </p>
                </form>
              </div>
            ) : (
              <div className="space-y-4 text-center relative z-10">
                <div className="space-y-2">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#E11D48] to-rose-700 text-white flex items-center justify-center mx-auto shadow-[0_8px_24px_rgba(225,29,72,0.4)]">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-editorial font-bold text-white tracking-tight">Alov.uz ga xush kelibsiz</h2>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5">Tanishuv va jonli muloqot dunyosiga kiring</p>
                  </div>
                </div>

                {/* Tab Switcher */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#171A26] border border-white/[0.08] rounded-2xl">
                  <button 
                    type="button"
                    data-testid="auth-tab-login"
                    onClick={() => { resetAuthFormState(); setAuthMode('login'); }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      authMode === 'login'
                        ? 'bg-gradient-to-r from-[#E11D48] to-rose-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Kirish
                  </button>
                  <button 
                    type="button"
                    data-testid="auth-tab-register"
                    onClick={() => { resetAuthFormState(); setAuthMode('register'); }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      authMode === 'register'
                        ? 'bg-gradient-to-r from-[#E11D48] to-rose-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Ro'yxatdan o'tish
                  </button>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold text-left">
                    {errorMsg}
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {authMode === 'login' ? (
                    <motion.form
                      key="login-form"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.16 }}
                      onSubmit={handleEmailLogin}
                      className="space-y-3 text-left"
                    >
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1.5">Username, Email yoki Telefon</label>
                        <input 
                          type="text" 
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          required
                          data-testid="auth-login-identifier"
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 outline-none transition"
                          placeholder="@username, email yoki telefon..."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1.5">Parol</label>
                        <div className="relative">
                          <input 
                            type={showAuthPassword ? 'text' : 'password'} 
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            required
                            data-testid="auth-login-password"
                            className="w-full pl-3.5 pr-10 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 outline-none transition"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            data-testid="auth-password-toggle"
                            onClick={() => setShowAuthPassword((p) => !p)}
                            aria-label={showAuthPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition cursor-pointer"
                          >
                            {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <TurnstileWidget
                        onTokenChange={setTurnstileToken}
                        resetSignal={turnstileResetTick}
                      />

                      <button 
                        type="submit"
                        disabled={isLoggingIn || !turnstileToken}
                        data-testid="auth-login-submit"
                        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-sm shadow-[0_12px_28px_rgba(225,29,72,0.35)] hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isLoggingIn ? "Kirilmoqda..." : "Kirish"}
                      </button>

                      <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
                        Kirish orqali siz <button type="button" onClick={() => setShowTermsModal(true)} className="text-zinc-400 underline hover:text-white">Foydalanish shartlari</button> va <button type="button" onClick={() => setInlinePolicyReturnMode('register')} className="text-zinc-400 underline hover:text-white">Maxfiylik siyosati</button>ga rozilik bildirasiz.
                      </p>
                    </motion.form>
                  ) : (
                    <motion.form
                      key="register-form"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.16 }}
                      onSubmit={handleEmailRegister}
                      className="space-y-3 text-left"
                    >
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1.5">Ism va Familiya</label>
                        <input 
                          type="text" 
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          required
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 outline-none transition"
                          placeholder="Ismingiz..."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1.5">Email</label>
                        <input 
                          type="email" 
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          required
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 outline-none transition"
                          placeholder="example@gmail.com"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1.5">Parol</label>
                        <div className="relative">
                          <input 
                            type={showAuthPassword ? 'text' : 'password'} 
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            required
                            className="w-full pl-3.5 pr-10 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 outline-none transition"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAuthPassword((p) => !p)}
                            aria-label={showAuthPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition cursor-pointer"
                          >
                            {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2.5 pt-1">
                        <input
                          type="checkbox"
                          id="email_privacy_checkbox"
                          data-testid="register-privacy-checkbox"
                          checked={privacyAgreed}
                          onChange={(e) => setPrivacyAgreed(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded bg-[#171A26] border-white/20 text-rose-500 focus:ring-rose-500/40 cursor-pointer"
                        />
                        <label htmlFor="email_privacy_checkbox" className="text-[11px] text-zinc-300 select-none cursor-pointer leading-relaxed text-left">
                          Men{' '}
                          <button
                            type="button"
                            data-testid="register-privacy-link"
                            onClick={() => setInlinePolicyReturnMode('register')}
                            className="text-rose-400 font-bold underline hover:text-rose-300 cursor-pointer"
                          >
                            Maxfiylik siyosati
                          </button>{' '}
                          bilan tanishib chiqdim
                        </label>
                      </div>

                      <TurnstileWidget
                        onTokenChange={setTurnstileToken}
                        resetSignal={turnstileResetTick}
                      />

                      <button 
                        type="submit"
                        disabled={isLoggingIn || !turnstileToken}
                        data-testid="auth-register-submit"
                        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-sm shadow-[0_12px_28px_rgba(225,29,72,0.35)] hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isLoggingIn ? "Ro'yxatdan o'tmoqda..." : "Ro'yxatdan o'tish"}
                      </button>

                      <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
                        Davom etish orqali siz <button type="button" onClick={() => setShowTermsModal(true)} className="text-zinc-400 underline hover:text-white">Foydalanish shartlari</button> va <button type="button" onClick={() => setInlinePolicyReturnMode('register')} className="text-zinc-400 underline hover:text-white">Maxfiylik siyosati</button>ga rozilik bildirasiz.
                      </p>
                    </motion.form>
                  )}
                </AnimatePresence>

                <div className="relative flex py-1.5 items-center">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">yoki</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                <div className="space-y-2.5">
                  <button 
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn || !turnstileToken}
                    data-testid="auth-google-btn"
                    className="w-full flex items-center justify-center space-x-3 py-3.5 px-4 rounded-2xl border border-white/12 hover:border-white/25 hover:bg-[#1B1F2E] font-bold text-sm bg-[#171A26] text-white active:scale-[0.99] transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.18v3.15C3.165 21.33 7.21 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.18C.43 8.13 0 9.87 0 12s.43 3.87 1.18 5.39l4.09-3.15z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.21 0 3.165 2.67 1.18 6.61l4.09 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
                    </svg>
                    <span>Google orqali davom ettirish</span>
                  </button>

                  <button 
                    onClick={handleOpenTelegramFlow}
                    disabled={isLoggingIn || !turnstileToken}
                    data-testid="auth-telegram-btn"
                    className="w-full flex items-center justify-center space-x-3 py-3.5 px-4 rounded-2xl bg-[#229ED9] hover:bg-[#1f8fc6] font-bold text-sm shadow-sm text-white active:scale-[0.99] transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27 0-.12.05-1.98 1.26-5.6 3.7-.53.36-1.01.54-1.44.53-.47-.01-1.38-.26-2.06-.48-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.98-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.4-.02.07-.02.13-.04.2z"/>
                    </svg>
                    <span>Telegram orqali davom etish</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* --- PRIVACY POLICY MODAL --- */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#12141E] text-zinc-100 rounded-[24px] w-full max-w-2xl max-h-[90vh] flex flex-col border border-white/15 shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#181A26]">
              <h2 className="text-lg font-editorial font-bold text-white tracking-tight">Maxfiylik Siyosati (Privacy Policy)</h2>
              <button 
                onClick={() => setShowPrivacyModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-rose-500/20 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div 
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) {
                  setPrivacyReadToBottom(true);
                }
              }}
              className="p-6 overflow-y-auto space-y-4 text-xs text-zinc-300 leading-relaxed text-left flex-1"
            >
              <p className="font-bold text-white text-sm">Oxirgi yangilangan sana: 2026-yil 16-noyabr</p>
              <p>Ushbu Maxfiylik Siyosati Alov.uz platformasi (keyingi o‘rinlarda — "Platforma") foydalanuvchilarining shaxsiy ma'lumotlarini qanday yig‘ishi, saqlashi, qayta ishlashi va himoya qilishini tartibga soladi. Platformadan foydalanish orqali siz ushbu shartlarga rozilik bildirasiz.</p>
              
              <h3 className="font-bold text-white text-sm pt-2">1. Yig‘iladigan ma'lumotlar</h3>
              <p>Platformamiz xizmatlarini ko‘rsatish va xavfsizlikni ta'minlash maqsadida quyidagi ma'lumotlar yig‘iladi:</p>
              <p>• Ro‘yxatdan o‘tish ma'lumotlari: Foydalanuvchi ismi, foydalanuvchi nomi (username), jinsi va ro‘yxatdan o‘tgan vaqti.</p>
              <p>• Profil rasmi: Foydalanuvchi tomonidan yuklangan yoki kamera orqali olingan oddiy profil avatari.</p>
              <p>• Texnik ma'lumotlar: Platforma xavfsizligini ta'minlash va firibgarlikning oldini olish uchun IP-manzillar va qurilma loglari.</p>

              <h3 className="font-bold text-white text-sm pt-2">2. Biometrik ma'lumotlar va Face ID bo‘yicha tushuntirish</h3>
              <p>Platformamizda yuzni aniqlash (Face ID / Liveness Detection) texnologiyasi faqatgina foydalanuvchining real inson ekanligini tekshirish (soxta profil yaratishning oldini olish) uchun real vaqt rejimida ishlatiladi.</p>
              <p>Foydalanuvchining yuz vektorlari, o‘lchovlari yoki biometrik shablonlari serverimizda yoki ma'lumotlar bazasida aslo saqlanmaydi. Tasdiqlashdan so‘ng faqat oddiy profil rasmi saqlanib qoladi.</p>

              <h3 className="font-bold text-white text-sm pt-2">3. Ma'lumotlardan foydalanish maqsadi</h3>
              <p>To‘plangan ma'lumotlar quyidagi maqsadlarda ishlatiladi:</p>
              <p>• Platformaning ishlashini ta'minlash va foydalanuvchilarni o‘zaro bog‘lash.</p>
              <p>• Xavfsizlikni ta'minlash, soxta akkauntlar va spamning oldini olish.</p>
              <p>• Qonunbuzarliklar yoki shubhali harakatlar sodir bo‘lganda, O‘zbekiston Respublikasining amaldagi qonunchiligiga muvofiq vakolatli davlat organlarining (IIV) rasmiy so‘rovlariga zarur texnik ma'lumotlarni taqdim etish.</p>

              <h3 className="font-bold text-white text-sm pt-2">4. Admin panel va Moderatsiya</h3>
              <p>Platforma ma'muriyati tizim xavfsizligini nazorat qilish va qoidalarga rioya etilishini tekshirish maqsadida foydalanuvchilarning asosiy ma'lumotlari (ismi, profil rasmi, ro‘yxatdan o‘tgan vaqti) bo‘yicha texnik xabarnomalar (loglar) olish huquqiga ega.</p>
              <p>Bu ma'lumotlar faqat xavfsizlik va moderatsiya maqsadida ishlatiladi, uchinchi shaxslarga sotilmaydi va shaxsiy maqsadlarda shaxsiy qurilmalarga saqlab olinmaydi.</p>

              <h3 className="font-bold text-white text-sm pt-2">5. Videoqo‘ng‘iroqlar maxfiyligi (End-to-End Encryption)</h3>
              <p>Platformamizdagi barcha video va ovozli qo‘ng‘iroqlar 100% End-to-End Shifrlangan (E2EE) hisoblanadi.</p>
              <p>Qo‘ng‘iroqlar mazmuni va videolavhalar serverimizda yozib olinmaydi va saqlanmaydi. Suhbatdoshlar o‘rtasidagi ma'lumotlar faqat ularning o‘ziga tegishli bo‘lib, ma'muriyat ularni ko‘ra olmaydi.</p>

              <h3 className="font-bold text-white text-sm pt-2">6. Taqiqlangan harakatlar va Kontent cheklovi</h3>
              <p>Platforma orqali har qanday zararli dasturlar (.apk, .exe va boshqa virusli fayllar), 100% taqiqlangan behayo (18+) kontent, shantaj materiallari va firibgarlik havolalarini tarqatish qat'iyan taqiqlanadi.</p>
              <p>Shubhali yoki zararli fayllar aniqlansa, tizim ularni avtomatik bloklaydi. Qoidalarni buzgan foydalanuvchilarning akkaunti ogohlantirishsiz bloklanadi va ularning ma'lumotlari qonun doirasida huquq-tartibot organlariga taqdim etilishi mumkin.</p>

              <h3 className="font-bold text-white text-sm pt-2">7. Foydalanuvchining huquq va majburiyatlari</h3>
              <p>Har bir foydalanuvchi o‘z shaxsiy ma'lumotlarini o‘chirishni yoki akkauntini yopishni talab qilish huquqiga ega.</p>
              <p>Foydalanuvchi o‘z harakatlari va boshqalar bilan muloqotdagi odob-axloq qoidalari uchun shaxsan o‘zi javobgardir. Shubhali yoki tahdidli holatlar yuz berganda "Shikoyat qilish" (Report) tugmasidan foydalanish tavsiya etiladi.</p>

              {!privacyReadToBottom && (
                <div className="p-3 bg-amber-500/10 border border-amber-400/30 rounded-xl text-amber-300 text-center font-bold text-xs animate-pulse">
                  ⬇️ Matnni oxirigacha o'qish uchun pastga aylantiring...
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-[#181A26] flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">
                {privacyReadToBottom ? "✅ Matn oxirigacha o'qildi" : "⚠️ Matnni oxirigacha o'qing"}
              </span>
              <button
                type="button"
                disabled={!privacyReadToBottom}
                onClick={() => {
                  setPrivacyAgreed(true);
                  setShowPrivacyModal(false);
                }}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-xs shadow-md hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Roziman
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TERMS OF USE MODAL --- */}
      {showTermsModal && (
        <div className="fixed inset-0 z-[165] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#12141E] text-zinc-100 rounded-[24px] w-full max-w-2xl max-h-[90vh] flex flex-col border border-white/15 shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#181A26]">
              <h2 className="text-lg font-editorial font-bold text-white tracking-tight">Foydalanish Shartlari (Terms of Use)</h2>
              <button 
                onClick={() => setShowTermsModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-rose-500/20 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div 
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) {
                  setTermsReadToBottom(true);
                }
              }}
              className="p-6 overflow-y-auto space-y-4 text-xs text-zinc-300 leading-relaxed text-left flex-1"
            >
              <p className="font-bold text-white text-sm">Oxirgi yangilangan sana: 2026-yil 16-noyabr</p>
              <p>Ushbu Foydalanish shartlari Alov.uz platformasi (keyingi o‘rinlarda — "Platforma") hamda undan foydalanuvchi shaxs (keyingi o‘rinlarda — "Foydalanuvchi") o‘rtasidagi o‘zaro munosabatlarni va platformadan foydalanish qoidalarini belgilaydi. Ro‘yxatdan o‘tish orqali siz ushbu barcha shartlarga rozilik bildirasiz.</p>
              
              <h3 className="font-bold text-white text-sm pt-2">1. Umumiy qoidalar va yosh chegarasi</h3>
              <p>• Platformadan faqat 18 yoshga to‘lgan shaxslar foydalanishi mumkin. Ro‘yxatdan o‘tish orqali siz voyaga yetganingizni tasdiqlaysiz.</p>
              <p>• Foydalanuvchi o‘zi haqida haqqoniy ma'lumotlarni kiritishi va profil rasmi sifatida o‘zining real tasviridan foydalanishi shart.</p>

              <h3 className="font-bold text-white text-sm pt-2">2. Platformada taqiqlangan harakatlar</h3>
              <p>Foydalanuvchiga quyidagilar qat'iyan taqiqlanadi:</p>
              <p>• Noqonuniy va behayo kontent: 18+ (pornografik) rasm va videolar yuborish, videoqo‘ng‘iroqlar vaqtida behayo harakatlar qilish yoki shunday materiallarni targ‘ib etish.</p>
              <p>• Zararli dasturlar va fayllar: Chatlar orqali .apk, .exe, viruslar, zararli havolalar (fishing linklar) yoki boshqa shubhali fayllarni tarqatish.</p>
              <p>• Shantaj va haqorat: Boshqa foydalanuvchilarni haqorat qilish, tahdid solish, ularning ruxsatisiz suhbat yoki videolarni yozib olish va uchinchi shaxslarga tarqatish.</p>
              <p>• Soxta akkauntlar: Boshqa shaxslarning rasmi yoki ma'lumotlaridan foydalanib, aldash maqsadida profil ochish.</p>
              <p>• Spam va reklama: Ma'muriyat ruxsatisiz tijoriy reklamalar, begona botlar yoki saytlar havolasini tarqatish.</p>

              <h3 className="font-bold text-white text-sm pt-2">3. Foydalanuvchining shaxsiy javobgarligi</h3>
              <p>• Platformadagi har bir foydalanuvchi o‘z harakatlari, yuborgan xabarlari va muloqot madaniyati uchun shaxsan o‘zi javobgardir.</p>
              <p>• O‘zbekiston Respublikasi qonunchiligini buzgan (jumladan, shaxsiy ma'lumotlarni ruxsatsiz tarqatgan, shantaj qilgan yoki zararli dasturlar yuborgan) foydalanuvchi qonun oldida shaxsan ma'muriy va jinoiy javobgarlikka tortiladi. Platforma ma'muriyati foydalanuvchilarning shaxsiy xatti-harakatlari uchun javobgar emas.</p>

              <h3 className="font-bold text-white text-sm pt-2">4. Ma'muriyat huquqlari va Moderatsiya</h3>
              <p>• Platforma xavfsizligini ta'minlash maqsadida ma'muriyat qoidalarni buzgan har qanday foydalanuvchining akkauntini oldindan ogohlantirmasdan bloklash yoki o‘chirib tashlash huquqiga ega.</p>
              <p>• Qonunbuzarlik holatlari aniqlanganda yoki huquqni muhofaza qiluvchi organlardan (IIV) rasmiy so‘rov kelib tushganda, ma'muriyat qoidabuzar foydalanuvchining texnik ma'lumotlarini (IP-manzil, ro‘yxatdan o‘tish loglari va boshqalar) vakolatli organlarga taqdim etadi.</p>

              <h3 className="font-bold text-white text-sm pt-2">5. Xavfsizlik va Shikoyat qilish</h3>
              <p>• Agar boshqa foydalanuvchi tomonidan qoidabuzarlik, tahdid yoki shubhali harakat sezilsa, Foydalanuvchi darhol chat yoki videoqo‘ng‘iroq oynasidagi "Shikoyat qilish" (Report) tugmasidan foydalanishi lozim.</p>
              <p>• Foydalanuvchilarga notanish insonlarga o‘zlarining shaxsiy, moliyaviy yoki maxfiy ma'lumotlarini bermaslik tavsiya etiladi.</p>

              <h3 className="font-bold text-white text-sm pt-2">6. Shartlarga o‘zgartirish kiritish</h3>
              <p>Platforma ma'muriyati ushbu Foydalanish shartlariga istalgan vaqtda o‘zgartirish yoki qo‘shimchalar kiritish huquqiga ega. Yangilangan shartlar saytda e'lon qilingan paytdan boshlab kuchga kiradi.</p>

              {!termsReadToBottom && (
                <div className="p-3 bg-amber-500/10 border border-amber-400/30 rounded-xl text-amber-300 text-center font-bold text-xs animate-pulse">
                  ⬇️ Matnni oxirigacha o'qish uchun pastga aylantiring...
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-[#181A26] flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">
                {termsReadToBottom ? "✅ Matn oxirigacha o'qildi" : "⚠️ Matnni oxirigacha o'qing"}
              </span>
              <button
                type="button"
                disabled={!termsReadToBottom}
                onClick={() => {
                  setPrivacyAgreed(true);
                  setTermsReadToBottom(true);
                  setShowTermsModal(false);
                }}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-xs shadow-md hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Roziman
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PROFILE QUESTIONNAIRE / EDIT MODAL --- */}
      {showProfileModal && (
        <div
          className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md"
          onClick={() => setShowProfileModal(false)}
          data-testid="edit-profile-modal-backdrop"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            data-testid="edit-profile-modal"
            className="bg-[#11131C] rounded-t-[28px] sm:rounded-[28px] max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-[0_28px_80px_rgba(0,0,0,0.8)] border border-white/10 text-zinc-100"
          >
            {/* Mobile Drag Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-0.5 sm:hidden shrink-0" />

            {/* Sticky Modal Header */}
            <div className="shrink-0 bg-[#141724] border-b border-white/[0.08] px-5 sm:px-7 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-editorial text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight">
                  {currentUser?.isProfileCompleted ? 'Profilni tahrirlash' : "Anketani to'ldirish"}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Shaxsiy ma'lumotlar, media va maxfiylik sozlamalari
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                aria-label="Oynani yopish"
                data-testid="edit-profile-close-btn"
                className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-zinc-300 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Wrapping Scrollable Body & Sticky Footer */}
            <form onSubmit={handleSaveProfile} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-6">
                {errorMsg && (
                  <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Section 1: Profil surati va banner */}
                <div className="space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Profil surati va muqova
                  </h3>
                  <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-4">
                    {/* Avatar Column */}
                    <div className="flex sm:flex-col items-center justify-center gap-3 sm:gap-2.5 shrink-0 sm:w-36 bg-[#171A26] rounded-2xl border border-white/[0.08] p-3.5 w-full">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/15 shadow-md bg-[#0E1018] flex items-center justify-center shrink-0">
                        {resolveAvatarUrl(regAvatar) ? (
                          <img
                            src={resolveAvatarUrl(regAvatar)}
                            alt="Profil rasmi"
                            className="w-full h-full object-cover"
                            onError={(e: any) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-2xl font-editorial font-bold text-rose-400">
                            {(regName?.trim().charAt(0) || 'A').toUpperCase()}
                          </span>
                        )}
                      </div>
                      <label className="cursor-pointer inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[36px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 text-xs font-bold transition whitespace-nowrap">
                        <Camera className="w-3.5 h-3.5 text-rose-400" />
                        <span>Rasm yuklash</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                    </div>

                    {/* Cover Banner Column */}
                    <div className="flex-1 w-full bg-[#171A26] rounded-2xl border border-white/[0.08] p-3.5 flex flex-col justify-between gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-rose-400" />
                          <span>Profil banneri</span>
                        </span>
                        <div className="flex items-center gap-2">
                          {regBanner && (
                            <button
                              type="button"
                              onClick={() => setRegBanner('')}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-[11px] font-bold text-rose-300 border border-rose-500/25 transition cursor-pointer"
                            >
                              Olib tashlash
                            </button>
                          )}
                          <label className="cursor-pointer px-3 py-1 rounded-lg bg-gradient-to-r from-[#E11D48] to-rose-600 hover:brightness-110 text-white text-[11px] font-bold transition">
                            {isUploadingBanner ? 'Yuklanmoqda...' : 'Banner yuklash'}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isUploadingBanner}
                              onChange={(e) => handleBannerFileChange(e, false)}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="h-24 sm:h-28 rounded-xl overflow-hidden bg-gradient-to-r from-[#1A1320] via-[#261423] to-[#171A26] border border-white/[0.08] flex items-center justify-center">
                        {resolveAvatarUrl(regBanner) ? (
                          <img
                            src={resolveAvatarUrl(regBanner)}
                            alt="Banner ko'rinishi"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-medium text-zinc-500">Hali banner tanlanmagan</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Asosiy ma'lumotlar */}
                <div className="border-t border-white/[0.08] pt-5 space-y-3.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Asosiy ma'lumotlar
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="edit-profile-name" className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Ism va familiya
                      </label>
                      <input
                        id="edit-profile-name"
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none placeholder:text-zinc-500"
                        placeholder="Ismingiz..."
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label htmlFor="edit-profile-username" className="text-xs font-bold text-zinc-300">
                          Foydalanuvchi nomi
                        </label>
                        <span className="text-[10px] font-semibold text-rose-400">Probel mumkin emas</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-zinc-500">@</span>
                        <input
                          id="edit-profile-username"
                          type="text"
                          value={regUsername}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\s+/g, '').replace(/^@+/, '');
                            setRegUsername(clean);
                          }}
                          className="w-full pl-8 pr-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-mono font-bold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none placeholder:text-zinc-500"
                          placeholder="alisher_01"
                        />
                      </div>
                      <p className="text-[10.5px] text-zinc-500 mt-1">
                        3-20 belgi, lotin harflari va raqamlar, noyob bo'lishi shart.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label htmlFor="edit-profile-birthdate" className="text-xs font-bold text-zinc-300 flex items-center gap-1">
                          <span>Tug'ilgan sana</span>
                          {currentUser?.isProfileCompleted && <Lock className="w-3 h-3 text-zinc-500" />}
                        </label>
                        <span className="text-[11px] font-bold text-rose-400 tabular-nums">
                          {calculateAge(regBirthDate, Number(regAge))} yosh
                        </span>
                      </div>
                      <input
                        id="edit-profile-birthdate"
                        type="date"
                        value={regBirthDate}
                        disabled={Boolean(currentUser?.isProfileCompleted)}
                        onChange={(e) => {
                          const bDate = e.target.value;
                          setRegBirthDate(bDate);
                          const computedAge = calculateAge(bDate);
                          setRegAge(String(computedAge));
                        }}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none cursor-pointer disabled:bg-[#0E1018] disabled:text-zinc-500 disabled:cursor-not-allowed"
                      />
                      {currentUser?.isProfileCompleted && (
                        <p className="text-[10.5px] text-zinc-500 mt-1">Birlamchi tug'ilgan yil o'zgartirilmaydi.</p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label htmlFor="edit-profile-gender" className="text-xs font-bold text-zinc-300 flex items-center gap-1">
                          <span>Jins</span>
                          {currentUser?.isProfileCompleted && <Lock className="w-3 h-3 text-zinc-500" />}
                        </label>
                        {currentUser?.isProfileCompleted && (
                          <span className="text-[10.5px] text-emerald-400 font-bold">Birlamchi (o'zgarmas)</span>
                        )}
                      </div>
                      <select
                        id="edit-profile-gender"
                        value={regGender}
                        onChange={(e) => setRegGender(e.target.value as any)}
                        disabled={Boolean(currentUser?.isProfileCompleted)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none disabled:bg-[#0E1018] disabled:text-zinc-500 disabled:cursor-not-allowed"
                      >
                        <option value="female" className="bg-[#11131C] text-white">Ayol / Qiz</option>
                        <option value="male" className="bg-[#11131C] text-white">Erkak / Yigit</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: Hudud va lokatsiya maxfiyligi */}
                <div className="border-t border-white/[0.08] pt-5 space-y-3.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Hudud va lokatsiya maxfiyligi
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="edit-profile-region" className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Viloyat
                      </label>
                      <select
                        id="edit-profile-region"
                        value={regRegion}
                        onChange={(e) => {
                          const reg = e.target.value;
                          setRegRegion(reg);
                          setRegDistrict(UZ_LOCATIONS[reg]?.[0] || '');
                        }}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none"
                      >
                        {Object.keys(UZ_LOCATIONS).map((reg, idx) => (
                          <option key={`prof_reg_${reg}_${idx}`} value={reg} className="bg-[#11131C] text-white">{reg}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="edit-profile-district" className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Tuman / Shahar
                      </label>
                      <select
                        id="edit-profile-district"
                        value={regDistrict}
                        onChange={(e) => setRegDistrict(e.target.value)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none"
                      >
                        {UZ_LOCATIONS[regRegion]?.map((dist, idx) => (
                          <option key={`prof_dist_${dist}_${idx}`} value={dist} className="bg-[#11131C] text-white">{dist}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="edit-profile-neighborhood" className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Mahalla / Ko'cha
                      </label>
                      <input
                        id="edit-profile-neighborhood"
                        type="text"
                        placeholder="Mahalla"
                        value={regNeighborhood}
                        onChange={(e) => setRegNeighborhood(e.target.value)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none placeholder:text-zinc-500"
                      />
                    </div>
                  </div>

                  {/* Clean Combined Location & Privacy Control */}
                  <div className="bg-[#171A26] rounded-2xl border border-white/[0.08] divide-y divide-white/[0.06]">
                    <div className="p-3.5 sm:px-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>Jonli GPS lokatsiya</span>
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Yaqin atrofdagi foydalanuvchilarga xaritada ko'rinish
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isLocationEnabled}
                        aria-label="Jonli GPS lokatsiyani yoqish"
                        onClick={() => handleToggleLocation(!isLocationEnabled)}
                        className={`w-12 h-7 rounded-full transition-colors duration-200 p-1 flex items-center shrink-0 cursor-pointer ${
                          isLocationEnabled ? 'bg-rose-600 justify-end' : 'bg-white/15 justify-start'
                        }`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                      </button>
                    </div>

                    <div className="p-3.5 sm:px-4 space-y-1.5">
                      <label htmlFor="edit-profile-privacy" className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>Lokatsiya maxfiyligi</span>
                      </label>
                      <select
                        id="edit-profile-privacy"
                        value={regLocationVisibility}
                        onChange={(e) => handleLocationVisibilityChange(e.target.value as any)}
                        className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-[#11131C] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 outline-none cursor-pointer"
                      >
                        <option value="mutual" className="bg-[#11131C] text-white">Faqat obunachilarim va tanishlarimga (Tavsiya etiladi)</option>
                        <option value="everyone" className="bg-[#11131C] text-white">Barchaga ko'rinsin</option>
                        <option value="ghost" className="bg-[#11131C] text-white">Hech kimga ko'rsatmaslik (Yashirin rejim)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 4: Aloqa va bio */}
                <div className="border-t border-white/[0.08] pt-5 space-y-3.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Aloqa va o'zingiz haqingizda
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label htmlFor="edit-profile-phone" className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Telefon raqam
                      </label>
                      <SmartPhoneInput
                        id="edit-profile-phone"
                        value={regPhone}
                        onChange={setRegPhone}
                        testId="edit-profile-phone-input"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-profile-telegram" className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Telegram
                      </label>
                      <input
                        id="edit-profile-telegram"
                        type="text"
                        placeholder="@username"
                        value={regTelegram}
                        onChange={(e) => setRegTelegram(e.target.value)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none placeholder:text-zinc-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-profile-instagram" className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Instagram
                      </label>
                      <input
                        id="edit-profile-instagram"
                        type="text"
                        placeholder="@handle"
                        value={regInstagram}
                        onChange={(e) => setRegInstagram(e.target.value)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#171A26] border border-white/10 text-xs font-semibold text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none placeholder:text-zinc-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="edit-profile-bio" className="block text-xs font-bold text-zinc-300 mb-1.5">
                      O'zingiz haqingizda (Bio)
                    </label>
                    <textarea
                      id="edit-profile-bio"
                      rows={3}
                      value={regBio}
                      onChange={(e) => setRegBio(e.target.value)}
                      placeholder="Qiziqishlaringiz va o'zingiz haqingizda qisqacha yozing..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-medium text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 transition-all outline-none placeholder:text-zinc-500 resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              {/* Sticky Modal Footer */}
              <div className="shrink-0 bg-[#141724] border-t border-white/[0.08] px-5 sm:px-7 py-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-5 min-h-[44px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 font-bold text-xs transition cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile || isUploadingBanner}
                  data-testid="edit-profile-submit-btn"
                  className="px-7 min-h-[44px] rounded-xl bg-gradient-to-r from-[#E11D48] to-rose-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-rose-950/40 transition disabled:opacity-50 cursor-pointer"
                >
                  {isSavingProfile ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* --- PUBLIC LOCATION SAFETY LIABILITY NOTICE MODAL (10s Countdown Timer - NO INNER SCROLL) --- */}
      {showLiabilityModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-[#11131C] rounded-[28px] max-w-md w-full p-6 sm:p-7 space-y-4 relative select-none shadow-[0_28px_80px_rgba(0,0,0,0.8)] border border-white/10 text-zinc-100"
          >
            <div className="flex items-center space-x-2.5 text-rose-400">
              <div className="p-2 rounded-2xl bg-rose-500/15 border border-rose-500/25">
                <AlertTriangle className="w-6 h-6 shrink-0 text-rose-400" />
              </div>
              <h3 className="font-bold text-base text-white">Xavfsizlik va Mas'uliyat Omonati</h3>
            </div>

            <div className="space-y-3 text-xs text-zinc-300 bg-rose-500/10 p-4 rounded-2xl border border-rose-500/25 leading-relaxed">
              <p className="font-bold text-rose-300">
                DIQQAT! Lokatsiyangizni barchaga ochiq rejimga o'tkazmoqdasiz!
              </p>
              <p>
                Ushbu rejim yoqilganda platformadagi barcha foydalanuvchilar sizning xaritadagi jonli GPS joylashuvingizni ko'ra oladilar va siz tomonga ko'chalar bo'ylab marshrut chizishlari mumkin bo'ladi.
              </p>
              <p className="font-bold text-white">
                Xavfsizlik qoidalari buzilsa, noxush holatlar yoki shaxsiy xavfsizlik bilan bog'liq har qanday muammo yuzaga kelsa, Alov.uz platformasi va Ma'muriyati mutlaqo javobgar emas va hech qanday mas'uliyatni o'z zimmasiga olmaydi.
              </p>
              <p className="text-[11px] text-zinc-400 italic">
                Ushbu qaror va uning oqibatlari uchun barcha mas'uliyat hamda xavf-xatarlarni to'liq va shaxsan o'z zimmasiga olasiz.
              </p>
            </div>

            <div className="text-center">
              {liabilityCountdown > 0 ? (
                <span className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/25 text-amber-300 text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping mr-1" />
                  Iltimos, diqqat bilan o'qing: {liabilityCountdown} soniya
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-[11px] font-bold">
                  O'qib chiqildi. Barcha shartlarni qabul qilishingiz mumkin.
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
                className="px-4 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 font-bold text-xs transition duration-200 shrink-0 cursor-pointer"
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
                    ? 'bg-white/10 text-zinc-500 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-[#E11D48] to-rose-600 hover:brightness-110 text-white shadow-rose-950/40 active:scale-[0.98] cursor-pointer'
                }`}
              >
                {liabilityCountdown > 0 ? `Kutib turing (${liabilityCountdown}s)` : 'Roziman va Tasdiqlayman'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* --- IMAGE CROP & ZOOM EDITING MODAL (Renders ON TOP of Edit Profile modal with z-[210]) --- */}
      {showCropModal && cropImageSrc && (
        <div
          data-testid="avatar-crop-modal"
          onClick={() => setShowCropModal(false)}
          className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#11131C] rounded-[28px] max-w-sm w-full p-5 space-y-4 relative select-none shadow-[0_28px_80px_rgba(0,0,0,0.85)] border border-white/10 text-zinc-100"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Crop className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-sm text-white">Rasmni moslashtirish</h3>
              </div>
              <button
                type="button"
                aria-label="Rasm tahrirlash oynasini yopish"
                onClick={() => setShowCropModal(false)}
                className="p-1.5 rounded-full bg-white/[0.06] text-zinc-400 hover:text-white hover:bg-rose-500/20 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-zinc-400">
              Barmoq/sichqoncha bilan rasmni suring va zoom orqali joylashuvini to'g'rilang:
            </p>

            {/* Circular Preview Container with Drag and Pinch capabilities */}
            <div 
              className="relative w-56 h-56 mx-auto rounded-full overflow-hidden border-4 border-rose-500 shadow-lg bg-[#09090D] cursor-move flex items-center justify-center touch-none"
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
                  className="p-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 cursor-pointer"
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
                  className="flex-1 accent-rose-500 h-1.5 bg-white/15 rounded-lg cursor-pointer"
                />
                <button 
                  type="button"
                  onClick={() => setCropScale(prev => Math.min(3, prev + 0.2))} 
                  className="p-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 px-2">
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
                className="px-3 py-2.5 rounded-full bg-white/[0.07] text-zinc-200 font-bold text-xs hover:bg-white/[0.14] transition-all flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tiklash</span>
              </button>
              <button 
                type="button"
                onClick={handleApplyCrop}
                className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-xs shadow-md hover:brightness-110 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>Saqlash va Tasdiqlash</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* --- 2ND-PERSON EDITORIAL PUBLIC USER PROFILE MODAL --- */}
      {selectedProfile && (
        <PublicProfileModal
          profile={selectedProfile}
          currentUser={currentUser}
          usersList={usersList}
          onlineUserIds={onlineUserIds}
          posts={postsList}
          onClose={() => setSelectedProfile(null)}
          onToggleFollow={(u) => handleToggleFollow(u.uid || u.id)}
          onOpenChat={(u) => {
            openChatWithUser(u);
            setSelectedProfile(null);
          }}
          onStartCall={(u) => {
            setActiveCallUser(u);
            setSelectedProfile(null);
          }}
          onShowRoute={(u) => {
            handleDrawRouteToUser(u);
            setSelectedProfile(null);
          }}
          onOpenConnections={(u, tab) => setFollowModalState({ user: u, tab })}
          onOpenProfile={openUserProfileByUid}
          onPostCreated={(post) =>
            setPostsList((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]))
          }
          onPostUpdated={(post) =>
            setPostsList((prev) => prev.map((p) => (p.id === post.id ? post : p)))
          }
          onPostDeleted={(postId) =>
            setPostsList((prev) => prev.filter((p) => p.id !== postId))
          }
          onOpenAuth={() => openAuthModalClean('login')}
        />
      )}

      {/* --- INTERACTIVE FOLLOWERS / FOLLOWING LIST MODAL --- */}
      <FollowListModal
        isOpen={Boolean(followModalState)}
        targetUser={followModalState?.user || null}
        initialTab={followModalState?.tab || 'followers'}
        currentUser={currentUser}
        usersList={usersList}
        onlineUserIds={onlineUserIds}
        onClose={() => setFollowModalState(null)}
        onOpenProfile={openUserProfileByUid}
        onToggleFollow={(u) => handleToggleFollow(u.uid || u.id)}
      />

      {/* --- PROFILE FACE ID VERIFICATION MODAL --- */}
      {showProfileFaceIdModal && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#11131C] rounded-[28px] max-w-md w-full p-6 relative shadow-[0_28px_80px_rgba(0,0,0,0.85)] border border-white/10 max-h-[92vh] overflow-y-auto text-zinc-100">
            <FaceIdVerificationModal
              apiBaseUrl={getBaseUrl()}
              userUid={currentUser.uid}
              userName={getSafeUserDisplayName(currentUser, currentUser.name || 'Foydalanuvchi')}
              onVerified={async (result) => {
                const facePhoto = result.photoUrl || result.photoDataUrl;
                const preservedGender =
                  currentUser.gender === 'male' || currentUser.gender === 'female'
                    ? currentUser.gender
                    : (result.userSelectedGender || currentUser.gender);
                const updatedUser = {
                  ...currentUser,
                  avatar: facePhoto,
                  gender: preservedGender,
                  faceId: {
                    ...result.faceId,
                    detectedGender: preservedGender || result.faceId?.detectedGender || null,
                    genderLabelUz: preservedGender ? genderToUzLabel(preservedGender) : result.faceId?.genderLabelUz,
                  },
                  isVerified: true,
                };
                const syncData = await safeFetchJson(getApiUrl('/api/users/sync'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user: updatedUser }),
                });
                const finalUser = syncData?.user || updatedUser;
                setCurrentUser(finalUser);
                setRegAvatar(resolveEffectiveProfileAvatar(finalUser));
                setUsersList(prev => {
                  const userMap = new Map<string, any>();
                  prev.forEach(u => userMap.set(u.uid || u.id, u));
                  userMap.set(finalUser.uid, finalUser);
                  return Array.from(userMap.values());
                });
                try {
                  localStorage.setItem('alov_current_user', JSON.stringify(finalUser));
                  localStorage.setItem('alov_user_' + finalUser.uid, JSON.stringify(finalUser));
                } catch {}
                setShowProfileFaceIdModal(false);
                showToast("Face ID surati profilingizga qo'yildi");
              }}
              onCancel={() => setShowProfileFaceIdModal(false)}
            />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-[#11131C] rounded-[28px] max-w-sm w-full p-6 space-y-4 relative border border-white/10 shadow-[0_28px_80px_rgba(0,0,0,0.85)] text-zinc-100"
          >
            <button 
              onClick={() => setShowGiftModal(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1 pr-8">
              <h3 className="text-xl font-editorial font-bold text-white flex items-center space-x-2">
                <Gift className="w-5 h-5 text-amber-400" />
                <span>Sovg'a yuborish</span>
              </h3>
              <p className="text-xs text-zinc-400 font-medium">
                {selectedChatUser?.name || 'Foydalanuvchi'}ga virtual sovg'a taqdim eting:
              </p>
            </div>

            <div className="bg-amber-500/10 border border-amber-400/25 rounded-2xl p-2.5 flex items-center justify-between text-xs font-bold text-amber-200">
              <span className="flex items-center space-x-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                <span>Balansingiz: {currentUser?.coins ?? 100} moneta</span>
              </span>
              <button 
                onClick={() => { setShowGiftModal(false); setShowTopUpModal(true); }}
                className="bg-amber-500 hover:bg-amber-400 text-black px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-xs cursor-pointer"
              >
                + To'ldirish
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
              {[
                { id: 'rose', name: 'Atirgul', coinPrice: 10, icon: '🌹' },
                { id: 'heart', name: 'Yurak', coinPrice: 30, icon: '💖' },
                { id: 'teddy', name: 'Ayiqcha', coinPrice: 50, icon: '🧸' },
                { id: 'crown', name: 'Toj', coinPrice: 100, icon: '👑' },
                { id: 'car', name: 'Sport mashina', coinPrice: 300, icon: '🚗' },
                { id: 'castle', name: 'Olmos qasr', coinPrice: 500, icon: '💎' },
              ].map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleSendGift(g)}
                  className="p-3 rounded-2xl border border-white/10 hover:border-amber-400/60 bg-[#171A26] hover:bg-amber-500/10 flex flex-col items-center justify-center space-y-1.5 transition active:scale-95 text-center group cursor-pointer"
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">{g.icon}</span>
                  <span className="text-xs font-bold text-white leading-tight">{g.name}</span>
                  <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md flex items-center space-x-1">
                    <Coins className="w-2.5 h-2.5 text-amber-400" />
                    <span>{g.coinPrice} moneta</span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* --- COIN SHOP MODAL (Ariza yuborish orqali Moneta olish) --- */}
      {showTopUpModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
          data-testid="coin-shop-modal"
          onClick={() => { setShowTopUpModal(false); setWalletNoticeMsg(''); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#11131C] text-zinc-100 rounded-[28px] max-w-md w-full p-5 sm:p-6 space-y-4 relative shadow-[0_28px_80px_rgba(0,0,0,0.75)] border border-white/10 max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => { setShowTopUpModal(false); setWalletNoticeMsg(''); }}
              aria-label="Do'konni yopish"
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-rose-600 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1 pr-10">
              <div className="flex items-center gap-2 text-amber-400">
                <Coins className="w-5 h-5 fill-amber-400 text-amber-500" />
                <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Moneta Do'koni</span>
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">
                Moneta buyurtma qilish
              </h3>
              <p className="text-xs text-zinc-400">
                Paketni tanlang va Telegram username yoki telefon raqamingizni qoldiring — admin bog'lanib to'lovdan so'ng monetani hisobingizga o'tkazib beradi.
              </p>
            </div>

            {walletNoticeMsg && (
              <div className="p-3 bg-amber-500/15 border border-amber-400/30 rounded-2xl text-amber-200 text-xs font-semibold">
                {walletNoticeMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Moneta Paketlari (Minimal 1 000 = 50 000 so'm)
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {COIN_SHOP_PACKAGES.map((pkg) => {
                  const selected = topUpPackage.coins === pkg.coins;
                  return (
                    <button
                      key={pkg.coins}
                      type="button"
                      data-testid={`coin-package-${pkg.coins}`}
                      onClick={() => setTopUpPackage({ coins: pkg.coins, uzs: pkg.uzs })}
                      className={cn(
                        'p-3.5 rounded-2xl border text-left transition relative active:scale-[0.98] cursor-pointer',
                        selected
                          ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/30'
                          : 'border-white/10 bg-[#171A26] hover:border-white/25'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-mono font-bold text-white tabular-nums">
                          {pkg.coins.toLocaleString()} 🪙
                        </span>
                        <span className="text-[10px] font-semibold text-amber-300">{pkg.label}</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-400 block mt-1 tabular-nums">
                        {pkg.uzs.toLocaleString()} so'm
                      </span>
                      {pkg.bonusText && (
                        <span className="text-[10px] text-zinc-400 block mt-0.5">{pkg.bonusText}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                To'lov usuli
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'click', name: 'Click' },
                  { id: 'payme', name: 'Payme' },
                  { id: 'uzum', name: 'Uzum Bank' },
                  { id: 'telegram_stars', name: 'Telegram Stars' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPaymentProvider(p.id as any)}
                    className={cn(
                      'py-2.5 px-3 rounded-xl border text-xs font-bold transition cursor-pointer text-center',
                      paymentProvider === p.id
                        ? 'border-rose-500 bg-rose-500/20 text-white'
                        : 'border-white/10 bg-[#171A26] text-zinc-300 hover:border-white/25'
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Aloqa uchun Telegram username yoki telefon raqami *
              </label>
              <input
                type="text"
                required
                value={coinRequestContact}
                onChange={(e) => setCoinRequestContact(e.target.value)}
                data-testid="coin-request-contact-input"
                placeholder="@username yoki +998 90 123 45 67"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-amber-400/35 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-zinc-400">
                Admin siz bilan bog'lanib to'lovni tasdiqlaganidan so'ng moneta balansga tushadi.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Izoh (ixtiyoriy)
              </label>
              <input
                type="text"
                value={coinRequestNote}
                onChange={(e) => setCoinRequestNote(e.target.value)}
                data-testid="coin-request-note-input"
                placeholder="Qo'shimcha xabar..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="button"
              disabled={isSubmittingCoinRequest}
              data-testid="submit-coin-request-btn"
              onClick={handleExecuteTopUp}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:brightness-110 text-white font-bold text-xs shadow-lg shadow-amber-950/40 transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4" />
              <span>
                {isSubmittingCoinRequest
                  ? 'Buyurtma yuborilmoqda...'
                  : `Buyurtma berish — ${topUpPackage.coins.toLocaleString()} moneta (${topUpPackage.uzs.toLocaleString()} so'm)`}
              </span>
            </button>

            {userCoinRequests.length > 0 && (
              <div className="pt-3 border-t border-white/10 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Mening buyurtmalarim ({userCoinRequests.length})
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {userCoinRequests.slice(0, 8).map((req) => (
                    <div
                      key={req.id}
                      data-testid={`user-coin-request-${req.id}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#171A26] border border-white/[0.07] text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-white">+{req.coinAmount.toLocaleString()} 🪙</span>
                        <span className="text-zinc-400 ml-2 text-[11px]">{req.uzsAmount.toLocaleString()} so'm</span>
                      </div>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0',
                          req.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : req.status === 'rejected'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        )}
                      >
                        {req.status === 'approved'
                          ? 'Tasdiqlangan'
                          : req.status === 'rejected'
                          ? 'Rad etilgan'
                          : 'Kutilmoqda'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- WITHDRAW DIAMONDS MODAL (FOR FEMALE USERS) --- */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-[#11131C] rounded-[28px] max-w-sm w-full p-6 space-y-4 relative border border-white/10 shadow-[0_28px_80px_rgba(0,0,0,0.85)] text-zinc-100 max-h-[90vh] overflow-y-auto"
          >
            <button 
              type="button"
              aria-label="Oynani yopish"
              onClick={() => setShowWithdrawModal(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1 pr-8">
              <h3 className="text-xl font-editorial font-bold text-white flex items-center space-x-2">
                <Wallet className="w-5 h-5 text-cyan-400" />
                <span>Pul yechib olish</span>
              </h3>
              <p className="text-xs text-zinc-400 font-medium">
                Karta va Telegram/telefon ma'lumotingizni qoldiring — admin bog'lanib pulni kartangizga qo'lda o'tkazib beradi:
              </p>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-400/25 rounded-2xl p-3.5 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-cyan-100">
                <span>Mavjud balans:</span>
                <span className="text-sm font-mono font-bold text-cyan-300">{formatDiamondsDisplay(currentUser?.diamonds)} Almaz</span>
              </div>
              <p className="text-[10px] text-cyan-300/80 font-medium">
                Kurs: 1 Almaz = 100 So'm • Minimal yechish: 100 Almaz (10,000 So'm)
              </p>
            </div>

            <form onSubmit={handleExecuteWithdrawal} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">Yechib olinadigan almaz miqdori:</label>
                <input 
                  type="number"
                  step="0.5"
                  min={100}
                  max={currentUser?.diamonds ?? 0}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                  data-testid="withdraw-amount-input"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-bold text-white focus:border-cyan-400 outline-none"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  Kartangizga o'tkaziladi: <span className="font-bold text-emerald-400">{calculateDiamondsToUzs(withdrawAmount).toLocaleString()} So'm</span>
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">Humo / Uzcard karta raqami (16 xonali):</label>
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
                  data-testid="withdraw-card-input"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-xs font-mono font-bold text-white placeholder:text-zinc-500 focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-cyan-300 mb-1">
                  Aloqa uchun Telegram username yoki telefon raqami *
                </label>
                <input 
                  type="text"
                  placeholder="@username yoki +998 90 123 45 67"
                  value={withdrawContact}
                  onChange={(e) => setWithdrawContact(e.target.value)}
                  data-testid="withdraw-contact-input"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-cyan-400/35 text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-cyan-400 outline-none"
                />
              </div>

              <button
                type="submit"
                data-testid="submit-withdraw-request-btn"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:brightness-110 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Wallet className="w-4 h-4" />
                <span>Buyurtma berish (Adminga yuborish)</span>
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* --- ADMIN PANEL MODAL (@Salikh_07) --- */}
      {showAdminPanel && isAdminTelegramUser(currentUser) && (
        <AdminPanelModal
          currentUser={currentUser}
          apiBaseUrl={getBaseUrl()}
          socket={socketRef.current}
          onClose={() => setShowAdminPanel(false)}
          onOpenUserProfile={(uid, snapshot) => {
            const { isSelf } = resolveExactUserByUid(uid, usersList, currentUser, snapshot);
            if (isSelf) {
              setShowAdminPanel(false);
            }
            openUserProfileByUid(uid, snapshot);
          }}
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

      {/* --- MANDATORY TELEGRAM CHANNEL SUBSCRIPTION GATE --- */}
      {(() => {
        const tgWebAppUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
        const isTelegramContext = Boolean(tgWebAppUser?.id || currentUser?.telegramChatId || currentUser?.uid?.startsWith('tg_'));
        const gateEval = evaluateMandatorySubscriptionAccess({
          config: subscriptionConfig,
          user: currentUser,
          isTelegramContext,
          isSubscribed: false,
        });
        if (!gateEval.gateRequired || !showSubscriptionGate) return null;
        return (
          <MandatorySubscriptionGate
            config={subscriptionConfig}
            isSubscribed={isChannelSubscribed}
            isChecking={isCheckingSubscription}
            errorMsg={subscriptionError}
            onVerifySubscription={() => void verifyMandatorySubscription()}
            onContinue={() => setShowSubscriptionGate(false)}
          />
        );
      })()}

      {/* --- NON-ADMIN CAPTURE / SCREENSHOT PRIVACY SHIELD --- */}
      {captureShieldVisible && shouldEnableCaptureProtection(currentUser) && (
        <div
          data-testid="capture-privacy-shield"
          className="fixed inset-0 z-[260] bg-black flex flex-col items-center justify-center p-6 text-center select-none"
        >
          <ShieldCheck className="w-12 h-12 text-rose-500 mb-3" />
          <p className="text-lg font-editorial font-bold text-white">Xavfsizlik himoyasi faol</p>
          <p className="text-xs text-zinc-400 max-w-sm mt-1">
            Alov.uz foydalanuvchilarining shaxsiy ma&apos;lumotlari va kontentini skrinshot yoki ekran yozuviga olish taqiqlangan.
          </p>
        </div>
      )}

      {/* --- NON-INTRUSIVE TOAST NOTIFICATION --- */}
      {toastMsg && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[180] px-4 py-2.5 rounded-full bg-[#151824] text-white text-xs font-bold shadow-[0_12px_36px_rgba(0,0,0,0.65)] border border-white/15 flex items-center gap-2 pointer-events-none"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </motion.div>
      )}

    </div>
    </MotionConfig>
  );
}
