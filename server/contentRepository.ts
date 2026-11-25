import { MongoClient, Binary, type Db, type Collection } from 'mongodb';
import { normalizePostRecord, type PostItem } from '../src/utils/posts';

interface MediaFileRecord {
  filename: string;
  contentType: string;
  data: Binary | Buffer;
  size: number;
  createdAt: string;
}

interface AppMetaRecord {
  key: string;
  epoch?: string;
  value?: any;
  updatedAt: string;
}

const MAX_MONGO_MEDIA_BYTES = 14 * 1024 * 1024; // stay safely under MongoDB 16MB BSON limit

class ContentRepository {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private postsCol: Collection<PostItem> | null = null;
  private usersCol: Collection<any> | null = null;
  private mediaCol: Collection<MediaFileRecord> | null = null;
  private metaCol: Collection<AppMetaRecord> | null = null;
  private chatsCol: Collection<any> | null = null;
  private chatMessagesCol: Collection<{ chatId: string; messages: any[]; updatedAt: string }> | null = null;
  private friendshipsCol: Collection<{ chatId: string; active: boolean; toggledBy: string; updatedAt: string }> | null = null;
  private coinRequestsCol: Collection<any> | null = null;
  private botUsersCol: Collection<any> | null = null;
  private initialized = false;
  private mode: 'mongodb' | 'disk-fallback' = 'disk-fallback';

  async init(): Promise<'mongodb' | 'disk-fallback'> {
    if (this.initialized) return this.mode;
    this.initialized = true;

    const uri = String(process.env.MONGODB_URI || '').trim();
    if (!uri) {
      this.mode = 'disk-fallback';
      return this.mode;
    }

    try {
      const dbName = String(process.env.MONGODB_DB_NAME || 'alov_uz').trim() || 'alov_uz';
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const db = client.db(dbName);
      this.client = client;
      this.db = db;
      this.postsCol = db.collection<PostItem>('posts');
      this.usersCol = db.collection<any>('users');
      this.mediaCol = db.collection<MediaFileRecord>('media_files');
      this.metaCol = db.collection<AppMetaRecord>('app_meta');
      this.chatsCol = db.collection<any>('chats');
      this.chatMessagesCol = db.collection<{ chatId: string; messages: any[]; updatedAt: string }>('chat_messages');
      this.friendshipsCol = db.collection<{ chatId: string; active: boolean; toggledBy: string; updatedAt: string }>('chat_friendships');
      this.coinRequestsCol = db.collection<any>('coin_requests');
      this.botUsersCol = db.collection<any>('telegram_bot_users');

      await Promise.all([
        this.postsCol.createIndex({ id: 1 }, { unique: true }),
        this.postsCol.createIndex({ createdAt: -1 }),
        this.postsCol.createIndex({ authorUid: 1 }),
        this.usersCol.createIndex({ uid: 1 }, { unique: true }),
        this.mediaCol.createIndex({ filename: 1 }, { unique: true }),
        this.metaCol.createIndex({ key: 1 }, { unique: true }),
        this.chatsCol.createIndex({ id: 1 }, { unique: true }),
        this.chatMessagesCol.createIndex({ chatId: 1 }, { unique: true }),
        this.friendshipsCol.createIndex({ chatId: 1 }, { unique: true }),
        this.coinRequestsCol.createIndex({ id: 1 }, { unique: true }),
        this.botUsersCol.createIndex({ key: 1 }, { unique: true }),
      ]);

      this.mode = 'mongodb';
      console.log(`MongoDB content repository connected (db=${dbName})`);
    } catch (err: any) {
      console.warn('MongoDB content repository unavailable, using disk fallback:', err?.message || err);
      this.mode = 'disk-fallback';
    }
    return this.mode;
  }

  getMode(): 'mongodb' | 'disk-fallback' {
    return this.mode;
  }

  async getDbEpoch(): Promise<string> {
    if (!this.metaCol) return '';
    try {
      const doc = await this.metaCol.findOne({ key: 'db_epoch' }, { projection: { _id: 0 } });
      return String(doc?.epoch || '');
    } catch {
      return '';
    }
  }

  async setDbEpoch(epoch: string): Promise<void> {
    if (!this.metaCol || !epoch) return;
    try {
      await this.metaCol.updateOne(
        { key: 'db_epoch' },
        { $set: { key: 'db_epoch', epoch, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB setDbEpoch error:', err);
    }
  }

  async getSetting<T = any>(key: string): Promise<T | null> {
    if (!this.metaCol || !key) return null;
    try {
      const doc = await this.metaCol.findOne({ key }, { projection: { _id: 0 } });
      return (doc?.value as T) ?? null;
    } catch {
      return null;
    }
  }

  async setSetting(key: string, value: any): Promise<void> {
    if (!this.metaCol || !key) return;
    try {
      await this.metaCol.updateOne(
        { key },
        { $set: { key, value, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB setSetting error:', err);
    }
  }

  async loadAllPosts(): Promise<PostItem[]> {
    if (!this.postsCol) return [];
    try {
      const docs = await this.postsCol
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
      return docs.map(normalizePostRecord).filter((p): p is PostItem => p !== null);
    } catch (err) {
      console.warn('MongoDB loadAllPosts error:', err);
      return [];
    }
  }

  async upsertPost(post: PostItem): Promise<void> {
    if (!this.postsCol || !post?.id) return;
    const normalized = normalizePostRecord(post);
    if (!normalized) return;
    try {
      await this.postsCol.replaceOne(
        { id: normalized.id },
        normalized,
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB upsertPost error:', err);
    }
  }

  async deletePost(postId: string): Promise<void> {
    if (!this.postsCol || !postId) return;
    try {
      await this.postsCol.deleteOne({ id: postId });
    } catch (err) {
      console.warn('MongoDB deletePost error:', err);
    }
  }

  async replaceAllPosts(posts: PostItem[]): Promise<void> {
    if (!this.postsCol) return;
    try {
      await this.postsCol.deleteMany({});
      const valid = posts.map(normalizePostRecord).filter((p): p is PostItem => p !== null);
      if (valid.length > 0) {
        await this.postsCol.insertMany(valid);
      }
    } catch (err) {
      console.warn('MongoDB replaceAllPosts error:', err);
    }
  }

  async loadAllUsers(): Promise<any[]> {
    if (!this.usersCol) return [];
    try {
      return await this.usersCol.find({}, { projection: { _id: 0 } }).toArray();
    } catch (err) {
      console.warn('MongoDB loadAllUsers error:', err);
      return [];
    }
  }

  async upsertUser(user: any): Promise<void> {
    if (!this.usersCol || !user?.uid) return;
    try {
      const { _id, ...cleanUser } = user;
      await this.usersCol.replaceOne(
        { uid: cleanUser.uid },
        cleanUser,
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB upsertUser error:', err);
    }
  }

  async deleteUser(uid: string): Promise<void> {
    if (!this.usersCol || !uid) return;
    try {
      await this.usersCol.deleteOne({ uid });
    } catch (err) {
      console.warn('MongoDB deleteUser error:', err);
    }
  }

  async replaceAllUsers(users: any[]): Promise<void> {
    if (!this.usersCol) return;
    try {
      await this.usersCol.deleteMany({});
      const clean = users.map((u) => {
        const { _id, ...rest } = u || {};
        return rest;
      }).filter((u) => Boolean(u?.uid));
      if (clean.length > 0) {
        await this.usersCol.insertMany(clean);
      }
    } catch (err) {
      console.warn('MongoDB replaceAllUsers error:', err);
    }
  }

  async loadAllChats(): Promise<Record<string, any>> {
    if (!this.chatsCol) return {};
    try {
      const docs = await this.chatsCol.find({}, { projection: { _id: 0 } }).toArray();
      const map: Record<string, any> = {};
      for (const doc of docs) {
        if (doc?.id) map[String(doc.id)] = doc;
      }
      return map;
    } catch (err) {
      console.warn('MongoDB loadAllChats error:', err);
      return {};
    }
  }

  async upsertChat(chat: any): Promise<void> {
    if (!this.chatsCol || !chat?.id) return;
    try {
      const { _id, ...clean } = chat;
      await this.chatsCol.replaceOne({ id: clean.id }, clean, { upsert: true });
    } catch (err) {
      console.warn('MongoDB upsertChat error:', err);
    }
  }

  async replaceAllChats(chatsMap: Record<string, any>): Promise<void> {
    if (!this.chatsCol) return;
    try {
      const docs = Object.values(chatsMap || {}).filter((c) => Boolean(c?.id)).map(({ _id, ...rest }: any) => rest);
      await this.chatsCol.deleteMany({});
      if (docs.length > 0) {
        await this.chatsCol.insertMany(docs);
      }
    } catch (err) {
      console.warn('MongoDB replaceAllChats error:', err);
    }
  }

  async loadAllChatMessages(): Promise<Record<string, any[]>> {
    if (!this.chatMessagesCol) return {};
    try {
      const docs = await this.chatMessagesCol.find({}, { projection: { _id: 0 } }).toArray();
      const map: Record<string, any[]> = {};
      for (const doc of docs) {
        if (doc?.chatId && Array.isArray(doc.messages)) {
          map[String(doc.chatId)] = doc.messages;
        }
      }
      return map;
    } catch (err) {
      console.warn('MongoDB loadAllChatMessages error:', err);
      return {};
    }
  }

  async upsertChatMessages(chatId: string, messages: any[]): Promise<void> {
    if (!this.chatMessagesCol || !chatId || !Array.isArray(messages)) return;
    try {
      await this.chatMessagesCol.replaceOne(
        { chatId },
        { chatId, messages, updatedAt: new Date().toISOString() },
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB upsertChatMessages error:', err);
    }
  }

  async replaceAllChatMessages(messagesMap: Record<string, any[]>): Promise<void> {
    if (!this.chatMessagesCol) return;
    try {
      const docs = Object.entries(messagesMap || {})
        .filter(([chatId, msgs]) => Boolean(chatId) && Array.isArray(msgs))
        .map(([chatId, messages]) => ({ chatId, messages, updatedAt: new Date().toISOString() }));
      await this.chatMessagesCol.deleteMany({});
      if (docs.length > 0) {
        await this.chatMessagesCol.insertMany(docs);
      }
    } catch (err) {
      console.warn('MongoDB replaceAllChatMessages error:', err);
    }
  }

  async loadAllFriendships(): Promise<Record<string, { active: boolean; toggledBy: string; updatedAt: string }>> {
    if (!this.friendshipsCol) return {};
    try {
      const docs = await this.friendshipsCol.find({}, { projection: { _id: 0 } }).toArray();
      const map: Record<string, { active: boolean; toggledBy: string; updatedAt: string }> = {};
      for (const doc of docs) {
        if (doc?.chatId) {
          map[String(doc.chatId)] = {
            active: Boolean(doc.active),
            toggledBy: String(doc.toggledBy || ''),
            updatedAt: String(doc.updatedAt || ''),
          };
        }
      }
      return map;
    } catch (err) {
      console.warn('MongoDB loadAllFriendships error:', err);
      return {};
    }
  }

  async upsertFriendship(chatId: string, friendship: { active: boolean; toggledBy: string; updatedAt: string }): Promise<void> {
    if (!this.friendshipsCol || !chatId) return;
    try {
      await this.friendshipsCol.replaceOne(
        { chatId },
        { chatId, ...friendship },
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB upsertFriendship error:', err);
    }
  }

  async replaceAllFriendships(map: Record<string, { active: boolean; toggledBy: string; updatedAt: string }>): Promise<void> {
    if (!this.friendshipsCol) return;
    try {
      const docs = Object.entries(map || {})
        .filter(([chatId]) => Boolean(chatId))
        .map(([chatId, val]) => ({ chatId, ...val }));
      await this.friendshipsCol.deleteMany({});
      if (docs.length > 0) {
        await this.friendshipsCol.insertMany(docs);
      }
    } catch (err) {
      console.warn('MongoDB replaceAllFriendships error:', err);
    }
  }

  async loadAllCoinRequests(): Promise<any[]> {
    if (!this.coinRequestsCol) return [];
    try {
      return await this.coinRequestsCol
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
    } catch (err) {
      console.warn('MongoDB loadAllCoinRequests error:', err);
      return [];
    }
  }

  async upsertCoinRequest(request: any): Promise<void> {
    if (!this.coinRequestsCol || !request?.id) return;
    try {
      const { _id, ...clean } = request;
      await this.coinRequestsCol.replaceOne({ id: clean.id }, clean, { upsert: true });
    } catch (err) {
      console.warn('MongoDB upsertCoinRequest error:', err);
    }
  }

  async replaceAllCoinRequests(list: any[]): Promise<void> {
    if (!this.coinRequestsCol) return;
    try {
      const docs = (list || []).filter((r) => Boolean(r?.id)).map(({ _id, ...rest }: any) => rest);
      await this.coinRequestsCol.deleteMany({});
      if (docs.length > 0) {
        await this.coinRequestsCol.insertMany(docs);
      }
    } catch (err) {
      console.warn('MongoDB replaceAllCoinRequests error:', err);
    }
  }

  async loadAllBotUsers(): Promise<Array<[string, any]>> {
    if (!this.botUsersCol) return [];
    try {
      const docs = await this.botUsersCol.find({}, { projection: { _id: 0 } }).toArray();
      const entries: Array<[string, any]> = [];
      for (const doc of docs) {
        if (doc?.key && doc?.record?.chatId) {
          entries.push([String(doc.key), doc.record]);
        }
      }
      return entries;
    } catch (err) {
      console.warn('MongoDB loadAllBotUsers error:', err);
      return [];
    }
  }

  async replaceAllBotUsers(map: Map<string, any>): Promise<void> {
    if (!this.botUsersCol) return;
    try {
      const ops: any[] = [];
      for (const [key, record] of map.entries()) {
        if (!key || !record?.chatId) continue;
        ops.push({
          replaceOne: {
            filter: { key },
            replacement: { key, record },
            upsert: true,
          },
        });
      }
      if (ops.length > 0) {
        await this.botUsersCol.bulkWrite(ops, { ordered: false });
      }
    } catch (err) {
      console.warn('MongoDB replaceAllBotUsers error:', err);
    }
  }

  async saveMediaFile(filename: string, contentType: string, buffer: Buffer): Promise<void> {
    if (!this.mediaCol || !filename || !buffer || buffer.length === 0) return;
    if (buffer.length > MAX_MONGO_MEDIA_BYTES) return;
    try {
      await this.mediaCol.updateOne(
        { filename },
        {
          $set: {
            filename,
            contentType: contentType || 'application/octet-stream',
            data: new Binary(buffer),
            size: buffer.length,
            createdAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB saveMediaFile error:', err);
    }
  }

  async getMediaFile(filename: string): Promise<{ contentType: string; buffer: Buffer } | null> {
    if (!this.mediaCol || !filename) return null;
    try {
      const doc = await this.mediaCol.findOne({ filename }, { projection: { _id: 0 } });
      if (!doc || !doc.data) return null;
      const rawData: any = doc.data;
      const buffer = Buffer.isBuffer(rawData)
        ? rawData
        : rawData.buffer
          ? Buffer.from(rawData.buffer)
          : Buffer.from(rawData);
      return {
        contentType: doc.contentType || 'application/octet-stream',
        buffer,
      };
    } catch (err) {
      console.warn('MongoDB getMediaFile error:', err);
      return null;
    }
  }

  async deleteMediaFile(filename: string): Promise<void> {
    if (!this.mediaCol || !filename) return;
    try {
      await this.mediaCol.deleteOne({ filename });
    } catch (err) {
      console.warn('MongoDB deleteMediaFile error:', err);
    }
  }
}

export const contentRepository = new ContentRepository();
