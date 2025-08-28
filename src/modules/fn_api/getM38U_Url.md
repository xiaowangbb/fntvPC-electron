getM38U_Url逻辑说明。

第一步请求
Get /v/api/v1/stream/list/${mediaGuid}

响应示例：
{
    "msg": "",
    "code": 0,
    "data": {
        "files": [
            {
                "guid": "943bf493999649c9ab23de9b6c7bba62",
                "path": "/vol1/1000/视频/G/公爵千金的家庭教师/Season 1/公爵千金的家庭教师 S01E01.mp4",
                "size": 290001028,
                "timestamp": 1751733404397,
                "type": 1,
                "can_play": 1,
                "play_error": "",
                "create_time": 1751733157209,
                "update_time": 1751733186975,
                "file_birth_time": 1751733156898,
                "progress_thumb_hash_dir": ""
            }
        ],
        "video_streams": [
            {
                "media_guid": "943bf493999649c9ab23de9b6c7bba62",
                "title": "",
                "guid": "c8ddde1d66544a409348e0f6a1649386",
                "resolution_type": "1080p",
                "color_range_type": "SDR",
                "codec_name": "h264",
                "codec_type": "video",
                "color_range": "",
                "profile": "High",
                "index": 0,
                "width": 1920,
                "height": 1080,
                "coded_width": 0,
                "coded_height": 0,
                "display_aspect_ratio": "16:9",
                "pix_fmt": "yuv420p",
                "level": "50",
                "color_space": "",
                "color_transfer": "",
                "color_primaries": "",
                "duration": 1420,
                "dv_profile": 0,
                "refs": 1,
                "r_frame_rate": "23.98 fps",
                "avg_frame_rate": "23.98 fps",
                "bits_per_raw_sample": "",
                "bps": 1306801,
                "progressive": 1,
                "bit_depth": 8,
                "wrapper": "MP4",
                "create_time": 1751782685951,
                "update_time": 1751782685951,
                "rotation": 0,
                "ext1": 0,
                "is_bluray": false
            }
        ],
        "audio_streams": [
            {
                "media_guid": "943bf493999649c9ab23de9b6c7bba62",
                "title": "",
                "guid": "4d84f4619a4447c68b10941155924a94",
                "audio_type": "Stereo",
                "codec_name": "aac",
                "codec_type": "audio",
                "language": "jpn",
                "channels": 2,
                "profile": "LC",
                "sample_rate": "48000",
                "is_default": 1,
                "channel_layout": "stereo",
                "duration": 1420,
                "index": 1,
                "bits_per_raw_sample": "16",
                "bps": 317159,
                "create_time": 1751782685958,
                "update_time": 1751782685958
            }
        ],
        "subtitle_streams": []
    }
}

随后
Post /v/api/v1/play/quality
请求体: 
{
    "media_guid": ${media_guid}
}

响应体：
{
    "msg": "",
    "code": 0,
    "data": [
        {
            "bitrate": 1306801, //这里是bitrate的值
            "resolution": "1080", //这里是resolution的值
            "progressive": true
        }
    ]
}

第二步
Post
/v/api/v1/play/play
请求体：
{
    "media_guid": "${media_guid}",
    "video_guid": "${video_streams[0].guid}",
    "video_encoder": "${video_streams[0].codec_name}",
    "resolution": "",
    "bitrate": 1306801,
    "startTimestamp": 1,
    "audio_encoder": "aac",
    "audio_guid": "4d84f4619a4447c68b10941155924a94",
    "subtitle_guid": "",
    "channels": 2
}