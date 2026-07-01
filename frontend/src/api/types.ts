export type ViewId = "overview" | "models" | "server" | "devices" | "chat" | "logs" | "settings";
export type BackendId = "mnn" | "mobiinfer" | "llama_cpp";

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
  mmproj_file?: string | null;
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
  hdc_server_running: boolean;
  hdc_server_port: number;
  hdc_server_url: string;
  hdc_server_message: string | null;
  llm_port: number;
  phone_llm_url: string;
  llm_rport_ready: boolean;
  pc_server_port: number;
  phone_pc_server_url: string;
  pc_server_rport_ready: boolean;
  mobile_event_ready: boolean;
  mobile_event_connections: number;
  mobile_event_type: string | null;
  mobile_event_client: string | null;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  imageName?: string;
};

export type ChatImageAttachment = {
  name: string;
  mime_type: string;
  size_bytes: number;
  data_uri: string;
};

export type ExampleImage = {
  id: string;
  name: string;
  path: string;
  mime_type: string;
  size_bytes: number;
};

export type ExampleImageDetail = ExampleImage & {
  data_uri: string;
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
