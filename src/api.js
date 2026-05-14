// Base URL of the API — update after Firebase deploy
const API_BASE = 'https://us-central1-micontainer-prod.cloudfunctions.net/api';

/**
 * Gets the JWT token from the authenticated Firebase user.
 * Requires Firebase Auth to be initialized in the frontend.
 */
async function getAuthToken() {
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

export async function apiCreateReservation(reservationData) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(reservationData),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { reservationId, initPoint }
}

export async function apiGetReservations() {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/reservations`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { reservations: [...] }
}

export async function apiGetReservation(reservationId) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/reservations/${reservationId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { reservation }
}

export async function apiCancelReservation(reservationId) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/reservations/${reservationId}/cancel`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { message: 'Reservation cancelled' }
}
