import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Penangkap error render. Tanpa ini, satu error saat pindah tab
 * bikin seluruh aplikasi blank putih dan cuma bisa dibenerin
 * dengan refresh manual.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  handleReload = () => {
    // Bersihkan flag retry chunk biar load ulang beneran fresh
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("chunk-retry:"))
      .forEach((k) => sessionStorage.removeItem(k));
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-2xl bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="font-bold">Ups, ada yang error</p>
            <p className="text-sm text-muted-foreground">
              Tenang, datanya aman. Coba muat ulang halamannya.
            </p>
          </div>
          <Button onClick={this.handleReload} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Muat Ulang
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
