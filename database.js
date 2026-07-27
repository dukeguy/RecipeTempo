import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

let db = null;

// Fetch all saved recipes ordered by most recently created along with their ingredients and steps
export async function getAllRecipes() {
  try {
    const database = await getDatabase();
    const recipes = await database.getAllAsync(`SELECT * FROM recipes ORDER BY created_at DESC;`);
    
    const recipesWithDetails = await Promise.all(
      recipes.map(async (recipe) => {
        const ingredients = await database.getAllAsync(
          `SELECT id, name FROM ingredients WHERE recipe_id = ?;`,
          [recipe.id]
        );
        const steps = await database.getAllAsync(
          `SELECT id, title, instruction, start_offset, duration, lane_index FROM steps WHERE recipe_id = ? ORDER BY start_offset ASC;`,
          [recipe.id]
        );
        return {
          ...recipe,
          ingredients,
          steps,
        };
      })
    );

    console.log('DATABASE: Fetched recipes with details successfully:', recipesWithDetails);
    return recipesWithDetails;
  } catch (error) {
    console.error('DATABASE ERROR in getAllRecipes:', error);
    return [];
  }
}

// Initialize or retrieve the SQLite database connection and ensure tables and columns exist
export async function getDatabase() {
  if (!db) {
    db = await SQLite.openDatabaseAsync('recipes.db');
    
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        created_at INTEGER,
        is_favorite INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER,
        name TEXT NOT NULL,
        FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER,
        title TEXT,
        instruction TEXT,
        start_offset INTEGER,
        duration INTEGER,
        lane_index INTEGER,
        FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
      );
    `);

    // Migration check: ensure created_at column exists
    try {
      await db.execAsync(`ALTER TABLE recipes ADD COLUMN created_at INTEGER;`);
    } catch (e) {
      // Column already exists, ignore error
    }

    // Migration check: ensure is_favorite column exists
    try {
      await db.execAsync(`ALTER TABLE recipes ADD COLUMN is_favorite INTEGER DEFAULT 0;`);
    } catch (e) {
      // Column already exists, ignore error
    }
    
    // Backfill any existing rows missing a timestamp
    try {
      await db.runAsync(`UPDATE recipes SET created_at = ? WHERE created_at IS NULL OR created_at = '';`, [Date.now()]);
    } catch (e) {
      console.error('DATABASE ERROR backfilling created_at:', e);
    }
  }
  return db;
}

// Kept for backward compatibility if called explicitly elsewhere
export async function initDatabase() {
  await getDatabase();
}

// Fetch a single recipe along with its ingredients and steps by ID
export async function getRecipeWithDetails(recipeId) {
  const database = await getDatabase();
  
  const recipeResult = await database.getFirstAsync(
    `SELECT * FROM recipes WHERE id = ?;`,
    [recipeId]
  );

  if (!recipeResult) return null;

  const ingredients = await database.getAllAsync(
    `SELECT id, name FROM ingredients WHERE recipe_id = ?;`,
    [recipeId]
  );

  const steps = await database.getAllAsync(
    `SELECT id, title, instruction, start_offset, duration, lane_index FROM steps WHERE recipe_id = ? ORDER BY start_offset ASC;`,
    [recipeId]
  );

  return {
    ...recipeResult,
    ingredients,
    steps,
  };
}

// Create a new recipe along with its ingredients and timeline steps
export async function createRecipeWithDetails(title, description, ingredients, steps, is_favorite = 0) {
  const database = await getDatabase();
  let newRecipeId = null;

  try {
    await database.withTransactionAsync(async () => {
      const now = Date.now();
      const result = await database.runAsync(
        `INSERT INTO recipes (title, description, created_at, is_favorite) VALUES (?, ?, ?, ?);`,
        [title, description || '', now, is_favorite ? 1 : 0]
      );
      newRecipeId = result.lastInsertRowId;
      console.log('DATABASE: Inserted recipe with ID:', newRecipeId, 'at timestamp:', now);

      if (ingredients && ingredients.length > 0) {
        for (const ing of ingredients) {
          await database.runAsync(
            `INSERT INTO ingredients (recipe_id, name) VALUES (?, ?);`,
            [newRecipeId, ing.name]
          );
        }
      }

      if (steps && steps.length > 0) {
        for (const step of steps) {
          await database.runAsync(
            `INSERT INTO steps (recipe_id, title, instruction, start_offset, duration, lane_index) VALUES (?, ?, ?, ?, ?, ?);`,
            [
              newRecipeId,
              step.title || '',
              step.instruction || '',
              step.start_offset || 0,
              step.duration || 10,
              step.lane_index || 0,
            ]
          );
        }
      }
    });
  } catch (error) {
    console.error('DATABASE ERROR in createRecipeWithDetails:', error);
    throw error;
  }

  return newRecipeId;
}

export const deleteRecipe = async (id) => {
  try {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM recipes WHERE id = ?;', [id]);
  } catch (error) {
    console.error('Error deleting recipe from database:', error);
    throw error;
  }
};

// Update an existing recipe, clearing and re-inserting its ingredients and steps
export async function updateRecipeWithDetails(recipeId, title, description, ingredients, steps, is_favorite) {
  const database = await getDatabase();

  await database.withTransactionAsync(async () => {
    if (is_favorite !== undefined) {
      await database.runAsync(
        `UPDATE recipes SET title = ?, description = ?, is_favorite = ? WHERE id = ?;`,
        [title, description || '', is_favorite ? 1 : 0, recipeId]
      );
    } else {
      await database.runAsync(
        `UPDATE recipes SET title = ?, description = ? WHERE id = ?;`,
        [title, description || '', recipeId]
      );
    }

    // Refresh ingredients
    await database.runAsync(`DELETE FROM ingredients WHERE recipe_id = ?;`, [recipeId]);
    if (ingredients && ingredients.length > 0) {
      for (const ing of ingredients) {
        await database.runAsync(
          `INSERT INTO ingredients (recipe_id, name) VALUES (?, ?);`,
          [recipeId, ing.name]
        );
      }
    }

    // Refresh steps
    await database.runAsync(`DELETE FROM steps WHERE recipe_id = ?;`, [recipeId]);
    if (steps && steps.length > 0) {
      for (const step of steps) {
        await database.runAsync(
          `INSERT INTO steps (recipe_id, title, instruction, start_offset, duration, lane_index) VALUES (?, ?, ?, ?, ?, ?);`,
          [
            recipeId,
            step.title || '',
            step.instruction || '',
            step.start_offset || 0,
            step.duration || 10,
            step.lane_index || 0,
          ]
        );
      }
    }
  });
}

// Export the database safely as a JSON backup file to bypass Android file-locking restrictions
export async function exportDatabase() {
  try {
    const recipes = await getAllRecipes();
    
    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      recipeCount: recipes.length,
      recipes,
    };

    const fileName = `recipes_backup_${Date.now()}.json`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backupData, null, 2));

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Export Recipes Database',
        UTI: 'public.json',
      });
    } else {
      throw new Error('Sharing is not available on this device.');
    }
  } catch (error) {
    console.error('DATABASE ERROR in exportDatabase:', error);
    throw error;
  }
}

// Import recipes from a JSON backup string and restore them into the database
export async function importDatabase(jsonString) {
  const database = await getDatabase();
  try {
    const data = JSON.parse(jsonString);
    if (!data.recipes || !Array.isArray(data.recipes)) {
      throw new Error('Invalid backup file format.');
    }

    await database.withTransactionAsync(async () => {
      await database.runAsync('DELETE FROM steps;');
      await database.runAsync('DELETE FROM ingredients;');
      await database.runAsync('DELETE FROM recipes;');

      for (const recipe of data.recipes) {
        const result = await database.runAsync(
          `INSERT INTO recipes (title, description, created_at, is_favorite) VALUES (?, ?, ?, ?);`,
          [
            recipe.title || '',
            recipe.description || '',
            recipe.created_at || recipe.createdAt || Date.now(),
            recipe.is_favorite ? 1 : 0,
          ]
        );
        const newRecipeId = result.lastInsertRowId;

        if (recipe.ingredients && recipe.ingredients.length > 0) {
          for (const ing of recipe.ingredients) {
            await database.runAsync(
              `INSERT INTO ingredients (recipe_id, name) VALUES (?, ?);`,
              [newRecipeId, ing.name]
            );
          }
        }

        if (recipe.steps && recipe.steps.length > 0) {
          for (const step of recipe.steps) {
            await database.runAsync(
              `INSERT INTO steps (recipe_id, title, instruction, start_offset, duration, lane_index) VALUES (?, ?, ?, ?, ?, ?);`,
              [
                newRecipeId,
                step.title || '',
                step.instruction || '',
                step.start_offset || step.startOffset || 0,
                step.duration || step.time || 10,
                step.lane_index || step.laneIndex || 0,
              ]
            );
          }
        }
      }
    });
    console.log('DATABASE: Imported database successfully');
  } catch (error) {
    console.error('DATABASE ERROR in importDatabase:', error);
    throw error;
  }
}