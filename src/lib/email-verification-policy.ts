export function emailVerificationBypassIsActive(
  bypassRequested: boolean,
  deliveryConfigured: boolean,
) {
  return bypassRequested && !deliveryConfigured;
}
