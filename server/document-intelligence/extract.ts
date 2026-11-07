import { inflateRawSync } from "node:zlib";
import { posix as pathPosix } from "node:path";
import type { ExtractedDocument, ExtractedUnit } from "./types.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;

export async function extractDocument(name: string, input: Uint8Array): Promise<ExtractedDocument> {
  if (input.byteLength > MAX_FILE_BYTES) throw new Error("File exceeds the 20 MB limit.");
  const ext = extension(name);
  if (ext === ".txt") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(input).replace(/^\uFEFF/, "");
    return { units: [{ type: "text", number: 1, text: normalize(text) }] };
  }
  if (ext === ".pdf") return extractPdf(input);
  if (ext === ".docx") return extractDocx(input);
  if (ext === ".pptx") return extractPptx(input);
  throw new Error("Supported formats are PDF, DOCX, PPTX, and TXT.");
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  try {
    if (pdf.numPages > 2000) throw new Error("PDF exceeds the 2,000 page limit.");
    const units: ExtractedUnit[] = [];
    let extractedBytes = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = normalize(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      extractedBytes += Buffer.byteLength(text);
      if (extractedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("Extracted PDF text exceeds the 80 MB limit.");
      if (text) units.push({ type: "page", number: pageNumber, text });
    }
    if (!units.length) throw new Error("No extractable text was found in the PDF.");
    const metadata = await pdf.getMetadata();
    return { title: (metadata.info as { Title?: string } | undefined)?.Title || undefined, units };
  } finally {
    await pdf.destroy();
  }
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedDocument> {
  const zip = readZip(bytes);
  const xml = zip.get("word/document.xml");
  if (!xml) throw new Error("DOCX package is missing word/document.xml.");
  const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map((match) => xmlText(match[1]))
    .filter(Boolean);
  const titleXml = zip.get("docProps/core.xml");
  const title = titleXml ? xmlElement(titleXml, "dc:title") : undefined;
  const text = normalize(paragraphs.join("\n"));
  if (!text) throw new Error("No extractable text was found in the DOCX.");
  return { title, units: [{ type: "text", number: 1, text }] };
}

async function extractPptx(bytes: Uint8Array): Promise<ExtractedDocument> {
  const zip = readZip(bytes);
  const slideNames = orderedSlides(zip);
  if (!slideNames.length) throw new Error("PPTX package contains no slides.");
  const units = slideNames.map((name, index) => ({ type: "slide" as const, number: index + 1, text: normalize([...zip.get(name)!.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1])).join(" ")) })).filter((unit) => unit.text);
  if (!units.length) throw new Error("No extractable text was found in the PPTX.");
  const core = zip.get("docProps/core.xml");
  return { title: core ? xmlElement(core, "dc:title") : undefined, units };
}

function orderedSlides(zip: Map<string, string>): string[] {
  const presentation = zip.get("ppt/presentation.xml");
  const relationships = zip.get("ppt/_rels/presentation.xml.rels");
  if (presentation && relationships) {
    const targets = new Map([...relationships.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((match) => {
      const id = match[1].match(/\bId=["']([^"']+)["']/)?.[1];
      const target = match[1].match(/\bTarget=["']([^"']+)["']/)?.[1];
      return [id, target] as const;
    }).filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])));
    const ordered = [...presentation.matchAll(/<p:sldId\b([^>]*)\/?>/g)].map((match) => {
      const id = match[1].match(/\br:id=["']([^"']+)["']/)?.[1];
      const target = id ? targets.get(id) : undefined;
      if (!target) return undefined;
      return pathPosix.normalize(target.startsWith("/") ? target.slice(1) : pathPosix.join("ppt", target));
    }).filter((name): name is string => Boolean(name && zip.has(name)));
    if (ordered.length) return ordered;
  }
  return [...zip.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
}

function readZip(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (entryCount > MAX_ZIP_ENTRIES || offset + directorySize > buffer.length) throw new Error("Invalid or oversized Office document package.");
  const result = new Map<string, string>();
  let total = 0;
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid Office document ZIP directory.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    total += uncompressedSize;
    if (total > MAX_UNCOMPRESSED_BYTES || localOffset + 30 > buffer.length) throw new Error("Office document expands beyond the 80 MB limit.");
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid Office document ZIP entry.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > buffer.length) throw new Error("Truncated Office document ZIP entry.");
    const payload = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const decoded = method === 0 ? payload : method === 8 ? inflateRawSync(payload, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }) : null;
    if (!decoded) throw new Error("Unsupported compression in Office document.");
    result.set(name, decoded.toString("utf8"));
  }
  return result;
}

function findEocd(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= min; i--) if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  throw new Error("Invalid Office document ZIP package.");
}

function xmlText(fragment: string): string { return [...fragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1])).join(""); }
function xmlElement(xml: string, tag: string): string | undefined { const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return match ? decodeXml(match[1]) : undefined; }
function decodeXml(value: string): string { return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => { if (entity[0] === "#") return String.fromCodePoint(entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))); return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[entity.toLowerCase()]!; }); }
function normalize(text: string): string { return text.replace(/\r\n?/g, "\n").replace(/[\t\u00a0 ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim(); }
function extension(name: string): string { return name.slice(name.lastIndexOf(".")).toLowerCase(); }
