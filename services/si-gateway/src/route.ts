/**
 * Decides whether a question needs the NASA data servers (POWER weather, CMR catalogue). Connecting
 * them costs seconds and thousands of prompt tokens, and most questions are about the user's own
 * field, which the browser tools answer. A false negative only means the assistant says it has no
 * NASA tool this turn, and the user can ask again with a data word in it.
 */
const ENGLISH =
  /\b(nasa|power|cmr|temperatures?|rain(fall)?|precipitation|weather|sunshine|solar|radiation|humidity|wind|evapotranspiration|dataset|collection|granule|catalogue|catalog|satellite data|imerg|smap|modis)\b/i;
const FRENCH =
  /(température|pluie|précipitation|météo|ensoleillement|rayonnement|humidité|vent\b|jeu de données|collection|granule|catalogue)/i;
const ARABIC =
  /(ناسا|حرارة|الحرارة|مطر|أمطار|الشتا|شتا|طقس|الطقس|رطوبة|رياح|إشعاع|بيانات|قمر|أقمار)/;
const LATIN_DARIJA = /\b(chta|tmatar|skhouna|skhana|7arara|harara|taqs|tqs|nasa)\b/i;

export function needsNasaData(text: string): boolean {
  return ENGLISH.test(text) || FRENCH.test(text) || ARABIC.test(text) || LATIN_DARIJA.test(text);
}
