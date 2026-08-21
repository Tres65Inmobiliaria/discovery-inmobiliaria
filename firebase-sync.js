// Puente entre localStorage (usado por el resto del sitio) y Firestore.
// Cada cliente inicia sesión sin contraseña: su link personal trae un
// "ficha_token" que el backend cambia por un token de Firebase (su teléfono
// ya se verificó al escribirle a María por WhatsApp).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
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
function reportKeywordsKey(n){ return "tres65_property_" + n + "_report_keywords"; }
function reportProfileKey(n){ return "tres65_property_" + n + "_report_profile"; }

function waitForAuthUser(){
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

async function init(fichaToken){
  const current = await waitForAuthUser();
  if(!fichaToken){
    return current ? current.uid : null;
  }
  // No basta con "ya hay alguien firmado" — hay que confirmar que sea
  // la identidad de ESTE link. Si en este navegador quedó abierta la
  // sesión de OTRO cliente (típico al probar varias fichas seguidas),
  // reusarla mostraría el avance/reporte de esa otra persona.
  try{
    const res = await fetch(API_BASE + "/portal/auth-token", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ficha_token: fichaToken})
    });
    const data = await res.json();
    if(!data.ok){
      console.warn("[Firebase] no se pudo generar el token:", data.error);
      return current ? current.uid : null;
    }
    if(current && current.uid === data.uid){
      return current.uid;
    }
    await signInWithCustomToken(auth, data.token);
    return data.uid;
  }catch(e){
    console.error("[Firebase] error autenticando:", e);
    return current ? current.uid : null;
  }
}

function clearLocalProgress(){
  const keys = [];
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && (k.startsWith("tres65_property_") || k === "tres65_met_agent" || k === "tres65_last_report")){
      keys.push(k);
    }
  }
  keys.forEach(k => localStorage.removeItem(k));
  localStorage.setItem("tres65_property_count", "1");
}

async function pull(uid){
  if(!uid) return null;
  try{
    const snap = await getDoc(doc(db, "users", uid));
    if(!snap.exists()){
      // Identidad nueva sin nada guardado — no dejar restos de otra sesión/cliente.
      clearLocalProgress();
      return null;
    }
    const data = snap.data();
    clearLocalProgress();

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
        if(p.report_keywords) localStorage.setItem(reportKeywordsKey(n), JSON.stringify(p.report_keywords));
        if(p.report_profile) localStorage.setItem(reportProfileKey(n), JSON.stringify(p.report_profile));
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
    const reportKeywordsRaw = localStorage.getItem(reportKeywordsKey(n));
    const reportProfileRaw = localStorage.getItem(reportProfileKey(n));
    if(stateRaw || report){
      properties[n] = {};
      if(stateRaw){
        try{ properties[n].state = JSON.parse(stateRaw); }catch(e){}
      }
      if(report) properties[n].report = report;
      if(reportKeywordsRaw){
        try{ properties[n].report_keywords = JSON.parse(reportKeywordsRaw); }catch(e){}
      }
      if(reportProfileRaw){
        try{ properties[n].report_profile = JSON.parse(reportProfileRaw); }catch(e){}
      }
    }
  }
  const data = {
    metAgent: localStorage.getItem("tres65_met_agent") === "true",
    propertyCount,
    properties,
    updated_at: new Date().toISOString()
  };
  try{
    await setDoc(doc(db, "users", uid), data, {merge: true});
  }catch(e){
    console.error("[Firebase] error guardando datos:", e);
  }
}

async function signInAgent(email, password){
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.uid;
}

function signOutAgent(){
  return signOut(auth);
}

async function agentInit(){
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if(!user){ resolve(null); return; }
      const tokenResult = await user.getIdTokenResult();
      resolve({uid: user.uid, isAdmin: tokenResult.claims.admin === true, email: user.email});
    });
  });
}

async function runLeadsRoundRobin(){
  return _authedPost("/portal/leads-round-robin", {});
}

async function convertLeadToListo(conv_id){
  return _authedPost("/portal/lead-a-listo/" + encodeURIComponent(conv_id), {});
}

async function getLeadsCount(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken();
  const res = await fetch(API_BASE + "/portal/leads-count", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando leads");
  return data.count;
}

async function getLeadsPotenciales(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken();
  const res = await fetch(API_BASE + "/portal/leads-potenciales", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando leads");
  return data.leads;
}

async function listClients(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken();
  const res = await fetch(API_BASE + "/portal/mis-clientes", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error cargando clientes");
  return data.clients;
}

async function deleteClient(token, reason){
  return _authedPost("/portal/cliente-detalle/" + encodeURIComponent(token) + "/eliminar", {reason});
}

async function createClient({client_name, client_phone, client_email, property_raw, agent_uid}){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken();
  const res = await fetch(API_BASE + "/portal/crear-cliente", {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": "Bearer " + idToken},
    body: JSON.stringify({client_name, client_phone, client_email, property_raw, agent_uid})
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error creando el cliente");
  return data;
}

async function _authedPost(path, payload){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken();
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": "Bearer " + idToken},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error");
  return data;
}

async function searchProperties(query){
  const data = await _authedPost("/portal/buscar-propiedades", {query});
  return {results: data.results, exact: data.exact};
}

async function addProperties(client_token, urls){
  return _authedPost("/portal/agregar-propiedades", {client_token, urls});
}

async function removeProperty(client_token, url){
  return _authedPost("/portal/quitar-propiedad/" + encodeURIComponent(client_token), {url});
}

async function runAnalysis(client_token){
  return _authedPost("/portal/analisis-cliente/" + encodeURIComponent(client_token), {});
}

async function correctAnalysis(client_token, instruction){
  return _authedPost("/portal/corregir-analisis/" + encodeURIComponent(client_token), {instruction});
}

async function shareAnalysis(client_token, url){
  return _authedPost("/portal/compartir-analisis/" + encodeURIComponent(client_token), {url});
}

async function getClientDetail(token){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken();
  const res = await fetch(API_BASE + "/portal/cliente-detalle/" + encodeURIComponent(token), {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error");
  return data;
}

async function addClientNote(token, text){
  return _authedPost("/portal/cliente-detalle/" + encodeURIComponent(token) + "/nota", {text});
}

async function askLegal(question){
  const data = await _authedPost("/portal/pregunta-legal", {question});
  return data.answer;
}

async function summarizeLink(url){
  const data = await _authedPost("/portal/resumir-link", {url});
  return data.summary;
}

window.tres65Sync = {
  init, pull, push, getUid: () => auth.currentUser && auth.currentUser.uid,
  signInAgent, signOutAgent, agentInit, listClients, createClient,
  searchProperties, askLegal, summarizeLink, addProperties, removeProperty, runAnalysis,
  correctAnalysis, shareAnalysis, getLeadsPotenciales, getLeadsCount,
  runLeadsRoundRobin, convertLeadToListo,
  getClientDetail, addClientNote, deleteClient
};
window.dispatchEvent(new Event("tres65-sync-ready"));
