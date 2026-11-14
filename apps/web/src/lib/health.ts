export interface ServiceHealth {
  status: "ok";
  service: string;
}

/** GET {baseUrl}/health; throws on network errors, timeouts or non-2xx responses. */
export async function fetchHealth(baseUrl: string, signal?: AbortSignal): Promise<ServiceHealth> {
  const timeout = AbortSignal.timeout(5000);
  const response = await fetch(`${baseUrl}/health`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`Health check failed with HTTP ${response.status}`);
  return (await response.json()) as ServiceHealth;
}
