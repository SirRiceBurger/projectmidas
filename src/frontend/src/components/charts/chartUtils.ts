/**
 * Shared chart utility constants for all recharts components.
 *
 * The recharts tick prop accepts TextProps (SVG element props), not React.CSSProperties.
 * We must not pass the full CSSProperties type to avoid type incompatibility with
 * alignmentBaseline. These exported helpers have the right types.
 */

/** Style object for <div>/<span> with monospace font — valid React.CSSProperties */
export const monoStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
};

/**
 * SVG-compatible tick props for recharts XAxis/YAxis.
 * Cast to any to avoid alignmentBaseline incompatibility between React CSS and SVG types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AXIS_TICK: any = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
  fill: 'rgba(255,255,255,0.5)',
};

/**
 * Muted fill version for row-label axes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AXIS_TICK_MUTED: any = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
  fill: 'rgba(255,255,255,0.65)',
};
