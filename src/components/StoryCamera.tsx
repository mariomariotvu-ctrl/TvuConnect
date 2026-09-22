import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Images, Loader2, RefreshCw, ShieldAlert, SwitchCamera, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getImagePermissionHelp } from '../utils/platform';

interface StoryCameraProps {
  multiple?: boolean;
  maxFiles?: number;
  onClose: () => void;
  onDone: (files: File[]) => void | Promise<void>;
  onPickFromLibrary: () => void;
}

interface CapturedPhoto {
  file: File;
  url: string;
}

type FacingMode = 'user' | 'environment';

const CAMERA_START_TIMEOUT_MS = 8_000;

const cameraErrorMessage = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera đang bị chặn quyền.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Không tìm thấy camera phù hợp trên thiết bị này.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Camera đang được ứng dụng khác sử dụng.';
  return 'Chưa thể mở camera trên thiết bị này.';
};

export const StoryCamera: React.FC<StoryCameraProps> = ({
  multiple = false,
  maxFiles = multiple ? 3 : 1,
  onClose,
  onDone,
  onPickFromLibrary,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedRef = useRef<CapturedPhoto[]>([]);
  const cameraRequestRef = useRef(0);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const [captured, setCaptured] = useState<CapturedPhoto[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async (mode: FacingMode) => {
    stopCamera();
    const requestId = ++cameraRequestRef.current;
    setLoading(true);
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Trình duyệt này chưa hỗ trợ camera trực tiếp.');
      setLoading(false);
      return;
    }

    let timedOut = false;
    let timeoutId: number | undefined;
    const mediaPromise = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: mode },
        width: { ideal: 1440 },
        height: { ideal: 1920 },
      },
    });
    const timeoutPromise = new Promise<MediaStream>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        reject(new DOMException('Camera did not respond in time', 'TimeoutError'));
      }, CAMERA_START_TIMEOUT_MS);
    });

    try {
      const stream = await Promise.race([mediaPromise, timeoutPromise]);
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      window.clearTimeout(timeoutId);
      timeoutId = undefined;
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (cameraError) {
      if (timedOut) {
        void mediaPromise.then((lateStream) => {
          lateStream.getTracks().forEach((track) => track.stop());
        }).catch(() => undefined);
      }
      if (requestId === cameraRequestRef.current) {
        setError(timedOut ? 'Camera chưa phản hồi. Bạn có thể thử lại hoặc chọn ảnh có sẵn.' : cameraErrorMessage(cameraError));
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === cameraRequestRef.current) setLoading(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void startCamera('environment');

    return () => {
      cameraRequestRef.current += 1;
      document.body.style.overflow = previousOverflow;
      stopCamera();
      capturedRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    capturedRef.current = captured;
  }, [captured]);

  const switchCamera = async () => {
    const nextMode: FacingMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    setReviewIndex(null);
    await startCamera(nextMode);
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.videoWidth === 0 || capturing) return;

    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');

      if (facingMode === 'user') {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not capture photo')), 'image/jpeg', 0.92);
      });
      const file = new File([blob], `tvu-story-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      const photo = { file, url: URL.createObjectURL(file) };
      const nextPhotos = multiple ? [...captured, photo].slice(0, maxFiles) : [photo];
      if (!multiple && captured[0]) URL.revokeObjectURL(captured[0].url);
      setCaptured(nextPhotos);
      setReviewIndex(nextPhotos.length - 1);
    } catch {
      setError('Chưa thể chụp ảnh. Hãy mở lại camera và thử lần nữa.');
    } finally {
      setCapturing(false);
    }
  };

  const removePhoto = (index: number) => {
    const photo = captured[index];
    if (photo) URL.revokeObjectURL(photo.url);
    const nextPhotos = captured.filter((_, photoIndex) => photoIndex !== index);
    setCaptured(nextPhotos);
    setReviewIndex(nextPhotos.length ? Math.min(index, nextPhotos.length - 1) : null);
  };

  const confirm = async () => {
    if (captured.length === 0) return;
    stopCamera();
    await onDone(captured.map((photo) => photo.file));
  };

  const pickFromLibrary = () => {
    stopCamera();
    onPickFromLibrary();
  };

  const reviewedPhoto = reviewIndex === null ? null : captured[reviewIndex];
  const canCaptureMore = captured.length < maxFiles;

  return createPortal(
    <div className="story-camera-dialog fixed inset-0 z-[2147483647] isolate overflow-hidden bg-black text-white" role="dialog" aria-modal="true" aria-label="Camera Story TVU Connect">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 h-full w-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
        aria-label="Khung xem camera"
      />

      {reviewedPhoto && <img src={reviewedPhoto.url} alt={`Ảnh vừa chụp ${reviewIndex! + 1}`} className="absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-black/80" />

      <header className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-md" aria-label="Đóng camera">
          <X className="h-5 w-5" />
        </button>
        <div className="rounded-full bg-black/45 px-4 py-2 text-center text-xs font-bold backdrop-blur-md">
          <span className="block">STORY TVU</span>
          {multiple && <span className="text-white/70">{captured.length}/{maxFiles} ảnh</span>}
        </div>
        {captured.length > 0 ? (
          <button type="button" onClick={() => void confirm()} className="flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-black text-slate-950" aria-label={`Dùng ${captured.length} ảnh`}>
            <Check className="h-4 w-4" /> Dùng ảnh
          </button>
        ) : <span className="h-11 w-11" />}
      </header>

      {(loading || error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950 px-6 text-center">
          {loading ? (
            <div>
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-violet-400" />
              <p className="mt-4 text-sm font-bold">Đang mở camera…</p>
            </div>
          ) : (
            <div className="max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
              <ShieldAlert className="mx-auto h-10 w-10 text-amber-400" />
              <h2 className="mt-4 text-xl font-black">{error}</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">{getImagePermissionHelp()}</p>
              <div className="mt-5 grid gap-3">
                <button type="button" onClick={() => void startCamera(facingMode)} className="min-h-12 rounded-2xl bg-white font-bold text-slate-950">
                  <RefreshCw className="mr-2 inline h-4 w-4" /> Thử mở lại
                </button>
                <button type="button" onClick={pickFromLibrary} className="min-h-12 rounded-2xl border border-white/20 font-bold">
                  <Images className="mr-2 inline h-4 w-4" /> Chọn ảnh có sẵn
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !error && (
        <div className="absolute inset-x-0 bottom-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {captured.length > 0 && (
            <div className="mb-5 flex justify-center gap-2 px-4">
              {captured.map((photo, index) => (
                <div key={photo.url} className={`relative h-16 w-12 overflow-hidden rounded-xl border-2 ${reviewIndex === index ? 'border-white' : 'border-white/30'}`}>
                  <button type="button" onClick={() => setReviewIndex(index)} className="h-full w-full" aria-label={`Xem ảnh ${index + 1}`}>
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Xoá ảnh ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removePhoto(index);
                    }}
                    className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl-lg bg-black/70"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {reviewedPhoto ? (
            <div className="mx-auto flex max-w-md items-center justify-center gap-3 px-5">
              <button type="button" onClick={() => removePhoto(reviewIndex!)} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500/85 px-4 text-sm font-black backdrop-blur-md">
                <Trash2 className="h-5 w-5" /> Xoá
              </button>
              {multiple && canCaptureMore && (
                <button type="button" onClick={() => setReviewIndex(null)} className="flex min-h-12 flex-[1.35] items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950">
                  <Camera className="h-5 w-5" /> Chụp thêm
                </button>
              )}
              {!multiple && (
                <button type="button" onClick={() => removePhoto(reviewIndex!)} className="flex min-h-12 flex-[1.35] items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950">
                  <RefreshCw className="h-5 w-5" /> Chụp lại
                </button>
              )}
            </div>
          ) : (
            <div className="mx-auto grid max-w-sm grid-cols-3 items-center px-7">
              <button type="button" onClick={pickFromLibrary} className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/45 backdrop-blur-md" aria-label="Chọn ảnh có sẵn">
                <Images className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => void capture()} disabled={capturing || !canCaptureMore} className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/25 disabled:opacity-40" aria-label="Chụp ảnh">
                <span className={`h-16 w-16 rounded-full bg-white transition ${capturing ? 'scale-75' : ''}`} />
              </button>
              <button type="button" onClick={() => void switchCamera()} className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/45 backdrop-blur-md" aria-label="Đổi camera trước sau">
                <SwitchCamera className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
};
