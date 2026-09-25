const { getApps, initializeApp } = require('firebase-admin/app');
const { getRemoteConfig } = require('firebase-admin/remote-config');

if (!getApps().length) initializeApp();

const CACHE_MS = 5 * 60 * 1000;
const DEFAULTS = {
  aiEnabled: true,
  librarySearchEnabled: true,
  mapEnabled: true,
  callsEnabled: true,
  notificationsEnabled: true,
  aiModel: 'gemini-3.8-flash',
};

let cached = null;

const valueFor = (template, key) => template?.parameters?.[key]?.defaultValue?.value;
const booleanFor = (value, fallback) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

async function getRuntimeConfig(options = {}) {
  const now = Date.now();
  if (!options.force && cached?.expiresAt > now) return cached.value;

  try {
    const template = await getRemoteConfig().getTemplate();
    const configuredModel = valueFor(template, 'ai_model');
    const value = {
      aiEnabled: booleanFor(valueFor(template, 'feature_ai_enabled'), DEFAULTS.aiEnabled),
      librarySearchEnabled: booleanFor(
        valueFor(template, 'feature_library_search_enabled'),
        DEFAULTS.librarySearchEnabled,
      ),
      mapEnabled: booleanFor(valueFor(template, 'feature_map_enabled'), DEFAULTS.mapEnabled),
      callsEnabled: booleanFor(valueFor(template, 'feature_calls_enabled'), DEFAULTS.callsEnabled),
      notificationsEnabled: booleanFor(
        valueFor(template, 'feature_notifications_enabled'),
        DEFAULTS.notificationsEnabled,
      ),
      aiModel: typeof configuredModel === 'string' && configuredModel.trim()
        ? configuredModel.trim()
        : DEFAULTS.aiModel,
    };
    cached = { value, expiresAt: now + CACHE_MS };
    return value;
  } catch (error) {
    console.warn('Remote Config unavailable in function; using safe defaults.', error?.message || error);
    return cached?.value || { ...DEFAULTS };
  }
}

module.exports = { DEFAULTS, getRuntimeConfig };

