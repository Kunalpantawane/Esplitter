// Type definitions for Esplitter

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  upiId?: string;
}

export interface Session {
  user: User;
  token: string;
}

export interface Group {
  id: string;
  _id?: string;
  name: string;
  description?: string;
  inviteCode: string;
  adminId: string;
  members: GroupMember[];
  settlementMode: 'smart' | 'normal';
  isArchived: boolean;
  lastActivityAt?: string;
}

export interface GroupMember {
  _id: string;
  id?: string;
  name: string;
  email?: string;
  upiId?: string;
}

export interface Transaction {
  clientId: string;
  serverId?: string;
  groupId: string;
  description: string;
  amount: number;
  paidBy: string;
  splits: Split[];
  type: 'EXPENSE' | 'PAYMENT';
  splitType: 'EQUAL' | 'CUSTOM' | 'PERCENTAGE';
  status: 'PENDING' | 'PAID' | 'CONFIRMED';
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  createdAt: string;
  deleted?: boolean;
  retryCount?: number;
  lastError?: string;
  nextRetryAt?: number;
}

export interface Split {
  userId: string;
  amount: number;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export interface Balance {
  net: Record<string, number>;
  debts: Settlement[];
}

// Personal Expense types
export interface PersonalExpense {
  clientId: string;
  serverId?: string;
  amount: number;
  category: string;
  description?: string;
  date: string;
  paymentMethod: 'cash' | 'upi' | 'card' | 'other';
  notes?: string;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
  isDefault: boolean;
}

export interface Budget {
  id: string;
  category?: string;
  amount: number;
  month: string;
}

// API Response types
export type ApiResponse<T = unknown> = {
  error?: string;
  message?: string;
} & T;

export interface SyncPayload {
  lastSyncAt: string | null;
  pending: PendingTransaction[];
}

export interface PendingTransaction {
  clientId: string;
  groupId: string;
  description: string;
  amount: number;
  paidBy: string;
  receiverId?: string;
  splits: Split[];
  type: 'EXPENSE' | 'PAYMENT';
  splitType: 'EQUAL' | 'CUSTOM' | 'PERCENTAGE';
  status: 'PENDING' | 'PAID' | 'CONFIRMED';
  deleted: boolean;
}

export interface SyncResponse {
  synced: string[];
  errors: SyncError[];
  serverAdds: Transaction[];
  serverGroups: Group[];
  allServerGroupIds: string[];
  syncTime: string;
}

export interface SyncError {
  clientId: string;
  error: string;
}