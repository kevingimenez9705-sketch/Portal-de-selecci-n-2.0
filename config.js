// ══════════════════════════════════════════════
//  CONFIGURACIÓN Y DATOS GLOBALES
// ══════════════════════════════════════════════
const SUPABASE_URL = 'https://cyoewhddfzoiyeuxowlj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5b2V3aGRkZnpvaXlldXhvd2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDg0OTEsImV4cCI6MjA5Nzg4NDQ5MX0.al1TGu2ek9KRBaEkGfE8oSE6AsemKQUXhTghWnVhF-U';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const SELECTORES = ['Silvina','Romina','Claudia','Luca','Soledad','Angel','Noelia'];
const DEMORA_LIMITE = { 'Gerente/Director': 45, 'Jefe/Encargado': 30, 'Otros': 15 };
const VERIF_EN_CURSO = ['Pendiente','En proceso'];

// ── Estado global de la app ──
let busquedas = [];
let filteredIds = null;
let currentProfile = null;
let nroSeq = 1;
let pipelineCat = 'general';   // pipeline activo: 'general' | 'chofer'
