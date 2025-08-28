import { BrowserWindow, session } from 'electron';
import * as path from 'path';
import { restoreCookies } from '@/modules/fn_config/cookie';
import { readConfig, saveConfig } from '@/modules/fn_config/config';

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
    // 创建窗口
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 800,
        minWidth: 800,
        minHeight: 800,
        autoHideMenuBar: true,
        show: false,
        icon: path.join(__dirname, '../build/icon.ico'),
        frame: false,
        transparent: true,
        webPreferences: {
            webgl: true,
            partition: 'persist:fntv',
            preload: path.join(__dirname, '../preload/index.js'),
            nodeIntegration: true,   // 开启 Node.js 支持
            contextIsolation: false,  // 如果 preload 里要直接改 DOM，通常要关掉
            spellcheck: false,  // 禁用拼写检查，避免输入法干扰
        }
    });

    // 初始化 session
    const ses = session.fromPartition('persist:fntv');

    // 检查并清理缓存的函数
    const checkAndClearCache = async (): Promise<void> => {
        try {
            const usage = await ses.getCacheSize();
            console.log('当前缓存使用量：', Math.round(usage / (1024 * 1024)), 'MB');

            // 如果超过100MB，清理缓存
            if (usage > 100 * 1024 * 1024) {
                await ses.clearCache();
                console.log('已清理缓存文件夹');
            }
        } catch (err) {
            console.error('检查缓存使用量失败:', err);
        }
    };

    // 程序启动时立即执行一次
    checkAndClearCache();

    // 后续每6小时执行一次
    setInterval(checkAndClearCache, 6 * 60 * 60 * 1000);

    // 拦截登录请求到自定义登录页面
    ses.webRequest.onBeforeRequest(
        {
            urls: [
                'http://*/v/login',
                'https://*/v/login'
            ]
        },
        (details, callback) => {
            console.log('检测到登录请求，清空登录信息并跳转到登录页面');
            // 清空配置cookie
            clearLoginCookies();
            // 取消请求
            callback({ cancel: true });
            // 加载自定义页面
            mainWindow!.loadFile(path.join(__dirname, '../public/login.html'));
        }
    );

    // 拦截登出请求
    ses.webRequest.onBeforeRequest(
        {
            urls: [
                'http://*/v/api/v1/user/logout',
                'https://*/v/api/v1/user/logout'
            ]
        },
        (details, callback) => {
            console.log('检测到登出请求，清空登录信息并跳转到登录页面');
            // 清空配置cookie
            clearLoginCookies();
            // 取消请求
            callback({ cancel: true });
            // 加载自定义页面
            mainWindow!.loadFile(path.join(__dirname, '../public/login.html'));
        }
    );

    // 禁用输入法相关功能
    mainWindow.webContents.on('dom-ready', () => {
        // 注入CSS来禁用输入法自动切换
        mainWindow!.webContents.insertCSS(`
            * {
                ime-mode: disabled !important;
                -webkit-ime-mode: disabled !important;
            }
            input, textarea {
                ime-mode: inactive !important;
                -webkit-ime-mode: inactive !important;
            }
        `);
    });

    // 调试
    // mainWindow.webContents.openDevTools();

    // 从配置中恢复 cookie
    const savedConfig = readConfig();
    // 检查配置中是否有已保存的登录信息
    if (savedConfig && savedConfig.token && savedConfig.domain) {
        // 恢复 cookie 并跳转到对应的 URL
        console.log('恢复登录状态，跳转到主页面, domain:', savedConfig.domain, ' token:', savedConfig.token);
        // 恢复 cookie
        restoreCookies(savedConfig.domain, savedConfig.token).then(() => {
            mainWindow!.loadURL(`${savedConfig.domain}/v`);
        });
    } else {
        // 没有有效的登录信息，加载登录页面
        mainWindow!.loadFile(path.join(__dirname, '../public/login.html'));
    }

    return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
    return mainWindow;
}

export function setupWindowShowEvents(mainWindow: BrowserWindow): void {
    mainWindow.once('ready-to-show', () => mainWindow.show());
}

/**
 * 清空登录信息和Cookie
 */
function clearLoginCookies(): void {
    console.log('清空登录信息和Cookie');

    // 清空配置中保存的token
    const config = readConfig() || {};
    if (config.token || config.domain) {
        // 保留domain和useHttps但清空token
        saveConfig({
            account: config.account,
            domain: config.domain,
            token: '',
            useHttps: config.useHttps
        });
        console.log('已清空配置中的登录token');
    }

    // 清除会话中的cookie
    const ses = session.fromPartition('persist:fntv');
    ses.clearStorageData({
        storages: ['cookies']
    }).then(() => {
        console.log('会话Cookie已清除');
    }).catch(err => {
        console.error('清除Cookie失败:', err);
    });
}