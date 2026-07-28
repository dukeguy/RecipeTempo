import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SplashScreen from './SplashScreen';
import HomeScreen from './HomeScreen';
import RecipeEditScreen from './RecipeEditScreen';
import RecipeViewScreen from './RecipeViewScreen';
import LiveCookScreen from './LiveCookScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial loading or database initialization
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="Home"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen 
            name="Home" 
            component={HomeScreen} 
          />
          <Stack.Screen 
            name="RecipeEdit" 
            component={RecipeEditScreen} 
          />
          <Stack.Screen 
            name="RecipeView" 
            component={RecipeViewScreen} 
          />
          <Stack.Screen 
            name="LiveCookScreen" 
            component={LiveCookScreen} 
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}