// Phone or not, for the supported-device gate (components/layout/SupportedDeviceGate).
//
// Width alone is not enough: a large phone turned to landscape is 900+ CSS px
// wide. A phone is a touch-first device (its primary pointer is coarse) whose
// screen's SHORT side is phone-sized. The screen's size, unlike the viewport,
// does not change with rotation, so a phone is a phone in either orientation.
//
//   largest phones today   short side ≈ 430–440 CSS px (iPhone Pro Max, Galaxy Ultra)
//   smallest tablets       short side ≥ 600 (7" Android), 744 (iPad mini)
//
// A desktop or laptop (fine primary pointer, touchscreen or not) is never a
// phone, so the desktop gate stays width-only exactly as before. Tablets are
// coarse but past the threshold, so they keep the width rule too.

export const PHONE_MAX_SHORT_SIDE = 600;

export function isPhoneDevice(d: { coarsePointer: boolean; screenWidth: number; screenHeight: number }): boolean {
  return d.coarsePointer && Math.min(d.screenWidth, d.screenHeight) < PHONE_MAX_SHORT_SIDE;
}
