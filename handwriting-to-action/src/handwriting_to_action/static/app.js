(() => {
  const form = document.getElementById("upload-form");
  const fileInput = document.getElementById("file-input");
  const dropzone = document.getElementById("dropzone");
  const fileName = document.getElementById("file-name");
  const submitBtn = document.getElementById("submit-btn");
  const statusEl = document.getElementById("status");
  const results = document.getElementById("results");
  const demoBtn = document.getElementById("demo-btn");
  const modeEl = document.getElementById("mode");
  const hintEl = document.getElementById("hint");
  const copyBtn = document.getElementById("copy-btn");

  let currentFile = null;
  let artifacts = [];
  let activeIndex = 0;

  const DEMO_TEXT = `项目冲刺笔记

目标：本周五前上线手写笔记转行动工具的 MVP

待办：
1. 上传手写照片并做 OCR 识别（紧急）
2. 从识别结果抽出任务、目标、约束
3. 自动生成可执行计划与脚本
4. 补一个简单 Web 界面方便演示
5. 写 README 和使用示例（稍后）

注意：没有 API Key 时要能走 demo 模式
约束：优先 Python，接口尽量简单`;

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function setFile(file) {
    currentFile = file;
    submitBtn.disabled = !file;
    fileName.textContent = file
      ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB`
      : "支持 JPG / PNG / WEBP，最大 8MB";
  }

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) setFile(file);
  });
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) setFile(file);
  });

  function renderResults(data) {
    results.classList.remove("hidden");
    document.getElementById("plan-title").textContent = data.plan.title;
    document.getElementById("plan-objective").textContent = data.plan.objective;
    const conf = data.meta?.ocr_confidence;
    const confText = typeof conf === "number" ? ` · OCR置信度 ${(conf * 100).toFixed(0)}%` : "";
    document.getElementById("result-meta").textContent =
      `模式 ${data.mode} · 来源 ${data.meta?.ocr_source || "-"}${confText}`;

    const taskList = document.getElementById("task-list");
    taskList.innerHTML = "";
    (data.extracted.tasks || []).forEach((task) => {
      const li = document.createElement("li");
      const badge = document.createElement("span");
      badge.className = `priority ${task.priority}`;
      badge.textContent = task.priority;
      li.appendChild(badge);
      li.appendChild(document.createTextNode(task.title));
      taskList.appendChild(li);
    });
    if (!data.extracted.tasks?.length) {
      const li = document.createElement("li");
      li.textContent = data.extracted.summary || "未识别到明确任务";
      taskList.appendChild(li);
    }

    const stepList = document.getElementById("step-list");
    stepList.innerHTML = "";
    (data.plan.steps || []).forEach((step) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${step.id}</strong> ${escapeHtml(step.title)}`;
      if (step.deliverable) {
        const small = document.createElement("div");
        small.style.color = "#5b736c";
        small.style.fontSize = "0.9rem";
        small.textContent = `产出：${step.deliverable}`;
        li.appendChild(small);
      }
      stepList.appendChild(li);
    });

    artifacts = data.artifacts || [];
    activeIndex = 0;
    renderTabs();
    renderCode();
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderTabs() {
    const tabs = document.getElementById("artifact-tabs");
    tabs.innerHTML = "";
    artifacts.forEach((artifact, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `tab${index === activeIndex ? " active" : ""}`;
      btn.textContent = artifact.filename;
      btn.setAttribute("role", "tab");
      btn.addEventListener("click", () => {
        activeIndex = index;
        renderTabs();
        renderCode();
      });
      tabs.appendChild(btn);
    });
  }

  function renderCode() {
    const code = document.getElementById("code-view");
    code.textContent = artifacts[activeIndex]?.content || "";
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentFile) return;
    submitBtn.disabled = true;
    setStatus("正在识别并生成计划…");
    const body = new FormData();
    body.append("file", currentFile);
    body.append("mode", modeEl.value);
    body.append("hint", hintEl.value || "");
    try {
      const res = await fetch("/api/process", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "处理失败");
      renderResults(data);
      setStatus("完成。可复制下方生成的行动代码。");
    } catch (err) {
      setStatus(err.message || String(err));
    } finally {
      submitBtn.disabled = !currentFile;
    }
  });

  demoBtn.addEventListener("click", async () => {
    modeEl.value = "demo";
    setStatus("正在用示例文本生成…");
    try {
      const res = await fetch("/api/from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: DEMO_TEXT, mode: "demo" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "处理失败");
      renderResults(data);
      setStatus("Demo 完成（未调用远程 OCR）。");
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  copyBtn.addEventListener("click", async () => {
    const text = artifacts[activeIndex]?.content || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`已复制 ${artifacts[activeIndex].filename}`);
    } catch {
      setStatus("复制失败，请手动选择代码。");
    }
  });
})();
