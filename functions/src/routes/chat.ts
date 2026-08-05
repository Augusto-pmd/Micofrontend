import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { getPricingByM2 } from '../services/pricing.service';

// Asesor virtual de Mi Container, potenciado por la API de Claude (Anthropic).
// Lee la disponibilidad real de stock y responde como experto del sistema.
export const chatRouter = Router();

// PRECIOS EN VIVO (fix 05/08): antes la tabla estaba HARDCODEADA acá y nunca se actualizó al
// cambiar las tarifas → Yamila le cotizaba precios viejos a clientes reales (1.5m² $53.550 cuando
// ya valía $60.000; 9m² $207.900 cuando valía $233.000). Ahora sale de la MISMA fuente que la web,
// Tarifas y las ventas (`pricing/<branchId>.byM2`, con los cambios programados ya aplicados).
// Si la lectura falla se devuelve vacío A PROPÓSITO: es preferible que Yamila diga "te paso el
// precio por WhatsApp" a que invente un número viejo y el cliente lo tome por válido.
async function preciosText(branchId = 'nordelta'): Promise<string> {
  try {
    const byM2 = await getPricingByM2(branchId);
    return Object.entries(byM2)
      .filter(([m2, p]) => Number(m2) > 0 && Number(p) > 0)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([m2, p]) => `${m2} m2 = $${Number(p).toLocaleString('es-AR')}/mes`)
      .join(' | ');
  } catch {
    return '';
  }
}

async function availabilityText(): Promise<string> {
  try {
    const snap = await db.collection('storageRooms').where('status', '==', 'available').get();
    const byM2: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const m2 = parseFloat((d.data() as any).areaM2 || '0');
      if (!m2) return;
      byM2[String(m2)] = (byM2[String(m2)] || 0) + 1;
    });
    const parts = Object.entries(byM2).map(([m2, n]) => `${m2} m2: ${n} disponibles`);
    return `Total disponibles: ${snap.size}. Por medida -> ${parts.join(', ') || 'sin datos'}.`;
  } catch {
    return 'No pude leer la disponibilidad en este momento.';
  }
}

function systemPrompt(avail: string, tabla: string): string {
  return [
    'Sos Yamila, la secretaria de Mi Container (self-storage en Nordelta, Tigre, GBA Norte, Argentina). Atendes a los clientes por chat como una persona real del equipo.',
    'Hablas en español rioplatense (de "vos"), calida, cercana y natural, como una secretaria de verdad: saludas, te interesas por lo que necesita la persona, usas su nombre si te lo dice, y haces mensajes cortos y humanos. Podes usar algun emoji con moderacion.',
    'ESPAÑOL ARGENTINO ESTRICTO (rioplatense de Buenos Aires): usá SIEMPRE voseo (vos, tenés, querés, podés, fijate, contame, mirá, dale). Usá expresiones argentinas naturales (buenísimo, bárbaro, genial, joya, tal cual, dale, de una). NUNCA uses mexicanismos ni español neutro: prohibido decir ahorita, platicar, checar, te late, qué onda, ándale, órale, okey, carro, jalar, computadora. Nunca uses tú ni usted. Soná como una secretaria porteña real.',
    'IMPORTANTE: NUNCA digas que sos una IA, un bot, un asistente virtual ni un modelo. Sos Yamila, del equipo de Mi Container. Si te preguntan si sos un bot o un robot, responde con naturalidad que sos Yamila del equipo y segui ayudando, sin entrar en ese tema.',
    'Conoces todo el sistema y los proyectos de Mi Container.',
    '',
    'CÓMO FUNCIONA: el cliente reserva online en 5 minutos, paga con Mercado Pago (tarjeta), sube una selfie desde el portal y entra con reconocimiento facial las 24 hs, sin turno. Sin depósito, sin permanencia. Beneficios: 1° mes gratis y 20% off pagando anual.',
    'SUCURSALES: Nordelta (Av. de los Lagos 7250; Lun-Vie 8-17 hs, Sáb 9-13 hs). Vicente López (Av. Maipú 2840) abre próximamente.',
    tabla
      ? 'MEDIDAS Y PRECIOS (con IVA, mensual): ' + tabla + '.'
      : 'PRECIOS: no los tenés a mano en este momento. NO inventes ni estimes ningún precio: decí que se los pasás por WhatsApp o que los vea en la web.',
    'DISPONIBILIDAD ACTUAL (en vivo): ' + avail,
    '',
    'QUÉ HACÉS:',
    '- Resolvés dudas sobre el servicio, precios, medidas, acceso y sucursales.',
    '- Recomendás la medida según lo que la persona quiere guardar (ej: ~20-30 cajas o una bici = 1,5-3 m²; ambiente chico = 5-9 m²; mudanza de depto = 11-15 m²).',
    '- Si la medida que necesita está disponible, la invitás a tocar el botón "Reservar" del sitio. Si está sin stock, ofrecés una medida cercana disponible o anotarse en la lista de espera.',
    '- Sobre inversión/crowdfunding: contás que Mi Container está en expansión (nuevas sucursales) y que hay oportunidad de invertir; NO prometas rendimientos ni des cifras de retorno. Invitá a dejar su email o a hablar por WhatsApp para que el equipo le pase los detalles.',
    '- Si la consulta es compleja o pide cerrar algo puntual, derivás al WhatsApp del sitio.',
    '',
    'REGLAS: No inventes datos que no tengas (precios fuera de la tabla, fechas exactas de apertura, términos de inversión). Si no sabés algo, decilo y ofrecé el WhatsApp. Respuestas cortas (2-4 frases).',
  ].join('\n');
}

chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Se requiere messages[]' });
      return;
    }
    const key = process.env['ANTHROPIC_API_KEY'];
    if (!key) {
      res.status(503).json({ reply: 'El asistente todavía no está configurado. Escribinos por WhatsApp y te ayudamos.' });
      return;
    }
    const [avail, tabla] = await Promise.all([availabilityText(), preciosText()]);
    const clean = messages
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }));

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // configurable: cambiar por sonnet para más calidad
        max_tokens: 600,
        system: systemPrompt(avail, tabla),
        messages: clean,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('Anthropic API error', r.status, t.slice(0, 300));
      res.status(502).json({ reply: 'Tuve un problema para responder. Probá de nuevo o escribinos por WhatsApp.' });
      return;
    }
    const data: any = await r.json();
    const reply = data?.content?.[0]?.text || 'Disculpá, no pude responder ahora.';
    res.json({ reply });
  } catch (err) {
    console.error('POST /chat error:', err);
    res.status(500).json({ reply: 'Error interno. Escribinos por WhatsApp y te ayudamos.' });
  }
});
