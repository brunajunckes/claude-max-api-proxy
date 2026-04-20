declare module "node-fetch" {
  export interface RequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }

  export interface Response {
    ok: boolean;
    status: number;
    json(): Promise<any>;
    text(): Promise<string>;
  }

  function fetch(url: string, init?: RequestInit): Promise<Response>;
  export default fetch;
}
