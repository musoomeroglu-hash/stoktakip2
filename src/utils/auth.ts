import { SUPABASE_URL, SUPABASE_ANON_KEY } from './api';

/**
 * Supabase Auth ile giriş ve şifre yönetimi.
 *
 * Şifre sunucuda (bcrypt ile) tutulur ve doğrulama sunucuda yapılır — eski
 * hardcoded kontrolün aksine şifre uygulama paketinde görünmez. Şifre
 * değiştirmek tüm cihazları etkiler.
 *
 * Kurulum: Supabase panelinde Authentication → Users → "Add user" ile
 * `technocep@stoktakip.app` (veya istenen adres) oluşturulmalıdır.
 */

const ACCESS_KEY = 'sb_access_token';
const REFRESH_KEY = 'sb_refresh_token';
const EMAIL_KEY = 'sb_email';

/** Kullanıcı alışkanlığı bozulmasın: "technocep" yazınca e-postaya çevrilir. */
const DEFAULT_DOMAIN = '@stoktakip.app';

export function toEmail(usernameOrEmail: string): string {
    const v = usernameOrEmail.trim();
    return v.includes('@') ? v : `${v}${DEFAULT_DOMAIN}`;
}

export type SignInResult =
    | { ok: true }
    | { ok: false; reason: 'credentials' | 'network' | 'setup'; message: string };

function storeSession(json: { access_token?: string; refresh_token?: string; user?: { email?: string } }) {
    if (json.access_token) localStorage.setItem(ACCESS_KEY, json.access_token);
    if (json.refresh_token) localStorage.setItem(REFRESH_KEY, json.refresh_token);
    if (json.user?.email) localStorage.setItem(EMAIL_KEY, json.user.email);
}

export function getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
}

export function getUserEmail(): string {
    return localStorage.getItem(EMAIL_KEY) || '';
}

export function isLoggedIn(): boolean {
    return !!getAccessToken();
}

export function signOut(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem('isAuth'); // eski sürümden kalan anahtar
}

export async function signIn(usernameOrEmail: string, password: string): Promise<SignInResult> {
    const email = toEmail(usernameOrEmail);
    let res: Response;
    try {
        res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ email, password }),
        });
    } catch {
        // Ağ hatasında eski şifreye DÜŞÜLMEZ — aksi halde şifre değiştirmenin anlamı kalmaz
        return { ok: false, reason: 'network', message: 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.' };
    }

    if (res.ok) {
        storeSession(await res.json());
        return { ok: true };
    }

    let body: { error_code?: string; msg?: string; error_description?: string } = {};
    try { body = await res.json(); } catch { /* gövde yoksa varsayılan mesaj */ }

    if (res.status === 400 && (body.error_code === 'email_not_confirmed')) {
        return {
            ok: false, reason: 'setup',
            message: 'Kullanıcı e-postası onaylanmamış. Supabase panelinden kullanıcıyı onaylayın.',
        };
    }
    if (res.status === 400 || res.status === 401) {
        return { ok: false, reason: 'credentials', message: 'Kullanıcı adı veya şifre hatalı!' };
    }
    return {
        ok: false, reason: 'setup',
        message: body.msg || body.error_description || `Giriş yapılamadı (HTTP ${res.status}).`,
    };
}

/** Uygulama açılışında oturumu yeniler. Ağ hatasında oturumu DÜŞÜRMEZ. */
export async function refreshSession(): Promise<boolean> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return isLoggedIn();

    let res: Response;
    try {
        res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
    } catch {
        return isLoggedIn(); // çevrimdışıyken kullanıcı dışarı atılmaz
    }

    if (res.ok) {
        storeSession(await res.json());
        return true;
    }
    // Token gerçekten geçersiz — oturumu kapat
    signOut();
    return false;
}

export type ChangePasswordResult = { ok: true } | { ok: false; message: string };

/** Mevcut şifre doğrulanır, sonra yenisi yazılır. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
    const email = getUserEmail();
    if (!email) return { ok: false, message: 'Oturum bilgisi bulunamadı, tekrar giriş yapın.' };

    const verify = await signIn(email, currentPassword);
    if (!verify.ok) {
        return { ok: false, message: verify.reason === 'credentials' ? 'Mevcut şifre hatalı!' : verify.message };
    }

    let res: Response;
    try {
        res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${getAccessToken()}`,
            },
            body: JSON.stringify({ password: newPassword }),
        });
    } catch {
        return { ok: false, message: 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.' };
    }

    if (res.ok) return { ok: true };

    let body: { msg?: string; error_description?: string } = {};
    try { body = await res.json(); } catch { /* gövde yoksa varsayılan mesaj */ }
    return { ok: false, message: body.msg || body.error_description || `Şifre değiştirilemedi (HTTP ${res.status}).` };
}
