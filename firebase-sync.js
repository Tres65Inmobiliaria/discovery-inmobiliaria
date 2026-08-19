// Puente entre localStorage (usado por el resto del sitio) y Firestore.
// Cada cliente inicia sesión sin contraseña: su link personal trae un
// "ficha_token" que el backend cambia por un token de Firebase (su teléfono
// ya se verificó al escribirle a María por WhatsApp).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  projectId: "tres65-perfilcliente",
  appId: "1:339793784661:web:3825f6b030680ead5549dc",
  storageBucket: "tres65-perfilcliente.firebasestorage.app",
  apiKey: "AIzaSyD4azKQE2arcN_iFUQz4jkTVv3tNdOiUKw",
  authDomain: "tres65-perfilcliente.firebaseapp.com",
  messagingSenderId: "339793784661"
};

const API_BASE = "https://agente-tres65-production.up.railway.app";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function syncKey(n){ return "tres65_property_" + n + "_state"; }
function reportKey(n){ return "tres65_property_" + n + "_report"; }

async function init(fichaToken){
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if(user){
        resolve(user.uid);
        return;
      }
      if(!fichaToken){ resolve(null); return; }
      try{
        const res = await fetch(API_BASE + "/portal/auth-token", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ficha_token: fichaToken})
        });
        const data = await res.json();
        if(data.ok){
          await signInWithCustomToken(auth, data.token);
          resolve(data.uid);
        } else {
          console.warn("[Firebase] no se pudo generar el token:", data.error);
          resolve(null);
        }
      }catch(e){
        console.error("[Firebase] error autenticando:", e);
        resolve(null);
      }
    });
  });
}

async function pull(uid){
  if(!uid) return null;
  try{
    const snap = await getDoc(doc(db, "users", uid));
    if(!snap.exists()) return null;
    const data = snap.data();

    if(typeof data.metAgent === "boolean"){
      localStorage.setItem("tres65_met_agent", data.metAgent ? "true" : "false");
    }
    if(data.propertyCount){
      localStorage.setItem("tres65_property_count", String(data.propertyCount));
    }
    if(data.properties){
      Object.keys(data.properties).forEach(n => {
        const p = data.properties[n];
        if(p.state) localStorage.setItem(syncKey(n), JSON.stringify(p.state));
        if(p.report) localStorage.setItem(reportKey(n), p.report);
      });
    }
    return data;
  }catch(e){
    console.error("[Firebase] error leyendo datos:", e);
    return null;
  }
}

async function push(uid){
  if(!uid) return;
  const propertyCount = parseInt(localStorage.getItem("tres65_property_count") || "1", 10);
  const properties = {};
  for(let n = 1; n <= propertyCount; n++){
    const stateRaw = localStorage.getItem(syncKey(n));
    const report = localStorage.getItem(reportKey(n));
    if(stateRaw || report){
      properties[n] = {};
      if(stateRaw){
        try{ properties[n].state = JSON.parse(stateRaw); }catch(e){}
      }
      if(report) properties[n].report = report;
    }
  }
  const data = {
    metAgent: localStorage.getItem("tres65_met_agent") === "true",
    propertyCount,
    properties
  };
  try{
    await setDoc(doc(db, "users", uid), data, {merge: true});
  }catch(e){
    console.error("[Firebase] error guardando datos:", e);
  }
}

window.tres65Sync = {init, pull, push, getUid: () => auth.currentUser && auth.currentUser.uid};
window.dispatchEvent(new Event("tres65-sync-ready"));
