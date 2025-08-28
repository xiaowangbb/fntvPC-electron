import { ipcMain, app, dialog, BrowserWindow } from 'electron';
import { getMainWindow } from './windowsManager';
import { setHalfScreen, setFullScreen } from './screenControl';
import { MpvPlayer } from '@/modules/player/mpv/mpv';
import { PotPlayer } from '@/modules/player/potplayer/potplayer';
import { ApiService } from '@/modules/fn_api/api';
import { restoreCookies } from '@/modules/fn_config/cookie';
import config from '@/modules/fn_config/config';
import { Player, PlayerOptions, ProgressData } from '@/modules/player/playerInterface';
import { playStatus } from '@/modules/fn_api/api.d';

const fnConfig = config;

async function refreshWindow(): Promise<void> {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
        focusedWindow.webContents.reload();
    }
}

// 窗口最小化处理函数
function handleMinimize(): void {
    ipcMain.on('window-minimize', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.minimize();
    });
}

// 窗口最大化/还原处理函数
function handleMaximize(): void {
    ipcMain.on('window-maximize', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            mainWindow.isMaximized() ? setHalfScreen() : setFullScreen();
        }
    });
}

// 窗口关闭处理函数
function handleClose(): void {
    ipcMain.on('window-close', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.close();
    });
}

// 全局播放器实例引用
let currentPlayer: Player | null = null;

// 处理播放事件
async function playMovie(event: Electron.IpcMainEvent, { id, token, playerType = "mpv" }: { id: string; token: string; playerType?: 'mpv' | 'potplayer' }): Promise<void> {
    // 检查是否已有播放器在播放
    if (currentPlayer && currentPlayer.isPlaying()) {
        console.warn('已有播放器在播放，无法重复播放');
        return;
    }

    console.log('Play movie event received id:', id, 'with token:', token);

    const config = fnConfig.readConfig();
    if (!config || !config.domain) {
        throw new Error('无法找到服务器地址配置');
    }

    const fnapi = new ApiService(config.domain, token);

    const response = await fnapi.getPlayInfo(id)
        .catch((error: any) => {
            console.error('获取播放信息失败:', error);
            return null;
        });

    if (!response || !response.success || !response.data) {
        console.error('获取播放信息失败:', response ? response.message : '未知错误');
        return;
    }

    console.log('获取播放信息成功:', response.data);

    const mediaGuid = response.data.media_guid;


    const itemGuid = response.data.guid;
    const subFiles = await fnapi.getSubtitle(itemGuid).then(fnapi.downloadSubtitle).catch((error: any) => {
        console.error('获取字幕文件失败:', error);
        return [];
    });
    // mpv 专用字幕参数（每个字幕一个独立参数）
    const subArgList = subFiles.map((sub: string) => `--sub-file=${sub}`);

    // 计算起始播放位置百分比
    const playUrl = fnapi.getVideoUrl(mediaGuid);
    const last = response.data.ts;
    const total = response.data.item.duration;
    console.log('Play URL:', playUrl, 'Last:', last, 'Total:', total);
    let percentage: number;
    if (total <= 0) {
        percentage = 0;
    } else {
        percentage = last / total * 100;
    }

    const startPosition = `${percentage}%`;

    const playStatus: playStatus = {
        item_guid: itemGuid,
        media_guid: mediaGuid,
        video_guid: response.data.video_guid,
        audio_guid: response.data.audio_guid,
        subtitle_guid: response.data.subtitle_guid,
        play_link: new URL(playUrl).pathname,
        ts: last,
        duration: total
    };

    let title = response.data.item.title;
    if (response.data.item.tv_title) {
        title = `${response.data.item.tv_title || ''} - S${response.data.item.season_number || ''}E${response.data.item.episode_number || ''}: ${response.data.item.title || ''}`;
    }


    // 构建通用配置（不同播放器会覆盖差异项）
    const commonConfig: Omit<PlayerOptions, 'playerPath'> & { playerPath?: string } = {
        url: playUrl,
        title: title,
        headers: {
            Authorization: token,
        },
        extraArgs: [],
        debug: true,
        onData: (progress: ProgressData) => {
            if (progress.percentage > 90) {
                console.log('视频播放接近结束，更新状态...');
                fnapi.setWatched(itemGuid);
                return;
            }
            console.log('当前播放进度:', progress);
            playStatus.ts = progress.currentSeconds;
            playStatus.duration = progress.totalSeconds;
            fnapi.recordPlayState(playStatus);
        },
        onError: (err: any) => console.error('Player error:', err),
        onExit: (code: number | null, progress: ProgressData) => {
            if (code !== 0 && code !== null) {
                console.error(`播放器异常退出 (code ${code})`);
                return;
            }
            console.log('Player exited with code:', code);
            console.log('最后播放位置:', progress);
            if (progress.percentage > 90) {
                console.log('视频播放接近结束，更新状态...');
                fnapi.setWatched(itemGuid).then(refreshWindow);
                return;
            }
            playStatus.ts = progress.currentSeconds;
            playStatus.duration = progress.totalSeconds;
            fnapi.recordPlayState(playStatus).then(refreshWindow);
        }
    };

    let player: Player;
    if (playerType === 'potplayer') {
        const potConfig: PlayerOptions = {
            ...commonConfig,
            url: await fnapi.getM38U_Url(itemGuid),
            playerPath: 'E:\\PotPlayer\\PotPlayerMini64.exe',
            extraArgs: [
                // PotPlayer 的 /seek 接受秒或 hh:mm:ss.ms，这里直接用秒数 last
                `/seek=${last}`,
                // 为每个字幕追加 /sub 参数
                ...subFiles.map((sub: string) => `/sub="${sub}"`)
            ],
        };
        player = new PotPlayer(potConfig);
    } else {
        // 默认 mpv
        const mpvConfig: PlayerOptions = {
            ...commonConfig,
            playerPath: 'third_party\\mpv\\mpv.exe',
            extraArgs: [
                '--force-window=immediate',
                `--start=${startPosition}`,
                '--cache-secs=20',
                ...subArgList,
            ],
        };
        player = new MpvPlayer(mpvConfig);
    }

    // 保存全局引用
    currentPlayer = player;

    // 开始播放
    player.play();
}

// 监听应用退出事件
app.on('before-quit', () => {
    if (currentPlayer) {
        console.log('应用退出前关闭播放器');
        currentPlayer.stop();
        currentPlayer = null;
    }
});

// 播放电影处理函数
function handlePlayMovie(): void {
    ipcMain.on('play-movie', playMovie);
}

function handleLogin(): void {
    // 监听获取配置请求
    ipcMain.on('get-config', (event) => {
        try {
            const config = fnConfig.readConfig() || {};
            const history = fnConfig.getHistory() || [];
            event.reply('config-data', { config, history });
        } catch (error) {
            console.error('读取配置失败:', error);
            event.reply('config-data', { config: {}, history: [] });
        }
    });

    // 监听清除历史记录请求
    ipcMain.on('clear-history', (event) => {
        try {
            fnConfig.clearHistory();
            event.reply('history-cleared');
        } catch (error) {
            console.error('清除历史记录失败:', error);
        }
    });

    // 监听删除单个历史记录请求
    ipcMain.on('delete-history-item', (event, { domain, account }) => {
        try {
            const success = fnConfig.deleteHistoryItem({ domain, account });
            if (success) {
                event.reply('history-item-deleted');
            }
        } catch (error) {
            console.error('删除历史记录项失败:', error);
        }
    });

    // 监听来自渲染进程的跳转请求
    ipcMain.on('login', async (event, loginData) => {
        // 这里可以存储或验证token
        console.log('Received loginData:', loginData);
        if (!loginData || !loginData.domain || !loginData.username || !loginData.password) {
            event.reply('login-error', {
                title: '登录失败',
                message: '请提供完整的登录信息。'
            });
            return;
        }

        // 跳转到主页面
        // mainWindow.loadURL(`${loginData.domain}/v`);
        let server: string;
        if (loginData.useHttps) {
            server = "https://" + loginData.domain;
        } else {
            server = "http://" + loginData.domain;
        }

        const fnapi = new ApiService(server);

        const response = await fnapi.login(loginData.username, loginData.password)
            .catch((error: any) => {
                console.error('登录请求失败:', error);
                // 发送网络错误消息到渲染进程
                event.reply('login-error', {
                    title: '连接失败',
                    message: '无法连接到服务器，请检查域名是否正确或网络连接是否正常。'
                });
                return null;
            });

        if (!response || !response.success || !response.data) {
            // 发送错误消息到渲染进程
            event.reply('login-error', {
                title: '登录失败',
                message: '请检查账号、密码或者域名是否正确。'
            });
            return;
        }
        const token = response.data.token;
        console.log("token:%s", token);
        if (!token) {
            // 发送错误消息到渲染进程
            event.reply('login-error', {
                title: '登录失败',
                message: '没有有效的登录信息，无法恢复 cookies'
            });
            return;
        }

        // 保存登录信息
        const { saveConfig, addHistory } = require('../modules/fn_config/config');

        // 构建完整的域名URL
        const domain = loginData.useHttps ? `https://${loginData.domain}` : `http://${loginData.domain}`;

        // 保存配置
        saveConfig({
            account: loginData.username,
            domain: domain,
            token: response.data.token,
            useHttps: loginData.useHttps
        });

        // 添加到登录历史
        addHistory({
            domain: loginData.domain,
            account: loginData.username,
            password: loginData.password,
            useHttps: loginData.useHttps
        });

        // 跳转到主页
        const mainWindow = getMainWindow();
        if (mainWindow) {
            // 恢复 cookie
            console.log('恢复登录状态，跳转到主页面, domain:', domain);
            restoreCookies(domain, token).then(() => {
                mainWindow.loadURL(`${domain}/v`);
            });
        }
    });
}

// 注册所有IPC处理器的聚合函数
export function registerIpcHandlers(): void {
    handleLogin();
    handleMinimize();
    handleMaximize();
    handleClose();
    handlePlayMovie();
}