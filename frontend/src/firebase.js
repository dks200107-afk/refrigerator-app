// frontend/src/firebase.js

import { initializeApp }
from 'firebase/app';

import {
  getAuth,
  GoogleAuthProvider
} from 'firebase/auth';

import {
  getFirestore
} from 'firebase/firestore';

const firebaseConfig = {

  apiKey: "AIzaSyC6JbjKN48UWCvjsHPqvVc7nXvc9szyogE",

  authDomain:
    "refrigerator-app-eb7da.firebaseapp.com",

  projectId:
    "refrigerator-app-eb7da",

  storageBucket:
    "refrigerator-app-eb7da.firebasestorage.app",

  messagingSenderId:
    "275201456887",

  appId:
    "1:275201456887:web:90af8b965f4ed654d0f1f2"

};

const app =
  initializeApp(firebaseConfig);

// 반드시 export 해야 함

export const auth =
  getAuth(app);

export const provider =
  new GoogleAuthProvider();

export const db =
  getFirestore(app);