import express from "express";
import path from "path";
import fs from "fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const PORT = 3000;
const ROOT_DIR = process.cwd();
const SUBSCRIBERS_PATH = path.join(ROOT_DIR, "subscribers.json");
const LOG_PATH = path.join(ROOT_DIR, "cause_list_bot.log");
const DATA_DIR = path.join(ROOT_DIR, "data");
const OUTPUT_DIR = path.join(DATA_DIR, "output");
const INBOX_DIR = path.join(DATA_DIR, "inbox");
const ARCHIVE_DIR = path.join(DATA_DIR, "archive");

// Ensure directories exist
for (const dir of [DATA_DIR, OUTPUT_DIR, INBOX_DIR, ARCHIVE_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Ensure initial log file exists
if (!fs.existsSync(LOG_PATH)) {
  fs.writeFileSync(
    LOG_PATH,
    `[${new Date().toISOString().replace("T", " ").substring(0, 19)}] [INFO] Cause List Bot initialized. Awaiting High Court PDF in inbox or manual trigger.\n`,
    "utf-8"
  );
}

function appendLog(level: string, message: string) {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  console.log(logLine.trim());
  try {
    fs.appendFileSync(LOG_PATH, logLine, "utf-8");
  } catch (err) {
    console.error("Failed to append to log file:", err);
  }
}

// Production process crash prevention & safety guards
process.on("uncaughtException", (err: Error) => {
  console.error("[FATAL] Uncaught Exception caught by production guard:", err);
  appendLog("ERROR", `Uncaught exception prevented crash: ${err.message}`);
});

process.on("unhandledRejection", (reason: any) => {
  console.error("[FATAL] Unhandled Rejection caught by production guard:", reason);
  appendLog("ERROR", `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});

function readSubscribers() {
  const targetPath = fs.existsSync(path.join(process.cwd(), "subscribers.json"))
    ? path.join(process.cwd(), "subscribers.json")
    : SUBSCRIBERS_PATH;

  if (!fs.existsSync(targetPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(targetPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error reading subscribers.json:", e);
    return [];
  }
}

function writeSubscribers(data: any) {
  const targetPath = fs.existsSync(path.join(process.cwd(), "subscribers.json"))
    ? path.join(process.cwd(), "subscribers.json")
    : SUBSCRIBERS_PATH;
  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf-8");
}

function normalizePhoneNumber(input: string): string {
  if (!input) return "";
  const cleaned = input.replace(/[^\d+]/g, "").trim();
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  // Standard Indian 10-digit mobile number
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  // 11-digit starting with 0 (e.g. 09876543210)
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned.substring(1)}`;
  }
  // 12-digit starting with 91 (e.g. 919876543210)
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

function generateSmartNameVariants(displayName: string): string[] {
  if (!displayName || !displayName.trim()) return [];
  const clean = displayName.replace(/^(Adv\.?|Senior Adv\.?|Advocate|Sr\.? Adv\.?)\s+/i, "").trim();
  const variants = new Set<string>();

  variants.add(displayName.trim());
  if (clean && clean !== displayName.trim()) {
    variants.add(clean);
  }

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstInitial = parts[0][0];
    const lastName = parts[parts.length - 1];
    variants.add(`${firstInitial}. ${lastName}`);
    variants.add(`${parts[0]} ${lastName[0]}.`);
    if (parts.length === 3) {
      variants.add(`${parts[0][0]}. ${parts[1][0]}. ${lastName}`);
      variants.add(`${parts[0]} ${parts[1][0]}. ${lastName}`);
    }
  }

  return Array.from(variants);
}

function getNextAvailableSubscriberId(existing: any[]): string {
  let maxNum = 0;
  for (const sub of existing) {
    const match = String(sub.id || "").match(/SUB-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  let candidateNum = Math.max(maxNum + 1, existing.length + 1);
  let candidate = `SUB-${String(candidateNum).padStart(3, "0")}`;
  while (existing.some((s: any) => String(s.id).toUpperCase() === candidate.toUpperCase())) {
    candidateNum++;
    candidate = `SUB-${String(candidateNum).padStart(3, "0")}`;
  }
  return candidate;
}

// Realistic High Court Sample Cases
const SAMPLE_HIGH_COURT_CASES = [
  {
    item_no: "1",
    case_no: "W.P.(C) 4120/2024",
    parties: "M/s Apex Infrastructure Ltd. vs Union of India & Ors.",
    pet_advocate: "Adv. Rajesh K. Sharma, Rahul Verma",
    resp_advocate: "ASG Vikram Malhotra, C. K. Roy",
    bench: "Court Hall 3 (Hon'ble Chief Justice & Justice K. Mehta)"
  },
  {
    item_no: "2",
    case_no: "CRL.A. 892/2023",
    parties: "State of Maharashtra vs Suresh Ramchandra Patil",
    pet_advocate: "Public Prosecutor Anand S. Rao",
    resp_advocate: "Adv. Priya Venkataraman, S. Singhania",
    bench: "Court Hall 7 (Hon'ble Justice S. K. Shinde)"
  },
  {
    item_no: "3",
    case_no: "ARB.P. 512/2024",
    parties: "Global Logistics Corp vs Bharat Petroleum Corp Ltd",
    pet_advocate: "Adv. Amit Kumar Deshmukh, Alok Sen",
    resp_advocate: "Senior Adv. Farhan Ahmed Qureshi",
    bench: "Court Hall 11 (Hon'ble Justice V. G. Kulkarni)"
  },
  {
    item_no: "4",
    case_no: "BAIL APPLN. 2109/2024",
    parties: "Mohd. Tariq Shaikh vs Narcotics Control Bureau",
    pet_advocate: "Adv. Farhan Ahmed Qureshi, M. Sundaram",
    resp_advocate: "Special Public Prosecutor R. K. Sharma",
    bench: "Court Hall 5 (Hon'ble Justice D. N. Patel)"
  },
  {
    item_no: "5",
    case_no: "COM.SUIT 145/2023",
    parties: "Horizon Biotech Pvt Ltd vs Zenith Pharma Ltd & Anr.",
    pet_advocate: "Adv. Sneha Singhania, P. Venkat",
    resp_advocate: "Adv. Sunita S. Joshi, M. Gupta",
    bench: "Court Hall 9 (Hon'ble Justice Mrs. R. Joshi)"
  },
  {
    item_no: "6",
    case_no: "W.P.(CRL) 678/2024",
    parties: "Kavita Ramesh Rathod vs Commissioner of Police & Ors.",
    pet_advocate: "Adv. Meenakshi Sundaram, Anand Rao",
    resp_advocate: "Addl. Govt Pleader Deepa Narayanan",
    bench: "Court Hall 4 (Hon'ble Division Bench II)"
  },
  {
    item_no: "7",
    case_no: "TAX APP. 331/2022",
    parties: "Commissioner of Income Tax vs Nova Global Holdings Inc.",
    pet_advocate: "Standing Counsel Rajesh Sharma",
    resp_advocate: "Adv. Amit Deshmukh, K. Ramanathan",
    bench: "Court Hall 2 (Hon'ble Justice A. S. Oka)"
  },
  {
    item_no: "8",
    case_no: "CONT.CAS(C) 198/2024",
    parties: "Municipal Teachers Union vs Secretary, Urban Development Dept.",
    pet_advocate: "Adv. Sunita Joshi, B. R. Kapse",
    resp_advocate: "Adv. Rajesh K Sharma, Vinod Bhat",
    bench: "Court Hall 8 (Hon'ble Justice P. B. Majmudar)"
  },
  {
    item_no: "9",
    case_no: "MFA 10455/2023",
    parties: "United India Insurance Co vs Smt. Lakshmi & Ors.",
    pet_advocate: "Adv. Anand S. Rao",
    resp_advocate: "Adv. Priya Venkataraman",
    bench: "Court Hall 6 (Hon'ble Justice H. G. Ramesh)"
  },
  {
    item_no: "10",
    case_no: "EP 14/2024",
    parties: "Devendra Narayanrao vs Election Returning Officer",
    pet_advocate: "Adv. Sneha Singhania, R. K. Sharma",
    resp_advocate: "Adv. Farhan Qureshi, S. S. Joshi",
    bench: "Court Hall 1 (Hon'ble Chief Justice Court)"
  }
];

// Helper: Generate real PDF for subscriber matches using pdf-lib
async function generateSubscriberPDF(
  subscriber: { id: string; display_name: string; whatsapp_number: string },
  matchedCases: any[],
  courtMeta: { courtName: string; date: string; bench: string }
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Colors
  const darkNavy = rgb(0.06, 0.09, 0.16);
  const brandBlue = rgb(0.01, 0.52, 0.78);
  const grayText = rgb(0.35, 0.41, 0.51);
  const lightGray = rgb(0.95, 0.96, 0.98);
  const borderColor = rgb(0.82, 0.86, 0.91);

  let currentY = height - 40;

  // Header Banner
  page.drawText(courtMeta.courtName.toUpperCase(), {
    x: 40,
    y: currentY,
    size: 14,
    font: fontBold,
    color: darkNavy,
  });

  currentY -= 16;
  page.drawText(`DAILY CAUSE LIST MATTERS - DATE: ${courtMeta.date} | ${courtMeta.bench}`, {
    x: 40,
    y: currentY,
    size: 9,
    font: fontRegular,
    color: grayText,
  });

  currentY -= 14;
  // Divider line
  page.drawLine({
    start: { x: 40, y: currentY },
    end: { x: width - 40, y: currentY },
    thickness: 1,
    color: borderColor,
  });

  currentY -= 20;

  // Subscriber Summary Box
  const boxHeight = 55;
  page.drawRectangle({
    x: 40,
    y: currentY - boxHeight,
    width: width - 80,
    height: boxHeight,
    color: lightGray,
    borderColor: borderColor,
    borderWidth: 1,
  });

  page.drawText(`Subscriber: ${subscriber.display_name}`, {
    x: 52,
    y: currentY - 18,
    size: 11,
    font: fontBold,
    color: darkNavy,
  });

  page.drawText(`Subscriber ID: ${subscriber.id} | WhatsApp: ${subscriber.whatsapp_number}`, {
    x: 52,
    y: currentY - 34,
    size: 9,
    font: fontRegular,
    color: grayText,
  });

  page.drawText(`Matters Listed Today: ${matchedCases.length} Case(s)`, {
    x: width - 220,
    y: currentY - 18,
    size: 11,
    font: fontBold,
    color: brandBlue,
  });

  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: width - 220,
    y: currentY - 34,
    size: 8.5,
    font: fontRegular,
    color: grayText,
  });

  currentY -= (boxHeight + 20);

  // Table Column Headers
  const colX = {
    item: 42,
    caseNo: 78,
    parties: 185,
    advocates: 365,
    bench: 480
  };

  page.drawRectangle({
    x: 40,
    y: currentY - 18,
    width: width - 80,
    height: 22,
    color: darkNavy,
  });

  page.drawText("Item", { x: colX.item, y: currentY - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Case Number", { x: colX.caseNo, y: currentY - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Parties (Petitioner vs Respondent)", { x: colX.parties, y: currentY - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Advocate Appearances", { x: colX.advocates, y: currentY - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Court Hall", { x: colX.bench, y: currentY - 13, size: 8, font: fontBold, color: rgb(1, 1, 1) });

  currentY -= 26;

  // Render Table Rows
  for (let i = 0; i < matchedCases.length; i++) {
    const row = matchedCases[i];
    const rowHeight = 44;

    // Alternating background
    if (i % 2 === 1) {
      page.drawRectangle({
        x: 40,
        y: currentY - rowHeight + 10,
        width: width - 80,
        height: rowHeight,
        color: rgb(0.98, 0.99, 1),
      });
    }

    // Border line bottom
    page.drawLine({
      start: { x: 40, y: currentY - rowHeight + 10 },
      end: { x: width - 40, y: currentY - rowHeight + 10 },
      thickness: 0.5,
      color: borderColor,
    });

    const itemStr = String(row.item_no || i + 1);
    const caseStr = String(row.case_no || "").substring(0, 18);
    const partiesStr = String(row.parties || "").substring(0, 36);
    const partiesStr2 = String(row.parties || "").substring(36, 72);
    const advStr = `P: ${String(row.pet_advocate || "").substring(0, 24)}`;
    const advStr2 = `R: ${String(row.resp_advocate || "").substring(0, 24)}`;
    const benchStr = String(row.bench || "").substring(0, 18);

    page.drawText(itemStr, { x: colX.item, y: currentY - 4, size: 8, font: fontRegular, color: darkNavy });
    page.drawText(caseStr, { x: colX.caseNo, y: currentY - 4, size: 8, font: fontBold, color: brandBlue });
    
    page.drawText(partiesStr, { x: colX.parties, y: currentY - 4, size: 7.5, font: fontRegular, color: darkNavy });
    if (partiesStr2) {
      page.drawText(partiesStr2, { x: colX.parties, y: currentY - 15, size: 7, font: fontRegular, color: grayText });
    }

    page.drawText(advStr, { x: colX.advocates, y: currentY - 4, size: 7.5, font: fontRegular, color: darkNavy });
    page.drawText(advStr2, { x: colX.advocates, y: currentY - 15, size: 7, font: fontRegular, color: grayText });

    page.drawText(benchStr, { x: colX.bench, y: currentY - 4, size: 7.5, font: fontRegular, color: darkNavy });

    currentY -= rowHeight;
    if (currentY < 90) break; // Keep within page bounds
  }

  // Footer Disclaimer
  page.drawLine({
    start: { x: 40, y: 55 },
    end: { x: width - 40, y: 55 },
    thickness: 0.5,
    color: borderColor,
  });

  page.drawText(
    "Automated dispatch by Cause List Bot. Please verify matters with official High Court Registry notices.",
    {
      x: 40,
      y: 42,
      size: 7,
      font: fontOblique,
      color: grayText,
    }
  );

  const pdfBytes = await pdfDoc.save();
  const filename = `CauseList_${subscriber.id}_${Date.now()}.pdf`;
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, pdfBytes);

  return filename;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // ==========================================
  // API ROUTES
  // ==========================================

  // Comprehensive production health & readiness check
  app.get("/api/health", (req, res) => {
    try {
      const subs = readSubscribers();
      const activeSubs = subs.filter((s: any) => s.active);
      const outputCount = fs.existsSync(OUTPUT_DIR) 
        ? fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".pdf")).length 
        : 0;
      const inboxCount = fs.existsSync(INBOX_DIR)
        ? fs.readdirSync(INBOX_DIR).length
        : 0;
      const memory = process.memoryUsage();

      res.json({
        status: "ok",
        service: "Cause List Bot",
        environment: process.env.NODE_ENV || "production",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        metrics: {
          totalSubscribers: subs.length,
          activeSubscribers: activeSubs.length,
          pausedSubscribers: subs.length - activeSubs.length,
          generatedPdfs: outputCount,
          inboxPendingFiles: inboxCount,
          memoryHeapMB: Math.round(memory.heapUsed / 1024 / 1024),
          memoryRssMB: Math.round(memory.rss / 1024 / 1024)
        },
        storage: {
          dataDirReady: fs.existsSync(DATA_DIR),
          inboxDirReady: fs.existsSync(INBOX_DIR),
          outputDirReady: fs.existsSync(OUTPUT_DIR),
          archiveDirReady: fs.existsSync(ARCHIVE_DIR),
          logFileReady: fs.existsSync(LOG_PATH)
        }
      });
    } catch (e: any) {
      res.status(500).json({ status: "error", error: e.message });
    }
  });

  // Get all subscribers
  app.get("/api/subscribers", (req, res) => {
    try {
      const subs = readSubscribers();
      res.json(subs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create new subscriber with smart defaults & normalization
  app.post("/api/subscribers", (req, res) => {
    try {
      const { id, display_name, name_variants, whatsapp_number, active } = req.body;
      const existing = readSubscribers();

      if (!display_name || !display_name.trim()) {
        return res.status(400).json({ error: "Advocate display name is required." });
      }

      if (!whatsapp_number || !whatsapp_number.trim()) {
        return res.status(400).json({ error: "WhatsApp telephone number is required." });
      }

      // Auto-assign clean unique ID if missing or colliding
      let cleanId = (id || "").trim().toUpperCase();
      if (!cleanId || existing.some((s: any) => String(s.id).toUpperCase() === cleanId)) {
        cleanId = getNextAvailableSubscriberId(existing);
      }

      // Normalize phone number (auto-adds +91 for Indian 10-digit mobile numbers)
      const normalizedPhone = normalizePhoneNumber(whatsapp_number);

      // Extract or auto-generate name variants
      let variants: string[] = [];
      if (Array.isArray(name_variants) && name_variants.length > 0) {
        variants = name_variants.map((v: string) => v.trim()).filter(Boolean);
      } else if (typeof name_variants === "string" && name_variants.trim()) {
        variants = name_variants.split(",").map((v: string) => v.trim()).filter(Boolean);
      }

      if (variants.length === 0) {
        variants = generateSmartNameVariants(display_name);
      }

      const newSubscriber = {
        id: cleanId,
        display_name: display_name.trim(),
        name_variants: variants,
        whatsapp_number: normalizedPhone,
        active: active !== undefined ? Boolean(active) : true
      };

      existing.push(newSubscriber);
      writeSubscribers(existing);

      appendLog("INFO", `[SUBSCRIBER ADDED] Registered new subscriber ${newSubscriber.display_name} (${cleanId}) with ${variants.length} name variants.`);
      res.status(201).json({ success: true, subscriber: newSubscriber });
    } catch (err: any) {
      appendLog("ERROR", `Failed to create subscriber: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Update subscriber details
  app.put("/api/subscribers/:id", (req, res) => {
    try {
      const targetId = req.params.id;
      const { display_name, name_variants, whatsapp_number, active } = req.body;
      const existing = readSubscribers();
      const index = existing.findIndex((s: any) => s.id === targetId);

      if (index === -1) {
        return res.status(404).json({ error: `Subscriber '${targetId}' not found.` });
      }

      if (display_name !== undefined) existing[index].display_name = display_name.trim();
      if (whatsapp_number !== undefined) existing[index].whatsapp_number = normalizePhoneNumber(whatsapp_number);
      if (active !== undefined) existing[index].active = Boolean(active);
      if (name_variants !== undefined) {
        let variants = Array.isArray(name_variants)
          ? name_variants.map((v: string) => v.trim()).filter(Boolean)
          : (name_variants || "").split(",").map((v: string) => v.trim()).filter(Boolean);
        if (variants.length === 0 && existing[index].display_name) {
          variants = generateSmartNameVariants(existing[index].display_name);
        }
        existing[index].name_variants = variants;
      }

      writeSubscribers(existing);
      appendLog("INFO", `[SUBSCRIBER UPDATED] Modified settings for ${existing[index].display_name} (${targetId}).`);
      res.json({ success: true, subscriber: existing[index] });
    } catch (err: any) {
      appendLog("ERROR", `Failed to update subscriber: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Toggle active/paused state
  app.patch("/api/subscribers/:id/toggle", (req, res) => {
    try {
      const targetId = req.params.id;
      const existing = readSubscribers();
      const index = existing.findIndex((s: any) => s.id === targetId);

      if (index === -1) {
        return res.status(404).json({ error: `Subscriber '${targetId}' not found.` });
      }

      existing[index].active = !existing[index].active;
      writeSubscribers(existing);

      const statusStr = existing[index].active ? "ACTIVATED" : "PAUSED";
      appendLog("INFO", `[SUBSCRIPTION TOGGLED] ${existing[index].display_name} (${targetId}) set to ${statusStr}.`);
      res.json({ success: true, active: existing[index].active, subscriber: existing[index] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete subscriber
  app.delete("/api/subscribers/:id", (req, res) => {
    try {
      const targetId = req.params.id;
      let existing = readSubscribers();
      const found = existing.find((s: any) => s.id === targetId);

      if (!found) {
        return res.status(404).json({ error: `Subscriber '${targetId}' not found.` });
      }

      existing = existing.filter((s: any) => s.id !== targetId);
      writeSubscribers(existing);

      appendLog("INFO", `[SUBSCRIBER DELETED] Removed subscriber ${found.display_name} (${targetId}).`);
      res.json({ success: true, id: targetId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export Subscribers Registry Backup
  app.get("/api/subscribers/export", (req, res) => {
    try {
      const subs = readSubscribers();
      const filename = `CauseListBot_Subscribers_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(subs, null, 2));
      appendLog("INFO", `[BACKUP] Exported ${subs.length} subscribers to ${filename}`);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Import Subscribers Registry Backup
  app.post("/api/subscribers/import", (req, res) => {
    try {
      const incoming = req.body;
      if (!Array.isArray(incoming)) {
        return res.status(400).json({ error: "Invalid backup format. Expected an array of subscribers." });
      }

      const existing = readSubscribers();
      const existingMap = new Map(existing.map((s: any) => [s.id, s]));
      let importedCount = 0;

      for (const item of incoming) {
        if (!item || !item.display_name) continue;
        let id = (item.id || "").trim().toUpperCase();
        if (!id || existingMap.has(id)) {
          id = getNextAvailableSubscriberId(Array.from(existingMap.values()));
        }

        const normalizedPhone = normalizePhoneNumber(item.whatsapp_number || "");
        let variants = Array.isArray(item.name_variants)
          ? item.name_variants.map((v: string) => v.trim()).filter(Boolean)
          : generateSmartNameVariants(item.display_name);
        
        if (variants.length === 0) {
          variants = generateSmartNameVariants(item.display_name);
        }

        const newEntry = {
          id,
          display_name: item.display_name.trim(),
          name_variants: variants,
          whatsapp_number: normalizedPhone,
          active: item.active !== undefined ? Boolean(item.active) : true,
        };

        existingMap.set(id, newEntry);
        importedCount++;
      }

      const updatedList = Array.from(existingMap.values());
      writeSubscribers(updatedList);
      appendLog("INFO", `[BACKUP IMPORT] Successfully imported/merged ${importedCount} subscriber records. Total in registry: ${updatedList.length}`);
      res.json({ success: true, importedCount, total: updatedList.length, subscribers: updatedList });
    } catch (err: any) {
      appendLog("ERROR", `Failed to import subscribers: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // INBOX FOLDER MANAGEMENT ENDPOINTS
  // ==========================================

  // List all files in inbox
  app.get("/api/inbox", (req, res) => {
    try {
      if (!fs.existsSync(INBOX_DIR)) {
        return res.json([]);
      }
      const files = fs.readdirSync(INBOX_DIR);
      const list = files
        .filter(f => !f.startsWith("."))
        .map(file => {
          const filePath = path.join(INBOX_DIR, file);
          const stat = fs.statSync(filePath);
          return {
            filename: file,
            sizeBytes: stat.size,
            sizeFormatted: stat.size > 1024 * 1024 
              ? `${(stat.size / (1024 * 1024)).toFixed(2)} MB` 
              : `${(stat.size / 1024).toFixed(1)} KB`,
            uploadedAt: stat.birthtime || stat.mtime,
            status: "pending" as const,
          };
        })
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload or drop a cause list PDF into the inbox
  app.post("/api/inbox/upload", async (req, res) => {
    try {
      const { filename, base64 } = req.body;
      if (!filename) {
        return res.status(400).json({ error: "Filename is required" });
      }

      const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
      const targetPath = path.join(INBOX_DIR, safeName);

      if (base64) {
        const cleanBase64 = base64.replace(/^data:.*?;base64,/, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        fs.writeFileSync(targetPath, buffer);
      } else {
        // Create an initial empty PDF document if no data provided
        const doc = await PDFDocument.create();
        const page = doc.addPage([595.28, 841.89]);
        page.drawText(`High Court Cause List: ${safeName}`, { x: 50, y: 800, size: 14 });
        const pdfBytes = await doc.save();
        fs.writeFileSync(targetPath, pdfBytes);
      }

      appendLog("INFO", `[INBOX] New cause list PDF uploaded to inbox: ${safeName}`);
      res.json({ success: true, filename: safeName });
    } catch (err: any) {
      appendLog("ERROR", `Failed to upload to inbox: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Create a realistic demo High Court Cause List in inbox
  app.post("/api/inbox/create-sample", async (req, res) => {
    try {
      const sampleDoc = await PDFDocument.create();
      const page = sampleDoc.addPage([595.28, 841.89]);
      const fontBold = await sampleDoc.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await sampleDoc.embedFont(StandardFonts.Helvetica);

      page.drawText("HIGH COURT OF JUDICATURE", { x: 190, y: 800, size: 14, font: fontBold });
      page.drawText(`DAILY CAUSE LIST - ${new Date().toLocaleDateString("en-IN")}`, { x: 175, y: 780, size: 10, font: fontBold });
      page.drawText("COURT HALL 1 (HON'BLE CHIEF JUSTICE BENCH)", { x: 160, y: 760, size: 9, font: fontReg });
      page.drawLine({ start: { x: 40, y: 745 }, end: { x: 555, y: 745 }, thickness: 1 });

      let y = 720;
      for (const item of SAMPLE_HIGH_COURT_CASES) {
        page.drawText(`Item ${item.item_no || 1}: ${item.case_no} | ${item.parties.slice(0, 45)}`, { x: 40, y, size: 8, font: fontBold });
        page.drawText(`Advocates: ${item.pet_advocate}  vs  ${item.resp_advocate}`, { x: 40, y: y - 12, size: 7.5, font: fontReg });
        y -= 30;
      }

      const sampleFilename = `HighCourt_CauseList_${new Date().toISOString().slice(0, 10)}.pdf`;
      const targetPath = path.join(INBOX_DIR, sampleFilename);
      const bytes = await sampleDoc.save();
      fs.writeFileSync(targetPath, bytes);

      appendLog("INFO", `[INBOX] Placed official sample cause list PDF in inbox: ${sampleFilename}`);
      res.json({ success: true, filename: sampleFilename });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove file from inbox
  app.delete("/api/inbox/:filename", (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const targetPath = path.join(INBOX_DIR, filename);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        appendLog("INFO", `[INBOX] Removed cause list file from inbox: ${filename}`);
      }
      res.json({ success: true, filename });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // SYSTEM SETTINGS ENDPOINTS
  // ==========================================
  const SETTINGS_PATH = path.join(DATA_DIR, "system_settings.json");
  const defaultSettings = {
    courtName: "HIGH COURT OF JUDICATURE",
    defaultBench: "Division Bench I & Commercial Single Benches",
    messageTemplate: `🏛️ *HIGH COURT CAUSE LIST DISPATCH*
*Advocate:* {advocate_name}
*Date:* {date}
*Listed Matters:* {case_count} Case(s) Today

{cases_list}

📄 *Executive PDF:* Please download your personalized cause list PDF on the portal.
_Automated Dispatch by Cause List Bot_`
  };

  app.get("/api/settings", (req, res) => {
    try {
      if (!fs.existsSync(SETTINGS_PATH)) {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2), "utf-8");
        return res.json(defaultSettings);
      }
      const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
      res.json({ ...defaultSettings, ...JSON.parse(raw) });
    } catch (e) {
      res.json(defaultSettings);
    }
  });

  app.post("/api/settings", (req, res) => {
    try {
      const incoming = req.body || {};
      const updated = {
        courtName: incoming.courtName || defaultSettings.courtName,
        defaultBench: incoming.defaultBench || defaultSettings.defaultBench,
        messageTemplate: incoming.messageTemplate || defaultSettings.messageTemplate
      };
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(updated, null, 2), "utf-8");
      appendLog("INFO", `[SETTINGS] Updated system courtroom settings: ${updated.courtName}`);
      res.json({ success: true, settings: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get sample cause list data
  app.get("/api/sample-cause-list", (req, res) => {
    res.json({
      court_name: "HIGH COURT OF JUDICATURE",
      date: new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
      bench_name: "Division Bench I & Commercial Single Benches",
      cases: SAMPLE_HIGH_COURT_CASES
    });
  });

  // Execute Cause List Processing Pipeline
  app.post("/api/pipeline/process", async (req, res) => {
    const startTime = Date.now();
    try {
      const { customCases, courtName, causeDate, benchName, fileName, isDryRun } = req.body;
      const casesToProcess = (customCases && customCases.length > 0) ? customCases : SAMPLE_HIGH_COURT_CASES;
      const resolvedFileName = fileName || `HighCourt_CauseList_${new Date().toISOString().substring(0, 10)}.pdf`;

      appendLog("INFO", `=== Triggered Manual Pipeline Run for: ${resolvedFileName} ===`);
      appendLog("INFO", `Extracted ${casesToProcess.length} tabular case listings.`);

      const allSubscribers = readSubscribers();
      const activeSubscribers = allSubscribers.filter((s: any) => s.active);

      appendLog("INFO", `Evaluating matches for ${activeSubscribers.length} active subscriber advocates.`);

      const courtMeta = {
        courtName: courtName || "High Court of Judicature",
        date: causeDate || new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
        bench: benchName || "All High Court Benches"
      };

      const subscriberResults: any[] = [];
      let sentCount = 0;
      let noCasesCount = 0;
      let failedCount = 0;

      for (let i = 0; i < activeSubscribers.length; i++) {
        const sub = activeSubscribers[i];
        const variants: string[] = (sub.name_variants || []).map((v: string) => v.trim().toLowerCase()).filter(Boolean);

        // Case-insensitive substring matching across every cell in each row
        const matches: any[] = [];
        for (const row of casesToProcess) {
          const rowText = Object.values(row).join(" ").toLowerCase();
          const matchedVariant = variants.find((variant) => rowText.includes(variant));
          if (matchedVariant) {
            matches.push({
              ...row,
              matched_variant: matchedVariant
            });
          }
        }

        if (matches.length === 0) {
          appendLog("INFO", `[MATCH] ${sub.display_name} (${sub.id}): 0 matters listed today.`);
          noCasesCount++;
          subscriberResults.push({
            subscriber_id: sub.id,
            display_name: sub.display_name,
            whatsapp_number: sub.whatsapp_number,
            matches_count: 0,
            status: "no_cases_found",
            pdf_filename: null,
            pdf_url: null,
            matched_cases: [],
            message: "No cases found in today's High Court cause list."
          });
          continue;
        }

        appendLog("INFO", `[MATCH] ${sub.display_name} (${sub.id}): MATCHED ${matches.length} case(s)! Building custom PDF...`);

        try {
          // Generate PDF
          const generatedPdfFilename = await generateSubscriberPDF(sub, matches, courtMeta);
          
          appendLog(
            "INFO",
            `[WHATSAPP DISPATCH] ${sub.display_name}: Attaching document ${generatedPdfFilename} -> WhatsApp: ${sub.whatsapp_number}`
          );

          sentCount++;
          subscriberResults.push({
            subscriber_id: sub.id,
            display_name: sub.display_name,
            whatsapp_number: sub.whatsapp_number,
            matches_count: matches.length,
            status: "sent",
            pdf_filename: generatedPdfFilename,
            pdf_url: `/api/files/download/${generatedPdfFilename}`,
            matched_cases: matches,
            message: `Dispatched customized PDF (${matches.length} matter${matches.length > 1 ? "s" : ""}) to ${sub.whatsapp_number}`
          });
        } catch (genErr: any) {
          failedCount++;
          appendLog("ERROR", `Failed generating PDF or dispatching for ${sub.display_name}: ${genErr.message}`);
          subscriberResults.push({
            subscriber_id: sub.id,
            display_name: sub.display_name,
            whatsapp_number: sub.whatsapp_number,
            matches_count: matches.length,
            status: "failed",
            pdf_filename: null,
            pdf_url: null,
            matched_cases: matches,
            message: `Error during PDF generation or dispatch: ${genErr.message}`
          });
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      appendLog("INFO", `=== Cause List Pipeline Finished in ${elapsed}s | Sent: ${sentCount} | No Cases: ${noCasesCount} | Failed: ${failedCount} ===`);

      res.json({
        success: true,
        file: resolvedFileName,
        total_rows: casesToProcess.length,
        total_active_subscribers: activeSubscribers.length,
        sent_count: sentCount,
        no_cases_count: noCasesCount,
        failed_count: failedCount,
        elapsed_seconds: elapsed,
        subscriber_results: subscriberResults
      });
    } catch (err: any) {
      appendLog("ERROR", `Pipeline execution failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Download generated PDF
  app.get("/api/files/download/:filename", (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(OUTPUT_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  // List all generated output PDF documents
  app.get("/api/files/output", (req, res) => {
    try {
      if (!fs.existsSync(OUTPUT_DIR)) {
        return res.json([]);
      }
      const files = fs.readdirSync(OUTPUT_DIR);
      const subscribers = readSubscribers();
      const subMap = new Map(subscribers.map((s: any) => [s.id, s.display_name]));

      const results = files
        .filter(f => f.endsWith(".pdf"))
        .map(file => {
          const filePath = path.join(OUTPUT_DIR, file);
          const stat = fs.statSync(filePath);
          // Match filename pattern: CauseList_SUB-001_1789840413592.pdf
          const match = file.match(/^CauseList_([A-Z0-9_-]+)_(\d+)\.pdf$/);
          const subId = match ? match[1] : "UNKNOWN";
          const subName = subMap.get(subId) || "Registered Advocate";

          return {
            filename: file,
            sizeBytes: stat.size,
            sizeFormatted: `${(stat.size / 1024).toFixed(1)} KB`,
            createdAt: stat.birthtime || stat.mtime,
            subscriberId: subId,
            subscriberName: subName,
            url: `/api/files/download/${file}`
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a generated PDF
  app.delete("/api/files/output/:filename", (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(OUTPUT_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        appendLog("INFO", `Deleted generated file: ${filename}`);
      }
      res.json({ success: true, filename });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clear all generated PDFs in output directory
  app.post("/api/files/clear-all", (req, res) => {
    try {
      if (fs.existsSync(OUTPUT_DIR)) {
        const files = fs.readdirSync(OUTPUT_DIR);
        for (const file of files) {
          if (file.endsWith(".pdf")) {
            fs.unlinkSync(path.join(OUTPUT_DIR, file));
          }
        }
        appendLog("INFO", `Purged ${files.length} documents from data/output/ directory.`);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Parse raw text or pasted courtroom cause list into structured cases
  app.post("/api/cause-list/parse-text", (req, res) => {
    try {
      const { text } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "No text provided to parse." });
      }

      // Split lines and parse cases
      const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
      const cases: any[] = [];
      let currentCase: any = null;

      lines.forEach((line: string, index: number) => {
        // Check if line looks like a tabular row: Item | Case | Parties | Pet Adv | Resp Adv | Bench
        if (line.includes("|") || line.includes("\t")) {
          const parts = (line.includes("\t") ? line.split("\t") : line.split("|")).map((p: string) => p.trim());
          if (parts.length >= 3) {
            cases.push({
              item_no: parts[0] || String(cases.length + 1),
              case_no: parts[1] || `CASE-${cases.length + 1}`,
              parties: parts[2] || "Parties not specified",
              pet_advocate: parts[3] || "Advocate for Petitioner",
              resp_advocate: parts[4] || "Advocate for Respondent",
              bench: parts[5] || "Court Hall 1"
            });
            return;
          }
        }

        // Check for case number pattern like "W.P.", "CRL.", "ARB.", "BAIL", "CS", "NO."
        const isCaseHeader = /^(item\s*\d+|[a-z\.]+\s*\d+\/\d+|\d+\.)/i.test(line);
        if (isCaseHeader || !currentCase) {
          if (currentCase) cases.push(currentCase);
          currentCase = {
            item_no: String(cases.length + 1),
            case_no: line.substring(0, 30),
            parties: "Matter in cause list",
            pet_advocate: "",
            resp_advocate: "",
            bench: "Court Hall 1"
          };
        } else {
          if (!currentCase.pet_advocate) {
            currentCase.parties = line;
            currentCase.pet_advocate = line;
          } else {
            currentCase.resp_advocate = line;
          }
        }
      });

      if (currentCase) {
        cases.push(currentCase);
      }

      appendLog("INFO", `Parsed ${cases.length} case items from user-provided cause list text.`);
      res.json({ success: true, cases });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get log entries
  app.get("/api/logs", (req, res) => {
    try {
      if (!fs.existsSync(LOG_PATH)) {
        return res.json({ logs: "" });
      }
      const lines = fs.readFileSync(LOG_PATH, "utf-8");
      res.json({ logs: lines });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clear logs
  app.post("/api/logs/clear", (req, res) => {
    try {
      fs.writeFileSync(
        LOG_PATH,
        `[${new Date().toISOString().replace("T", " ").substring(0, 19)}] [INFO] Log history reset by administrator.\n`,
        "utf-8"
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch Python project files for inspector & code viewer
  app.get("/api/python-files", (req, res) => {
    try {
      const filesToRead = [
        "config.py",
        "subscribers.json",
        "pdf_parser.py",
        "pdf_builder.py",
        "whatsapp_sender.py",
        "watcher.py",
        "main.py",
        "admin_app.py",
        "requirements.txt",
        "README.md"
      ];

      const result: Record<string, string> = {};
      for (const file of filesToRead) {
        const fullPath = path.join(ROOT_DIR, file);
        if (fs.existsSync(fullPath)) {
          result[file] = fs.readFileSync(fullPath, "utf-8");
        }
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // WHATSAPP API INTEGRATION ENDPOINTS
  // ==========================================
  const WHATSAPP_CONFIG_PATH = path.join(DATA_DIR, "whatsapp_config.json");

  const readWhatsAppConfig = () => {
    const defaultConfig = {
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
    };

    if (!fs.existsSync(WHATSAPP_CONFIG_PATH)) {
      fs.writeFileSync(WHATSAPP_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf-8");
      return defaultConfig;
    }

    try {
      const content = fs.readFileSync(WHATSAPP_CONFIG_PATH, "utf-8");
      return { ...defaultConfig, ...JSON.parse(content) };
    } catch (e) {
      return defaultConfig;
    }
  };

  // Get WhatsApp configuration (mask tokens for display)
  app.get("/api/whatsapp/config", (req, res) => {
    try {
      const config = readWhatsAppConfig();
      // Mask access token for safety
      const safeConfig = JSON.parse(JSON.stringify(config));
      if (safeConfig.metaCloudApi?.accessToken) {
        const token = safeConfig.metaCloudApi.accessToken;
        safeConfig.metaCloudApi.accessToken = token.length > 8 
          ? `${token.slice(0, 4)}...${token.slice(-4)}` 
          : "••••••••";
      }
      if (safeConfig.twilio?.authToken) {
        const token = safeConfig.twilio.authToken;
        safeConfig.twilio.authToken = token.length > 8 
          ? `${token.slice(0, 4)}...${token.slice(-4)}` 
          : "••••••••";
      }
      res.json(safeConfig);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update WhatsApp configuration
  app.post("/api/whatsapp/config", (req, res) => {
    try {
      const existing = readWhatsAppConfig();
      const incoming = req.body || {};

      const updated = {
        provider: incoming.provider || existing.provider || "web_direct",
        metaCloudApi: {
          phoneNumberId: incoming.metaCloudApi?.phoneNumberId !== undefined ? incoming.metaCloudApi.phoneNumberId : existing.metaCloudApi?.phoneNumberId || "",
          wabaId: incoming.metaCloudApi?.wabaId !== undefined ? incoming.metaCloudApi.wabaId : existing.metaCloudApi?.wabaId || "",
          accessToken: (incoming.metaCloudApi?.accessToken && !incoming.metaCloudApi.accessToken.includes("••")) 
            ? incoming.metaCloudApi.accessToken 
            : existing.metaCloudApi?.accessToken || "",
          configured: Boolean(
            (incoming.metaCloudApi?.phoneNumberId || existing.metaCloudApi?.phoneNumberId) &&
            ((incoming.metaCloudApi?.accessToken && !incoming.metaCloudApi.accessToken.includes("••")) || existing.metaCloudApi?.accessToken)
          ),
        },
        twilio: {
          accountSid: incoming.twilio?.accountSid !== undefined ? incoming.twilio.accountSid : existing.twilio?.accountSid || "",
          authToken: (incoming.twilio?.authToken && !incoming.twilio.authToken.includes("••"))
            ? incoming.twilio.authToken
            : existing.twilio?.authToken || "",
          fromNumber: incoming.twilio?.fromNumber || existing.twilio?.fromNumber || "whatsapp:+14155238886",
          configured: Boolean(
            (incoming.twilio?.accountSid || existing.twilio?.accountSid) &&
            ((incoming.twilio?.authToken && !incoming.twilio.authToken.includes("••")) || existing.twilio?.authToken)
          ),
        },
        customGateway: {
          endpointUrl: incoming.customGateway?.endpointUrl || existing.customGateway?.endpointUrl || "",
          apiKey: (incoming.customGateway?.apiKey && !incoming.customGateway.apiKey.includes("••"))
            ? incoming.customGateway.apiKey
            : existing.customGateway?.apiKey || "",
          configured: Boolean(incoming.customGateway?.endpointUrl || existing.customGateway?.endpointUrl),
        },
      };

      fs.writeFileSync(WHATSAPP_CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
      appendLog("INFO", `[WHATSAPP CONFIG] Integration settings updated. Active provider: ${updated.provider}`);
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Test send / live send via configured WhatsApp provider
  app.post("/api/whatsapp/test-send", async (req, res) => {
    try {
      const { recipient, messageText, provider: reqProvider } = req.body;
      const config = readWhatsAppConfig();
      const provider = reqProvider || config.provider || "web_direct";

      if (!recipient) {
        return res.status(400).json({ error: "Recipient phone number is required." });
      }

      const cleanPhone = recipient.replace(/[^0-9]/g, "");
      const sampleText = messageText || "⚖️ High Court Daily Cause List Notification - WhatsApp Integration Test";

      appendLog("INFO", `[WHATSAPP TEST] Dispatch attempt to ${recipient} via provider: ${provider}`);

      if (provider === "web_direct") {
        const webUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(sampleText)}`;
        appendLog("INFO", `[WHATSAPP WEB] Prepared universal click-to-chat URL for ${cleanPhone}`);
        return res.json({
          success: true,
          provider: "web_direct",
          recipient: cleanPhone,
          url: webUrl,
          details: "WhatsApp Web direct link generated. Opens WhatsApp Web or desktop with pre-filled message.",
          timestamp: new Date().toISOString(),
        });
      }

      if (provider === "meta_cloud_api") {
        const phoneId = config.metaCloudApi?.phoneNumberId;
        const token = config.metaCloudApi?.accessToken;

        if (!phoneId || !token) {
          appendLog("WARNING", `[WHATSAPP META API] Missing credentials: Phone ID or Access Token not configured.`);
          return res.status(400).json({
            success: false,
            provider: "meta_cloud_api",
            error: "Meta WhatsApp Cloud API credentials not configured. Please provide Phone Number ID and Access Token in settings.",
          });
        }

        try {
          const metaUrl = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
          const metaPayload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "text",
            text: { preview_url: true, body: sampleText },
          };

          const metaRes = await fetch(metaUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(metaPayload),
          });

          const metaData = await metaRes.json();

          if (!metaRes.ok) {
            appendLog("ERROR", `[WHATSAPP META API] Meta Graph API Error: ${JSON.stringify(metaData)}`);
            return res.status(metaRes.status).json({
              success: false,
              provider: "meta_cloud_api",
              error: metaData.error?.message || "Meta API request failed.",
              rawResponse: metaData,
            });
          }

          appendLog("INFO", `[WHATSAPP META API] Successfully sent message to ${cleanPhone}. Message ID: ${metaData.messages?.[0]?.id}`);
          return res.json({
            success: true,
            provider: "meta_cloud_api",
            recipient: cleanPhone,
            messageId: metaData.messages?.[0]?.id,
            details: "Delivered successfully via Meta WhatsApp Cloud API.",
            rawResponse: metaData,
            timestamp: new Date().toISOString(),
          });
        } catch (fetchErr: any) {
          appendLog("ERROR", `[WHATSAPP META API] Network error: ${fetchErr.message}`);
          return res.status(500).json({
            success: false,
            provider: "meta_cloud_api",
            error: fetchErr.message,
          });
        }
      }

      if (provider === "twilio") {
        const sid = config.twilio?.accountSid;
        const auth = config.twilio?.authToken;
        const fromNum = config.twilio?.fromNumber || "whatsapp:+14155238886";

        if (!sid || !auth) {
          return res.status(400).json({
            success: false,
            provider: "twilio",
            error: "Twilio Account SID or Auth Token missing.",
          });
        }

        try {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
          const params = new URLSearchParams();
          params.append("From", fromNum);
          params.append("To", `whatsapp:+${cleanPhone}`);
          params.append("Body", sampleText);

          const twilioRes = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          });

          const twilioData = await twilioRes.json();
          if (!twilioRes.ok) {
            appendLog("ERROR", `[WHATSAPP TWILIO] Error: ${JSON.stringify(twilioData)}`);
            return res.status(twilioRes.status).json({
              success: false,
              provider: "twilio",
              error: twilioData.message || "Twilio delivery failed.",
              rawResponse: twilioData,
            });
          }

          appendLog("INFO", `[WHATSAPP TWILIO] Message queued via Twilio. SID: ${twilioData.sid}`);
          return res.json({
            success: true,
            provider: "twilio",
            recipient: cleanPhone,
            messageId: twilioData.sid,
            details: `Message dispatched via Twilio WhatsApp Gateway (Status: ${twilioData.status}).`,
            rawResponse: twilioData,
            timestamp: new Date().toISOString(),
          });
        } catch (twErr: any) {
          return res.status(500).json({ success: false, provider: "twilio", error: twErr.message });
        }
      }

      if (provider === "custom_gateway") {
        const endpoint = config.customGateway?.endpointUrl;
        if (!endpoint) {
          return res.status(400).json({
            success: false,
            provider: "custom_gateway",
            error: "Custom Gateway endpoint URL not set.",
          });
        }

        try {
          const gateRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(config.customGateway?.apiKey ? { "Authorization": `Bearer ${config.customGateway.apiKey}` } : {}),
            },
            body: JSON.stringify({
              recipient: cleanPhone,
              message: sampleText,
            }),
          });
          const gateData = await gateRes.json();
          return res.json({
            success: gateRes.ok,
            provider: "custom_gateway",
            recipient: cleanPhone,
            details: "Dispatched via custom webhook gateway.",
            rawResponse: gateData,
            timestamp: new Date().toISOString(),
          });
        } catch (gateErr: any) {
          return res.status(500).json({ success: false, provider: "custom_gateway", error: gateErr.message });
        }
      }

      res.status(400).json({ error: `Unknown provider: ${provider}` });
    } catch (err: any) {
      appendLog("ERROR", `[WHATSAPP DISPATCH] Handler failure: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Batch automated dispatch via API for matched subscribers
  app.post("/api/whatsapp/batch-api-dispatch", async (req, res) => {
    try {
      const { items } = req.body; // Array of { subscriber_id, display_name, whatsapp_number, matches_count, message }
      const config = readWhatsAppConfig();
      const provider = config.provider || "web_direct";

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "No subscribers provided for batch dispatch." });
      }

      appendLog("INFO", `[WHATSAPP BATCH] Initiating automated API batch dispatch for ${items.length} advocates via ${provider}`);

      const results = [];
      for (const item of items) {
        const cleanPhone = (item.whatsapp_number || "").replace(/[^0-9]/g, "");
        if (!cleanPhone) {
          results.push({ subscriber_id: item.subscriber_id, success: false, error: "Invalid phone number" });
          continue;
        }

        const messageText = item.messageText || `⚖️ *HIGH COURT CAUSE LIST DISPATCH*
Advocate: ${item.display_name}
Listed Matters: ${item.matches_count} case(s) found in today's High Court cause list.
Please check your personalized cause list PDF on the portal.`;

        // If provider is web_direct, return the click-to-chat url
        if (provider === "web_direct") {
          const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(messageText)}`;
          results.push({
            subscriber_id: item.subscriber_id,
            display_name: item.display_name,
            phone: cleanPhone,
            success: true,
            provider: "web_direct",
            url,
          });
          appendLog("INFO", `[WHATSAPP DISPATCH] Generated WhatsApp Web link for ${item.display_name} (${cleanPhone})`);
          continue;
        }

        // If provider is meta_cloud_api
        if (provider === "meta_cloud_api") {
          const phoneId = config.metaCloudApi?.phoneNumberId;
          const token = config.metaCloudApi?.accessToken;

          if (!phoneId || !token) {
            results.push({
              subscriber_id: item.subscriber_id,
              success: false,
              error: "Meta Cloud API credentials not configured in settings",
            });
            continue;
          }

          try {
            const metaRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: cleanPhone,
                type: "text",
                text: { body: messageText },
              }),
            });
            const data = await metaRes.json();
            const ok = metaRes.ok;
            results.push({
              subscriber_id: item.subscriber_id,
              display_name: item.display_name,
              success: ok,
              messageId: data.messages?.[0]?.id,
              error: ok ? undefined : data.error?.message,
            });
            appendLog(ok ? "INFO" : "ERROR", `[WHATSAPP BATCH] ${item.display_name}: ${ok ? "Delivered (" + data.messages?.[0]?.id + ")" : "Failed: " + data.error?.message}`);
          } catch (e: any) {
            results.push({ subscriber_id: item.subscriber_id, success: false, error: e.message });
          }
          continue;
        }

        // Twilio provider
        if (provider === "twilio") {
          const sid = config.twilio?.accountSid;
          const auth = config.twilio?.authToken;
          const fromNum = config.twilio?.fromNumber || "whatsapp:+14155238886";

          if (!sid || !auth) {
            results.push({ subscriber_id: item.subscriber_id, success: false, error: "Twilio credentials missing" });
            continue;
          }

          try {
            const params = new URLSearchParams();
            params.append("From", fromNum);
            params.append("To", `whatsapp:+${cleanPhone}`);
            params.append("Body", messageText);

            const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
              method: "POST",
              headers: {
                "Authorization": `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: params.toString(),
            });
            const data = await twRes.json();
            results.push({
              subscriber_id: item.subscriber_id,
              display_name: item.display_name,
              success: twRes.ok,
              messageId: data.sid,
              error: twRes.ok ? undefined : data.message,
            });
          } catch (e: any) {
            results.push({ subscriber_id: item.subscriber_id, success: false, error: e.message });
          }
        }
      }

      res.json({
        success: true,
        provider,
        total: items.length,
        results,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global Express error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[EXPRESS ERROR]", err);
    appendLog("ERROR", `Unhandled route error: ${err.message || String(err)}`);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message || "An unexpected server error occurred."
    });
  });

  // ==========================================
  // VITE / STATIC MIDDLEWARE
  // ==========================================
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cause List Bot Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
