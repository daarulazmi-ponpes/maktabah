const express = require("express");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOCAL_DATA_DIR = path.join(__dirname, "data", "kitab");

// Helper: fetch dari API eksternal dengan API Key
async function fetchFromAPI(apiPath) {
  const apiKey = process.env.X_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    return null;
  }
  const url = `https://api.ahmadsanusi.com${apiPath}`;
  console.log(`[API] Fetching: ${url}`);
  try {
    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey }
    });
    console.log(`[API] Response status: ${response.status} ${response.statusText}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.log(`[API] Error response:`, JSON.stringify(data).substring(0, 200));
      return { error: true, status: response.status, data };
    }
    return data;
  } catch (error) {
    console.log(`[API] Network error: ${error.message}`);
    return { error: true, status: 0, data: { message: "Gagal menghubungi API eksternal" } };
  }
}

// Helper: baca data lokal dari file JSON
function readLocalFile(filePath) {
  const fullPath = path.join(LOCAL_DATA_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.log(`[Local] Gagal membaca ${filePath}: ${error.message}`);
    return null;
  }
}

// Helper: coba API eksternal dulu, jika gagal gunakan data lokal
async function fetchWithFallback(apiPath, localPath) {
  // Coba API eksternal
  const apiResult = await fetchFromAPI(apiPath);
  
  // Jika API berhasil, kembalikan hasilnya
  if (apiResult && !apiResult.error) {
    console.log(`[Fallback] Menggunakan data dari API eksternal`);
    return { source: "api", data: apiResult };
  }
  
  // Jika API gagal, coba data lokal
  console.log(`[Fallback] API gagal, mencoba data lokal: ${localPath}`);
  const localResult = readLocalFile(localPath);
  if (localResult) {
    console.log(`[Fallback] Berhasil menggunakan data lokal`);
    return { source: "local", data: localResult };
  }
  
  // Jika keduanya gagal, kembalikan error dari API
  console.log(`[Fallback] Data lokal tidak ditemukan, mengembalikan error API`);
  return { source: "error", data: apiResult };
}

// Proxy endpoint untuk mengambil daftar kitab dari API eksternal
// API Key disimpan di environment variable, tidak terekspos ke browser
// Jika API gagal, otomatis menggunakan data lokal sebagai fallback
app.get("/api/kitab", async (req, res) => {
  const result = await fetchWithFallback("/v1/kitab", "katalog.json");
  
  if (result.source === "error") {
    return res.status(500).json({ 
      error: "Gagal mengambil data dari API dan data lokal tidak tersedia" 
    });
  }
  
  res.json(result.data);
});

// Proxy: Detail satu bab (isi kitab)
// HARUS didefinisikan SEBELUM /api/kitab/:slug agar tidak terjadi route collision
// Jika API gagal, otomatis menggunakan data lokal sebagai fallback
app.get("/api/kitab/:slug/bab/:nomor", async (req, res) => {
  const slug = req.params.slug;
  const nomor = req.params.nomor;
  const result = await fetchWithFallback(
    `/v1/kitab/${slug}/bab/${nomor}`, 
    `${slug}/bab-${nomor}.json`
  );
  
  if (result.source === "error") {
    return res.status(404).json({ 
      error: "Bab tidak ditemukan" 
    });
  }
  
  res.json(result.data);
});

// Proxy: Detail kitab + daftar bab
// Jika API gagal, otomatis menggunakan data lokal sebagai fallback
app.get("/api/kitab/:slug", async (req, res) => {
  const slug = req.params.slug;
  const result = await fetchWithFallback(
    `/v1/kitab/${slug}`, 
    `${slug}.json`
  );
  
  if (result.source === "error") {
    return res.status(404).json({ 
      error: "Kitab tidak ditemukan" 
    });
  }
  
  res.json(result.data);
});

// Sajikan file statis (index.html, assets, dll)
// Vercel akan menangani static files secara otomatis melalui vercel.json
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Fallback untuk halaman root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Routing untuk halaman pembaca kitab
// /kitab/:slug/:bab HARUS didefinisikan SEBELUM /kitab/:slug
app.get("/kitab/:slug/:bab", (req, res) => {
  res.sendFile(path.join(__dirname, "kitab.html"));
});

app.get("/kitab/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "kitab.html"));
});

// Routing untuk halaman kuis
// /kuis/:slug/:bab HARUS didefinisikan SEBELUM /kuis/:slug
app.get("/kuis/:slug/:bab", (req, res) => {
  res.sendFile(path.join(__dirname, "kuis.html"));
});

app.get("/kuis/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "kuis.html"));
});

// Proxy: Data kuis per kitab
app.get("/api/kitab/:slug/kuis", async (req, res) => {
  const fs = require("fs");
  const slug = req.params.slug;

  // Baca file JSON kuis lokal
  const localPath = path.join(__dirname, "data", "kuis", `${slug}.json`);
  if (!fs.existsSync(localPath)) {
    return res.status(404).json({ error: "Data kuis belum tersedia untuk kitab ini" });
  }

  try {
    const localQuiz = JSON.parse(fs.readFileSync(localPath, "utf-8"));
    const soal = localQuiz.soal || [];

    // Ambil daftar bab dari API eksternal, fallback ke data lokal
    let babs = [];
    const kitabResult = await fetchWithFallback(`/v1/kitab/${slug}`, `${slug}.json`);
    if (kitabResult.source !== "error") {
      const data = kitabResult.data.data || kitabResult.data;
      const rawBabs = data.bab || [];
      babs = rawBabs.map(b => ({
        id: `bab-${b.nomor}`,
        nomor: b.nomor,
        judul: b.judul
      }));
    }

    // Kumpulkan semua babId dari soal kuis
    const kuisBabIds = new Set(soal.map(q => q.babId));
    const existingBabIds = new Set(babs.map(b => b.id));

    // Tambahkan bab yang ada di soal kuis tapi tidak ada di API response
    for (const babId of kuisBabIds) {
      if (!existingBabIds.has(babId)) {
        const nomor = parseInt(babId.replace("bab-", ""), 10);
        babs.push({
          id: babId,
          nomor: nomor,
          judul: `Bab ${nomor}`
        });
      }
    }

    // Urutkan bab berdasarkan nomor
    babs.sort((a, b) => a.nomor - b.nomor);

    // Kembalikan format yang diharapkan frontend: { bab: [...], kuis: [...] }
    res.json({
      bab: babs,
      kuis: soal
    });
  } catch (e) {
    res.status(500).json({ error: "Gagal membaca data kuis" });
  }
});

// Export untuk Vercel serverless function
module.exports = app;

// Jalankan server hanya jika tidak di-deploy di Vercel (local development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`📚 Server Maktabah berjalan di http://localhost:${PORT}`);
  });
}
