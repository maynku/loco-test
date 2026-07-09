import { BASE_URL } from './Constants'; // Agar file isi folder mein hai


//retry+globalstatemanagement+
import React, { useState, useEffect } from 'react'; 
import { View, TextInput, Button, Alert, ActivityIndicator, StyleSheet, Text } from 'react-native';
import axios from 'axios';
import io from 'socket.io-client';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🆕 Permanent storage ke liye

const BACKGROUND_TRACKING_TASK = 'BACKGROUND_BUS_TRACKING';
//url for ng rock https://demeritoriously-subaqua-belen.ngrok-free.dev
// 📡 Ziddi Socket Configuration Top-Level par
const socket = io(BASE_URL, {
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,             
  reconnectionAttempts: Infinity, 
  reconnectionDelay: 60000,    //2miinute k interval pr reconnect krne ki kosis kro    
});

// 🌌 1. FIXED BACKGROUND TASK (Ab bina global variable ke, seedhe storage se padhega)
TaskManager.defineTask(BACKGROUND_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background task error:", error.message);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const { latitude, longitude } = locations[0].coords;
      
      try {
        // 💾 Phone ki storage se Bus ID nikal rahe hain (Khabhi nahi udega!)
        const savedBusId = await AsyncStorage.getItem('saved_bus_id');
        
        if (savedBusId) {
          socket.emit('updateLocation', { 
            busId: savedBusId, 
            lat: latitude, 
            lng: longitude, 
            timestamp: new Date().toISOString() 
          });
          console.log(`BG [Storage Checked]: ${latitude}, ${longitude} for Bus: ${savedBusId}`);
        }
      } catch (err) {
        console.log("Error reading from AsyncStorage in background:", err.message);
      }
    }
  }
});

export default function DriverApp() {
  const [busId, setBusId] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTracking, setIsTracking] = useState(false);

  // 📡 Connection Listeners
  useEffect(() => {
    socket.on('connect', () => console.log(" Socket Connected!"));
    socket.on('disconnect', (reason) => console.log(" Socket Disconnected!", reason));
    socket.on('reconnect_attempt', (attempt) => console.log(` Retrying... #${attempt}`));

    // App khulte hi check karo, kya pehle se tracking chal rahi thi?
    checkExistingTracking();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect_attempt');
    };
  }, []);

  // 🔄 UI State Maintainer: Agar app minimize se khule toh status check rahe
  const checkExistingTracking = async () => {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
    if (hasStarted) {
      const savedId = await AsyncStorage.getItem('saved_bus_id');
      if (savedId) {
        setBusId(savedId);
        setIsTracking(true);
      }
    }
  };

  // 🚌 Bus Verification aur Storage Write
  const verifyAndStart = async () => {
    if (!busId) {
      Alert.alert("Error", "Please enter a Bus ID");
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${BASE_URL}/verify-bus`, { busId });
      if (response.data.success) {
        const hasPermission = await requestPermissions();
        if (hasPermission) {
          // 💾 Verification ke baad permanent save kar lo disk par
          await AsyncStorage.setItem('saved_bus_id', busId);
          await startLocationTracking();
          setIsTracking(true);
        }
      } else {
        Alert.alert("Error", "Invalid Bus ID!");
      }
    } catch (error) {
      Alert.alert("Server Error", "Could not connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const requestPermissions = async () => {
    let { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;

    let { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== 'granted') {
      Alert.alert("Error", "Please allow 'All the time' location in settings for background tracking.");
      return false;
    }
    return true;
  };

  // 📍 Background Tracking Start
  const startLocationTracking = async () => {
    try {
      let currentLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      socket.emit('updateLocation', { busId, lat: currentLoc.coords.latitude, lng: currentLoc.coords.longitude, timestamp: new Date().toISOString() });

      await Location.startLocationUpdatesAsync(BACKGROUND_TRACKING_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 30000, // 30second
        distanceInterval: 10, 
        deferredUpdatesInterval: 30000, // 30 seconds
        foregroundService: {
          notificationTitle: "Bus Tracking Active",
          notificationBody: "Sharing live route coordinates in background.",
        },
      });
      console.log("🚀 Background Tracking Started & ID Locked in Storage!");
    } catch (err) {
      Alert.alert("Error", "Failed to start tracking loop.");
    }
  };

  // 🛑 Tracking Stop aur Storage Clear
  const stopLocationTracking = async () => {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
      }
      // 🧼 Storage aur UI saaf
      await AsyncStorage.removeItem('saved_bus_id');
      setIsTracking(false);
      Alert.alert("Stopped", "Tracking stopped and storage cleared.");
    } catch (err) {
      console.log("Error stopping updates:", err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Tracking Panel (Secure BG)</Text>
      <TextInput 
        style={styles.input} 
        placeholder="Enter Bus ID" 
        value={busId}
        onChangeText={setBusId} 
        editable={!isTracking} 
      />
      {loading ? (
        <ActivityIndicator size="large" color="green" />
      ) : (
        <Button 
          title={isTracking ? "STOP TRACKING" : "START TRACKING"} 
          onPress={isTracking ? stopLocationTracking : verifyAndStart} 
          color={isTracking ? "red" : "green"}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  input: { borderWidth: 1, padding: 15, marginBottom: 20, borderRadius: 10, borderColor: '#ccc', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#333' }
});