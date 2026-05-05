import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Flashlight, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanSuccess: (decodedText: string) => void;
  title?: string;
  description?: string;
}

export function BarcodeScanner({
  open,
  onOpenChange,
  onScanSuccess,
  title = "Scan Barcode IMEI",
  description = "Arahkan kamera ke barcode di box HP"
}: BarcodeScannerProps) {
  const { toast } = useToast();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playBeep = () => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1180, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      console.warn("Beep failed", e);
    }
  };

  useEffect(() => {
    if (open) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [open]);

  const startScanner = async () => {
    try {
      // Check if running in secure context (HTTPS or localhost)
      if (!window.isSecureContext) {
        toast({
          title: "Kamera memerlukan HTTPS",
          description: "Akses kamera hanya bisa di HTTPS atau localhost",
          variant: "destructive"
        });
        onOpenChange(false);
        return;
      }

      // Check if camera is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast({
          title: "Kamera tidak tersedia",
          description: "Browser ini tidak mendukung akses kamera",
          variant: "destructive"
        });
        onOpenChange(false);
        return;
      }

      // Request camera permission explicitly first with highest quality + autofocus
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: { ideal: "environment" },
            width: { min: 1280, ideal: 1920, max: 3840 },
            height: { min: 720, ideal: 1080, max: 2160 },
            frameRate: { ideal: 30, max: 60 },
            // @ts-ignore - advanced constraints for focus
            focusMode: "continuous",
            advanced: [
              { focusMode: "continuous" } as any,
              { exposureMode: "continuous" } as any,
              { whiteBalanceMode: "continuous" } as any,
            ],
          } 
        });
        
        // Check torch capability
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities() as any;
        if (capabilities.torch) {
          setTorchSupported(true);
          videoTrackRef.current = videoTrack;
        }
        
        // Stop the test stream immediately
        stream.getTracks().forEach(track => track.stop());
      } catch (permErr: any) {
        console.error("Permission error:", permErr);
        let errorMsg = "Tidak dapat mengakses kamera.";
        let actionMsg = "";

        if (permErr.name === "NotAllowedError" || permErr.name === "PermissionDeniedError") {
          errorMsg = "Akses kamera ditolak.";
          // Detect device type
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          const isAndroid = /Android/.test(navigator.userAgent);
          
          if (isIOS) {
            actionMsg = "Buka Settings > Safari > Camera, pilih 'Ask' atau 'Allow'";
          } else if (isAndroid) {
            actionMsg = "Buka Settings > Apps > Browser > Permissions > Camera, aktifkan";
          } else {
            actionMsg = "Klik icon kamera di address bar browser, lalu Allow";
          }
        } else if (permErr.name === "NotFoundError") {
          errorMsg = "Kamera tidak ditemukan.";
          actionMsg = "Pastikan device memiliki kamera";
        } else if (permErr.name === "NotReadableError") {
          errorMsg = "Kamera sedang digunakan aplikasi lain.";
          actionMsg = "Tutup aplikasi lain yang menggunakan kamera";
        }

        toast({
          title: errorMsg,
          description: actionMsg,
          variant: "destructive",
          duration: 8000,
        });
        onOpenChange(false);
        return;
      }

      setIsScanning(true);
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      const config = {
        fps: 30, // Higher FPS for faster scanning
        qrbox: (vw: number, vh: number) => {
          const minEdge = Math.min(vw, vh);
          const w = Math.floor(minEdge * 0.85);
          const h = Math.floor(w * 0.45);
          return { width: w, height: h };
        },
        aspectRatio: 1.7777778,
        disableFlip: false,
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        videoConstraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // @ts-ignore
          focusMode: "continuous",
          advanced: [
            { focusMode: "continuous" } as any,
            { exposureMode: "continuous" } as any,
            { whiteBalanceMode: "continuous" } as any,
          ],
        },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ]
      };

      await scanner.start(
        { facingMode: { ideal: "environment" } } as any,
        config as any,
        (decodedText) => {
          // Sanitize and validate
          const cleanedText = decodedText.trim().replace(/\D/g, '');
          
          if (cleanedText.length === 15) {
            playBeep();
            if (navigator.vibrate) navigator.vibrate(120);
            toast({
              title: "IMEI berhasil di-scan",
              description: cleanedText,
            });
            onScanSuccess(cleanedText);
            onOpenChange(false);
          } else {
            toast({
              title: "Format IMEI tidak valid",
              description: "IMEI harus 15 digit",
              variant: "destructive"
            });
          }
        },
        (errorMessage) => {
          // Silent error handling for continuous scanning
        }
      );

      // Apply focus/exposure constraints on the live track for sharper image
      setTimeout(async () => {
        try {
          const videoEl = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
          const stream = videoEl?.srcObject as MediaStream | undefined;
          const track = stream?.getVideoTracks?.()[0];
          if (track) {
            const caps = track.getCapabilities() as any;
            const advanced: any[] = [];
            if (caps.focusMode?.includes?.("continuous")) advanced.push({ focusMode: "continuous" });
            if (caps.exposureMode?.includes?.("continuous")) advanced.push({ exposureMode: "continuous" });
            if (caps.whiteBalanceMode?.includes?.("continuous")) advanced.push({ whiteBalanceMode: "continuous" });
            if (caps.focusDistance?.min !== undefined) advanced.push({ focusDistance: caps.focusDistance.min });
            if (advanced.length) {
              await track.applyConstraints({ advanced } as any);
            }
            if (caps.torch) {
              setTorchSupported(true);
              videoTrackRef.current = track;
            }
          }
        } catch (e) {
          console.warn("Focus constraints not applied:", e);
        }
      }, 500);
    } catch (err) {
      console.error("Scanner error:", err);
      toast({
        title: "Error memulai scanner",
        description: "Terjadi kesalahan. Coba refresh halaman dan izinkan akses kamera.",
        variant: "destructive",
        duration: 8000,
      });
      onOpenChange(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    setIsScanning(false);
    setTorchEnabled(false);
  };

  const toggleTorch = async () => {
    if (!torchSupported) {
      toast({
        title: "Flashlight tidak tersedia",
        description: "Device ini tidak mendukung flashlight",
        variant: "destructive"
      });
      return;
    }

    try {
      // Get current video track from scanner
      const videoElement = document.querySelector('#qr-reader video') as HTMLVideoElement;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        
        const newTorchState = !torchEnabled;
        await track.applyConstraints({
          advanced: [{ torch: newTorchState } as any]
        });
        
        setTorchEnabled(newTorchState);
        toast({
          title: newTorchState ? "Flashlight Nyala" : "Flashlight Mati",
        });
      }
    } catch (err) {
      console.error("Torch error:", err);
      toast({
        title: "Gagal toggle flashlight",
        description: "Terjadi kesalahan saat mengaktifkan flashlight",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div 
            id="qr-reader" 
            className="w-full rounded-lg overflow-hidden border-2 border-border"
            style={{ minHeight: "300px" }}
          />
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={toggleTorch}
              disabled={!isScanning || !torchSupported}
            >
              <Flashlight className={`h-4 w-4 mr-2 ${torchEnabled ? 'text-yellow-500' : ''}`} />
              {torchEnabled ? 'Matikan' : 'Flashlight'}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4 mr-2" />
              Batal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
