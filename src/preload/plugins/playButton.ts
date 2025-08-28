// preload/plugins/playButton.ts
import { ipcRenderer } from 'electron';
import { registerHook } from '../core/hooks';
import { getCookie } from '../core/utils';

// 检查是否最后一级页面(单集&电影&其他)
function checkFinalPageUrl(): boolean {
    const url = window.location.href;
    return url.includes('/v/movie/') || url.includes('/v/tv/episode/') || url.includes('/v/other/');
}

// 检查是否是季度页面
function checkSeasonPageUrl(): boolean {
    const url = window.location.href;
    return url.includes('/v/tv/season/');
}

// 检查是否是TV页面
function checkTVPageUrl(): boolean {
    const url = window.location.href;
    return url.includes('/v/tv/');
}

// 发送播放信息到主进程（支持选择播放器）
function sendPlayEventToMain(playerType: 'mpv' | 'potplayer' = 'mpv'): void {
    const url = window.location.href;
    const id = url.split('/').pop() || '';
    const token = getCookie('Trim-MC-token');
    ipcRenderer.send('play-movie', { id, token, playerType });
}

// 基于共同DOM特征搜索播放按钮
function findReferenceButton(context: Document | HTMLElement = document): HTMLButtonElement | null {
    // 主要特征：特定播放图标路径
    const PLAY_ICON_PATH = "M5.984 18.819V5.18c0-1.739 1.939-2.776 3.386-1.812l10.228 6.82a2.177 2.177 0 010 3.623L9.37 20.63c-1.447.964-3.386-.073-3.386-1.812z";
    
    // 查找包含特定播放图标的按钮
    const buttonsWithPlayIcon = context.querySelectorAll('button');
    for (const button of Array.from(buttonsWithPlayIcon)) {
        // 检测特定播放图标
        const icon = button.querySelector('svg > path[d^="M5.984"]');
        if (icon && icon.getAttribute('d')?.startsWith(PLAY_ICON_PATH.substring(0, 10))) {
            return button as HTMLButtonElement;
        }
        
        // 备用检测：按钮类名组合
        const classes = button.getAttribute('class') || '';
        if (classes.includes('semi-button') && 
            classes.includes('semi-button-primary') && 
            classes.includes('!min-w-[150px]')) {
            return button as HTMLButtonElement;
        }
    }
    
    return null;
}

// 基于参考按钮克隆并插入一个新按钮
function createClonedButton(referenceButton: HTMLButtonElement, btnText: string, onClick: () => void, player: 'mpv' | 'potplayer'): void {
    const newButton = referenceButton.cloneNode(true) as HTMLButtonElement;
    newButton.removeAttribute('data-player-buttons-injected');

    // 更新按钮文本（保留图标）
    const textSpans = newButton.querySelector('span > span > span');
    if (textSpans) textSpans.textContent = btnText;

    // 添加唯一标识
    newButton.setAttribute('data-custom-play', 'true');
    newButton.setAttribute('data-player', player);

    // 点击事件
    newButton.addEventListener('click', onClick);

    referenceButton.parentNode?.insertBefore(newButton, referenceButton.nextSibling);
}

function injectCustomPlayBtns(): void {
    const referenceButton = findReferenceButton();
    if (!referenceButton) return;
    // 避免重复注入
    if (referenceButton.hasAttribute('data-player-buttons-injected')) return;

    console.log('Detected inject page, injecting MPV & PotPlayer buttons...');

    // 插入 MPV 播放按钮
    createClonedButton(referenceButton, 'MPV播放', () => sendPlayEventToMain('mpv'), 'mpv');

    // 插入 PotPlayer 播放按钮
    createClonedButton(referenceButton, 'PotPlayer播放', () => sendPlayEventToMain('potplayer'), 'potplayer');

    // 标记已注入，防止重复
    referenceButton.setAttribute('data-player-buttons-injected', 'true');
}

// 注册hook
registerHook('onReady', injectCustomPlayBtns);
registerHook('onDomChange', injectCustomPlayBtns);

export {};