import { MongoClient, type Db, type Collection } from 'mongodb';
import {
  buildUserWalletSnapshot,
  type UserWalletSnapshot,
} from '../src/utils/tokenomics';

export interface WalletTransactionRecord {
  id: string;
  sender?: string;
  receiver?: string;
  type: string;
  coinAmount?: number;
  diamondAmount?: number;
  uzsAmount?: number;
  paymentMethod?: string;
  status: string;
  note?: string;
  createdAt: string;
}

export interface WalletWithdrawalRecord {
  id: string;
  userUid: string;
  userName?: string;
  userUsername?: string;
  userTelegram?: string;
  userPhone?: string;
  contactInfo?: string;
  userCard: string;
  diamondAmount: number;
  uzsAmount: number;
  status: string;
  createdAt: string;
}

class WalletRepository {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private walletsCol: Collection<UserWalletSnapshot> | null = null;
  private txsCol: Collection<WalletTransactionRecord> | null = null;
  private withdrawalsCol: Collection<WalletWithdrawalRecord> | null = null;
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
      this.walletsCol = db.collection<UserWalletSnapshot>('wallets');
      this.txsCol = db.collection<WalletTransactionRecord>('wallet_transactions');
      this.withdrawalsCol = db.collection<WalletWithdrawalRecord>('withdrawals');

      await Promise.all([
        this.walletsCol.createIndex({ uid: 1 }, { unique: true }),
        this.txsCol.createIndex({ id: 1 }, { unique: true }),
        this.txsCol.createIndex({ sender: 1, receiver: 1, createdAt: -1 }),
        this.withdrawalsCol.createIndex({ id: 1 }, { unique: true }),
        this.withdrawalsCol.createIndex({ userUid: 1, createdAt: -1 }),
      ]);

      this.mode = 'mongodb';
      console.log(`MongoDB wallet repository connected (db=${dbName})`);
    } catch (err: any) {
      console.warn('MongoDB unavailable, continuing with disk-backed wallet store:', err?.message || err);
      this.mode = 'disk-fallback';
    }
    return this.mode;
  }

  getMode(): 'mongodb' | 'disk-fallback' {
    return this.mode;
  }

  async syncUserWallet(user: any): Promise<UserWalletSnapshot> {
    const snapshot = buildUserWalletSnapshot(user);
    if (!user || !snapshot.uid) return snapshot;

    user.wallet = snapshot;
    if (this.walletsCol) {
      try {
        await this.walletsCol.updateOne(
          { uid: snapshot.uid },
          { $set: snapshot },
          { upsert: true }
        );
      } catch (err) {
        console.warn('MongoDB syncUserWallet error:', err);
      }
    }
    return snapshot;
  }

  async recordTransaction(tx: WalletTransactionRecord): Promise<void> {
    if (!this.txsCol || !tx?.id) return;
    try {
      const { _id, ...cleanTx } = tx as any;
      await this.txsCol.replaceOne(
        { id: cleanTx.id },
        cleanTx,
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB recordTransaction error:', err);
    }
  }

  async recordWithdrawal(withdrawal: WalletWithdrawalRecord): Promise<void> {
    if (!this.withdrawalsCol || !withdrawal?.id) return;
    try {
      const { _id, ...cleanW } = withdrawal as any;
      await this.withdrawalsCol.replaceOne(
        { id: cleanW.id },
        cleanW,
        { upsert: true }
      );
    } catch (err) {
      console.warn('MongoDB recordWithdrawal error:', err);
    }
  }

  async loadAllWallets(): Promise<UserWalletSnapshot[]> {
    if (!this.walletsCol) return [];
    try {
      return await this.walletsCol.find({}, { projection: { _id: 0 } }).toArray();
    } catch (err) {
      console.warn('MongoDB loadAllWallets error:', err);
      return [];
    }
  }

  async loadAllTransactions(): Promise<WalletTransactionRecord[]> {
    if (!this.txsCol) return [];
    try {
      return await this.txsCol
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
    } catch (err) {
      console.warn('MongoDB loadAllTransactions error:', err);
      return [];
    }
  }

  async loadAllWithdrawals(): Promise<WalletWithdrawalRecord[]> {
    if (!this.withdrawalsCol) return [];
    try {
      return await this.withdrawalsCol
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
    } catch (err) {
      console.warn('MongoDB loadAllWithdrawals error:', err);
      return [];
    }
  }

  async replaceAllTransactions(list: WalletTransactionRecord[]): Promise<void> {
    if (!this.txsCol) return;
    try {
      const docs = (list || []).filter((t) => Boolean(t?.id)).map(({ _id, ...rest }: any) => rest);
      await this.txsCol.deleteMany({});
      if (docs.length > 0) {
        await this.txsCol.insertMany(docs);
      }
    } catch (err) {
      console.warn('MongoDB replaceAllTransactions error:', err);
    }
  }

  async replaceAllWithdrawals(list: WalletWithdrawalRecord[]): Promise<void> {
    if (!this.withdrawalsCol) return;
    try {
      const docs = (list || []).filter((w) => Boolean(w?.id)).map(({ _id, ...rest }: any) => rest);
      await this.withdrawalsCol.deleteMany({});
      if (docs.length > 0) {
        await this.withdrawalsCol.insertMany(docs);
      }
    } catch (err) {
      console.warn('MongoDB replaceAllWithdrawals error:', err);
    }
  }

  async getWalletLedger(
    uid: string,
    fallbackTxs: WalletTransactionRecord[],
    fallbackWithdrawals: WalletWithdrawalRecord[]
  ): Promise<{
    transactions: WalletTransactionRecord[];
    withdrawals: WalletWithdrawalRecord[];
    storageMode: 'mongodb' | 'disk-fallback';
  }> {
    if (this.txsCol && this.withdrawalsCol) {
      try {
        const [transactions, withdrawals] = await Promise.all([
          this.txsCol
            .find({ $or: [{ sender: uid }, { receiver: uid }] }, { projection: { _id: 0 } })
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray(),
          this.withdrawalsCol
            .find({ userUid: uid }, { projection: { _id: 0 } })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray(),
        ]);

        if (transactions.length > 0 || withdrawals.length > 0) {
          return {
            transactions,
            withdrawals,
            storageMode: this.mode,
          };
        }
      } catch (err) {
        console.warn('MongoDB getWalletLedger error:', err);
      }
    }

    return {
      transactions: fallbackTxs.filter((t) => t.sender === uid || t.receiver === uid),
      withdrawals: fallbackWithdrawals.filter((w) => w.userUid === uid),
      storageMode: this.mode,
    };
  }
}

export const walletRepository = new WalletRepository();
