import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from './theme';
import Logo from './Logo';

export default function SplashScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Logo size={56} showText={true} />
        <Text style={styles.tagline}>Your rhythm, your recipes.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 10,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryDark || COLORS.primary,
    letterSpacing: 0.8,
    marginTop: 6,
  },
});