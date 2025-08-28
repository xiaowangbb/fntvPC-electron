// API响应接口
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
    code?: number;
}

// 登录响应数据接口
export interface LoginResponseData {
    token: string;
}

// 播放信息响应数据接口
export interface PlayInfoResponseData {
    media_guid: string;
    guid: string;
    video_guid: string;
    audio_guid: string;
    subtitle_guid: string;
    ts: number;
    item: {
        duration: number;
        title: string;
        tv_title?: string;
        season_number?: number;
        episode_number?: number;
    };
}

// 字幕流接口
export interface SubtitleStream {
    guid: string;
    format: string;
    title: string;
}

// 字幕对象接口
export interface Subtitle {
    id: string;
    format: string;
    name: string;
}

// 字幕下载结果接口
export interface SubtitleDownloadResult {
    id: string;
    filePath: string;
    success: boolean;
    error?: string;
}

export interface playStatus {
    item_guid: PlayInfoResponseData['guid'],
    media_guid: PlayInfoResponseData['media_guid'],
    video_guid: PlayInfoResponseData['video_guid'],
    audio_guid: PlayInfoResponseData['audio_guid'],
    subtitle_guid: PlayInfoResponseData['subtitle_guid'],
    play_link: string,
    ts: PlayInfoResponseData['ts'],
    duration: PlayInfoResponseData['item']['duration']
}


export interface PlayLinkInfo {
    audio_guid: string;
    audio_index: number;
    hls_time: number;
    is_subtitle_external: 0 | 1;
    media_guid: string;
    play_link: string;
    subtitle_guid: string;
    subtitle_index: number;
    subtitle_link: string;
    video_guid: string;
    video_index: number;
    non_fatal_errno: number | null;
    video_encoder: string;
    not_supported_resolution: string;
    supported_highest_resolution: string;
}
