function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value.replace(/\/$/, "");
}

/** Public runtime config, read once from Vite build-time env. */
export const config = {
  scienceApiUrl: required("VITE_SCIENCE_API_URL", import.meta.env.VITE_SCIENCE_API_URL),
  siGatewayUrl: required("VITE_SI_GATEWAY_URL", import.meta.env.VITE_SI_GATEWAY_URL),
} as const;
