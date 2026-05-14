/** Generates a reservation ID with format MC-XXXX-XXXX (uppercase letters and digits) */
export function generateReservationId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `MC-${part()}-${part()}`;
}
