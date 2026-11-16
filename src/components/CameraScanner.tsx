import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, isCommitEnter } from './ui';
import { useT } from '@/store/app';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function isCameraScanSupported(): boolean {
  return typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia;
}

/** 端末カメラでバーコードを読み取り、USB スキャナがない環境でも会計できるモーダル。
 *  ブラウザ標準の BarcodeDetector を利用し、非対応ブラウザでは手入力に切り替える。 */
export function CameraScanner({ onDetect, onClose }: { onDetect: (code: string) => void; onClose: () => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const supported = isCameraScanSupported();

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const detector = new window.BarcodeDetector!({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
    });

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) {
              navigator.vibrate?.(60);
              onDetect(found[0].rawValue);
              return;
            }
          } catch {
            /* フレーム未準備時は無視して次フレームで再試行する */
          }
          timer = window.setTimeout(() => void tick(), 220);
        };
        void tick();
      } catch {
        setError(t('scan.noCamera'));
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [supported, onDetect, t]);

  return (
    <Modal open onClose={onClose} size="sm" title={t('scan.title')}>
      <div className="col gap-12">
        {supported && !error ? (
          <div className="scanner-box">
            <video ref={video} playsInline muted />
            <div className="scanner-line" />
          </div>
        ) : (
          <div className="callout callout-warn">{error || t('scan.unsupported')}</div>
        )}
        <div className="row gap-8">
          <Input
            value={manual}
            inputMode="numeric"
            placeholder={t('products.barcode')}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (isCommitEnter(e) && manual.trim()) onDetect(manual.trim());
            }}
          />
          <Button variant="primary" disabled={!manual.trim()} onClick={() => onDetect(manual.trim())}>
            {t('common.add')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
