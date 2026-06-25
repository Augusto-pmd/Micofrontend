import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/verifyToken';

export const mailingRouter = Router();

const RESEND_API = 'https://api.resend.com/emails';

// POST /mailing/send (admin) — envía un aviso a una lista vía Resend.
// Body: { to: string[], subject, text, html?, from? }. Manda 1 mail por destinatario
// (no se exponen direcciones entre sí).
mailingRouter.post('/send', verifyToken, async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: 'Falta RESEND_API_KEY. Configurá la API key de Resend.' });
      return;
    }
    const { to, subject, text, html, from } = req.body as {
      to?: string[]; subject?: string; text?: string; html?: string; from?: string;
    };
    const recipients = (Array.isArray(to) ? to : []).map((e) => String(e).trim()).filter(Boolean);
    if (recipients.length === 0) { res.status(400).json({ error: 'Sin destinatarios.' }); return; }
    if (!subject) { res.status(400).json({ error: 'Falta el asunto.' }); return; }

    const sender = from || process.env.RESEND_FROM || 'Mi Container <onboarding@resend.dev>';
    const bodyHtml = html || `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;font-size:15px;color:#222">${String(text || '')}</div>`;

    let sent = 0;
    const errors: string[] = [];
    for (const email of recipients) {
      try {
        const r = await fetch(RESEND_API, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: sender, to: [email], subject, html: bodyHtml, text: text || undefined }),
        });
        if (r.ok) sent++;
        else { const t = await r.text(); errors.push(`${email}: ${t.slice(0, 140)}`); }
      } catch (e) { errors.push(`${email}: ${String(e).slice(0, 140)}`); }
    }
    res.json({ sent, total: recipients.length, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error('POST /mailing/send error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
