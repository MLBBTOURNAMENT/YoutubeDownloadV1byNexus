const videoUrlInput = document.getElementById("videoUrl");
const searchBtn = document.getElementById("searchBtn");
const loadingSpinner = document.getElementById("loadingSpinner");
const videoInfo = document.getElementById("videoInfo");
const errorMessage = document.getElementById("errorMessage");
const errorText = document.getElementById("errorText");

searchBtn.addEventListener("click", fetchVideoInfo);
videoUrlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") fetchVideoInfo();
});

function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

async function fetchVideoInfo() {
  const url = videoUrlInput.value.trim();
  if (!url) return showError("Masukkan URL YouTube dulu.");
  if (!isValidYouTubeUrl(url)) return showError("URL YouTube tidak valid.");

  hideAll();
  loadingSpinner.classList.remove("hidden");

  try {
    const r = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Error fetching video info");

    renderInfo(data);
  } catch (e) {
    showError(e.message || "Error fetching video info");
  } finally {
    loadingSpinner.classList.add("hidden");
  }
}

function renderInfo(data) {
  document.getElementById("thumbnail").src = data.thumbnail || "";
  document.getElementById("videoTitle").textContent = data.title || "-";
  document.getElementById("videoAuthor").textContent = data.author || "-";
  document.getElementById("videoDuration").textContent = formatDuration(data.duration || 0);

  const wrap = document.getElementById("qualityOptions");
  wrap.innerHTML = "";

  wrap.appendChild(makeActionBtn("Fast (Audio + Video)", () => {
    window.location.href = `/api/download?mode=fast&url=${encodeURIComponent(videoUrlInput.value.trim())}`;
  }));

  if (data.ffmpegInstalled) {
    wrap.appendChild(makeActionBtn("HD (Best quality, merge)", () => {
      window.location.href = `/api/download?mode=hd&url=${encodeURIComponent(videoUrlInput.value.trim())}`;
    }));
  } else {
    wrap.appendChild(makeInfoCard("HD butuh FFmpeg agar audio+video bisa digabung."));
  }

  (data.formats || []).forEach((f) => {
    const btn = document.createElement("button");
    btn.className = "quality-btn";
    btn.type = "button";
    btn.innerHTML = `
      <i class="fas fa-download"></i>
      <span class="quality-label">${f.quality}</span>
      <span class="format-label">${String(f.ext || "mp4").toUpperCase()} • Audio+Video</span>
      <span class="size-label">${f.size || "N/A"}</span>
    `;
    btn.addEventListener("click", () => {
      window.location.href =
        `/api/download?mode=fast&url=${encodeURIComponent(videoUrlInput.value.trim())}&format_id=${encodeURIComponent(f.format_id)}`;
    });
    wrap.appendChild(btn);
  });

  videoInfo.classList.remove("hidden");
}

function makeActionBtn(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "quality-btn";
  btn.type = "button";
  btn.innerHTML = `
    <i class="fas fa-bolt"></i>
    <span class="quality-label">${label}</span>
    <span class="format-label">Recommended</span>
    <span class="size-label">—</span>
  `;
  btn.addEventListener("click", onClick);
  return btn;
}

function makeInfoCard(text) {
  const div = document.createElement("div");
  div.className = "quality-btn";
  div.style.cursor = "default";
  div.innerHTML = `
    <i class="fas fa-circle-info"></i>
    <span class="quality-label">${text}</span>
    <span class="format-label">Install FFmpeg untuk HD</span>
    <span class="size-label">—</span>
  `;
  return div;
}

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function showError(msg) {
  hideAll();
  errorText.textContent = msg;
  errorMessage.classList.remove("hidden");
}

function hideAll() {
  videoInfo.classList.add("hidden");
  errorMessage.classList.add("hidden");
  loadingSpinner.classList.add("hidden");
}