const MAX_FILE_BYTES = 10 * 1024 * 1024;

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const MAMMOTH_URL = "https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js";

export class DocumentReadError extends Error {}

export async function readDocumentFile(file, { loadPdf = loadPdfText, loadDocx = loadDocxText } = {}) {
  if (!file?.name || typeof file.text !== "function") throw new DocumentReadError("Choose a supported document file.");
  if (file.size > MAX_FILE_BYTES) throw new DocumentReadError("Choose a document smaller than 10 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["txt", "md"].includes(extension)) return { title: withoutExtension(file.name), text: await file.text() };
  if (extension === "html") return { title: withoutExtension(file.name), text: stripHtml(await file.text()) };
  if (extension === "pdf") return { title: withoutExtension(file.name), text: await loadPdf(file) };
  if (extension === "docx") return { title: withoutExtension(file.name), text: await loadDocx(file) };
  throw new DocumentReadError("Supported formats are PDF, DOCX, TXT, Markdown, and HTML.");
}

async function loadPdfText(file) {
  const pdfjs = await import(PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
    const page = await pdf.getPage(index + 1);
    const content = await page.getTextContent();
    return content.items.map((item) => item.str).join(" ");
  }));
  return pages.join("\n\n");
}

async function loadDocxText(file) {
  await loadScript(MAMMOTH_URL, "mammoth");
  const result = await globalThis.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

function loadScript(source, globalName) {
  if (globalThis[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.onload = () => globalThis[globalName] ? resolve() : reject(new DocumentReadError("Document reader could not load."));
    script.onerror = () => reject(new DocumentReadError("Document reader could not load. Check your connection and try again."));
    document.head.append(script);
  });
}

function stripHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = value;
  return template.content.textContent ?? "";
}

function withoutExtension(name) { return name.replace(/\.[^.]+$/, ""); }
