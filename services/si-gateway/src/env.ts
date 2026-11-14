/** Bindings available to the Worker. Secrets are set with `wrangler secret put`. */
export interface Env {
  /** Comma-separated browser origins allowed to call the gateway. */
  ALLOWED_ORIGINS: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
}
