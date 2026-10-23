export async function registerInterest({ lotId, name, whatsapp }, contact) {
  const payload = { lotId, name: name.trim(), whatsapp: whatsapp.replace(/\D/g, ''), createdAt: new Date().toISOString() };
  if (payload.name.length < 2 || !/^\d{10,13}$/.test(payload.whatsapp)) throw new Error('Preencha seu nome e um WhatsApp válido com DDD.');
  if (contact.leadEndpoint) {
    const url = new URL(contact.leadEndpoint, location.origin);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Canal de atendimento inválido.');
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('Não foi possível enviar. Tente novamente.');
    return { sent: true };
  }
  try {
    const saved = JSON.parse(localStorage.getItem('parque-universitario:interest-drafts:v1') || '[]');
    localStorage.setItem('parque-universitario:interest-drafts:v1', JSON.stringify([...(Array.isArray(saved) ? saved : []), payload].slice(-20)));
  } catch { throw new Error('O navegador não permitiu salvar. Nenhum dado foi enviado.'); }
  return { sent: false };
}
