/**
 * Returns true for mobile, tablet, and touch-first devices whose browser should
 * receive the original PDF instead of the branded desktop iframe wrapper.
 */
export const shouldOpenPdfNatively = ({
  userAgent = globalThis.navigator?.userAgent ?? '',
  platform = globalThis.navigator?.platform ?? '',
  maxTouchPoints = globalThis.navigator?.maxTouchPoints ?? 0,
  coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
  userAgentDataMobile = globalThis.navigator?.userAgentData?.mobile === true,
} = {}) => {
  const mobileOrTabletUserAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(
    userAgent,
  );
  const iPadUsingDesktopUserAgent =
    platform === 'MacIntel' && maxTouchPoints > 1;
  const touchFirstDevice = maxTouchPoints > 0 && coarsePointer;

  return (
    userAgentDataMobile ||
    mobileOrTabletUserAgent ||
    iPadUsingDesktopUserAgent ||
    touchFirstDevice
  );
};
