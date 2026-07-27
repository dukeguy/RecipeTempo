import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { getRecipeWithDetails } from './database';

export default function RecipeViewScreen({ route, navigation }) {
  const { recipeId, liveCookState: initialLiveCookState } = route.params || {};
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveCookState, setLiveCookState] = useState(initialLiveCookState || null);

  const hasActiveResume = liveCookState && liveCookState.elapsedSeconds > 0;

  const handleBack = () => {
    if (hasActiveResume) {
      Alert.alert(
        'Active Timer',
        'Your live cook timer is running. If you go back to the main menu, the timer will be reset. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Main Menu',
            style: 'destructive',
            onPress: () => {
              navigation.navigate('Home');
            },
          },
        ]
      );
      return true;
    }

    navigation.navigate('Home');
    return true;
  };

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => backHandler.remove();
  }, [hasActiveResume]);

  const loadRecipe = async () => {
    if (!recipeId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await getRecipeWithDetails(recipeId);
      setRecipe(data);
    } catch (error) {
      Alert.alert('Error', 'Could not load recipe details.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadRecipe();
      if (route.params?.liveCookState) {
        setLiveCookState(route.params.liveCookState);
      }
    }, [recipeId, route.params?.liveCookState])
  );

  const handleStartLiveCook = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    navigation.navigate('LiveCookScreen', {
      recipeId: recipe.id,
      recipe,
      liveCookState,
    });
  };

  const handleRestartLiveCook = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    
    // Clear the local state
    setLiveCookState(null);
    
    // Navigate with a null state to reset the timer
    navigation.navigate('LiveCookScreen', {
      recipeId: recipe.id,
      recipe,
      liveCookState: null,
    });
  };

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading recipe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Recipe not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.topBarRow}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backBtnText}>← Main Menu</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRow}>
          <Text style={styles.title}>{recipe.title}</Text>
          <View style={styles.headerActionButtons}>
            <TouchableOpacity
              style={styles.liveCookBtn}
              onPress={handleStartLiveCook}
            >
              <Text style={styles.liveCookBtnText}>🔥 Live Cook</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch (e) {}
                navigation.navigate('RecipeEdit', { recipe });
              }}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {hasActiveResume && (
          <View style={styles.resumeContainer}>
            <TouchableOpacity style={styles.resumeBanner} onPress={handleStartLiveCook}>
              <Text style={styles.resumeBannerText}>
                ▶ Resume ({formatTimer(liveCookState.elapsedSeconds)})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.restartBanner} onPress={handleRestartLiveCook}>
              <Text style={styles.restartBannerText}>
                ↻ Restart
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {recipe.description ? (
          <Text style={styles.description}>{recipe.description}</Text>
        ) : null}

        <Text style={styles.sectionHeader}>Ingredients</Text>
        {recipe.ingredients && recipe.ingredients.length > 0 ? (
          recipe.ingredients.map((ing, idx) => (
            <View key={ing.id || idx} style={styles.ingredientRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.ingredientText}>{ing.name}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptySubText}>No ingredients listed.</Text>
        )}

        <Text style={styles.sectionHeader}>Timeline Steps</Text>
        {recipe.steps && recipe.steps.length > 0 ? (
          recipe.steps.map((step, idx) => (
            <View key={step.id || idx} style={styles.stepCard}>
              <View style={styles.stepHeaderRow}>
                <Text style={styles.stepTitle}>{step.title || `Step ${idx + 1}`}</Text>
                <Text style={styles.stepMeta}>
                  ⏱ {step.start_offset || 0}m ({step.duration || 10}m) | Lane {step.lane_index || 0}
                </Text>
              </View>
              <Text style={styles.stepInstruction}>{step.instruction}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptySubText}>No timeline steps added.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fdfbf7',
  },
  container: {
    flex: 1,
    backgroundColor: '#fdfbf7',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fdfbf7',
  },
  loadingText: {
    color: '#7c7265',
    fontSize: 16,
  },
  topBarRow: {
    marginBottom: 8,
  },
  backBtn: {
    backgroundColor: '#eae3d5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e6ded3',
  },
  backBtnText: {
    color: '#5c5346',
    fontWeight: '700',
    fontSize: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2c251e',
    flex: 1,
    marginRight: 8,
  },
  headerActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveCookBtn: {
    backgroundColor: '#c45c3d',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  liveCookBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  editBtn: {
    backgroundColor: '#eae3d5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editBtnText: {
    color: '#5c5346',
    fontWeight: '600',
    fontSize: 13,
  },
  resumeContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  resumeBanner: {
    flex: 1,
    backgroundColor: '#456151',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeBannerText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  restartBanner: {
    backgroundColor: '#8c8275',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartBannerText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  description: {
    fontSize: 14,
    color: '#5c5346',
    marginBottom: 16,
    lineHeight: 20,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3c342b',
    marginTop: 16,
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 14,
    color: '#c45c3d',
    marginRight: 8,
  },
  ingredientText: {
    fontSize: 14,
    color: '#2c251e',
  },
  emptySubText: {
    fontSize: 13,
    color: '#8c8275',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  stepCard: {
    backgroundColor: '#f4ede2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e6ded3',
  },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c251e',
  },
  stepMeta: {
    fontSize: 11,
    color: '#7c7265',
  },
  stepInstruction: {
    fontSize: 13,
    color: '#5c5346',
    lineHeight: 18,
  },
});