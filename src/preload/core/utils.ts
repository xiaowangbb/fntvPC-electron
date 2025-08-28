// preload/core/utils.ts

/**
 * 获取指定名称的Cookie值
 * @param name Cookie名称
 * @returns Cookie值或null（如果未找到）
 */
export function getCookie(name: string): string | null {
    const cookies = document.cookie.split(';');
    const nameEQ = name + '=';

    for (const cookie of cookies) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith(nameEQ)) {
            return trimmed.substring(nameEQ.length);
        }
    }
    return null;
}