import { runHooks } from './core/hooks.js';

// 显式导入插件
import './plugins/playButton.js';
import './plugins/titlebar.js';

function initInjector(): void {
    if (document.readyState !== 'loading') {
        runHooks('onReady');
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            runHooks('onReady');
            const observer = new MutationObserver(() => runHooks('onDomChange'));
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
}

initInjector();