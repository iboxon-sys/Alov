import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
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
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

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

  // Gemini AI Chat / Matchmaker API
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { messages, userProfile } = req.body;
      
      const systemInstruction = `Siz Alov.uz tanishuv va jonli efir platformasining aqlli AI Matchmaker yordamchisisiz. 
Siz foydalanuvchilarga mos nomzodlarni topish, bir-biri bilan muloqot qilish uchun qiziqarli savollar (icebreakers), profilni boyitish bo'yicha maslahatlar berasiz. 
Har doim iliq, xushmuomala, o'zbek tilida va samimiy javob bering.`;

      const contents = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({
        success: true,
        reply: response.text || 'Salom! Sizga qanday yordam bera olaman?'
      });
    } catch (err: any) {
      console.error('AI chat error:', err);
      res.status(500).json({ error: err.message || 'AI service error' });
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
      res.status(500).json({ error: err.message });
    }
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

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
