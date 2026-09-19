import React, { useState, useEffect, useRef } from "react";
import { CaseRow, PipelineResult, Subscriber, SubscriberResult, ToastMessage, InboxFile } from "../types";
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Download, 
  FileCheck, 
  FileText, 
  FileUp, 
  Layers, 
  Play, 
  RefreshCw, 
  Send, 
  ShieldCheck, 
  Sparkles, 
  XCircle,
  Eye,
  MessageSquare,
  Copy,
  ExternalLink,
  Plus,
  Table,
  FolderArchive,
  Trash2,
  Upload,
  Inbox
} from "lucide-react";

interface Props {
  subscribers: Subscriber[];
  onNotify: (type: ToastMessage["type"], text: string) => void;
  onRefreshLogs: () => void;
  onNavigateToWhatsApp?: () => void;
}

export const ProcessPipeline: React.FC<Props> = ({
  subscribers,
  onNotify,
  onRefreshLogs,
  onNavigateToWhatsApp,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useSampleList, setUseSampleList] = useState(true);
  const [courtTitle, setCourtTitle] = useState("HIGH COURT OF JUDICATURE");
  const [benchName, setBenchName] = useState("Division Bench I & Single Benches");
  const [dryRun, setDryRun] = useState(true);
  
  // Custom Raw Text / Case Input
  const [showCustomCaseEditor, setShowCustomCaseEditor] = useState(false);
  const [rawCauseListText, setRawCauseListText] = useState("");
  const [customCasesList, setCustomCasesList] = useState<CaseRow[] | null>(null);

  // Watched Inbox (/data/inbox) state
  const [inboxFiles, setInboxFiles] = useState<InboxFile[]>([]);
  const [selectedInboxFile, setSelectedInboxFile] = useState<string | null>(null);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [showInboxManager, setShowInboxManager] = useState(false);
  const inboxFileInputRef = useRef<HTMLInputElement>(null);

  const fetchInboxFiles = async () => {
    try {
      setIsLoadingInbox(true);
      const res = await fetch("/api/inbox");
      if (res.ok) {
        const data = await res.json();
        setInboxFiles(data);
      }
    } catch (e) {
      console.error("Failed to fetch inbox files", e);
    } finally {
      setIsLoadingInbox(false);
    }
  };

  useEffect(() => {
    fetchInboxFiles();
  }, []);

  const handleSelectInboxFile = (filename: string) => {
    setSelectedInboxFile(filename);
    setUseSampleList(false);
    setSelectedFile(null);
    setCustomCasesList(null);
    onNotify("info", `Selected inbox file: ${filename}`);
  };

  const handleCreateDemoInboxFile = async () => {
    try {
      const res = await fetch("/api/inbox/create-sample", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create sample");
      onNotify("success", `Placed demo cause list in /data/inbox: ${data.filename}`);
      await fetchInboxFiles();
      handleSelectInboxFile(data.filename);
    } catch (err: any) {
      onNotify("error", err.message);
    }
  };

  const handleUploadToInbox = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await fetch("/api/inbox/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, base64 }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
        onNotify("success", `Uploaded ${file.name} directly into /data/inbox`);
        await fetchInboxFiles();
        handleSelectInboxFile(data.filename);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      onNotify("error", `Failed to upload: ${err.message}`);
    } finally {
      if (inboxFileInputRef.current) inboxFileInputRef.current.value = "";
    }
  };

  const handleDeleteInboxFile = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (selectedInboxFile === filename) {
        setSelectedInboxFile(null);
        setUseSampleList(true);
      }
      onNotify("info", `Removed ${filename} from inbox.`);
      await fetchInboxFiles();
    } catch (err: any) {
      onNotify("error", err.message);
    }
  };

  // Pipeline execution states
  const [isRunning, setIsRunning] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);

  // Inspector modal for matched cases
  const [inspectSubscriber, setInspectSubscriber] = useState<SubscriberResult | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  // Track manual whatsapp dispatched status in webapp
  const [dispatchedIds, setDispatchedIds] = useState<Record<string, boolean>>({});

  const activeCount = subscribers.filter(s => s.active).length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        onNotify("warning", "Please select a valid PDF file.");
        return;
      }
      setSelectedFile(file);
      setUseSampleList(false);
      setCustomCasesList(null);
      onNotify("info", `Selected cause list: ${file.name} (${Math.round(file.size / 1024)} KB)`);
    }
  };

  const addProgressLog = (msg: string) => {
    setProgressLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleParseRawText = async () => {
    if (!rawCauseListText.trim()) {
      onNotify("warning", "Please paste or enter cause list text first.");
      return;
    }
    try {
      const res = await fetch("/api/cause-list/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawCauseListText }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to parse cause list text");
      }
      setCustomCasesList(data.cases);
      setUseSampleList(false);
      setSelectedFile(null);
      onNotify("success", `Parsed ${data.cases.length} case items from input text.`);
    } catch (err: any) {
      onNotify("error", err.message);
    }
  };

  const runPipeline = async () => {
    if (activeCount === 0) {
      onNotify("warning", "No active subscribers found! Please activate at least one subscriber before running.");
      return;
    }

    setIsRunning(true);
    setProgressPercent(10);
    setProgressStage("Initiating High Court Cause List Pipeline...");
    setProgressLogs([]);
    setPipelineResult(null);

    const targetDesc = customCasesList 
      ? `Custom Input (${customCasesList.length} cases)` 
      : selectedInboxFile
      ? `Inbox File: ${selectedInboxFile}`
      : useSampleList 
      ? "High Court Daily Cause List (Sample Registry)" 
      : selectedFile?.name || "Uploaded PDF";

    addProgressLog(`Starting webapp pipeline. Target: ${targetDesc}`);
    addProgressLog(`Active Advocates: ${activeCount} registered subscribers.`);

    setTimeout(() => {
      setProgressPercent(30);
      setProgressStage("Parsing courtroom table listings & advocate appearances...");
      addProgressLog("Extracting item numbers, case numbers, parties, and advocate counsel appearances...");
    }, 350);

    setTimeout(() => {
      setProgressPercent(60);
      setProgressStage("Filtering matters per subscriber (case-insensitive substring check)...");
      addProgressLog(`Evaluating name variants across each courtroom row for ${activeCount} active advocates...`);
    }, 750);

    setTimeout(() => {
      setProgressPercent(85);
      setProgressStage("Generating executive cause list PDFs for matched advocates...");
      addProgressLog("Creating styled PDF documents with official High Court banner & metadata...");
    }, 1200);

    try {
      const response = await fetch("/api/pipeline/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtName: courtTitle,
          benchName: benchName,
          fileName: selectedInboxFile 
            ? selectedInboxFile 
            : selectedFile 
            ? selectedFile.name 
            : `HighCourt_DailyList_${new Date().toISOString().slice(0, 10)}.pdf`,
          isDryRun: dryRun,
          customCases: customCasesList || null
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to execute pipeline");
      }

      setProgressPercent(95);
      setProgressStage("Finalizing delivery documents and WhatsApp dispatch payloads...");
      addProgressLog(`Generated ${data.sent_count} custom advocate documents.`);

      setTimeout(() => {
        setProgressPercent(100);
        setProgressStage("Pipeline Complete!");
        setIsRunning(false);
        setPipelineResult(data);
        addProgressLog(`Pipeline finished in ${data.elapsed_seconds}s. Total cases: ${data.total_rows}. Matches generated: ${data.sent_count}.`);
        onNotify("success", `Pipeline finished! ${data.sent_count} advocate cause lists generated & ready for WhatsApp dispatch.`);
        onRefreshLogs();
      }, 400);

    } catch (err: any) {
      setIsRunning(false);
      setProgressPercent(100);
      setProgressStage(`Pipeline Error: ${err.message}`);
      addProgressLog(`[ERROR] ${err.message}`);
      onNotify("error", `Pipeline failed: ${err.message}`);
    }
  };

  const generateWhatsAppMessage = (subRes: SubscriberResult): string => {
    const cases = subRes.matched_cases || [];
    const casesList = cases.map((c, i) => {
      return `${i + 1}. *Item #${c.item_no || i + 1}* | ${c.case_no}
   Parties: ${c.parties}
   Court: ${c.bench || "Court Hall"}
   Advocates: ${c.pet_advocate || "Petitioner"} vs ${c.resp_advocate || "Respondent"}`;
    }).join("\n\n");

    return `🏛️ *HIGH COURT CAUSE LIST DISPATCH*
*Advocate:* ${subRes.display_name}
*Date:* ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
*Listed Matters:* ${subRes.matches_count} Case(s) Today

${casesList}

📄 *Executive PDF:* Please download your formatted cause list summary document from the portal.
_Automated Dispatch by Cause List Bot Web App_`;
  };

  const [isBatchSending, setIsBatchSending] = useState(false);

  const handleBatchApiDispatch = async () => {
    if (!pipelineResult) return;
    const matched = pipelineResult.subscriber_results.filter(s => s.matches_count > 0);
    if (matched.length === 0) {
      onNotify("warning", "No matched advocates to dispatch to.");
      return;
    }

    setIsBatchSending(true);
    try {
      const items = matched.map(s => ({
        subscriber_id: s.subscriber_id,
        display_name: s.display_name,
        whatsapp_number: s.whatsapp_number,
        matches_count: s.matches_count,
        messageText: generateWhatsAppMessage(s),
      }));

      const res = await fetch("/api/whatsapp/batch-api-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch dispatch failed");

      if (data.provider === "web_direct") {
        onNotify("info", "WhatsApp Web mode: Opening chat tabs for matched advocates...");
        data.results.forEach((r: any, idx: number) => {
          if (r.url) {
            setTimeout(() => {
              window.open(r.url, "_blank");
            }, idx * 400);
            setDispatchedIds(prev => ({ ...prev, [r.subscriber_id]: true }));
          }
        });
      } else {
        const successes = data.results.filter((r: any) => r.success).length;
        onNotify("success", `Dispatched ${successes} of ${matched.length} cause lists via ${data.provider}!`);
      }
    } catch (err: any) {
      onNotify("error", err.message);
    } finally {
      setIsBatchSending(false);
    }
  };

  const handleOpenWhatsAppWeb = (subRes: SubscriberResult) => {
    const cleanPhone = subRes.whatsapp_number.replace(/[^0-9]/g, "");
    const msg = generateWhatsAppMessage(subRes);
    const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    setDispatchedIds(prev => ({ ...prev, [subRes.subscriber_id]: true }));
    onNotify("success", `Opening WhatsApp Web chat for ${subRes.display_name}...`);
  };

  const handleCopyWhatsAppMessage = (subRes: SubscriberResult) => {
    const msg = generateWhatsAppMessage(subRes);
    navigator.clipboard.writeText(msg);
    onNotify("success", `WhatsApp message copied for ${subRes.display_name}!`);
  };

  return (
    <div className="space-y-6">
      {/* Main Configuration & Trigger Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-sky-600" />
              Daily High Court Cause List Dispatcher
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Parse cause lists, match against active advocate name variants, generate executive PDFs, and dispatch via WhatsApp Web.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {onNavigateToWhatsApp && (
              <button
                type="button"
                onClick={onNavigateToWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all shadow-2xs"
                title="Configure Meta Cloud API, Twilio, or WhatsApp Web"
              >
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                <span>WhatsApp API Settings</span>
              </button>
            )}

            <span className="text-xs font-semibold px-3 py-1 bg-sky-50 text-sky-700 rounded-full border border-sky-200">
              {activeCount} Active Advocates
            </span>
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg text-xs font-medium text-slate-700">
              <span>Mode:</span>
              <button
                id="toggle-dry-run-btn"
                type="button"
                onClick={() => setDryRun(!dryRun)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                  dryRun ? "bg-amber-500 text-white shadow-xs" : "bg-emerald-600 text-white shadow-xs"
                }`}
              >
                {dryRun ? "TEST / PREVIEW" : "LIVE DISPATCH"}
              </button>
            </div>
          </div>
        </div>

        {/* Input Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-6">
          {/* Option 1: Watched Inbox (/data/inbox) */}
          <div 
            onClick={() => {
              setShowInboxManager(true);
              if (inboxFiles.length > 0 && !selectedInboxFile) {
                handleSelectInboxFile(inboxFiles[0].filename);
              }
            }}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              selectedInboxFile 
                ? "border-sky-500 bg-sky-50/30 ring-2 ring-sky-100" 
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Inbox className="h-4 w-4 text-emerald-600" />
                  Watched Inbox
                </span>
                <div className="flex items-center gap-1">
                  {selectedInboxFile && (
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">Selected</span>
                  )}
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {inboxFiles.length} {inboxFiles.length === 1 ? "file" : "files"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Production intake folder (<code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">/data/inbox</code>) for daily cause lists.
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowInboxManager(!showInboxManager);
              }}
              className="mt-2 w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              <FolderArchive className="h-3.5 w-3.5" />
              {selectedInboxFile ? `Inbox: ${selectedInboxFile.slice(0, 14)}...` : "Manage Inbox Folder"}
            </button>
          </div>

          {/* Option 2: Preloaded High Court Cause List */}
          <div 
            onClick={() => {
              setUseSampleList(true);
              setSelectedFile(null);
              setCustomCasesList(null);
              setSelectedInboxFile(null);
            }}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              useSampleList && !selectedInboxFile
                ? "border-sky-500 bg-sky-50/30 ring-2 ring-sky-100" 
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Official Daily List
                </span>
                {useSampleList && !selectedInboxFile && (
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">Selected</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Pre-configured with 10 High Court courtroom listings (W.P., CRL.A., ARB.P.) matching registered advocates.
              </p>
            </div>

            <div className="bg-white/80 p-2 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-0.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Matters:</span>
                <span className="font-semibold text-slate-800">10 Listed Cases</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Advocates:</span>
                <span className="font-semibold text-emerald-600 truncate max-w-[150px]">Sharma, Deshmukh, Rao, etc.</span>
              </div>
            </div>
          </div>

          {/* Option 3: Upload PDF directly */}
          <div 
            className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
              selectedFile && !useSampleList && !customCasesList && !selectedInboxFile
                ? "border-sky-500 bg-sky-50/20" 
                : "border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/50"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <FileUp className="h-4 w-4 text-sky-600" />
                  Upload PDF File
                </span>
                {selectedFile && !selectedInboxFile && (
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">Selected</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Select any High Court cause list PDF downloaded from your local device.
              </p>
            </div>

            <div>
              <input
                id="cause-list-pdf-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700 cursor-pointer"
              />
              {selectedFile && (
                <div className="mt-2 p-2 bg-white border border-slate-200 rounded-lg text-xs flex justify-between">
                  <span className="font-medium text-slate-800 truncate">{selectedFile.name}</span>
                  <span className="text-slate-400 shrink-0 ml-1">{Math.round(selectedFile.size / 1024)} KB</span>
                </div>
              )}
            </div>
          </div>

          {/* Option 4: Paste Cause List Text / Custom Editor */}
          <div 
            onClick={() => {
              setShowCustomCaseEditor(true);
            }}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              customCasesList 
                ? "border-sky-500 bg-sky-50/30 ring-2 ring-sky-100" 
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Table className="h-4 w-4 text-violet-600" />
                  Paste / Custom Text
                </span>
                {customCasesList && (
                  <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded">
                    {customCasesList.length} Cases Loaded
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Paste courtroom notice board text to parse and test immediately.
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowCustomCaseEditor(!showCustomCaseEditor);
              }}
              className="mt-2 w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {customCasesList ? "Edit Custom Cases" : "Paste Raw Text"}
            </button>
          </div>
        </div>

        {/* Watched Inbox Manager Drawer */}
        {showInboxManager && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Watched Cause List Intake Folder (<span className="font-mono text-slate-600">/data/inbox</span>)
                </h4>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="file"
                  ref={inboxFileInputRef}
                  onChange={handleUploadToInbox}
                  accept=".pdf"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inboxFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-xs font-semibold shadow-2xs"
                >
                  <Upload className="h-3 w-3 text-slate-600" />
                  Drop PDF to Inbox
                </button>
                <button
                  type="button"
                  onClick={handleCreateDemoInboxFile}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded text-xs font-semibold shadow-2xs"
                >
                  <Sparkles className="h-3 w-3 text-emerald-600" />
                  Place Sample in Inbox
                </button>
                <button
                  type="button"
                  onClick={fetchInboxFiles}
                  disabled={isLoadingInbox}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded text-xs font-medium"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingInbox ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowInboxManager(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
                >
                  Close
                </button>
              </div>
            </div>

            {inboxFiles.length === 0 ? (
              <div className="p-4 bg-white border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                <p className="font-medium text-slate-700">No cause list files currently pending in /data/inbox.</p>
                <p className="text-slate-400 mt-1">
                  Click "Place Sample in Inbox" or "Drop PDF to Inbox" above to stage a daily cause list for automated processing.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                {inboxFiles.map((file) => {
                  const isSelected = selectedInboxFile === file.filename;
                  return (
                    <div
                      key={file.filename}
                      onClick={() => handleSelectInboxFile(file.filename)}
                      className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                        isSelected ? "bg-sky-50/70" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className={`h-4 w-4 shrink-0 ${isSelected ? "text-sky-600" : "text-slate-400"}`} />
                        <div className="min-w-0">
                          <p className={`font-semibold truncate ${isSelected ? "text-sky-900 font-bold" : "text-slate-800"}`}>
                            {file.filename}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Size: {file.sizeFormatted} &bull; Uploaded: {new Date(file.uploadedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isSelected ? (
                          <span className="px-2.5 py-1 bg-sky-600 text-white rounded text-[11px] font-bold">
                            Active Target
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectInboxFile(file.filename);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-sky-100 hover:text-sky-700 text-slate-700 rounded text-[11px] font-semibold"
                          >
                            Use This File
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteInboxFile(file.filename, e)}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded"
                          title="Delete from inbox"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Custom Text Drawer */}
        {showCustomCaseEditor && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Paste Raw High Court Cause List Text
              </h4>
              <button
                onClick={() => setShowCustomCaseEditor(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>
            <textarea
              id="raw-cause-list-textarea"
              rows={4}
              value={rawCauseListText}
              onChange={(e) => setRawCauseListText(e.target.value)}
              placeholder="Paste courtroom text here (e.g. Item 1 | W.P. 101/2024 | Apex vs State | Adv. Rajesh Sharma | Adv. K. Roy | Court Hall 3)..."
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleParseRawText}
                className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs"
              >
                Parse & Use This Cause List
              </button>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            {dryRun ? (
              <span className="text-amber-700 font-medium flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                Preview Mode: Generates all PDFs and formats WhatsApp messages without automated dispatch.
              </span>
            ) : (
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <Send className="h-3.5 w-3.5" />
                Live Mode: Ready for direct 1-click WhatsApp Web chat delivery.
              </span>
            )}
          </div>

          <button
            id="run-pipeline-btn"
            type="button"
            disabled={isRunning || activeCount === 0}
            onClick={runPipeline}
            className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all ${
              isRunning || activeCount === 0
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-sky-600 hover:bg-sky-700 active:scale-98"
            }`}
          >
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Processing Pipeline...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" />
                Execute Case Matching & PDF Generation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Status & Progress Area */}
      {(isRunning || progressLogs.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-600" />
              Live Pipeline Execution Progress
            </h4>
            <span className="text-xs font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
              {progressPercent}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-sky-600 h-2.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Current Stage Indicator */}
          <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl flex items-center gap-2 text-xs font-semibold text-sky-900">
            {isRunning ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-600" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            )}
            <span>{progressStage}</span>
          </div>

          {/* Stepped Event Feed */}
          <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-1.5 max-h-40 overflow-y-auto">
            {progressLogs.map((log, idx) => (
              <div key={idx} className="leading-relaxed">
                <span className="text-sky-400">➜</span> {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Breakdown Summary */}
      {pipelineResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> Cause List Processed Successfully
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                Advocate Matches & WhatsApp Delivery Console
              </h3>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="text-slate-500">
                Execution: <strong className="text-slate-800">{pipelineResult.elapsed_seconds}s</strong>
              </span>
              <span className="text-slate-500">
                Court Matters: <strong className="text-slate-800">{pipelineResult.total_rows}</strong>
              </span>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{pipelineResult.sent_count}</p>
              <p className="text-xs font-semibold text-emerald-800 uppercase mt-0.5">Matched Advocates</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-700">{pipelineResult.no_cases_count}</p>
              <p className="text-xs font-semibold text-slate-600 uppercase mt-0.5">0 Matters Listed</p>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-rose-700">{pipelineResult.failed_count}</p>
              <p className="text-xs font-semibold text-rose-800 uppercase mt-0.5">Failed Dispatches</p>
            </div>
          </div>

          {/* Quick WhatsApp Dispatch Action Bar */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-800">
                WhatsApp Dispatch Options ({pipelineResult.sent_count} advocate cause lists ready)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToWhatsApp && (
                <button
                  type="button"
                  onClick={onNavigateToWhatsApp}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors shadow-2xs"
                >
                  Configure WhatsApp API
                </button>
              )}

              <button
                type="button"
                disabled={isBatchSending || pipelineResult.sent_count === 0}
                onClick={handleBatchApiDispatch}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-xs"
              >
                {isBatchSending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Dispatching via WhatsApp...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Dispatch All Matched via WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Per-Subscriber Detailed List */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {pipelineResult.subscriber_results.map((subRes) => {
              const hasCases = subRes.matches_count > 0;
              const isMarkedSent = dispatchedIds[subRes.subscriber_id];

              return (
                <div
                  key={subRes.subscriber_id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-bold ${
                        isMarkedSent
                          ? "bg-emerald-600 text-white"
                          : hasCases 
                          ? "bg-emerald-100 text-emerald-800" 
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {isMarkedSent ? "✓ WHATSAPP OPENED" : hasCases ? `✓ ${subRes.matches_count} MATTER${subRes.matches_count > 1 ? "S" : ""}` : "— NO CASES"}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">{subRes.display_name}</h4>
                      <span className="text-xs font-mono text-slate-500">({subRes.subscriber_id})</span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1">
                      {subRes.message} &bull; WhatsApp: <span className="font-mono text-slate-700 font-semibold">{subRes.whatsapp_number}</span>
                    </p>
                  </div>

                  {/* Actions for this subscriber */}
                  <div className="flex items-center gap-2 self-start lg:self-center flex-wrap">
                    {hasCases && (
                      <>
                        <button
                          onClick={() => setInspectSubscriber(subRes)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Cases
                        </button>

                        <button
                          onClick={() => handleCopyWhatsAppMessage(subRes)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Copy pre-formatted WhatsApp message"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy Text
                        </button>

                        {/* WhatsApp Web Direct Send Button */}
                        <button
                          onClick={() => handleOpenWhatsAppWeb(subRes)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-98 rounded-lg shadow-2xs transition-all"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Send WhatsApp
                        </button>
                      </>
                    )}

                    {subRes.pdf_url && (
                      <button
                        onClick={() => setPreviewPdfUrl(subRes.pdf_url)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5 text-slate-500" />
                        Preview PDF
                      </button>
                    )}

                    {subRes.pdf_url && (
                      <a
                        href={subRes.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        download={subRes.pdf_filename || "CauseList.pdf"}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
                        title="Download PDF"
                      >
                        <Download className="h-3.5 w-3.5 text-slate-500" />
                        Download
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Matched Cases Inspector Drawer / Modal */}
      {inspectSubscriber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 border border-slate-100 my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Matched Matters for {inspectSubscriber.display_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Found {inspectSubscriber.matches_count} matter(s) listed in today's High Court cause list
                </p>
              </div>
              <button
                onClick={() => setInspectSubscriber(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {(inspectSubscriber.matched_cases || []).map((c, i) => (
                <div key={i} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span className="text-sky-700">{c.case_no}</span>
                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[11px]">
                      Item #{c.item_no || i + 1}
                    </span>
                  </div>
                  <div className="text-slate-700 font-medium">{c.parties}</div>
                  <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1 text-[11px]">
                    <div><strong>Pet Adv:</strong> {c.pet_advocate}</div>
                    <div><strong>Resp Adv:</strong> {c.resp_advocate}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Bench: {c.bench}
                  </div>
                  {c.matched_variant && (
                    <div className="text-[11px] text-sky-800 font-semibold bg-sky-100/70 px-2 py-0.5 rounded w-fit">
                      Matched Variant: "{c.matched_variant}"
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenWhatsAppWeb(inspectSubscriber)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Send WhatsApp
                </button>
                <button
                  onClick={() => handleCopyWhatsAppMessage(inspectSubscriber)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Text
                </button>
              </div>

              <div className="flex items-center gap-2">
                {inspectSubscriber.pdf_url && (
                  <a
                    href={inspectSubscriber.pdf_url}
                    download
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </a>
                )}
                <button
                  onClick={() => setInspectSubscriber(null)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF Modal Viewer */}
      {previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-sky-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Cause List PDF Preview
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewPdfUrl}
                  download
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
                <button
                  onClick={() => setPreviewPdfUrl(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100">
              <iframe
                src={previewPdfUrl}
                title="PDF Preview"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
