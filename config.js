const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Atualize o caminho se necessário

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gestao-times.firebaseio.com"
});

const db = admin.firestore();
module.exports = { admin, db };
