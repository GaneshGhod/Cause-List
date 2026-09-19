import React, { useState, useEffect } from "react";
import { Subscriber, ToastMessage } from "./types";
import { SubscribersManager } from "./components/SubscribersManager";
import { ProcessPipeline } from "./components/ProcessPipeline";
import { GeneratedFilesViewer } from "./components/GeneratedFilesViewer";
import { LogViewer } from "./components/LogViewer";
import { WhatsAppIntegration } from "./components/WhatsAppIntegration";
import { 
  Scale, 
  Users, 
  PlayCircle, 
  Terminal, 
  FolderArchive, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  X,
  Shield,
  Activity,
  MessageSquare,
  Sparkles
} from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"process" | "whatsapp" | "subscribers" | "archives" | "logs">("process");
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: ToastMessage["type"], text: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const fetchSubscribers = async () => {
    try {
      const res = await fetch("/api/subscribers");
      if (!res.ok) throw new Error("Failed to fetch subscribers");
      const data = await res.json();
      setSubscribers(data);
    } catch (err: any) {
      console.error(err);
      addToast("error", `Could not load subscribers: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscribers();
  }, []);

  const handleToggleActive = async (id: string) => {
    try {
      const res = await fetch(`/api/subscribers/${id}/toggle`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Toggle failed");
      }
      setSubscribers(prev =>
        prev.map(sub => (sub.id === id ? { ...sub, active: data.active } : sub))
      );
      const updatedSub = subscribers.find(s => s.id === id);
      const name = updatedSub ? updatedSub.display_name : id;
      addToast("success", `${name} is now ${data.active ? "ACTIVE (receiving digests)" : "PAUSED"}.`);
    } catch (err: any) {
      addToast("error", `Failed to toggle status: ${err.message}`);
    }
  };

  const handleUpdateSubscriber = async (id: string, updated: Partial<Subscriber>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/subscribers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Update failed");
      }
      setSubscribers(prev =>
        prev.map(sub => (sub.id === id ? data.subscriber : sub))
      );
      addToast("success", `Saved updates for ${data.subscriber.display_name} (${id}).`);
      return true;
    } catch (err: any) {
      addToast("error", `Update failed: ${err.message}`);
      return false;
    }
  };

  const handleAddSubscriber = async (newSub: Omit<Subscriber, "id"> & { id: string }): Promise<boolean> => {
    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSub),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create subscriber");
      }
      setSubscribers(prev => [...prev, data.subscriber]);
      addToast("success", `Advocate ${data.subscriber.display_name} successfully registered.`);
      return true;
    } catch (err: any) {
      addToast("error", err.message);
      return false;
    }
  };

  const handleDeleteSubscriber = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/subscribers/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete");
      }
      setSubscribers(prev => prev.filter(s => s.id !== id));
      addToast("info", `Subscriber ${id} removed from dispatch registry.`);
      return true;
    } catch (err: any) {
      addToast("error", `Delete failed: ${err.message}`);
      return false;
    }
  };

  const activeCount = subscribers.filter(s => s.active).length;
  const pausedCount = subscribers.length - activeCount;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Toast Notification Overlay */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl shadow-lg border text-xs font-semibold flex items-center justify-between gap-3 transition-all ${
              toast.type === "success"
                ? "bg-emerald-950 text-emerald-100 border-emerald-700"
                : toast.type === "error"
                ? "bg-rose-950 text-rose-100 border-rose-700"
                : toast.type === "warning"
                ? "bg-amber-950 text-amber-100 border-amber-700"
                : "bg-slate-900 text-slate-100 border-slate-700"
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === "success" && <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
              {toast.type === "error" && <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />}
              {toast.type === "warning" && <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />}
              {toast.type === "info" && <Info className="h-4 w-4 text-sky-400 shrink-0" />}
              <span>{toast.text}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:opacity-80 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Top Navigation & App Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-xs">
                <Scale className="h-5 w-5 text-sky-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-slate-900 tracking-tight">Cause List Bot</h1>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                    Web App
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  High Court Cause List Matcher &bull; WhatsApp Web Dispatch Hub
                </p>
              </div>
            </div>

            {/* Header Metrics */}
            <div className="hidden sm:flex items-center gap-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <span className="text-slate-500">Registry:</span>
                <span className="font-bold text-slate-900">{subscribers.length} Advocates</span>
                <span className="text-slate-300">|</span>
                <span className="text-emerald-600 font-bold">{activeCount} Active</span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">{pausedCount} Paused</span>
              </div>

              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-emerald-800 font-semibold">
                <Activity className="h-3.5 w-3.5 text-emerald-600" />
                <span>Ready for Dispatch</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-2 border-t border-slate-100 py-1.5 overflow-x-auto">
            <button
              id="nav-tab-process"
              onClick={() => setActiveTab("process")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "process"
                  ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <PlayCircle className="h-4 w-4 text-sky-600" />
              Daily Cause List & Dispatch
            </button>

            <button
              id="nav-tab-whatsapp"
              onClick={() => setActiveTab("whatsapp")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "whatsapp"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              WhatsApp Integration &amp; API
            </button>

            <button
              id="nav-tab-subscribers"
              onClick={() => setActiveTab("subscribers")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "subscribers"
                  ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Users className="h-4 w-4 text-slate-500" />
              Advocate Registry ({subscribers.length})
            </button>

            <button
              id="nav-tab-archives"
              onClick={() => setActiveTab("archives")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "archives"
                  ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <FolderArchive className="h-4 w-4 text-slate-500" />
              Generated PDFs & Archive
            </button>

            <button
              id="nav-tab-logs"
              onClick={() => setActiveTab("logs")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "logs"
                  ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Terminal className="h-4 w-4 text-slate-500" />
              Activity Audit Logs
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-500">
            <div className="animate-spin h-8 w-8 border-4 border-sky-600 border-t-transparent rounded-full mb-3"></div>
            <p className="text-sm font-medium">Loading advocate registry & courtroom matcher...</p>
          </div>
        ) : (
          <>
            {activeTab === "process" && (
              <ProcessPipeline
                subscribers={subscribers}
                onNotify={addToast}
                onRefreshLogs={() => {}}
                onNavigateToWhatsApp={() => setActiveTab("whatsapp")}
              />
            )}

            {activeTab === "whatsapp" && (
              <WhatsAppIntegration
                subscribers={subscribers}
                onNotify={addToast}
              />
            )}

            {activeTab === "subscribers" && (
              <SubscribersManager
                subscribers={subscribers}
                onToggleActive={handleToggleActive}
                onUpdateSubscriber={handleUpdateSubscriber}
                onAddSubscriber={handleAddSubscriber}
                onDeleteSubscriber={handleDeleteSubscriber}
                onNotify={addToast}
                onRefreshSubscribers={fetchSubscribers}
              />
            )}

            {activeTab === "archives" && (
              <GeneratedFilesViewer onNotify={addToast} />
            )}

            {activeTab === "logs" && (
              <LogViewer onNotify={addToast} />
            )}
          </>
        )}
      </main>

      {/* Web App Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            <strong>Cause List Bot</strong> &bull; Cloud Legal Practice Automation Web App
          </span>
          <span className="text-slate-400">
            Direct WhatsApp Web Dispatch &bull; High Court Case-Insensitive Matching Engine
          </span>
        </div>
      </footer>
    </div>
  );
}
