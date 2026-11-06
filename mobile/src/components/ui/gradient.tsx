import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

export interface GradientStop {
  offset: number;
  color: string;
  opacity?: number;
}

/** An SVG id that is valid in `url(#…)` on every platform (React's ids carry colons/guillemets). */
function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * The direction of a CSS `linear-gradient(<angle>deg, …)` as SVG
 * objectBoundingBox end points: 0deg points up, 90deg right, clockwise.
 */
function cssAngle(degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const dx = Math.sin(radians) / 2;
  const dy = -Math.cos(radians) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

/**
 * Linear gradients filling their parent, painted in order (later layers on
 * top) — CSS's stacked `background: linear-gradient(…), linear-gradient(…)`,
 * listed bottom layer first. Drawn with react-native-svg, which every build
 * already has, so no new native module is needed.
 */
export function LinearGradientFill({ layers }: { layers: { angle: number; stops: GradientStop[] }[] }) {
  const id = useSvgId("lg");
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          {layers.map((layer, i) => (
            <LinearGradient key={i} id={`${id}-${i}`} {...cssAngle(layer.angle)}>
              {layer.stops.map((stop, j) => (
                <Stop key={j} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity ?? 1} />
              ))}
            </LinearGradient>
          ))}
        </Defs>
        {layers.map((_, i) => (
          <Rect key={i} width="100%" height="100%" fill={`url(#${id}-${i})`} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * A soft radial glow filling its parent: CSS `radial-gradient(circle at
 * <cx> <cy>, color, transparent <fade>)` — sized to the farthest corner as
 * CSS does.
 */
export function RadialGlow({ color, opacity, cx = 0.3, cy = 0.3, fade = 0.7 }: { color: string; opacity: number; cx?: number; cy?: number; fade?: number }) {
  const id = useSvgId("rg");
  const radius = Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy));
  return (
    <Svg width="100%" height="100%" pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} r={radius} fx={cx} fy={cy}>
          <Stop offset={0} stopColor={color} stopOpacity={opacity} />
          <Stop offset={fade} stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
