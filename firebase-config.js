const firebaseConfig = {
  apiKey: "AIzaSyCaJmTrGPxlDUWr_Sa80KbtS-00pWcAPMY",
  authDomain: "daeun-house.firebaseapp.com",
  databaseURL: "https://daeun-house-default-rtdb.firebaseio.com",
  projectId: "daeun-house",
  storageBucket: "daeun-house.firebasestorage.app",
  messagingSenderId: "208494497956",
  appId: "1:208494497956:web:250bc49a9099a0036c9631",
  measurementId: "G-3RHBSBTJ1X",
};

const daeunFirebaseApp = firebase.apps.length
  ? firebase.app()
  : firebase.initializeApp(firebaseConfig);

window.daeunFirebase = {
  app: daeunFirebaseApp,
  db: firebase.database(),
};
