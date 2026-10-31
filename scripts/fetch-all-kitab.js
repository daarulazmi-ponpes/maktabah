const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.ahmadsanusi.com/v1';
const API_KEY = process.env.X_API_KEY || 'ask_pE864cYIYk-gcx5IzxX01-YiJGfDkG2VsAebMvFA97M';
const DATA_DIR = path.join(__dirname, '..', 'data', 'kitab');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function fetchFromAPI(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`[Fetch] ${url}`);
  
  const response = await fetch(url, {
    headers: { 'X-API-Key': API_KEY }
  });
  
  console.log(`[Response] ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function main() {
  try {
    console.log('=== Mengambil data katalog kitab ===\n');
    
    const katalog = await fetchFromAPI('/kitab');
    
    const katalogPath = path.join(DATA_DIR, 'katalog.json');
    fs.writeFileSync(katalogPath, JSON.stringify(katalog, null, 2));
    console.log(`✓ Katalog disimpan: ${katalogPath}`);
    
    const kitabList = katalog.data?.kitab || katalog.kitab || katalog.data || katalog;
    const kitabData = Array.isArray(kitabList) ? kitabList : [];
    
    console.log(`\n=== Mengambil detail ${kitabData.length} kitab ===\n`);
    
    for (let i = 0; i < kitabData.length; i++) {
      const kitab = kitabData[i];
      const slug = kitab.slug || kitab.id;
      
      if (!slug) {
        console.log(`⚠ Kitab ${i + 1} tidak memiliki slug, dilewati`);
        continue;
      }
      
      try {
        console.log(`[${i + 1}/${kitabData.length}] Mengambil detail: ${slug}`);
        
        const detail = await fetchFromAPI(`/kitab/${slug}`);
        
        const detailPath = path.join(DATA_DIR, `${slug}.json`);
        fs.writeFileSync(detailPath, JSON.stringify(detail, null, 2));
        console.log(`  ✓ Detail disimpan`);
        
        const babs = detail.data?.bab || detail.bab || [];
        
        if (babs.length > 0) {
          const babDir = path.join(DATA_DIR, slug);
          if (!fs.existsSync(babDir)) {
            fs.mkdirSync(babDir, { recursive: true });
          }
          
          for (const bab of babs) {
            const nomor = bab.nomor;
            console.log(`    Mengambil bab ${nomor}...`);
            
            try {
              const babData = await fetchFromAPI(`/kitab/${slug}/bab/${nomor}`);
              
              const babPath = path.join(babDir, `bab-${nomor}.json`);
              fs.writeFileSync(babPath, JSON.stringify(babData, null, 2));
              console.log(`    ✓ Bab ${nomor} disimpan`);
            } catch (error) {
              console.log(`    ⚠ Gagal mengambil bab ${nomor}: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`  ⚠ Gagal mengambil detail ${slug}: ${error.message}\n`);
      }
    }
    
    console.log('\n=== Selesai ===');
    console.log(`Data berhasil disimpan ke: ${DATA_DIR}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
