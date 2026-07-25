/**
 * UNRAVEL ANONYMOUS DEVICE IDENTITY UTILITY
 * 
 * Generates and persists a random UUID in localStorage ('unravel_device_id')
 * to attribute creations and daily challenge streaks to this device without user logins.
 */

const DEVICE_ID_KEY = 'unravel_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'server_environment';
  }

  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return 'fallback_device_id';
  }
}
