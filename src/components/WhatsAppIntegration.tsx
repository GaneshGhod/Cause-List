import React, { useState, useEffect } from "react";
import { Subscriber, ToastMessage, WhatsAppConfig, WhatsAppTestResult } from "../types";
import {
  MessageSquare,
  ShieldCheck,
  Send,
  Settings,
  Key,
  Smartphone,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  Zap,
  Globe,
  HelpCircle,
  Check,
  Terminal,
  Radio
} from "lucide-react";

interface Props {
  subscribers: Subscriber[];
  onNotify: (type: ToastMessage["type"], text: string) => void;
}

export const WhatsAppIntegration: React.FC<Props> = ({ subscribers, onNotify }) => {
  const [config, setConfig] = useState<WhatsAppConfig>({
    provider: "web_direct",
    metaCloudApi: {
      phoneNumberId: "",
      wabaId: "",
      accessToken: "",
      configured: false,
    },
    twilio: {
      accountSid: "",
      authToken: "",
      fromNumber: "whatsapp:+14155238886",
      configured: false,
    },
    customGateway: {
      endpointUrl: "",
      apiKey: "",
      configured: false,
    },
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Live Test Bench state
  const [testRecipient, setTestRecipient] = useState("+91 98765 43210");
  const [testMessage, setTestMessage] = useState(
    "⚖️ *HIGH COURT CAUSE LIST DISPATCH*\nAdvocate: Adv. Rajesh K. Sharma\nListed: 3 Matters in Court Hall 2\nItem #1: W.P. (C) 1042/2024 - Apex vs State\n📄 Personalized PDF: Ready for download"
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WhatsAppTestResult | null>(null);

  // Fetch current config
  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/config");
      if (!res.ok) throw new Error("Failed to load WhatsApp configuration");
      const data = await res.json();
      setConfig(data);
    } catch (err: any) {
      onNotify("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSaveConfig = async (newConfig: WhatsAppConfig) => {
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save configuration");
      }
      setConfig(data.config);
      onNotify("success", `WhatsApp integration updated! Active provider: ${data.config.provider}`);
    } catch (err: any) {
      onNotify("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRunTestSend = async () => {
    if (!testRecipient.trim()) {
      onNotify("warning", "Please provide a recipient phone number.");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/whatsapp/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: testRecipient,
          messageText: testMessage,
          provider: config.provider,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Dispatch failed");
      }

      setTestResult(data);
      if (data.url) {
        window.open(data.url, "_blank");
        onNotify("success", "Generated WhatsApp Web link & opened chat window!");
      } else {
        onNotify("success", `Message delivered successfully via ${data.provider}!`);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        provider: config.provider,
        recipient: testRecipient,
        timestamp: new Date().toISOString(),
        details: err.message,
      });
      onNotify("error", err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onNotify("success", `Copied ${label} to clipboard!`);
  };

  const activeSubscribers = subscribers.filter(s => s.active);

  return (
    <div className="space-y-6">
      {/* Top Banner Explaining the Integration */}
      <div className="bg-gradient-to-r from-emerald-900 to-slate-900 text-white p-6 rounded-2xl shadow-xs border border-emerald-800/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <MessageSquare className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-lg font-bold">WhatsApp Integration Hub</h3>
                <p className="text-xs text-emerald-200/80">
                  Where and how High Court cause lists & executive PDFs are dispatched to advocate WhatsApp numbers.
                </p>
              </div>
            </div>
          </div>

          {/* Current Active Mode Badge */}
          <div className="bg-emerald-950/80 border border-emerald-600/50 px-4 py-2.5 rounded-xl flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-300">Active Channel</p>
              <p className="text-xs font-bold text-white capitalize">
                {config.provider === "web_direct"
                  ? "WhatsApp Web (1-Click Click-to-Chat)"
                  : config.provider === "meta_cloud_api"
                  ? "Meta WhatsApp Cloud API (Official)"
                  : config.provider === "twilio"
                  ? "Twilio WhatsApp Gateway"
                  : "Custom Webhook Gateway"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Integration Providers Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: WhatsApp Web / Direct Click-to-Chat */}
        <div
          onClick={() => handleSaveConfig({ ...config, provider: "web_direct" })}
          className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
            config.provider === "web_direct"
              ? "border-emerald-500 bg-emerald-50/40 shadow-xs ring-2 ring-emerald-100"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-emerald-600" />
                <h4 className="text-sm font-bold text-slate-900">WhatsApp Web</h4>
              </div>
              {config.provider === "web_direct" && (
                <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="h-3 w-3" /> ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              <strong>Zero Setup Required:</strong> Opens WhatsApp Web or desktop app directly with pre-formatted cause list details, matter listings, and PDF download links.
            </p>
            <ul className="text-[11px] text-slate-500 space-y-1 mb-4">
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> 100% Free, no Meta fees
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> No developer account needed
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Works from any browser or phone
              </li>
            </ul>
          </div>

          <button
            type="button"
            className={`w-full py-2 text-xs font-bold rounded-xl transition-all ${
              config.provider === "web_direct"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {config.provider === "web_direct" ? "Currently Selected" : "Use WhatsApp Web"}
          </button>
        </div>

        {/* Card 2: Meta Official WhatsApp Cloud API */}
        <div
          onClick={() => handleSaveConfig({ ...config, provider: "meta_cloud_api" })}
          className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
            config.provider === "meta_cloud_api"
              ? "border-emerald-500 bg-emerald-50/40 shadow-xs ring-2 ring-emerald-100"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-sky-600" />
                <h4 className="text-sm font-bold text-slate-900">Meta Cloud API</h4>
              </div>
              {config.provider === "meta_cloud_api" && (
                <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="h-3 w-3" /> ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              <strong>Automated Background Delivery:</strong> Direct API integration with Meta Graph API for unattended cause list dispatches to advocates.
            </p>
            <ul className="text-[11px] text-slate-500 space-y-1 mb-4">
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-sky-600" /> Meta Graph API v19.0
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-sky-600" /> Automated unattended dispatch
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-sky-600" /> Delivery receipts & analytics
              </li>
            </ul>
          </div>

          <button
            type="button"
            className={`w-full py-2 text-xs font-bold rounded-xl transition-all ${
              config.provider === "meta_cloud_api"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {config.provider === "meta_cloud_api" ? "Currently Selected" : "Use Meta Cloud API"}
          </button>
        </div>

        {/* Card 3: Twilio / Gateway */}
        <div
          onClick={() => handleSaveConfig({ ...config, provider: "twilio" })}
          className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
            config.provider === "twilio"
              ? "border-emerald-500 bg-emerald-50/40 shadow-xs ring-2 ring-emerald-100"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-violet-600" />
                <h4 className="text-sm font-bold text-slate-900">Twilio WhatsApp</h4>
              </div>
              {config.provider === "twilio" && (
                <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="h-3 w-3" /> ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              <strong>Enterprise Messaging:</strong> Dispatch cause lists via Twilio's WhatsApp Business Gateway using Account SID & Auth Token.
            </p>
            <ul className="text-[11px] text-slate-500 space-y-1 mb-4">
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-violet-600" /> Twilio Messages REST API
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-violet-600" /> Programmable SMS fallback
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-violet-600" /> Global carrier support
              </li>
            </ul>
          </div>

          <button
            type="button"
            className={`w-full py-2 text-xs font-bold rounded-xl transition-all ${
              config.provider === "twilio"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {config.provider === "twilio" ? "Currently Selected" : "Use Twilio Gateway"}
          </button>
        </div>
      </div>

      {/* Configuration Details Form for Selected Provider */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Settings className="h-4 w-4 text-sky-600" />
              WhatsApp Provider Settings
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure credentials and default parameters for the active provider.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchConfig}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-sky-600" : ""}`} />
              Reload
            </button>
          </div>
        </div>

        {/* 1. If Meta Cloud API is chosen */}
        {config.provider === "meta_cloud_api" && (
          <div className="space-y-4">
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <strong>Meta Cloud API Setup:</strong> Obtain these credentials from your{" "}
                <a
                  href="https://developers.facebook.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline"
                >
                  Meta for Developers Portal
                </a>{" "}
                under <em>WhatsApp &gt; API Setup</em>.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Phone Number ID
                </label>
                <input
                  id="whatsapp-meta-phone-id"
                  type="text"
                  placeholder="e.g. 109876543210987"
                  value={config.metaCloudApi?.phoneNumberId || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      metaCloudApi: { ...config.metaCloudApi!, phoneNumberId: e.target.value },
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  WhatsApp Business Account (WABA) ID
                </label>
                <input
                  id="whatsapp-meta-waba-id"
                  type="text"
                  placeholder="e.g. 209876543210987"
                  value={config.metaCloudApi?.wabaId || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      metaCloudApi: { ...config.metaCloudApi!, wabaId: e.target.value },
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Meta System User Access Token (Bearer Token)
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="whatsapp-meta-access-token"
                    type="password"
                    placeholder="EAA..."
                    value={config.metaCloudApi?.accessToken || ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        metaCloudApi: { ...config.metaCloudApi!, accessToken: e.target.value },
                      })
                    }
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveConfig(config)}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
              >
                {saving ? "Saving..." : "Save Meta API Configuration"}
              </button>
            </div>
          </div>
        )}

        {/* 2. If Twilio is chosen */}
        {config.provider === "twilio" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Twilio Account SID
                </label>
                <input
                  id="whatsapp-twilio-sid"
                  type="text"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={config.twilio?.accountSid || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      twilio: { ...config.twilio!, accountSid: e.target.value },
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Twilio WhatsApp Sender Number
                </label>
                <input
                  id="whatsapp-twilio-from"
                  type="text"
                  placeholder="whatsapp:+14155238886"
                  value={config.twilio?.fromNumber || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      twilio: { ...config.twilio!, fromNumber: e.target.value },
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Twilio Auth Token
                </label>
                <input
                  id="whatsapp-twilio-auth"
                  type="password"
                  placeholder="••••••••••••••••••••••••••••••••"
                  value={config.twilio?.authToken || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      twilio: { ...config.twilio!, authToken: e.target.value },
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveConfig(config)}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
              >
                {saving ? "Saving..." : "Save Twilio Credentials"}
              </button>
            </div>
          </div>
        )}

        {/* 3. If WhatsApp Web is chosen */}
        {config.provider === "web_direct" && (
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 text-xs text-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-bold">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              WhatsApp Web 1-Click Click-to-Chat Mode is Active
            </div>
            <p className="leading-relaxed">
              In this mode, you don't need any API keys or paid accounts. Whenever you run the High Court daily cause list pipeline, the bot automatically formats the courtroom listings, creates the executive PDF, and generates direct 1-click WhatsApp Web launch links for each matched advocate.
            </p>
            <div className="p-3 bg-white rounded-lg border border-emerald-200 text-[11px] font-mono text-emerald-950">
              Dispatches via: <span className="font-bold">https://web.whatsapp.com/send?phone=[PHONE]&amp;text=[HIGH_COURT_CAUSE_LIST]</span>
            </div>
          </div>
        )}
      </div>

      {/* Live Interactive Test Bench */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-600" />
              Live WhatsApp Dispatch Test Bench
            </h4>
            <p className="text-xs text-slate-500">
              Test sending an actual High Court cause list dispatch to your own phone number using the active provider.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Recipient Phone Number (with Country Code)
            </label>
            <input
              id="test-phone-input"
              type="text"
              placeholder="+91 98765 43210"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Example: +919876543210 (include +91 for India)
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Sample Cause List Message Body
            </label>
            <textarea
              id="test-message-input"
              rows={3}
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => handleCopy(testMessage, "Message text")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Text
          </button>

          <button
            id="run-test-send-btn"
            type="button"
            disabled={testing}
            onClick={handleRunTestSend}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition-all ${
              testing
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 active:scale-98"
            }`}
          >
            {testing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Dispatching Test Message...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Test Message Now
              </>
            )}
          </button>
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div
            className={`p-4 rounded-xl border text-xs space-y-2 mt-4 transition-all ${
              testResult.success
                ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                : "bg-rose-50 border-rose-200 text-rose-950"
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                )}
                <span>
                  {testResult.success
                    ? `Dispatch Successful (${testResult.provider})`
                    : `Dispatch Failed (${testResult.provider})`}
                </span>
              </span>
              <span className="font-mono text-[11px] opacity-75">
                {new Date(testResult.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <p className="font-medium">{testResult.details}</p>

            {testResult.messageId && (
              <p className="font-mono text-[11px]">
                Message ID: <strong>{testResult.messageId}</strong>
              </p>
            )}

            {testResult.rawResponse && (
              <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200 overflow-x-auto max-h-40">
                <pre className="font-mono text-[10px] text-slate-800">
                  {JSON.stringify(testResult.rawResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Registered Advocates Quick WhatsApp Launch Directory */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-sky-600" />
              Registered Advocates Dispatch Quick-Links ({activeSubscribers.length} Active)
            </h4>
            <p className="text-xs text-slate-500">
              Direct links to chat or trigger delivery for each advocate registered in the registry.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {subscribers.map((sub) => {
            const clean = sub.whatsapp_number.replace(/[^0-9]/g, "");
            const sampleMsg = `🏛️ *HIGH COURT CAUSE LIST DISPATCH*\nAdvocate: ${sub.display_name}\nDate: ${new Date().toLocaleDateString("en-IN")}\nPlease find your listed matters and cause list summary attached.\nCause List Bot Portal`;
            const chatUrl = `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(sampleMsg)}`;

            return (
              <div
                key={sub.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{sub.display_name}</span>
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {sub.id}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sub.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {sub.active ? "ACTIVE" : "PAUSED"}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    WhatsApp: {sub.whatsapp_number}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <button
                    onClick={() => {
                      setTestRecipient(sub.whatsapp_number);
                      setTestMessage(sampleMsg);
                      onNotify("info", `Selected ${sub.display_name} in Live Test Bench above.`);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Load into Test Bench
                  </button>

                  <a
                    href={chatUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-2xs"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Open Chat
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
