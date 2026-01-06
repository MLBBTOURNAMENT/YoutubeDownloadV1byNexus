const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { execa } = require("execa");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const downloadDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

function safeName(name) {
  return String(name || "video")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

async function hasFfmpeg() {
  try {
    await execa("ffmpeg", ["-version"], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function ytDlpJson(url) {
  const { stdout } = await execa(
    "yt-dlp",
    [url, "--dump-single-json", "--no-warnings", "--no-playlist", "--no-call-home"],
    { cwd: __dirname, windowsHide: true }
  );
  return JSON.parse(stdout);
}

app.get("/api/video-info", async (req, res) => {
  try {
    const url = String(req.query.url || "").trim();
    if (!url) return res.status(400).json({ error: "URL is required" });

    const info = await ytDlpJson(url);

    const merged = (info.formats || [])
      .filter((f) => f.vcodec !== "none" && f.acodec !== "none")
      .map((f) => ({
        format_id: f.format_id,
        quality: typeof f.height === "number" ? `${f.height}p` : (f.format_note || f.format_id),
        ext: f.ext,
        size:
          typeof f.filesize === "number"
            ? `${(f.filesize / (1024 * 1024)).toFixed(2)} MB`
            : (typeof f.filesize_approx === "number"
                ? `${(f.filesize_approx / (1024 * 1024)).toFixed(2)} MB`
                : "N/A"),
        hasAudio: true,
        hasVideo: true
      }))

      .sort((a, b) => {
        const ah = parseInt(a.quality) || 0;
        const bh = parseInt(b.quality) || 0;
        if (bh !== ah) return bh - ah;
        if (a.ext === b.ext) return 0;
        if (a.ext === "mp4") return -1;
        if (b.ext === "mp4") return 1;
        return 0;
      });

    const ffmpegInstalled = await hasFfmpeg();

    res.json({
      title: info.title || "Untitled",
      thumbnail: info.thumbnail || "",
      duration: info.duration || 0,
      author: info.uploader || info.channel || "Unknown",
      ffmpegInstalled,

      formats: merged.length
        ? merged
        : [{
            format_id: "best",
            quality: "Best (merged)",
            ext: "mp4",
            size: "N/A",
            hasAudio: true,
            hasVideo: true
          }]
    });
  } catch (err) {
    console.error("Error fetching video info:", err);
    res.status(500).json({
      error: "Gagal ambil info. Coba ulang, atau cek yt-dlp bisa jalan di CMD: yt-dlp --version"
    });
  }
});

app.get("/api/download", async (req, res) => {
  let filePath = null;

  try {
    const url = String(req.query.url || "").trim();
    const mode = String(req.query.mode || "fast");
    const formatId = String(req.query.format_id || "").trim();

    if (!url) return res.status(400).json({ error: "URL is required" });

    const stamp = Date.now();
    const base = `dl_${stamp}`;
    const outTemplate = path.join(downloadDir, `${base}.%(ext)s`);

    const ffmpegInstalled = await hasFfmpeg();

    let args;
    if (mode === "hd" && ffmpegInstalled) {
      args = [
        url,
        "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", outTemplate,
        "--no-warnings",
        "--no-playlist",
        "--no-call-home"
      ];
    } else {
      const chosen = formatId ? formatId : "best";
      args = [
        url,
        "-f", chosen,
        "--remux-video", "mp4",
        "-o", outTemplate,
        "--no-warnings",
        "--no-playlist",
        "--no-call-home"
      ];
    }

    await execa("yt-dlp", args, { cwd: __dirname, windowsHide: true });

    const produced = fs.readdirSync(downloadDir).filter((f) => f.startsWith(`${base}.`));
    if (!produced.length) throw new Error("Download failed: file not created");

    filePath = path.join(downloadDir, produced[0]);
    const niceName = safeName(path.parse(produced[0]).name) + ".mp4";

    res.download(filePath, niceName, () => {
      setTimeout(() => {
        try {
          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {}
      }, 8000);
    });
  } catch (err) {
    console.error("Download error:", err);
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}

    if (!res.headersSent) {
      res.status(500).json({
        error:
          "Download gagal. Untuk HD (merge audio+video) install FFmpeg. Kalau mau cepat gunakan mode Fast."
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Using system yt-dlp (from PATH)");
});