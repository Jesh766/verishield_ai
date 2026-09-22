/**
 * Provider abstraction for Authoritative Government Verification.
 *
 * IMPORTANT ARCHITECTURAL PRINCIPLE:
 * This prototype performs LOCAL SCREENING ONLY.
 * Live government verification (UIDAI, Passport Seva, Parivahan) is NOT currently connected or configured.
 *
 * This abstraction allows future production integration of authoritative verification providers
 * without replacing or breaking the offline local screening workflow.
 */

export type AuthoritativeStatus =
  "NOT_CONFIGURED" | "UNAVAILABLE" | "PENDING" | "VERIFIED" | "NOT_VERIFIED" | "ERROR";

export interface AuthoritativeResult {
  status: AuthoritativeStatus;
  provider: string;
  detail: string;
  isAuthoritative: boolean;
  timestamp?: string;
}

export interface VerificationProvider {
  name: string;
  verify(documentType: string, fields: Record<string, string>): Promise<AuthoritativeResult>;
}

export class LocalOnlyVerificationProvider implements VerificationProvider {
  name = "local_screening_only";

  async verify(): Promise<AuthoritativeResult> {
    return {
      status: "NOT_CONFIGURED",
      provider: "none",
      detail:
        "Authoritative government verification is NOT currently configured or connected in this prototype. Screening is local-only.",
      isAuthoritative: false,
      timestamp: new Date().toISOString(),
    };
  }
}

let currentProvider: VerificationProvider = new LocalOnlyVerificationProvider();

export function getAuthoritativeProvider(): VerificationProvider {
  return currentProvider;
}

export function setAuthoritativeProvider(provider: VerificationProvider): void {
  currentProvider = provider;
}

export async function checkAuthoritativeVerification(
  documentType: string,
  fields: Record<string, string>,
): Promise<AuthoritativeResult> {
  return await currentProvider.verify(documentType, fields);
}
