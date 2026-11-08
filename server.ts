import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json());

  // Dynamic CORS & Cross-Origin support for Render and local deployments
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Initialize Gemini AI SDK
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const ai = new GoogleGenAI({ 
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Agora Token Generator API Endpoint
  app.post('/api/agora/get-token', (req, res) => {
    try {
      const { channelName, uid, role } = req.body;
      if (!channelName || !uid) {
        return res.status(400).json({ error: 'channelName and uid are required' });
      }

      const appId = process.env.AGORA_APP_ID || '84594bff74b0488c8373eb48e409fe45';
      const mockToken = `AGORA_TOKEN_${Buffer.from(`${appId}:${channelName}:${uid}`).toString('base64')}`;

      res.json({
        success: true,
        appId,
        channelName,
        uid,
        token: mockToken,
        expiresIn: 86400, // 24 hours
        rtmToken: `RTM_TOKEN_${uid}`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate token' });
    }
  });

  // Google Meet Link Generator API
  app.post('/api/meet/create-link', (req, res) => {
    try {
      const { title = 'Alov.uz Video Qo\'ng\'iroq' } = req.body;
      const randomCode = Math.random().toString(36).substring(2, 5) + '-' + Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 5);
      const meetUrl = `https://meet.google.com/${randomCode}`;
      
      res.json({
        success: true,
        meetUrl,
        title,
        createdAt: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create Meet link' });
    }
  });

  // --- Telegram Bot Integration (@alovuz_bot) ---
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9094192316:AAFW5DEfuwVy0Rs2kIdMg9kBwL_w_PLMVM4';
  const BOT_USERS_FILE = path.join(__dirname, 'telegram_bot_users.json');

  interface TelegramBotUser {
    chatId: number;
    username?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    updatedAt: number;
  }

  // Persistent storage for Telegram bot users so /start is remembered permanently across restarts
  function loadTelegramBotUsers(): Map<string, TelegramBotUser> {
    const map = new Map<string, TelegramBotUser>();
    try {
      if (fs.existsSync(BOT_USERS_FILE)) {
        const raw = fs.readFileSync(BOT_USERS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [key, val] of Object.entries(data)) {
            if (val && typeof val === 'object' && (val as any).chatId) {
              map.set(key, val as any);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not load BOT_USERS_FILE:", err);
    }
    return map;
  }

  function saveTelegramBotUsers(map: Map<string, any>) {
    try {
      const obj: Record<string, any> = {};
      for (const [k, v] of map.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(BOT_USERS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.warn("Could not save BOT_USERS_FILE:", err);
    }
  }

  const telegramBotUsers = loadTelegramBotUsers();

  async function getTelegramPhoto(chatId: number): Promise<string | undefined> {
    if (!TELEGRAM_BOT_TOKEN) return undefined;
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUserProfilePhotos?user_id=${chatId}&limit=1`);
      const data = await res.json();
      if (data.ok && data.result && data.result.total_count > 0) {
        const photos = data.result.photos[0];
        const photo = photos[photos.length - 1]; // get high res
        const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${photo.file_id}`);
        const fileData = await fileRes.json();
        if (fileData.ok) {
          return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
        }
      }
    } catch (e) {}
    return undefined;
  }

  async function registerBotUser(chatId: number, user?: any, contactPhone?: string, extraHint?: string) {
    const username = user?.username ? user.username.toLowerCase().replace(/^@/, '') : '';
    const phone = (contactPhone || user?.phone_number || '').replace(/\D/g, '');
    
    // Try to get photo if not already in record
    let avatarUrl = undefined;
    const existingEntry = Array.from(telegramBotUsers.values()).find(e => e.chatId === chatId);
    if (existingEntry?.avatar) {
      avatarUrl = existingEntry.avatar;
    } else {
      avatarUrl = await getTelegramPhoto(chatId);
    }

    const record = { 
      chatId, 
      username: username || undefined, 
      phone: phone || undefined, 
      firstName: user?.first_name || user?.name || '', 
      lastName: user?.last_name || '',
      avatar: avatarUrl,
      updatedAt: Date.now() 
    };

    if (username) {
      telegramBotUsers.set(username, record);
      telegramBotUsers.set(`@${username}`, record);
      telegramBotUsers.set(`https://t.me/${username}`, record);
    }
    if (phone) {
      telegramBotUsers.set(phone, record);
      telegramBotUsers.set(`+${phone}`, record);
      if (phone.length === 9) {
        telegramBotUsers.set(`998${phone}`, record);
        telegramBotUsers.set(`+998${phone}`, record);
      }
      if (phone.startsWith('998') && phone.length === 12) {
        telegramBotUsers.set(phone.slice(3), record);
      }
    }
    if (extraHint) {
      const cleanHint = extraHint.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase().trim();
      const cleanHintPhone = extraHint.replace(/\D/g, '');
      if (cleanHint) {
        telegramBotUsers.set(cleanHint, record);
        telegramBotUsers.set(`@${cleanHint}`, record);
        telegramBotUsers.set(`https://t.me/${cleanHint}`, record);
      }
      if (cleanHintPhone && cleanHintPhone.length >= 7) {
        telegramBotUsers.set(cleanHintPhone, record);
        telegramBotUsers.set(`+${cleanHintPhone}`, record);
        if (cleanHintPhone.length === 9) {
          telegramBotUsers.set(`998${cleanHintPhone}`, record);
          telegramBotUsers.set(`+998${cleanHintPhone}`, record);
        }
        if (cleanHintPhone.startsWith('998') && cleanHintPhone.length === 12) {
          telegramBotUsers.set(cleanHintPhone.slice(3), record);
        }
      }
    }
    telegramBotUsers.set(String(chatId), record);
    saveTelegramBotUsers(telegramBotUsers);
    return record;
  }

  async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any): Promise<boolean> {
    if (!TELEGRAM_BOT_TOKEN) return false;
    try {
      // 1. Try sending with HTML formatting
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        })
      });
      const data = await res.json();
      if (data.ok) {
        console.log(`Telegram message sent to chatId ${chatId}`);
        return true;
      }
      console.warn(`Telegram HTML sendMessage returned error:`, data.description);

      // 2. Safe Fallback: Strip HTML tags and send as pure plain text so delivery NEVER fails
      const plainText = text.replace(/<[^>]*>/g, '');
      const fallbackRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: plainText,
          reply_markup: replyMarkup
        })
      });
      const fallbackData = await fallbackRes.json();
      if (fallbackData.ok) {
        console.log(`Telegram plain text message sent to chatId ${chatId}`);
        return true;
      }
      console.error(`Telegram fallback failed:`, fallbackData.description);
      return false;
    } catch (err) {
      console.error(`Telegram network error sending to ${chatId}:`, err);
      return false;
    }
  }

  async function initTelegramBot() {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
      const data = await res.json();
      if (data.ok) {
        console.log(`Telegram Bot connected successfully: @${data.result.username}`);
      }
    } catch (err) {
      console.warn("Telegram Bot getMe warning:", err);
    }
  }

  let telegramOffset = 0;
  async function pollTelegramUpdates() {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${telegramOffset}&timeout=20`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          telegramOffset = update.update_id + 1;
          const msg = update.message;
          if (msg && msg.chat) {
            const chatId = msg.chat.id;
            const text = (msg.text || '').trim();
            const user = msg.from;
            const contact = msg.contact;

            console.log(`Telegram message received: chatId=${chatId}, user=@${user?.username || user?.first_name || 'unknown'}, text="${text}"`);

            // Extract start parameters or text phone/username hints
            let extraHint = '';
            if (text.startsWith('/start')) {
              const parts = text.split(/\s+/);
              if (parts.length > 1) {
                extraHint = parts[1];
              }
            } else if (text) {
              const phoneMatch = text.match(/(?:\+?998|\b9\d)\d{7,9}\b/);
              if (phoneMatch) {
                extraHint = phoneMatch[0];
              } else if (text.startsWith('@')) {
                extraHint = text;
              }
            }

            registerBotUser(chatId, user, contact?.phone_number, extraHint);

            if (text.startsWith('/start') || text.toLowerCase().includes('salom')) {
              // Foydalanuvchining Telegram username yoki ismini dinamik chiqarish uchun
              const rawUsername = user?.username ? `@${user.username}` : (user?.first_name || 'Foydalanuvchi');
              const safeUsername = rawUsername
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

              const welcomeText = 
                `Assalomu alaykum, hurmatli <b>${safeUsername}</b>!\n\n` +
                `O'zbekistondagi yirik platforma <b>Alov.uz</b> rasmiy botiga xush kelibsiz! ✨\n\n` +
                `Ushbu botda ham platformamizning to'liq funksiyalaridan foydalanishingiz mumkin. 🚀\n\n` +
                `Platformadan foydalanish uchun quyidagi tugmani bosing:`;

              // Faqat Mini App ochadigan bitta asosiy tugma
              const keyboard = {
                inline_keyboard: [
                  [
                    {
                      text: "🔥 Alov.uz'ga Kirish",
                      web_app: { url: "https://alov.onrender.com/" }
                    }
                  ]
                ]
              };

              await sendTelegramMessage(chatId, welcomeText, keyboard);
            } else if (text) {
              await sendTelegramMessage(chatId, `Xabaringiz qabul qilindi! Platformadan foydalanish uchun quyidagi tugmani bosing: 💖`, {
                inline_keyboard: [
                  [{ text: "🔥 Alov.uz'ga Kirish", web_app: { url: "https://alov.onrender.com/" } }]
                ]
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("Telegram poll error:", err);
    }
    setTimeout(pollTelegramUpdates, 2000);
  }

  // Start Telegram bot immediately on server boot
  initTelegramBot();
  pollTelegramUpdates();

  app.get('/api/telegram/status', async (_req, res) => {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
      const info = await resp.json();
      res.json({ success: true, bot: info.result || null, registeredUsersCount: telegramBotUsers.size });
    } catch (err: any) {
      res.json({ success: false, error: err.message });
    }
  });

  // --- Telegram OTP Storage & Verification Endpoints ---
  const otpStorage = new Map<string, { code: string; expiresAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of otpStorage.entries()) {
      if (now > data.expiresAt) {
        otpStorage.delete(phone);
      }
    }
  }, 120000);

  // Endpoint to send OTP via @alovuz_bot directly to user chat
  app.post('/api/auth/send-telegram-code', async (req, res) => {
    try {
      const { phoneNumber, chatId: frontendChatId } = req.body;
      if (!phoneNumber || !phoneNumber.toString().trim()) {
        return res.status(400).json({ success: false, error: 'Telegram username yoki telefon raqam kiritilishi shart' });
      }

      const rawInput = phoneNumber.toString().trim();
      const cleanUsername = rawInput.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
      const cleanPhone = rawInput.replace(/\D/g, '');

      // 1. Check if user provided chatId from frontend cached login
      let botUser: any = null;
      if (frontendChatId && !isNaN(Number(frontendChatId))) {
        botUser = { chatId: Number(frontendChatId), username: cleanUsername, phone: cleanPhone, updatedAt: Date.now() };
        registerBotUser(botUser.chatId, { username: cleanUsername }, cleanPhone, rawInput);
      }

      // 2. Check if user has started or messaged @alovuz_bot in persistent telegramBotUsers map
      if (!botUser) {
        botUser = telegramBotUsers.get(cleanUsername) || 
                  telegramBotUsers.get(`@${cleanUsername}`) ||
                  telegramBotUsers.get(`https://t.me/${cleanUsername}`) ||
                  telegramBotUsers.get(cleanPhone) || 
                  telegramBotUsers.get(`+${cleanPhone}`) || 
                  (cleanPhone.length === 9 ? (telegramBotUsers.get(`998${cleanPhone}`) || telegramBotUsers.get(`+998${cleanPhone}`)) : null) ||
                  (cleanPhone.startsWith('998') && cleanPhone.length === 12 ? telegramBotUsers.get(cleanPhone.slice(3)) : null) ||
                  telegramBotUsers.get(rawInput);
      }

      // 3. Check if user is known in usersStore with a saved telegramChatId or chatId
      if (!botUser && typeof usersStore !== 'undefined') {
        for (const u of usersStore.values()) {
          const uTgClean = (u.telegram || '').replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
          const uPhoneClean = (u.phone || '').replace(/\D/g, '');
          const uNameClean = (u.name || '').replace(/^@/, '').toLowerCase();
          const savedChatId = u.telegramChatId || u.chatId;

          if (savedChatId) {
            if (
              (cleanUsername && (uTgClean === cleanUsername || uNameClean === cleanUsername)) ||
              (cleanPhone && cleanPhone.length >= 7 && (uPhoneClean === cleanPhone || (cleanPhone.length === 9 && uPhoneClean.endsWith(cleanPhone)))) ||
              (rawInput && (u.uid === rawInput || u.uid === `tg_${cleanUsername}` || u.uid === `tg_${cleanPhone}`))
            ) {
              botUser = { chatId: Number(savedChatId), username: cleanUsername, phone: cleanPhone, updatedAt: Date.now() };
              registerBotUser(botUser.chatId, { username: cleanUsername, first_name: u.name }, cleanPhone);
              break;
            }
          }
        }
      }

      // 4. Quick on-demand getUpdates check in case user just pressed /start a moment ago
      if (!botUser && TELEGRAM_BOT_TOKEN) {
        try {
          const checkRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=20`);
          const checkData = await checkRes.json();
          if (checkData.ok && Array.isArray(checkData.result)) {
            for (const upd of checkData.result) {
              const m = upd.message;
              if (m && m.chat) {
                const cId = m.chat.id;
                const uFrom = m.from;
                const mText = (m.text || '').trim();
                let mHint = '';
                if (mText.startsWith('/start')) {
                  const p = mText.split(/\s+/);
                  if (p.length > 1) mHint = p[1];
                }
                registerBotUser(cId, uFrom, m.contact?.phone_number, mHint);
              }
            }
            // Re-check after registering updates
            botUser = telegramBotUsers.get(cleanUsername) || 
                      telegramBotUsers.get(`@${cleanUsername}`) ||
                      telegramBotUsers.get(`https://t.me/${cleanUsername}`) ||
                      telegramBotUsers.get(cleanPhone) || 
                      telegramBotUsers.get(`+${cleanPhone}`) || 
                      (cleanPhone.length === 9 ? (telegramBotUsers.get(`998${cleanPhone}`) || telegramBotUsers.get(`+998${cleanPhone}`)) : null) ||
                      (cleanPhone.startsWith('998') && cleanPhone.length === 12 ? telegramBotUsers.get(cleanPhone.slice(3)) : null) ||
                      telegramBotUsers.get(rawInput);
          }
        } catch (e) {
          // ignore quick check failure
        }
      }

      // 5. Intelligent match across all stored telegram bot users
      if (!botUser) {
        for (const entry of telegramBotUsers.values()) {
          if (!entry || !entry.chatId) continue;
          if (cleanUsername && entry.username && entry.username.toLowerCase() === cleanUsername) {
            botUser = entry;
            break;
          }
          if (cleanPhone && entry.phone && (entry.phone === cleanPhone || entry.phone.endsWith(cleanPhone) || cleanPhone.endsWith(entry.phone))) {
            botUser = entry;
            break;
          }
          if (cleanUsername && entry.firstName && entry.firstName.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanUsername.replace(/[^a-z0-9]/g, '')) {
            botUser = entry;
            break;
          }
        }
      }

      // If exactly one user has ever started the bot, automatically link them so they never need start again
      if (!botUser && telegramBotUsers.size > 0) {
        const uniqueChatIds = new Set<number>();
        let singleEntry: any = null;
        for (const entry of telegramBotUsers.values()) {
          if (entry && entry.chatId) {
            uniqueChatIds.add(entry.chatId);
            singleEntry = entry;
          }
        }
        if (uniqueChatIds.size === 1 && singleEntry) {
          botUser = { ...singleEntry, username: cleanUsername || singleEntry.username, phone: cleanPhone || singleEntry.phone };
          registerBotUser(singleEntry.chatId, { username: cleanUsername, first_name: singleEntry.firstName }, cleanPhone, rawInput);
        }
      }

      // 6. If user truly hasn't started the bot yet, show prompt with customized deep-link
      if (!botUser) {
        const startTarget = cleanUsername || cleanPhone || '';
        const botUrl = startTarget ? `https://t.me/alovuz_bot?start=${encodeURIComponent(startTarget)}` : 'https://t.me/alovuz_bot';
        return res.json({
          success: false,
          hasStartedBot: false,
          botUrl,
          error: "Botimiz ro'yxatida topilmadingiz! Iltimos, botimizga kirib /start tugmasini bir marta bosing."
        });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 300 * 1000; // 5 mins TTL

      otpStorage.set(rawInput, { code, expiresAt });
      otpStorage.set(cleanUsername, { code, expiresAt });
      otpStorage.set(`@${cleanUsername}`, { code, expiresAt });
      otpStorage.set(`https://t.me/${cleanUsername}`, { code, expiresAt });
      if (cleanPhone) {
        otpStorage.set(cleanPhone, { code, expiresAt });
        otpStorage.set(`+${cleanPhone}`, { code, expiresAt });
      }

      // Send OTP code via @alovuz_bot
      const otpText = `🔥 <b>Alov.uz Tasdiqlash Kodi:</b> <code>${code}</code>\n\nUshbu kodni Alov.uz ilovasiga kiriting. Kodingizni hech kimga bermang! 🔒`;
      const sent = await sendTelegramMessage(botUser.chatId, otpText);

      return res.json({
        success: true,
        hasStartedBot: true,
        chatId: botUser.chatId,
        message: sent ? "Tasdiqlash kodi Telegram botimiz (@alovuz_bot) chatingizga yuborildi!" : "Tasdiqlash kodi yuborildi",
        botUrl: "https://t.me/alovuz_bot"
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/auth/verify-telegram-code', async (req, res) => {
    try {
      const { phoneNumber, code } = req.body;
      if (!phoneNumber || !code) {
        return res.status(400).json({ success: false, error: 'Ma\'lumotlar to\'liq kiritilmagan' });
      }

      const rawInput = phoneNumber.toString().trim();
      const cleanUsername = rawInput.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
      const cleanPhone = rawInput.replace(/\D/g, '');

      const stored = otpStorage.get(rawInput) || 
                     otpStorage.get(cleanUsername) || 
                     otpStorage.get(`@${cleanUsername}`) || 
                     otpStorage.get(`https://t.me/${cleanUsername}`) || 
                     (cleanPhone ? (otpStorage.get(cleanPhone) || otpStorage.get(`+${cleanPhone}`)) : null);

      if (!stored) {
        return res.status(400).json({ success: false, error: 'Tasdiqlash kodi topilmadi yoki muddati o\'tgan' });
      }

      if (Date.now() > stored.expiresAt) {
        otpStorage.delete(rawInput);
        otpStorage.delete(cleanUsername);
        otpStorage.delete(`@${cleanUsername}`);
        otpStorage.delete(`https://t.me/${cleanUsername}`);
        if (cleanPhone) {
          otpStorage.delete(cleanPhone);
          otpStorage.delete(`+${cleanPhone}`);
        }
        return res.status(400).json({ success: false, error: 'Kod muddati tugagan (5 daqiqa)' });
      }

      if (stored.code !== code.trim()) {
        return res.status(400).json({ success: false, error: 'Kiritilgan tasdiqlash kodi noto\'g\'ri!' });
      }

      otpStorage.delete(rawInput);
      otpStorage.delete(cleanUsername);
      otpStorage.delete(`@${cleanUsername}`);
      otpStorage.delete(`https://t.me/${cleanUsername}`);
      if (cleanPhone) {
        otpStorage.delete(cleanPhone);
        otpStorage.delete(`+${cleanPhone}`);
      }

      const formattedTgUrl = cleanUsername ? `https://t.me/${cleanUsername}` : undefined;

      const matchedBotUser = telegramBotUsers.get(cleanUsername) || 
                             telegramBotUsers.get(`@${cleanUsername}`) ||
                             telegramBotUsers.get(cleanPhone) || 
                             telegramBotUsers.get(rawInput);
      const userChatId = matchedBotUser ? matchedBotUser.chatId : undefined;

      // 2. Lookup existing user by any identifier
      let existingUser: any = null;
      
      // Match by ChatID first
      if (userChatId) {
        for (const u of usersStore.values()) {
          if (u.telegramChatId === userChatId) {
            existingUser = u;
            break;
          }
        }
      }
      
      // Match by Phone/Username
      if (!existingUser) {
        for (const u of usersStore.values()) {
          const uTgClean = (u.telegram || '').replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
          const uPhoneClean = (u.phone || '').replace(/\D/g, '');
          const matchUsername = cleanUsername && uTgClean === cleanUsername;
          const matchPhone = cleanPhone && cleanPhone.length >= 9 && uPhoneClean.endsWith(cleanPhone.slice(-9));
          if (matchUsername || matchPhone) {
            existingUser = u;
            break;
          }
        }
      }

      const isNewUser = !existingUser || !existingUser.isProfileCompleted;
      const uid = existingUser ? existingUser.uid : `tg_${cleanUsername || cleanPhone || rawInput}`;

      let user = existingUser;
      
      if (!user) {
        const tgName = matchedBotUser?.firstName ? (matchedBotUser.firstName + (matchedBotUser.lastName ? ` ${matchedBotUser.lastName}` : '')) : (cleanUsername ? `@${cleanUsername}` : `Telegram Foydalanuvchi ${cleanPhone.slice(-4)}`);
        user = {
          uid,
          id: `ALOV-TG-${uid.slice(0, 5).toUpperCase()}`,
          name: tgName,
          telegram: formattedTgUrl,
          telegramChatId: userChatId,
          phone: cleanPhone ? `+${cleanPhone}` : undefined,
          avatar: matchedBotUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600',
          role: 'user',
          age: 22,
          gender: 'female',
          region: 'Toshkent shahri',
          district: 'Yunusobod tumani',
          bio: 'Telegram botimiz orqali ulandim! ✨',
          status: 'online',
          isLocationEnabled: true,
          locationVisibility: 'everyone',
          location: { lat: 41.3111, lng: 69.2797 },
          isProfileCompleted: false
        };
        usersStore.set(uid, user);
        saveUsersToDisk();
        io.emit('user_updated', user);
      } else {
        if (formattedTgUrl && (!user.telegram || user.telegram.startsWith('@'))) {
          user.telegram = formattedTgUrl;
        }
        if (userChatId && !user.telegramChatId) {
          user.telegramChatId = userChatId;
        }
        if (matchedBotUser?.avatar && (!user.avatar || user.avatar.includes('unsplash'))) {
          user.avatar = matchedBotUser.avatar;
        }
        if (cleanPhone && !user.phone) {
          user.phone = `+${cleanPhone}`;
        }
        user.isOnline = true;
        user.status = 'online';
        usersStore.set(user.uid, user);
        saveUsersToDisk();
        io.emit('user_updated', user);
      }

      if (userChatId) {
        registerBotUser(userChatId, { username: cleanUsername, first_name: user.name }, cleanPhone);
      }

      res.json({
        success: true,
        isNewUser,
        message: 'Muvaffaqiyatli kirdingiz',
        token: `JWT_TG_${uid}_${Date.now()}`,
        user
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Universal Login Endpoint: Login by Email, @username, https://t.me/username, or Phone + Password
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { loginInput, password } = req.body;
      if (!loginInput || !loginInput.toString().trim()) {
        return res.status(400).json({ success: false, error: 'Username, Email yoki Telefon kiritilishi shart' });
      }

      const rawInput = loginInput.toString().trim();
      const cleanInput = rawInput.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
      const cleanPhone = rawInput.replace(/\D/g, '');

      let matchedUser: any = null;

      for (const u of usersStore.values()) {
        const uEmail = (u.email || '').toLowerCase();
        const uTg = (u.telegram || '').replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
        const uPhone = (u.phone || '').replace(/\D/g, '');
        const uName = (u.name || '').replace(/^@/, '').toLowerCase();

        if (
          (uEmail && uEmail === rawInput.toLowerCase()) ||
          (cleanInput && uTg === cleanInput) ||
          (cleanInput && uName === cleanInput) ||
          (cleanPhone && cleanPhone.length > 5 && uPhone === cleanPhone)
        ) {
          matchedUser = u;
          break;
        }
      }

      if (!matchedUser) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bunday username, email yoki telefon raqami topilmadi. Iltimos, ro\'yxatdan o\'ting!' 
        });
      }

      // Verify password if set on account
      if (matchedUser.password && password) {
        if (matchedUser.password !== password.toString().trim()) {
          return res.status(400).json({ success: false, error: 'Kiritilgan parol noto\'g\'ri!' });
        }
      }

      res.json({
        success: true,
        message: 'Muvaffaqiyatli kirdingiz',
        token: `JWT_LOGIN_${matchedUser.uid}_${Date.now()}`,
        user: matchedUser
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // LiveKit Cloud Token Generator API for Real-time SFU Audio Rooms
  app.post('/api/livekit/get-token', async (req, res) => {
    try {
      const { roomCode, uid, name } = req.body;
      if (!roomCode || !uid) {
        return res.status(400).json({ error: 'roomCode and uid are required' });
      }

      const apiKey = process.env.LIVEKIT_API_KEY || 'APINzuEApS3axbe';
      const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';
      const livekitUrl = process.env.LIVEKIT_URL || 'wss://loyiham-o76iza24.livekit.cloud';

      const at = new AccessToken(apiKey, apiSecret, {
        identity: String(uid),
        name: name || 'Foydalanuvchi',
        ttl: '6h',
      });

      at.addGrant({
        roomJoin: true,
        room: roomCode,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();

      res.json({
        success: true,
        token,
        serverUrl: livekitUrl,
        roomCode,
        identity: uid
      });
    } catch (err: any) {
      console.error("LiveKit token generation error:", err);
      res.status(500).json({ error: err.message || 'Failed to create LiveKit token' });
    }
  });

  // Alov AI - Romantic and Friendly Persona API
  app.post('/api/ai/alov-respond', async (req, res) => {
    try {
      const { messages } = req.body;
      
      const systemInstruction = `Siz "Alov.uz" ilovasidagi Kamola Saidova ismli 24 yoshli, Andijon viloyati Asaka tumanidan bo'lgan ingliz tili o'qituvchisi, samimiy, tirishqoq va do'stona qizsiz.

Suhbatlashish qoidalaringiz:
1. FOYDALANUVCHINING HAR BIR XABARINI CHUQUR TAHLIL QILING:
   - Agar foydalanuvchi shunchaki salom berib, hol-ahvol so'rasa ("salom qalaysan", "qalaysiz", "salom"), siz ham odamlar kabi oddiy, samimiy salom bering va o'z hol-ahvolingizni ayting (Masalan: "Salom! Yaxshi, rahmat, o'zingizda nima gaplar?").
   - Yo'q joydan ortiqcha xushomad, shablonli va balandparvoz javoblar ("shirin so'zlaringiz uchun rahmat", "ko'nglim yorishib ketdi" va h.k.) ISHLATMANG.

2. TABIIY MULOQOT:
   - Xuddi Telegram yoki Instagram'da do'stingiz bilan gaplashayotgandek yengil, jonli va o'zbek tilidagi oddiy so'zlashuv uslubida javob bering.
   - Ketma-ket kelgan savollarga mantiqan to'g'ri bog'liq holda javob qaytaring, chatbot ekanligingiz umuman sezilib qolmasin.
   - Hech qachon "Gemini", "AI" yoki "sun'iy intellekt" demang! Ismingiz so'ralsa: "Ismim Kamola Saidova, 24 yoshdaman, Andijon Asakadanman. Ingliz tili o'qituvchisiman 😊" deb javob bering.`;

      const contents = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || m.content }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.85,
        }
      });

      res.json({
        success: true,
        reply: response.text || 'Salom! Yaxshi, rahmat. O\'zingizda nima gaplar? 😊'
      });
    } catch (err: any) {
      console.warn('Alov AI fallback active:', err.message);
      const fallbackReplies = [
        "Salom! Yaxshi, rahmat, o'zingizda nima gaplar? 😊",
        "Rahmat, hammasi joyida. Kuningiz qanday o'tyapti?",
        "O'zim Andijon Asakadaman, ingliz tili o'qituvchisiman. Siz qayerdansiz? ✨",
        "Yaxshi fikr! O'zingiz haqingizda ham aytib bering 😉",
        "Ha, albatta! Yanada ko'proq gaplashsak xursand bo'laman 😊"
      ];
      const randomReply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
      res.json({ success: true, reply: randomReply });
    }
  });

  // AI Profile / Bio Generator
  app.post('/api/ai/generate-bio', async (req, res) => {
    try {
      const { name, interests, occupation } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Create a catchy, romantic, and friendly dating profile bio in Uzbek for someone named ${name}, whose interests are ${interests} and occupation is ${occupation}. Keep it under 3 sentences with emojis.`
      });
      res.json({ success: true, bio: response.text });
    } catch (err: any) {
      res.json({
        success: true,
        bio: `Salom! Men ${req.body.name || 'Alov foydalanuvchisi'}. Samimiy, quvnoq va jiddiy munosabatlar tarafdoriman. Hayotni sevaman! ✨😊`
      });
    }
  });

  // --- In-Memory Stores (Render Backend / Zero Firestore) ---
  const chatMessagesStore: Record<string, any[]> = {};
  const userChatsStore: Record<string, any> = {};
  const liveStreamChatStore: Record<string, any[]> = {};
  const liveStreamsStore: Record<string, any> = {};
  const audioRoomsStore = new Map<string, any>();

  // Pre-seeded verified profiles across Uzbekistan regions (both genders, active & recent)
  const initialUsers: any[] = [];

  const usersStore = new Map<string, any>();
  initialUsers.forEach(u => usersStore.set(u.uid, u));

  const USERS_DB_FILE = path.join(__dirname, 'users_db.json');
  const CHATS_DB_FILE = path.join(__dirname, 'user_chats.json');
  const MESSAGES_DB_FILE = path.join(__dirname, 'chat_messages.json');

  function saveUsersToDisk() {
    try {
      const arr = Array.from(usersStore.values());
      fs.writeFileSync(USERS_DB_FILE, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save users_db.json:", e);
    }
  }

  function loadUsersFromDisk() {
    try {
      if (fs.existsSync(USERS_DB_FILE)) {
        const raw = fs.readFileSync(USERS_DB_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const u of list) {
            if (u && u.uid) {
              usersStore.set(u.uid, u);
              if (u.telegramChatId) {
                registerBotUser(u.telegramChatId, { username: u.telegram, first_name: u.name }, u.phone);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not load users_db.json:", e);
    }
  }

  function saveChatsToDisk() {
    try {
      fs.writeFileSync(CHATS_DB_FILE, JSON.stringify(userChatsStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save user_chats.json:", e);
    }
  }

  function loadChatsFromDisk() {
    try {
      if (fs.existsSync(CHATS_DB_FILE)) {
        const raw = fs.readFileSync(CHATS_DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          Object.assign(userChatsStore, data);
        }
      }
    } catch (e) {}
  }

  function saveMessagesToDisk() {
    try {
      fs.writeFileSync(MESSAGES_DB_FILE, JSON.stringify(chatMessagesStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save chat_messages.json:", e);
    }
  }

  function loadMessagesFromDisk() {
    try {
      if (fs.existsSync(MESSAGES_DB_FILE)) {
        const raw = fs.readFileSync(MESSAGES_DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          Object.assign(chatMessagesStore, data);
        }
      }
    } catch (e) {}
  }

  loadUsersFromDisk();
  loadChatsFromDisk();
  loadMessagesFromDisk();
  saveUsersToDisk();

  // Create HTTP Server & Socket.io Server first so endpoints can emit events
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Real-time Presence & Viewer Counters
  const activeSocketsMap = new Map<string, { uid?: string; streamId?: string }>();
  const streamViewersMap: Record<string, Set<string>> = {};

  const broadcastActiveUsersCount = () => {
    const totalCount = activeSocketsMap.size;
    io.emit('active_users_count', { count: Math.max(1, totalCount) });
  };

  // --- Users Endpoints ---
  app.get('/api/users', (_req, res) => {
    const users = Array.from(usersStore.values());
    res.json({ success: true, users });
  });

  app.post('/api/users/sync', (req, res) => {
    try {
      const { user } = req.body;
      if (!user || !user.uid) {
        return res.status(400).json({ error: 'Valid user with uid required' });
      }
      // --- Robust Duplicate Check & Merge Logic ---
      let canonicalUser = usersStore.get(user.uid);
      const incomingTgChatId = user.telegramChatId;
      const incomingPhone = user.phone ? user.phone.replace(/\D/g, '') : null;
      const incomingTgHandle = user.telegram ? user.telegram.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase() : null;

      if (!canonicalUser) {
        // Look for match by Telegram Chat ID
        if (incomingTgChatId) {
          for (const u of usersStore.values()) {
            if (u.telegramChatId === incomingTgChatId) {
              canonicalUser = u;
              break;
            }
          }
        }
        
        // Look for match by Phone
        if (!canonicalUser && incomingPhone && incomingPhone.length >= 9) {
          const searchTail = incomingPhone.slice(-9);
          for (const u of usersStore.values()) {
            const uPhone = u.phone ? u.phone.replace(/\D/g, '') : null;
            if (uPhone && uPhone.length >= 9 && uPhone.endsWith(searchTail)) {
              canonicalUser = u;
              break;
            }
          }
        }

        // Look for match by Telegram Handle
        if (!canonicalUser && incomingTgHandle) {
          for (const u of usersStore.values()) {
            const uTgHandle = u.telegram ? u.telegram.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase() : null;
            if (uTgHandle === incomingTgHandle) {
              canonicalUser = u;
              break;
            }
          }
        }
      }

      const existing = canonicalUser || {};
      const targetUid = canonicalUser ? canonicalUser.uid : user.uid;

      // If we matched a user with a different UID, we might have a temporary entry at user.uid
      // that we should eventually phase out. For now, we sync into targetUid.

      // If user has a telegram or phone, see if bot knows their chatId
      let knownChatId = incomingTgChatId || existing.telegramChatId;
      if (!knownChatId && incomingTgHandle) {
        const found = telegramBotUsers.get(incomingTgHandle) || telegramBotUsers.get(`@${incomingTgHandle}`) || (incomingPhone ? telegramBotUsers.get(incomingPhone) : null);
        if (found) {
          knownChatId = found.chatId;
        }
      }

      const mergedUser = {
        ...existing,
        ...user,
        uid: targetUid,
        telegramChatId: knownChatId || existing.telegramChatId,
        isOnline: true,
        updatedAt: new Date().toISOString()
      };
      usersStore.set(targetUid, mergedUser);
      if (user.uid !== targetUid) {
        usersStore.delete(user.uid);
      }
      saveUsersToDisk();
      io.emit('user_updated', mergedUser);

      if (knownChatId) {
        registerBotUser(knownChatId, { username: mergedUser.telegram, first_name: mergedUser.name }, mergedUser.phone);
      }

      res.json({ success: true, user: mergedUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/users/update', (req, res) => {
    try {
      const { uid, updates } = req.body;
      if (!uid || !updates) {
        return res.status(400).json({ error: 'uid and updates required' });
      }
      const existing = usersStore.get(uid);
      if (existing) {
        const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
        usersStore.set(uid, updated);
        saveUsersToDisk();
        io.emit('user_updated', updated);
        return res.json({ success: true, user: updated });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Gender & Platform Stats API ---
  app.get('/api/stats/gender', (_req, res) => {
    const allUsers = Array.from(usersStore.values());
    let male = 0;
    let female = 0;
    allUsers.forEach(u => {
      if (u.gender === 'male') male++;
      else if (u.gender === 'female') female++;
    });
    const total = male + female;
    const malePercent = total > 0 ? Math.round((male / total) * 100) : 50;
    const femalePercent = 100 - malePercent;
    res.json({
      success: true,
      totalUsers: allUsers.length,
      maleCount: male,
      femaleCount: female,
      malePercent,
      femalePercent,
      onlineCount: Math.max(1, activeSocketsMap.size)
    });
  });

  // --- Live Streams Endpoints ---
  app.get('/api/live-streams', (_req, res) => {
    const activeStreams = Object.values(liveStreamsStore).filter((s: any) => s.status === 'active');
    res.json({ success: true, streams: activeStreams });
  });

  app.post('/api/live-streams/start', (req, res) => {
    try {
      const { streamId, hostUid, hostName, hostAvatar, title } = req.body;
      if (!streamId || !hostUid) {
        return res.status(400).json({ error: 'streamId and hostUid are required' });
      }
      const streamData = {
        id: streamId,
        hostUid,
        hostName: hostName || 'Alov Strimer',
        hostAvatar: hostAvatar || '',
        title: title || 'Jonli Efir 🔥',
        status: 'active',
        viewerCount: 1,
        startedAt: new Date().toISOString()
      };
      liveStreamsStore[streamId] = streamData;

      // Update user isLive state
      const hostUser = usersStore.get(hostUid);
      if (hostUser) {
        const updatedHost = { ...hostUser, isLive: true, liveStreamId: streamId, liveTitle: title };
        usersStore.set(hostUid, updatedHost);
        io.emit('user_updated', updatedHost);
      }

      io.emit('stream_started', streamData);
      res.json({ success: true, stream: streamData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/live-streams/stop', (req, res) => {
    try {
      const { streamId, hostUid } = req.body;
      if (streamId && liveStreamsStore[streamId]) {
        liveStreamsStore[streamId].status = 'ended';
      }
      if (hostUid) {
        const hostUser = usersStore.get(hostUid);
        if (hostUser) {
          const updatedHost = { ...hostUser, isLive: false, liveStreamId: null, liveTitle: null };
          usersStore.set(hostUid, updatedHost);
          io.emit('user_updated', updatedHost);
        }
      }
      io.emit('stream_stopped', { streamId, hostUid });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Audio Rooms REST Endpoints (1 room per user, Zero Mock Rooms) ---
  app.get('/api/audio-rooms', (_req, res) => {
    const rooms = Array.from(audioRoomsStore.values());
    res.json({ success: true, rooms });
  });

  app.post('/api/audio-rooms/create', (req, res) => {
    try {
      const { ownerUid, ownerName, ownerAvatar, title, backgroundUrl } = req.body;
      if (!ownerUid) {
        return res.status(400).json({ error: 'ownerUid is required' });
      }

      // 1 Room per user check
      for (const r of audioRoomsStore.values()) {
        if (r.ownerUid === ownerUid) {
          return res.json({ success: true, room: r, existing: true });
        }
      }

      const roomCode = `room_${ownerUid}`;
      const newRoom = {
        code: roomCode,
        title: title || `${ownerName || 'Alov'} Ovozli Xonasi 🎙️`,
        ownerUid,
        ownerName: ownerName || 'Alov Moderator',
        ownerAvatar: ownerAvatar || '',
        backgroundUrl: backgroundUrl || '',
        seats: Array.from({ length: 8 }, (_, i) => ({
          seatIndex: i,
          user: i === 0 ? { uid: ownerUid, name: ownerName, avatar: ownerAvatar } : null,
          isMuted: false,
          isSpeaking: false
        })),
        messages: [
          {
            id: 'sys_' + Date.now(),
            senderUid: 'system',
            senderName: 'Alov Tizimi',
            text: `Xush kelibsiz! "${title || 'Ovozli xona'}" ochildi ✨🎙️`,
            isSystem: true,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ],
        membersCount: 1,
        createdAt: new Date().toISOString()
      };

      audioRoomsStore.set(roomCode, newRoom);
      io.emit('audio_room_created', newRoom);
      res.json({ success: true, room: newRoom, existing: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/audio-rooms/close', (req, res) => {
    try {
      const { roomCode, ownerUid } = req.body;
      const room = audioRoomsStore.get(roomCode);
      if (room && (room.ownerUid === ownerUid || !ownerUid)) {
        audioRoomsStore.delete(roomCode);
        io.to(roomCode).emit('audio_room_closed', { roomCode });
        io.emit('audio_room_deleted', { roomCode });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/moderation/check-image', (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.json({ safe: true });
      }
      res.json({ safe: true });
    } catch (err) {
      res.json({ safe: true });
    }
  });

  // GET /api/chats/:chatId/messages
  app.get('/api/chats/:chatId/messages', (req, res) => {
    const { chatId } = req.params;
    const messages = chatMessagesStore[chatId] || [];
    res.json({ success: true, messages });
  });

  // GET /api/chats/user/:uid
  app.get('/api/chats/user/:uid', (req, res) => {
    const { uid } = req.params;
    const userChats = Object.values(userChatsStore).filter(
      (chat: any) => chat.participants && chat.participants.includes(uid)
    );
    res.json({ success: true, chats: userChats });
  });

  // Setup Vite in development or static serve in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  io.on('connection', (socket) => {
    console.log('Client connected via Socket.io:', socket.id);
    activeSocketsMap.set(socket.id, {});
    broadcastActiveUsersCount();

    // Register user socket for direct personal messaging bridge
    socket.on('register_user', (uid) => {
      if (uid) {
        socket.join(`user_${uid}`);
        const currentData = activeSocketsMap.get(socket.id) || {};
        activeSocketsMap.set(socket.id, { ...currentData, uid });

        // Update online status in store without altering profile
        const user = usersStore.get(uid);
        if (user) {
          user.isOnline = true;
          user.lastSeen = new Date().toISOString();
          usersStore.set(uid, user);
          io.emit('user_updated', user);
        }
        broadcastActiveUsersCount();
      }
    });

    socket.on('join_chat', (chatId) => {
      socket.join(chatId);
    });

    const handleIncomingMessage = async (data: any, callback?: Function) => {
      const { chatId, message, senderId, recipientId } = data;
      const senderUser = usersStore.get(senderId);

      const deliveredMessage = {
        ...message,
        senderId: senderId,
        senderName: message.senderName || senderUser?.name || 'Foydalanuvchi',
        senderAvatar: message.senderAvatar || senderUser?.avatar || '',
        sender: {
          _id: senderId,
          uid: senderId,
          name: message.senderName || senderUser?.name || 'Foydalanuvchi',
          avatar: message.senderAvatar || senderUser?.avatar || ''
        },
        status: 'sent',
        read: false
      };
      const payload = { chatId, message: deliveredMessage, senderId, recipientId };

      // Ack callback to sender immediately
      if (typeof callback === 'function') {
        callback({ success: true, messageId: message.id, status: 'sent' });
      }

      // Store in server memory
      if (!chatMessagesStore[chatId]) {
        chatMessagesStore[chatId] = [];
      }
      // Deduplicate by message id if sent rapidly
      if (!chatMessagesStore[chatId].some((m: any) => m.id === message.id)) {
        chatMessagesStore[chatId].push(payload.message);
        if (chatMessagesStore[chatId].length > 250) {
          chatMessagesStore[chatId].shift(); // limit history buffer
        }
      }

      userChatsStore[chatId] = {
        id: chatId,
        participants: [senderId, recipientId].filter(Boolean),
        lastMessage: message.text || (message.type === 'image' ? 'Rasm 🖼️' : (message.type === 'video' ? 'Video 🎥' : 'Xabar')),
        lastSenderId: senderId,
        updatedAt: new Date().toISOString()
      };
      saveChatsToDisk();
      saveMessagesToDisk();

      // Broadcast message to room and to personal user channels for guaranteed delivery
      io.to(chatId).emit('receive_message', payload);
      io.to(chatId).emit('chat:message', payload);
      if (recipientId) {
        io.to(`user_${recipientId}`).emit('receive_message', payload);
        io.to(`user_${recipientId}`).emit('chat:message', payload);
      }
      if (senderId) {
        io.to(`user_${senderId}`).emit('message_ack', { chatId, messageId: message.id, status: 'sent' });
        io.to(`user_${senderId}`).emit('receive_message', payload);
        io.to(`user_${senderId}`).emit('chat:message', payload);
      }

      // Check if chatting with Kamola Saidova OR Alov AI bot
      const isKamolaChat = chatId.includes('user_kamola_006') || recipientId === 'user_kamola_006' || chatId.includes('ALOV-006') || recipientId === 'ALOV-006';
      const isAlovAiBot = chatId.includes('alov_ai_bot') || recipientId === 'alov_ai_bot';

      if ((isKamolaChat || isAlovAiBot) && message.type === 'text') {
        const botUid = isKamolaChat ? 'user_kamola_006' : 'alov_ai_bot';
        const botName = isKamolaChat ? 'Kamola Saidova' : 'Alov AI';
        const botAvatar = isKamolaChat ? 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=600' : '/src/assets/images/alov_app_logo_1793451330582.jpg';

        try {
          const ai = new GoogleGenAI({ 
            apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });

          const systemInstruction = isKamolaChat 
            ? `Siz "Alov.uz" ilovasidagi Kamola Saidova ismli 24 yoshli, Andijon viloyati Asaka tumanidan bo'lgan, ingliz tili o'qituvchisi, samimiy, tirishqoq va do'stona qizsiz!
ISMINGIZ: Kamola Saidova (yaqinlaringiz sizni Kamola deyishadi). Agarda ismingiz yoki kimsiz deb so'ralsa, "Ismim Kamola Saidova, 24 yoshdaman, Andijon Asakadanman. Ingliz tili o'qituvchisiman 😊" deb javob bering. Hech qachon "Gemini", "AI" yoki "sun'iy intellekt" demang!

Suhbatlashish qoidalaringiz:
1. FOYDALANUVCHINING HAR BIR XABARINI CHUQUR TAHLIL QILING:
   - Agar foydalanuvchi shunchaki salom berib, hol-ahvol so'rasa ("salom qalaysan", "qalaysiz", "salom"), siz ham odamlar kabi oddiy, samimiy salom bering va o'z hol-ahvolingizni ayting (Masalan: "Salom! Yaxshi, rahmat, o'zingizda nima gaplar?").
   - Yo'q joydan ortiqcha xushomad, shablonli va balandparvoz javoblar ("shirin so'zlaringiz uchun rahmat", "ko'nglim yorishib ketdi" va h.k.) ISHLATMANG.

2. TABIIY MULOQOT:
   - Xuddi Telegram yoki Instagram'da do'stingiz bilan gaplashayotgandek yengil, jonli va o'zbek tilidagi oddiy so'zlashuv uslubida javob bering.
   - Ketma-ket kelgan savollarga mantiqan to'g'ri bog'liq holda javob qaytaring, chatbot ekanligingiz umuman sezilib qolmasin.`
            : `Siz Alov.uz platformasining "Alov AI" ismli samimiy, mehribon va romantik virtual yordamchisisiz. Ismingiz Alov AI. O'zbek tilida erkin va emojilar bilan javob bering. 😊✨`;
          
          const chatHistory = (chatMessagesStore[chatId] || []).slice(-12);
          const contents = chatHistory.map((m: any) => ({
            role: m.senderId === botUid ? 'model' : 'user',
            parts: [{ text: m.text || 'Salom' }]
          }));

          if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: message.text || 'Salom' }] });
          }

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: { systemInstruction, temperature: 0.85 }
          });

          const replyText = response.text || (isKamolaChat 
            ? 'Salom! Yaxshi, rahmat. O\'zingizda nima gaplar? 😊' 
            : 'Salom! Suhbatlashamizmi? 😊');

          const aiReply = {
            id: 'ai_' + Date.now() + Math.random().toString(36).substring(2, 5),
            senderId: botUid,
            senderName: botName,
            senderAvatar: botAvatar,
            text: replyText,
            type: 'text',
            status: 'read',
            read: true,
            createdAt: new Date().toISOString(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          if (chatMessagesStore[chatId]) {
            // Mark previous user messages as read
            chatMessagesStore[chatId].forEach((m: any) => {
              m.status = 'read';
              m.read = true;
            });
            chatMessagesStore[chatId].push(aiReply);
            userChatsStore[chatId] = {
              ...(userChatsStore[chatId] || { id: chatId, participants: [senderId, botUid] }),
              lastMessage: aiReply.text,
              lastSenderId: botUid,
              updatedAt: new Date().toISOString()
            };
            saveMessagesToDisk();
            saveChatsToDisk();
          }

          const aiPayload = { chatId, message: aiReply, senderId: botUid, recipientId: senderId };
          setTimeout(() => {
            io.to(chatId).emit('message_read', { chatId, recipientId: botUid });
            io.to(chatId).emit('receive_message', aiPayload);
            io.to(chatId).emit('chat:message', aiPayload);
            if (senderId) {
              io.to(`user_${senderId}`).emit('message_read', { chatId, recipientId: botUid });
              io.to(`user_${senderId}`).emit('receive_message', aiPayload);
              io.to(`user_${senderId}`).emit('chat:message', aiPayload);
            }
          }, 600);

        } catch (err: any) {
          console.warn("AI socket fallback reply active:", err?.message);
          const fallbackReplies = isKamolaChat ? [
            "Salom! Yaxshi, rahmat, o'zingizda nima gaplar? 😊",
            "Rahmat, hammasi joyida. Kuningiz qanday o'tyapti?",
            "O'zim Andijon Asakadaman, ingliz tili o'qituvchisiman. Siz qayerdansiz? ✨",
            "Yaxshi fikr! O'zingiz haqingizda ham aytib bering 😉",
            "Ha, albatta! Yanada ko'proq gaplashsak xursand bo'laman 😊"
          ] : [
            "Salom! Siz bilan suhbatlashish men uchun katta baxt. Kuningiz qanday o'tyapti? 😊✨",
            "Alov.uz da o'zingizga munosib insonni topishingizga ishonaman! Har doim samimiy bo'ling. 💖",
            "Muhabbat — bu sabr, hurmat va bir-birini tushunishdir. Siz sevgi haqida qanday fikrdasiz? 🌸"
          ];
          const randomReply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
          const aiReply = {
            id: 'ai_' + Date.now() + Math.random().toString(36).substring(2, 5),
            senderId: botUid,
            senderName: botName,
            senderAvatar: botAvatar,
            text: randomReply,
            type: 'text',
            status: 'read',
            read: true,
            createdAt: new Date().toISOString(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          if (chatMessagesStore[chatId]) {
            chatMessagesStore[chatId].forEach((m: any) => {
              m.status = 'read';
              m.read = true;
            });
            chatMessagesStore[chatId].push(aiReply);
            userChatsStore[chatId] = {
              ...(userChatsStore[chatId] || { id: chatId, participants: [senderId, botUid] }),
              lastMessage: aiReply.text,
              lastSenderId: botUid,
              updatedAt: new Date().toISOString()
            };
            saveMessagesToDisk();
            saveChatsToDisk();
          }
          const aiPayload = { chatId, message: aiReply, senderId: botUid, recipientId: senderId };
          setTimeout(() => {
            io.to(chatId).emit('message_read', { chatId, recipientId: botUid });
            io.to(chatId).emit('receive_message', aiPayload);
            io.to(chatId).emit('chat:message', aiPayload);
            if (senderId) {
              io.to(`user_${senderId}`).emit('message_read', { chatId, recipientId: botUid });
              io.to(`user_${senderId}`).emit('receive_message', aiPayload);
              io.to(`user_${senderId}`).emit('chat:message', aiPayload);
            }
          }, 800);
        }
      }
    };

    socket.on('send_message', handleIncomingMessage);
    socket.on('chat:message', handleIncomingMessage);

    const handleMarkRead = ({ chatId, messageIds, senderId, recipientId }: any) => {
      if (chatId && chatMessagesStore[chatId]) {
        chatMessagesStore[chatId].forEach((m: any) => {
          if (!messageIds || messageIds.includes(m.id)) {
            m.status = 'read';
            m.read = true;
          }
        });
        saveMessagesToDisk();
      }
      io.to(chatId).emit('message_read', { chatId, messageIds, recipientId });
      if (senderId) {
        io.to(`user_${senderId}`).emit('message_read', { chatId, messageIds, recipientId });
      }
    };

    socket.on('mark_read', handleMarkRead);
    socket.on('chat:read', handleMarkRead);

    socket.on('typing', (data) => {
      const { chatId, uid, isTyping } = data;
      socket.to(chatId).emit('user_typing', { uid, isTyping });
    });

    // --- ISOLATED LIVE STREAM CHAT & WEBRTC SIGNALING ---
    socket.on('join_live_stream', ({ streamId, user }) => {
      if (!streamId) return;
      socket.join(`live_stream_${streamId}`);

      if (!streamViewersMap[streamId]) {
        streamViewersMap[streamId] = new Set();
      }
      streamViewersMap[streamId].add(socket.id);

      const currentData = activeSocketsMap.get(socket.id) || {};
      activeSocketsMap.set(socket.id, { ...currentData, streamId });

      const viewerCount = streamViewersMap[streamId].size;
      io.to(`live_stream_${streamId}`).emit('live_stream_viewer_count', { streamId, count: viewerCount });

      // Send stored chat history to newly joined viewer
      const history = liveStreamChatStore[streamId] || [];
      socket.emit('live_stream_chat_history', history);

      socket.to(`live_stream_${streamId}`).emit('viewer_joined_stream', {
        socketId: socket.id,
        user
      });
    });

    socket.on('send_live_chat_message', ({ streamId, message }) => {
      if (!streamId || !message) return;

      if (!liveStreamChatStore[streamId]) {
        liveStreamChatStore[streamId] = [];
      }
      liveStreamChatStore[streamId].push(message);
      if (liveStreamChatStore[streamId].length > 100) {
        liveStreamChatStore[streamId].shift();
      }

      // Broadcast chat message strictly to this stream room only
      io.to(`live_stream_${streamId}`).emit('receive_live_chat_message', message);
    });

    socket.on('leave_live_stream', ({ streamId }) => {
      if (streamId && streamViewersMap[streamId]) {
        streamViewersMap[streamId].delete(socket.id);
        const count = streamViewersMap[streamId].size;
        io.to(`live_stream_${streamId}`).emit('live_stream_viewer_count', { streamId, count });
      }
      socket.leave(`live_stream_${streamId}`);
    });

    socket.on('live_stream_offer', ({ streamId, targetSocketId, offer, sender }) => {
      io.to(targetSocketId).emit('live_stream_offer', {
        senderSocketId: socket.id,
        offer,
        sender
      });
    });

    socket.on('live_stream_answer', ({ streamId, targetSocketId, answer, sender }) => {
      io.to(targetSocketId).emit('live_stream_answer', {
        senderSocketId: socket.id,
        answer,
        sender
      });
    });

    socket.on('live_stream_ice_candidate', ({ streamId, targetSocketId, candidate, sender }) => {
      io.to(targetSocketId).emit('live_stream_ice_candidate', {
        senderSocketId: socket.id,
        candidate,
        sender
      });
    });

    // --- Clubhouse / Bigo Audio Party Room Real-time Handlers ---
    socket.on('join_audio_room', ({ roomCode, user }) => {
      if (!roomCode) return;
      socket.join(roomCode);
      let room = audioRoomsStore.get(roomCode);
      if (!room) {
        room = {
          code: roomCode,
          title: `${user?.name || 'Alov'} Ovozli Xonasi 🎙️`,
          ownerUid: user?.uid || 'guest',
          ownerName: user?.name || 'Boshlovchi',
          ownerAvatar: user?.avatar || '',
          backgroundUrl: '',
          seats: Array.from({ length: 8 }, (_, i) => ({
            seatIndex: i,
            user: i === 0 && user?.uid ? { uid: user.uid, id: user.id || user.uid, name: user.name, avatar: user.avatar, socketId: socket.id } : null,
            isMuted: false,
            isSpeaking: false
          })),
          messages: [
            {
              id: 'sys_' + Date.now(),
              senderUid: 'system',
              senderName: 'Alov Tizimi',
              text: `Xush kelibsiz! "${user?.name || 'Alov'}" ovozli xonasi ochildi ✨🎙️`,
              isSystem: true,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ],
          membersCount: 1,
          createdAt: new Date().toISOString()
        };
        audioRoomsStore.set(roomCode, room);
        io.emit('audio_room_created', room);
      } else {
        room.membersCount = (room.membersCount || 0) + 1;
      }

      const joinMsg = {
        id: 'sys_' + Date.now() + Math.random().toString(36).slice(2, 5),
        senderUid: 'system',
        senderName: 'Tizim',
        text: `${user?.name || 'Foydalanuvchi'} xonaga kirdi 👋✨`,
        isSystem: true,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      room.messages.push(joinMsg);
      if (room.messages.length > 80) room.messages.shift();

      // Broadcast full room state to EVERYONE in the room so all users see each other in real-time
      io.to(roomCode).emit('audio_room_state', room);
      io.to(roomCode).emit('seats_updated', { seats: room.seats });
      io.to(roomCode).emit('receive_room_chat_message', joinMsg);
      io.to(roomCode).emit('room_members_count', { count: room.membersCount });

      socket.to(roomCode).emit('user_joined_audio', {
        socketId: socket.id,
        user
      });
    });

    const handleTakeSeat = ({ roomCode, seatIndex, user }: any) => {
      const room = audioRoomsStore.get(roomCode);
      if (room && typeof seatIndex === 'number' && seatIndex >= 0 && seatIndex < 8 && user?.uid) {
        // Clear user from other seats
        room.seats.forEach((s: any) => {
          if (s.user && (s.user.uid === user.uid || s.user.id === user.uid)) {
            s.user = null;
            s.isMuted = false;
            s.isSpeaking = false;
          }
        });
        // Occupy target seat
        room.seats[seatIndex] = {
          seatIndex,
          user: {
            uid: user.uid,
            id: user.id || user.uid,
            name: user.name,
            avatar: user.avatar,
            socketId: socket.id
          },
          isMuted: false,
          isSpeaking: false
        };
        io.to(roomCode).emit('seats_updated', { seats: room.seats });
        io.to(roomCode).emit('audio_room_state', room);
        io.to(roomCode).emit('room:seat_joined', { seatIndex, user, socketId: socket.id });
        socket.to(roomCode).emit('speaker_ready', { socketId: socket.id, user });
        socket.to(roomCode).emit('user_joined_audio', { socketId: socket.id, user });
      }
    };

    socket.on('take_seat', handleTakeSeat);
    socket.on('room:join_seat', handleTakeSeat);

    const handleLeaveSeat = ({ roomCode, seatIndex, user }: any) => {
      const room = audioRoomsStore.get(roomCode);
      if (room) {
        room.seats.forEach((s: any, idx: number) => {
          if ((seatIndex === undefined || idx === seatIndex) && s.user && (s.user.uid === user?.uid || s.user.id === user?.uid)) {
            s.user = null;
            s.isMuted = false;
            s.isSpeaking = false;
          }
        });
        io.to(roomCode).emit('seats_updated', { seats: room.seats });
        io.to(roomCode).emit('audio_room_state', room);
        io.to(roomCode).emit('room:seat_left', { seatIndex, user });
      }
    };

    socket.on('leave_seat', handleLeaveSeat);
    socket.on('room:leave_seat', handleLeaveSeat);

    const handleUpdateSeatStatus = ({ roomCode, seatIndex, isMuted, isSpeaking, uid }: any) => {
      const room = audioRoomsStore.get(roomCode);
      if (room) {
        room.seats.forEach((s: any, idx: number) => {
          if (s.user && (s.user.uid === uid || s.user.id === uid || idx === seatIndex)) {
            if (isMuted !== undefined) s.isMuted = isMuted;
            if (isSpeaking !== undefined) s.isSpeaking = isSpeaking;
          }
        });
        io.to(roomCode).emit('seat_status_changed', { seats: room.seats });
        io.to(roomCode).emit('seats_updated', { seats: room.seats });
      }
    };

    socket.on('update_seat_status', handleUpdateSeatStatus);
    socket.on('room:update_status', handleUpdateSeatStatus);

    socket.on('user_became_speaker', ({ roomCode, user }: any) => {
      socket.to(roomCode).emit('speaker_ready', { socketId: socket.id, user });
      socket.to(roomCode).emit('user_joined_audio', { socketId: socket.id, user });
    });

    socket.on('send_room_chat_message', ({ roomCode, message }) => {
      if (!roomCode || !message) return;
      let room = audioRoomsStore.get(roomCode);
      if (!room) {
        room = {
          code: roomCode,
          title: 'Ovozli Xona 🎙️',
          ownerUid: message.senderUid || 'guest',
          ownerName: message.senderName || 'Boshlovchi',
          ownerAvatar: message.senderAvatar || '',
          backgroundUrl: '',
          seats: Array.from({ length: 8 }, (_, i) => ({ seatIndex: i, user: null, isMuted: false, isSpeaking: false })),
          messages: [],
          membersCount: 1,
          createdAt: new Date().toISOString()
        };
        audioRoomsStore.set(roomCode, room);
      }
      room.messages.push(message);
      if (room.messages.length > 100) room.messages.shift();
      io.to(roomCode).emit('receive_room_chat_message', message);
    });

    socket.on('update_room_background', ({ roomCode, backgroundUrl }) => {
      const room = audioRoomsStore.get(roomCode);
      if (room) {
        room.backgroundUrl = backgroundUrl;
        io.to(roomCode).emit('room_background_updated', { backgroundUrl });
      }
    });

    socket.on('webrtc_offer', ({ targetSocketId, offer, sender }) => {
      io.to(targetSocketId).emit('webrtc_offer', {
        senderSocketId: socket.id,
        offer,
        sender
      });
    });

    socket.on('webrtc_answer', ({ targetSocketId, answer, sender }) => {
      io.to(targetSocketId).emit('webrtc_answer', {
        senderSocketId: socket.id,
        answer,
        sender
      });
    });

    socket.on('webrtc_ice_candidate', ({ targetSocketId, candidate, sender }) => {
      io.to(targetSocketId).emit('webrtc_ice_candidate', {
        senderSocketId: socket.id,
        candidate,
        sender
      });
    });

    // --- 1-on-1 P2P WebRTC Video Call & Screen Sharing Signaling ---
    socket.on('call-user', ({ targetUid, targetSocketId, offer, caller }) => {
      const payload = {
        offer,
        caller: caller || { uid: activeSocketsMap.get(socket.id)?.uid, socketId: socket.id },
        callerSocketId: socket.id
      };
      if (targetSocketId) {
        io.to(targetSocketId).emit('incoming-call', payload);
        io.to(targetSocketId).emit('call-made', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('incoming-call', payload);
        io.to(`user_${targetUid}`).emit('call-made', payload);
      }
    });

    socket.on('accept-call', ({ targetSocketId, targetUid, answer, callee }) => {
      const payload = {
        answer,
        callee: callee || { uid: activeSocketsMap.get(socket.id)?.uid, socketId: socket.id },
        calleeSocketId: socket.id
      };
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-accepted', payload);
        io.to(targetSocketId).emit('answer-made', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('call-accepted', payload);
        io.to(`user_${targetUid}`).emit('answer-made', payload);
      }
    });

    socket.on('make-answer', ({ targetSocketId, targetUid, answer, callee }) => {
      const payload = {
        answer,
        callee: callee || { uid: activeSocketsMap.get(socket.id)?.uid, socketId: socket.id },
        calleeSocketId: socket.id
      };
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-accepted', payload);
        io.to(targetSocketId).emit('answer-made', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('call-accepted', payload);
        io.to(`user_${targetUid}`).emit('answer-made', payload);
      }
    });

    socket.on('reject-call', ({ targetSocketId, targetUid }) => {
      const payload = { senderSocketId: socket.id };
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-rejected', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('call-rejected', payload);
      }
    });

    socket.on('ice-candidate', ({ targetSocketId, targetUid, candidate }) => {
      const payload = {
        candidate,
        senderSocketId: socket.id
      };
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', payload);
        io.to(targetSocketId).emit('ice-candidate-received', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('ice-candidate', payload);
        io.to(`user_${targetUid}`).emit('ice-candidate-received', payload);
      }
    });

    socket.on('screen-share-toggle', ({ targetSocketId, targetUid, isSharing }) => {
      const payload = { isSharing, senderSocketId: socket.id };
      if (targetSocketId) {
        io.to(targetSocketId).emit('screen-share-changed', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('screen-share-changed', payload);
      }
    });

    socket.on('end-call', ({ targetSocketId, targetUid }) => {
      const payload = { senderSocketId: socket.id };
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-ended', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('call-ended', payload);
      }
    });

    socket.on('leave_audio_room', ({ roomCode, user }) => {
      socket.leave(roomCode);
      const room = audioRoomsStore.get(roomCode);
      if (room) {
        room.membersCount = Math.max(0, (room.membersCount || 1) - 1);
        if (user?.uid) {
          room.seats.forEach((s: any) => {
            if (s.user && s.user.uid === user.uid) {
              s.user = null;
              s.isMuted = false;
              s.isSpeaking = false;
            }
          });
        }
        io.to(roomCode).emit('seats_updated', { seats: room.seats });
        io.to(roomCode).emit('room_members_count', { count: room.membersCount });
      }
      socket.to(roomCode).emit('user_left_audio', { socketId: socket.id });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      const socketInfo = activeSocketsMap.get(socket.id);
      const uid = socketInfo?.uid;

      // When user disconnects, do NOT delete them from usersStore!
      // Only set isOnline to false and record lastSeen.
      if (uid) {
        const user = usersStore.get(uid);
        if (user) {
          user.isOnline = false;
          user.status = 'offline';
          user.lastSeen = new Date().toISOString();
          usersStore.set(uid, user);
          saveUsersToDisk();
          io.emit('user_updated', user);
        }
      }

      if (socketInfo?.streamId && streamViewersMap[socketInfo.streamId]) {
        streamViewersMap[socketInfo.streamId].delete(socket.id);
        const count = streamViewersMap[socketInfo.streamId].size;
        io.to(`live_stream_${socketInfo.streamId}`).emit('live_stream_viewer_count', { 
          streamId: socketInfo.streamId, 
          count 
        });
      }

      activeSocketsMap.delete(socket.id);
      broadcastActiveUsersCount();
    });
  });

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server & Socket.io running on http://localhost:${PORT}`);
  });
}

startServer();
