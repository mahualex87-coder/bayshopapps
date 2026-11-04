import { Animated, Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

export const LAUNCH_BACKGROUND = '#08090D';
const logo = require('../../../assets/branding/brand-mark.png');
// Narrow, independently weighted light trails. One gradual crescendo, never blinking/strobing.
const beams = [
  { x: -168, color: '#3B65EF', width: 6, strength: 0.48 },
  { x: -145, color: '#20B9E5', width: 2, strength: 0.82 },
  { x: -121, color: '#576BF5', width: 10, strength: 0.4 },
  { x: -102, color: '#9D58F3', width: 3, strength: 0.72 },
  { x: -81, color: '#E349A0', width: 8, strength: 0.55 },
  { x: -61, color: '#FF493E', width: 3, strength: 0.92 },
  { x: -43, color: '#FF8A43', width: 12, strength: 0.58 },
  { x: -26, color: '#FFC06F', width: 2, strength: 0.78 },
  { x: -11, color: '#F74757', width: 7, strength: 0.65 },
  { x: 11, color: '#FF646B', width: 4, strength: 0.92 },
  { x: 28, color: '#FFAA59', width: 10, strength: 0.58 },
  { x: 47, color: '#F8D482', width: 2, strength: 0.82 },
  { x: 66, color: '#E45093', width: 7, strength: 0.58 },
  { x: 88, color: '#A35BE8', width: 4, strength: 0.68 },
  { x: 110, color: '#6689FF', width: 9, strength: 0.42 },
  { x: 131, color: '#36B9E6', width: 2, strength: 0.78 },
  { x: 152, color: '#5465ED', width: 6, strength: 0.44 },
  { x: 172, color: '#9574EB', width: 2, strength: 0.6 },
] as const;

function starPath(cx: number, cy: number, radius: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 ? radius * 0.382 : radius;
    return `${i ? 'L' : 'M'}${(cx + Math.cos(angle) * r).toFixed(3)},${(cy + Math.sin(angle) * r).toFixed(3)}`;
  }).join(' ') + 'Z';
}
const usStars = Array.from({ length: 9 }, (_, row) => Array.from({ length: row % 2 ? 5 : 6 }, (_, col) => starPath((row % 2 ? 2.2 : 1.1) + col * 2.2, 0.9 + row * 1.05, 0.48)).join(' ')).join(' ');
const euStars = Array.from({ length: 12 }, (_, i) => starPath(15 + Math.sin(i * Math.PI / 6) * 6.4, 10 - Math.cos(i * Math.PI / 6) * 6.4, 1.08)).join(' ');

/** Only opacity and transforms animate: the entire scene runs on the native driver. */
export function LaunchArtwork({ progress, reduceTransparency }: { progress: Animated.Value; reduceTransparency: boolean }) {
  const at = (inputRange: number[], outputRange: number[]) => progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  const glow = at([0, 0.12, 0.34, 0.52, 0.8, 1], [0, 0.22, 0.58, 0.82, 0.22, 0.16]);
  const parcelOpacity = at([0, 0.08, 0.33, 0.5, 1], [0, 1, 1, 0, 0]);
  const parcelScale = at([0, 0.12, 0.32, 0.51, 1], [0.76, 1.05, 1.05, 0.18, 0.18]);
  const logoOpacity = at([0, 0.36, 0.52, 1], [0, 0, 1, 1]);
  const logoScale = at([0, 0.36, 0.56, 0.72, 1], [0.55, 0.55, 1.06, 1, 1]);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {!reduceTransparency && <Animated.View style={[styles.glow, { opacity: glow, transform: [{ scale: at([0, 0.5, 1], [0.6, 1.12, 1]) }] }]}>
      <Svg width="100%" height="100%" viewBox="0 0 480 480"><Defs><RadialGradient id="launchGlow"><Stop offset="0" stopColor="#DF4546" stopOpacity="0.46" /><Stop offset="0.46" stopColor="#8C2459" stopOpacity="0.15" /><Stop offset="1" stopColor={LAUNCH_BACKGROUND} stopOpacity="0" /></RadialGradient></Defs><Rect width="480" height="480" fill="url(#launchGlow)" /></Svg>
    </Animated.View>}
    {!reduceTransparency && beams.map(({ x, color, width, strength }, index) => {
      const delay = (index % 4) * 0.013 + Math.abs(x) / 2400;
      const opacity = at([0, 0.1 + delay, 0.3 + delay, 0.51 + delay / 2, 0.79, 1], [0, 0, strength * 0.46, strength, 0, 0]);
      const gradientId = `launchBeam${index}`;
      return <Animated.View key={x} style={[styles.beam, { width: width * 3, marginLeft: -width * 1.5, opacity, transform: [{ translateX: at([0, 0.27, 0.44, 0.79, 1], [x, x * 0.6, x * 0.4, x * 3.4, x * 3.4]) }, { scaleY: at([0, 0.12 + delay, 0.45, 0.7, 1], [0.08, 0.08, 0.94, 1.1, 1.1]) }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 30 600" preserveAspectRatio="none">
          <Defs><LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity="0" /><Stop offset="0.22" stopColor={color} stopOpacity="0.45" /><Stop offset="0.5" stopColor={color} /><Stop offset="0.78" stopColor={color} stopOpacity="0.45" /><Stop offset="1" stopColor={color} stopOpacity="0" /></LinearGradient></Defs>
          <Rect x="0" width="30" height="600" fill={`url(#${gradientId})`} opacity="0.08" />
          <Rect x="9" width="12" height="600" fill={`url(#${gradientId})`} opacity="0.42" />
          <Rect x="14" width="2" height="600" fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>;
    })}
    <View style={styles.scene}>
      <Animated.View style={[styles.parcel, { opacity: parcelOpacity, transform: [{ scale: parcelScale }, { translateY: at([0, 0.15, 0.36, 1], [18, 0, -6, -6]) }] }]}>
        <Svg width={160} height={160} viewBox="0 0 160 160">
          <Path d="M80 17 137 47 137 111 80 143 23 111 23 47Z" fill="#341A24" stroke="#F06060" strokeWidth="2" strokeLinejoin="round" />
          <Path d="M23 47 80 79V143L23 111Z" fill="#47232C" />
          <Path d="M23 47 80 79 137 47M80 79V143M52 32 109 63V77" fill="none" stroke="#FF9D91" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Two small labels sit on the parcel faces, in the same perspective as the box. */}
          <G transform="matrix(1 0.56 0 1 36 74)">
            <Rect x="-1.5" y="-1.5" width="33" height="23" rx="2" fill="#F3ECED" />
            <Rect width="30" height="20" fill="#FFFFFF" />
            {Array.from({ length: 7 }, (_, i) => <Rect key={i} y={i * 40 / 13} width="30" height={20 / 13} fill="#BE3341" />)}
            <Rect width="13.2" height={140 / 13} fill="#273F77" />
            <Path d={usStars} fill="#FFFFFF" />
          </G>
          <G transform="matrix(1 -0.56 0 1 94 105)">
            <Rect x="-1.5" y="-1.5" width="33" height="23" rx="2" fill="#F3ECED" />
            <Rect width="30" height="20" fill="#154697" />
            <Path d={euStars} fill="#FFDC49" />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.mark, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Image source={logo} style={styles.logo} resizeMode="contain" fadeDuration={0} />
      </Animated.View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', width: 480, height: 480, left: '50%', top: '50%', marginLeft: -240, marginTop: -292 },
  beam: { position: 'absolute', height: '100%', top: 0, left: '50%' },
  scene: { position: 'absolute', width: 240, height: 240, left: '50%', top: '50%', marginLeft: -120, marginTop: -172 },
  parcel: { position: 'absolute', width: 160, height: 160, left: 40, top: 40 },
  mark: { position: 'absolute', width: 160, height: 160, left: 40, top: 40 },
  logo: { width: '100%', height: '100%' },
});
