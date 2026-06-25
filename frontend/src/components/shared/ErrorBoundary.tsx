import React, { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = async () => {
    // Clear potentially corrupted state
    localStorage.clear();
    sessionStorage.clear();
    
    // Unregister stale service workers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      } catch (e) {
        console.error("Failed to unregister SW:", e);
      }
    }

    // Force a hard reload
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
            <AlertTriangle className="text-red-500 w-10 h-10" />
          </div>
          
          <h1 className="text-3xl font-bold mb-3 tracking-tight font-sans">
            Playback Interrupted
          </h1>
          
          <p className="text-zinc-400 mb-8 max-w-md text-sm leading-relaxed">
            We encountered a critical error while trying to load this page. 
            This is usually caused by an outdated version of the app. Please refresh your session.
          </p>
          
          {this.state.error && (
             <div className="w-full max-w-md bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 mb-8 overflow-x-auto text-left">
               <code className="text-[11px] text-red-400/80 font-mono whitespace-pre-wrap">
                 {this.state.error.toString()}
               </code>
             </div>
          )}

          <Button 
            onClick={this.handleReset}
            className="bg-brand text-black hover:bg-brand/90 font-bold tracking-wide flex items-center gap-2 h-12 px-8 rounded-full transition-all active:scale-95"
          >
            <RefreshCw size={18} className="animate-spin-slow" />
            Clear Cache & Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
