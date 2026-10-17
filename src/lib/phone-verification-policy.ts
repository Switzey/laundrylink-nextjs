export function developmentPhoneVerificationCode(
  environment: "development" | "staging" | "production",
  configuredCode: string | null,
  providerConfigured: boolean,
) {
  if (environment !== "development" || providerConfigured) return null;
  const code = configuredCode?.trim() || "12345";
  return /^\d{4,10}$/.test(code) ? code : null;
}

export function phoneVerificationGateIsActive(
  roleRequiresVerification: boolean,
  phoneIsVerified: boolean,
  verificationProviderConfigured: boolean,
) {
  return roleRequiresVerification && !phoneIsVerified && verificationProviderConfigured;
}
