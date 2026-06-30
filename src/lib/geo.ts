// Get the device location and a readable place name (free OpenStreetMap reverse
// geocode; falls back to coordinates if it fails or is offline).
export async function getLocationName(): Promise<{ name: string; coords: string } | null> {
  if (!navigator.geolocation) return null
  const pos = await new Promise<GeolocationPosition>((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }))
  const { latitude: lat, longitude: lon } = pos.coords
  const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=he`)
    const j = await r.json()
    return { name: (j.display_name as string) || coords, coords }
  } catch {
    return { name: coords, coords }
  }
}
