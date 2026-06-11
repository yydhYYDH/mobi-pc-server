export type ViewId = "overview" | "models" | "server" | "devices" | "chat" | "logs" | "settings";
export type BackendId = "mnn" | "llama_cpp";

export type MnnStatus = {
  state: string;
  backend?: BackendId;
  active_model_id: string | null;
  port: number | null;
  message: string | null;
  managed_by_backend?: boolean;
};

export type CatalogModel = {
  id: string;
  name: string;
  description: string;
  modelscope_id: string;
  size: string;
  runtime: string;
  local_dir: string;
  entry_file: string;
};

export type LocalModel = {
  id: string;
  downloaded: boolean;
};

export type DownloadStatus = {
  model_id: string;
  state: string;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number | null;
  message: string | null;
};

export type HdcStatus = {
  available: boolean;
  path: string | null;
  devices: Array<{
    serial: string;
    state: string;
    host: string | null;
    port: number | null;
    connection_type: string;
  }>;
  message: string | null;
  llm_port: number;
  phone_llm_url: string;
  llm_rport_ready: boolean;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ServerBusy = "start" | "stop" | null;
export type DeviceBusy = "auto" | "connect" | "disconnect" | null;

declare global {
  interface Window {
    pcServerDesktop?: {
      backendBaseUrl: string;
      platform: string;
    };
  }
}
