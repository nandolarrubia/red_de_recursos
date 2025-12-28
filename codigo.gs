/**
 * APP: Red de Recursos (Backend API)
 * Este archivo debe permanecer en Google Apps Script.
 * Proporciona los datos de Google Sheets a la web alojada en GitHub.
 */

const SHEET_RESOURCES = 'REGISTRO DE RECURSOS'; 
const SHEET_ENTITIES = 'ENTIDADES'; 

/**
 * Función principal que maneja las peticiones externas.
 * GitHub llamará a esta función para obtener los datos en formato JSON.
 */
function doGet(e) {
  try {
    const data = getData();
    
    // Devolvemos los datos como JSON para que GitHub pueda leerlos desde el navegador
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    const errorResponse = { error: error.toString() };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Convierte URLs de Google Drive a formato de imagen directa visualizable
 */
function convertGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') return '';
  url = url.trim();
  let match = url.match(/[?&]id=([^&]+)/) || url.match(/\/file\/d\/([^\/]+)/);
  if (url.includes('drive.google.com') && match) {
    return 'https://lh3.googleusercontent.com/d/' + match[1];
  }
  return url.startsWith('http') ? url : '';
}

/**
 * Obtiene el mapa de entidades para enriquecer los recursos con datos de contacto
 */
function getEntitiesMap() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_ENTITIES);
    if (!sheet) return {};

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return {};

    const headers = data[0];
    const rows = data.slice(1);

    const findIdx = (keywords) => headers.findIndex(h => 
      h && keywords.some(k => String(h).toLowerCase().includes(k))
    );

    const idxName = findIdx(['nombre', 'entidad', 'organización']);
    const idxPhone = findIdx(['teléfono', 'telefono', 'móvil', 'celular']);
    const idxEmail = findIdx(['correo', 'email', 'mail']);
    const idxAddress = findIdx(['dirección', 'direccion', 'ubicación']);

    const entitiesMap = {};

    rows.forEach(row => {
      if (idxName === -1) return;
      const rawName = String(row[idxName] || '').trim();
      if (!rawName) return;
      const key = rawName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      entitiesMap[key] = {
        phone: idxPhone >= 0 ? String(row[idxPhone] || '').trim() : '',
        email: idxEmail >= 0 ? String(row[idxEmail] || '').trim() : '',
        address: idxAddress >= 0 ? String(row[idxAddress] || '').trim() : ''
      };
    });

    return entitiesMap;
  } catch (e) {
    return {};
  }
}

/**
 * Función que extrae y limpia los datos de los recursos
 */
function getData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_RESOURCES) || ss.getSheets()[0];
    const entitiesData = getEntitiesMap();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) return [];
    
    const headers = data[0];
    const rows = data.slice(1);
    
    const findCol = (names) => {
      for (let name of names) {
        const idx = headers.findIndex(h => h && String(h).toLowerCase().trim().includes(name.toLowerCase()));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const colMap = {
      timestamp: findCol(['marca temporal', 'timestamp']),
      titulo: findCol(['título', 'titulo']),
      entidad: findCol(['organización', 'entidad']),
      categoria: findCol(['categoría', 'categoria']),
      descripcion: findCol(['descripción', 'descripcion']),
      enlace: findCol(['url', 'enlace']),
      imagenUrl: findCol(['imagen', 'foto']),
      fechaInicio: findCol(['inicio']),
      fechaFin: findCol(['fin'])
    };
    
    const resources = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    rows.forEach((row, index) => {
      if (row.every(c => c === '')) return;
      
      const start = colMap.fechaInicio >= 0 ? row[colMap.fechaInicio] : null;
      const end = colMap.fechaFin >= 0 ? row[colMap.fechaFin] : null;

      if (start instanceof Date && start > today) return;
      if (end instanceof Date && end < today) return;

      const entityNameRaw = colMap.entidad >= 0 ? String(row[colMap.entidad] || '').trim() : '';
      const entityKey = entityNameRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const entityInfo = entitiesData[entityKey] || { phone: '', email: '', address: '' };

      resources.push({
        id: index + 2,
        timestamp: (colMap.timestamp >= 0 && row[colMap.timestamp] instanceof Date) ? row[colMap.timestamp].toISOString() : new Date().toISOString(),
        titulo: colMap.titulo >= 0 ? String(row[colMap.titulo] || 'Sin Título') : 'Sin Título',
        entidad: entityNameRaw || 'Entidad Desconocida',
        entityPhone: entityInfo.phone,
        entityEmail: entityInfo.email,
        entityAddress: entityInfo.address,
        categoria: colMap.categoria >= 0 ? String(row[colMap.categoria] || 'General') : 'General',
        descripcion: colMap.descripcion >= 0 ? String(row[colMap.descripcion] || '') : '',
        enlace: colMap.enlace >= 0 ? String(row[colMap.enlace] || '#') : '#',
        imagenUrl: convertGoogleDriveUrl(colMap.imagenUrl >= 0 ? String(row[colMap.imagenUrl] || '') : '')
      });
    });
    
    return resources.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  } catch (e) {
    return { error: e.toString() };
  }
}
