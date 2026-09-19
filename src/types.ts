export interface Subscriber {
  id: string;
  display_name: string;
  name_variants: string[];
  whatsapp_number: string;
  active: boolean;
}

export interface CaseRow {
  item_no?: string;
  case_no?: string;
  parties?: string;
  pet_advocate?: string;
  resp_advocate?: string;
  bench?: string;
  matched_variant?: string;
  [key: string]: any;
}

export interface SubscriberResult {
  subscriber_id: string;
  display_name: string;
  whatsapp_number: string;
  matches_count: number;
  status: "sent" | "no_cases_found" | "failed" | "pdf_build_failed";
  pdf_filename: string | null;
  pdf_url: string | null;
  matched_cases?: CaseRow[];
  message: string;
}

export interface PipelineResult {
  success: boolean;
  file: string;
  total_rows: number;
  total_active_subscribers: number;
  sent_count: number;
  no_cases_count: number;
  failed_count: number;
  elapsed_seconds: string | number;
  subscriber_results: SubscriberResult[];
}

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  text: string;
}

export interface WhatsAppConfig {
  provider: "web_direct" | "meta_cloud_api" | "twilio" | "custom_gateway";
  metaCloudApi?: {
    phoneNumberId: string;
    wabaId: string;
    accessToken: string;
    configured: boolean;
  };
  twilio?: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
    configured: boolean;
  };
  customGateway?: {
    endpointUrl: string;
    apiKey: string;
    configured: boolean;
  };
}

export interface WhatsAppTestResult {
  success: boolean;
  provider: string;
  recipient: string;
  messageId?: string;
  timestamp: string;
  details: string;
  rawResponse?: any;
}

export interface InboxFile {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  uploadedAt: string;
  status: "pending" | "processed";
}

export interface SystemSettings {
  courtName: string;
  defaultBench: string;
  messageTemplate: string;
}
