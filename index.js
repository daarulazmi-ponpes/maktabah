const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Helper: fetch dari API eksternal dengan API Key
async function fetchFromAPI(apiPath) {
  const apiKey = process.env.X_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    return null;
  }
  const url = `https://api.ahmadsanusi.com${apiPath}`;
  console.log(`[API] Fetching: ${url}`);
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
}

// Proxy endpoint untuk mengambil daftar kitab dari API eksternal
// API Key disimpan di environment variable, tidak terekspos ke browser
app.get("/api/kitab", async (req, res) => {
  const result = await fetchFromAPI("/v1/kitab");
  if (result === null) {
    return res.status(500).json({ error: "X_API_KEY belum dikonfigurasi. Atur di file .env" });
  }
  if (result && result.error) {
    return res.status(result.status).json({ error: "Gagal mengambil data dari API", details: result.data });
  }
  res.json(result);
});

// Proxy: Detail satu bab (isi kitab)
// HARUS didefinisikan SEBELUM /api/kitab/:slug agar tidak terjadi route collision
app.get("/api/kitab/:slug/bab/:nomor", async (req, res) => {
  const result = await fetchFromAPI(`/v1/kitab/${req.params.slug}/bab/${req.params.nomor}`);
  if (result === null) {
    return res.status(500).json({ error: "X_API_KEY belum dikonfigurasi. Atur di file .env" });
  }
  if (result && result.error) {
    return res.status(result.status).json({ error: "Bab tidak ditemukan", details: result.data });
  }
  res.json(result);
});

// Proxy: Detail kitab + daftar bab
app.get("/api/kitab/:slug", async (req, res) => {
  const result = await fetchFromAPI(`/v1/kitab/${req.params.slug}`);
  if (result === null) {
    return res.status(500).json({ error: "X_API_KEY belum dikonfigurasi. Atur di file .env" });
  }
  if (result && result.error) {
    return res.status(result.status).json({ error: "Kitab tidak ditemukan", details: result.data });
  }
  res.json(result);
});

// Sajikan file statis (index.html, assets, dll)
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

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

    // Ambil daftar bab dari API eksternal
    let babs = [];
    const kitabResult = await fetchFromAPI(`/v1/kitab/${slug}`);
    if (kitabResult && !kitabResult.error) {
      const data = kitabResult.data || kitabResult;
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

app.listen(PORT, () => {
  console.log(`📚 Server Maktabah berjalan di http://localhost:${PORT}`);
});
