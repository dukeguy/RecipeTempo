import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  StatusBar,
  Dimensions,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import * as Speech from 'expo-speech';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getRecipeWithDetails } from './database';

export default function LiveCookScreen({ route, navigation }) {
  const { 
    recipeId, 
    recipe: initialRecipe, 
    title: propTitle, 
    description: propDesc, 
    ingredients: propIngs, 
    steps: propSteps = [], 
    liveCookState 
  } = route.params || {};

  const targetId = recipeId || initialRecipe?.id || route.params?.id;

  const [recipeData, setRecipeData] = useState({
    title: propTitle || initialRecipe?.title || 'Recipe',
    description: propDesc || initialRecipe?.description || '',
    ingredients: propIngs || initialRecipe?.ingredients || [],
    steps: propSteps.length > 0 ? propSteps : (initialRecipe?.steps || []),
  });

  const [loading, setLoading] = useState(recipeData.steps.length === 0 && Boolean(targetId));
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(liveCookState?.elapsedSeconds || 0);
  const [speed, setSpeed] = useState(1);
  const [scale, setScale] = useState(12);
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState(true);
  const [isKeepAwakeEnabled, setIsKeepAwakeEnabled] = useState(true);

  const [currentScrollX, setCurrentScrollX] = useState(liveCookState?.scrollX || 0);
  const [currentScrollY, setCurrentScrollY] = useState(liveCookState?.scrollY || 0);

  const verticalScrollRef = useRef(null);
  const horizontalScrollRef = useRef(null);
  const alertedStepsRef = useRef(new Set());

  // Fetch recipe details from database if steps are missing from route params
  useEffect(() => {
    async function fetchRecipeDetails() {
      if (recipeData.steps.length === 0 && targetId) {
        try {
          setLoading(true);
          const fullRecipe = await getRecipeWithDetails(targetId);
          if (fullRecipe) {
            setRecipeData({
              title: fullRecipe.title || 'Recipe',
              description: fullRecipe.description || '',
              ingredients: fullRecipe.ingredients || [],
              steps: fullRecipe.steps || [],
            });
          }
        } catch (error) {
          console.error('Failed to load recipe for live cook:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    }
    fetchRecipeDetails();
  }, [targetId]);

  const { title, steps } = recipeData;

  // Manage keep-awake state imperatively based on toggle and screen lifecycle
  useEffect(() => {
    async function manageKeepAwake() {
      if (isKeepAwakeEnabled) {
        await activateKeepAwakeAsync();
      } else {
        deactivateKeepAwake();
      }
    }
    manageKeepAwake();

    return () => {
      deactivateKeepAwake();
    };
  }, [isKeepAwakeEnabled]);

  useEffect(() => {
    if (liveCookState?.scrollY && verticalScrollRef.current) {
      setTimeout(() => {
        verticalScrollRef.current?.scrollTo({ y: liveCookState.scrollY, animated: false });
      }, 50);
    }
    if (liveCookState?.scrollX && horizontalScrollRef.current) {
      setTimeout(() => {
        horizontalScrollRef.current?.scrollTo({ x: liveCookState.scrollX, animated: false });
      }, 50);
    }
  }, []);

  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + speed);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  // Automatically turn audio off if speed is not 1x
  useEffect(() => {
    if (speed !== 1) {
      setAudioAlertsEnabled(false);
    }
  }, [speed]);

  const maxTime = Math.max(40, ...steps.map((s) => (s.start_offset || 0) + (s.duration || 10)));
  const totalChartHeight = maxTime * scale;
  const progressTop = (elapsedSeconds / 60) * scale;

  // Check for upcoming steps within the next 30 seconds
  useEffect(() => {
    if (!audioAlertsEnabled || !isPlaying) return;

    steps.forEach((step) => {
      const startSec = (step.start_offset || 0) * 60;
      const timeUntilStart = startSec - elapsedSeconds;
      const stepKey = step.id || step.title;

      if (timeUntilStart > 0 && timeUntilStart <= 30 && !alertedStepsRef.current.has(stepKey)) {
        alertedStepsRef.current.add(stepKey);
        
        try {
          Speech.speak(`Upcoming step: ${step.title || 'Next step'} in 30 seconds`, {
            rate: 1.0,
            pitch: 1.0,
          });
        } catch (error) {
          console.log('Audio alert error:', error);
        }
      }
    });
  }, [elapsedSeconds, isPlaying, audioAlertsEnabled, steps]);

  // Auto-scroll timeline to follow progress line while leaving room for upcoming steps
  useEffect(() => {
    if (isPlaying && verticalScrollRef.current) {
      const targetY = Math.max(0, progressTop - 120);
      verticalScrollRef.current.scrollTo({ y: targetY, animated: true });
    }
  }, [elapsedSeconds, isPlaying, scale]);

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleBack = () => {
    setIsPlaying(false);
    const currentState = {
      elapsedSeconds,
      scrollX: currentScrollX,
      scrollY: currentScrollY,
    };

    const state = navigation.getState();
    if (state && state.routes && state.routes.length > 1) {
      const prevRoute = state.routes[state.routes.length - 2];
      navigation.navigate(
        prevRoute.name,
        {
          ...prevRoute.params,
          liveCookState: currentState,
        },
        { merge: true }
      );
    } else {
      navigation.goBack();
    }
  };

  const handleStepPress = (step) => {
    setIsPlaying(false);
    const startSec = (step.start_offset || 0) * 60;
    setElapsedSeconds(startSec);
    if (verticalScrollRef.current) {
      const targetY = Math.max(0, (step.start_offset || 0) * scale - 120);
      verticalScrollRef.current.scrollTo({ y: targetY, animated: true });
    }
  };

  useEffect(() => {
    const backAction = () => {
      handleBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [elapsedSeconds, currentScrollX, currentScrollY]);

  const existingLaneIndices = steps.map((s) => s.lane_index ?? 0);
  const maxExistingLane = existingLaneIndices.length > 0 ? Math.max(...existingLaneIndices) : 0;
  const targetMaxLane = Math.max(1, maxExistingLane);
  const lanes = Array.from({ length: targetMaxLane + 1 }, (_, i) => i);

  // Fit lanes to screen width dynamically
  const windowWidth = Dimensions.get('window').width;
  const availableTimelineWidth = Math.max(200, windowWidth - 70);
  const laneWidth = Math.max(90, availableTimelineWidth / lanes.length);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#5A7D6A" />
          <Text style={styles.loadingText}>Loading live cook...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screenWrapper}>
        {/* Pinned Top Menu / Controls */}
        <View style={styles.pinnedHeaderContainer}>
          <View style={styles.headerCard}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
              <Text style={styles.liveTimerText}>
                {isPlaying ? `Playing (${speed}x)` : 'Paused'} — {formatTimer(elapsedSeconds)}
              </Text>
            </View>

            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[styles.controlBtn, isPlaying ? styles.pauseBtn : styles.playBtn]}
                onPress={() => setIsPlaying(!isPlaying)}
              >
                <Text style={styles.controlBtnText}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.resetBtn} 
                onPress={() => { 
                  setIsPlaying(false); 
                  setElapsedSeconds(0); 
                  setCurrentScrollX(0); 
                  setCurrentScrollY(0); 
                  alertedStepsRef.current.clear();
                }}
              >
                <Text style={styles.controlBtnText}>🔄 Reset</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Speed Selector, Keep-Awake & Audio Alert Toolbar */}
          <View style={styles.speedToolbar}>
            <View style={styles.speedGroup}>
              <Text style={styles.speedLabel}>Speed:</Text>
              {[1, 2, 10, 60].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.speedOptionBtn, speed === s && styles.speedOptionBtnActive]}
                  onPress={() => setSpeed(s)}
                >
                  <Text style={[styles.speedOptionText, speed === s && styles.speedOptionTextActive]}>
                    {s}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.toolbarToggleGroup}>
              {/* Keep Screen On Toggle Button */}
              <TouchableOpacity
                style={[styles.audioToggleBtn, isKeepAwakeEnabled && styles.keepAwakeToggleBtnActive]}
                onPress={() => setIsKeepAwakeEnabled(!isKeepAwakeEnabled)}
              >
                <Text style={[styles.audioToggleText, isKeepAwakeEnabled && styles.keepAwakeToggleTextActive]}>
                  {isKeepAwakeEnabled ? '📱 Keep Screen: On' : '📱 Keep Screen: Off'}
                </Text>
              </TouchableOpacity>

              {/* Audio Alerts Toggle Button */}
              <TouchableOpacity
                style={[styles.audioToggleBtn, audioAlertsEnabled && styles.audioToggleBtnActive]}
                onPress={() => setAudioAlertsEnabled(!audioAlertsEnabled)}
              >
                <Text style={[styles.audioToggleText, audioAlertsEnabled && styles.audioToggleTextActive]}>
                  {audioAlertsEnabled ? '🔊 Audio: On' : '🔇 Audio: Off'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Scrollable Timeline Section */}
        <ScrollView
          ref={verticalScrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => setCurrentScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          <View style={styles.card}>
            <View style={styles.ganttSectionHeader}>
              <Text style={styles.sectionLabel}>Live Timeline ({steps.length} steps)</Text>
            </View>

            {steps.length === 0 ? (
              <View style={styles.emptyTimelineContainer}>
                <Text style={styles.emptyText}>No steps added yet.</Text>
              </View>
            ) : (
              <View style={styles.verticalGanttWrapper}>
                <View style={[styles.timeAxisSidebar, { height: totalChartHeight }]}>
                  <View style={[styles.timeAxisTrack, { height: totalChartHeight }]}>
                    {Array.from({ length: Math.ceil(maxTime / 5) + 1 }).map((_, i) => (
                      <Text key={i} style={[styles.axisMarker, { top: i * 5 * scale - 5 }]}>
                        {i * 5}m
                      </Text>
                    ))}
                  </View>
                </View>

                <ScrollView
                  ref={horizontalScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  style={styles.lanesScrollContainer}
                  onScroll={(e) => setCurrentScrollX(e.nativeEvent.contentOffset.x)}
                  scrollEventThrottle={16}
                >
                  <View style={styles.lanesWrapperRow}>
                    {lanes.map((laneIdx) => (
                      <View key={laneIdx} style={[styles.laneColumn, { width: laneWidth }]}>
                        <View style={[styles.laneTrack, { height: totalChartHeight }]} />
                      </View>
                    ))}

                    <View style={[styles.stepsOverlayContainer, { height: totalChartHeight }]} pointerEvents="box-none">
                      {steps.map((step) => {
                        const baseLane = step.lane_index ?? 0;
                        const baseOffset = step.start_offset || 0;
                        const baseDuration = step.duration || 10;
                        const blockHeight = Math.max(baseDuration * scale, 75);
                        const topPos = baseOffset * scale;
                        const leftPos = baseLane * (laneWidth + 4);

                        const startSec = baseOffset * 60;
                        const durationSec = baseDuration * 60;
                        const endSec = startSec + durationSec;
                        const isPassed = elapsedSeconds >= endSec;
                        const isActive = elapsedSeconds >= startSec && elapsedSeconds < endSec;

                        return (
                          <TouchableOpacity
                            key={step.id || Math.random()}
                            activeOpacity={0.8}
                            onPress={() => handleStepPress(step)}
                            style={[
                              styles.ganttBlockVertical,
                              isPassed && styles.ganttBlockPassed,
                              isActive && styles.ganttBlockActive,
                              {
                                width: laneWidth - 2,
                                height: blockHeight,
                                top: topPos,
                                left: leftPos,
                              },
                            ]}
                          >
                            <View style={styles.blockInnerContent}>
                              <View style={styles.blockHeaderRow}>
                                <View style={[
                                  styles.blockTitleTouch, 
                                  isPassed && styles.blockTitleTouchPassed,
                                  isActive && styles.blockTitleTouchActive
                                ]}>
                                  <Text style={[
                                    styles.blockTitleText, 
                                    isPassed && styles.strikethroughText,
                                    isActive && styles.blockTitleTextActive
                                  ]} numberOfLines={1}>
                                    {step.title || 'Step Title'}
                                  </Text>
                                </View>
                              </View>

                              <View style={[
                                styles.blockInstructionTouch, 
                                isPassed && styles.blockInstructionTouchPassed,
                                isActive && styles.blockInstructionTouchActive
                              ]}>
                                <Text style={[
                                  styles.blockInstructionText, 
                                  isPassed && styles.strikethroughText,
                                  isActive && styles.blockInstructionTextActive
                                ]}>
                                  {step.instruction || 'Instructions...'}
                                </Text>
                              </View>

                              <View style={styles.timeBadgeRow}>
                                <Text style={[
                                  styles.timeBadgeText, 
                                  isPassed && styles.strikethroughText,
                                  isActive && styles.timeBadgeTextActive
                                ]}>
                                  ⏱ {baseOffset}m | {baseDuration}m
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                      {/* Live Progression Line */}
                      {elapsedSeconds > 0 && (
                        <View style={[styles.progressLineContainer, { top: progressTop }]}>
                          <View style={styles.progressLine} />
                          <View style={styles.progressBadge}>
                            <Text style={styles.progressBadgeText}>{formatTimer(elapsedSeconds)}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF6F0',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  screenWrapper: { flex: 1, backgroundColor: '#FAF6F0' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF6F0' },
  loadingText: { color: '#5A655F', fontSize: 13, marginTop: 8, fontWeight: '600' },
  pinnedHeaderContainer: {
    paddingHorizontal: 6,
    paddingTop: 6,
    backgroundColor: '#FAF6F0',
    zIndex: 10,
  },
  scrollView: { flex: 1 },
  container: { padding: 6, paddingBottom: 50 },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D8D2C4',
    padding: 8,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    backgroundColor: '#F3EFEA',
    borderWidth: 1,
    borderColor: '#D8D2C4',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    marginRight: 8,
  },
  backBtnText: { color: '#4A5248', fontWeight: '700', fontSize: 11 },
  headerTitleContainer: { flex: 1, marginRight: 8 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: '#2C3531' },
  liveTimerText: { fontSize: 11, fontWeight: '700', color: '#5A7D6A', marginTop: 2 },
  controlsRow: { flexDirection: 'row', gap: 4 },
  playBtn: {
    backgroundColor: '#5A7D6A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  pauseBtn: {
    backgroundColor: '#D99B3D',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  resetBtn: {
    backgroundColor: '#7A847E',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
  },
  controlBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  controlBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  speedToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D8D2C4',
    padding: 6,
    marginBottom: 8,
  },
  speedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  speedLabel: { fontSize: 11, fontWeight: '700', color: '#5A655F', marginRight: 2 },
  speedOptionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#F3EFEA',
    borderWidth: 1,
    borderColor: '#D8D2C4',
  },
  speedOptionBtnActive: {
    backgroundColor: '#5A7D6A',
    borderColor: '#456151',
  },
  speedOptionText: { fontSize: 10, fontWeight: '700', color: '#4A5248' },
  speedOptionTextActive: { color: '#FFFFFF' },
  toolbarToggleGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  audioToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#F3EFEA',
    borderWidth: 1,
    borderColor: '#D8D2C4',
  },
  audioToggleBtnActive: {
    backgroundColor: '#5A7D6A',
    borderColor: '#456151',
  },
  keepAwakeToggleBtnActive: {
    backgroundColor: '#4A657D',
    borderColor: '#3B5268',
  },
  audioToggleText: { fontSize: 10, fontWeight: '700', color: '#4A5248' },
  audioToggleTextActive: { color: '#FFFFFF' },
  keepAwakeToggleTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D8D2C4',
    padding: 6,
    marginBottom: 8,
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#2C3531', marginTop: 2, marginBottom: 4 },
  emptyText: { fontSize: 11, color: '#9E988F', fontStyle: 'italic' },
  ganttSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyTimelineContainer: { marginBottom: 4 },
  verticalGanttWrapper: {
    flexDirection: 'row',
    backgroundColor: '#F3EFEA',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D8D2C4',
    padding: 2,
    marginTop: 4,
    position: 'relative',
  },
  timeAxisSidebar: {
    width: 26,
    borderRightWidth: 1,
    borderRightColor: '#D8D2C4',
    marginRight: 2,
    position: 'relative',
  },
  timeAxisTrack: { position: 'relative', width: '100%' },
  axisMarker: { position: 'absolute', fontSize: 7, color: '#8C948F', width: '100%', textAlign: 'center' },
  lanesScrollContainer: { flex: 1 },
  lanesWrapperRow: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 2,
    position: 'relative',
  },
  laneColumn: {},
  laneTrack: {
    backgroundColor: '#EBE6DE',
    borderRadius: 4,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#D8D2C4',
  },
  stepsOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  ganttBlockVertical: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#E8EFEA',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#B8C7BC',
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: 2,
  },
  ganttBlockPassed: {
    backgroundColor: '#F3EFEA',
    borderColor: '#D8D2C4',
    opacity: 0.65,
  },
  ganttBlockActive: {
    backgroundColor: '#E8EFEA',
    borderColor: '#5A7D6A',
    borderWidth: 2,
    zIndex: 10,
    shadowColor: '#5A7D6A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  blockInnerContent: {
    flex: 1,
  },
  blockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  blockTitleTouch: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8D2C4',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  blockTitleTouchPassed: {
    backgroundColor: '#E5E0D8',
    borderColor: '#D8D2C4',
  },
  blockTitleTouchActive: {
    backgroundColor: '#D5E2D8',
    borderColor: '#5A7D6A',
  },
  blockTitleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B5244',
  },
  blockTitleTextActive: {
    color: '#304237',
    fontWeight: '800',
  },
  blockInstructionTouch: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8D2C4',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 2,
    minHeight: 24,
    marginBottom: 1,
    flex: 1,
    justifyContent: 'flex-start',
  },
  blockInstructionTouchPassed: {
    backgroundColor: '#E5E0D8',
    borderColor: '#D8D2C4',
  },
  blockInstructionTouchActive: {
    backgroundColor: '#D5E2D8',
    borderColor: '#5A7D6A',
  },
  blockInstructionText: {
    fontSize: 9,
    color: '#5A655F',
  },
  blockInstructionTextActive: {
    color: '#2C3531',
    fontWeight: '600',
  },
  strikethroughText: {
    textDecorationLine: 'line-through',
    color: '#9E988F',
  },
  timeBadgeRow: {
    alignItems: 'flex-start',
  },
  timeBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#5A7D6A',
  },
  timeBadgeTextActive: {
    color: '#456151',
    fontWeight: '800',
  },
  progressLineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 99,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#C86D51',
  },
  progressBadge: {
    backgroundColor: '#C86D51',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 4,
  },
  progressBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
});