import React, { useState, useEffect } from "react";
import { ToastMessage } from "../types";
import { 
  Copy, 
  Download, 
  Filter, 
  RefreshCw, 
  Terminal, 
  Trash2 
} from "lucide-react";

interface Props {
  onNotify: (type: ToastMessage["type"], text: string) => void;
}

export const LogViewer: React.FC<Props> = ({ onNotify }) => {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [searchLog, setSearchLog] = useState<string>("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/logs");
      const data = await res.json();
      setLogs(data.logs || "");
    } catch (err: any) {
      console.error("Failed to load logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Auto-refresh timer every 4 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleClearLogs = async () => {
    if (!window.confirm("Are you sure you want to clear cause_list_bot.log history?")) {
      return;
    }
    try {
      await fetch("/api/logs/clear", { method: "POST" });
      onNotify("info", "Log file reset.");
      fetchLogs();
    } catch (err: any) {
      onNotify("error", `Failed to clear logs: ${err.message}`);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs);
    onNotify("success", "Logs copied to clipboard.");
  };

  const handleDownloadLogs = () => {
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cause_list_bot_${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify("info", "Downloaded cause_list_bot.log file.");
  };

  // Filter log lines
  const lines = logs.split("\n").filter(Boolean);
  const filteredLines = lines.filter(line => {
    if (filterLevel !== "ALL") {
      if (!line.includes(`[${filterLevel}]`)) return false;
    }
    if (searchLog.trim()) {
      if (!line.toLowerCase().includes(searchLog.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Log Header & Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-sky-600" />
            Execution Audit Logs (cause_list_bot.log)
          </h3>
          <p className="text-xs text-slate-500">
            Real-time event log of folder watcher, table parsing, advocate matching, and WhatsApp dispatch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto Refresh Toggle */}
          <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 cursor-pointer">
            <input
              id="auto-refresh-toggle"
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-3.5 w-3.5 rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>Auto-refresh (4s)</span>
          </label>

          <button
            id="manual-refresh-logs-btn"
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-sky-600" : ""}`} />
            Refresh
          </button>

          <button
            id="copy-logs-btn"
            onClick={handleCopyLogs}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            title="Copy logs to clipboard"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>

          <button
            id="download-logs-btn"
            onClick={handleDownloadLogs}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            title="Download log file"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>

          <button
            id="clear-logs-btn"
            onClick={handleClearLogs}
            className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            title="Clear log file"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Filter & Search bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            id="search-logs-input"
            type="text"
            placeholder="Search within log trace (e.g. SUB-001, Sharma, error, WhatsApp)..."
            value={searchLog}
            onChange={(e) => setSearchLog(e.target.value)}
            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-600 self-start sm:self-auto shrink-0">
          {(["ALL", "INFO", "WARNING", "ERROR"] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterLevel === lvl 
                  ? "bg-white text-slate-900 shadow-xs font-bold" 
                  : "hover:text-slate-900"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal Display */}
      <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[500px] overflow-y-auto space-y-1 shadow-inner">
        {filteredLines.length === 0 ? (
          <div className="text-slate-500 italic py-6 text-center">
            No log lines matching criteria.
          </div>
        ) : (
          filteredLines.map((line, idx) => {
            const isError = line.includes("[ERROR]") || line.includes("CRITICAL");
            const isWarning = line.includes("[WARNING]");
            const isMatch = line.includes("[MATCH]");
            const isDispatch = line.includes("[WHATSAPP DISPATCH]");
            const isPipeline = line.includes("=== ");

            return (
              <div
                key={idx}
                className={`leading-relaxed whitespace-pre-wrap ${
                  isError
                    ? "text-rose-400 font-bold bg-rose-950/30 px-1 py-0.5 rounded"
                    : isWarning
                    ? "text-amber-300"
                    : isMatch
                    ? "text-sky-300"
                    : isDispatch
                    ? "text-emerald-300 font-semibold"
                    : isPipeline
                    ? "text-violet-300 font-bold py-1 border-y border-slate-800"
                    : "text-slate-300"
                }`}
              >
                {line}
              </div>
            );
          })
        )}
      </div>
      <div className="flex justify-between items-center text-[11px] text-slate-400 px-1">
        <span>Showing {filteredLines.length} of {lines.length} lines</span>
        <span>File: <code>cause_list_bot.log</code></span>
      </div>
    </div>
  );
};
