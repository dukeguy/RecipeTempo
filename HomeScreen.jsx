import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from './theme';
import { getAllRecipes, deleteRecipe, exportDatabase, importDatabase } from './database';
import Logo from './Logo';

let BannerAd = null;
let BannerAdSize = null;
let TestIds = null;
if (Platform.OS !== 'web') {
  const ads = require('react-native-google-mobile-ads');
  BannerAd = ads.BannerAd;
  BannerAdSize = ads.BannerAdSize;
  TestIds = ads.TestIds;
}

const adUnitId = Platform.OS !== 'web' ? (__DEV__ ? TestIds.BANNER : 'ca-app-pub-xxxxxxxx/xxxxxxxxxx') : '';

export default function HomeScreen({ navigation }) {
  const [recipes, setRecipes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [])
  );

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const data = typeof getAllRecipes === 'function' ? await getAllRecipes() : [];
      const processedData = data.map((item, index) => {
        let rawSteps = item.steps || item.instructions || item.cooking_steps;
        let parsedSteps = rawSteps;
        if (typeof parsedSteps === 'string') {
          try {
            parsedSteps = JSON.parse(parsedSteps);
          } catch (e) {
            parsedSteps = [];
          }
        }

        let rawIngredients = item.ingredients || item.recipe_ingredients;
        let parsedIngredients = rawIngredients;
        if (typeof parsedIngredients === 'string') {
          try {
            parsedIngredients = JSON.parse(parsedIngredients);
          } catch (e) {
            parsedIngredients = [];
          }
        }

        const rawDate = item.created_at ?? item.createdAt ?? item.date_added ?? item.dateAdded;
        const isRawDateValid = 
          rawDate != null && 
          rawDate !== '' && 
          !isNaN(new Date(typeof rawDate === 'number' && rawDate < 10000000000 ? rawDate * 1000 : rawDate).getTime());

        return {
          ...item,
          ingredients: Array.isArray(parsedIngredients) ? parsedIngredients : [],
          steps: Array.isArray(parsedSteps) ? parsedSteps : [],
          created_at: isRawDateValid ? rawDate : Date.now() - index * 1000,
          is_favorite: item.is_favorite === 1 || item.is_favorite === true || item.isFavorite === true,
        };
      });
      setRecipes(processedData);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecipe = (recipeId, recipeTitle) => {
    if (recipeId === undefined || recipeId === null) {
      Alert.alert('Error', 'Cannot delete this recipe because its ID is missing.');
      return;
    }

    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${recipeTitle || 'this recipe'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              }
              await deleteRecipe(recipeId);
              await loadRecipes();
            } catch (error) {
              console.error('Failed to delete recipe:', error);
              Alert.alert('Error', error.message || 'Failed to delete the recipe.');
            }
          },
        },
      ]
    );
  };

  const handleExportRecipe = async (recipe) => {
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const safeTitle = (recipe.title || 'recipe').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `${safeTitle}_recipetempo.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(recipe, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `Export ${recipe.title || 'Recipe'} JSON`,
          UTI: 'public.json',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (error) {
      console.error('Failed to export recipe JSON:', error);
      Alert.alert('Error', 'Failed to export recipe JSON.');
    }
  };

  const handleExportDatabase = async () => {
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await exportDatabase();
    } catch (error) {
      console.error('Failed to export database:', error);
      Alert.alert('Error', error.message || 'Failed to export the database.');
    }
  };

  const handleImportDatabase = async () => {
    Alert.alert(
      'Import Database',
      'Importing a database will remove all existing recipes and replace them with the backup. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed',
          style: 'destructive',
          onPress: async () => {
            try {
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              const result = await DocumentPicker.getDocumentAsync({
                type: ['application/json', '*/*'],
                copyToCacheDirectory: false,
              });

              if (result.canceled) {
                return;
              }

              const pickedUri = result.assets ? result.assets[0].uri : result.uri;
              const localUri = `${FileSystem.cacheDirectory}import_temp.json`;

              const fileInfo = await FileSystem.getInfoAsync(localUri);
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(localUri);
              }

              await FileSystem.copyAsync({ from: pickedUri, to: localUri });
              const fileContent = await FileSystem.readAsStringAsync(localUri);

              await importDatabase(fileContent);
              await loadRecipes();
              Alert.alert('Success', 'Database imported successfully!');
            } catch (error) {
              console.error('Failed to import database:', error);
              Alert.alert('Error', error.message || 'Failed to import the database backup.');
            }
          },
        },
      ]
    );
  };

  const handleToggleFavorite = (recipeId) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRecipes((prevRecipes) =>
      prevRecipes.map((item) =>
        item.id === recipeId ? { ...item, is_favorite: !item.is_favorite } : item
      )
    );
  };

  const calculateTotalDuration = (steps) => {
    if (!steps || !Array.isArray(steps) || steps.length === 0) return 0;
    return steps.reduce(
      (max, s) => {
        const start = s.start_offset ?? s.startOffset ?? s.offset ?? 0;
        const dur = s.duration ?? s.time ?? s.length ?? 10;
        return Math.max(max, start + dur);
      },
      0
    );
  };

  const formatDate = (dateInput) => {
    if (dateInput == null) return 'Recently';
    let date;
    if (typeof dateInput === 'number') {
      date = new Date(dateInput < 10000000000 ? dateInput * 1000 : dateInput);
    } else {
      date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) return 'Recently';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredRecipes = recipes.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    
    if (showFavoritesOnly && !item.is_favorite) {
      return false;
    }

    if (!query) return true;

    const matchTitle = item.title?.toLowerCase().includes(query);
    const matchDesc = item.description?.toLowerCase().includes(query);
    const matchIngredients = Array.isArray(item.ingredients) && item.ingredients.some((ing) =>
      ing.name?.toLowerCase().includes(query)
    );

    return matchTitle || matchDesc || matchIngredients;
  });

  const sortedRecipes = [...filteredRecipes].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
    if (sortBy === 'oldest') {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    }
    if (sortBy === 'title') {
      return (a.title || '').localeCompare(b.title || '');
    }
    if (sortBy === 'duration') {
      return calculateTotalDuration(a.steps) - calculateTotalDuration(b.steps);
    }
    return 0;
  });

  const highlightText = (text, query) => {
    if (!text || !query.trim()) return text;
    const queryTrimmed = query.trim();
    const regex = new RegExp(`(${queryTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => {
      if (part.toLowerCase() === queryTrimmed.toLowerCase()) {
        return (
          <Text key={`hl-${i}`} style={styles.highlightedText}>
            {part}
          </Text>
        );
      }
      return part;
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.screenWrapper}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Logo size={24} showText={true} />
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.exportDbBtn}
              onPress={handleImportDatabase}
            >
              <Text style={styles.exportDbBtnText}>Import DB</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exportDbBtn}
              onPress={handleExportDatabase}
            >
              <Text style={styles.exportDbBtnText}>Export DB</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                navigation.navigate('RecipeEdit');
              }}
            >
              <Text style={styles.createBtnText}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes or ingredients..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.toolbarContainer}>
          <TouchableOpacity
            style={[styles.filterChip, showFavoritesOnly && styles.filterChipActive]}
            onPress={() => {
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setShowFavoritesOnly(!showFavoritesOnly);
            }}
          >
            <Text style={[styles.filterChipText, showFavoritesOnly && styles.filterChipTextActive]}>
              ⭐ Favorites
            </Text>
          </TouchableOpacity>

          <View style={styles.sortGroup}>
            <Text style={styles.sortLabel}>Sort:</Text>
            {[
              { key: 'newest', label: 'New' },
              { key: 'title', label: 'A-Z' },
              { key: 'duration', label: 'Time' },
            ].map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.sortBtn, sortBy === s.key && styles.sortBtnActive]}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setSortBy(s.key);
                }}
              >
                <Text style={[styles.sortBtnText, sortBy === s.key && styles.sortBtnTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : recipes.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No saved recipes yet.</Text>
            <Text style={styles.emptySubText}>Tap "+ New" above to get started!</Text>
          </View>
        ) : sortedRecipes.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No matching recipes found.</Text>
            <Text style={styles.emptySubText}>Try adjusting your search or filters.</Text>
          </View>
        ) : (
          <FlatList
            data={sortedRecipes}
            keyExtractor={(item) => (item.id ? item.id.toString() : Math.random().toString())}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => {
              const totalMins = calculateTotalDuration(item.steps);
              const stepCount = item.steps?.length || 0;
              const query = searchQuery.toLowerCase().trim();

              const matchingIngredients = query
                ? (item.ingredients || []).filter((ing) =>
                    ing.name?.toLowerCase().includes(query)
                  )
                : [];

              return (
                <View style={styles.recipeCard}>
                  <TouchableOpacity
                    style={styles.cardMain}
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      navigation.navigate('RecipeView', {
                        recipeId: item.id,
                        title: item.title,
                        description: item.description,
                        ingredients: item.ingredients || [],
                        steps: item.steps || [],
                      });
                    }}
                  >
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.recipeCardTitle}>
                        {highlightText(item.title, searchQuery)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleToggleFavorite(item.id)}
                        style={styles.favoriteBtn}
                      >
                        <Text style={styles.favoriteIcon}>{item.is_favorite ? '⭐' : '☆'}</Text>
                      </TouchableOpacity>
                    </View>

                    {item.description ? (
                      <Text style={styles.recipeCardDesc} numberOfLines={2}>
                        {highlightText(item.description, searchQuery)}
                      </Text>
                    ) : null}

                    <Text style={styles.recipeCardMeta}>
                      ⏱ {totalMins} mins • {stepCount} {stepCount === 1 ? 'step' : 'steps'} • Added {formatDate(item.created_at)}
                    </Text>

                    {matchingIngredients.length > 0 && (
                      <View style={styles.ingredientMatchContainer}>
                        <Text style={styles.ingredientMatchLabel}>Matching Ingredient: </Text>
                        <Text style={styles.ingredientMatchText} numberOfLines={1}>
                          {matchingIngredients.map((ing, idx) => (
                            <React.Fragment key={`match-${idx}`}>
                              {idx > 0 ? ', ' : ''}
                              {highlightText(ing.name, searchQuery)}
                              {ing.amount ? ` (${ing.amount} ${ing.unit || ''})` : ''}
                            </React.Fragment>
                          ))}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.exportBtn}
                      onPress={() => handleExportRecipe(item)}
                    >
                      <Text style={styles.exportBtnText}>Export</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        navigation.navigate('RecipeEdit', { recipe: item });
                      }}
                    >
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteRecipe(item.id, item.title)}
                    >
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Pinned Bottom Banner Ad */}
        {Platform.OS !== 'web' && (
          <View style={styles.bannerContainer}>
            <BannerAd
              unitId={adUnitId}
              size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
              requestOptions={{
                requestNonPersonalizedAdsOnly: true,
              }}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  exportDbBtn: {
    backgroundColor: COLORS.cardSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
  },
  exportDbBtnText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 11,
  },
  createBtn: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  createBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 11 },
  searchContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: COLORS.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSecondary,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.cardSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 22,
    top: 14,
    padding: 4,
  },
  clearSearchText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  toolbarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSecondary,
  },
  filterChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: COLORS.cardSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  filterChipText: { fontSize: 11, fontWeight: '700', color: COLORS.textPrimary },
  filterChipTextActive: { color: COLORS.white },
  sortGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginRight: 2 },
  sortBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: COLORS.cardSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
  },
  sortBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  sortBtnText: { fontSize: 10, fontWeight: '700', color: COLORS.textPrimary },
  sortBtnTextActive: { color: COLORS.white },
  highlightedText: {
    backgroundColor: COLORS.cardSecondary,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  favoriteBtn: {
    padding: 4,
  },
  favoriteIcon: {
    fontSize: 14,
  },
  ingredientMatchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    backgroundColor: COLORS.cardSecondary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
  },
  ingredientMatchLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  ingredientMatchText: {
    fontSize: 10,
    color: COLORS.textPrimary,
    flex: 1,
  },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  emptySubText: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  listContainer: { padding: 10, paddingBottom: 70 },
  recipeCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardMain: { flex: 1, marginRight: 8 },
  recipeCardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  recipeCardMeta: { fontSize: 10, fontWeight: '600', color: COLORS.primary, marginTop: 4, marginBottom: 3 },
  recipeCardDesc: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  cardActions: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  exportBtn: {
    backgroundColor: COLORS.cardSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
  },
  exportBtnText: { color: COLORS.primaryDark || COLORS.primary, fontWeight: '700', fontSize: 11 },
  editBtn: {
    backgroundColor: COLORS.cardSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
  },
  editBtnText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 11 },
  deleteBtn: {
    backgroundColor: '#fdf2f2',
    borderWidth: 1,
    borderColor: '#f5c6cb',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
  },
  deleteBtnText: { color: COLORS.danger, fontWeight: '700', fontSize: 11 },
  bannerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});