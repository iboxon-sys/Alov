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
  epoch: string;
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

      await Promise.all([
        this.postsCol.createIndex({ id: 1 }, { unique: true }),
        this.postsCol.createIndex({ createdAt: -1 }),
        this.postsCol.createIndex({ authorUid: 1 }),
        this.usersCol.createIndex({ uid: 1 }, { unique: true }),
        this.mediaCol.createIndex({ filename: 1 }, { unique: true }),
        this.metaCol.createIndex({ key: 1 }, { unique: true }),
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
