import * as fn from "./request";
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { app } from 'electron';
import type { ApiResponse, LoginResponseData, PlayInfoResponseData, Subtitle, SubtitleStream, SubtitleDownloadResult, playStatus, PlayLinkInfo } from './api.d';


export class ApiService {
    private baseURL: string;
    private tempDir: string;
    private token: string;

    /**
     * 创建字幕服务实例
     * @param {string} baseURL - API基础URL
     */
    constructor(baseURL: string, token: string = '') {
        this.baseURL = baseURL;
        this.tempDir = path.join(app.getPath('temp'), 'fntv_subtitles');
        this.token = token;

        this.downloadSubtitle = this.downloadSubtitle.bind(this);
    }

    /**
     * 用户登录
     */
    login(username: string, password: string): Promise<ApiResponse<LoginResponseData>> {
        return fn.request<LoginResponseData>(this.baseURL, '/v/api/v1/login', 'post', this.token, {
            app_name: "trimemedia-web",
            username: username,
            password: password,
        }, 2000);
    }

    /**
     * 用户登出
     */
    logout(): Promise<ApiResponse<null>> {
        return fn.request<null>(this.baseURL, '/v/api/v1/logout', 'post', this.token, null);
    }

    /**
     * 获取视频播放信息
     * @param {string} itemGuid - 视频项目的唯一标识符
     * @returns {Promise} 返回播放信息的Promise
     */
    getPlayInfo(itemGuid: string): Promise<ApiResponse<PlayInfoResponseData>> {
        return fn.request<PlayInfoResponseData>(this.baseURL, '/v/api/v1/play/info', 'post', this.token, {
            item_guid: itemGuid,
        });
    }

    /**
     * 获取字幕文件列表
     * @param {string} itemGuid - 视频项目的唯一标识符
     * @returns {Promise<Array>} 返回字幕对象数组的Promise
     */
    getSubtitle(itemGuid: string): Promise<Subtitle[]> {
        return fn.request<{ subtitle_streams: SubtitleStream[] }>(this.baseURL, '/v/api/v1/stream/list/' + itemGuid, 'get', this.token, null)
            .then((response) => {
                if (response.success) {
                    const streams = response.data?.subtitle_streams || [];
                    const subtitles: Subtitle[] = streams.map(stream => ({
                        id: stream.guid,
                        format: stream.format,
                        name: stream.title
                    }));

                    if (subtitles.length > 0) {
                        console.log('获取到字幕文件:', subtitles);
                        return subtitles;
                    } else {
                        console.warn('没有找到字幕文件');
                        return [];
                    }
                } else {
                    console.error('获取字幕列表失败:', response.message);
                    return [];
                }
            })
            .catch((error: any) => {
                console.error('获取字幕列表时发生错误:', error);
                return [];
            });
    }

    /**
     * 下载字幕文件
     * @param {Array} subs - 字幕对象数组
     * @returns {Promise<Array>} 返回下载成功的字幕文件路径数组
     */
    async downloadSubtitle(subs: Subtitle[]): Promise<string[]> {
        // 确保临时目录存在
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        } else {
            // 清空现有文件
            fs.readdirSync(this.tempDir).forEach(file => {
                const filePath = path.join(this.tempDir, file);
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        // 创建Axios实例
        const api = axios.create({
            baseURL: this.baseURL,
            timeout: 10000,
            responseType: 'text',
        });

        // 准备下载任务
        const downloadTasks = subs.map(sub => {
            const { id, name = id, format = 'srt' } = sub;
            const safeName = name.replace(/[^a-z0-9]/gi, '_'); // 文件名安全处理
            const filePath = path.join(this.tempDir, `${safeName}.${format}`);
            const url = `/v/api/v1/subtitle/dl/${id}`;

            return api.get(url)
                .then(response => {
                    if (response.status >= 200 && response.status < 300) {
                        return fs.promises.writeFile(filePath, response.data)
                            .then(() => {
                                console.log(`✅ 字幕文件已下载到: ${filePath}`);
                                return { id, filePath, success: true };
                            });
                    } else {
                        console.error(`❌ 服务端错误: ${response.status} (ID: ${id})`);
                        return { id, filePath, success: false, error: `HTTP ${response.status}` };
                    }
                })
                .catch(error => {
                    let errorMsg = '未知错误';
                    if (error.response) {
                        errorMsg = `服务端错误: ${error.response.status}`;
                    } else if (error.request) {
                        errorMsg = '网络错误: 无响应';
                    } else {
                        errorMsg = `请求错误: ${error.message}`;
                    }
                    console.error(`❌ ID ${id} 下载失败: ${errorMsg}`);
                    return { id, filePath, success: false, error: errorMsg };
                });
        });

        // 执行所有下载任务
        const results = await Promise.allSettled(downloadTasks);

        // 处理结果
        const successfulDownloads = results
            .filter(result => result.status === 'fulfilled' && (result as PromiseFulfilledResult<SubtitleDownloadResult>).value.success)
            .map(result => (result as PromiseFulfilledResult<SubtitleDownloadResult>).value.filePath);

        const failedCount = results.length - successfulDownloads.length;

        console.log('========================================');
        console.log('字幕下载摘要:');
        console.log(`🔹 总数: ${subs.length}`);
        console.log(`✅ 成功: ${successfulDownloads.length}`);
        console.log(`❌ 失败: ${failedCount}`);
        console.log('========================================');

        console.log('成功下载的字幕文件:', successfulDownloads);
        return successfulDownloads;
    }

    /**
     * 获取视频直链地址
     * @param {string} mediaGuid - 视频项目的唯一标识符
     * @returns {Promise<string>} 返回视频直链地址的Promise
     */
    getVideoUrl(mediaGuid: string): string {
        return `${this.baseURL}/v/api/v1/media/range/${mediaGuid}`;
    }

    async getM38U_Url(itemGuid: String): Promise<string> {
        const res = await (async (): Promise<ApiResponse<PlayLinkInfo>> => {
            try {
                console.log('[ApiService] getM38U_Url start', { itemGuid });

                // 1) 获取流信息
                const listResp = await fn.request<{ files: any[], video_streams: any[], audio_streams: any[], subtitle_streams: any[] }>(this.baseURL, `/v/api/v1/stream/list/${itemGuid}`, 'get', this.token, null);
                if (!listResp.success || !listResp.data) {
                    console.error('[ApiService] stream list failed', listResp.message);
                    return { success: false, message: 'stream list failed' };
                }

                const videoStreams = listResp.data.video_streams || [];
                const audioStreams = listResp.data.audio_streams || [];

                if (videoStreams.length === 0) {
                    return { success: false, message: 'no video streams' };
                }

                const chosenVideo = videoStreams[0];
                const chosenAudio = audioStreams[0] || null;

                // 2) 请求可用质量，选择首个条目
                const qualityResp = await fn.request<{ bitrate: number; resolution: string; progressive: boolean }[]>(this.baseURL, '/v/api/v1/play/quality', 'post', this.token, { media_guid: chosenVideo.media_guid });
                if (!qualityResp.success || !qualityResp.data || qualityResp.data.length === 0) {
                    console.warn('[ApiService] quality list empty, continuing with defaults');
                }
                const chosenQuality = (qualityResp.data && qualityResp.data[0]) || { bitrate: chosenVideo?.bps || 0, resolution: '' } as any;

                const playBody = {
                    media_guid: chosenVideo.media_guid,
                    video_guid: chosenVideo.guid,
                    video_encoder: chosenVideo.codec_name || '',
                    resolution: chosenQuality.resolution || '',
                    bitrate: chosenQuality.bitrate || (chosenVideo?.bps || 0),
                    startTimestamp: 1,
                    audio_encoder: chosenAudio ? chosenAudio.codec_name : 'aac',
                    audio_guid: chosenAudio ? chosenAudio.guid : '',
                    subtitle_guid: '',
                    channels: chosenAudio ? chosenAudio.channels : 2
                };

                console.log('[ApiService] play body', playBody);

                const playResp = await fn.request<PlayLinkInfo>(this.baseURL, '/v/api/v1/play/play', 'post', this.token, playBody);
                if (!playResp.success) {
                    console.error('[ApiService] play request failed', playResp.message);
                    return { success: false, message: playResp.message };
                }

                console.log('[ApiService] play response success');
                return playResp;
            } catch (err: any) {
                console.error('[ApiService] getM38U_Url error', err?.message || err);
                return { success: false, message: err?.message || String(err) };
            }
        })();
        if (res.data) {
            return `${this.baseURL}${res.data.play_link}`;
        }
        return '';
    }


    /**
     * 设置视频为已观看状态
     * @param {string} itemGuid - 视频项目的唯一标识符
     * @returns {Promise} 返回设置结果的Promise
     */
    setWatched(itemGuid: string): Promise<ApiResponse<null>> {
        return fn.request(this.baseURL, '/v/api/v1/item/watched', 'post', this.token, {
            item_guid: itemGuid,
        });
    }

    /**
     * 记录播放状态
     * @param {Object} statusData - 播放状态数据
     * @param {number} ts - 当前播放时间戳
     * @returns {Promise} 返回记录结果的Promise
     */
    recordPlayState(statusData: playStatus): Promise<ApiResponse<null>> {
        return fn.request(this.baseURL, '/v/api/v1/play/record', 'post', this.token, statusData);
    }
}