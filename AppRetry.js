//with retry mechnaism

import React, { useState, useRef, useEffect } from 'react'; 
import { View, TextInput, Button, Alert, ActivityIndicator, StyleSheet, Text } from 'react-native';
import axios from 'axios';
import io from 'socket.io-client';
import * as Location from 'expo-location';

// 📡 CONFIG 1: Socket variable ko Component ke BAHAR (Top-Level) rakha hai taaki duplicate connections na banein
// 🔄 Ziddi Configuration: Net jaane par chupchaap background mein 2-2 second par infinite retry marta rahega
const socket = io('https://demeritoriously-subaqua-belen.ngrok-free.dev', {
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,             // Automatic reconnection chalu
  reconnectionAttempts: Infinity, // Jab tak net na aaye, haar nahi maanni hai
  reconnectionDelay: 2000,        // Har retry ke beech mein 2 second ka gap
});

export default function DriverApp() {
  const [busId, setBusId] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  
  // GPS interval timer ko secure rakhne ke liye ref
  const trackingInterval = useRef(null);

  // 📡 CONFIG 2: Connection Listeners aur Component Cleanup
  useEffect(() => {
    // Console logs taaki tumhe terminal/flipper par dikhta rahe ki piche kya chal raha hai
    socket.on('connect', () => {
      console.log("✅ Socket Connected to Server Successfully!");
    });

    socket.on('disconnect', (reason) => {
      console.log("❌ Socket Disconnected! Reason:", reason);
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`🔄 Network issue! Retrying connection... Attempt #${attempt}`);
    });

    // Cleanup: Jab app reload/close ho toh saare purane ghost timers aur listeners saaf ho jayein
    return () => {
      if (trackingInterval.current) {
        clearInterval(trackingInterval.current);
        console.log("Cleanup: Old tracking timers cleared!");
      }
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect_attempt');
    };
  }, []);

  // 🚌 Bus Verification aur Flow Control
  const verifyAndStart = async () => {
    if (!busId) {
      Alert.alert("Error", "Please enter a Bus ID");
      return;
    }
    setLoading(true);
    try {
      // Backend se verify kar rahe hain ki Bus ID DB mein hai ya nahi
      const response = await axios.post('https://demeritoriously-subaqua-belen.ngrok-free.dev/verify-bus', { busId });
      console.log("Verification Response:", response.data);
      
      if (response.data.success) {
        // Pehle permissions check hongi, phir tracking shuru hogi
        const hasPermission = await requestPermissions();
        if (hasPermission) {
          await startLocationTracking();
          setIsTracking(true);
        }
      } else {
        Alert.alert("Error", "Invalid Bus ID! Enter valid bus id.");
      }
    } catch (error) {
      Alert.alert("Server Error", "Could not connect to server. Check Ngrok/AWS IP or Network!");
    } finally {
      setLoading(false);
    }
  };

  // 🛡️ Location Permissions (Foreground + Background)
  const requestPermissions = async () => {
    let { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      Alert.alert("Permission Denied", "Foreground location access is required to track the bus.");
      return false;
    }

    // Background permission taaki driver agar phone jeb mein rakh le ya minimized kare toh bhi chale
    let { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log("Background location permission denied. Tracking might pause when app is minimized.");
    }
    
    return true;
  };

  // 📍 Real-Time Tracking Loop
  const startLocationTracking = async () => {
    try {
      // 1. Initial immediate point: Button dabate hi turant pehla coordinate chala jaye
      let currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest, // Balanced accuracy battery ke liye safe hai
      });
      const { latitude, longitude } = currentLoc.coords;
      
      socket.emit('updateLocation', { busId, lat: latitude, lng: longitude, timestamp: new Date().toISOString() });
      console.log("Initial Tracking Sent:", latitude, longitude);

      // 2. Loop Tracking: Ab har 3 minute mein background mein location coordinates socket par fikaati rahegi
      trackingInterval.current = setInterval(async () => {
        try {
          let loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Highest, // Pahaad par GPS accuracy thodi high rakhenge
          });
          const { latitude, longitude } = loc.coords;
          
          // Chupchaap data throw karo, net aate hi socket khud deliver kar dega
          socket.emit('updateLocation', { busId, lat: latitude, lng: longitude, timestamp: new Date().toISOString() });
          console.log("Sent Location (Every 3 Min):", latitude, longitude, new Date().toISOString());
        } catch (err) {
          console.log("Error fetching location inside interval:", err.message);
        }
      }, 180000); // 3 minute = 180000ms

    } catch (err) {
      Alert.alert("Error", "Failed to start location tracking.");
    }
  };

  // 🛑 Tracking Stop Mechanism
  const stopLocationTracking = () => {
    // Background interval ko hamesha ke liye clear karo taaki battery safe ho jaye
    if (trackingInterval.current) {
      clearInterval(trackingInterval.current);
      trackingInterval.current = null;
    }
    setIsTracking(false);
    Alert.alert("Stopped", "Tracking has been stopped successfully.");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Tracking Panel</Text>
      
      <TextInput 
        style={styles.input} 
        placeholder="Enter Bus ID" 
        value={busId}
        onChangeText={setBusId} 
        editable={!isTracking} // Tracking active hote hi input box freeze ho jayega
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
