import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
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

  // Pre-seeded verified profiles across Uzbekistan regions
  const initialUsers: any[] = [
    {
      id: 'ALOV-006',
      uid: 'user_kamola_006',
      name: 'Kamola Saidova',
      age: 24,
      gender: 'female',
      region: 'Andijon viloyati',
      district: 'Asaka tumani',
      phone: '+998977890123',
      telegram: '@kamola_asaka',
      bio: "Ingliz tili o'qituvchisiman. Sayohat, san'at va shirinliklar tayyorlash hobbiylarim. Jiddiy va samimiy muloqot uchun. ✨",
      avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=600',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-woman-in-a-field-of-flowers-41691-large.mp4',
      isLive: false,
      isOnline: true,
      followersCount: 160,
      followingCount: 30,
      likesCount: 580,
      location: { lat: 40.6417, lng: 72.2389 },
      locationVisibility: 'everyone',
      isLocationEnabled: true
    }
  ];

  const usersStore = new Map<string, any>();
  initialUsers.forEach(u => usersStore.set(u.uid, u));

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
      const existing = usersStore.get(user.uid) || {};
      const mergedUser = {
        ...existing,
        ...user,
        isOnline: true,
        updatedAt: new Date().toISOString()
      };
      usersStore.set(user.uid, mergedUser);
      io.emit('user_updated', mergedUser);
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
        broadcastActiveUsersCount();
      }
    });

    socket.on('join_chat', (chatId) => {
      socket.join(chatId);
    });

    const handleIncomingMessage = async (data: any, callback?: Function) => {
      const { chatId, message, senderId, recipientId } = data;
      const deliveredMessage = {
        ...message,
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
      const room = audioRoomsStore.get(roomCode);
      if (room) {
        room.membersCount = (room.membersCount || 0) + 1;
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

        socket.emit('audio_room_state', room);
        io.to(roomCode).emit('receive_room_chat_message', joinMsg);
        io.to(roomCode).emit('room_members_count', { count: room.membersCount });
      }

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
        io.to(roomCode).emit('room:seat_joined', { seatIndex, user, socketId: socket.id });
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
      }
    };

    socket.on('update_seat_status', handleUpdateSeatStatus);
    socket.on('room:update_status', handleUpdateSeatStatus);

    socket.on('user_became_speaker', ({ roomCode, user }: any) => {
      socket.to(roomCode).emit('speaker_ready', { socketId: socket.id, user });
    });

    socket.on('send_room_chat_message', ({ roomCode, message }) => {
      const room = audioRoomsStore.get(roomCode);
      if (room && message) {
        room.messages.push(message);
        if (room.messages.length > 80) room.messages.shift();
        io.to(roomCode).emit('receive_room_chat_message', message);
      }
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
