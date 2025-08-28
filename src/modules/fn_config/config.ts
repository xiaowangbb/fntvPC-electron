import * as fs from 'fs';
import * as path from 'node:path';
import * as crypto from 'crypto';
import { app } from 'electron';
import { USER_DATA_PATH } from '@/public/constants';

const HISTORY_LIMIT = 5;
const ENCRYPTION_KEY = 'U2XDcFsV6rdTE9wB5ZHvy6BW9hBTKJ1H'; // 32 chars for aes-256
const IV = Buffer.alloc(16, 0); // Initialization vector

app.setPath('userData', USER_DATA_PATH);

function getConfigPath(): string {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'config.json');
}

// 加密密码
function encrypt(text: string): string {
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), IV);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

// 解密密码
function decrypt(encrypted: string): string {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), IV);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// 配置接口
interface Config {
    account?: string;
    domain?: string;
    token?: string;
    useHttps?: boolean;
    history?: HistoryItem[];
}

// 历史记录项接口
interface HistoryItem {
    domain: string;
    account: string;
    password: string;
    useHttps: boolean;
}

// 读取配置
export function readConfig(): Config | null {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
        try {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch {
            return null;
        }
    }
    return null;
}

// 保存配置（账号、域名、token、HTTPS设置）
export function saveConfig({ account, domain, token, useHttps }: { account?: string; domain?: string; token?: string; useHttps?: boolean }): void {
    const config: Config = readConfig() || {};
    config.account = account;
    config.domain = domain;
    config.token = token;
    config.useHttps = useHttps || false;
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

// 添加历史记录（域名、账号、加密密码、HTTPS设置）
export function addHistory({ domain, account, password, useHttps }: { domain: string; account: string; password: string; useHttps?: boolean }): void {
    const config: Config = readConfig() || {};
    config.history = config.history || [];
    // 移除重复项
    config.history = config.history.filter(
        item => !(item.domain === domain && item.account === account)
    );
    // 添加新项
    config.history.unshift({
        domain,
        account,
        password: encrypt(password),
        useHttps: useHttps || false
    });
    // 限制最多数量
    if (config.history.length > HISTORY_LIMIT) {
        config.history = config.history.slice(0, HISTORY_LIMIT);
    }
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

// 获取历史记录（解密密码）
export function getHistory(): HistoryItem[] {
    const config: Config = readConfig() || {};
    if (!config.history) return [];
    return config.history.map(item => ({
        domain: item.domain,
        account: item.account,
        password: decrypt(item.password),
        useHttps: item.useHttps || false
    }));
}

// 清除历史记录
export function clearHistory(): void {
    const config: Config = readConfig() || {};
    config.history = [];
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

// 删除单个历史记录
export function deleteHistoryItem({ domain, account }: { domain: string; account: string }): boolean {
    const config: Config = readConfig() || {};
    if (!config.history) return false;

    const originalLength = config.history.length;
    config.history = config.history.filter(
        item => !(item.domain === domain && item.account === account)
    );

    if (config.history.length < originalLength) {
        fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
        return true;
    }
    return false;
}

export default {
    readConfig,
    saveConfig,
    addHistory,
    getHistory,
    clearHistory,
    deleteHistoryItem
};