import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Line } from 'react-native-svg';
import { COLORS } from './theme';

export default function Logo({ size = 28, showText = true }) {
  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        {/* Background rounded container */}
        <Rect width="32" height="32" rx="8" fill={COLORS.primaryDark || COLORS.primary} />
        
        {/* Lane 1 (Top Timeline Track) */}
        <Line x1="7" y1="11" x2="25" y2="11" stroke={COLORS.white} strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
        <Circle cx="11" cy="11" r="2" fill={COLORS.white} />

        {/* Lane 2 (Bottom Timeline Track - Staggered Tempo) */}
        <Line x1="7" y1="21" x2="25" y2="21" stroke={COLORS.white} strokeWidth="2.5" strokeLinecap="round" />
        <Circle cx="21" cy="21" r="2" fill={COLORS.white} />

        {/* Community Connection Node (Vertical link between lanes representing shared dataset) */}
        <Line x1="16" y1="11" x2="16" y2="21" stroke={COLORS.white} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.8" />
        <Circle cx="16" cy="16" r="2.5" fill={COLORS.cardBackground || '#FFF'} />
      </Svg>

      {showText && (
        <View style={styles.textContainer}>
          <Text style={styles.brandText}>
            Recipe<Text style={[styles.brandTextTempo, { color: COLORS.primaryDark || COLORS.primary }]}>Tempo</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textContainer: {
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  brandTextTempo: {
    fontWeight: '900',
  },
});