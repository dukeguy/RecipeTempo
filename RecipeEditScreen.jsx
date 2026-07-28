import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS } from './theme';
import { createRecipeWithDetails, updateRecipeWithDetails, getRecipeWithDetails } from './database';

// Safely stub BannerAd for web static rendering / bundling to prevent native-only codegen errors
let BannerAd = null;
let BannerAdSize = null;
let TestIds = null;

if (Platform.OS !== 'web') {
  try {
    const Ads = require('react-native-google-mobile-ads');
    BannerAd = Ads.BannerAd;
    BannerAdSize = Ads.BannerAdSize;
    TestIds = Ads.TestIds;
  } catch (e) {
    console.warn('Google Mobile Ads module not available or failed to load:', e);
  }
} else {
  BannerAd = () => null;
}

const adUnitId = __DEV__ && TestIds ? TestIds.BANNER : 'ca-app-pub-xxxxxxxx/xxxxxxxxxx';

// Helper to generate unique IDs without millisecond collisions
const generateId = () => Date.now() + Math.floor(Math.random() * 100000);

// Canonical snapshot helper to strip database-specific metadata and ensure precise change detection
const getCanonicalSnapshot = (t, d, ings, stps) => {
  return JSON.stringify({
    title: t || '',
    description: d || '',
    ingredients: (ings || []).map(i => ({ id: i.id, name: i.name || '' })),
    steps: (stps || []).map(s => ({
      id: s.id,
      title: s.title || '',
      instruction: s.instruction || '',
      start_offset: s.start_offset ?? 0,
      duration: s.duration ?? 10,
      lane_index: s.lane_index ?? 0,
    })),
  });
};

// Memoized component to prevent full-screen re-render hitching on drag/resize release
const DraggableStepBlock = React.memo(({
  step,
  scale,
  laneWidth,
  isSelected,
  setSelectedStepId,
  setIsDragging,
  commitMove,
  commitResize,
  handleDeleteStep,
  onOpenModal,
}) => {
  const baseLane = step.lane_index ?? 0;
  const baseOffset = step.start_offset || 0;
  const baseDuration = step.duration || 10;
  const initialHeight = Math.max(baseDuration * scale, 50);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(baseLane * (laneWidth + 6));
  const savedY = useSharedValue(baseOffset * scale);

  const blockHeight = useSharedValue(initialHeight);
  const [displayDuration, setDisplayDuration] = useState(baseDuration);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    savedX.value = (step.lane_index ?? 0) * (laneWidth + 6);
    savedY.value = (step.start_offset || 0) * scale;
  }, [step.lane_index, step.start_offset, laneWidth, scale]);

  useEffect(() => {
    blockHeight.value = Math.max((step.duration || 10) * scale, 50);
    setDisplayDuration(step.duration || 10);
  }, [step.duration, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: savedX.value + translateX.value },
      { translateY: savedY.value + translateY.value },
    ],
    height: blockHeight.value,
  }));

  const moveGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      runOnJS(setIsDragging)(true);
      runOnJS(setSelectedStepId)(step.id);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd(() => {
      savedX.value += translateX.value;
      savedY.value += translateY.value;
      translateX.value = 0;
      translateY.value = 0;

      const finalLane = Math.max(0, Math.round(savedX.value / (laneWidth + 6)));
      const finalOffset = Math.max(0, Math.round(savedY.value / scale));

      runOnJS(commitMove)(step.id, finalOffset, finalLane);
    })
    .onFinalize(() => {
      runOnJS(setIsDragging)(false);
    });

  const resizeGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      runOnJS(setIsDragging)(true);
      runOnJS(setIsResizing)(true);
      runOnJS(setSelectedStepId)(step.id);
    })
    .onUpdate((event) => {
      const newH = Math.max(35, initialHeight + event.translationY);
      blockHeight.value = newH;
      const calcDur = Math.max(5, Math.round(newH / scale));
      runOnJS(setDisplayDuration)(calcDur);
    })
    .onEnd(() => {
      const finalH = blockHeight.value;
      const finalDuration = Math.max(5, Math.round(finalH / scale));
      runOnJS(setIsResizing)(false);
      runOnJS(commitResize)(step.id, finalDuration);
    })
    .onFinalize(() => {
      runOnJS(setIsDragging)(false);
      runOnJS(setIsResizing)(false);
    });

  const currentBlockHeight = Math.max(displayDuration * scale, 75);
  const overhead = 32;
  const dynamicNumberOfLines = Math.max(1, Math.floor((currentBlockHeight - overhead) / 12));

  return (
    <Animated.View
      style={[
        styles.ganttBlockVertical,
        {
          width: laneWidth - 2,
          zIndex: isSelected ? 999 : 10,
        },
        animatedStyle,
        isSelected && styles.ganttBlockSelected,
      ]}
    >
      <GestureDetector gesture={moveGesture}>
        <View style={styles.dragHandleBar}>
          <Text style={styles.dragHandleText}>≡</Text>
        </View>
      </GestureDetector>

      <View style={styles.blockInnerContent}>
        <View style={styles.blockHeaderRow}>
          <TouchableOpacity
            style={styles.blockTitleTouch}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedStepId(step.id);
              onOpenModal(step.id, 'title', step.title);
            }}
          >
            <Text style={styles.blockTitleText} numberOfLines={1}>
              {step.title || 'Step Title'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteStep(step.id)}>
            <Text style={styles.blockDeleteText}>✕</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.blockInstructionTouch}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedStepId(step.id);
            onOpenModal(step.id, 'instruction', step.instruction);
          }}
        >
          <Text style={styles.blockInstructionText} numberOfLines={dynamicNumberOfLines}>
            {step.instruction || 'Instructions...'}
          </Text>
        </TouchableOpacity>

        <View style={styles.timeBadgeRow}>
          <Text style={styles.timeBadgeText}>
            ⏱ {baseOffset}m | {displayDuration}m {isResizing ? '(Resizing)' : ''}
          </Text>
        </View>
      </View>

      <GestureDetector gesture={resizeGesture}>
        <View style={[styles.resizeHandle, isResizing && styles.resizeHandleActive]}>
          <View style={styles.resizeHandleBarIndicator} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

export default function RecipeEditScreen({ route, navigation }) {
  const existingRecipe = route.params?.recipe;
  const paramRecipeId = route.params?.recipeId || existingRecipe?.id || null;

  const [recipeId] = useState(paramRecipeId);
  const [newIngName, setNewIngName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState(null);

  const initialIngs = existingRecipe?.ingredients
    ? existingRecipe.ingredients.map(i => ({ id: i.id, name: i.name || '' }))
    : [];
  const initialStps = existingRecipe?.steps
    ? existingRecipe.steps.map(s => ({
        id: s.id,
        title: s.title || '',
        instruction: s.instruction || '',
        start_offset: s.start_offset ?? 0,
        duration: s.duration ?? 10,
        lane_index: s.lane_index ?? 0,
      }))
    : [];

  const [title, setTitle] = useState(existingRecipe?.title || '');
  const [description, setDescription] = useState(existingRecipe?.description || '');
  const [ingredients, setIngredients] = useState(initialIngs);
  const [steps, setSteps] = useState(initialStps);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalStepId, setModalStepId] = useState(null);
  const [modalField, setModalField] = useState('title');
  const [modalTextValue, setModalTextValue] = useState('');

  const initialSnapshot = useRef(
    getCanonicalSnapshot(
      existingRecipe?.title,
      existingRecipe?.description,
      initialIngs,
      initialStps
    )
  );

  const [loadingRecipe, setLoadingRecipe] = useState(false);

  useEffect(() => {
    if (paramRecipeId && !existingRecipe) {
      loadFullRecipeData(paramRecipeId);
    }
  }, [paramRecipeId]);

  const loadFullRecipeData = async (id) => {
    try {
      setLoadingRecipe(true);
      const fullRec = await getRecipeWithDetails(id);
      if (fullRec) {
        setTitle(fullRec.title || '');
        setDescription(fullRec.description || '');
        const loadedIngs = (fullRec.ingredients || []).map(i => ({ id: i.id, name: i.name || '' }));
        const loadedStps = (fullRec.steps || []).map(s => ({
          id: s.id,
          title: s.title || '',
          instruction: s.instruction || '',
          start_offset: s.start_offset ?? 0,
          duration: s.duration ?? 10,
          lane_index: s.lane_index ?? 0,
        }));
        setIngredients(loadedIngs);
        setSteps(loadedStps);
        initialSnapshot.current = getCanonicalSnapshot(fullRec.title, fullRec.description, loadedIngs, loadedStps);
      }
    } catch (error) {
      console.error('Failed to load recipe details for editing:', error);
      Alert.alert('Error', 'Failed to load recipe for editing.');
    } finally {
      setLoadingRecipe(false);
    }
  };

  const handleAddIngredient = () => {
    if (!newIngName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients(prev => [...prev, { id: generateId(), name: newIngName.trim() }]);
    setNewIngName('');
  };

  const handleDeleteIngredient = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients(prev => prev.filter(i => i.id !== id));
  };

  const handleAddStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newStep = {
      id: generateId(),
      title: 'New Step',
      instruction: '',
      start_offset: 0,
      duration: 10,
      lane_index: 0,
    };
    setSteps(prev => [...prev, newStep]);
  };

  const handleDeleteStep = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const commitMove = useCallback((id, newOffset, newLane) => {
    setSteps(prev =>
      prev.map(s => (s.id === id ? { ...s, start_offset: newOffset, lane_index: newLane } : s))
    );
  }, []);

  const commitResize = useCallback((id, newDuration) => {
    setSteps(prev =>
      prev.map(s => (s.id === id ? { ...s, duration: newDuration } : s))
    );
  }, []);

  const openModalForStepField = useCallback((id, field, value) => {
    setModalStepId(id);
    setModalField(field);
    setModalTextValue(value || '');
    setModalVisible(true);
  }, []);

  const handleSaveModalText = () => {
    if (modalStepId !== null) {
      setSteps(prev =>
        prev.map(s => (s.id === modalStepId ? { ...s, [modalField]: modalTextValue } : s))
      );
    }
    setModalVisible(false);
    setModalStepId(null);
  };

  const handleSaveRecipe = async () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a recipe title.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (recipeId) {
        await updateRecipeWithDetails(recipeId, title.trim(), description.trim(), ingredients, steps);
      } else {
        await createRecipeWithDetails(title.trim(), description.trim(), ingredients, steps);
      }
      navigation.goBack();
    } catch (error) {
      console.error('Failed to save recipe:', error);
      Alert.alert('Error', error.message || 'Failed to save recipe.');
    }
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.screenWrapper} edges={['top', 'left', 'right']}>
        <View style={styles.screenWrapper}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{recipeId ? 'Edit Recipe' : 'New Recipe'}</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveRecipe}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          {loadingRecipe ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Recipe Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Sunday Roast"
                  placeholderTextColor={COLORS.textMuted}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Brief description..."
                  placeholderTextColor={COLORS.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Ingredients</Text>
                <View style={styles.rowInput}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Add ingredient..."
                    placeholderTextColor={COLORS.textMuted}
                    value={newIngName}
                    onChangeText={setNewIngName}
                  />
                  <TouchableOpacity style={styles.addBtn} onPress={handleAddIngredient}>
                    <Text style={styles.addBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
                {ingredients.map((ing) => (
                  <View key={ing.id} style={styles.listItemRow}>
                    <Text style={styles.listItemText}>• {ing.name}</Text>
                    <TouchableOpacity onPress={() => handleDeleteIngredient(ing.id)}>
                      <Text style={styles.deleteItemText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <View style={styles.formGroup}>
                <View style={styles.stepsHeaderRow}>
                  <Text style={styles.label}>Cooking Timeline Steps</Text>
                  <TouchableOpacity style={styles.addStepBtn} onPress={handleAddStep}>
                    <Text style={styles.addStepBtnText}>+ Add Step</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.hintText}>Tap step fields or configure steps below.</Text>

                {steps.length === 0 ? (
                  <Text style={styles.emptyStepsText}>No steps added yet.</Text>
                ) : (
                  <View style={styles.timelineContainer}>
                    {steps.map((st) => (
                      <View key={st.id} style={styles.stepPreviewCard}>
                        <View style={styles.blockHeaderRow}>
                          <TouchableOpacity
                            onPress={() => openModalForStepField(st.id, 'title', st.title)}
                          >
                            <Text style={styles.stepPreviewTitle}>{st.title || 'Untitled Step'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteStep(st.id)}>
                            <Text style={styles.blockDeleteText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          onPress={() => openModalForStepField(st.id, 'instruction', st.instruction)}
                        >
                          <Text style={styles.blockInstructionText} numberOfLines={2}>
                            {st.instruction || 'Tap to add instructions...'}
                          </Text>
                        </TouchableOpacity>
                        <Text style={styles.stepPreviewMeta}>
                          ⏱ Offset: {st.start_offset}m | Duration: {st.duration}m
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          )}

          {/* Modal for editing step text */}
          <Modal visible={modalVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Edit Step {modalField}</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { color: COLORS.textPrimary }]}
                  value={modalTextValue}
                  onChangeText={setModalTextValue}
                  multiline
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.cancelModalBtn]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.cancelModalBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.saveModalBtn]}
                    onPress={handleSaveModalText}
                  >
                    <Text style={styles.saveModalBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Pinned Bottom Banner Ad (Safely rendered on native platforms only) */}
          {Platform.OS !== 'web' && BannerAd && typeof BannerAd !== 'function' && (
            <BannerAd
              unitId={adUnitId}
              size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
              requestOptions={{
                requestNonPersonalizedAdsOnly: true,
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  screenWrapper: { flex: 1, backgroundColor: COLORS.background },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSecondary,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  backBtn: { padding: 4 },
  backBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  saveBtn: { backgroundColor: COLORS.primaryDark, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  saveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 12 },
  scrollContent: { padding: 14, paddingBottom: 80 },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.cardSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  textArea: { height: 70, textAlignVertical: 'top' },
  rowInput: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  addBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  addBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 12 },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    marginBottom: 4,
  },
  listItemText: { fontSize: 12, color: COLORS.textPrimary, flex: 1 },
  deleteItemText: { fontSize: 14, fontWeight: '700', color: COLORS.danger, paddingHorizontal: 6 },
  stepsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addStepBtn: { backgroundColor: COLORS.primaryDark, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  addStepBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  hintText: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 8 },
  emptyStepsText: { fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic', marginBottom: 6 },
  timelineContainer: { gap: 6 },
  stepPreviewCard: {
    backgroundColor: COLORS.cardBackground,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
  },
  stepPreviewTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  stepPreviewMeta: { fontSize: 11, color: COLORS.primary, marginTop: 4 },
  ganttBlockVertical: {
    position: 'absolute',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    overflow: 'hidden',
  },
  ganttBlockSelected: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  dragHandleBar: {
    height: 18,
    backgroundColor: COLORS.cardSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandleText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: 'bold' },
  blockInnerContent: { padding: 6, flex: 1 },
  blockHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockTitleTouch: { flex: 1 },
  blockTitleText: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  blockDeleteText: { fontSize: 12, color: COLORS.danger, fontWeight: '700' },
  blockInstructionTouch: { marginTop: 4 },
  blockInstructionText: { fontSize: 11, color: COLORS.textSecondary },
  timeBadgeRow: { marginTop: 'auto' },
  timeBadgeText: { fontSize: 10, color: COLORS.primary },
  resizeHandle: {
    height: 14,
    backgroundColor: COLORS.cardSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resizeHandleActive: { backgroundColor: COLORS.primary },
  resizeHandleBarIndicator: { width: 20, height: 3, backgroundColor: COLORS.borderPrimary, borderRadius: 2 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: COLORS.cardBackground, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: COLORS.borderPrimary },
  modalTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  modalBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  cancelModalBtn: { backgroundColor: COLORS.cardSecondary, borderWidth: 1, borderColor: COLORS.borderPrimary },
  cancelModalBtnText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 12 },
  saveModalBtn: { backgroundColor: COLORS.primaryDark },
  saveModalBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 12 },
});