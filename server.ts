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
      
      const systemInstruction = `Siz Alov.uz platformasining "Alov AI" ismli samimiy, mehribon va sevgi-muhabbat sir-asrorlari haqida suhbatlashishni yaxshi ko'radigan virtual suhbatdoshisiz. 
Sizning uslubingiz:
1. Yaqin do'st va samimiy suhbatdosh.
2. Sevgi, romantika va munosabatlar mavzusida iliq, tushunarli va o'ziga rom qiluvchi.
3. Har doim o'zbek tilida, chiroyli va hurmat bilan javob bering.
4. Foydalanuvchiga hissiy yordam bering, uni tinglang va unga dalda bo'ling.
5. Qisqa, lekin mazmunli javoblar bering. Emoji ishlatishni unutmang. 😊✨`;

      const contents = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || m.content }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.8,
        }
      });

      res.json({
        success: true,
        reply: response.text || 'Kechirasiz, hozir biroz xayolim bo\'lindi. Nima degandingiz? 😊'
      });
    } catch (err: any) {
      console.error('Alov AI error:', err);
      res.status(500).json({ error: err.message || 'AI service error' });
    }
  });

  // AI Profile / Bio Generator
  app.post('/api/ai/generate-bio', async (req, res) => {
    try {
      const { name, interests, occupation } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Create a catchy, romantic, and friendly dating profile bio in Uzbek for someone named ${name}, whose interests are ${interests} and occupation is ${occupation}. Keep it under 3 sentences with emojis.`
      });
      res.json({ success: true, bio: response.text });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- In-Memory Chat Storage & Real-Time Presence ---
  const chatMessagesStore: Record<string, any[]> = {};
  const userChatsStore: Record<string, any> = {};
  const liveStreamChatStore: Record<string, any[]> = {};
  
  // Real-time Presence & Viewer Counters
  const activeSocketsMap = new Map<string, { uid?: string; streamId?: string }>();
  const streamViewersMap: Record<string, Set<string>> = {};

  const broadcastActiveUsersCount = () => {
    const totalCount = activeSocketsMap.size;
    io.emit('active_users_count', { count: Math.max(1, totalCount) });
  };

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

  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

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

    socket.on('send_message', async (data) => {
      const { chatId, message, senderId, recipientId } = data;
      const payload = { chatId, message, senderId, recipientId };

      // Store in server memory
      if (!chatMessagesStore[chatId]) {
        chatMessagesStore[chatId] = [];
      }
      // Deduplicate by message id if sent rapidly
      if (!chatMessagesStore[chatId].some((m: any) => m.id === message.id)) {
        chatMessagesStore[chatId].push(message);
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
      if (recipientId) {
        io.to(`user_${recipientId}`).emit('receive_message', payload);
      }
      if (senderId) {
        io.to(`user_${senderId}`).emit('receive_message', payload);
      }

      // If chatting with Alov AI bot, generate response on server and emit back
      if (chatId.includes('alov_ai_bot') && message.type === 'text') {
        try {
          const ai = new GoogleGenAI({ 
            apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });
          const systemInstruction = `Siz Alov.uz platformasining "Alov AI" ismli samimiy, mehribon va sevgi-muhabbat sir-asrorlari haqida suhbatlashishni yaxshi ko'radigan virtual suhbatdoshisiz. O'zbek tilida qisqa, iliq va emoji bilan javob bering. 😊✨`;
          
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: message.text,
            config: { systemInstruction, temperature: 0.8 }
          });

          const aiReply = {
            id: 'ai_' + Date.now(),
            senderId: 'alov_ai_bot',
            senderName: 'Alov AI',
            text: response.text || 'Salom! Suhbatlashamizmi? 😊',
            type: 'text',
            createdAt: new Date().toISOString()
          };

          if (chatMessagesStore[chatId]) {
            chatMessagesStore[chatId].push(aiReply);
          }

          setTimeout(() => {
            io.to(chatId).emit('receive_message', { chatId, message: aiReply, senderId: 'alov_ai_bot', recipientId: senderId });
          }, 800);
        } catch (err) {
          console.error("AI socket reply error:", err);
        }
      }
    });

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

    // --- WebRTC Signaling for Audio Rooms ---
    socket.on('join_audio_room', ({ roomCode, user }) => {
      socket.join(roomCode);
      socket.to(roomCode).emit('user_joined_audio', {
        socketId: socket.id,
        user
      });
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

    socket.on('leave_audio_room', (roomCode) => {
      socket.leave(roomCode);
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
