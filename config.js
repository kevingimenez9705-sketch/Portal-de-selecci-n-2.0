// ══════════════════════════════════════════════
//  CONFIGURACIÓN Y DATOS GLOBALES
// ══════════════════════════════════════════════
const SUPABASE_URL = 'https://nhlkndwwsuybnejbyigk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5obGtuZHd3c3V5Ym5lamJ5aWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzY5ODYsImV4cCI6MjA5Mzc1Mjk4Nn0.Xdli4VzqAKuYLkU5q8m8G6UTNda_BAaJlibROm9tGhw';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const SELECTORES = ['Silvina','Romina','Claudia','Luca','Soledad','Angel','Noelia'];
const DEMORA_LIMITE = { 'Gerente/Director': 45, 'Jefe/Encargado': 30, 'Otros': 15 };
const VERIF_EN_CURSO = ['Pendiente','En proceso'];

// ── Estado global de la app ──
let busquedas = [];
let filteredIds = null;
let currentProfile = null;
let nroSeq = 1;
