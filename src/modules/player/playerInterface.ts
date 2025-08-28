import { ChildProcess } from "child_process";

// 抽象播放器接口与通用类型
export interface ProgressData {
    currentSeconds: number;
    totalSeconds: number;
    percentage: number;
}

export interface PlayerOptions {
    url: string;
    playerPath?: string;
    title?: string;
    headers?: Record<string, string>;
    debug?: boolean;
    extraArgs?: string[];
    onData?: (progress: ProgressData) => void;
    onError?: (error: string) => void;
    onExit?: (code: number | null, progress: ProgressData) => void;
}

// 最小播放器接口约定
export interface Player {
    play(): ChildProcess | null;
    stop(): void;
    getStatus(): ProgressData;
    isPlaying(): boolean;
}
