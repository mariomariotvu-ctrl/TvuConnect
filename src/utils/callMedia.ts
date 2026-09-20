export type CallFacingMode = 'user' | 'environment';
export type CallConnectionQuality = 'checking' | 'good' | 'fair' | 'poor';

interface NetworkHints {
  saveData?: boolean;
  effectiveType?: string;
}

export interface CallQualitySample {
  roundTripTimeSeconds?: number;
  availableOutgoingBitrate?: number;
  packetsLost?: number;
  packetsReceived?: number;
  jitterSeconds?: number;
}

const networkHints = (): NetworkHints => {
  if (typeof navigator === 'undefined') return {};
  return (navigator as Navigator & { connection?: NetworkHints }).connection || {};
};

export function getCallMediaConstraints(
  withVideo: boolean,
  facingMode: CallFacingMode = 'user',
  hints: NetworkHints = networkHints(),
): MediaStreamConstraints {
  const constrainedNetwork = hints.saveData === true
    || hints.effectiveType === 'slow-2g'
    || hints.effectiveType === '2g';

  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48_000 },
    },
    video: withVideo ? {
      facingMode: { ideal: facingMode },
      width: { ideal: constrainedNetwork ? 640 : 1_280, max: 1_280 },
      height: { ideal: constrainedNetwork ? 480 : 720, max: 720 },
      frameRate: { ideal: constrainedNetwork ? 18 : 24, max: constrainedNetwork ? 20 : 30 },
    } : false,
  };
}

export function applyCallTrackHints(stream: MediaStream) {
  stream.getAudioTracks().forEach((track) => {
    if ('contentHint' in track) track.contentHint = 'speech';
  });
  stream.getVideoTracks().forEach((track) => {
    if ('contentHint' in track) track.contentHint = 'motion';
  });
}

export async function optimizeCallSenders(
  connection: RTCPeerConnection,
  hints: NetworkHints = networkHints(),
) {
  const constrainedNetwork = hints.saveData === true
    || hints.effectiveType === 'slow-2g'
    || hints.effectiveType === '2g';
  const moderateNetwork = hints.effectiveType === '3g';
  const videoBitrate = constrainedNetwork ? 420_000 : moderateNetwork ? 700_000 : 1_100_000;
  const maxFramerate = constrainedNetwork ? 18 : moderateNetwork ? 20 : 24;

  await Promise.all(connection.getSenders().map(async (sender) => {
    if (!sender.track) return;
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    const encoding = parameters.encodings[0];

    if (sender.track.kind === 'video') {
      encoding.maxBitrate = videoBitrate;
      encoding.maxFramerate = maxFramerate;
      parameters.degradationPreference = 'balanced';
    } else if (sender.track.kind === 'audio') {
      encoding.maxBitrate = 40_000;
    }

    await sender.setParameters(parameters).catch(() => undefined);
  }));
}

export function classifyCallQuality(sample: CallQualitySample): CallConnectionQuality {
  const totalPackets = Number(sample.packetsLost || 0) + Number(sample.packetsReceived || 0);
  const lossRatio = totalPackets > 0 ? Number(sample.packetsLost || 0) / totalPackets : 0;
  const roundTripTime = sample.roundTripTimeSeconds || 0;
  const jitter = sample.jitterSeconds || 0;
  const bitrate = sample.availableOutgoingBitrate;

  if (lossRatio >= 0.08 || roundTripTime >= 0.6 || jitter >= 0.08 || (bitrate !== undefined && bitrate < 160_000)) {
    return 'poor';
  }
  if (lossRatio >= 0.03 || roundTripTime >= 0.3 || jitter >= 0.04 || (bitrate !== undefined && bitrate < 450_000)) {
    return 'fair';
  }
  return 'good';
}

export async function readCallQuality(connection: RTCPeerConnection): Promise<CallConnectionQuality> {
  const stats = await connection.getStats();
  const sample: CallQualitySample = {};

  stats.forEach((report) => {
    if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.nominated || report.selected)) {
      if (typeof report.currentRoundTripTime === 'number') {
        sample.roundTripTimeSeconds = report.currentRoundTripTime;
      }
      if (typeof report.availableOutgoingBitrate === 'number') {
        sample.availableOutgoingBitrate = report.availableOutgoingBitrate;
      }
    }
    if (report.type === 'inbound-rtp' && !report.isRemote) {
      if (typeof report.packetsLost === 'number') sample.packetsLost = report.packetsLost;
      if (typeof report.packetsReceived === 'number') sample.packetsReceived = report.packetsReceived;
      if (typeof report.jitter === 'number') sample.jitterSeconds = report.jitter;
    }
  });

  return classifyCallQuality(sample);
}

export function formatCallDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
