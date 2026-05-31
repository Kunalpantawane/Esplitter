// Sync Module - Offline-first sync logic with TypeScript
import { Api } from './api';
import { db } from './db';
import { Auth } from './auth';
import type { 
  Group, 
  Transaction, 
  SyncResponse, 
  PendingTransaction,
  Settlement 
} from './types';

const API = '/api/sync';
const MAX_RETRIES = 6;
const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 32000;

interface SyncResult {
  synced: number;
  pulled: number;
  failed: number;
  groups: number;
}

class SyncManager {
  private syncing = false;
  private lastSyncAt: string | null = localStorage.getItem('lastSyncAt');
  private retryTimer: number | null = null;

  isSyncInProgress(): boolean {
    return this.syncing;
  }

  getLastSyncTime(): string | null {
    return this.lastSyncAt;
  }

  async checkActualConnectivity(): Promise<boolean> {
    if (!navigator.onLine) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await Api.head('/api/health');
      clearTimeout(timeout);
      return res;
    } catch {
      return false;
    }
  }

  private getBackoffDelay(retryCount: number): number {
    return Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
  }

  async syncWithServer(): Promise<SyncResult | null> {
    if (this.syncing) {
      console.log('[Sync] Already in progress, skipping.');
      return null;
    }

    const session = await Auth.getSession();
    if (!session) return null;

    const isConnected = await this.checkActualConnectivity();
    if (!isConnected) {
      console.log('[Sync] No actual connectivity, skipping.');
      return null;
    }

    this.syncing = true;

    try {
      const now = Date.now();
      const allPending = await db.transactions
        .where('syncStatus')
        .anyOf('PENDING', 'FAILED')
        .toArray();

      const pending = allPending.filter(tx => {
        if (tx.syncStatus === 'FAILED') {
          const retryCount = tx.retryCount || 0;
          if (retryCount >= MAX_RETRIES) return false;
          const nextRetryAt = tx.nextRetryAt || 0;
          return now >= nextRetryAt;
        }
        return true;
      });

      const pendingPayload: PendingTransaction[] = pending.map(tx => ({
        clientId: tx.clientId,
        groupId: tx.groupId,
        description: tx.description,
        amount: tx.amount,
        paidBy: tx.paidBy,
        receiverId: tx.receiverId,
        splits: tx.splits,
        type: tx.type || 'EXPENSE',
        splitType: tx.splitType || 'EQUAL',
        status: tx.status || (tx.type === 'PAYMENT' ? 'PENDING' : 'PAID'),
        deleted: tx.deleted || false,
      }));

      const response = await Api.post<SyncResponse>(API, {
        lastSyncAt: this.lastSyncAt,
        pending: pendingPayload,
      });

      const { synced, errors, serverAdds, serverGroups, allServerGroupIds, syncTime } = response;

      // Process synced items
      for (const clientId of (synced || [])) {
        await db.transactions.where('clientId').equals(clientId).modify({
          syncStatus: 'SYNCED',
          retryCount: 0,
          lastError: null,
          nextRetryAt: null,
        });
      }

      // Process errors
      for (const err of (errors || [])) {
        const tx = await db.transactions.get(err.clientId);
        if (!tx) continue;
        const retryCount = (tx.retryCount || 0) + 1;
        if (retryCount >= MAX_RETRIES) {
          await db.transactions.where('clientId').equals(err.clientId).modify({
            syncStatus: 'FAILED',
            retryCount,
            lastError: err.error || 'Server rejected',
          });
        } else {
          await db.transactions.where('clientId').equals(err.clientId).modify({
            syncStatus: 'FAILED',
            retryCount,
            lastError: err.error || 'Sync error',
            nextRetryAt: Date.now() + this.getBackoffDelay(retryCount),
          });
        }
      }

      // Merge server transactions
      for (const tx of (serverAdds || [])) {
        if (tx.deleted) {
          await db.transactions.delete(tx.clientId);
          continue;
        }
        
        const existing = await db.transactions.get(tx.clientId);
        const serverId = tx._id ? String(tx._id) : undefined;
        
        if (!existing) {
          await db.transactions.put({
            clientId: tx.clientId,
            groupId: String(tx.groupId?._id || tx.groupId),
            description: tx.description,
            amount: tx.amount,
            paidBy: String(tx.paidBy?._id || tx.paidBy),
            receiverId: tx.receiverId ? String(tx.receiverId?._id || tx.receiverId) : undefined,
            splits: tx.splits,
            type: tx.type || 'EXPENSE',
            splitType: tx.splitType || 'EQUAL',
            status: tx.status || (tx.type === 'PAYMENT' ? 'PENDING' : 'PAID'),
            syncStatus: 'SYNCED',
            createdAt: tx.createdAt || new Date().toISOString(),
            serverId,
          });
        } else if (existing.syncStatus === 'SYNCED') {
          await db.transactions.update(tx.clientId, {
            description: tx.description,
            amount: tx.amount,
            splits: tx.splits,
            splitType: tx.splitType || 'EQUAL',
            status: tx.status || (tx.type === 'PAYMENT' ? 'PENDING' : 'PAID'),
            serverId,
          });
        }
      }

      // Merge server groups
      const serverGroupIds: string[] = [];
      for (const g of (serverGroups || [])) {
        const gId = String(g._id || g.id);
        serverGroupIds.push(gId);
        await db.groups.put({
          id: gId,
          name: g.name,
          inviteCode: g.inviteCode || '',
          settlementMode: g.settlementMode === 'normal' ? 'normal' : 'smart',
          adminId: g.adminId ? String(g.adminId) : '',
          members: g.members || [],
          description: g.description || '',
          isArchived: g.isArchived || false,
          lastActivityAt: g.lastActivityAt,
        });
      }

      // Cleanup local groups
      if (allServerGroupIds) {
        const validGroupIds = allServerGroupIds.map(String);
        const localGroups = await db.groups.toArray();
        for (const lg of localGroups) {
          if (!validGroupIds.includes(lg.id)) {
            await db.groups.delete(lg.id);
            await db.transactions.where('groupId').equals(lg.id).delete();
          }
        }
      }

      this.lastSyncAt = syncTime;
      localStorage.setItem('lastSyncAt', syncTime);

      const result: SyncResult = {
        synced: (synced || []).length,
        pulled: (serverAdds || []).length,
        failed: (errors || []).length,
        groups: (serverGroups || []).length,
      };

      console.log('[Sync] Complete:', result);
      return result;

    } catch (err) {
      console.warn('[Sync] Failed:', (err as Error).message);
      this.scheduleRetry();
      return null;
    } finally {
      this.syncing = false;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = window.setTimeout(async () => {
      this.retryTimer = null;
      const hasRetryable = await db.transactions
        .where('syncStatus')
        .equals('FAILED')
        .filter(tx => (tx.retryCount || 0) < MAX_RETRIES)
        .count();
      if (hasRetryable > 0) {
        console.log('[Sync] Retrying failed items...');
        await this.syncWithServer();
      }
    }, BACKOFF_BASE * 4);
  }

  async retryFailed(): Promise<SyncResult | null> {
    await db.transactions.where('syncStatus').equals('FAILED').modify({
      syncStatus: 'PENDING',
      retryCount: 0,
      lastError: null,
      nextRetryAt: null,
    });
    return this.syncWithServer();
  }

  async getPendingCount(): Promise<number> {
    return db.transactions.where('syncStatus').equals('PENDING').count();
  }

  async getFailedCount(): Promise<number> {
    return db.transactions.where('syncStatus').equals('FAILED').count();
  }

  // Group operations
  async syncGroups(): Promise<Group[]> {
    const session = await Auth.getSession();
    if (!session) return [];

    try {
      const data = await Api.get<{ groups: Group[] }>(`${API}/groups`, { cache: 'no-store' });
      const { groups } = data;
      
      for (const g of groups) {
        const gId = String(g._id || g.id);
        await db.groups.put({
          id: gId,
          name: g.name,
          inviteCode: g.inviteCode || '',
          settlementMode: g.settlementMode === 'normal' ? 'normal' : 'smart',
          adminId: g.adminId ? String(g.adminId) : '',
          members: g.members || [],
          description: g.description || '',
          isArchived: g.isArchived || false,
          lastActivityAt: g.lastActivityAt,
        });
      }
      
      return groups.map((g) => ({
        ...g,
        id: String(g._id || g.id),
      }));
    } catch {
      return db.groups.toArray();
    }
  }

  async getGroupTransactions(groupId: string): Promise<Transaction[]> {
    const all = await db.transactions.where('groupId').equals(groupId).toArray();
    return all
      .filter(tx => !tx.deleted)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export const Sync = new SyncManager();
export default Sync;