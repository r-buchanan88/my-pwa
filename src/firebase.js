import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyDHFyhtVdQWpzL_SYVP-ftZPimL8QGDxA4",
  authDomain: "rally-crew.firebaseapp.com",
  databaseURL: "https://rally-crew-default-rtdb.firebaseio.com",
  projectId: "rally-crew",
  storageBucket: "rally-crew.firebasestorage.app",
  messagingSenderId: "356055945372",
  appId: "1:356055945372:web:608cc1233024dc326a5d59"
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)