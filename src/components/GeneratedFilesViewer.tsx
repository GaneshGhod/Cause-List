import React, { useState, useEffect } from "react";
import { ToastMessage } from "../types";
import { 
  Download, 
  Eye, 
  FileText, 
  FolderArchive, 
  MessageSquare, 
  RefreshCw, 
  Search, 
  Trash2, 
  X,
  ExternalLink,
  ShieldCheck,
  Clock
} from "lucide-react";

export interface GeneratedDoc {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  subscriberId: string;
  subscriberName: string;
  url: string;
}

interface Props {
  onNotify: (type: ToastMessage["type"], text: string) => void;
}

export const GeneratedFilesViewer: React.FC<Props> = ({ onNotify }) => {
  const [documents, setDocuments] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [previewDoc, setPreviewDoc] = useState<GeneratedDoc | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/files/output");
      if (!res.ok) throw new Error("Failed to fetch generated documents");
      const data = await res.json();
      setDocuments(data);
    } catch (err: any) {
      console.error(err);
      onNotify("error", `Could not load documents: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/files/output/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setDocuments(prev => prev.filter(d => d.filename !== filename));
      if (previewDoc?.filename === filename) setPreviewDoc(null);
      onNotify("info", `Deleted ${filename}`);
    } catch (err: any) {
      onNotify("error", `Could not delete document: ${err.message}`);
    }
  };

  const handleClearAll = async () => {
    if (documents.length === 0) return;
    if (!window.confirm("Are you sure you want to purge all generated PDFs from storage?")) {
      return;
    }
    try {
      const res = await fetch("/api/files/clear-all", { method: "POST" });
      if (!res.ok) throw new Error("Failed to purge documents");
      setDocuments([]);
      setPreviewDoc(null);
      onNotify("info", "All generated cause list PDFs removed.");
    } catch (err: any) {
      onNotify("error", err.message);
    }
  };

  const filteredDocs = documents.filter(doc => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      doc.filename.toLowerCase().includes(q) ||
      doc.subscriberId.toLowerCase().includes(q) ||
      doc.subscriberName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FolderArchive className="h-5 w-5 text-sky-600" />
            Generated Cause List PDFs & Document Archive
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Browse, preview, and download custom executive PDFs generated for registered advocate subscribers.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          <button
            id="refresh-docs-btn"
            onClick={fetchDocuments}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-sky-600" : ""}`} />
            Refresh
          </button>

          {documents.length > 0 && (
            <button
              id="clear-all-docs-btn"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Purge All ({documents.length})
            </button>
          )}
        </div>
      </div>

      {/* Filter and Stats Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            id="search-docs-input"
            type="text"
            placeholder="Search by advocate name, ID (e.g. SUB-001)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="text-xs text-slate-500 self-end sm:self-center">
          Showing <strong>{filteredDocs.length}</strong> of <strong>{documents.length}</strong> documents
        </div>
      </div>

      {/* Document Grid / Table */}
      {loading && documents.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-sky-600 mb-2" />
          <p className="text-xs font-medium">Scanning generated PDFs directory...</p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-200 text-center text-slate-500">
          <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <h4 className="text-sm font-bold text-slate-700">No Generated Documents Found</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {searchTerm
              ? "No files matched your search query. Try clearing the search filter."
              : "Generate cause list PDFs by running the pipeline from the 'Process Daily Cause List' tab."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filteredDocs.map((doc) => (
              <div
                key={doc.filename}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{doc.subscriberName}</span>
                      <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {doc.subscriberId}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-500 mt-0.5 break-all">
                      {doc.filename}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(doc.createdAt).toLocaleString()}
                      </span>
                      <span>&bull;</span>
                      <span>{doc.sizeFormatted}</span>
                      <span>&bull;</span>
                      <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                        <ShieldCheck className="h-3 w-3" /> High Court Executive PDF
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>

                  <a
                    href={doc.url}
                    download={doc.filename}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    Download
                  </a>

                  <button
                    onClick={() => handleDelete(doc.filename)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Delete document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF Modal Viewer */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-sky-600" />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    PDF Preview: {previewDoc.subscriberName} ({previewDoc.subscriberId})
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {previewDoc.filename} &bull; {previewDoc.sizeFormatted}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.url}
                  download={previewDoc.filename}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
                <a
                  href={previewDoc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Tab
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal PDF iframe */}
            <div className="flex-1 bg-slate-100 relative">
              <iframe
                src={previewDoc.url}
                title={previewDoc.filename}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
