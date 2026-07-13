import { auth } from '../config/firebase';
import * as crypto from 'crypto';

const RESEND_API = 'https://api.resend.com/emails';

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[customerAuth] sin RESEND_API_KEY: no se envia el mail'); return; }
  // El default DEBE ser del dominio verificado en Resend (micontainer.com). El viejo
  // 'onboarding@resend.dev' es el remitente de PRUEBA de Resend → 403 a cualquier destinatario
  // que no sea el dueño de la cuenta (por eso los clientes NO recibían el mail de activación,
  // aunque el dominio estuviera bien verificado — bug destapado con la prueba real del 11/07).
  const from = process.env.RESEND_FROM || 'Mi Container <comercial@micontainer.com>';
  const r = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) console.warn('[customerAuth] Resend fallo:', (await r.text()).slice(0, 160));
}

// Mail de contraseña del PANEL (staff): link seguro de Firebase para crear/cambiar la contraseña,
// que al terminar vuelve al login del admin. Lo usa POST /auth/forgot-password (solo staff).
// Sirve también para que quienes entran con Google se agreguen una contraseña.
export async function sendAdminPasswordEmail(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  await ensureAuthUser(e);
  const link = await auth.generatePasswordResetLink(e, { url: 'https://admin-panel-ten-pied.vercel.app/login' });
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:520px;margin:auto">
      <img src="https://micontainer.com/assets/logo.png" alt="Mi Container" width="150" style="display:block;margin:0 0 18px" />
      <h2 style="color:#3D3083;margin-bottom:6px">Contraseña del panel de gestión</h2>
      <p>Para crear (o cambiar) tu contraseña del <b>panel de Mi Container</b>, hacé clic acá:</p>
      <p style="margin:22px 0">
        <a href="${link}" style="background:#3D3083;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Crear / cambiar mi contraseña</a>
      </p>
      <p style="color:#666;font-size:13px">Al terminar volvés al login del panel y podés entrar con tu email y la clave nueva — o seguir usando Google, como prefieras.</p>
      <p style="color:#999;font-size:12px;margin-top:24px">Si no pediste este mail, podés ignorarlo: tu acceso no cambia.</p>
    </div>`;
  await sendEmail(e, 'Tu contraseña del panel — Mi Container', html);
}

// Mail de RECUPERACIÓN para un cliente que YA activó su cuenta antes (email verificado).
// Distinto del de activación: acá no es "bienvenido, activá tu cuenta" — es "recuperá tu clave".
export async function sendPasswordRecoveryEmail(email: string, name?: string): Promise<void> {
  const e = email.trim().toLowerCase();
  const link = await auth.generatePasswordResetLink(e, { url: 'https://micontainer.com/#/portal' });
  const saludo = name ? `, ${name}` : '';
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:520px;margin:auto">
      <img src="https://micontainer.com/assets/logo.png" alt="Mi Container" width="150" style="display:block;margin:0 0 18px" />
      <h2 style="color:#3D3083;margin-bottom:6px">Recuperá tu contraseña</h2>
      <p>Hola${saludo}. Si no recordás tu contraseña, hacé clic en el siguiente botón y restablecela:</p>
      <p style="margin:22px 0">
        <a href="${link}" style="background:#5ECA00;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Restablecer mi contraseña</a>
      </p>
      <p style="color:#666;font-size:13px">Al terminar volvés a tu portal y entrás con tu email y la clave nueva.</p>
      <p style="color:#999;font-size:12px;margin-top:24px">Si no pediste este mail, ignoralo: tu contraseña actual sigue siendo válida.</p>
    </div>`;
  await sendEmail(e, 'Recuperá tu contraseña — Mi Container', html);
}

// Mail con el NUEVO link de cobro tras un pago rechazado (reenvío desde el panel): la sub
// anterior queda cancelada en MP y este link crea la nueva. NO es el mail de activación.
export async function sendRebillEmail(email: string, name: string | undefined, initPoint: string, baulera?: string, monto?: number): Promise<void> {
  const e = email.trim().toLowerCase();
  const saludo = name ? `, ${name}` : '';
  const cual = baulera ? ` de tu baulera <b>${baulera}</b>` : '';
  const cuanto = monto ? ` de <b>$${Number(monto).toLocaleString('es-AR')}/mes</b>` : '';
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:520px;margin:auto">
      <img src="https://micontainer.com/assets/logo.png" alt="Mi Container" width="150" style="display:block;margin:0 0 18px" />
      <h2 style="color:#3D3083;margin-bottom:6px">Regularizá tu pago</h2>
      <p>Hola${saludo}. El débito mensual${cual} fue rechazado por tu medio de pago.</p>
      <p>Te generamos un <b>nuevo link de pago</b>${cuanto}. Al completarlo, tu suscripción queda al día y no perdés tu espacio:</p>
      <p style="margin:22px 0">
        <a href="${initPoint}" style="background:#5ECA00;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Pagar y regularizar</a>
      </p>
      <p style="color:#666;font-size:13px">El débito anterior quedó cancelado: no se te va a cobrar dos veces.</p>
      <p style="color:#999;font-size:12px;margin-top:24px">¿Dudas? Escribinos a comercial@micontainer.com</p>
    </div>`;
  await sendEmail(e, 'Regularizá tu pago — Mi Container', html);
}

// Crea (si no existe) la cuenta de Firebase Auth del cliente, con email SIN verificar.
export async function ensureAuthUser(email: string, displayName?: string): Promise<string> {
  const e = email.trim().toLowerCase();
  try {
    const u = await auth.getUserByEmail(e);
    return u.uid;
  } catch {
    const u = await auth.createUser({
      email: e,
      emailVerified: false,
      displayName: displayName || undefined,
      password: crypto.randomBytes(18).toString('base64url'),
    });
    return u.uid;
  }
}

// Envia el mail de activacion: link para CREAR la contraseña. Al completarlo, Firebase
// marca el email como verificado. Asi se cumplen los dos requisitos de una: confirmar
// el mail y elegir su propia clave.
export async function sendActivationEmail(email: string, name?: string): Promise<void> {
  const e = email.trim().toLowerCase();
  // Cliente EXISTENTE con cuenta ya verificada (ej: re-alta tras un recobro): NO mandarle
  // "activá tu cuenta" — su portal sigue tal cual (misma contraseña, mismos datos).
  try { const u0 = await auth.getUserByEmail(e); if (u0.emailVerified) return; } catch { /* no existe: alta normal */ }
  await ensureAuthUser(e, name);
  // continueUrl: al terminar de crear la contraseña, la página de Firebase ofrece "Continuar"
  // que lleva DIRECTO al portal (antes quedaba muerta en "contraseña cambiada").
  const link = await auth.generatePasswordResetLink(e, { url: 'https://micontainer.com/#/portal' });
  const saludo = name ? `, ${name}` : '';
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:520px;margin:auto">
      <img src="https://micontainer.com/assets/logo.png" alt="Mi Container" width="150" style="display:block;margin:0 0 18px" />
      <h2 style="color:#3D3083;margin-bottom:6px">Bienvenido a Mi Container${saludo}</h2>
      <p>Para activar tu cuenta y entrar a tu portal, <b>creá tu contraseña</b> haciendo clic acá:</p>
      <p style="margin:22px 0">
        <a href="${link}" style="background:#5ECA00;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Activar mi cuenta y crear contraseña</a>
      </p>
      <p style="color:#666;font-size:13px">Al crear tu contraseña, tu email queda confirmado y ya podés ingresar a tu portal con tu email y la clave que elijas.</p>
      <p style="color:#999;font-size:12px;margin-top:24px">Si no esperabas este mail, podés ignorarlo.</p>
    </div>`;
  await sendEmail(e, 'Activá tu cuenta — Mi Container', html);
}
