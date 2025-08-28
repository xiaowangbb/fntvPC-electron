import { spawn, ChildProcess } from 'child_process';
import { Player, PlayerOptions, ProgressData } from '@/modules/player/playerInterface';
import { buildProxiedUrl, getProgressByUrl } from '@/modules/proxy/localProxy';

// PotPlayer 实现（通过 PotPlayerMini.exe 启动）
export class PotPlayer implements Player {
    // 全局存储播放状态（PotPlayer 无法直接回传进度，这里保持最后状态）
    static globalStatus: ProgressData = {
        currentSeconds: 0,
        totalSeconds: 0,
        percentage: 0,
    };

    private config: Required<PlayerOptions>;
    private playerProcess: ChildProcess | null = null;
    private progressTimer: NodeJS.Timeout | null = null;

    constructor(options: PlayerOptions) {
        const defaultConfig: Required<PlayerOptions> = {
            url: '',
            playerPath: 'PotPlayerMini.exe',
            title: 'Media Player',
            headers: {},
            debug: false,
            extraArgs: [],
            onData: () => { },
            onError: () => { },
            onExit: () => { },
        };
        this.config = { ...defaultConfig, ...options };
    }

    // 将 headers 映射为 PotPlayer 支持的 CLI 选项（已弃用：改用本地代理注入）
    private buildHeaderArgs(headers: Record<string, string> | undefined): string[] {
        const args: string[] = [];
        if (!headers || Object.keys(headers).length === 0) return args;

        const findHeader = (name: string) => {
            const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
            return key ? headers[key] : undefined;
        };

        const ua = findHeader('user-agent');
        if (ua) args.push(`/user_agent="${ua}"`);

        const ref = findHeader('referer');
        if (ref) args.push(`/referer="${ref}"`);

        const otherEntries = Object.entries(headers).filter(([k]) => {
            const lower = k.toLowerCase();
            return lower !== 'user-agent' && lower !== 'referer';
        });
        if (otherEntries.length) {
            const hdr = otherEntries
                .map(([k, v]) => `${k}: ${encodeURIComponent(String(v))}`)
                .join(', ');
            args.push(`/headers="${hdr}"`);
        }
        return args;
    }


    play(): ChildProcess | null {
        const args: string[] = [];

        // 使用本地代理包装 URL，在代理层注入 headers
        if (this.config.url) {
            const proxied = buildProxiedUrl(this.config.url, this.config.headers);
            args.push(proxied + `\\${this.config.title}`);
        }

        // 建议使用 /new 打开新实例，避免复用已存在窗口
        // args.push('/new');


        // 标题：PotPlayer 对窗口标题的 CLI 支持有限，这里不强制设置，部分版本支持 /title="..."。
        // 若你确认版本支持，可解开下行并保留引号（否则忽略）。
        // if (this.config.title) args.push(`/title="${this.config.title}" `);

        // 额外参数
        // if (this.config.extraArgs?.length) {
        //     args.push(...this.config.extraArgs);
        // }

        // 不再通过 PotPlayer CLI 传递 HTTP 头，统一由本地代理注入



        if (this.config.debug) {
            console.log('PotPlayer 命令:', `"${this.config.playerPath}" ${args.join(' ')}`);
        }

        this.playerProcess = spawn(this.config.playerPath, args, {
            stdio: ['ignore', 'ignore', 'pipe'],
            detached: true,
        });

        // 进度轮询：每 1s 从代理侧读取 m3u8/分片推断的进度
        try {
            const originalUrl = this.config.url;
            this.progressTimer = setInterval(() => {
                try {
                    const prog = getProgressByUrl(originalUrl);
                    PotPlayer.globalStatus = prog;
                    this.config.onData?.(prog);
                } catch { /* ignore */ }
            }, 5000);
        } catch { /* ignore */ }

        // 读取错误输出（PotPlayer 一般不在 stdout 打印日志）
        this.playerProcess.stderr?.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) {
                if (this.config.debug) console.error(`[PotPlayer Error] ${msg}`);
                this.config.onError(msg);
            }
        });

        // 退出事件（无法获知播放进度，返回最后记录状态）
        this.playerProcess.on('exit', (code) => {
            this.config.onExit(code, PotPlayer.globalStatus);
            if (this.config.debug) {
                if (code !== 0 && code !== null) console.error(`PotPlayer 进程异常退出 (code ${code})`);
            }
            if (this.progressTimer) { clearInterval(this.progressTimer); this.progressTimer = null; }
            this.playerProcess = null;
        });

        this.playerProcess.on('error', (err: any) => {
            if (err?.code === 'ENOENT') {
                console.error('错误: 找不到 PotPlayerMini.exe。请确认已安装 PotPlayer，或通过 playerPath 指定完整路径。');
            } else {
                console.error(`PotPlayer 启动失败: ${err.message}`);
            }
            this.config.onError(err?.message ?? String(err));
            if (this.progressTimer) { clearInterval(this.progressTimer); this.progressTimer = null; }
            this.playerProcess = null;
        });

        return this.playerProcess;
    }

    stop(): void {
        if (this.playerProcess) {
            this.config.onExit(0, PotPlayer.globalStatus);
            try {
                this.playerProcess.kill();
            } catch { }
            this.playerProcess = null;
        }
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
            this.progressTimer = null;
        }
    }

    getStatus(): ProgressData {
        return PotPlayer.globalStatus;
    }

    isPlaying(): boolean {
        return this.playerProcess !== null && !this.playerProcess.killed;
    }
}

