/** Semantic UI colors. Photographs, documents, flags, logos and QR codes retain
 * their original pixels; these palettes only color the application chrome. */
export const lightColors = {
  background: '#F4F7FB', surface: '#FFFFFF', text: '#202E43', muted: '#596A80', border: '#DFE5ED', soft: '#EEF2F7', accent: '#B7443A', error: '#AD2525',
  primaryButton: '#B7443A', dangerButton: '#AD2525', onAccent: '#FFFFFF', accentSoft: '#F8E4DF', accentBorder: '#DCA99F', accentText: '#963A32',
  success: '#23714B', successSoft: '#E1F0EB', successBorder: '#BCDCD0', warning: '#8B431E', warningSoft: '#FFF2DF', warningBorder: '#ECD9B6', info: '#365C86', infoSoft: '#EAF0F9',
  gradientTop: '#E8EFFB', gradientMiddle: '#F8F9FC', gradientBottom: '#F5E9E3',
  glass: 'rgba(255,255,255,0.52)', glassStrong: 'rgba(249,251,255,0.88)', glassBorder: 'rgba(205,215,228,0.8)', glassHighlight: 'rgba(255,255,255,0.85)',
  overlay: 'rgba(22,32,48,0.38)', heroSurface: '#202E43', heroText: '#FFFFFF', heroMuted: '#DFE4EC',
  loyaltyTop: '#FFF5F0', loyaltyMiddle: '#FBE2DD', loyaltyBottom: '#F4EFFA', progressStart: '#D87965', progressEnd: '#BC5148',
  shadow: 'rgba(32,46,67,0.10)', brand: '#DF4546',
};
export type ThemeColors = { [Key in keyof typeof lightColors]: string };
export const darkColors: ThemeColors = {
  background: '#10161F', surface: '#1B2430', text: '#F0F4FA', muted: '#B0BDD0', border: '#3D4A5C', soft: '#253143', accent: '#FF9C8F', error: '#FFB4AB',
  primaryButton: '#B7443A', dangerButton: '#A1342E', onAccent: '#FFFFFF', accentSoft: '#432B2C', accentBorder: '#A56F69', accentText: '#FFB4A8',
  success: '#8EDBB0', successSoft: '#1E3C32', successBorder: '#4E8B71', warning: '#F2C080', warningSoft: '#403322', warningBorder: '#8D744C', info: '#AACDF5', infoSoft: '#243950',
  gradientTop: '#162336', gradientMiddle: '#10161F', gradientBottom: '#281F27',
  glass: 'rgba(27,36,48,0.72)', glassStrong: 'rgba(27,36,48,0.94)', glassBorder: 'rgba(111,131,157,0.54)', glassHighlight: 'rgba(159,177,199,0.28)',
  overlay: 'rgba(0,0,0,0.64)', heroSurface: '#253143', heroText: '#F0F4FA', heroMuted: '#C6D3E5',
  loyaltyTop: '#3D2C2D', loyaltyMiddle: '#35272F', loyaltyBottom: '#282A40', progressStart: '#E9A394', progressEnd: '#D57D72',
  shadow: 'rgba(0,0,0,0.35)', brand: '#DF4546',
};
