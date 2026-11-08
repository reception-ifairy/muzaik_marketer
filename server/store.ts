import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import type { KeyStatus, ModelInfo, KeyProvider as Provider } from '../src/aiSettings';
import type { ChatMessage, Conversation, ConversationSummary } from '../src/chat';
import { APP } from '../src/config';

// Persistent storage for API keys (already encrypted by the caller), JSON documents (AI prefs,
// profile) and conversations. MariaDB/MySQL when DB_HOST + DB_NAME are set (server deployment),
// otherwise JSON files next to the app (local Windows install without a database).

export interface StoredKey {
  provider: Provider;
  cipher: string;
  hint: string;
  status: KeyStatus;
  message: string | null;
  models: ModelInfo[];
  testedAt: string | null;
}

export type NewMessage = Omit<ChatMessage, 'id' | 'createdAt'>;

export interface SettingsStore {
  readonly kind: 'mysql' | 'file';
  init(): Promise<void>;
  getKeys(): Promise<StoredKey[]>;
  saveKey(provider: Provider, cipher: string, hint: string): Promise<void>;
  deleteKey(provider: Provider): Promise<void>;
  saveKeyStatus(provider: Provider, status: KeyStatus, message: string | null, models: ModelInfo[] | null): Promise<void>;
  getDoc(name: string): Promise<Record<string, unknown>>;
  saveDoc(name: string, value: unknown): Promise<void>;
  listConversations(limit: number): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(title: string): Promise<ConversationSummary>;
  renameConversation(id: string, title: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  addMessage(conversationId: string, message: NewMessage): Promise<ChatMessage>;
}

const newId = () => crypto.randomUUID();

// Table names carry the app id (APP.id in src/config.ts), so several apps can share one database.
const T = {
  keys: `${APP.id}_api_keys`,
  settings: `${APP.id}_settings`,
  conversations: `${APP.id}_conversations`,
  messages: `${APP.id}_messages`,
};

class MysqlStore implements SettingsStore {
  readonly kind = 'mysql' as const;
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 4,
      charset: 'utf8mb4',
      dateStrings: false,
    });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${T.keys} (
        provider VARCHAR(16) NOT NULL PRIMARY KEY,
        key_cipher TEXT NOT NULL,
        key_hint VARCHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'untested',
        status_message TEXT NULL,
        models JSON NULL,
        tested_at DATETIME NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${T.settings} (
        name VARCHAR(64) NOT NULL PRIMARY KEY,
        value JSON NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${T.conversations} (
        id CHAR(36) NOT NULL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        message_count INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${T.messages} (
        id CHAR(36) NOT NULL PRIMARY KEY,
        conversation_id CHAR(36) NOT NULL,
        role VARCHAR(16) NOT NULL,
        content MEDIUMTEXT NOT NULL,
        extras JSON NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'complete',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_conversation (conversation_id, created_at),
        CONSTRAINT ${T.messages}_conversation_fk FOREIGN KEY (conversation_id) REFERENCES ${T.conversations} (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async getKeys(): Promise<StoredKey[]> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT provider, key_cipher, key_hint, status, status_message, models, tested_at FROM ${T.keys}`,
    );
    return rows.map((r) => ({
      provider: r.provider,
      cipher: r.key_cipher,
      hint: r.key_hint,
      status: r.status,
      message: r.status_message,
      models: parseJson<ModelInfo[]>(r.models, []),
      testedAt: r.tested_at ? new Date(r.tested_at).toISOString() : null,
    }));
  }

  async saveKey(provider: Provider, cipher: string, hint: string) {
    await this.pool.query(
      `INSERT INTO ${T.keys} (provider, key_cipher, key_hint, status, status_message, models, tested_at)
       VALUES (?, ?, ?, 'untested', NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE key_cipher = VALUES(key_cipher), key_hint = VALUES(key_hint),
         status = 'untested', status_message = NULL, models = NULL, tested_at = NULL`,
      [provider, cipher, hint],
    );
  }

  async deleteKey(provider: Provider) {
    await this.pool.query(`DELETE FROM ${T.keys} WHERE provider = ?`, [provider]);
  }

  async saveKeyStatus(provider: Provider, status: KeyStatus, message: string | null, models: ModelInfo[] | null) {
    await this.pool.query(
      `UPDATE ${T.keys} SET status = ?, status_message = ?, models = COALESCE(?, models), tested_at = NOW() WHERE provider = ?`,
      [status, message, models ? JSON.stringify(models) : null, provider],
    );
  }

  async getDoc(name: string) {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(`SELECT value FROM ${T.settings} WHERE name = ?`, [name]);
    return rows.length ? parseJson<Record<string, unknown>>(rows[0].value, {}) : {};
  }

  async saveDoc(name: string, value: unknown) {
    await this.pool.query(`INSERT INTO ${T.settings} (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`, [
      name,
      JSON.stringify(value),
    ]);
  }

  async listConversations(limit: number): Promise<ConversationSummary[]> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, title, message_count, updated_at FROM ${T.conversations} ORDER BY updated_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map(toSummary);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const [convs] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, title, message_count, updated_at FROM ${T.conversations} WHERE id = ?`,
      [id],
    );
    if (!convs.length) return null;
    const [msgs] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, role, content, extras, status, created_at FROM ${T.messages} WHERE conversation_id = ? ORDER BY created_at, id`,
      [id],
    );
    return { ...toSummary(convs[0]), messages: msgs.map(toMessage) };
  }

  async createConversation(title: string): Promise<ConversationSummary> {
    const id = newId();
    await this.pool.query(`INSERT INTO ${T.conversations} (id, title) VALUES (?, ?)`, [id, title]);
    return { id, title, messageCount: 0, updatedAt: new Date().toISOString() };
  }

  async renameConversation(id: string, title: string) {
    await this.pool.query(`UPDATE ${T.conversations} SET title = ? WHERE id = ?`, [title, id]);
  }

  async deleteConversation(id: string) {
    await this.pool.query(`DELETE FROM ${T.conversations} WHERE id = ?`, [id]);
  }

  async addMessage(conversationId: string, m: NewMessage): Promise<ChatMessage> {
    const id = newId();
    const createdAt = new Date();
    const extras = { sources: m.sources, steps: m.steps, images: m.images };
    await this.pool.query(
      `INSERT INTO ${T.messages} (id, conversation_id, role, content, extras, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, conversationId, m.role, m.content, JSON.stringify(extras), m.status, createdAt],
    );
    await this.pool.query(
      `UPDATE ${T.conversations} SET message_count = message_count + 1, updated_at = ? WHERE id = ?`,
      [createdAt, conversationId],
    );
    return { ...m, id, createdAt: createdAt.toISOString() };
  }
}

function toSummary(r: mysql.RowDataPacket): ConversationSummary {
  return { id: r.id, title: r.title, messageCount: Number(r.message_count), updatedAt: new Date(r.updated_at).toISOString() };
}

function toMessage(r: mysql.RowDataPacket): ChatMessage {
  const extras = parseJson<Partial<ChatMessage>>(r.extras, {});
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    sources: extras.sources ?? [],
    steps: extras.steps ?? [],
    images: extras.images ?? [],
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

interface FileData {
  keys: Partial<Record<Provider, StoredKey>>;
  docs: Record<string, unknown>;
  conversations: Conversation[];
}

class FileStore implements SettingsStore {
  readonly kind = 'file' as const;
  constructor(private file: string) {}

  private read(): FileData {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileData> & { prefs?: unknown };
      // Older files kept AI prefs under `prefs`.
      const docs = data.docs ?? (data.prefs ? { ai_prefs: data.prefs } : {});
      return { keys: data.keys ?? {}, docs, conversations: data.conversations ?? [] };
    } catch {
      return { keys: {}, docs: {}, conversations: [] };
    }
  }

  private write(data: FileData) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Write-then-rename so a crash never leaves a half-written settings file.
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  async init() {}

  async getKeys() {
    return Object.values(this.read().keys).filter((k): k is StoredKey => Boolean(k));
  }

  async saveKey(provider: Provider, cipher: string, hint: string) {
    const data = this.read();
    data.keys[provider] = { provider, cipher, hint, status: 'untested', message: null, models: [], testedAt: null };
    this.write(data);
  }

  async deleteKey(provider: Provider) {
    const data = this.read();
    delete data.keys[provider];
    this.write(data);
  }

  async saveKeyStatus(provider: Provider, status: KeyStatus, message: string | null, models: ModelInfo[] | null) {
    const data = this.read();
    const key = data.keys[provider];
    if (!key) return;
    data.keys[provider] = { ...key, status, message, models: models ?? key.models, testedAt: new Date().toISOString() };
    this.write(data);
  }

  async getDoc(name: string) {
    return (this.read().docs[name] as Record<string, unknown>) ?? {};
  }

  async saveDoc(name: string, value: unknown) {
    const data = this.read();
    data.docs[name] = value;
    this.write(data);
  }

  async listConversations(limit: number) {
    return this.read()
      .conversations.map(({ messages: _m, ...summary }) => summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async getConversation(id: string) {
    return this.read().conversations.find((c) => c.id === id) ?? null;
  }

  async createConversation(title: string) {
    const data = this.read();
    const conv: Conversation = { id: newId(), title, messageCount: 0, updatedAt: new Date().toISOString(), messages: [] };
    data.conversations.push(conv);
    this.write(data);
    const { messages: _m, ...summary } = conv;
    return summary;
  }

  async renameConversation(id: string, title: string) {
    const data = this.read();
    const conv = data.conversations.find((c) => c.id === id);
    if (conv) conv.title = title;
    this.write(data);
  }

  async deleteConversation(id: string) {
    const data = this.read();
    data.conversations = data.conversations.filter((c) => c.id !== id);
    this.write(data);
  }

  async addMessage(conversationId: string, m: NewMessage) {
    const data = this.read();
    const conv = data.conversations.find((c) => c.id === conversationId);
    const message: ChatMessage = { ...m, id: newId(), createdAt: new Date().toISOString() };
    if (conv) {
      conv.messages.push(message);
      conv.messageCount = conv.messages.length;
      conv.updatedAt = message.createdAt;
      this.write(data);
    }
    return message;
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T; // mysql2 already parses JSON columns
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createStore(appDir: string): SettingsStore {
  if (process.env.DB_HOST && process.env.DB_NAME) return new MysqlStore();
  return new FileStore(path.join(appDir, 'data', `${APP.id}-settings.json`));
}
