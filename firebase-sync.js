// Puente entre localStorage (usado por el resto del sitio) y Firestore.
// Cada cliente inicia sesión sin contraseña: su link personal trae un
// "ficha_token" que el backend cambia por un token de Firebase (su teléfono
// ya se verificó al escribirle a María por WhatsApp).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
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
function reportPriorityKey(n){ return "tres65_property_" + n + "_report_priority"; }

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
    if(k && (k.startsWith("tres65_property_") || k === "tres65_met_agent" || k === "tres65_last_report" || k === "tres65_privacy_accepted")){
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
    if(data.privacyAccepted === true){
      localStorage.setItem("tres65_privacy_accepted", "true");
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
        if(p.report_priority) localStorage.setItem(reportPriorityKey(n), JSON.stringify(p.report_priority));
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
    const reportPriorityRaw = localStorage.getItem(reportPriorityKey(n));
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
      if(reportPriorityRaw){
        try{ properties[n].report_priority = JSON.parse(reportPriorityRaw); }catch(e){}
      }
    }
  }
  const data = {
    metAgent: localStorage.getItem("tres65_met_agent") === "true",
    privacyAccepted: localStorage.getItem("tres65_privacy_accepted") === "true",
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

async function addClientEmail(token, email){
  const res = await fetch(API_BASE + "/portal/ficha/" + encodeURIComponent(token) + "/correo", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email})
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error guardando el correo");
  return data;
}

function _readCookie(name){
  const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return match ? match.pop() : null;
}

async function sendPixelIds(token){
  const fbp = _readCookie('_fbp');
  const fbc = _readCookie('_fbc');
  if(!fbp && !fbc) return;
  try{
    await fetch(API_BASE + "/portal/ficha/" + encodeURIComponent(token) + "/pixel-ids", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({fbp, fbc})
    });
  }catch(e){ console.error('[Pixel] error guardando fbp/fbc:', e); }
}

async function signInAgent(email, password){
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.uid;
}

function signOutAgent(){
  return signOut(auth);
}

function resetAgentPassword(email){
  return sendPasswordResetEmail(auth, email);
}

async function agentInit(){
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if(!user){ resolve(null); return; }
      // forceRefresh:true — si no, un token en caché de antes de que se le
      // asignara el claim "admin" hace que is_admin salga false en el
      // backend aunque la cuenta ya sea admin (bug real que pasó con una
      // propiedad sugerida que nunca se guardó). Con "recordar contraseña"
      // las sesiones duran más sin volver a iniciar sesión, así que este
      // refresh forzado es más importante todavía.
      const tokenResult = await user.getIdTokenResult(true);
      resolve({uid: user.uid, isAdmin: tokenResult.claims.admin === true, email: user.email});
    });
  });
}

async function runLeadsRoundRobin(label){
  return _authedPost("/portal/leads-round-robin", label ? {label} : {});
}

async function crearLeadManual(datos){
  return _authedPost("/portal/leads/crear-manual", datos);
}

async function convertLeadToListo(conv_id){
  return _authedPost("/portal/lead-a-listo/" + encodeURIComponent(conv_id), {});
}

async function logLeadContact(conv_id, contacted, result, method){
  const data = await _authedPost("/portal/leads/" + encodeURIComponent(conv_id) + "/contacto", {contacted, result, method});
  return data.attempts;
}

async function deleteLead(conv_id, reason){
  return _authedPost("/portal/leads/" + encodeURIComponent(conv_id) + "/borrar", {reason});
}

async function reactivarLead(conv_id){
  return _authedPost("/portal/leads/" + encodeURIComponent(conv_id) + "/reactivar", {});
}

async function getLeadsPerdidos(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/leads-perdidos", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando leads perdidos");
  return data.leads;
}

async function getLeadsSinContactarCount(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/leads-sin-contactar-count", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando leads sin contactar");
  return {count: data.count, items: data.items || []};
}

async function getMensajesEasyBroker(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/mensajes-easybroker", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando mensajes de EasyBroker");
  return data.items;
}

async function atenderMensajeEasyBroker(id){
  return _authedPost("/portal/mensajes-easybroker/" + encodeURIComponent(id) + "/atender", {});
}

async function getLeadsPerdidosCount(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/leads-perdidos-count", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando leads perdidos");
  return {count: data.count, items: data.items || []};
}

async function getDirectorio(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/directorio", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando el directorio");
  return data.entries;
}

async function getLeadsCount(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/leads-count", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando leads");
  return data.count;
}

async function sendWelcomeMessage(token){
  return _authedPost("/portal/enviar-bienvenida/" + encodeURIComponent(token), {});
}

async function getAgentTasks(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/tareas-agente", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando tareas");
  return data.tasks;
}

async function getTareasPorCliente(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/tareas-por-cliente", {
    headers: {"Authorization": "Bearer " + idToken}
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Error consultando tareas por cliente");
  return data.clients;
}

async function createAgentTask(agent_uid, text){
  const data = await _authedPost("/portal/tareas-agente", {agent_uid, text});
  return data.task;
}

async function toggleAgentTask(task_id){
  const data = await _authedPost("/portal/tareas-agente/" + encodeURIComponent(task_id) + "/completar", {});
  return data.task;
}

async function deleteAgentTask(task_id){
  return _authedPost("/portal/tareas-agente/" + encodeURIComponent(task_id) + "/eliminar", {});
}

async function getLeadsPotenciales(){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
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
  const idToken = await user.getIdToken(true);
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

async function markSaleClosed(token, amount){
  return _authedPost("/portal/cliente-detalle/" + encodeURIComponent(token) + "/venta-cerrada", {amount});
}

async function createClient({client_name, client_phone, client_email, property_raw, agent_uid, confirm_duplicate}){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_BASE + "/portal/crear-cliente", {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": "Bearer " + idToken},
    body: JSON.stringify({client_name, client_phone, client_email, property_raw, agent_uid, confirm_duplicate})
  });
  const data = await res.json();
  if(!data.ok && !data.duplicate) throw new Error(data.error || "Error creando el cliente");
  return data;
}

async function _authedPost(path, payload){
  const user = auth.currentUser;
  if(!user) throw new Error("No autenticado");
  const idToken = await user.getIdToken(true);
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

async function addPropertiesItems(client_token, items){
  return _authedPost("/portal/agregar-propiedades", {client_token, items});
}

async function resolverPropiedad(url){
  const data = await _authedPost("/portal/resolver-propiedad", {url});
  return data.property;
}

async function removeProperty(client_token, url){
  return _authedPost("/portal/quitar-propiedad/" + encodeURIComponent(client_token), {url});
}

async function aceptarPropiedadSugerida(client_token, url){
  return _authedPost("/portal/cliente-detalle/" + encodeURIComponent(client_token) + "/sugerida/aceptar", {url});
}

async function descartarPropiedadSugerida(client_token, url){
  return _authedPost("/portal/cliente-detalle/" + encodeURIComponent(client_token) + "/sugerida/descartar", {url});
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
  const idToken = await user.getIdToken(true);
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

async function toggleClientNote(token, created_at){
  return _authedPost("/portal/cliente-detalle/" + encodeURIComponent(token) + "/nota/completar", {created_at});
}

async function deleteClientNote(token, created_at){
  return _authedPost("/portal/cliente-detalle/" + encodeURIComponent(token) + "/nota/eliminar", {created_at});
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
  signInAgent, signOutAgent, resetAgentPassword, agentInit, listClients, createClient,
  searchProperties, askLegal, summarizeLink, addProperties, addPropertiesItems, resolverPropiedad, removeProperty, runAnalysis,
  aceptarPropiedadSugerida, descartarPropiedadSugerida,
  correctAnalysis, shareAnalysis, getLeadsPotenciales, getLeadsCount, sendWelcomeMessage,
  runLeadsRoundRobin, crearLeadManual, convertLeadToListo, logLeadContact, deleteLead, reactivarLead, getLeadsPerdidos, getLeadsPerdidosCount, getLeadsSinContactarCount, getMensajesEasyBroker, atenderMensajeEasyBroker, getDirectorio,
  getClientDetail, addClientNote, toggleClientNote, deleteClientNote, deleteClient, addClientEmail, markSaleClosed, sendPixelIds,
  getAgentTasks, createAgentTask, toggleAgentTask, deleteAgentTask, getTareasPorCliente
};
window.dispatchEvent(new Event("tres65-sync-ready"));
