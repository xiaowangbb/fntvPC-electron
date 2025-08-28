import { BrowserWindow } from 'electron';
import { getMainWindow } from './windowsManager';

export function setHalfScreen(): void {
    const mainWindow: BrowserWindow | null = getMainWindow();
    if (!mainWindow) return;

    mainWindow.setSize(1200, 800);
    mainWindow.center();
    mainWindow.unmaximize();
}

export function setFullScreen(): void {
    const mainWindow: BrowserWindow | null = getMainWindow();
    if (mainWindow) mainWindow.maximize();
}

export function setupFullScreenToggle(mainWindow: BrowserWindow): void {
    let isFullScreen: boolean = false;
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F11') {
            if (isFullScreen) {
                setHalfScreen();
            } else {
                setFullScreen();
            }
            isFullScreen = !isFullScreen;
            event.preventDefault();
        }
    });
}