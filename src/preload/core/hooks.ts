// 钩子类型枚举
type HookType = 'onReady' | 'onDomChange';

// 钩子函数类型
type HookFunction = (...args: any[]) => void;

// 钩子接口
interface Hooks {
    onReady: HookFunction[];
    onDomChange: HookFunction[];
}

const hooks: Hooks = {
    onReady: [],
    onDomChange: [],
};

export function registerHook(type: HookType, fn: HookFunction): void {
    if (!hooks[type]) throw new Error(`Unknown hook type: ${type}`);
    hooks[type].push(fn);
}

export function runHooks(type: HookType, ...args: any[]): void {
    if (!hooks[type]) return;
    hooks[type].forEach(fn => fn(...args));
}