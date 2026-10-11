// Pruebas de firestore.rules para clients/{token} con el emulador local
// (proyecto demo-*, nunca el real). Ver package.json: npm test.
import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const AGENTE_A = "agente-a-demo";
const AGENTE_B = "agente-b-demo";
const CLIENTE = "cliente-demo";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-tres65",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "clients/tokA"), { agent_uid: AGENTE_A, client_name: "X" });
  });
});

const agente = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "password" } }).firestore();
const admin = () => env.authenticatedContext("admin-tres65", { admin: true, firebase: { sign_in_provider: "password" } }).firestore();
const cliente = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "custom" } }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

test("el asesor asignado lee y actualiza su ficha sin cambiar agent_uid", async () => {
  await assertSucceeds(getDoc(doc(agente(AGENTE_A), "clients/tokA")));
  await assertSucceeds(updateDoc(doc(agente(AGENTE_A), "clients/tokA"), { client_name: "Y" }));
});

test("el asesor asignado NO puede reasignarse la ficha a otro", async () => {
  await assertFails(updateDoc(doc(agente(AGENTE_A), "clients/tokA"), { agent_uid: AGENTE_B }));
});

test("otro asesor NO puede tomar una ficha ajena (hallazgo de Codex)", async () => {
  await assertFails(updateDoc(doc(agente(AGENTE_B), "clients/tokA"), { agent_uid: AGENTE_B }));
  await assertFails(updateDoc(doc(agente(AGENTE_B), "clients/tokA"), { client_name: "Z" }));
  await assertFails(getDoc(doc(agente(AGENTE_B), "clients/tokA")));
});

test("Admin puede leer y reasignar", async () => {
  await assertSucceeds(getDoc(doc(admin(), "clients/tokA")));
  await assertSucceeds(updateDoc(doc(admin(), "clients/tokA"), { agent_uid: AGENTE_B }));
});

test("una sesión de cliente (custom token) no lee, no crea ni modifica fichas", async () => {
  await assertFails(getDoc(doc(cliente(CLIENTE), "clients/tokA")));
  await assertFails(updateDoc(doc(cliente(CLIENTE), "clients/tokA"), { agent_uid: CLIENTE }));
  await assertFails(setDoc(doc(cliente(CLIENTE), "clients/nuevo"), { agent_uid: CLIENTE }));
});

test("una sesión de cliente con el MISMO uid que un agente tampoco cuenta como agente", async () => {
  await assertFails(getDoc(doc(cliente(AGENTE_A), "clients/tokA")));
  await assertFails(updateDoc(doc(cliente(AGENTE_A), "clients/tokA"), { client_name: "Y" }));
});

test("sin sesión: nada; y nadie borra desde el navegador", async () => {
  await assertFails(getDoc(doc(anonimo(), "clients/tokA")));
  await assertFails(deleteDoc(doc(agente(AGENTE_A), "clients/tokA")));
  await assertFails(deleteDoc(doc(admin(), "clients/tokA")));
});

test("users/{uid}: cada sesión solo su propio documento (sin cambios)", async () => {
  await assertSucceeds(setDoc(doc(cliente(CLIENTE), `users/${CLIENTE}`), { propertyCount: 1 }));
  await assertFails(setDoc(doc(cliente(CLIENTE), `users/${AGENTE_A}`), { propertyCount: 1 }));
});
