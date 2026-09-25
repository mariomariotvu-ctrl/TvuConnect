const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getRuntimeConfig } = require('./runtimeConfig');

if (!getApps().length) initializeApp();

const TURN_KEY_ID = defineSecret('TURN_KEY_ID');
const TURN_KEY_API_TOKEN = defineSecret('TURN_KEY_API_TOKEN');
const CREDENTIAL_TTL_SECONDS = 6 * 60 * 60;
const MAX_REQUESTS_PER_HOUR = 20;

function normalizeIceServers(payload) {
  if (!Array.isArray(payload?.iceServers)) return [];

  return payload.iceServers.flatMap((server) => {
    const rawUrls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    const urls = rawUrls.filter((url) => (
      typeof url === 'string'
      && /^(stun|turn|turns):/i.test(url)
      && !/:53(?:\?|$)/.test(url)
    ));
    if (!urls.length) return [];

    const normalized = { urls };
    if (urls.some((url) => /^turns?:/i.test(url))) {
      if (typeof server.username !== 'string' || typeof server.credential !== 'string') return [];
      normalized.username = server.username;
      normalized.credential = server.credential;
    }
    return [normalized];
  });
}

async function consumeRateLimit(firestore, uid) {
  const reference = firestore.collection('_systemTurnCredentialRateLimits').doc(uid);
  const now = Date.now();
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data() || {};
    const startedAt = previous.windowStartedAt?.toMillis?.() || 0;
    const withinWindow = now - startedAt < 60 * 60 * 1000;
    const nextCount = withinWindow ? Number(previous.requestCount || 0) + 1 : 1;
    if (nextCount > MAX_REQUESTS_PER_HOUR) {
      throw new HttpsError('resource-exhausted', 'Bạn đã tạo nhiều phiên gọi. Hãy chờ một lúc rồi thử lại.');
    }
    transaction.set(reference, {
      requestCount: nextCount,
      windowStartedAt: Timestamp.fromMillis(withinWindow ? startedAt : now),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + 25 * 60 * 60 * 1000),
    }, { merge: true });
  });
}

exports.getTurnIceServers = onCall(
  {
    timeoutSeconds: 15,
    memory: '256MiB',
    secrets: [TURN_KEY_ID, TURN_KEY_API_TOKEN],
  },
  async (request) => {
    const runtime = await getRuntimeConfig();
    if (!runtime.callsEnabled) throw new HttpsError('unavailable', 'Cuộc gọi đang được bảo trì.');
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để bắt đầu cuộc gọi.');

    await consumeRateLimit(getFirestore(), uid);

    const keyId = TURN_KEY_ID.value();
    const apiToken = TURN_KEY_API_TOKEN.value();
    if (!keyId || !apiToken) {
      throw new HttpsError('failed-precondition', 'Máy chủ chuyển tiếp cuộc gọi chưa được cấu hình.');
    }

    let response;
    try {
      response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ttl: CREDENTIAL_TTL_SECONDS,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch (error) {
      console.error('TURN credential provider failed:', error);
      throw new HttpsError('unavailable', 'Máy chủ chuyển tiếp cuộc gọi đang tạm bận.');
    }

    if (!response.ok) {
      console.error('TURN credential provider rejected request:', response.status);
      throw new HttpsError('unavailable', 'Chưa thể tạo đường truyền chuyển tiếp.');
    }

    const iceServers = normalizeIceServers(await response.json());
    if (!iceServers.some((server) => server.urls.some((url) => /^turns?:/i.test(url)))) {
      throw new HttpsError('unavailable', 'Nhà cung cấp chưa trả về máy chủ chuyển tiếp hợp lệ.');
    }

    return {
      iceServers,
      expiresAt: Date.now() + CREDENTIAL_TTL_SECONDS * 1000,
    };
  },
);

exports.normalizeIceServers = normalizeIceServers;
