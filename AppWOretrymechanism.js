import React, { useState, useRef, useEffect } from 'react'; 

import { View, TextInput, Button, Alert, ActivityIndicator, StyleSheet, Text } from 'react-native';
import axios from 'axios';
import io from 'socket.io-client';
import * as Location from 'expo-location';

// Server ka IP (Apne terminal ke hisaab se check kar lena)
//const socket = io('http:/10.214.8.90:5000');
const socket = io('https://demeritoriously-subaqua-belen.ngrok-free.dev');

export default function DriverApp() {
  const [busId, setBusId] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  
  // GPS subscription ko store karne ke liye ref
  //const locationSubscription = useRef(null);
  const trackingInterval = useRef(null);
   useEffect(() => {
    return () => {
      if (trackingInterval.current) {
        clearInterval(trackingInterval.current);
        console.log("Cleanup: Old ghost timers cleared on reload!");
      }
    };
  }, []);

  const verifyAndStart = async () => {
    if (!busId) {
      Alert.alert("Error", "Please enter a Bus ID");
      return;
    }
    setLoading(true);
    try {
      // API Call to verify if Bus ID exists in DB
      //const response = await axios.post('http://10.214.8.90:5000/verify-bus', { busId });
      const response = await axios.post('https://demeritoriously-subaqua-belen.ngrok-free.dev/verify-bus', { busId });
      console.log("Verification Response:", response.data);
      if (response.data.success) {
        // Pehle location permissions check karenge, phir tracking start hogi
        const hasPermission = await requestPermissions();
        if (hasPermission) {
          await startLocationTracking();
          setIsTracking(true);
        }
      } else {
        Alert.alert("Error", "Invalid Bus ID! Enter valid bus id.");
      }
    } catch (error) {
      Alert.alert("Server Error", "Could not connect to server. Check IP or Network!");
    } finally {
      setLoading(false);
    }
  };

  // Permissions handle karne ka sahi tareeka
  const requestPermissions = async () => {
    let { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      Alert.alert("Permission Denied", "Foreground location access is required.");
      return false;
    }

    // Background permission ka check (taaki app band hone par bhi chale)
    let { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log("Background location permission denied. Tracking might stop when app is minimized.");
    }
    
    return true;
  };

  // const startLocationTracking = async () => {
  //   try {
  //     // Har 5 seconds mein location update bhejenge (ya isko badha kar 120000 yani 2 min kar sakte ho)
  //     locationSubscription.current = await Location.watchPositionAsync({
  //       accuracy: Location.Accuracy.High,
  //       timeInterval: 60000, // 1minite seconds (testing ke liye best hai)
  //       distanceInterval: 1, // 1 meter change hone par bhi trigger ho
  //     }, (loc) => {
  //       const { latitude, longitude } = loc.coords;
        
  //       // Socket par throw kar rahe hain data
  //       socket.emit('updateLocation', { busId, lat: latitude, lng: longitude });
  //       console.log("Tracking Active:", latitude, longitude);
  //     });
  //   } catch (err) {
  //     Alert.alert("Error", "Failed to start location updates.");
  //   }
  // };

  // const stopLocationTracking = () => {
  //   // Agar subscription chal raha hai, toh use remove karo
  //   if (locationSubscription.current) {
  //     locationSubscription.current.remove();
  //     locationSubscription.current = null;
  //   }
  //   setIsTracking(false);
  //   Alert.alert("Stopped", "Tracking has been stopped.");
  // };

  //new code 
  // 2. Ab startLocationTracking function ko isse replace karo:
const startLocationTracking = async () => {
  try {
    // Pehle ek baar turant location nikal lete hain (taaki chalu karte hi pehli entry chali jaye)
    let currentLoc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced, // 10-20 meter ki accuracy ke liye Balanced best hai adv ->bal
    });
    const { latitude, longitude } = currentLoc.coords;
    socket.emit('updateLocation', { busId, lat: latitude, lng: longitude, timestamp: new Date().toISOString() });
    console.log("Initial Tracking:", latitude, longitude, new Date().toISOString());

    // Ab har 3 minute (180000 milliseconds) mein location bhejenge
    trackingInterval.current = setInterval(async () => {
      try {
        let loc = await Location.getCurrentPositionAsync({
          //accuracy: Location.Accuracy.Balanced, // Battery bohot kam khayega
          //accuracy: Location.Accuracy.bestForNavigation, // GPS ke liye best hai, thoda battery zyada 
          accuracy: Location.Accuracy.High, // GPS ke liye best hai, thoda battery zyada
        });
        const { latitude, longitude } = loc.coords;
        
        socket.emit('updateLocation', { busId, lat: latitude, lng: longitude, timestamp: new Date().toISOString() });
        console.log("Sent Location (Every 3 Min):", latitude, longitude, new Date().toISOString());
      } catch (err) {
        console.log("Error fetching location in interval:", err.message);
      }
    }, 180000); // 3 minute = 3 * 60 * 1000 = 180000ms

  } catch (err) {
    Alert.alert("Error", "Failed to start location tracking.");
  }
};

// 3. Ab stopLocationTracking function ko isse replace karo:
const stopLocationTracking = () => {
  // Interval ko clear karo taaki background mein chalna band ho jaye
  if (trackingInterval.current) {
    clearInterval(trackingInterval.current);
    trackingInterval.current = null;
  }
  setIsTracking(false);
  Alert.alert("Stopped", "Tracking has been stopped.");
};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Tracking Panel</Text>
      
      <TextInput 
        style={styles.input} 
        placeholder="Enter Bus ID" 
        value={busId}
        onChangeText={setBusId} 
        editable={!isTracking} // Tracking start hone ke baad input lock ho jayega
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