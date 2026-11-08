import { deflateRawSync } from "node:zlib";

export function zipFixture(files: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(content));
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(Buffer.byteLength(content), 22); local.writeUInt16LE(nameBytes.length, 26); nameBytes.copy(local, 30);
    locals.push(local, data);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(Buffer.byteLength(content), 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42); nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

export function docxFixture(): Uint8Array {
  return zipFixture({
    "word/document.xml": "<w:document xmlns:w='w'><w:body><w:p><w:r><w:t>Water &amp; ions</w:t></w:r></w:p><w:p><w:r><w:t>Charge stays conserved.</w:t></w:r></w:p></w:body></w:document>",
    "docProps/core.xml": "<cp:coreProperties xmlns:dc='d'><dc:title>Ion notes</dc:title></cp:coreProperties>",
  });
}

export function pptxFixture(): Uint8Array {
  return zipFixture({
    "ppt/slides/slide2.xml": "<p:sld xmlns:a='a'><a:t>Second slide</a:t></p:sld>",
    "ppt/slides/slide1.xml": "<p:sld xmlns:a='a'><a:t>First slide</a:t></p:sld>",
    "ppt/presentation.xml": "<p:presentation xmlns:r='r'><p:sldIdLst><p:sldId r:id='rId2'/><p:sldId r:id='rId1'/></p:sldIdLst></p:presentation>",
    "ppt/_rels/presentation.xml.rels": "<Relationships><Relationship Id='rId1' Target='slides/slide1.xml'/><Relationship Id='rId2' Target='slides/slide2.xml'/></Relationships>",
  });
}

export function pdfFixture(text = "PDF sample page"): Uint8Array {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (!lines.length || lines[lines.length - 1].length + word.length > 78) lines.push(word);
    else lines[lines.length - 1] += " " + word;
  }
  const stream = text ? "BT /F1 12 Tf 16 TL 72 720 Td " + lines.map((line) => "(" + line.replace(/[()\\]/g, "\\$&") + ") Tj T*").join(" ") + " ET" : "q Q";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(stream) + " >>\nstream\n" + stream + "\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += String(index + 1) + " 0 obj\n" + object + "\nendobj\n";
  }
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(pdf);
}
