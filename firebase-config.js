// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCxNJ0z140lmYJPSMFCPOBkBsmuCxvLn4M",
    authDomain: "dailyquest-e7d7b.firebaseapp.com",
    databaseURL: "https://dailyquest-e7d7b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dailyquest-e7d7b",
    storageBucket: "dailyquest-e7d7b.firebasestorage.app",
    messagingSenderId: "553089973498",
    appId: "1:553089973498:web:22e7617df0b8fd95cf96e8"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase References
const auth = firebase.auth();
const db = firebase.database();

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
