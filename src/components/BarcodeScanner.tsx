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
  const [isScanning, setIsScanning] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

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

      // Request camera permission explicitly first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment" } 
        });
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
        fps: 10,
        qrbox: { width: 250, height: 250 },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ]
      };

      await scanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          // Sanitize and validate
          const cleanedText = decodedText.trim().replace(/\D/g, '');
          
          if (cleanedText.length === 15) {
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
    if (scannerRef.current) {
      try {
        const state = await scannerRef.current.getState();
        if (state === 2) { // Html5QrcodeScannerState.SCANNING
          // Note: Torch control is experimental and may not work on all devices
          setTorchEnabled(!torchEnabled);
          toast({
            title: torchEnabled ? "Flashlight Off" : "Flashlight On",
          });
        }
      } catch (err) {
        toast({
          title: "Flashlight tidak tersedia",
          description: "Device ini tidak mendukung flashlight control",
          variant: "destructive"
        });
      }
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
              disabled={!isScanning}
            >
              <Flashlight className="h-4 w-4 mr-2" />
              Flashlight
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
