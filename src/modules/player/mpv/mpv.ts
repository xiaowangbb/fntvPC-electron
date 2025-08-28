import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import { Player, PlayerOptions, ProgressData } from '@/modules/player/playerInterface';

// MPV 播放器实现
export class MpvPlayer implements Player {
    // 全局存储播放状态
    static globalStatus: ProgressData = {
        currentSeconds: 0,
        totalSeconds: 0,
        percentage: 0
    };

    private config: Required<PlayerOptions>;
    private playerProcess: ChildProcess | null = null;
    private lastProgressTime: number = 0;    // 上次触发进度回调的时间戳
    private throttleInterval: number = 15000; // 15秒间隔（毫秒）

    constructor(options: PlayerOptions) {
        // 默认配置
        const defaultConfig: Required<PlayerOptions> = {
            url: '',
            playerPath: 'mpv',
            title: 'Media Player',
            headers: {},
            debug: false,
            extraArgs: [],
            onData: () => { },
            onError: () => { },
            onExit: () => { }
        };

        // 合并用户配置
        this.config = { ...defaultConfig, ...options };
    }

    /**
     * 解析MPV输出的时间数据
     * @param {string} str - MPV输出的字符串
     * @returns {Object} 解析后的时间对象
     */
    static parseVideoData(str: string): ProgressData | null {
        const timeRegex = /(\d{2}:\d{2}:\d{2}) \/ (\d{2}:\d{2}:\d{2}) \((\d+)%\)/;
        const match = str.match(timeRegex);

        if (!match) return null;

        const parseTimeToSeconds = (timeStr: string): number => {
            const [hours, minutes, seconds] = timeStr.split(':').map(Number);
            return hours * 3600 + minutes * 60 + seconds;
        };

        return {
            currentSeconds: parseTimeToSeconds(match[1]),
            totalSeconds: parseTimeToSeconds(match[2]),
            percentage: parseInt(match[3])
        };
    }

    /**
     * 启动MPV播放器
     */
    play(): ChildProcess | null {
        // 构建命令行参数
        const args: string[] = [];

        // Windows平台特殊参数
        if (os.platform() === 'win32') {
            args.push(
                '--border=no',  // 无边框窗口
                '--vo=gpu-next', // <gpu/gpu-next/libmpv> 视频输出驱动。许多后续选项也只能在此三项下正常工作。当前版本默认值即 gpu-next
                '--gpu-api=d3d11',
                '--hwdec=auto-copy',
                // 统一窗口大小设置 - 保持一致的初始窗口大小
                '--geometry=1280x720',      // 固定窗口大小为 1280x720
            );
        }

        // 添加请求头
        const headerArgs: string[] = [];
        for (const [key, value] of Object.entries(this.config.headers)) {
            headerArgs.push(`${key}: ${value}`);
        }
        if (headerArgs.length > 0) {
            args.push(`--http-header-fields=${headerArgs.join(',')}`);
        }

        // 添加其他参数
        args.push(
            '--force-media-title=' + this.config.title,
            ...this.config.extraArgs,
            this.config.url
        );

        // 调试模式输出命令
        if (this.config.debug) {
            console.log('MPV 命令:', `"${this.config.playerPath}" ${args.join(' ')}`);
        }

        // 启动播放器进程
        this.playerProcess = spawn(this.config.playerPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true
        });

        // 处理标准输出
        this.playerProcess.stdout?.on('data', (data) => {
            const output = data.toString().trim();

            // 调试输出
            // if (this.config.debug && output) {
            //     console.log(`[MPV] ${output}`);
            // }

            // 尝试解析进度数据
            const progressData = MpvPlayer.parseVideoData(output);
            if (progressData) {
                // 更新全局状态
                MpvPlayer.globalStatus = progressData;
                // 节流处理
                const now = Date.now();
                if (now - this.lastProgressTime >= this.throttleInterval) {
                    // 触发进度回调
                    this.config.onData(progressData);
                    this.lastProgressTime = now;
                }
            }
        });

        // 处理错误输出
        this.playerProcess.stderr?.on('data', (data) => {
            const errorMessage = data.toString().trim();
            if (errorMessage) {
                if (this.config.debug) {
                    console.error(`[MPV Error] ${errorMessage}`);
                }
                this.config.onError(errorMessage);
            }
        });

        // 处理进程退出
        this.playerProcess.on('exit', (code) => {
            // 退出时传递最后记录的进度状态
            this.config.onExit(code, MpvPlayer.globalStatus);

            if (this.config.debug) {
                if (code !== 0 && code !== null) {
                    console.error(`播放异常结束 (code ${code})`);
                } else {
                    console.log('播放器正常退出');
                }
            }

            // 清理进程引用
            this.playerProcess = null;
        });

        // 处理启动错误
        this.playerProcess.on('error', (err) => {
            if ((err as any).code === 'ENOENT') {
                console.error('错误: 找不到 mpv 播放器。请确保已安装 mpv。');
                console.error('在 macOS/Linux 上: brew install mpv');
                console.error('在 Windows 上: 从 https://mpv.io/installation/ 下载');
                console.error('或使用 --playerPath 参数指定 mpv 的完整路径');
            } else {
                console.error(`播放失败: ${err.message}`);
            }

            this.config.onError(err.message);
            this.playerProcess = null;
        });

        return this.playerProcess;
    }

    /**
     * 停止播放
     */
    stop(): void {
        if (this.playerProcess) {
            this.config.onExit(0, MpvPlayer.globalStatus); // 传递当前状态
            console.log('停止播放');
            this.playerProcess.kill();
            this.playerProcess = null;
        }
    }

    /**
     * 获取当前播放状态
     * @returns {Object} 当前播放状态
     */
    getStatus(): ProgressData {
        return MpvPlayer.globalStatus;
    }

    /**
     * 检查播放器是否正在播放
     * @returns {boolean} 是否正在播放
     */
    isPlaying(): boolean {
        return this.playerProcess !== null && !this.playerProcess.killed;
    }
}